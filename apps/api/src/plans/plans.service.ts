import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PreparationPlan,
  PreparationPlanDocument,
  PreparationTask,
  PreparationTaskDocument,
} from '../database/schemas/plan.schema';
import { GapAnalysis, GapAnalysisDocument } from '../database/schemas/readiness.schema';
import { PlacementDrive, PlacementDriveDocument } from '../database/schemas/drive.schema';
import { AuthUser } from '../common/decorators';
import { DriveStatus, Role } from '../common/constants';
import { AuthorizationService } from '../authz/authz.service';
import { ReadinessService } from '../readiness/readiness.service';
import { SkillsService } from '../skills/skills.service';
import { AuditService } from '../audit/audit.service';
import { buildRuleBasedPlan, PlannedTask, startOfUtcDay } from './planner';

export interface GenerateOptions {
  driveId: string;
  days?: number;
  hoursPerDay?: number;
  startDate?: Date;
}

export interface AiPlanInput {
  driveId: string;
  summary?: string;
  startDate: Date;
  hoursPerDay: number;
  basedOnInputsHash?: string;
  tasks: Array<Omit<PlannedTask, 'date' | 'checkpoint'> & { checkpoint?: boolean }>;
}

@Injectable()
export class PlansService {
  constructor(
    @InjectModel(PreparationPlan.name) private readonly plans: Model<PreparationPlanDocument>,
    @InjectModel(PreparationTask.name) private readonly tasks: Model<PreparationTaskDocument>,
    @InjectModel(GapAnalysis.name) private readonly gapAnalyses: Model<GapAnalysisDocument>,
    @InjectModel(PlacementDrive.name) private readonly drives: Model<PlacementDriveDocument>,
    private readonly authz: AuthorizationService,
    private readonly readiness: ReadinessService,
    private readonly skills: SkillsService,
    private readonly audit: AuditService,
  ) {}

  private defaultDays(drive: PlacementDriveDocument): number {
    const target = (drive.driveDate ?? drive.deadline).getTime();
    const d = Math.ceil((target - Date.now()) / 86_400_000);
    return Math.max(7, Math.min(42, d));
  }

  private async resolveDrive(driveId: string) {
    if (!Types.ObjectId.isValid(driveId)) throw new NotFoundException('Drive not found');
    const drive = await this.drives.findById(driveId);
    if (!drive || drive.status === DriveStatus.Draft) throw new NotFoundException('Drive not found');
    return drive;
  }

  private async archiveActive(studentId: string, driveId: string) {
    await this.plans.updateMany({ student: studentId, drive: driveId, status: 'active' }, { $set: { status: 'archived' } });
  }

  /** Deterministic plan from the current ranked gaps. */
  async generate(student: AuthUser, opts: GenerateOptions, ip?: string) {
    const drive = await this.resolveDrive(opts.driveId);
    const { result } = await this.readiness.computeOne(student.id, opts.driveId);
    if (!result.gaps.some((g) => g.gap > 0)) throw new BadRequestException('You have no skill gaps for this drive, so no plan is needed.');

    const tax = await this.skills.taxonomy();
    const descriptors = new Map(tax.skills.map((s) => [s.id, s.levelDescriptors]));
    const days = opts.days ?? this.defaultDays(drive);
    const hoursPerDay = opts.hoursPerDay ?? 2;
    const startDate = startOfUtcDay(opts.startDate ?? new Date());
    const planned = buildRuleBasedPlan(result.gaps, { startDate, days, hoursPerDay, descriptors });

    return this.persist(student.id, opts.driveId, {
      source: 'rule_based',
      startDate,
      endDate: new Date(startDate.getTime() + (days - 1) * 86_400_000),
      hoursPerDay,
      summary: `Rule-based plan covering ${result.gaps.filter((g) => g.gap > 0).slice(0, 6).map((g) => g.label).join(', ')}, prioritised by impact on this drive's requirements.`,
      basedOnInputsHash: result.inputsHash,
      tasks: planned,
      user: student,
      ip,
    });
  }

  /** Persists a plan accepted from the AI module (already validated). */
  async saveAiPlan(student: AuthUser, input: AiPlanInput, ip?: string) {
    await this.resolveDrive(input.driveId);
    const start = startOfUtcDay(input.startDate);
    const tasks: PlannedTask[] = input.tasks.map((t) => ({
      ...t,
      date: new Date(start.getTime() + t.dayIndex * 86_400_000),
      checkpoint: !!t.checkpoint,
    }));
    const maxDay = Math.max(0, ...tasks.map((t) => t.dayIndex));
    return this.persist(student.id, input.driveId, {
      source: 'ai',
      startDate: start,
      endDate: new Date(start.getTime() + maxDay * 86_400_000),
      hoursPerDay: input.hoursPerDay,
      summary: input.summary,
      basedOnInputsHash: input.basedOnInputsHash,
      tasks,
      user: student,
      ip,
    });
  }

