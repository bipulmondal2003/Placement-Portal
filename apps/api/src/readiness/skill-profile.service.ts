import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EvidenceItem, EvidenceItemDocument } from '../database/schemas/evidence.schema';
import { SkillProfile, SkillProfileDocument } from '../database/schemas/readiness.schema';
import { SystemConfigService } from '../system-config/system-config.service';
import { buildSkillProfile, BuiltProfile, EvidenceLite } from './profile.builder';
import { SkillState } from './readiness.engine';

export interface StudentSkillView {
  studentId: string;
  states: Map<string, SkillState>;
  projectDepth: number;
  changed: boolean;
}

@Injectable()
export class SkillProfileService {
  constructor(
    @InjectModel(EvidenceItem.name) private readonly evidence: Model<EvidenceItemDocument>,
    @InjectModel(SkillProfile.name) private readonly profiles: Model<SkillProfileDocument>,
    private readonly sysConfig: SystemConfigService,
  ) {}

  private toState(e: BuiltProfile['entries'][number]): SkillState {
    return {
      skillId: e.skillId,
      declaredLevel: e.declaredLevel,
      selfReportedLevel: e.selfReportedLevel,
      verifiedLevel: e.verifiedLevel,
      evidenceStrength: e.evidenceStrength,
      verifiedEvidenceCount: e.verifiedEvidenceCount,
      pendingEvidenceCount: e.pendingEvidenceCount,
    };
  }

  /**
   * Rebuilds skill profiles from evidence for many students at once (used by both the single-student
   * path and the 5,000-student batch path). Idempotent: unchanged profiles are not rewritten.
   */
  async rebuildMany(studentIds: string[]): Promise<Map<string, StudentSkillView>> {
    const out = new Map<string, StudentSkillView>();
    if (!studentIds.length) return out;
    const cfg = await this.sysConfig.get();
    const ids = studentIds.map((s) => new Types.ObjectId(s));

    const [evidenceRows, existing] = await Promise.all([
      this.evidence.find({ student: { $in: ids } }).select('student type status verifiedAt skills').lean(),
      this.profiles.find({ student: { $in: ids } }).lean(),
    ]);

    const evByStudent = new Map<string, EvidenceLite[]>();
    for (const e of evidenceRows) {
      const key = String(e.student);
      const list = evByStudent.get(key) ?? [];
      list.push({
        id: String(e._id),
        type: e.type,
        status: e.status as EvidenceLite['status'],
        verifiedAt: e.verifiedAt ?? null,
        skills: (e.skills ?? []).map((s: any) => ({ skillId: String(s.skill), claimedLevel: s.claimedLevel, awardedLevel: s.awardedLevel })),
      });
      evByStudent.set(key, list);
    }
    const existingBy = new Map(existing.map((p) => [String(p.student), p]));

    const ops: any[] = [];
    for (const sid of studentIds) {
      const prev = existingBy.get(sid);
      const declared = new Map<string, number>();
      for (const s of prev?.skills ?? []) if (s.declaredLevel > 0) declared.set(String(s.skill), s.declaredLevel);

      const built = buildSkillProfile(evByStudent.get(sid) ?? [], declared, {
        evidenceWeights: cfg.evidenceWeights,
        projectDepthTargetLevel: cfg.projectDepthTargetLevel,
      });
      const changed = !prev || prev.inputsHash !== built.inputsHash;
      if (changed) {
        const skills = built.entries.map((e) => ({ ...e, skill: new Types.ObjectId(e.skillId), skillId: undefined }));
        ops.push({
          updateOne: {
            filter: { student: new Types.ObjectId(sid) },
            update: {
              $set: { skills, projectDepth: built.projectDepth, inputsHash: built.inputsHash },
              $inc: { version: 1 },
            },
            upsert: true,
          },
        });
      }
      out.set(sid, {
        studentId: sid,
        states: new Map(built.entries.map((e) => [e.skillId, this.toState(e)])),
        projectDepth: built.projectDepth,
        changed,
      });
    }
    if (ops.length) await this.profiles.bulkWrite(ops, { ordered: false });
    return out;
  }

  async rebuild(studentId: string): Promise<StudentSkillView> {
    return (await this.rebuildMany([studentId])).get(studentId)!;
  }

  /** Student self-rating. Stored separately from verified proficiency and never used for scoring. */
  async setDeclaredLevel(studentId: string, skillId: string, level: number): Promise<void> {
    const sid = new Types.ObjectId(studentId);
    const kid = new Types.ObjectId(skillId);
    await this.profiles.updateOne({ student: sid }, { $setOnInsert: { skills: [] } }, { upsert: true });
    const res = await this.profiles.updateOne({ student: sid, 'skills.skill': kid }, { $set: { 'skills.$.declaredLevel': level } });
    if (!res.matchedCount) {
      await this.profiles.updateOne(
        { student: sid },
        { $push: { skills: { skill: kid, declaredLevel: level, selfReportedLevel: level } } },
      );
    }
    await this.rebuild(studentId);
  }
}
