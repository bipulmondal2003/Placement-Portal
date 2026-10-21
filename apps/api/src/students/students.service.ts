import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StudentProfile, StudentProfileDocument, User, UserDocument } from '../database/schemas/user.schema';
import { EvidenceItem, EvidenceItemDocument } from '../database/schemas/evidence.schema';
import { PlacementDrive, PlacementDriveDocument, Registration, RegistrationDocument } from '../database/schemas/drive.schema';
import { SkillProfile, SkillProfileDocument } from '../database/schemas/readiness.schema';
import { DriveStatus, PLACEMENT_CELL, Role } from '../common/constants';
import { AuthUser } from '../common/decorators';
import { AuthorizationService } from '../authz/authz.service';
import { SkillsService } from '../skills/skills.service';
import { SkillProfileService } from '../readiness/skill-profile.service';
import { ReadinessService } from '../readiness/readiness.service';
import { DrivesService } from '../drives/drives.service';
import { AuditService } from '../audit/audit.service';
import { escapeRegex, paginate } from '../common/pagination';

/** Fields a student may edit about themselves; academic fields can also be corrected by the placement cell. */
const STUDENT_EDITABLE = ['rollNumber', 'department', 'graduationYear', 'cgpa', 'tenthPercent', 'twelfthPercent', 'activeBacklogs', 'historyOfBacklogs', 'phone', 'headline', 'projects', 'certifications'];
const CELL_EDITABLE = [...STUDENT_EDITABLE, 'mentor'];

@Injectable()
export class StudentsService {
  constructor(
    @InjectModel(StudentProfile.name) private readonly profiles: Model<StudentProfileDocument>,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    @InjectModel(EvidenceItem.name) private readonly evidence: Model<EvidenceItemDocument>,
    @InjectModel(SkillProfile.name) private readonly skillProfiles: Model<SkillProfileDocument>,
    @InjectModel(PlacementDrive.name) private readonly drives: Model<PlacementDriveDocument>,
    @InjectModel(Registration.name) private readonly registrations: Model<RegistrationDocument>,
    private readonly authz: AuthorizationService,
    private readonly skills: SkillsService,
    private readonly skillProfile: SkillProfileService,
    private readonly readiness: ReadinessService,
    private readonly drivesSvc: DrivesService,
    private readonly audit: AuditService,
  ) {}

  /** Profile completion indicators: each item is a concrete, checkable step. */
  private completion(p: any, declaredCount: number, evidenceCount: number) {
    const items = [
      { key: 'department', label: 'Department', done: !!p.department },
      { key: 'graduationYear', label: 'Graduation year', done: !!p.graduationYear },
      { key: 'cgpa', label: 'CGPA', done: p.cgpa != null },
      { key: 'schoolMarks', label: '10th and 12th percentages', done: p.tenthPercent != null && p.twelfthPercent != null },
      { key: 'phone', label: 'Contact number', done: !!p.phone },
      { key: 'headline', label: 'Headline', done: !!p.headline },
      { key: 'projects', label: 'At least one project', done: (p.projects?.length ?? 0) > 0 },
      { key: 'skills', label: 'Rate at least 3 skills', done: declaredCount >= 3 },
      { key: 'evidence', label: 'Submit at least one piece of evidence', done: evidenceCount > 0 },
      { key: 'mentor', label: 'Mentor assigned', done: !!p.mentor },
    ];
    return { percent: Math.round((100 * items.filter((i) => i.done).length) / items.length), items };
  }

  async getProfile(user: AuthUser, studentId: string) {
    await this.authz.assertCanAccessStudent(user, studentId);
    const [profile, account, sp, evCount] = await Promise.all([
      this.profiles.findOne({ user: studentId }).populate('mentor', 'name email').lean(),
      this.users.findById(studentId).select('name email department').lean(),
      this.skillProfiles.findOne({ student: studentId }).lean(),
      this.evidence.countDocuments({ student: studentId }),
    ]);
    if (!profile || !account) throw new NotFoundException('Student not found');
    const declared = (sp?.skills ?? []).filter((s: any) => s.declaredLevel > 0).length;
    return { ...profile, name: account.name, email: account.email, completion: this.completion(profile, declared, evCount) };
  }

  async updateProfile(user: AuthUser, studentId: string, patch: Record<string, any>, ip?: string) {
    await this.authz.assertCanAccessStudent(user, studentId);
    const isCell = PLACEMENT_CELL.includes(user.role) || user.role === Role.Admin;
    if (!isCell && user.role !== Role.Student) throw new ForbiddenException('You cannot edit this profile');
    const allowed = isCell ? CELL_EDITABLE : STUDENT_EDITABLE;
    const set: Record<string, any> = {};
    for (const k of allowed) if (patch[k] !== undefined) set[k] = patch[k];
    const profile = await this.profiles.findOneAndUpdate({ user: studentId }, { $set: set }, { new: true, runValidators: true });
    if (!profile) throw new NotFoundException('Student not found');
    if (set.department) await this.users.updateOne({ _id: studentId }, { $set: { department: set.department } });
    await this.audit.log('student.update_profile', user, 'StudentProfile', studentId, { fields: Object.keys(set) }, ip);
    return this.getProfile(user, studentId);
  }

