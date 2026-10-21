import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
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
import { PaginationQueryDto } from '../common/pagination';
import { AssessmentsService } from './assessments.service';
import { MockInterviewsService } from './mock-interviews.service';

class QuestionDto {
  @IsString() @MinLength(3) @MaxLength(1000) prompt: string;
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(6) @IsString({ each: true }) options: string[];
  @Type(() => Number) @IsInt() @Min(0) correctIndex: number;
  @IsMongoId() skill: string;
  @IsOptional() @IsString() @MaxLength(1000) explanation?: string;
}

class CreateAssessmentDto {
  @IsString() @MinLength(3) @MaxLength(160) title: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => QuestionDto) questions: QuestionDto[];
  @IsOptional() @IsArray() @IsString({ each: true }) departments?: string[];
  @IsOptional() @IsArray() @IsInt({ each: true }) graduationYears?: number[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(240) durationMinutes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) maxAttempts?: number;
  @IsOptional() @IsIn(['draft', 'published']) status?: 'draft' | 'published';
}

class StatusDto {
  @IsIn(['draft', 'published', 'archived']) status: 'draft' | 'published' | 'archived';
}

class SubmitDto {
  @IsArray() @ArrayMaxSize(100) @IsInt({ each: true }) @Min(-1, { each: true }) answers: number[];
}

class RatingsDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(5) technical: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) problemSolving: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) communication: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) confidence: number;
}
class SkillLevelDto {
  @IsMongoId() skill: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(5) level: number;
}
class InterviewDto {
  @IsMongoId() student: string;
  @IsString() @MinLength(3) @MaxLength(160) topic: string;
  @IsOptional() @IsDateString() conductedAt?: string;
  @ValidateNested() @Type(() => RatingsDto) ratings: RatingsDto;
  @IsArray() @ArrayMaxSize(15) @ValidateNested({ each: true }) @Type(() => SkillLevelDto) skillLevels: SkillLevelDto[];
  @IsOptional() @IsString() @MaxLength(4000) feedback?: string;
  @IsOptional() @IsString() @MaxLength(2000) improvements?: string;
}

@ApiTags('assessments')
@Controller()
export class AssessmentsController {
  constructor(private readonly svc: AssessmentsService, private readonly interviews: MockInterviewsService) {}

  // ---- staff
  @Roles(Role.Faculty, ...PLACEMENT_CELL, Role.Admin)
  @Post('assessments')
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateAssessmentDto, @ClientIp() ip: string) {
    return this.svc.create(u, dto as any, ip);
  }

  @Roles(Role.Faculty, ...PLACEMENT_CELL, Role.Admin)
  @Get('assessments/manage')
  manage(@CurrentUser() u: AuthUser, @Query() q: PaginationQueryDto) {
    return this.svc.listForStaff(u, q);
  }

  @Roles(Role.Faculty, ...PLACEMENT_CELL, Role.Admin)
  @Get('assessments/manage/:id')
  manageOne(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.getForStaff(u, id);
  }

  @Roles(Role.Faculty, ...PLACEMENT_CELL, Role.Admin)
  @Patch('assessments/:id/status')
  status(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: StatusDto, @ClientIp() ip: string) {
    return this.svc.setStatus(u, id, dto.status, ip);
  }

  @Roles(Role.Faculty, ...PLACEMENT_CELL, Role.Admin)
  @Get('assessments/:id/results')
  results(@CurrentUser() u: AuthUser, @Param('id') id: string, @Query() q: PaginationQueryDto) {
    return this.svc.results(u, id, q);
  }

  // ---- student
  @Roles(Role.Student)
  @Get('assessments')
  list(@CurrentUser() u: AuthUser) {
    return this.svc.listForStudent(u);
  }

  @Roles(Role.Student)
  @Get('assessments/attempts/mine')
  mine(@CurrentUser() u: AuthUser, @Query() q: PaginationQueryDto) {
    return this.svc.myAttempts(u, q);
  }

  @Roles(Role.Student)
  @Get('assessments/:id/take')
  take(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.takeForStudent(u, id);
  }

  @Roles(Role.Student)
  @Post('assessments/:id/submit')
  @HttpCode(201)
  submit(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: SubmitDto, @ClientIp() ip: string) {
    return this.svc.submit(u, id, dto.answers, ip);
  }

  // ---- mock interviews
  @Roles(Role.Faculty)
  @Post('mock-interviews')
  record(@CurrentUser() u: AuthUser, @Body() dto: InterviewDto, @ClientIp() ip: string) {
    return this.interviews.create(u, { ...dto, conductedAt: dto.conductedAt ? new Date(dto.conductedAt) : undefined } as any, ip);
  }

  @Roles(Role.Faculty)
  @Get('mock-interviews/conducted')
  conducted(@CurrentUser() u: AuthUser, @Query() q: PaginationQueryDto) {
    return this.interviews.listByInterviewer(u, q);
  }

  @Roles(Role.Student, Role.Faculty, ...PLACEMENT_CELL, Role.Admin)
  @Get('students/:id/mock-interviews')
  forStudent(@CurrentUser() u: AuthUser, @Param('id') id: string, @Query() q: PaginationQueryDto) {
    return this.interviews.listForStudent(u, id, q);
  }

  @Roles(Role.Student, Role.Faculty, ...PLACEMENT_CELL, Role.Admin)
  @Get('mock-interviews/:id')
  one(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.interviews.get(u, id);
  }
}
