import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AccessLog,
  AccessLogDocument,
  RecruiterAccessGrant,
  RecruiterAccessGrantDocument,
} from '../database/schemas/recruiter.schema';
import { PlacementDrive, PlacementDriveDocument, Registration, RegistrationDocument } from '../database/schemas/drive.schema';
import { StudentProfile, StudentProfileDocument, User, UserDocument } from '../database/schemas/user.schema';
import { ReadinessSnapshot, ReadinessSnapshotDocument, SkillProfile, SkillProfileDocument } from '../database/schemas/readiness.schema';
import { DriveStatus, RECRUITER_RELEASABLE_FIELDS, RegistrationStatus, Role } from '../common/constants';
import { AuthUser } from '../common/decorators';
import { AuthorizationService } from '../authz/authz.service';
import { AuditService } from '../audit/audit.service';
import { SkillsService } from '../skills/skills.service';
import { paginate } from '../common/pagination';
import { latestSnapshotRows } from '../readiness/latest-snapshots';
import { CandidateSource, disallowedFilters, effectiveFields, HEAD_ONLY_FIELDS, projectCandidate } from './projection';

/** Candidates visible to recruiters: registered and later stages; never withdrawn. */
const VISIBLE_STATUSES = [RegistrationStatus.Registered, RegistrationStatus.Shortlisted, RegistrationStatus.Selected];
/** Hard ceiling on how deep a recruiter can page: there is deliberately no bulk export. */
export const MAX_OFFSET = 100;
export const MAX_GRANT_DAYS = 90;

export interface SearchQuery {
  skill?: string;
  minLevel?: number;
  minReadiness?: number;
  department?: string;
  graduationYear?: number;
  minCgpa?: number;
  q?: string;
  page: number;
  limit: number;
}

@Injectable()
export class RecruiterService {
  constructor(
    @InjectModel(RecruiterAccessGrant.name) private readonly grants: Model<RecruiterAccessGrantDocument>,
    @InjectModel(AccessLog.name) private readonly logs: Model<AccessLogDocument>,
    @InjectModel(PlacementDrive.name) private readonly drives: Model<PlacementDriveDocument>,
    @InjectModel(Registration.name) private readonly registrations: Model<RegistrationDocument>,
    @InjectModel(StudentProfile.name) private readonly profiles: Model<StudentProfileDocument>,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    @InjectModel(SkillProfile.name) private readonly skillProfiles: Model<SkillProfileDocument>,
    @InjectModel(ReadinessSnapshot.name) private readonly snapshots: Model<ReadinessSnapshotDocument>,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    private readonly skills: SkillsService,
  ) {}

  // ------------------------------------------------------------ recruiter-facing

  async myDrives(recruiter: AuthUser, ip?: string) {
    const grants = await this.authz.activeGrantsFor(recruiter.id);
    const drives = await this.drives.find({ _id: { $in: grants.map((g) => g.drive) }, status: { $ne: DriveStatus.Draft } }).lean();
    const byId = new Map(drives.map((d) => [String(d._id), d]));
    const rows = grants
      .filter((g) => byId.has(String(g.drive)))
      .map((g) => {
        const d = byId.get(String(g.drive))!;
        return {
          driveId: String(d._id),
          company: d.company,
          role: d.role,
          status: d.status,
          driveDate: d.driveDate,
          accessExpiresAt: g.expiresAt,
          releasedFields: effectiveFields(g.releasedFields),
        };
      });
    await this.logs.create({ recruiter: recruiter.id, action: 'list_drives', outcome: 'allowed', resultCount: rows.length, ip });
    return rows;
  }

