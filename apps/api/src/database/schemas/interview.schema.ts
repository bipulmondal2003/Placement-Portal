import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export interface InterviewFeedback {
  score: number; // 1..5
  strengths: string[];
  improvements: string[];
  hint?: string;
}

@Schema({ _id: false })
export class InterviewTurn {
  @Prop({ required: true, enum: ['interviewer', 'candidate'] })
  role: 'interviewer' | 'candidate';

  @Prop({ required: true, maxlength: 4000 })
  text: string;

  /** Skill the interviewer question probes (for interviewer turns). */
  @Prop({ trim: true, maxlength: 80 })
  skill?: string;

  /** Coaching feedback on a candidate answer. Advisory only. */
  @Prop({ type: Object })
  feedback?: InterviewFeedback;

  @Prop({ default: () => new Date() })
  at: Date;
}
export const InterviewTurnSchema = SchemaFactory.createForClass(InterviewTurn);

/**
 * A chat-style practice interview for a target role. Strictly advisory: nothing here is ever read by the
 * readiness engine, eligibility rules, recruiters or reports. (Faculty-attested `MockInterview` records are a
 * different, verified kind of evidence.)
 */
@Schema({ timestamps: true })
export class InterviewSession {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true })
  student: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'RoleProfile', required: true })
  role: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 120 })
  roleTitle: string;

  /** `ai` = Gemini interviewer; `practice` = built-in question bank with keyword feedback. */
  @Prop({ required: true, enum: ['ai', 'practice'] })
  mode: 'ai' | 'practice';

  @Prop({ required: true, enum: ['beginner', 'intermediate', 'advanced'], default: 'intermediate' })
  difficulty: 'beginner' | 'intermediate' | 'advanced';

  @Prop({ required: true, enum: ['active', 'completed'], default: 'active', index: true })
  status: 'active' | 'completed';

  @Prop({ required: true, min: 1, max: 10 })
  plannedQuestions: number;

  @Prop({ default: 0 })
  answered: number;

  /** Practice mode: ids of the bank questions chosen for this session, in order. Never sent to the client. */
  @Prop({ type: [String], default: [] })
  plan: string[];

  @Prop({ type: [InterviewTurnSchema], default: [] })
  turns: InterviewTurn[];

  @Prop({ type: Object })
  summary?: {
    averageScore: number;
    overall: string;
    strengths: string[];
    improvements: string[];
    practiceTopics: string[];
    bySkill: Array<{ skill: string; score: number }>;
  };

  @Prop()
  completedAt?: Date;
}
export type InterviewSessionDocument = HydratedDocument<InterviewSession>;
export const InterviewSessionSchema = SchemaFactory.createForClass(InterviewSession);
InterviewSessionSchema.index({ student: 1, createdAt: -1 });
