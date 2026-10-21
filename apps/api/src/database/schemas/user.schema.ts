import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { Role } from '../../common/constants';

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({ required: true, trim: true, maxlength: 120 })
  name: string;

  @Prop({ required: true, enum: Object.values(Role), index: true })
  role: Role;

  @Prop({ trim: true })
  department?: string;

  @Prop({ default: true })
  active: boolean;

  /** Bumped on logout / password change / deactivation to invalidate every outstanding token. */
  @Prop({ default: 0 })
  tokenVersion: number;

  @Prop()
  lastLoginAt?: Date;

  /** Recruiter organisation (only meaningful for role=recruiter). */
  @Prop({ trim: true })
  company?: string;
}
export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);

@Schema({ _id: false })
class ProjectEntry {
  @Prop({ required: true, trim: true, maxlength: 160 }) title: string;
  @Prop({ trim: true, maxlength: 2000 }) description?: string;
  @Prop({ type: [String], default: [] }) techStack: string[];
  @Prop({ trim: true }) url?: string;
}
const ProjectEntrySchema = SchemaFactory.createForClass(ProjectEntry);

@Schema({ _id: false })
class CertificationEntry {
  @Prop({ required: true, trim: true, maxlength: 160 }) name: string;
  @Prop({ trim: true, maxlength: 160 }) issuer?: string;
  @Prop() year?: number;
  @Prop({ trim: true }) credentialUrl?: string;
}
const CertificationEntrySchema = SchemaFactory.createForClass(CertificationEntry);

@Schema({ timestamps: true })
export class StudentProfile {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, unique: true })
  user: Types.ObjectId;

  @Prop({ trim: true, index: true })
  rollNumber?: string;

  @Prop({ trim: true, index: true })
  department?: string;

  @Prop({ index: true })
  graduationYear?: number;

  @Prop({ min: 0, max: 10 })
  cgpa?: number;

  @Prop({ min: 0, max: 100 })
  tenthPercent?: number;

  @Prop({ min: 0, max: 100 })
  twelfthPercent?: number;

  @Prop({ default: 0, min: 0 })
  activeBacklogs: number;

  @Prop({ default: false })
  historyOfBacklogs: boolean;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true, maxlength: 200 })
  headline?: string;

  /** Faculty mentor responsible for verifying this student's evidence. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', index: true })
  mentor?: Types.ObjectId;

  @Prop({ type: [ProjectEntrySchema], default: [] })
  projects: ProjectEntry[];

  @Prop({ type: [CertificationEntrySchema], default: [] })
  certifications: CertificationEntry[];
}
export type StudentProfileDocument = HydratedDocument<StudentProfile>;
export const StudentProfileSchema = SchemaFactory.createForClass(StudentProfile);
StudentProfileSchema.index({ department: 1, graduationYear: 1 });
