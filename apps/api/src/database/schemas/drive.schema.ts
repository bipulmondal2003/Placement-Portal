import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { DriveStatus, RegistrationStatus } from '../../common/constants';

@Schema({ timestamps: true })
export class PlacementDrive {
  @Prop({ required: true, trim: true, maxlength: 120, index: true })
  company: string;

  @Prop({ required: true, trim: true, maxlength: 120 })
  role: string;

  @Prop({ trim: true, maxlength: 6000 })
  description?: string;

  /** Target role family from the taxonomy: software-development | data | testing. */
  @Prop({ trim: true, index: true })
  roleFamily?: string;

  @Prop({ enum: Object.values(DriveStatus), default: DriveStatus.Draft, index: true })
  status: DriveStatus;

  @Prop({ required: true })
  deadline: Date;

  @Prop()
  driveDate?: Date;

  @Prop({ trim: true })
  location?: string;

  @Prop({ trim: true })
  package?: string;

  /** Optional per-drive dimension weights; falls back to system defaults. */
  @Prop({ type: Object })
  dimensionWeights?: Record<string, number>;

  /** Bumped whenever requirements change, so readiness inputs hash changes. */
  @Prop({ default: 1 })
  requirementsVersion: number;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;
}
export type PlacementDriveDocument = HydratedDocument<PlacementDrive>;
export const PlacementDriveSchema = SchemaFactory.createForClass(PlacementDrive);
PlacementDriveSchema.index({ status: 1, deadline: 1 });

@Schema({ timestamps: true })
export class DriveRequirement {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'PlacementDrive', required: true, index: true })
  drive: Types.ObjectId;

  /** `skill` requires a specific skill; `cluster` accepts any skill in the cluster (taxonomy expansion). */
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
export type DriveRequirementDocument = HydratedDocument<DriveRequirement>;
export const DriveRequirementSchema = SchemaFactory.createForClass(DriveRequirement);

@Schema({ timestamps: true })
export class EligibilityRule {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'PlacementDrive', required: true, unique: true })
  drive: Types.ObjectId;

  @Prop({ min: 0, max: 10 }) minCgpa?: number;
  @Prop({ min: 0, max: 100 }) minTenthPercent?: number;
  @Prop({ min: 0, max: 100 }) minTwelfthPercent?: number;

  /** Empty = all departments / years. */
  @Prop({ type: [String], default: [] }) departments: string[];
  @Prop({ type: [Number], default: [] }) graduationYears: number[];

  /** Max allowed current backlogs. 0 = none allowed. undefined = no limit. */
  @Prop({ min: 0 }) maxActiveBacklogs?: number;

  /** If false, students with any history of backlogs are ineligible. */
  @Prop({ default: true }) allowHistoryOfBacklogs: boolean;
}
export type EligibilityRuleDocument = HydratedDocument<EligibilityRule>;
export const EligibilityRuleSchema = SchemaFactory.createForClass(EligibilityRule);

@Schema({ _id: false })
class EligibilitySnapshot {
  @Prop() eligible: boolean;
  @Prop({ type: [String], default: [] }) reasons: string[];
  @Prop() checkedAt: Date;
}
const EligibilitySnapshotSchema = SchemaFactory.createForClass(EligibilitySnapshot);

@Schema({ timestamps: true })
export class Registration {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'PlacementDrive', required: true, index: true })
  drive: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true })
  student: Types.ObjectId;

  @Prop({ enum: Object.values(RegistrationStatus), default: RegistrationStatus.Registered, index: true })
  status: RegistrationStatus;

  /** Eligibility as evaluated at registration time (audit trail). Never mixed with readiness. */
  @Prop({ type: EligibilitySnapshotSchema })
  eligibilityAtRegistration?: EligibilitySnapshot;
}
export type RegistrationDocument = HydratedDocument<Registration>;
export const RegistrationSchema = SchemaFactory.createForClass(Registration);
RegistrationSchema.index({ drive: 1, student: 1 }, { unique: true });
