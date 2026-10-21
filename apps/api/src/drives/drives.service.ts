import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PlacementDrive,
  PlacementDriveDocument,
  DriveRequirement,
  DriveRequirementDocument,
  EligibilityRule,
  EligibilityRuleDocument,
  Registration,
  RegistrationDocument,
} from '../database/schemas/drive.schema';
import { Skill, SkillDocument, SkillCluster, SkillClusterDocument } from '../database/schemas/skill.schema';
import { StudentProfile, StudentProfileDocument } from '../database/schemas/user.schema';
import { ReadinessSnapshot, ReadinessSnapshotDocument } from '../database/schemas/readiness.schema';
import { DriveStatus, RegistrationStatus, Role } from '../common/constants';
import { AuthUser } from '../common/decorators';
import { evaluateEligibility, EligibilityResult } from '../readiness/eligibility.engine';
import { SystemConfigService } from '../system-config/system-config.service';
import { JobsService } from '../queues/jobs.service';
import { AuditService } from '../audit/audit.service';
import { CacheService } from '../redis/cache.service';
import { latestSnapshotRows } from '../readiness/latest-snapshots';
import { paginate, escapeRegex } from '../common/pagination';
import { definedOnly } from '../common/defined-only';

export interface RequirementInputDto {
  kind: 'skill' | 'cluster';
  skill?: string;
  cluster?: string;
  requiredLevel: number;
  weight: number;
  mandatory?: boolean;
}

@Injectable()
export class DrivesService {
  private readonly logger = new Logger(DrivesService.name);

  constructor(
    @InjectModel(PlacementDrive.name) private readonly drives: Model<PlacementDriveDocument>,
    @InjectModel(DriveRequirement.name) private readonly reqs: Model<DriveRequirementDocument>,
    @InjectModel(EligibilityRule.name) private readonly rules: Model<EligibilityRuleDocument>,
    @InjectModel(Registration.name) private readonly registrations: Model<RegistrationDocument>,
    @InjectModel(Skill.name) private readonly skills: Model<SkillDocument>,
    @InjectModel(SkillCluster.name) private readonly clusters: Model<SkillClusterDocument>,
    @InjectModel(StudentProfile.name) private readonly profiles: Model<StudentProfileDocument>,
    @InjectModel(ReadinessSnapshot.name) private readonly snapshots: Model<ReadinessSnapshotDocument>,
    private readonly sysConfig: SystemConfigService,
    private readonly jobs: JobsService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
  ) {}

  private oid(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Drive not found');
    return new Types.ObjectId(id);
  }

  async create(user: AuthUser, dto: Partial<PlacementDrive>, ip?: string) {
    const drive = await this.drives.create({ ...dto, status: DriveStatus.Draft, createdBy: user.id });
    await this.rules.create({ drive: drive._id });
    await this.audit.log('drive.create', user, 'PlacementDrive', String(drive._id), { company: dto.company }, ip);
    return drive;
  }

  async update(user: AuthUser, id: string, dto: Partial<PlacementDrive>, ip?: string) {
    const drive = await this.drives.findById(this.oid(id));
    if (!drive) throw new NotFoundException('Drive not found');
    Object.assign(drive, definedOnly(dto));
    await drive.save();
    await this.audit.log('drive.update', user, 'PlacementDrive', id, { changed: Object.keys(definedOnly(dto)) }, ip);
    return drive;
  }

  async setStatus(user: AuthUser, id: string, status: DriveStatus, ip?: string) {
    const drive = await this.drives.findById(this.oid(id));
    if (!drive) throw new NotFoundException('Drive not found');
    if (status === DriveStatus.Published) {
      const count = await this.reqs.countDocuments({ drive: drive._id });
      if (!count) throw new BadRequestException('Add at least one skill requirement before publishing');
      if (drive.deadline.getTime() < Date.now()) throw new BadRequestException('The application deadline is in the past');
    }
    drive.status = status;
    await drive.save();
    await this.audit.log(`drive.${status}`, user, 'PlacementDrive', id, {}, ip);
    await this.cache.invalidate('dashboards');
    if (status === DriveStatus.Published) {
      // New drive: compute readiness for the whole cohort in the background so students see results immediately.
      await this.jobs.startBatch(user.id, { driveIds: [id] }).catch((e) => this.logger.warn(`batch on publish skipped: ${e.message}`));
    }
    return drive;
  }

