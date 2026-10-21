import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { RECRUITER_RELEASABLE_FIELDS } from '../../common/constants';

@Schema({ timestamps: true })
export class RecruiterAccessGrant {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true })
  recruiter: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'PlacementDrive', required: true, index: true })
  drive: Types.ObjectId;

  /** Field-level release; subset of RECRUITER_RELEASABLE_FIELDS. Empty = pseudonymous candidate only. */
  @Prop({ type: [String], enum: RECRUITER_RELEASABLE_FIELDS as unknown as string[], default: [] })
  releasedFields: string[];

  @Prop({ required: true }) validFrom: Date;
  @Prop({ required: true, index: true }) expiresAt: Date;

  @Prop() revokedAt?: Date;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' }) revokedBy?: Types.ObjectId;
  @Prop({ trim: true, maxlength: 500 }) revokeReason?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true }) createdBy: Types.ObjectId;

  /** Hard cap on rows returned by a single search. */
  @Prop({ default: 25, min: 1, max: 50 }) maxResultsPerSearch: number;
}
export type RecruiterAccessGrantDocument = HydratedDocument<RecruiterAccessGrant>;
export const RecruiterAccessGrantSchema = SchemaFactory.createForClass(RecruiterAccessGrant);
RecruiterAccessGrantSchema.index({ recruiter: 1, drive: 1, expiresAt: -1 });

/** Every recruiter search / detail attempt, allowed or denied. Append-only. */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AccessLog {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true })
  recruiter: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'PlacementDrive', index: true })
  drive?: Types.ObjectId;

  @Prop({ required: true, enum: ['list_drives', 'search', 'candidate_detail'] })
  action: string;

  @Prop({ required: true, enum: ['allowed', 'denied'], index: true })
  outcome: string;

  /** Registration id used as the recruiter-facing candidate id (never the student's user id). */
  @Prop({ type: SchemaTypes.ObjectId }) registration?: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' }) student?: Types.ObjectId;

  @Prop({ type: [String], default: [] }) fieldsReleased: string[];
  @Prop() resultCount?: number;
  @Prop({ type: Object }) query?: Record<string, any>;
  @Prop() reason?: string;
  @Prop() ip?: string;
}
export type AccessLogDocument = HydratedDocument<AccessLog>;
export const AccessLogSchema = SchemaFactory.createForClass(AccessLog);
AccessLogSchema.index({ createdAt: -1 });

/** General security / admin audit trail. */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AuditLog {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', index: true })
  actor?: Types.ObjectId;

  @Prop() actorRole?: string;

  @Prop({ required: true, index: true })
  action: string;

  @Prop({ index: true })
  resourceType?: string;

  @Prop() resourceId?: string;

  @Prop({ type: Object }) details?: Record<string, any>;
  @Prop() ip?: string;
}
export type AuditLogDocument = HydratedDocument<AuditLog>;
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ createdAt: -1 });
