import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/** One expected skill of a target job role (same shape as a drive requirement). */
@Schema()
export class RoleRequirement {
  /** `skill` requires a specific skill; `cluster` accepts any skill in the cluster. */
  @Prop({ required: true, enum: ['skill', 'cluster'], default: 'skill' })
  kind: 'skill' | 'cluster';

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Skill' })
  skill?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'SkillCluster' })
  cluster?: Types.ObjectId;

  @Prop({ required: true, min: 1, max: 5 })
  requiredLevel: number;

  /** Importance weight 1..10. */
  @Prop({ required: true, min: 1, max: 10, default: 5 })
  weight: number;

  @Prop({ default: false })
  mandatory: boolean;
}
export const RoleRequirementSchema = SchemaFactory.createForClass(RoleRequirement);

/**
 * A reusable target job role (for example "Full-Stack Web Developer"). Students compare their verified
 * skills against it without needing a placement drive. Evaluated by the same deterministic readiness engine.
 */
@Schema({ timestamps: true })
export class RoleProfile {
  @Prop({ required: true, unique: true, trim: true, lowercase: true })
  slug: string;

  @Prop({ required: true, trim: true, maxlength: 120 })
  title: string;

  /** Taxonomy role family: software-development | data | testing. */
  @Prop({ required: true, trim: true, index: true })
  family: string;

  @Prop({ trim: true, maxlength: 1000 })
  summary?: string;

  @Prop({ default: true, index: true })
  active: boolean;

  @Prop({ type: [RoleRequirementSchema], default: [] })
  requirements: RoleRequirement[];
}
export type RoleProfileDocument = HydratedDocument<RoleProfile>;
export const RoleProfileSchema = SchemaFactory.createForClass(RoleProfile);
