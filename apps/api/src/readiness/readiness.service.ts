import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DriveStatus } from '../common/constants';
import { PlacementDrive, PlacementDriveDocument, DriveRequirement, DriveRequirementDocument } from '../database/schemas/drive.schema';
import { Skill, SkillDocument, SkillCluster, SkillClusterDocument } from '../database/schemas/skill.schema';
import {
  GapAnalysis,
  GapAnalysisDocument,
  ReadinessSnapshot,
  ReadinessSnapshotDocument,
} from '../database/schemas/readiness.schema';
import { SystemConfigService } from '../system-config/system-config.service';
import { SkillProfileService } from './skill-profile.service';
import { latestSnapshotRows } from './latest-snapshots';
import { computeReadiness, Dimension, ReadinessResult, RequirementInput } from './readiness.engine';

export type Trigger = 'on_demand' | 'evidence_change' | 'batch' | 'seed';

export interface DriveContext {
  driveId: string;
  company: string;
  role: string;
  dimensionWeights?: Record<string, number> | null;
  requirements: RequirementInput[];
  skillIds: Set<string>;
}

export interface ComputeStats {
  computed: number;
  skippedUnchanged: number;
  failed: number;
  errors: string[];
}

export interface StudentDriveReadiness {
  studentId: string;
  driveId: string;
  result: ReadinessResult;
  persisted: boolean;
}

@Injectable()
export class ReadinessService {
  constructor(
    @InjectModel(PlacementDrive.name) private readonly drives: Model<PlacementDriveDocument>,
    @InjectModel(DriveRequirement.name) private readonly reqs: Model<DriveRequirementDocument>,
    @InjectModel(Skill.name) private readonly skills: Model<SkillDocument>,
    @InjectModel(SkillCluster.name) private readonly clusters: Model<SkillClusterDocument>,
    @InjectModel(ReadinessSnapshot.name) private readonly snapshots: Model<ReadinessSnapshotDocument>,
    @InjectModel(GapAnalysis.name) private readonly gapAnalyses: Model<GapAnalysisDocument>,
    private readonly profile: SkillProfileService,
    private readonly sysConfig: SystemConfigService,
  ) {}

  /** Loads drives with their requirements resolved (including taxonomy expansion of cluster requirements). */
  async loadDriveContexts(driveIds?: string[], statuses: DriveStatus[] = [DriveStatus.Published]): Promise<DriveContext[]> {
    const filter: Record<string, any> = driveIds ? { _id: { $in: driveIds.map((d) => new Types.ObjectId(d)) } } : { status: { $in: statuses } };
    const drives = await this.drives.find(filter).lean();
    if (!drives.length) return [];
    const reqRows = await this.reqs.find({ drive: { $in: drives.map((d) => d._id) } }).lean();

    const skillIds = new Set<string>();
    const clusterIds = new Set<string>();
    for (const r of reqRows) {
      if (r.skill) skillIds.add(String(r.skill));
      if (r.cluster) clusterIds.add(String(r.cluster));
    }
    const [clusterRows, memberRows, directRows] = await Promise.all([
      this.clusters.find({ _id: { $in: [...clusterIds] } }).lean(),
      this.skills.find({ cluster: { $in: [...clusterIds] }, active: true }).select('name dimension cluster').lean(),
      this.skills.find({ _id: { $in: [...skillIds] } }).select('name dimension').lean(),
    ]);
    const clusterName = new Map(clusterRows.map((c) => [String(c._id), c.name]));
    const skillInfo = new Map(directRows.map((s) => [String(s._id), s]));
    const members = new Map<string, Array<{ id: string; name: string; dimension: Dimension }>>();
    for (const m of memberRows) {
      const key = String(m.cluster);
      const list = members.get(key) ?? [];
      list.push({ id: String(m._id), name: m.name, dimension: m.dimension as Dimension });
      members.set(key, list);
    }

    return drives.map((d) => {
      const requirements: RequirementInput[] = [];
      const relevant = new Set<string>();
      for (const r of reqRows.filter((x) => String(x.drive) === String(d._id))) {
        if (r.kind === 'cluster' && r.cluster) {
          const mem = members.get(String(r.cluster)) ?? [];
          mem.forEach((m) => relevant.add(m.id));
          const dims = mem.map((m) => m.dimension);
          const dimension = (dims.sort((a, b) => dims.filter((x) => x === b).length - dims.filter((x) => x === a).length)[0] ?? 'technical') as Dimension;
          requirements.push({
            key: String(r._id),
            kind: 'cluster',
            label: clusterName.get(String(r.cluster)) ?? 'Skill cluster',
            clusterId: String(r.cluster),
            memberSkills: mem.map((m) => ({ id: m.id, name: m.name })),
            requiredLevel: r.requiredLevel,
            weight: r.weight,
            mandatory: r.mandatory,
            dimension,
          });
        } else if (r.skill) {
          const info = skillInfo.get(String(r.skill));
          if (!info) continue;
          relevant.add(String(r.skill));
          requirements.push({
            key: String(r._id),
            kind: 'skill',
            label: info.name,
            skillId: String(r.skill),
            requiredLevel: r.requiredLevel,
            weight: r.weight,
            mandatory: r.mandatory,
            dimension: info.dimension as Dimension,
          });
        }
      }
      return {
        driveId: String(d._id),
        company: d.company,
        role: d.role,
        dimensionWeights: (d.dimensionWeights as any) ?? null,
        requirements,
        skillIds: relevant,
      };
    });
  }

