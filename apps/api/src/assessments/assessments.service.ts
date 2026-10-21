import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Assessment,
  AssessmentAttempt,
  AssessmentAttemptDocument,
  AssessmentDocument,
  MockInterview,
  MockInterviewDocument,
} from '../database/schemas/assessment.schema';
import { StudentProfile, StudentProfileDocument } from '../database/schemas/user.schema';
import { EvidenceType, Role } from '../common/constants';
import { AuthUser } from '../common/decorators';
import { AuthorizationService } from '../authz/authz.service';
import { EvidenceService } from '../evidence/evidence.service';
import { SkillsService } from '../skills/skills.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { AuditService } from '../audit/audit.service';
import { percentToLevel } from '../readiness/profile.builder';
import { paginate } from '../common/pagination';

/** Level ceiling by number of questions that tested the skill: a 1-question quiz cannot prove Expert. */
export function levelCapForQuestionCount(n: number): number {
  if (n < 3) return 2;
  if (n < 5) return 3;
  return 5;
}

export interface QuestionInput {
  prompt: string;
  options: string[];
  correctIndex: number;
  skill: string;
  explanation?: string;
}

/** Strips protected fields so answers are never exposed before completion. */
export function sanitizeForStudent(a: any) {
  return {
    id: String(a._id),
    title: a.title,
    description: a.description,
    durationMinutes: a.durationMinutes,
    maxAttempts: a.maxAttempts,
    questionCount: a.questions?.length ?? 0,
    questions: (a.questions ?? []).map((q: any) => ({ id: String(q._id), prompt: q.prompt, options: q.options, skill: q.skill })),
  };
}

