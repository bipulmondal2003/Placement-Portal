import { Body, Controller, Get, Param, Patch, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AuthUser, ClientIp, CurrentUser, Roles } from '../common/decorators';
import { PLACEMENT_CELL, Role } from '../common/constants';
import { PaginationQueryDto } from '../common/pagination';
import { StudentsService } from './students.service';

class ProjectDto {
  @IsString() @MaxLength(160) title: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) techStack?: string[];
  @IsOptional() @IsUrl({ require_protocol: true }) url?: string;
}
class CertDto {
  @IsString() @MaxLength(160) name: string;
  @IsOptional() @IsString() @MaxLength(160) issuer?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1990) @Max(2100) year?: number;
  @IsOptional() @IsUrl({ require_protocol: true }) credentialUrl?: string;
}

class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(40) rollNumber?: string;
  @IsOptional() @IsString() @MaxLength(80) department?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100) graduationYear?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(10) cgpa?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) tenthPercent?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) twelfthPercent?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(30) activeBacklogs?: number;
  @IsOptional() @IsBoolean() historyOfBacklogs?: boolean;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(200) headline?: string;
  @IsOptional() @IsMongoId() mentor?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => ProjectDto) projects?: ProjectDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => CertDto) certifications?: CertDto[];
}

class DeclaredDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(5) level: number;
}

class StudentListQuery extends PaginationQueryDto {
  @IsOptional() @IsString() department?: string;
  @IsOptional() @Type(() => Number) @IsInt() graduationYear?: number;
}

@ApiTags('students')
@Controller('students')
export class StudentsController {
  constructor(private readonly svc: StudentsService) {}

  @Roles(Role.Faculty, ...PLACEMENT_CELL, Role.Admin)
  @Get()
  list(@CurrentUser() u: AuthUser, @Query() q: StudentListQuery) {
    return this.svc.list(u, q);
  }

  @Roles(Role.Student, Role.Faculty, ...PLACEMENT_CELL, Role.Admin)
  @Get(':id/profile')
  profile(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.getProfile(u, id);
  }

  @Roles(Role.Student, ...PLACEMENT_CELL, Role.Admin)
  @Patch(':id/profile')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateProfileDto, @ClientIp() ip: string) {
    return this.svc.updateProfile(u, id, dto as any, ip);
  }

  @Roles(Role.Student, Role.Faculty, ...PLACEMENT_CELL, Role.Admin)
  @Get(':id/skills')
  skills(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.skillView(u, id);
  }

  @Roles(Role.Student)
  @Put(':id/skills/:skillId/declared')
  declared(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('skillId') skillId: string, @Body() dto: DeclaredDto, @ClientIp() ip: string) {
    return this.svc.setDeclared(u, id, skillId, dto.level, ip);
  }

  @Roles(Role.Student, Role.Faculty, ...PLACEMENT_CELL, Role.Admin)
  @Get(':id/readiness')
  readiness(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.readinessOverview(u, id);
  }

  @Roles(Role.Student, Role.Faculty, ...PLACEMENT_CELL, Role.Admin)
  @Get(':id/readiness/:driveId')
  readinessDetail(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('driveId') driveId: string) {
    return this.svc.readinessDetail(u, id, driveId);
  }
}
