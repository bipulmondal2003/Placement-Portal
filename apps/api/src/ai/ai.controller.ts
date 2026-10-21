import { Body, Controller, Get, NotFoundException, Param, Post, Query, ForbiddenException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AuthUser, ClientIp, CurrentUser, Roles } from '../common/decorators';
import { PLACEMENT_CELL, Role } from '../common/constants';
import { AiService } from './ai.service';
import { AiFeaturesService } from './ai-features.service';
import { JobsService } from '../queues/jobs.service';

const aiLimit = Number(process.env.AI_THROTTLE_LIMIT);
// Per-client cost control for AI endpoints (default 10 requests/minute); overridable via AI_THROTTLE_LIMIT.
const AI_LIMIT = { default: { limit: Number.isFinite(aiLimit) && aiLimit > 0 ? aiLimit : 10, ttl: 60_000 } };

class PlanRequestDto {
  @IsMongoId() driveId: string;
  @Type(() => Number) @IsInt() @Min(3) @Max(60) days: number = 14;
  @Type(() => Number) @IsNumber() @Min(0.5) @Max(10) hoursPerDay: number = 2;
  @IsOptional() @IsString() @MaxLength(500) preferences?: string;
}

class AiTaskDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(89) dayIndex: number;
  @IsString() @MinLength(2) @MaxLength(200) title: string;
  @IsString() @MaxLength(1000) objective: string;
  @IsString() @MaxLength(1500) activity: string;
  @IsString() @MaxLength(1500) exercise: string;
  @IsString() @MaxLength(1000) expectedOutcome: string;
  @Type(() => Number) @IsInt() @Min(5) @Max(600) estimatedMinutes: number;
  @IsOptional() @IsMongoId() skill?: string;
  @IsOptional() @IsBoolean() checkpoint?: boolean;
}
class PlanAcceptDto {
  @IsMongoId() driveId: string;
  @Type(() => Number) @IsNumber() @Min(0.5) @Max(10) hoursPerDay: number;
  @IsDateString() startDate: string;
  @IsOptional() @IsString() @MaxLength(1500) summary?: string;
  @IsOptional() @IsString() @MaxLength(64) basedOnInputsHash?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => AiTaskDto) tasks: AiTaskDto[];
}

class ResumeDto {
  @IsString() @MinLength(40) @MaxLength(15000) text: string;
}
class ClaimDto {
  @IsMongoId() skill: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) claimedLevel: number;
}
class ClaimsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => ClaimDto) items: ClaimDto[];
  @IsOptional() @IsString() @MaxLength(1500) note?: string;
}

class TurnDto {
  @IsIn(['user', 'assistant']) role: 'user' | 'assistant';
  @IsString() @MaxLength(1500) text: string;
}
class ChatDto {
  @IsString() @MinLength(1) @MaxLength(1500) message: string;
  @IsOptional() @IsMongoId() driveId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => TurnDto) history?: TurnDto[];
}

class FeedbackDto {
  @IsString() @MinLength(5) @MaxLength(800) question: string;
  @IsString() @MinLength(10) @MaxLength(4000) answer: string;
  @IsOptional() @IsString() @MaxLength(120) topic?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) rubric?: string[];
}
class ExplainDto {
  @IsMongoId() driveId: string;
  @IsOptional() @IsMongoId() studentId?: string;
}

/** AI features. Every endpoint degrades to a typed error (never a fabricated answer) when Gemini is unavailable. */
@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService, private readonly features: AiFeaturesService, private readonly jobs: JobsService) {}

  @Get('status')
  status(@CurrentUser() u: AuthUser, @Query('verify') verify?: string) {
    return this.ai.status(verify === 'true' && u.role === Role.Admin);
  }

  @Roles(Role.Student)
  @Throttle(AI_LIMIT)
  @Post('plan')
  plan(@CurrentUser() u: AuthUser, @Body() dto: PlanRequestDto) {
    return this.features.planPreview(u, dto);
  }

  @Roles(Role.Student)
  @Post('plan/accept')
  accept(@CurrentUser() u: AuthUser, @Body() dto: PlanAcceptDto, @ClientIp() ip: string) {
    return this.features.planAccept(u, dto, ip);
  }

  @Roles(Role.Student)
  @Throttle(AI_LIMIT)
  @Post('resume/analyze')
  resume(@Body() dto: ResumeDto, @CurrentUser() u: AuthUser) {
    return this.features.resumeAnalyze(u.id, dto.text);
  }

  /** Queue the analysis (BullMQ) and poll /ai/jobs/:id. Useful when the provider is slow. */
  @Roles(Role.Student)
  @Throttle(AI_LIMIT)
  @Post('resume/analyze-async')
  async resumeAsync(@Body() dto: ResumeDto, @CurrentUser() u: AuthUser) {
    return this.jobs.enqueueAi('resume-analysis', { studentId: u.id, text: dto.text });
  }

  @Roles(Role.Student)
  @Get('jobs/:id')
  async job(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    const job = await this.jobs.getAiJob(id);
    // A job that belongs to someone else looks exactly like a job that doesn't exist.
    if (!job || job.data?.studentId !== u.id) throw new NotFoundException('Job not found');
    return { id: job.id, state: job.state, result: job.state === 'completed' ? job.result : undefined, error: job.state === 'failed' ? job.failedReason : undefined };
  }

  @Roles(Role.Student)
  @Post('resume/claims')
  claims(@Body() dto: ClaimsDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) {
    return this.features.submitResumeClaims(u, dto.items, dto.note, ip);
  }

  @Roles(Role.Student)
  @Throttle(AI_LIMIT)
  @Post('chat')
  chat(@Body() dto: ChatDto, @CurrentUser() u: AuthUser) {
    return this.features.chat(u, dto.message, dto.history ?? [], dto.driveId);
  }

  @Roles(Role.Student)
  @Throttle(AI_LIMIT)
  @Post('mock-interview/feedback')
  feedback(@Body() dto: FeedbackDto) {
    return this.features.mockFeedback(dto);
  }

  @Roles(Role.Student, Role.Faculty, ...PLACEMENT_CELL)
  @Throttle(AI_LIMIT)
  @Post('explain-readiness')
  explain(@Body() dto: ExplainDto, @CurrentUser() u: AuthUser) {
    if (u.role === Role.Student && dto.studentId && dto.studentId !== u.id) throw new ForbiddenException('You can only request explanations for your own results');
    const target = u.role === Role.Student ? u.id : dto.studentId;
    if (!target) throw new ForbiddenException('studentId is required');
    return this.features.explainReadiness(u, target, dto.driveId);
  }
}
