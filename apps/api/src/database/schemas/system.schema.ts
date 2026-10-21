import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ timestamps: true })
export class BatchJob {
  @Prop({ required: true, default: 'batch_readiness' })
  type: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  requestedBy: Types.ObjectId;

  /** Scope of the batch. Empty drives = all published drives. */
  @Prop({ type: Object, default: {} })
  scope: { driveIds?: string[]; department?: string; graduationYear?: number };

  @Prop({ enum: ['queued', 'active', 'completed', 'failed', 'partial'], default: 'queued', index: true })
  status: string;

  @Prop({ default: 0 }) total: number;
  @Prop({ default: 0 }) processed: number;
  @Prop({ default: 0 }) failed: number;
  @Prop({ default: 0 }) skippedUnchanged: number;
  @Prop({ type: [String], default: [] }) errorLog: string[];

  /** Prevents duplicate concurrent batches for the same scope. */
  @Prop() dedupeKey?: string;
  @Prop() bullJobId?: string;
  @Prop() startedAt?: Date;
  @Prop() finishedAt?: Date;
}
export type BatchJobDocument = HydratedDocument<BatchJob>;
export const BatchJobSchema = SchemaFactory.createForClass(BatchJob);
BatchJobSchema.index({ createdAt: -1 });
// At most one queued/active batch per scope: prevents duplicate concurrent batches even under races.
BatchJobSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['queued', 'active'] } } });

/** Singleton configuration document (key = "main"). Editable by administrators. */
@Schema({ timestamps: true })
export class SystemConfig {
  @Prop({ required: true, unique: true, default: 'main' })
  key: string;

  /** Bumped on every change; included in readiness input hashes. */
  @Prop({ default: 1 }) version: number;

  @Prop({
    type: Object,
    default: { technical: 0.6, aptitude: 0.15, communication: 0.15, projectDepth: 0.1 },
  })
  dimensionWeights: Record<string, number>;

  /** How much each verified evidence type contributes to a skill's evidence strength (cap 1.0). */
  @Prop({
    type: Object,
    default: { assessment: 0.5, project: 0.4, mock_interview: 0.35, academic: 0.3, certification: 0.25, external: 0.2 },
  })
  evidenceWeights: Record<string, number>;

  /** Skill credit = coverage * (floor + (1-floor) * evidenceStrength). */
  @Prop({ default: 0.8, min: 0, max: 1 }) evidenceFloor: number;

  /** Verified project level that earns full project-depth credit. */
  @Prop({ default: 4 }) projectDepthTargetLevel: number;

  /** Assessment percent thresholds that map to levels 1..5. */
  @Prop({ type: [Number], default: [30, 50, 70, 85, 95] })
  assessmentLevelThresholds: number[];

  @Prop({ default: true }) assessmentAutoVerify: boolean;
  @Prop({ default: true }) mockInterviewAutoVerify: boolean;
  @Prop({ default: true }) registrationOpenForStudents: boolean;
  @Prop({ default: true }) aiFeaturesEnabled: boolean;
}
export type SystemConfigDocument = HydratedDocument<SystemConfig>;
export const SystemConfigSchema = SchemaFactory.createForClass(SystemConfig);