  /** Published drives whose requirements touch any of the given skills (used for evidence-triggered recalculation). */
  async relevantDriveIds(skillIds?: string[]): Promise<string[]> {
    const contexts = await this.loadDriveContexts();
    if (!skillIds?.length) return contexts.map((c) => c.driveId);
    return contexts.filter((c) => skillIds.some((s) => c.skillIds.has(s))).map((c) => c.driveId);
  }

  /**
   * Core compute-and-persist. Safe to repeat:
   *  - snapshot is written only when the inputs hash differs from the student's latest snapshot for that drive;
   *  - the ranked GapAnalysis is an upsert keyed by (student, drive).
   */
  async computeMany(studentIds: string[], contexts: DriveContext[], trigger: Trigger): Promise<{ stats: ComputeStats; results: StudentDriveReadiness[] }> {
    const stats: ComputeStats = { computed: 0, skippedUnchanged: 0, failed: 0, errors: [] };
    const results: StudentDriveReadiness[] = [];
    if (!studentIds.length || !contexts.length) return { stats, results };

    const cfg = await this.sysConfig.get();
    const engineCfg = { dimensionWeights: cfg.dimensionWeights, evidenceFloor: cfg.evidenceFloor, configVersion: cfg.version };
    const views = await this.profile.rebuildMany(studentIds);

    const latest = await latestSnapshotRows(
      this.snapshots,
      { student: { $in: studentIds.map((s) => new Types.ObjectId(s)) }, drive: { $in: contexts.map((c) => new Types.ObjectId(c.driveId)) } },
      'student drive inputsHash computedAt',
    );
    const latestHash = new Map(latest.map((l) => [`${l.student}:${l.drive}`, l.inputsHash as string]));

    const snapshotDocs: any[] = [];
    const gapOps: any[] = [];
    const pendingGap: Array<{ student: string; drive: string; result: ReadinessResult }> = [];

    for (const sid of studentIds) {
      const view = views.get(sid)!;
      for (const ctx of contexts) {
        try {
          const result = computeReadiness(ctx.requirements, view.states, view.projectDepth, engineCfg, ctx.dimensionWeights);
          const unchanged = latestHash.get(`${sid}:${ctx.driveId}`) === result.inputsHash;
          if (unchanged) {
            stats.skippedUnchanged++;
            results.push({ studentId: sid, driveId: ctx.driveId, result, persisted: false });
            continue;
          }
          snapshotDocs.push({
            student: new Types.ObjectId(sid),
            drive: new Types.ObjectId(ctx.driveId),
            score: result.score,
            dimensions: result.dimensions,
            explanation: result.explanation,
            inputsHash: result.inputsHash,
            configVersion: cfg.version,
            trigger,
          });
          pendingGap.push({ student: sid, drive: ctx.driveId, result });
          stats.computed++;
          results.push({ studentId: sid, driveId: ctx.driveId, result, persisted: true });
        } catch (err) {
          stats.failed++;
          if (stats.errors.length < 20) stats.errors.push(`${sid}/${ctx.driveId}: ${(err as Error).message}`);
        }
      }
    }

    if (snapshotDocs.length) {
      const inserted = await this.snapshots.insertMany(snapshotDocs, { ordered: false });
      inserted.forEach((snap, i) => {
        const g = pendingGap[i];
        gapOps.push({
          updateOne: {
            filter: { student: new Types.ObjectId(g.student), drive: new Types.ObjectId(g.drive) },
            update: {
              $set: {
                gaps: g.result.gaps.map((x) => ({
                  skill: x.skillId ? new Types.ObjectId(x.skillId) : undefined,
                  cluster: x.clusterId ? new Types.ObjectId(x.clusterId) : undefined,
                  label: x.label,
                  kind: x.kind,
                  dimension: x.dimension,
                  requiredLevel: x.requiredLevel,
                  verifiedLevel: x.verifiedLevel,
                  selfReportedLevel: x.selfReportedLevel,
                  matchedVia: x.matchedVia,
                  gap: x.gap,
                  weight: x.weight,
                  mandatory: x.mandatory,
                  impact: x.impact,
                  evidenceState: x.evidenceState,
                  action: x.action,
                })),
                nextActions: g.result.nextActions,
                snapshot: snap._id,
                inputsHash: g.result.inputsHash,
              },
            },
            upsert: true,
          },
        });
      });
      await this.gapAnalyses.bulkWrite(gapOps, { ordered: false });
    }
    return { stats, results };
  }