@Injectable()
export class AssessmentsService {
  constructor(
    @InjectModel(Assessment.name) private readonly assessments: Model<AssessmentDocument>,
    @InjectModel(AssessmentAttempt.name) private readonly attempts: Model<AssessmentAttemptDocument>,
    @InjectModel(MockInterview.name) private readonly interviews: Model<MockInterviewDocument>,
    @InjectModel(StudentProfile.name) private readonly profiles: Model<StudentProfileDocument>,
    private readonly authz: AuthorizationService,
    private readonly evidence: EvidenceService,
    private readonly skills: SkillsService,
    private readonly sysConfig: SystemConfigService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------ authoring

  private validateQuestions(questions: QuestionInput[]) {
    questions.forEach((q, i) => {
      if (q.options.length < 2 || q.options.length > 6) throw new BadRequestException(`Question ${i + 1}: provide 2-6 options`);
      if (q.correctIndex < 0 || q.correctIndex >= q.options.length) throw new BadRequestException(`Question ${i + 1}: correctIndex is out of range`);
    });
  }

  async create(user: AuthUser, dto: Omit<Partial<Assessment>, "questions"> & { questions: QuestionInput[] }, ip?: string) {
    this.validateQuestions(dto.questions);
    await this.skills.assertSkillsExist(dto.questions.map((q) => q.skill));
    const doc = await this.assessments.create({ ...dto, createdBy: user.id });
    await this.audit.log('assessment.create', user, 'Assessment', String(doc._id), { title: dto.title }, ip);
    return doc;
  }

  async setStatus(user: AuthUser, id: string, status: 'draft' | 'published' | 'archived', ip?: string) {
    const a = await this.assessments.findById(id);
    if (!a) throw new NotFoundException('Assessment not found');
    if (user.role === Role.Faculty && String(a.createdBy) !== user.id) throw new ForbiddenException('You can only change assessments you created');
    a.status = status;
    await a.save();
    await this.audit.log('assessment.status', user, 'Assessment', id, { status }, ip);
    return a;
  }

  /** Staff view includes answers (needed to author/review); students never use this path. */
  async listForStaff(user: AuthUser, q: { page: number; limit: number }) {
    const filter: Record<string, any> = user.role === Role.Faculty ? { createdBy: user.id } : {};
    return paginate(this.assessments, filter, { page: q.page, limit: q.limit, select: '-questions.correctIndex -questions.explanation' });
  }

  async getForStaff(user: AuthUser, id: string) {
    const a = await this.assessments.findById(id).lean();
    if (!a) throw new NotFoundException('Assessment not found');
    if (user.role === Role.Faculty && String(a.createdBy) !== user.id) throw new ForbiddenException('Not your assessment');
    return a;
  }

  // ------------------------------------------------------------ student side

  private async assignedFilter(studentId: string) {
    const p = await this.profiles.findOne({ user: studentId }).lean();
    return {
      status: 'published',
      $and: [
        { $or: [{ departments: { $size: 0 } }, ...(p?.department ? [{ departments: p.department }] : [])] },
        { $or: [{ graduationYears: { $size: 0 } }, ...(p?.graduationYear ? [{ graduationYears: p.graduationYear }] : [])] },
      ],
    };
  }

  async listForStudent(student: AuthUser) {
    const rows = await this.assessments.find(await this.assignedFilter(student.id)).sort({ createdAt: -1 }).lean();
    // A student has a handful of attempts per assessment, so reducing in memory is cheap and keeps the query portable.
    const mine = await this.attempts.find({ student: student.id, assessment: { $in: rows.map((r) => r._id) } }).select('assessment percent submittedAt').lean();
    const agg = new Map<string, { _id: string; used: number; best: number; last: Date | null }>();
    for (const a of mine) {
      const k = String(a.assessment);
      const cur = agg.get(k) ?? { _id: k, used: 0, best: 0, last: null };
      cur.used += 1;
      cur.best = Math.max(cur.best, a.percent ?? 0);
      if (a.submittedAt && (!cur.last || a.submittedAt > cur.last)) cur.last = a.submittedAt;
      agg.set(k, cur);
    }
    const attempts = [...agg.values()];
    const by = new Map(attempts.map((a) => [String(a._id), a]));
    return rows.map((r) => ({
      ...sanitizeForStudent({ ...r, questions: [] }),
      questionCount: r.questions.length,
      attemptsUsed: by.get(String(r._id))?.used ?? 0,
      bestPercent: by.get(String(r._id))?.best ?? null,
      lastAttemptAt: by.get(String(r._id))?.last ?? null,
    }));
  }

  /** Questions without answers or explanations. */
  async takeForStudent(student: AuthUser, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Assessment not found');
    const a = await this.assessments.findOne({ _id: id, ...(await this.assignedFilter(student.id)) }).lean();
    if (!a) throw new NotFoundException('Assessment not found');
    const used = await this.attempts.countDocuments({ assessment: id, student: student.id });
    if (used >= a.maxAttempts) throw new ForbiddenException(`Attempt limit reached (${a.maxAttempts})`);
    return { ...sanitizeForStudent(a), attemptsUsed: used };
  }

  /** Scoring is entirely server-side. */
  async submit(student: AuthUser, id: string, answers: number[], ip?: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Assessment not found');
    const a = await this.assessments.findOne({ _id: id, ...(await this.assignedFilter(student.id)) }).lean();
    if (!a) throw new NotFoundException('Assessment not found');
    const used = await this.attempts.countDocuments({ assessment: id, student: student.id });
    if (used >= a.maxAttempts) throw new ForbiddenException(`Attempt limit reached (${a.maxAttempts})`);
    if (answers.length !== a.questions.length) throw new BadRequestException(`Expected ${a.questions.length} answers (use -1 for unanswered)`);

    let score = 0;
    const perSkillMap = new Map<string, { correct: number; total: number }>();
    const review = a.questions.map((q: any, i: number) => {
      const given = answers[i];
      if (!Number.isInteger(given) || given < -1 || given >= q.options.length) throw new BadRequestException(`Invalid answer for question ${i + 1}`);
      const correct = given === q.correctIndex;
      if (correct) score++;
      const k = String(q.skill);
      const cur = perSkillMap.get(k) ?? { correct: 0, total: 0 };
      cur.total += 1;
      if (correct) cur.correct += 1;
      perSkillMap.set(k, cur);
      return { questionId: String(q._id), prompt: q.prompt, yourAnswer: given, correctIndex: q.correctIndex, correct, explanation: q.explanation, options: q.options };
    });
    const total = a.questions.length;
    const percent = total ? Math.round((1000 * score) / total) / 10 : 0;

    const cfg = await this.sysConfig.get();
    const perSkill = [...perSkillMap.entries()].map(([skill, v]) => {
      const pct = Math.round((1000 * v.correct) / v.total) / 10;
      const awardedLevel = Math.min(percentToLevel(pct, cfg.assessmentLevelThresholds), levelCapForQuestionCount(v.total));
      return { skill: new Types.ObjectId(skill), correct: v.correct, total: v.total, percent: pct, awardedLevel };
    });

    const attempt = await this.attempts.create({ assessment: a._id, student: student.id, answers, score, total, percent, perSkill });

    const claims = perSkill.filter((p) => p.awardedLevel > 0).map((p) => ({ skill: String(p.skill), level: p.awardedLevel }));
    if (claims.length) {
      const ev = await this.evidence.createSystemEvidence({
        student: student.id,
        type: EvidenceType.Assessment,
        title: `${a.title} (attempt ${used + 1}, ${percent}%)`,
        description: 'Objective score computed by the platform',
        skills: claims,
        meta: { attemptId: String(attempt._id), assessmentId: id, percent },
        autoVerify: cfg.assessmentAutoVerify,
        comment: 'Objective assessment score computed server-side',
      });
      attempt.evidence = ev._id as any;
      await attempt.save();
    }
    await this.audit.log('assessment.submit', student, 'Assessment', id, { percent }, ip);
    return { attemptId: String(attempt._id), score, total, percent, perSkill, review, attemptsRemaining: a.maxAttempts - used - 1, evidenceAutoVerified: cfg.assessmentAutoVerify };
  }

  async myAttempts(student: AuthUser, q: { page: number; limit: number }) {
    return paginate(this.attempts, { student: student.id }, {
      page: q.page,
      limit: q.limit,
      select: '-answers',
      sort: { submittedAt: -1 },
      populate: [{ path: 'assessment', select: 'title' }, { path: 'perSkill.skill', select: 'name' }],
    });
  }

  /** Staff: attempts for an assessment, scoped to the faculty member's own mentees. */
  async results(user: AuthUser, id: string, q: { page: number; limit: number }) {
    const filter: Record<string, any> = { assessment: id };
    if (user.role === Role.Faculty) filter.student = { $in: await this.authz.menteeIds(user.id) };
    return paginate(this.attempts, filter, {
      page: q.page,
      limit: q.limit,
      select: '-answers',
      sort: { submittedAt: -1 },
      populate: [{ path: 'student', select: 'name email' }, { path: 'perSkill.skill', select: 'name' }],
    });
  }
}
