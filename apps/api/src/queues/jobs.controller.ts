import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IsInt, IsMongoId, IsOptional, IsString, Max, Min, ArrayMaxSize, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { AuthUser, ClientIp, CurrentUser, Roles } from '../common/decorators';
import { PLACEMENT_CELL } from '../common/constants';
import { PaginationQueryDto, paginate } from '../common/pagination';
import { BatchJob, BatchJobDocument } from '../database/schemas/system.schema';
import { AuditService } from '../audit/audit.service';
import { JobsService } from './jobs.service';

class StartBatchDto {
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsMongoId({ each: true }) driveIds?: string[];
  @IsOptional() @IsString() department?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100) graduationYear?: number;
}

@ApiTags('jobs')
@Roles(...PLACEMENT_CELL)
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly audit: AuditService,
    @InjectModel(BatchJob.name) private readonly batches: Model<BatchJobDocument>,
  ) {}

  /** Starts an asynchronous batch readiness recalculation; returns immediately with a trackable record. */
  @Post('batch-readiness')
  @HttpCode(202)
  async start(@Body() dto: StartBatchDto, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    const { batch, duplicate } = await this.jobs.startBatch(user.id, dto);
    if (!duplicate) await this.audit.log('batch.start', user, 'BatchJob', String(batch._id), { scope: dto }, ip);
    return { batch, duplicate };
  }

  @Get('batches')
  list(@Query() q: PaginationQueryDto) {
    return paginate(this.batches, {}, { page: q.page, limit: q.limit, sort: { createdAt: -1 } });
  }

  @Get('batches/:id')
  async get(@Param('id') id: string) {
    const b = await this.batches.findById(id).lean();
    if (!b) throw new NotFoundException('Batch job not found');
    return { ...b, percent: b.total ? Math.round((100 * (b.processed + b.failed)) / b.total) : b.status === 'completed' ? 100 : 0 };
  }

  @Get('queues')
  queues() {
    return this.jobs.queueStatus();
  }
}