  /** Single student x drive (student-facing and officer-facing views). */
  async computeOne(studentId: string, driveId: string, trigger: Trigger = 'on_demand'): Promise<StudentDriveReadiness> {
    const contexts = await this.loadDriveContexts([driveId], Object.values(DriveStatus));
    if (!contexts.length) throw new NotFoundException('Drive not found');
    const { results } = await this.computeMany([studentId], contexts, trigger);
    const r = results[0];
    if (!r) throw new NotFoundException('Unable to compute readiness');
    return r;
  }

  /** Recompute a student's readiness for every relevant published drive (evidence-triggered). */
  async recomputeForStudent(studentId: string, skillIds?: string[], trigger: Trigger = 'evidence_change'): Promise<ComputeStats> {
    const driveIds = await this.relevantDriveIds(skillIds);
    // Even if no drive matches, make sure the skill profile itself is refreshed.
    if (!driveIds.length) {
      await this.profile.rebuild(studentId);
      return { computed: 0, skippedUnchanged: 0, failed: 0, errors: [] };
    }
    const contexts = await this.loadDriveContexts(driveIds, Object.values(DriveStatus));
    const { stats } = await this.computeMany([studentId], contexts, trigger);
    return stats;
  }

  async latestSnapshots(studentId: string) {
    const rows = await latestSnapshotRows(this.snapshots, { student: new Types.ObjectId(studentId) }, '');
    return rows.map((snapshot) => ({ _id: snapshot.drive, snapshot }));
  }

  async history(studentId: string, driveId: string, limit = 30) {
    return this.snapshots
      .find({ student: studentId, drive: driveId })
      .sort({ computedAt: -1 })
      .limit(limit)
      .select('score dimensions computedAt trigger')
      .lean();
  }
}