  async remove(user: AuthUser, id: string, ip?: string) {
    const drive = await this.drives.findById(this.oid(id));
    if (!drive) throw new NotFoundException('Drive not found');
    if (drive.status !== DriveStatus.Draft) throw new ConflictException('Only draft drives can be deleted. Close the drive instead.');
    if (await this.registrations.exists({ drive: drive._id })) throw new ConflictException('This drive has registrations');
    await Promise.all([this.reqs.deleteMany({ drive: drive._id }), this.rules.deleteMany({ drive: drive._id }), drive.deleteOne()]);
    await this.audit.log('drive.delete', user, 'PlacementDrive', id, {}, ip);
    return { ok: true };
  }

  async setRequirements(user: AuthUser, id: string, items: RequirementInputDto[], ip?: string) {
    const drive = await this.drives.findById(this.oid(id));
    if (!drive) throw new NotFoundException('Drive not found');
    const seen = new Set<string>();
    for (const r of items) {
      if (r.kind === 'skill' && !r.skill) throw new BadRequestException('Skill requirements need a skill id');
      if (r.kind === 'cluster' && !r.cluster) throw new BadRequestException('Cluster requirements need a cluster id');
      const key = `${r.kind}:${r.skill ?? r.cluster}`;
      if (seen.has(key)) throw new BadRequestException('Duplicate requirement');
      seen.add(key);
    }
    const skillIds = items.filter((r) => r.kind === 'skill').map((r) => r.skill!);
    const clusterIds = items.filter((r) => r.kind === 'cluster').map((r) => r.cluster!);
    if (skillIds.length && (await this.skills.countDocuments({ _id: { $in: skillIds }, active: true })) !== skillIds.length) {
      throw new BadRequestException('One or more required skills do not exist');
    }
    if (clusterIds.length) {
      if ((await this.clusters.countDocuments({ _id: { $in: clusterIds } })) !== clusterIds.length) throw new BadRequestException('One or more clusters do not exist');
      if ((await this.skills.countDocuments({ cluster: { $in: clusterIds }, active: true })) === 0) throw new BadRequestException('A cluster has no skills in it');
    }

    await this.reqs.deleteMany({ drive: drive._id });
    if (items.length) {
      await this.reqs.insertMany(
        items.map((r) => ({
          drive: drive._id,
          kind: r.kind,
          skill: r.kind === 'skill' ? r.skill : undefined,
          cluster: r.kind === 'cluster' ? r.cluster : undefined,
          requiredLevel: r.requiredLevel,
          weight: r.weight,
          mandatory: !!r.mandatory,
        })),
      );
    }
    drive.requirementsVersion += 1;
    await drive.save();
    await this.audit.log('drive.requirements', user, 'PlacementDrive', id, { count: items.length }, ip);
    // Requirements changed: readiness for this drive is stale -> background recalculation (inputs hash makes it a no-op if nothing changed).
    if (drive.status === DriveStatus.Published) {
      await this.jobs.startBatch(user.id, { driveIds: [id] }).catch((e) => this.logger.warn(`batch after requirement change skipped: ${e.message}`));
    }
    return this.getRequirements(id);
  }

  async getRequirements(id: string) {
    const rows = await this.reqs.find({ drive: this.oid(id) }).populate('skill', 'name category dimension').populate('cluster', 'name').lean();
    return rows.map((r) => ({
      id: String(r._id),
      kind: r.kind,
      skill: r.skill ? { id: String((r.skill as any)._id), name: (r.skill as any).name, category: (r.skill as any).category } : null,
      cluster: r.cluster ? { id: String((r.cluster as any)._id), name: (r.cluster as any).name } : null,
      requiredLevel: r.requiredLevel,
      weight: r.weight,
      mandatory: r.mandatory,
    }));
  }

