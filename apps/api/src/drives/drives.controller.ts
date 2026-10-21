import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsMongoId,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AuthUser, ClientIp, CurrentUser, Roles } from '../common/decorators';
import { DriveStatus, PLACEMENT_CELL, RegistrationStatus, Role } from '../common/constants';
import { PaginationQueryDto } from '../common/pagination';
import { AuthorizationService } from '../authz/authz.service';
import { ReadinessService } from '../readiness/readiness.service';
import { DrivesService } from './drives.service';

class DriveDto {
  @IsString() @MinLength(2) @MaxLength(120) company: string;
  @IsString() @MinLength(2) @MaxLength(120) role: string;
  @IsOptional() @IsString() @MaxLength(6000) description?: string;
  @IsOptional() @IsIn(['software-development', 'data', 'testing']) roleFamily?: string;
  @IsDateString() deadline: string;
  @IsOptional() @IsDateString() driveDate?: string;
  @IsOptional() @IsString() @MaxLength(120) location?: string;
  @IsOptional() @IsString() @MaxLength(60) package?: string;
  @IsOptional() @IsObject() dimensionWeights?: Record<string, number>;
}

class UpdateDriveDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) company?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) role?: string;
  @IsOptional() @IsString() @MaxLength(6000) description?: string;
  @IsOptional() @IsIn(['software-development', 'data', 'testing']) roleFamily?: string;
  @IsOptional() @IsDateString() deadline?: string;
  @IsOptional() @IsDateString() driveDate?: string;
  @IsOptional() @IsString() @MaxLength(120) location?: string;
  @IsOptional() @IsString() @MaxLength(60) package?: string;
  @IsOptional() @IsObject() dimensionWeights?: Record<string, number>;
}

class RequirementDto {
  @IsIn(['skill', 'cluster']) kind: 'skill' | 'cluster';
  @IsOptional() @IsMongoId() skill?: string;
  @IsOptional() @IsMongoId() cluster?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) requiredLevel: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(10) weight: number;
  @IsOptional() @IsBoolean() mandatory?: boolean;
}
class RequirementsDto {
  @IsArray() @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => RequirementDto) requirements: RequirementDto[];
}

class EligibilityDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(10) minCgpa?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) minTenthPercent?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) minTwelfthPercent?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) departments?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsInt({ each: true }) graduationYears?: number[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxActiveBacklogs?: number;
  @IsOptional() @IsBoolean() allowHistoryOfBacklogs?: boolean;
}

class StatusDto {
  @IsIn([DriveStatus.Published, DriveStatus.Closed, DriveStatus.Completed, DriveStatus.Draft]) status: DriveStatus;
}
class RegStatusDto {
  @IsEnum(RegistrationStatus) status: RegistrationStatus;
}
class DriveListQuery extends PaginationQueryDto {
  @IsOptional() @IsEnum(DriveStatus) status?: DriveStatus;
}
class RegListQuery extends PaginationQueryDto {
  @IsOptional() @IsEnum(RegistrationStatus) status?: RegistrationStatus;
}

@ApiTags('drives')
@Controller('drives')
export class DrivesController {
  constructor(
    private readonly drives: DrivesService,
    private readonly readiness: ReadinessService,
    private readonly authz: AuthorizationService,
  ) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query() q: DriveListQuery) {
    return this.drives.list(u, q);
  }

  @Roles(...PLACEMENT_CELL)
  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: DriveDto, @ClientIp() ip: string) {
    return this.drives.create(u, { ...dto, deadline: new Date(dto.deadline), driveDate: dto.driveDate ? new Date(dto.driveDate) : undefined } as any, ip);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.drives.get(u, id);
  }

  @Roles(...PLACEMENT_CELL)
  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateDriveDto, @ClientIp() ip: string) {
    const patch: any = { ...dto };
    if (dto.deadline) patch.deadline = new Date(dto.deadline);
    if (dto.driveDate) patch.driveDate = new Date(dto.driveDate);
    return this.drives.update(u, id, patch, ip);
  }

  @Roles(...PLACEMENT_CELL)
  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string, @ClientIp() ip: string) {
    return this.drives.remove(u, id, ip);
  }

  @Roles(...PLACEMENT_CELL)
  @Put(':id/requirements')
  requirements(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: RequirementsDto, @ClientIp() ip: string) {
    return this.drives.setRequirements(u, id, dto.requirements, ip);
  }

  @Roles(...PLACEMENT_CELL)
  @Put(':id/eligibility-rule')
  eligibilityRule(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: EligibilityDto, @ClientIp() ip: string) {
    return this.drives.setEligibility(u, id, dto as any, ip);
  }

  @Roles(...PLACEMENT_CELL)
  @Post(':id/status')
  @HttpCode(200)
  status(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: StatusDto, @ClientIp() ip: string) {
    return this.drives.setStatus(u, id, dto.status, ip);
  }

  @Roles(Role.Student)
  @Post(':id/register')
  register(@CurrentUser() u: AuthUser, @Param('id') id: string, @ClientIp() ip: string) {
    return this.drives.register(u, id, ip);
  }

  @Roles(Role.Student)
  @Delete(':id/register')
  withdraw(@CurrentUser() u: AuthUser, @Param('id') id: string, @ClientIp() ip: string) {
    return this.drives.withdraw(u, id, ip);
  }

  @Roles(...PLACEMENT_CELL)
  @Get(':id/registrations')
  registrations(@Param('id') id: string, @Query() q: RegListQuery) {
    return this.drives.listRegistrations(id, q);
  }

  @Roles(...PLACEMENT_CELL)
  @Patch(':id/registrations/:regId')
  regStatus(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('regId') regId: string, @Body() dto: RegStatusDto, @ClientIp() ip: string) {
    return this.drives.setRegistrationStatus(u, id, regId, dto.status, ip);
  }

  /**
   * Profile-vs-drive match. Eligibility and readiness are returned as two independent blocks and are
   * computed by independent engines. Students may only match themselves.
   */
  @Roles(Role.Student, Role.Faculty, ...PLACEMENT_CELL, Role.Admin)
  @Get(':id/match')
  async match(@CurrentUser() u: AuthUser, @Param('id') id: string, @Query('studentId') studentId?: string) {
    const target = u.role === Role.Student ? u.id : studentId;
    if (!target) throw new BadRequestException('studentId is required');
    await this.authz.assertCanAccessStudent(u, target);
    await this.drives.get(u, id); // 404 for drafts to students
    const [eligibility, r] = await Promise.all([this.drives.eligibilityFor(target, id), this.readiness.computeOne(target, id)]);
    return {
      driveId: id,
      studentId: target,
      eligibility: { eligible: eligibility.eligible, reasons: eligibility.reasons, checks: eligibility.checks },
      readiness: {
        score: r.result.score,
        dimensions: r.result.dimensions,
        explanation: r.result.explanation,
        gaps: r.result.gaps,
        met: r.result.met,
        nextActions: r.result.nextActions,
        cappedByMandatory: r.result.cappedByMandatory,
      },
    };
  }
}
