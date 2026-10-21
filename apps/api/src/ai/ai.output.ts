import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

/** Schemas the model output must satisfy. Anything else is discarded as AI_INVALID_OUTPUT. */

export class PlanTaskOut {
  @IsInt() @Min(0) @Max(89) dayIndex: number;
  @IsString() @MinLength(2) @MaxLength(200) title: string;
  @IsString() @MinLength(2) @MaxLength(1000) objective: string;
  @IsString() @MinLength(2) @MaxLength(1500) activity: string;
  @IsString() @MinLength(2) @MaxLength(1500) exercise: string;
  @IsString() @MinLength(2) @MaxLength(1000) expectedOutcome: string;
  @IsInt() @Min(5) @Max(600) estimatedMinutes: number;
  @IsOptional() @IsString() @MaxLength(80) skill?: string;
  @IsOptional() @IsBoolean() checkpoint?: boolean;
}
export class PlanOut {
  @IsString() @MinLength(2) @MaxLength(1500) summary: string;
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => PlanTaskOut) tasks: PlanTaskOut[];
}

export class ResumeSkillOut {
  @IsString() @MinLength(1) @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(300) evidence?: string;
}
export class ResumeProjectOut {
  @IsString() @MinLength(1) @MaxLength(160) title: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) technologies?: string[];
  @IsOptional() @IsString() @MaxLength(600) summary?: string;
}
export class ResumeExperienceOut {
  @IsString() @MinLength(1) @MaxLength(160) role: string;
  @IsOptional() @IsString() @MaxLength(160) organization?: string;
  @IsOptional() @IsString() @MaxLength(600) summary?: string;
}
export class ResumeOut {
  @IsArray() @ArrayMaxSize(60) @ValidateNested({ each: true }) @Type(() => ResumeSkillOut) skills: ResumeSkillOut[];
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ResumeProjectOut) projects: ResumeProjectOut[];
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ResumeExperienceOut) experience: ResumeExperienceOut[];
  @IsArray() @ArrayMaxSize(40) @IsString({ each: true }) keywords: string[];
}

export class ClarityOut {
  @IsInt() @Min(1) @Max(5) score: number;
  @IsString() @MaxLength(600) comment: string;
}
export class FeedbackOut {
  @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) strengths: string[];
  @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) missingConcepts: string[];
  @ValidateNested() @Type(() => ClarityOut) clarity: ClarityOut;
  @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) suggestions: string[];
  @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) practiceTopics: string[];
}

export class ExplainOut {
  @IsString() @MinLength(10) @MaxLength(4000) summary: string;
  @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) whyGapsMatter: string[];
  @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) alignedStrengths: string[];
  @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) priorities: string[];
  @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) incompleteEvidence: string[];
}