  async setEligibility(user: AuthUser, id: string, dto: Partial<EligibilityRule>, ip?: string) {
    const drive = await this.drives.findById(this.oid(id));
    if (!drive) throw new NotFoundException('Drive not found');
    const rule = await this.rules.findOneAndUpdate({ drive: drive._id }, { $set: definedOnly(dto) }, { new: true, upsert: true, setDefaultsOnInsert: true }).lean();
    await this.audit.log('drive.eligibility', user, 'PlacementDrive', id, { changed: Object.keys(dto) }, ip);
    return rule;
  }

  async list(user: AuthUser, q: { page: number; limit: number; q?: string; status?: string }) {
    const filter: Record<string, any> = {};
    const isCell = [Role.PlacementOfficer, Role.PlacementHead, Role.Admin].includes(user.role);
    if (!isCell) filter.status = { $in: [DriveStatus.Published, DriveStatus.Closed, DriveStatus.Completed] };
    if (q.status && (isCell || q.status !== DriveStatus.Draft)) filter.status = q.status;
    if (q.q) {
      const rx = new RegExp(escapeRegex(q.q), 'i');
      filter.$or = [{ company: rx }, { role: rx }];
    }
    const page = await paginate(this.drives, filter, { page: q.page, limit: q.limit, sort: { deadline: 1 } });
    if (user.role === Role.Student) {
      const mine = await this.registrations.find({ student: user.id, drive: { $in: page.items.map((d: any) => d._id) } }).lean();
      const byDrive = new Map(mine.map((m) => [String(m.drive), m]));
      page.items = page.items.map((d: any) => ({ ...d, myRegistration: byDrive.get(String(d._id)) ?? null }));
    }
    return page;
  }

  async get(user: AuthUser, id: string) {
    const drive = await this.drives.findById(this.oid(id)).lean();
    const isCell = [Role.PlacementOfficer, Role.PlacementHead, Role.Admin].includes(user.role);
    if (!drive || (!isCell && drive.status === DriveStatus.Draft)) throw new NotFoundException('Drive not found');
    const [requirements, rule] = await Promise.all([this.getRequirements(id), this.rules.findOne({ drive: drive._id }).lean()]);
    const registrationCount = isCell ? await this.registrations.countDocuments({ drive: drive._id, status: { $ne: RegistrationStatus.Withdrawn } }) : undefined;
    const myRegistration = user.role === Role.Student ? ((await this.registrations.findOne({ drive: drive._id, student: user.id }).lean()) ?? null) : undefined;
    return { ...drive, requirements, eligibilityRule: rule, registrationCount, myRegistration };
  }

  /** Eligibility for one student and one drive. Pure rule evaluation; never involves readiness or AI. */
  async eligibilityFor(studentId: string, driveId: string): Promise<EligibilityResult> {
    const [profile, rule] = await Promise.all([
      this.profiles.findOne({ user: studentId }).lean(),
      this.rules.findOne({ drive: this.oid(driveId) }).lean(),
    ]);
    if (!profile) throw new NotFoundException('Student profile not found');
    return evaluateEligibility(profile as any, rule as any);
  }

  async register(student: AuthUser, driveId: string, ip?: string) {
    const cfg = await this.sysConfig.get();
    if (!cfg.registrationOpenForStudents) throw new ForbiddenException('Drive registration is currently closed by the administrator');
    const drive = await this.drives.findById(this.oid(driveId));
    if (!drive || drive.status !== DriveStatus.Published) throw new NotFoundException('Drive not found or not open for registration');
    if (drive.deadline.getTime() < Date.now()) throw new BadRequestException('The application deadline has passed');

    // Formal eligibility is the ONLY gate. A low readiness score never blocks registration.
    const elig = await this.eligibilityFor(student.id, driveId);
    if (!elig.eligible) {
      throw new ForbiddenException({ message: 'You do not meet the eligibility criteria for this drive', reasons: elig.reasons, error: 'NotEligible' });
    }
    const snapshot = { eligible: true, reasons: [], checkedAt: new Date() };
    const existing = await this.registrations.findOne({ drive: drive._id, student: student.id });
    if (existing) {
      if (existing.status !== RegistrationStatus.Withdrawn) throw new ConflictException('You are already registered for this drive');
      existing.status = RegistrationStatus.Registered;
      existing.eligibilityAtRegistration = snapshot as any;
      await existing.save();
      await this.audit.log('drive.register', student, 'PlacementDrive', driveId, { reregistered: true }, ip);
      return existing;
    }
    try {
      const reg = await this.registrations.create({ drive: drive._id, student: student.id, eligibilityAtRegistration: snapshot });
      await this.audit.log('drive.register', student, 'PlacementDrive', driveId, {}, ip);
      await this.cache.invalidate('dashboards');
      return reg;
    } catch (e: any) {
      if (e?.code === 11000) throw new ConflictException('You are already registered for this drive');
      throw e;
    }
  }