  private async persist(
    studentId: string,
    driveId: string,
    p: { source: 'rule_based' | 'ai'; startDate: Date; endDate: Date; hoursPerDay: number; summary?: string; basedOnInputsHash?: string; tasks: PlannedTask[]; user: AuthUser; ip?: string },
  ) {
    await this.archiveActive(studentId, driveId);
    const plan = await this.plans.create({
      student: studentId,
      drive: driveId,
      startDate: p.startDate,
      endDate: p.endDate,
      hoursPerDay: p.hoursPerDay,
      source: p.source,
      summary: p.summary,
      basedOnInputsHash: p.basedOnInputsHash,
    });
    if (p.tasks.length) {
      await this.tasks.insertMany(
        p.tasks.map((t) => ({
          plan: plan._id,
          student: studentId,
          dayIndex: t.dayIndex,
          date: t.date,
          title: t.title,
          objective: t.objective,
          activity: t.activity,
          exercise: t.exercise,
          expectedOutcome: t.expectedOutcome,
          estimatedMinutes: Math.min(600, Math.max(5, Math.round(t.estimatedMinutes))),
          skill: t.skill && Types.ObjectId.isValid(t.skill) ? t.skill : undefined,
          checkpoint: t.checkpoint,
        })),
      );
    }
    await this.audit.log('plan.create', p.user, 'PreparationPlan', String(plan._id), { source: p.source, driveId }, p.ip);
    return this.get(p.user, String(plan._id));
  }

  private async progress(planId: Types.ObjectId | string) {
    const rows = await this.tasks.aggregate([
      { $match: { plan: new Types.ObjectId(String(planId)) } },
      { $group: { _id: '$status', n: { $sum: 1 }, minutes: { $sum: '$estimatedMinutes' } } },
    ]);
    const get = (s: string) => rows.find((r) => r._id === s) ?? { n: 0, minutes: 0 };
    const total = rows.reduce((s, r) => s + r.n, 0);
    const done = get('done').n;
    return { total, done, inProgress: get('in_progress').n, percent: total ? Math.round((100 * done) / total) : 0, minutesDone: get('done').minutes, minutesTotal: rows.reduce((s, r) => s + r.minutes, 0) };
  }

  async get(user: AuthUser, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Plan not found');
    const plan = await this.plans.findById(id).populate('drive', 'company role deadline').lean();
    if (!plan) throw new NotFoundException('Plan not found');
    await this.authz.assertCanAccessStudent(user, String(plan.student));
    const [tasks, progress, gaps] = await Promise.all([
      this.tasks.find({ plan: id }).sort({ dayIndex: 1, checkpoint: 1 }).populate('skill', 'name').lean(),
      this.progress(id),
      this.gapAnalyses.findOne({ student: plan.student, drive: (plan.drive as any)._id }).select('inputsHash').lean(),
    ]);
    // A plan is "stale" when the student's gaps changed after it was generated.
    const stale = !!plan.basedOnInputsHash && !!gaps && gaps.inputsHash !== plan.basedOnInputsHash;
    return { ...plan, tasks, progress, stale };
  }

  async listForStudent(user: AuthUser, studentId: string) {
    await this.authz.assertCanAccessStudent(user, studentId);
    const plans = await this.plans.find({ student: studentId }).sort({ createdAt: -1 }).populate('drive', 'company role').lean();
    return Promise.all(plans.map(async (p) => ({ ...p, progress: await this.progress(p._id) })));
  }

  async calendar(student: AuthUser, from: Date, to: Date) {
    const activePlans = await this.plans.find({ student: student.id, status: 'active' }).select('_id').lean();
    return this.tasks
      .find({ student: student.id, plan: { $in: activePlans.map((p) => p._id) }, date: { $gte: from, $lte: to } })
      .sort({ date: 1, checkpoint: 1 })
      .populate('skill', 'name')
      .populate({ path: 'plan', select: 'drive', populate: { path: 'drive', select: 'company role' } })
      .lean();
  }

  async updateTask(student: AuthUser, planId: string, taskId: string, status: 'todo' | 'in_progress' | 'done') {
    if (!Types.ObjectId.isValid(planId) || !Types.ObjectId.isValid(taskId)) throw new NotFoundException('Task not found');
    // Ownership is part of the query filter: another student's task id simply does not match.
    const task = await this.tasks.findOneAndUpdate(
      { _id: taskId, plan: planId, student: student.id },
      { $set: { status, completedAt: status === 'done' ? new Date() : undefined } },
      { new: true },
    );
    if (!task) throw new NotFoundException('Task not found');
    const progress = await this.progress(planId);
    if (progress.total && progress.done === progress.total) await this.plans.updateOne({ _id: planId, student: student.id }, { $set: { status: 'completed' } });
    else await this.plans.updateOne({ _id: planId, student: student.id, status: 'completed' }, { $set: { status: 'active' } });
    return { task, progress };
  }

  async archive(student: AuthUser, id: string) {
    const res = await this.plans.updateOne({ _id: id, student: student.id }, { $set: { status: 'archived' } });
    if (!res.matchedCount) throw new NotFoundException('Plan not found');
    return { ok: true };
  }

  /** Compact data for AI context: only the signed-in student's own plan progress. */
  async activeSummary(studentId: string) {
    const plans = await this.plans.find({ student: studentId, status: 'active' }).populate('drive', 'company role').lean();
    return Promise.all(plans.map(async (p) => ({ drive: `${(p.drive as any)?.company} - ${(p.drive as any)?.role}`, startDate: p.startDate, endDate: p.endDate, progress: await this.progress(p._id) })));
  }

  static isStaffViewer(role: Role) {
    return role !== Role.Student;
  }
}
