import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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
} from 'class-validator';
import { AuthUser, ClientIp, CurrentUser, Roles } from '../common/decorators';
import { PLACEMENT_CELL, RECRUITER_RELEASABLE_FIELDS, Role } from '../common/constants';
import { PaginationQueryDto } from '../common/pagination';
import { RecruiterService } from './recruiter.service';

class CandidateSearchDto {
  @IsOptional() @IsString() @MaxLength(60) skill?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) minLevel?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) minReadiness?: number;
  @IsOptional() @IsString() @MaxLength(80) department?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100) graduationYear?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(10) minCgpa?: number;
  @IsOptional() @IsString() @MaxLength(60) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit: number = 25;
}

class CreateGrantDto {
  @IsMongoId() recruiterId: string;
  @IsMongoId() driveId: string;
  @IsArray() @ArrayMaxSize(12) @IsIn(RECRUITER_RELEASABLE_FIELDS as unknown as string[], { each: true }) releasedFields: string[];
  @IsOptional() @IsDateString() validFrom?: string;
  @IsDateString() expiresAt: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) maxResultsPerSearch?: number;
}
class RevokeDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
class GrantListQuery extends PaginationQueryDto {
  @IsOptional() @IsMongoId() recruiter?: string;
  @IsOptional() @IsMongoId() drive?: string;
  @IsOptional() @IsIn(['active', 'revoked', 'expired']) status?: string;
}
class LogQuery extends PaginationQueryDto {
  @IsOptional() @IsMongoId() recruiter?: string;
  @IsOptional() @IsMongoId() drive?: string;
  @IsOptional() @IsIn(['allowed', 'denied']) outcome?: string;
  @IsOptional() @IsIn(['list_drives', 'search', 'candidate_detail']) action?: string;
}

/**
 * Recruiter portal. Separate route group (/api/recruiter/*) with its own cookie/session policy
 * (see JwtAuthGuard) and stricter throttling (see app.module). There is intentionally NO export endpoint.
 * Role is enforced here; scope (grant + registration) is enforced in the authorisation module.
 */
@ApiTags('recruiter')
@Roles(Role.Recruiter)
@Throttle({ recruiter: { limit: 20, ttl: 60_000 } })
@Controller('recruiter')
export class RecruiterController {
  constructor(private readonly svc: RecruiterService) {}

  @Get('drives')
  drives(@CurrentUser() u: AuthUser, @ClientIp() ip: string) {
    return this.svc.myDrives(u, ip);
  }

  @Get('drives/:driveId/candidates')
  search(@CurrentUser() u: AuthUser, @Param('driveId') driveId: string, @Query() q: CandidateSearchDto, @ClientIp() ip: string) {
    return this.svc.search(u, driveId, q, ip);
  }

  @Get('drives/:driveId/facets')
  facets(@CurrentUser() u: AuthUser, @Param('driveId') driveId: string, @ClientIp() ip: string) {
    return this.svc.facets(u, driveId, ip);
  }

  @Get('drives/:driveId/candidates/:candidateId')
  candidate(@CurrentUser() u: AuthUser, @Param('driveId') driveId: string, @Param('candidateId') candidateId: string, @ClientIp() ip: string) {
    return this.svc.candidate(u, driveId, candidateId, ip);
  }
}

/** Grant management & access-log review: placement cell only. */
@ApiTags('recruiter-access')
@Controller('recruiter-access')
export class RecruiterAccessController {
  constructor(private readonly svc: RecruiterService) {}

  @Roles(...PLACEMENT_CELL, Role.Admin)
  @Get('grants')
  list(@Query() q: GrantListQuery) {
    return this.svc.listGrants(q);
  }

  @Roles(...PLACEMENT_CELL, Role.Admin)
  @Get('recruiters')
  recruiters() {
    return this.svc.recruiters();
  }

  @Roles(...PLACEMENT_CELL)
  @Post('grants')
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateGrantDto, @ClientIp() ip: string) {
    return this.svc.createGrant(
      u,
      { ...dto, validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined, expiresAt: new Date(dto.expiresAt) },
      ip,
    );
  }

  @Roles(...PLACEMENT_CELL)
  @Post('grants/:id/revoke')
  @HttpCode(200)
  revoke(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: RevokeDto, @ClientIp() ip: string) {
    return this.svc.revoke(u, id, dto.reason, ip);
  }

  @Roles(...PLACEMENT_CELL, Role.Admin)
  @Get('logs')
  logs(@Query() q: LogQuery) {
    return this.svc.accessLogs(q);
  }

  @Roles(...PLACEMENT_CELL, Role.Admin)
  @Get('releasable-fields')
  fields() {
    return { fields: RECRUITER_RELEASABLE_FIELDS, headOnly: ['email', 'phone'] };
  }
}
