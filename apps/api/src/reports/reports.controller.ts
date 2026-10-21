import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsMongoId, IsOptional, IsString, Max, Min } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { PLACEMENT_CELL, Role } from '../common/constants';
import { ReportsService } from './reports.service';
import { DashboardsService } from './dashboards.service';
import { QueuesStatusProxy } from './queue-status';

class ScopeQuery {
  @IsOptional() @IsMongoId() driveId?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100) graduationYear?: number;
}

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Roles(...PLACEMENT_CELL, Role.Admin)
  @Get('readiness-distribution')
  distribution(@Query() q: ScopeQuery) {
    return this.reports.readinessDistribution(q);
  }

  @Roles(...PLACEMENT_CELL)
  @Get('skill-supply-demand')
  supplyDemand(@Query() q: ScopeQuery) {
    return this.reports.supplyDemand(q);
  }

  @Roles(...PLACEMENT_CELL)
  @Get('gap-frequency')
  gapFrequency(@Query() q: ScopeQuery) {
    return this.reports.gapFrequency(q);
  }

  @Roles(...PLACEMENT_CELL)
  @Get('verification-coverage')
  verification(@Query() q: ScopeQuery) {
    return this.reports.verificationCoverage(q);
  }

  @Roles(...PLACEMENT_CELL)
  @Get('funnel')
  funnel(@Query('driveId') driveId?: string) {
    return this.reports.funnel(driveId);
  }

  @Roles(...PLACEMENT_CELL)
  @Get('department-comparison')
  departments(@Query('graduationYear') graduationYear?: string) {
    return this.reports.departmentComparison(graduationYear ? Number(graduationYear) : undefined);
  }

  @Roles(...PLACEMENT_CELL)
  @Get('batch-comparison')
  batches() {
    return this.reports.batchComparison();
  }

  @Roles(...PLACEMENT_CELL)
  @Get('readiness-trend')
  trend(@Query('weeks') weeks?: string) {
    return this.reports.readinessTrend(Math.min(52, Math.max(2, Number(weeks) || 12)));
  }

  @Roles(...PLACEMENT_CELL)
  @Get('training-effectiveness')
  training() {
    return this.reports.trainingEffectiveness();
  }
}

@ApiTags('dashboards')
@Controller('dashboards')
export class DashboardsController {
  constructor(
    private readonly dash: DashboardsService,
    private readonly reports: ReportsService,
    private readonly queues: QueuesStatusProxy,
  ) {}

  @Roles(Role.Student)
  @Get('student')
  student(@CurrentUser() u: AuthUser) {
    return this.dash.student(u);
  }

  @Roles(Role.Faculty)
  @Get('faculty')
  faculty(@CurrentUser() u: AuthUser) {
    return this.dash.faculty(u);
  }

  @Roles(...PLACEMENT_CELL)
  @Get('officer')
  async officer() {
    return { ...(await this.reports.officerOverview()), queues: await this.queues.status() };
  }

  @Roles(Role.PlacementHead)
  @Get('head')
  async head() {
    const [departments, batches, trend, training, sd, funnel, dist] = await Promise.all([
      this.reports.departmentComparison(),
      this.reports.batchComparison(),
      this.reports.readinessTrend(12),
      this.reports.trainingEffectiveness(),
      this.reports.supplyDemand({}),
      this.reports.funnel(),
      this.reports.readinessDistribution({}),
    ]);
    return { departments, batches, trend, training, supplyDemand: sd.rows.slice(0, 10), funnel: funnel.slice(0, 8), distribution: dist };
  }

  @Roles(Role.Admin)
  @Get('admin')
  async admin() {
    return { ...(await this.reports.adminOverview()), queues: await this.queues.status() };
  }
}
