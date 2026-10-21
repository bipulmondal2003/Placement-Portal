import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ timestamps: true })
export class PreparationPlan {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true })
  student: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'PlacementDrive', required: true, index: true })
  drive: Types.ObjectId;

  @Prop({ required: true }) startDate: Date;
  @Prop({ required: true }) endDate: Date;
  @Prop({ default: 2 }) hoursPerDay: number;

  /** `rule_based` plans are generated deterministically from the gap list; `ai` plans come from Gemini. */
  @Prop({ required: true, enum: ['rule_based', 'ai'], default: 'rule_based' })
  source: string;

  @Prop({ trim: true, maxlength: 3000 })
  summary?: string;

  @Prop({ default: 'active', enum: ['active', 'completed', 'archived'], index: true })
  status: string;

  /** Hash of the gap analysis the plan was based on (shows when a plan is stale). */
  @Prop() basedOnInputsHash?: string;
}
export type PreparationPlanDocument = HydratedDocument<PreparationPlan>;
export const PreparationPlanSchema = SchemaFactory.createForClass(PreparationPlan);
PreparationPlanSchema.index({ student: 1, drive: 1, status: 1 });

@Schema({ timestamps: true })
export class PreparationTask {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'PreparationPlan', required: true, index: true })
  plan: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true })
  student: Types.ObjectId;

  @Prop({ required: true }) dayIndex: number;
  @Prop({ required: true, index: true }) date: Date;

  @Prop({ required: true, trim: true, maxlength: 200 }) title: string;
  @Prop({ trim: true, maxlength: 1000 }) objective?: string;
  @Prop({ trim: true, maxlength: 1500 }) activity?: string;
  @Prop({ trim: true, maxlength: 1500 }) exercise?: string;
  @Prop({ trim: true, maxlength: 1000 }) expectedOutcome?: string;
  @Prop({ required: true, min: 5, max: 600 }) estimatedMinutes: number;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Skill' }) skill?: Types.ObjectId;

  /** Checkpoint tasks mark weekly re-verification points (e.g. take assessment, upload evidence). */
  @Prop({ default: false }) checkpoint: boolean;

  @Prop({ enum: ['todo', 'in_progress', 'done'], default: 'todo', index: true })
  status: string;

  @Prop() completedAt?: Date;
}
export type PreparationTaskDocument = HydratedDocument<PreparationTask>;
export const PreparationTaskSchema = SchemaFactory.createForClass(PreparationTask);
PreparationTaskSchema.index({ student: 1, date: 1 });
