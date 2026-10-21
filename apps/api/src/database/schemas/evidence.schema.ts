import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { EvidenceSource, EvidenceStatus, EvidenceType } from '../../common/constants';

@Schema({ _id: false })
export class SkillClaim {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Skill', required: true })
  skill: Types.ObjectId;

  /** Level the student claims this evidence demonstrates (1..5). */
  @Prop({ required: true, min: 1, max: 5 })
  claimedLevel: number;

  /** Level actually awarded by a reviewer / objective scoring. Only set once verified. */
  @Prop({ min: 0, max: 5 })
  awardedLevel?: number;
}
export const SkillClaimSchema = SchemaFactory.createForClass(SkillClaim);

@Schema({ timestamps: true })
export class EvidenceItem {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true })
  student: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(EvidenceType), index: true })
  type: EvidenceType;

  @Prop({ required: true, trim: true, maxlength: 200 })
  title: string;

  @Prop({ trim: true, maxlength: 4000 })
  description?: string;

  @Prop({ trim: true, maxlength: 500 })
  url?: string;

  @Prop({ type: [SkillClaimSchema], default: [] })
  skills: SkillClaim[];

  @Prop({ enum: Object.values(EvidenceSource), default: EvidenceSource.Manual })
  source: EvidenceSource;

  @Prop({ enum: Object.values(EvidenceStatus), default: EvidenceStatus.Pending, index: true })
  status: EvidenceStatus;

  /** Free-form structured payload, e.g. { cgpa, semester } for academic or { attemptId } for assessments. */
  @Prop({ type: Object })
  meta?: Record<string, any>;

  @Prop()
  verifiedAt?: Date;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  verifiedBy?: Types.ObjectId;
}
export type EvidenceItemDocument = HydratedDocument<EvidenceItem>;
export const EvidenceItemSchema = SchemaFactory.createForClass(EvidenceItem);
EvidenceItemSchema.index({ student: 1, status: 1, type: 1 });
EvidenceItemSchema.index({ status: 1, createdAt: -1 });

/** Immutable verification history: one row per review decision. */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Verification {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'EvidenceItem', required: true, index: true })
  evidence: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true })
  student: Types.ObjectId;

  /** Null for system verification (objective assessment scoring). */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  reviewer?: Types.ObjectId;

  @Prop({ required: true, enum: ['approved', 'rejected', 'system_approved'] })
  decision: string;

  @Prop({ trim: true, maxlength: 2000 })
  comment?: string;

  @Prop({ type: [SkillClaimSchema], default: [] })
  awarded: SkillClaim[];
}
export type VerificationDocument = HydratedDocument<Verification>;
export const VerificationSchema = SchemaFactory.createForClass(Verification);