  /** Skill profile: verified and self-reported proficiency are returned as SEPARATE fields. */
  async skillView(user: AuthUser, studentId: string) {
    await this.authz.assertCanAccessStudent(user, studentId);
    await this.skillProfile.rebuild(studentId);
    const sp = await this.skillProfiles.findOne({ student: studentId }).lean();
    const tax = await this.skills.taxonomy();
    const byId = new Map(tax.skills.map((s) => [s.id, s]));
    const entries = (sp?.skills ?? []).map((e: any) => {
      const s = byId.get(String(e.skill));
      return {
        skillId: String(e.skill),
        name: s?.name ?? 'Unknown',
        category: s?.category ?? '',
        dimension: s?.dimension,
        declaredLevel: e.declaredLevel ?? 0,
        selfReportedLevel: e.selfReportedLevel,
        verifiedLevel: e.verifiedLevel,
        verifiedEvidenceTypes: e.verifiedEvidenceTypes,
        verifiedEvidenceCount: e.verifiedEvidenceCount,
        pendingEvidenceCount: e.pendingEvidenceCount,
        rejectedEvidenceCount: e.rejectedEvidenceCount,
        evidenceStrength: e.evidenceStrength,
        lastVerifiedAt: e.lastVerifiedAt,
        status: e.verifiedLevel > 0 ? 'verified' : e.pendingEvidenceCount > 0 ? 'pending' : 'self_reported',
      };
    });
    entries.sort((a, b) => b.verifiedLevel - a.verifiedLevel || b.selfReportedLevel - a.selfReportedLevel || a.name.localeCompare(b.name));
    return { skills: entries, projectDepth: sp?.projectDepth ?? 0 };
  }

  async setDeclared(user: AuthUser, studentId: string, skillId: string, level: number, ip?: string) {
    if (user.role !== Role.Student || user.id !== studentId) throw new ForbiddenException('Only the student can rate their own skills');
    await this.skills.assertSkillsExist([skillId]);
    await this.skillProfile.setDeclaredLevel(studentId, skillId, level);
    await this.audit.log('student.declare_skill', user, 'Skill', skillId, { level }, ip);
    return this.skillView(user, studentId);
  }

  async list(user: AuthUser, q: { page: number; limit: number; q?: string; department?: string; graduationYear?: number }) {
    const filter: Record<string, any> = {};
    if (user.role === Role.Faculty) filter.mentor = user.id;
    if (q.department) filter.department = q.department;
    if (q.graduationYear) filter.graduationYear = q.graduationYear;
    if (q.q) {
      const rx = new RegExp(escapeRegex(q.q), 'i');
      const ids = await this.users.find({ role: Role.Student, $or: [{ name: rx }, { email: rx }] }).select('_id').limit(500).lean();
      filter.$or = [{ user: { $in: ids.map((i) => i._id) } }, { rollNumber: rx }];
    }
    const page = await paginate(this.profiles, filter, { page: q.page, limit: q.limit, populate: [{ path: 'user', select: 'name email' }, { path: 'mentor', select: 'name' }], sort: { createdAt: -1 } });
    return page;
  }

  /**
   * All published drives for a student: ELIGIBILITY and READINESS in separate, independent blocks.
   * The two values are never combined into one number or one label.
   */
  async readinessOverview(user: AuthUser, studentId: string) {
    await this.authz.assertCanAccessStudent(user, studentId);
    const contexts = await this.readiness.loadDriveContexts(undefined, [DriveStatus.Published, DriveStatus.Closed]);
    const { results } = await this.readiness.computeMany([studentId], contexts, 'on_demand');
    const driveDocs = await this.drives.find({ _id: { $in: contexts.map((c) => new Types.ObjectId(c.driveId)) } }).lean();
    const regs = await this.registrations.find({ student: studentId, drive: { $in: driveDocs.map((d) => d._id) } }).lean();
    const regBy = new Map(regs.map((r) => [String(r.drive), r]));
    const rows = [];
    for (const d of driveDocs) {
      const r = results.find((x) => x.driveId === String(d._id));
      const elig = await this.drivesSvc.eligibilityFor(studentId, String(d._id));
      rows.push({
        drive: { id: String(d._id), company: d.company, role: d.role, deadline: d.deadline, status: d.status },
        eligibility: { eligible: elig.eligible, reasons: elig.reasons },
        readiness: r ? { score: r.result.score, dimensions: r.result.dimensions, topGap: r.result.gaps[0]?.label ?? null, gapCount: r.result.gaps.filter((g) => g.gap > 0).length } : null,
        registration: regBy.get(String(d._id)) ? { status: regBy.get(String(d._id))!.status } : null,
      });
    }
    rows.sort((a, b) => new Date(a.drive.deadline).getTime() - new Date(b.drive.deadline).getTime());
    return rows;
  }

  async readinessDetail(user: AuthUser, studentId: string, driveId: string) {
    await this.authz.assertCanAccessStudent(user, studentId);
    await this.drivesSvc.get(user, driveId);
    const [elig, r, history] = await Promise.all([
      this.drivesSvc.eligibilityFor(studentId, driveId),
      this.readiness.computeOne(studentId, driveId),
      this.readiness.history(studentId, driveId),
    ]);
    return {
      driveId,
      studentId,
      eligibility: { eligible: elig.eligible, reasons: elig.reasons, checks: elig.checks },
      readiness: {
        score: r.result.score,
        dimensions: r.result.dimensions,
        explanation: r.result.explanation,
        gaps: r.result.gaps,
        met: r.result.met,
        nextActions: r.result.nextActions,
        cappedByMandatory: r.result.cappedByMandatory,
        history: history.reverse(),
      },
    };
  }
}
