import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

/** Shapes the Gemini interviewer must return. Anything else is discarded as AI_INVALID_OUTPUT. */
export class QuestionOut {
  @IsString() @MinLength(10) @MaxLength(500) question: string;
  @IsOptional() @IsString() @MaxLength(80) skill?: string;
}

export class EvaluationOut {
  @IsInt() @Min(1) @Max(5) score: number;
  @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) strengths: string[];
  @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) improvements: string[];
  @IsOptional() @IsString() @MaxLength(700) modelAnswerHint?: string;
}

export class SummaryOut {
  @IsString() @MinLength(10) @MaxLength(1500) overall: string;
  @IsArray() @ArrayMaxSize(6) @IsString({ each: true }) strengths: string[];
  @IsArray() @ArrayMaxSize(6) @IsString({ each: true }) improvements: string[];
  @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) practiceTopics: string[];
}

export class TurnOut {
  @ValidateNested() @Type(() => EvaluationOut) evaluation: EvaluationOut;
  @IsOptional() @ValidateNested() @Type(() => QuestionOut) nextQuestion?: QuestionOut;
  @IsOptional() @ValidateNested() @Type(() => SummaryOut) summary?: SummaryOut;
}
