import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StudentProfile, StudentProfileDocument, User, UserDocument } from '../database/schemas/user.schema';
import { EvidenceItem, EvidenceItemDocument } from '../database/schemas/evidence.schema';
import {
  DriveRequirement,
  DriveRequirementDocument,
  EligibilityRule,
  EligibilityRuleDocument,
  PlacementDrive,
  PlacementDriveDocument,
  Registration,
  RegistrationDocument,
} from '../database/schemas/drive.schema';
import {
  GapAnalysis,
  GapAnalysisDocument,
  ReadinessSnapshot,
  ReadinessSnapshotDocument,
  SkillProfile,
  SkillProfileDocument,
} from '../database/schemas/readiness.schema';
import { PreparationPlan, PreparationPlanDocument, PreparationTask, PreparationTaskDocument } from '../database/schemas/plan.schema';
import { AssessmentAttempt, AssessmentAttemptDocument, Assessment, AssessmentDocument } from '../database/schemas/assessment.schema';
import { BatchJob, BatchJobDocument } from '../database/schemas/system.schema';
import { AuditLog, AuditLogDocument } from '../database/schemas/recruiter.schema';
import { DriveStatus, EvidenceStatus, RegistrationStatus, Role } from '../common/constants';
import { evaluateEligibility } from '../readiness/eligibility.engine';
import { SkillsService } from '../skills/skills.service';
import { latestSnapshotRows } from '../readiness/latest-snapshots';
import { CacheService } from '../redis/cache.service';

export interface Scope {
  driveId?: string;
  department?: string;
  graduationYear?: number;
}

