import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ _id: false })
export class SkillLevelEntry {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Skill', required: true }) skill: Types.ObjectId;
  /** Level the student explicitly declared for themselves (never used for readiness scoring). */
  @Prop({ default: 0 }) declaredLevel: number;
  /** max(declaredLevel, claims on non-rejected evidence). Display only; unverified. */
  @Prop({ default: 0 }) selfReportedLevel: number;
  /** Highest level awarded from VERIFIED evidence. 0 if none. */
  @Prop({ default: 0 }) verifiedLevel: number;
  /** Distinct verified evidence types contributing to this skill. */
  @Prop({ type: [String], default: [] }) verifiedEvidenceTypes: string[];
  @Prop({ default: 0 }) verifiedEvidenceCount: number;
  @Prop({ default: 0 }) pendingEvidenceCount: number;
  @Prop({ default: 0 }) rejectedEvidenceCount: number;
  /** 0..1 strength from evidence-type weights; see docs/readiness-model.md. */
  @Prop({ default: 0 }) evidenceStrength: number;
  @Prop() lastVerifiedAt?: Date;
}
export const SkillLevelEntrySchema = SchemaFactory.createForClass(SkillLevelEntry);

/** Materialised view aggregated from evidence. Self-reported and verified are kept separate. */
@Schema({ timestamps: true })
export class SkillProfile {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, unique: true })
  student: Types.ObjectId;

  @Prop({ type: [SkillLevelEntrySchema], default: [] })
  skills: SkillLevelEntry[];

  /** Project depth (0..1) from verified project evidence. */
  @Prop({ default: 0 }) projectDepth: number;

  /** Hash of inputs (evidence state); lets repeated rebuilds be no-ops. */
  @Prop() inputsHash?: string;

  /** Monotonic version bumped on each meaningful change; part of readiness input hash. */
  @Prop({ default: 0 }) version: number;
}
export type SkillProfileDocument = HydratedDocument<SkillProfile>;
export const SkillProfileSchema = SchemaFactory.createForClass(SkillProfile);

@Schema({ _id: false })
export class DimensionScores {
  @Prop({ type: Number, default: null }) technical: number | null;
  @Prop({ type: Number, default: null }) aptitude: number | null;
  @Prop({ type: Number, default: null }) communication: number | null;
  @Prop({ type: Number, default: null }) projectDepth: number | null;
}
export const DimensionScoresSchema = SchemaFactory.createForClass(DimensionScores);

@Schema({ timestamps: { createdAt: 'computedAt', updatedAt: false } })
export class ReadinessSnapshot {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true })
  student: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'PlacementDrive', required: true, index: true })
  drive: Types.ObjectId;

  /** Normalised readiness 0..100. Independent from eligibility. */
  @Prop({ required: true, min: 0, max: 100 })
  score: number;

  @Prop({ type: DimensionScoresSchema, required: true })
  dimensions: DimensionScores;

  @Prop({ type: [String], default: [] })
  explanation: string[];

  /** Deterministic hash of every input; identical hash => identical result, so no duplicate snapshot. */
  @Prop({ required: true })
  inputsHash: string;

  @Prop({ default: 1 })
  configVersion: number;

  @Prop({ default: 'on_demand', enum: ['on_demand', 'evidence_change', 'batch', 'seed'] })
  trigger: string;

  computedAt: Date;
}
export type ReadinessSnapshotDocument = HydratedDocument<ReadinessSnapshot>;
export const ReadinessSnapshotSchema = SchemaFactory.createForClass(ReadinessSnapshot);
ReadinessSnapshotSchema.index({ student: 1, drive: 1, computedAt: -1 });
ReadinessSnapshotSchema.index({ student: 1, drive: 1, inputsHash: 1 });

@Schema({ _id: false })
export class GapItem {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Skill' }) skill?: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'SkillCluster' }) cluster?: Types.ObjectId;
  @Prop({ required: true }) label: string;
  @Prop({ required: true }) kind: string;
  @Prop() dimension: string;
  @Prop({ required: true }) requiredLevel: number;
  @Prop({ required: true }) verifiedLevel: number;
  @Prop({ default: 0 }) selfReportedLevel: number;
  /** The specific skill that satisfied (or best matched) a cluster requirement. */
  @Prop() matchedVia?: string;
  @Prop({ required: true }) gap: number;
  @Prop({ required: true }) weight: number;
  @Prop({ default: false }) mandatory: boolean;
  /** weight * gap; the ordering key. */
  @Prop({ required: true }) impact: number;
  @Prop({ required: true, enum: ['met', 'no_evidence', 'unverified_claim', 'pending_review', 'below_target', 'weak_evidence'] })
  evidenceState: string;
  @Prop() action: string;
}
export const GapItemSchema = SchemaFactory.createForClass(GapItem);

/** Latest ranked gap list for a student+drive (upserted). History lives in ReadinessSnapshot. */
@Schema({ timestamps: true })
export class GapAnalysis {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  student: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'PlacementDrive', required: true })
  drive: Types.ObjectId;

  @Prop({ type: [GapItemSchema], default: [] })
  gaps: GapItem[];

  @Prop({ type: [String], default: [] })
  nextActions: string[];

  @Prop({ type: SchemaTypes.ObjectId, ref: 'ReadinessSnapshot' })
  snapshot?: Types.ObjectId;

  @Prop() inputsHash: string;
}
export type GapAnalysisDocument = HydratedDocument<GapAnalysis>;
export const GapAnalysisSchema = SchemaFactory.createForClass(GapAnalysis);
GapAnalysisSchema.index({ student: 1, drive: 1 }, { unique: true });
