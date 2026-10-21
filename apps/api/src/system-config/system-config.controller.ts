import { BadRequestException, Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNumber, IsObject, IsOptional, Max, Min } from 'class-validator';
import { SystemConfigService } from './system-config.service';
import { AuthUser, ClientIp, CurrentUser, Roles } from '../common/decorators';
import { PLACEMENT_CELL, Role } from '../common/constants';
import { AuditService } from '../audit/audit.service';
import { CacheService } from '../redis/cache.service';

export class UpdateConfigDto {
  @IsOptional() @IsObject() dimensionWeights?: Record<string, number>;
  @IsOptional() @IsObject() evidenceWeights?: Record<string, number>;
  @IsOptional() @IsNumber() @Min(0) @Max(1) evidenceFloor?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(5) projectDepthTargetLevel?: number;
  @IsOptional() @IsArray() assessmentLevelThresholds?: number[];
  @IsOptional() @IsBoolean() assessmentAutoVerify?: boolean;
  @IsOptional() @IsBoolean() mockInterviewAutoVerify?: boolean;
  @IsOptional() @IsBoolean() registrationOpenForStudents?: boolean;
  @IsOptional() @IsBoolean() aiFeaturesEnabled?: boolean;
}

const DIMENSIONS = ['technical', 'aptitude', 'communication', 'projectDepth'];
const EVIDENCE_TYPES = ['assessment', 'project', 'mock_interview', 'academic', 'certification', 'external'];

@ApiTags('admin')
@Controller('admin/config')
export class SystemConfigController {
  constructor(
    private readonly svc: SystemConfigService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
  ) {}

  @Roles(Role.Admin, ...PLACEMENT_CELL)
  @Get()
  get() {
    return this.svc.get();
  }

  @Roles(Role.Admin)
  @Patch()
  async update(@Body() dto: UpdateConfigDto, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    if (dto.dimensionWeights) {
      const w = dto.dimensionWeights;
      if (Object.keys(w).some((k) => !DIMENSIONS.includes(k)) || DIMENSIONS.some((k) => typeof w[k] !== 'number' || w[k] < 0)) {
        throw new BadRequestException(`dimensionWeights must contain non-negative numbers for: ${DIMENSIONS.join(', ')}`);
      }
      if (DIMENSIONS.reduce((s, k) => s + w[k], 0) <= 0) throw new BadRequestException('dimensionWeights must not all be zero');
    }
    if (dto.evidenceWeights) {
      const w = dto.evidenceWeights;
      if (Object.keys(w).some((k) => !EVIDENCE_TYPES.includes(k) || typeof w[k] !== 'number' || w[k] < 0 || w[k] > 1)) {
        throw new BadRequestException(`evidenceWeights keys must be in [${EVIDENCE_TYPES.join(', ')}] with values 0..1`);
      }
    }
    if (dto.assessmentLevelThresholds) {
      const t = dto.assessmentLevelThresholds;
      const ok = t.length === 5 && t.every((n, i) => typeof n === 'number' && n >= 0 && n <= 100 && (i === 0 || n > t[i - 1]));
      if (!ok) throw new BadRequestException('assessmentLevelThresholds must be 5 strictly ascending percentages (0-100)');
    }
    const before = await this.svc.get();
    const after = await this.svc.update(dto as any);
    await this.cache.invalidate('dashboards');
    await this.audit.log('config.update', user, 'SystemConfig', 'main', { changed: Object.keys(dto), from: before.version, to: after.version }, ip);
    return after;
  }
}
