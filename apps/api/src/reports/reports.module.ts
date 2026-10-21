import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { DashboardsService } from './dashboards.service';
import { DashboardsController, ReportsController } from './reports.controller';
import { QueuesStatusProxy } from './queue-status';

@Module({
  controllers: [ReportsController, DashboardsController],
  providers: [ReportsService, DashboardsService, QueuesStatusProxy],
  exports: [ReportsService],
})
export class ReportsModule {}