export const BINS = ['0-19', '20-39', '40-59', '60-79', '80-100'];
export const binOf = (score: number) => BINS[Math.min(4, Math.floor(score / 20))];
const avg = (xs: number[]) => (xs.length ? Math.round((10 * xs.reduce((s, x) => s + x, 0)) / xs.length) / 10 : null);
const pct = (a: number, b: number) => (b ? Math.round((1000 * a) / b) / 10 : 0);

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    @InjectModel(StudentProfile.name) private readonly profiles: Model<StudentProfileDocument>,
    @InjectModel(EvidenceItem.name) private readonly evidence: Model<EvidenceItemDocument>,
    @InjectModel(PlacementDrive.name) private readonly drives: Model<PlacementDriveDocument>,
    @InjectModel(DriveRequirement.name) private readonly reqs: Model<DriveRequirementDocument>,
    @InjectModel(EligibilityRule.name) private readonly rules: Model<EligibilityRuleDocument>,
    @InjectModel(Registration.name) private readonly registrations: Model<RegistrationDocument>,
    @InjectModel(ReadinessSnapshot.name) private readonly snapshots: Model<ReadinessSnapshotDocument>,
    @InjectModel(GapAnalysis.name) private readonly gaps: Model<GapAnalysisDocument>,
    @InjectModel(SkillProfile.name) private readonly skillProfiles: Model<SkillProfileDocument>,
    @InjectModel(PreparationPlan.name) private readonly plans: Model<PreparationPlanDocument>,
    @InjectModel(PreparationTask.name) private readonly tasks: Model<PreparationTaskDocument>,
    @InjectModel(AssessmentAttempt.name) private readonly attempts: Model<AssessmentAttemptDocument>,
    @InjectModel(Assessment.name) private readonly assessments: Model<AssessmentDocument>,
    @InjectModel(BatchJob.name) private readonly batches: Model<BatchJobDocument>,
    @InjectModel(AuditLog.name) private readonly auditLogs: Model<AuditLogDocument>,
    private readonly skills: SkillsService,
    private readonly cache: CacheService,
  ) {}

  /** Cached, NON-private aggregates only (no per-student data). Invalidated through the 'dashboards' namespace. */
  private cached<T>(key: string, loader: () => Promise<T>, ttl = 120): Promise<T> {
    return this.cache.getOrSet('dashboards', key, ttl, loader);
  }

  private async studentIdsInScope(scope: Scope): Promise<Types.ObjectId[]> {
    const f: Record<string, any> = {};
    if (scope.department) f.department = scope.department;
    if (scope.graduationYear) f.graduationYear = scope.graduationYear;
    return (await this.profiles.find(f).select('user').lean()).map((p) => p.user as Types.ObjectId);
  }

  /** Latest readiness snapshot per (student, drive). */
  private async latestScores(studentIds: Types.ObjectId[] | null, driveIds?: Types.ObjectId[]) {
    const match: Record<string, any> = {};
    if (studentIds) match.student = { $in: studentIds };
    if (driveIds) match.drive = { $in: driveIds };
    const rows = await latestSnapshotRows(this.snapshots, match);
    return rows.map((r) => ({ student: String(r.student), drive: String(r.drive), score: r.score as number, dimensions: r.dimensions, computedAt: r.computedAt as Date }));
  }

  private async publishedDriveIds(driveId?: string) {
    if (driveId) return [new Types.ObjectId(driveId)];
    return (await this.drives.find({ status: { $in: [DriveStatus.Published, DriveStatus.Closed, DriveStatus.Completed] } }).select('_id').lean()).map((d) => d._id as Types.ObjectId);
  }

  // -------------------------------------------------------------- distribution

  async readinessDistribution(scope: Scope) {
    return this.cached(`dist:${JSON.stringify(scope)}`, async () => {
      const students = await this.studentIdsInScope(scope);
      const scores = await this.latestScores(students, await this.publishedDriveIds(scope.driveId));
      const counts = Object.fromEntries(BINS.map((b) => [b, 0]));
      scores.forEach((s) => counts[binOf(s.score)]++);
      const dims = (k: string) => avg(scores.map((s) => s.dimensions?.[k]).filter((x) => typeof x === 'number'));
      return {
        total: scores.length,
        average: avg(scores.map((s) => s.score)),
        bins: BINS.map((b) => ({ range: b, count: counts[b] })),
        dimensionAverages: { technical: dims('technical'), aptitude: dims('aptitude'), communication: dims('communication'), projectDepth: dims('projectDepth') },
      };
    });
  }

  // -------------------------------------------------------------- supply vs demand

  /**
   * Skill supply against drive demand: for every skill/cluster that published drives require, how many students in
   * scope hold VERIFIED proficiency at the required level, versus how much demand (drives x weight) exists.
   * `shortfall` = students in scope - students at target; `priority` ranks what training should run next.
   */
  async supplyDemand(scope: Scope) {
    return this.cached(`sd:${JSON.stringify(scope)}`, async () => {
      const driveIds = scope.driveId ? [new Types.ObjectId(scope.driveId)] : (await this.drives.find({ status: DriveStatus.Published }).select('_id').lean()).map((d) => d._id as Types.ObjectId);
      const reqs = await this.reqs.find({ drive: { $in: driveIds } }).lean();
      const tax = await this.skills.taxonomy();
      const skillName = new Map(tax.skills.map((s) => [s.id, s.name]));
      const clusterName = new Map(tax.clusters.map((c) => [c.id, c.name]));
      const members = new Map<string, string[]>();
      for (const s of tax.skills) if (s.cluster) members.set(s.cluster, [...(members.get(s.cluster) ?? []), s.id]);

      // Students in scope: registrants of the specific drive, else every student matching the filters.
      let students: Types.ObjectId[];
      if (scope.driveId) {
        const regs = await this.registrations.find({ drive: scope.driveId, status: { $ne: RegistrationStatus.Withdrawn } }).select('student').lean();
        students = regs.map((r) => r.student as Types.ObjectId);
      } else {
        students = await this.studentIdsInScope(scope);
      }
      const sps = await this.skillProfiles.find({ student: { $in: students } }).select('student skills.skill skills.verifiedLevel').lean();

      const rows = new Map<string, { key: string; kind: string; label: string; ids: string[]; drives: Set<string>; levels: number[]; weight: number; maxLevel: number; mandatory: boolean }>();
      for (const r of reqs) {
        const key = r.kind === 'cluster' ? `c:${r.cluster}` : `s:${r.skill}`;
        const ids = r.kind === 'cluster' ? members.get(String(r.cluster)) ?? [] : [String(r.skill)];
        const label = r.kind === 'cluster' ? `${clusterName.get(String(r.cluster)) ?? 'Cluster'} (any)` : skillName.get(String(r.skill)) ?? 'Unknown';
        const row = rows.get(key) ?? { key, kind: r.kind, label, ids, drives: new Set(), levels: [], weight: 0, maxLevel: 0, mandatory: false };
        row.drives.add(String(r.drive));
        row.levels.push(r.requiredLevel);
        row.weight += r.weight;
        row.maxLevel = Math.max(row.maxLevel, r.requiredLevel);
        row.mandatory = row.mandatory || r.mandatory;
        rows.set(key, row);
      }

      const out = [...rows.values()].map((row) => {
        const required = Math.round(row.levels.reduce((s, l) => s + l, 0) / row.levels.length);
        const idSet = new Set(row.ids);
        let atTarget = 0;
        let anyVerified = 0;
        for (const sp of sps) {
          const best = Math.max(0, ...(sp.skills ?? []).filter((s) => idSet.has(String(s.skill))).map((s) => s.verifiedLevel));
          if (best > 0) anyVerified++;
          if (best >= required) atTarget++;
        }
        const total = students.length;
        const shortfall = Math.max(0, total - atTarget);
        return {
          label: row.label,
          kind: row.kind,
          demandDrives: row.drives.size,
          totalWeight: row.weight,
          averageRequiredLevel: required,
          mandatory: row.mandatory,
          studentsInScope: total,
          supplyAtTarget: atTarget,
          supplyAnyVerified: anyVerified,
          coveragePercent: pct(atTarget, total),
          shortfall,
          priority: Math.round(row.weight * shortfall * 10) / 10,
        };
      });
      out.sort((a, b) => b.priority - a.priority || a.label.localeCompare(b.label));
      return { studentsInScope: students.length, drivesConsidered: driveIds.length, rows: out };
    });
  }

  // -------------------------------------------------------------- gap frequency

  async gapFrequency(scope: Scope) {
    return this.cached(`gf:${JSON.stringify(scope)}`, async () => {
      const students = await this.studentIdsInScope(scope);
      const match: Record<string, any> = { student: { $in: students } };
      if (scope.driveId) match.drive = new Types.ObjectId(scope.driveId);
      const rows = await this.gaps.find(match).select('student gaps.label gaps.gap gaps.impact gaps.evidenceState').lean();
      const agg = new Map<string, { label: string; students: Set<string>; gapSum: number; impactSum: number; n: number; states: Record<string, number> }>();
      for (const r of rows) {
        for (const g of r.gaps ?? []) {
          if (!g.gap) continue;
          const a = agg.get(g.label) ?? { label: g.label, students: new Set<string>(), gapSum: 0, impactSum: 0, n: 0, states: {} };
          a.students.add(String(r.student));
          a.gapSum += g.gap;
          a.impactSum += g.impact;
          a.n++;
          a.states[g.evidenceState] = (a.states[g.evidenceState] ?? 0) + 1;
          agg.set(g.label, a);
        }
      }
      const totalStudents = new Set(rows.map((r) => String(r.student))).size;
      return {
        studentsAnalysed: totalStudents,
        rows: [...agg.values()]
          .map((a) => ({ label: a.label, students: a.students.size, percentOfStudents: pct(a.students.size, totalStudents), averageGap: Math.round((10 * a.gapSum) / a.n) / 10, averageImpact: Math.round((10 * a.impactSum) / a.n) / 10, evidenceStates: a.states }))
          .sort((a, b) => b.students - a.students || b.averageImpact - a.averageImpact)
          .slice(0, 25),
      };
    });
  }

  // -------------------------------------------------------------- verification coverage

  async verificationCoverage(scope: Scope) {
    return this.cached(`vc:${JSON.stringify(scope)}`, async () => {
      const students = await this.studentIdsInScope(scope);
      const byStatus = await this.evidence.aggregate([{ $match: { student: { $in: students } } }, { $group: { _id: { t: '$type', s: '$status' }, n: { $sum: 1 } } }]);
      const types: Record<string, Record<string, number>> = {};
      for (const r of byStatus) {
        types[r._id.t] = types[r._id.t] ?? { pending: 0, verified: 0, rejected: 0 };
        types[r._id.t][r._id.s] = r.n;
      }
      const withVerified = (await this.evidence.distinct('student', { student: { $in: students }, status: EvidenceStatus.Verified })).length;
      const withAny = (await this.evidence.distinct('student', { student: { $in: students } })).length;
      const totals = Object.values(types).reduce((a, t) => ({ pending: a.pending + t.pending, verified: a.verified + t.verified, rejected: a.rejected + t.rejected }), { pending: 0, verified: 0, rejected: 0 });
      return {
        students: students.length,
        studentsWithVerifiedEvidence: withVerified,
        studentsWithAnyEvidence: withAny,
        verifiedStudentPercent: pct(withVerified, students.length),
        reviewedPercent: pct(totals.verified + totals.rejected, totals.pending + totals.verified + totals.rejected),
        totals,
        byType: Object.entries(types).map(([type, v]) => ({ type, ...v })),
      };
    });
  }

  // -------------------------------------------------------------- funnel

  /** eligible -> registered -> shortlisted -> selected, per drive. Eligibility is recomputed by the rules engine. */
  async funnel(driveId?: string) {
    return this.cached(`fn:${driveId ?? 'all'}`, async () => {
      const ds = await this.drives.find(driveId ? { _id: driveId } : { status: { $ne: DriveStatus.Draft } }).sort({ deadline: -1 }).limit(25).lean();
      const profiles = await this.profiles.find().lean();
      const rules = await this.rules.find({ drive: { $in: ds.map((d) => d._id) } }).lean();
      const ruleBy = new Map(rules.map((r) => [String(r.drive), r]));
      const regs = await this.registrations.find({ drive: { $in: ds.map((d) => d._id) }, status: { $ne: RegistrationStatus.Withdrawn } }).select('drive status').lean();
      return ds.map((d) => {
        const rule = ruleBy.get(String(d._id));
        const eligible = profiles.filter((p) => evaluateEligibility(p as any, rule as any).eligible).length;
        const mine = regs.filter((r) => String(r.drive) === String(d._id));
        const registered = mine.length;
        const shortlisted = mine.filter((r) => [RegistrationStatus.Shortlisted, RegistrationStatus.Selected].includes(r.status)).length;
        const selected = mine.filter((r) => r.status === RegistrationStatus.Selected).length;
        return {
          drive: { id: String(d._id), company: d.company, role: d.role, status: d.status },
          totalStudents: profiles.length,
          eligible,
          registered,
          shortlisted,
          selected,
          conversion: { eligibleToRegistered: pct(registered, eligible), registeredToShortlisted: pct(shortlisted, registered), shortlistedToSelected: pct(selected, shortlisted) },
        };
      });
    });
  }

  // -------------------------------------------------------------- department comparison & trends

  async departmentComparison(graduationYear?: number) {
    return this.cached(`dep:${graduationYear ?? 'all'}`, async () => {
      const profiles = await this.profiles.find(graduationYear ? { graduationYear } : {}).select('user department graduationYear').lean();
      const scores = await this.latestScores(profiles.map((p) => p.user as Types.ObjectId));
      const verifiedStudents = new Set((await this.evidence.distinct('student', { status: EvidenceStatus.Verified })).map(String));
      const regs = await this.registrations.find({ status: { $ne: RegistrationStatus.Withdrawn } }).select('student status').lean();
      const deptOf = new Map(profiles.map((p) => [String(p.user), p.department || 'Unassigned']));
      const groups = new Map<string, { students: string[]; scores: number[]; registered: number; selected: number }>();
      for (const p of profiles) {
        const d = p.department || 'Unassigned';
        const g = groups.get(d) ?? { students: [], scores: [], registered: 0, selected: 0 };
        g.students.push(String(p.user));
        groups.set(d, g);
      }
      for (const s of scores) groups.get(deptOf.get(s.student) ?? 'Unassigned')?.scores.push(s.score);
      for (const r of regs) {
        const g = groups.get(deptOf.get(String(r.student)) ?? 'Unassigned');
        if (!g) continue;
        g.registered++;
        if (r.status === RegistrationStatus.Selected) g.selected++;
      }
      return [...groups.entries()]
        .map(([department, g]) => ({
          department,
          students: g.students.length,
          averageReadiness: avg(g.scores),
          readyPercent: pct(g.scores.filter((x) => x >= 60).length, g.scores.length),
          verifiedStudentPercent: pct(g.students.filter((s) => verifiedStudents.has(s)).length, g.students.length),
          registrations: g.registered,
          selected: g.selected,
        }))
        .sort((a, b) => (b.averageReadiness ?? 0) - (a.averageReadiness ?? 0));
    });
  }

  async batchComparison() {
    return this.cached('batch', async () => {
      const profiles = await this.profiles.find().select('user graduationYear').lean();
      const scores = await this.latestScores(profiles.map((p) => p.user as Types.ObjectId));
      const yearOf = new Map(profiles.map((p) => [String(p.user), p.graduationYear ?? 0]));
      const groups = new Map<number, number[]>();
      for (const p of profiles) groups.set(p.graduationYear ?? 0, groups.get(p.graduationYear ?? 0) ?? []);
      for (const s of scores) groups.get(yearOf.get(s.student) ?? 0)?.push(s.score);
      return [...groups.entries()].map(([year, xs]) => ({ graduationYear: year || null, students: profiles.filter((p) => (p.graduationYear ?? 0) === year).length, averageReadiness: avg(xs) })).sort((a, b) => (a.graduationYear ?? 0) - (b.graduationYear ?? 0));
    });
  }

  /** Weekly average readiness of all computed snapshots (trend). */
  async readinessTrend(weeks = 12) {
    return this.cached(`trend:${weeks}`, async () => {
      const since = new Date(Date.now() - weeks * 7 * 86_400_000);
      const rows = await this.snapshots.find({ computedAt: { $gte: since } }).select('score computedAt').lean();
      const buckets = new Map<string, number[]>();
      for (const r of rows) {
        const d = new Date(r.computedAt);
        d.setUTCHours(0, 0, 0, 0);
        d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // Monday
        const k = d.toISOString().slice(0, 10);
        buckets.set(k, [...(buckets.get(k) ?? []), r.score]);
      }
      return [...buckets.entries()].sort().map(([week, xs]) => ({ week, averageReadiness: avg(xs), snapshots: xs.length }));
    });
  }

  // -------------------------------------------------------------- training effectiveness

  /**
   * Observational comparison (NOT causal): readiness change from before a student's plan was created to now,
   * grouped by how much of the plan the student completed; plus assessment improvement between first and best attempt.
   */
  async trainingEffectiveness() {
    return this.cached('train', async () => {
      const plans = await this.plans.find().lean();
      const taskAgg = await this.tasks.aggregate([{ $group: { _id: { p: '$plan', s: '$status' }, n: { $sum: 1 } } }]);
      const done = new Map<string, { done: number; total: number }>();
      for (const t of taskAgg) {
        const cur = done.get(String(t._id.p)) ?? { done: 0, total: 0 };
        cur.total += t.n;
        if (t._id.s === 'done') cur.done += t.n;
        done.set(String(t._id.p), cur);
      }
      const snaps = await this.snapshots.find({ student: { $in: plans.map((p) => p.student) } }).sort({ computedAt: 1 }).select('student drive score computedAt').lean();
      const byKey = new Map<string, Array<{ score: number; at: Date }>>();
      for (const s of snaps) byKey.set(`${s.student}:${s.drive}`, [...(byKey.get(`${s.student}:${s.drive}`) ?? []), { score: s.score, at: s.computedAt }]);

      const bands: Record<string, number[]> = { 'Not started (0-25%)': [], 'Partial (26-75%)': [], 'Mostly done (76-100%)': [] };
      for (const p of plans) {
        const prog = done.get(String(p._id));
        const series = byKey.get(`${p.student}:${p.drive}`);
        if (!prog || !prog.total || !series || series.length < 2) continue;
        const before = [...series].reverse().find((x) => x.at <= (p as any).createdAt) ?? series[0];
        const latest = series[series.length - 1];
        const percent = (100 * prog.done) / prog.total;
        const band = percent <= 25 ? 'Not started (0-25%)' : percent <= 75 ? 'Partial (26-75%)' : 'Mostly done (76-100%)';
        bands[band].push(Math.round((latest.score - before.score) * 10) / 10);
      }

      const attempts = await this.attempts.find().sort({ submittedAt: 1 }).select('student assessment percent').lean();
      const per = new Map<string, number[]>();
      for (const a of attempts) per.set(`${a.assessment}:${a.student}`, [...(per.get(`${a.assessment}:${a.student}`) ?? []), a.percent]);
      const imp = new Map<string, number[]>();
      for (const [k, xs] of per) {
        if (xs.length < 2) continue;
        const aid = k.split(':')[0];
        imp.set(aid, [...(imp.get(aid) ?? []), Math.max(...xs) - xs[0]]);
      }
      const titles = new Map((await this.assessments.find({ _id: { $in: [...imp.keys()] } }).select('title').lean()).map((a) => [String(a._id), a.title]));

      return {
        note: 'Observational data: students who complete more of their plan may differ in motivation. These figures show association, not proven training impact.',
        planCompletionVsReadinessChange: Object.entries(bands).map(([band, xs]) => ({ band, students: xs.length, averageReadinessChange: avg(xs) })),
        assessmentImprovement: [...imp.entries()].map(([id, xs]) => ({ assessment: titles.get(id) ?? id, studentsWithRetakes: xs.length, averageImprovementPoints: avg(xs) })),
      };
    });
  }

  // -------------------------------------------------------------- dashboards

  async officerOverview() {
    return this.cached('officer', async () => {
      const [totalStudents, drivesByStatus, regs, dist, verification, lastBatch, sd] = await Promise.all([
        this.profiles.countDocuments(),
        this.drives.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
        this.registrations.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
        this.readinessDistribution({}),
        this.verificationCoverage({}),
        this.batches.findOne().sort({ createdAt: -1 }).lean(),
        this.supplyDemand({}),
      ]);
      const funnel = await this.funnel();
      const published = funnel.filter((f) => f.drive.status === DriveStatus.Published);
      return {
        totalStudents,
        drives: Object.fromEntries(drivesByStatus.map((d) => [d._id, d.n])),
        registrations: Object.fromEntries(regs.map((r) => [r._id, r.n])),
        eligibility: published.map((f) => ({ drive: f.drive, eligible: f.eligible, ineligible: f.totalStudents - f.eligible, registered: f.registered })),
        readinessDistribution: dist,
        verification: { verifiedStudentPercent: verification.verifiedStudentPercent, reviewedPercent: verification.reviewedPercent, pending: verification.totals.pending },
        latestBatch: lastBatch,
        topSkillShortfalls: sd.rows.slice(0, 5),
        funnel: funnel.slice(0, 6),
      };
    });
  }

  async adminOverview() {
    const [byRole, recentAudit, activeUsers] = await Promise.all([
      this.users.aggregate([{ $group: { _id: '$role', n: { $sum: 1 } } }]),
      this.auditLogs.countDocuments({ createdAt: { $gte: new Date(Date.now() - 86_400_000) } }),
      this.users.countDocuments({ active: true }),
    ]);
    const tax = await this.skills.taxonomy();
    return {
      usersByRole: Object.fromEntries(byRole.map((r) => [r._id, r.n])),
      activeUsers,
      auditEventsLast24h: recentAudit,
      skills: tax.skills.length,
      clusters: tax.clusters.length,
      roles: Object.values(Role),
    };
  }
}
