import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsMongoId,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AuthUser, ClientIp, CurrentUser, Roles } from '../common/decorators';
import { EvidenceStatus, EvidenceType, Role } from '../common/constants';
import { PaginationQueryDto } from '../common/pagination';
import { EvidenceService } from './evidence.service';

class ClaimDto {
  @IsMongoId() skill: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) claimedLevel: number;
}

class SubmitEvidenceDto {
  @IsEnum(EvidenceType) type: EvidenceType;
  @IsString() @MinLength(3) @MaxLength(200) title: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsUrl({ require_protocol: true, protocols: ['http', 'https'] }) @MaxLength(500) url?: string;
  @IsOptional() @IsMongoId() fileId?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(15) @ValidateNested({ each: true }) @Type(() => ClaimDto) skills: ClaimDto[];
  @IsOptional() @IsObject() meta?: Record<string, any>;
}

class AwardDto {
  @IsMongoId() skill: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(5) level: number;
}

class ReviewDto {
  @IsIn(['approved', 'rejected']) decision: 'approved' | 'rejected';
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(15) @ValidateNested({ each: true }) @Type(() => AwardDto) awarded?: AwardDto[];
}

class EvidenceListQuery extends PaginationQueryDto {
  @IsOptional() @IsEnum(EvidenceStatus) status?: EvidenceStatus;
  @IsOptional() @IsEnum(EvidenceType) type?: EvidenceType;
}

@ApiTags('evidence')
@Controller('evidence')
export class EvidenceController {
  constructor(private readonly svc: EvidenceService) {}

  @Roles(Role.Student)
  @Post()
  submit(@CurrentUser() u: AuthUser, @Body() dto: SubmitEvidenceDto, @ClientIp() ip: string) {
    return this.svc.submit(u, dto, ip);
  }

  @Roles(Role.Student)
  @Get('mine')
  mine(@CurrentUser() u: AuthUser, @Query() q: EvidenceListQuery) {
    return this.svc.listForStudent(u, u.id, q);
  }

  @Roles(Role.Faculty)
  @Get('queue')
  queue(@CurrentUser() u: AuthUser, @Query() q: EvidenceListQuery) {
    return this.svc.queue(u, q);
  }

  @Roles(Role.Faculty, Role.Student, Role.PlacementOfficer, Role.PlacementHead, Role.Admin)
  @Get('history')
  history(@CurrentUser() u: AuthUser, @Query() q: PaginationQueryDto) {
    return this.svc.history(u, q);
  }

  @Roles(Role.Student, Role.Faculty, Role.PlacementOfficer, Role.PlacementHead, Role.Admin)
  @Get(':id')
  one(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.getOne(u, id);
  }

  @Roles(Role.Faculty)
  @Post(':id/review')
  review(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ReviewDto, @ClientIp() ip: string) {
    return this.svc.review(u, id, dto, ip);
  }

  @Roles(Role.Student)
  @Delete(':id')
  withdraw(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.withdraw(u, id);
  }
}