  /**
   * Candidate search for ONE granted drive. Scope is enforced twice:
   *  1. an active, drive-specific, unexpired, unrevoked grant is required (else 403 + denied log);
   *  2. every query is anchored on `registration.drive == grant.drive`, so students outside the drive
   *     cannot appear regardless of filters.
   * Filters that depend on non-released fields are rejected so hidden attributes can't be inferred.
   */
  async search(recruiter: AuthUser, driveId: string, q: SearchQuery, ip?: string) {
    const used = (['skill', 'minLevel', 'minReadiness', 'department', 'graduationYear', 'minCgpa', 'q'] as const).filter((k) => q[k] !== undefined && q[k] !== '');
    const logQuery = Object.fromEntries(used.map((k) => [k, q[k]]));
    const ctx = { action: 'search' as const, query: { ...logQuery, page: q.page, limit: q.limit }, ip };
    const { grant } = await this.authz.requireActiveGrant(recruiter, driveId, ctx);

    const blocked = disallowedFilters(used as string[], grant.releasedFields);
    if (blocked.length) {
      await this.logs.create({ recruiter: recruiter.id, drive: driveId, action: 'search', outcome: 'denied', reason: `filter_on_unreleased_field:${blocked.join(',')}`, query: ctx.query, ip });
      throw new ForbiddenException(`Filtering by ${blocked.join(', ')} is not permitted for this grant`);
    }
    const limit = Math.min(q.limit, grant.maxResultsPerSearch);
    if ((q.page - 1) * limit >= MAX_OFFSET) {
      await this.logs.create({ recruiter: recruiter.id, drive: driveId, action: 'search', outcome: 'denied', reason: 'offset_cap', query: ctx.query, ip });
      throw new BadRequestException(`Results are limited to the first ${MAX_OFFSET} candidates per query. Narrow your filters instead of paging further.`);
    }

    const regFilter: Record<string, any> = { drive: grant.drive, status: { $in: VISIBLE_STATUSES } };
    let studentIds: Types.ObjectId[] | null = null;
    const intersect = (ids: Types.ObjectId[]) => {
      const set = new Set(ids.map(String));
      studentIds = studentIds ? studentIds.filter((s) => set.has(String(s))) : ids;
    };

    const base = (await this.registrations.find(regFilter).select('student').lean()).map((r) => r.student as Types.ObjectId);
    intersect(base);

    if (q.department || q.graduationYear || q.minCgpa !== undefined) {
      const pf: Record<string, any> = { user: { $in: studentIds } };
      if (q.department) pf.department = q.department;
      if (q.graduationYear) pf.graduationYear = q.graduationYear;
      if (q.minCgpa !== undefined) pf.cgpa = { $gte: q.minCgpa };
      intersect((await this.profiles.find(pf).select('user').lean()).map((p) => p.user as Types.ObjectId));
    }
    if (q.q) {
      const rx = new RegExp(q.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      intersect((await this.users.find({ _id: { $in: studentIds }, name: rx }).select('_id').lean()).map((u) => u._id as Types.ObjectId));
    }
    if (q.skill) {
      const skill = await this.skills.resolveTerm(q.skill);
      if (!skill) {
        studentIds = [];
      } else {
        const rows = await this.skillProfiles
          .find({ student: { $in: studentIds }, skills: { $elemMatch: { skill: new Types.ObjectId(skill.id), verifiedLevel: { $gte: q.minLevel ?? 1 } } } })
          .select('student')
          .lean();
        intersect(rows.map((r) => r.student as Types.ObjectId));
      }
    }
    if (q.minReadiness !== undefined) {
      const latest = (await latestSnapshotRows(this.snapshots, { drive: grant.drive, student: { $in: studentIds } }, 'student drive score computedAt')).filter((l) => l.score >= q.minReadiness!);
      intersect(latest.map((l) => l.student as Types.ObjectId));
    }

    const finalFilter = { ...regFilter, student: { $in: studentIds ?? [] } };
    const page = await paginate(this.registrations, finalFilter, { page: q.page, limit, sort: { createdAt: 1 } });
    const items = await this.hydrate(page.items as any[], grant);
    const total = Math.min(page.total, MAX_OFFSET);

    await this.logs.create({
      recruiter: recruiter.id,
      drive: grant.drive,
      action: 'search',
      outcome: 'allowed',
      fieldsReleased: effectiveFields(grant.releasedFields),
      resultCount: items.length,
      query: ctx.query,
      ip,
    });
    return { items, total, matched: page.total, page: page.page, limit, pages: Math.max(1, Math.ceil(total / limit)), capped: page.total > MAX_OFFSET, releasedFields: effectiveFields(grant.releasedFields) };
  }

  async candidate(recruiter: AuthUser, driveId: string, candidateId: string, ip?: string) {
    const ctx = { action: 'candidate_detail' as const, query: { candidateId }, ip };
    const { grant } = await this.authz.requireActiveGrant(recruiter, driveId, ctx);
    const reg = await this.authz.requireRegisteredCandidate(recruiter, grant, candidateId, ctx);
    if (!VISIBLE_STATUSES.includes(reg.status)) {
      await this.logs.create({ recruiter: recruiter.id, drive: driveId, action: 'candidate_detail', outcome: 'denied', registration: reg._id, reason: 'registration_not_visible', ip });
      throw new NotFoundException('Candidate not found');
    }
    const [item] = await this.hydrate([reg.toObject()], grant);
    await this.logs.create({
      recruiter: recruiter.id,
      drive: grant.drive,
      action: 'candidate_detail',
      outcome: 'allowed',
      registration: reg._id,
      student: reg.student,
      fieldsReleased: effectiveFields(grant.releasedFields),
      ip,
    });
    return item;
  }

  /** Facet counts computed only over attributes the grant releases. */
  async facets(recruiter: AuthUser, driveId: string, ip?: string) {
    const { grant } = await this.authz.requireActiveGrant(recruiter, driveId, { action: 'search', query: { facets: true }, ip });
    const fields = new Set(effectiveFields(grant.releasedFields));
    const regs = await this.registrations.find({ drive: grant.drive, status: { $in: VISIBLE_STATUSES } }).select('student').lean();
    const ids = regs.map((r) => r.student);
    const out: Record<string, any> = { totalCandidates: regs.length };
    if (fields.has('department') || fields.has('graduationYear')) {
      const profs = await this.profiles.find({ user: { $in: ids } }).select('department graduationYear').lean();
      if (fields.has('department')) out.department = this.count(profs.map((p) => p.department).filter(Boolean) as string[]);
      if (fields.has('graduationYear')) out.graduationYear = this.count(profs.map((p) => String(p.graduationYear)).filter((x) => x !== 'undefined'));
    }
    if (fields.has('readinessScore')) {
      const latest = await latestSnapshotRows(this.snapshots, { drive: grant.drive, student: { $in: ids } }, 'student drive score computedAt');
      out.readinessBands = this.count(latest.map((l) => (l.score >= 75 ? '75-100' : l.score >= 50 ? '50-74' : l.score >= 25 ? '25-49' : '0-24')));
    }
    if (fields.has('verifiedSkills')) {
      const sps = await this.skillProfiles.find({ student: { $in: ids } }).select('skills.skill skills.verifiedLevel').lean();
      const tax = await this.skills.taxonomy();
      const name = new Map(tax.skills.map((s) => [s.id, s.name]));
      const names: string[] = [];
      for (const sp of sps) for (const s of sp.skills ?? []) if (s.verifiedLevel > 0) names.push(name.get(String(s.skill)) ?? 'Other');
      out.skills = Object.entries(this.count(names)).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name, count]) => ({ name, count }));
    }
    await this.logs.create({ recruiter: recruiter.id, drive: grant.drive, action: 'search', outcome: 'allowed', reason: 'facets', fieldsReleased: [...fields], resultCount: regs.length, ip });
    return out;
  }

  private count(values: string[]) {
    return values.reduce<Record<string, number>>((m, v) => ((m[v] = (m[v] ?? 0) + 1), m), {});
  }

  /** Loads only what the grant releases, then projects through the whitelist. */
  private async hydrate(regs: any[], grant: RecruiterAccessGrantDocument) {
    if (!regs.length) return [];
    const fields = new Set(effectiveFields(grant.releasedFields));
    const ids = regs.map((r) => r.student);
    const needProfile = ['department', 'graduationYear', 'cgpa', 'projects', 'phone'].some((f) => fields.has(f as any));
    const needUser = fields.has('name') || fields.has('email');
    const needSkills = fields.has('verifiedSkills');
    const needReadiness = fields.has('readinessScore') || fields.has('readinessDimensions');

    const [profiles, users, sps, snaps, tax] = await Promise.all([
      needProfile ? this.profiles.find({ user: { $in: ids } }).lean() : [],
      needUser ? this.users.find({ _id: { $in: ids } }).select('name email').lean() : [],
      needSkills ? this.skillProfiles.find({ student: { $in: ids } }).lean() : [],
      needReadiness
        ? latestSnapshotRows(this.snapshots, { drive: grant.drive, student: { $in: ids } }, 'student drive score dimensions computedAt').then((rows) => rows.map((r) => ({ _id: r.student, score: r.score, dimensions: r.dimensions })))
        : [],
      needSkills ? this.skills.taxonomy() : null,
    ]);
    const P = new Map((profiles as any[]).map((p) => [String(p.user), p]));
    const U = new Map((users as any[]).map((u) => [String(u._id), u]));
    const S = new Map((sps as any[]).map((s) => [String(s.student), s]));
    const R = new Map((snaps as any[]).map((s) => [String(s._id), s]));
    const names = new Map((tax?.skills ?? []).map((s) => [s.id, s.name]));

    return regs.map((r) => {
      const sid = String(r.student);
      const p = P.get(sid);
      const src: CandidateSource = {
        candidateId: String(r._id),
        registrationStatus: r.status,
        name: U.get(sid)?.name,
        email: U.get(sid)?.email,
        phone: p?.phone,
        department: p?.department,
        graduationYear: p?.graduationYear,
        cgpa: p?.cgpa,
        projects: p?.projects?.map((x: any) => ({ title: x.title, techStack: x.techStack })),
        readiness: R.has(sid) ? { score: R.get(sid).score, dimensions: R.get(sid).dimensions } : null,
        verifiedSkills: (S.get(sid)?.skills ?? [])
          .filter((s: any) => s.verifiedLevel > 0)
          .map((s: any) => ({ name: names.get(String(s.skill)) ?? 'Unknown', level: s.verifiedLevel }))
          .sort((a: any, b: any) => b.level - a.level),
      };
      return projectCandidate(src, grant.releasedFields);
    });
  }

  // ------------------------------------------------------------ grant management (placement cell)

  async createGrant(
    actor: AuthUser,
    dto: { recruiterId: string; driveId: string; releasedFields: string[]; validFrom?: Date; expiresAt: Date; maxResultsPerSearch?: number },
    ip?: string,
  ) {
    const fields = [...new Set(dto.releasedFields)];
    const unknown = fields.filter((f) => !(RECRUITER_RELEASABLE_FIELDS as readonly string[]).includes(f));
    if (unknown.length) throw new BadRequestException(`Fields not releasable: ${unknown.join(', ')}`);
    if (fields.some((f) => (HEAD_ONLY_FIELDS as string[]).includes(f)) && actor.role !== Role.PlacementHead) {
      throw new ForbiddenException('Only the Placement Head can approve release of contact details (email, phone)');
    }
    const recruiter = await this.users.findOne({ _id: dto.recruiterId, role: Role.Recruiter, active: true });
    if (!recruiter) throw new BadRequestException('recruiterId must reference an active recruiter account');
    const drive = await this.drives.findById(dto.driveId);
    if (!drive || drive.status === DriveStatus.Draft) throw new BadRequestException('Grants can only be issued for published (approved) drives');

    const validFrom = dto.validFrom ?? new Date();
    const maxExpiry = validFrom.getTime() + MAX_GRANT_DAYS * 86_400_000;
    if (dto.expiresAt.getTime() <= Date.now()) throw new BadRequestException('expiresAt must be in the future');
    if (dto.expiresAt <= validFrom) throw new BadRequestException('expiresAt must be after validFrom');
    if (dto.expiresAt.getTime() > maxExpiry) throw new BadRequestException(`Grants are time-boxed to ${MAX_GRANT_DAYS} days`);

    const overlapping = await this.grants.exists({ recruiter: recruiter._id, drive: drive._id, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } });
    if (overlapping) throw new ConflictException('This recruiter already has an active grant for this drive. Revoke it first to change the release.');

    const grant = await this.grants.create({
      recruiter: recruiter._id,
      drive: drive._id,
      releasedFields: fields,
      validFrom,
      expiresAt: dto.expiresAt,
      createdBy: actor.id,
      maxResultsPerSearch: dto.maxResultsPerSearch ?? 25,
    });
    await this.audit.log('recruiter_grant.create', actor, 'RecruiterAccessGrant', String(grant._id), { recruiter: dto.recruiterId, drive: dto.driveId, fields, expiresAt: dto.expiresAt }, ip);
    return grant;
  }

  async revoke(actor: AuthUser, id: string, reason?: string, ip?: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Grant not found');
    const res = await this.grants.findOneAndUpdate(
      { _id: id, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date(), revokedBy: actor.id, revokeReason: reason } },
      { new: true },
    );
    if (!res) throw new NotFoundException('Grant not found or already revoked');
    await this.audit.log('recruiter_grant.revoke', actor, 'RecruiterAccessGrant', id, { reason }, ip);
    return res;
  }

  async listGrants(q: { page: number; limit: number; recruiter?: string; drive?: string; status?: string }) {
    const now = new Date();
    const filter: Record<string, any> = {};
    if (q.recruiter) filter.recruiter = q.recruiter;
    if (q.drive) filter.drive = q.drive;
    if (q.status === 'active') Object.assign(filter, { revokedAt: { $exists: false }, expiresAt: { $gt: now }, validFrom: { $lte: now } });
    if (q.status === 'revoked') filter.revokedAt = { $exists: true };
    if (q.status === 'expired') Object.assign(filter, { revokedAt: { $exists: false }, expiresAt: { $lte: now } });
    const page = await paginate(this.grants, filter, { page: q.page, limit: q.limit, populate: [{ path: 'recruiter', select: 'name email company' }, { path: 'drive', select: 'company role' }] });
    page.items = page.items.map((g: any) => ({
      ...g,
      state: g.revokedAt ? 'revoked' : g.expiresAt <= now ? 'expired' : g.validFrom > now ? 'scheduled' : 'active',
    }));
    return page;
  }

  async accessLogs(q: { page: number; limit: number; recruiter?: string; drive?: string; outcome?: string; action?: string }) {
    const filter: Record<string, any> = {};
    for (const k of ['recruiter', 'drive', 'outcome', 'action'] as const) if (q[k]) filter[k] = q[k];
    return paginate(this.logs, filter, { page: q.page, limit: q.limit, sort: { createdAt: -1 }, populate: [{ path: 'recruiter', select: 'name email company' }, { path: 'drive', select: 'company role' }] });
  }

  async recruiters() {
    return this.users.find({ role: Role.Recruiter, active: true }).select('name email company').sort({ name: 1 }).lean();
  }
}
