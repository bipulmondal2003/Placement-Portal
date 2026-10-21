import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ _id: true })
export class Question {
  @Prop({ required: true, trim: true, maxlength: 1000 })
  prompt: string;

  @Prop({ type: [String], required: true })
  options: string[];

  /** Protected: never returned to students before the attempt is submitted. */
  @Prop({ required: true, min: 0 })
  correctIndex: number;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Skill', required: true })
  skill: Types.ObjectId;

  @Prop({ trim: true, maxlength: 1000 })
  explanation?: string;
}
export const QuestionSchema = SchemaFactory.createForClass(Question);

@Schema({ timestamps: true })
export class Assessment {
  @Prop({ required: true, trim: true, maxlength: 160 })
  title: string;

  @Prop({ trim: true, maxlength: 1000 })
  description?: string;

  @Prop({ type: [QuestionSchema], default: [] })
  questions: Question[];

  /** Assignment: empty arrays mean "all". */
  @Prop({ type: [String], default: [] })
  departments: string[];

  @Prop({ type: [Number], default: [] })
  graduationYears: number[];

  @Prop({ default: 30 })
  durationMinutes: number;

  @Prop({ default: 3 })
  maxAttempts: number;

  @Prop({ default: 'published', enum: ['draft', 'published', 'archived'], index: true })
  status: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;
}
export type AssessmentDocument = HydratedDocument<Assessment>;
export const AssessmentSchema = SchemaFactory.createForClass(Assessment);

@Schema({ _id: false })
export class SkillScore {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Skill', required: true }) skill: Types.ObjectId;
  @Prop({ required: true }) correct: number;
  @Prop({ required: true }) total: number;
  @Prop({ required: true }) percent: number;
  @Prop({ required: true }) awardedLevel: number;
}
export const SkillScoreSchema = SchemaFactory.createForClass(SkillScore);

@Schema({ timestamps: true })
export class AssessmentAttempt {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Assessment', required: true, index: true })
  assessment: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true })
  student: Types.ObjectId;

  @Prop({ type: [Number], default: [] })
  answers: number[];

  @Prop({ required: true }) score: number;
  @Prop({ required: true }) total: number;
  @Prop({ required: true }) percent: number;

  @Prop({ type: [SkillScoreSchema], default: [] })
  perSkill: SkillScore[];

  @Prop({ type: SchemaTypes.ObjectId, ref: 'EvidenceItem' })
  evidence?: Types.ObjectId;

  @Prop({ default: Date.now })
  submittedAt: Date;
}
export type AssessmentAttemptDocument = HydratedDocument<AssessmentAttempt>;
export const AssessmentAttemptSchema = SchemaFactory.createForClass(AssessmentAttempt);
AssessmentAttemptSchema.index({ student: 1, assessment: 1, submittedAt: -1 });

@Schema({ _id: false })
class InterviewSkillLevel {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Skill', required: true }) skill: Types.ObjectId;
  @Prop({ required: true, min: 0, max: 5 }) level: number;
}
const InterviewSkillLevelSchema = SchemaFactory.createForClass(InterviewSkillLevel);

@Schema({ _id: false })
class InterviewRatings {
  @Prop({ required: true, min: 1, max: 5 }) technical: number;
  @Prop({ required: true, min: 1, max: 5 }) problemSolving: number;
  @Prop({ required: true, min: 1, max: 5 }) communication: number;
  @Prop({ required: true, min: 1, max: 5 }) confidence: number;
}
const InterviewRatingsSchema = SchemaFactory.createForClass(InterviewRatings);

@Schema({ timestamps: true })
export class MockInterview {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true })
  student: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true })
  interviewer: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 160 })
  topic: string;

  @Prop({ default: Date.now })
  conductedAt: Date;

  @Prop({ type: InterviewRatingsSchema, required: true })
  ratings: InterviewRatings;

  /** Levels the interviewer is willing to attest to; these become verified evidence. */
  @Prop({ type: [InterviewSkillLevelSchema], default: [] })
  skillLevels: InterviewSkillLevel[];

  @Prop({ trim: true, maxlength: 4000 })
  feedback?: string;

  @Prop({ trim: true, maxlength: 2000 })
  improvements?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'EvidenceItem' })
  evidence?: Types.ObjectId;
}
export type MockInterviewDocument = HydratedDocument<MockInterview>;
export const MockInterviewSchema = SchemaFactory.createForClass(MockInterview);