  async withdraw(student: AuthUser, driveId: string, ip?: string) {
    const reg = await this.registrations.findOne({ drive: this.oid(driveId), student: student.id });
    if (!reg || reg.status === RegistrationStatus.Withdrawn) throw new NotFoundException('You are not registered for this drive');
    if (reg.status !== RegistrationStatus.Registered) throw new ConflictException('You can no longer withdraw after shortlisting decisions');
    reg.status = RegistrationStatus.Withdrawn;
    await reg.save();
    await this.audit.log('drive.withdraw', student, 'PlacementDrive', driveId, {}, ip);
    await this.cache.invalidate('dashboards');
    return { ok: true };
  }

  /** Registrations for a drive, with eligibility (re-evaluated now) and the latest readiness kept as separate fields. */
  async listRegistrations(driveId: string, q: { page: number; limit: number; status?: string }) {
    const filter: Record<string, any> = { drive: this.oid(driveId) };
    if (q.status) filter.status = q.status;
    const page = await paginate(this.registrations, filter, { page: q.page, limit: q.limit, populate: { path: 'student', select: 'name email department' }, sort: { createdAt: 1 } });
    const ids = page.items.map((r: any) => r.student?._id).filter(Boolean);
    const [profiles, latest, rule] = await Promise.all([
      this.profiles.find({ user: { $in: ids } }).lean(),
      latestSnapshotRows(this.snapshots, { drive: this.oid(driveId), student: { $in: ids } }, 'student drive score computedAt').then((rows) => rows.map((r) => ({ _id: r.student, score: r.score, computedAt: r.computedAt }))),
      this.rules.findOne({ drive: this.oid(driveId) }).lean(),
    ]);
    const prof = new Map(profiles.map((p) => [String(p.user), p]));
    const score = new Map(latest.map((l) => [String(l._id), l]));
    page.items = page.items.map((r: any) => {
      const p = prof.get(String(r.student?._id));
      const elig = p ? evaluateEligibility(p as any, rule as any) : null;
      return {
        ...r,
        eligibility: elig ? { eligible: elig.eligible, reasons: elig.reasons } : null,
        readiness: score.has(String(r.student?._id)) ? { score: score.get(String(r.student._id))!.score, computedAt: score.get(String(r.student._id))!.computedAt } : null,
        cgpa: p?.cgpa,
        graduationYear: p?.graduationYear,
      };
    });
    return page;
  }

  async setRegistrationStatus(user: AuthUser, driveId: string, registrationId: string, status: RegistrationStatus, ip?: string) {
    if (![RegistrationStatus.Shortlisted, RegistrationStatus.Selected, RegistrationStatus.Rejected, RegistrationStatus.Registered].includes(status)) {
      throw new BadRequestException('Invalid status');
    }
    if (!Types.ObjectId.isValid(registrationId)) throw new NotFoundException('Registration not found');
    const reg = await this.registrations.findOne({ _id: registrationId, drive: this.oid(driveId) });
    if (!reg || reg.status === RegistrationStatus.Withdrawn) throw new NotFoundException('Registration not found');
    reg.status = status;
    await reg.save();
    await this.audit.log('registration.status', user, 'Registration', registrationId, { status }, ip);
    await this.cache.invalidate('dashboards');
    return reg;
  }
}
