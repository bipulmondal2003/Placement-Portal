import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUES } from '../common/constants';
import { ReadinessModule } from '../readiness/readiness.module';
import { ReadinessService } from '../readiness/readiness.service';
import { BatchRunner } from './batch.runner';
import { AiModule } from '../ai/ai.module';
import { AiProcessor } from '../ai/ai.processor';

/** Evidence/assessment-triggered recalculation for one student. */
@Processor(QUEUES.READINESS)
export class ReadinessProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ReadinessProcessor.name);
  constructor(private readonly readiness: ReadinessService, private readonly config: ConfigService) {
    super();
  }

  onModuleInit() {
    this.worker.concurrency = Math.max(2, this.config.get<number>('BATCH_CONCURRENCY') ?? 4);
  }

  async process(job: Job<{ studentId: string; skillIds?: string[]; reason?: string }>) {
    const { studentId, skillIds } = job.data;
    return this.readiness.recomputeForStudent(studentId, skillIds && skillIds.length ? skillIds : undefined, 'evidence_change');
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, err: Error) {
    this.logger.warn(`readiness job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts.attempts}): ${err.message}`);
  }
}

/** Batch readiness for a whole cohort. */
@Processor(QUEUES.BATCH)
export class BatchProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(BatchProcessor.name);
  constructor(private readonly runner: BatchRunner) {
    super();
  }

  onModuleInit() {
    // One batch at a time per worker; parallelism happens inside a batch (chunks).
    this.worker.concurrency = 1;
  }

  async process(job: Job<{ batchJobId: string }>) {
    const batch = await this.runner.run(job.data.batchJobId, (p) => job.updateProgress(p));
    return { status: batch.status, processed: batch.processed, failed: batch.failed, skippedUnchanged: batch.skippedUnchanged };
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<{ batchJobId: string }> | undefined, err: Error) {
    this.logger.error(`batch job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts.attempts}): ${err.message}`);
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await this.runner.markFailed(job.data.batchJobId, `Failed after ${job.attemptsMade} attempt(s): ${err.message}`);
    }
  }
}

/** Registers the queue consumers. Imported by the worker process (and by the API when EMBED_WORKER=true). */
@Module({
  imports: [ReadinessModule, AiModule],
  providers: [BatchRunner, ReadinessProcessor, BatchProcessor, AiProcessor],
  exports: [BatchRunner],
})
export class ProcessorsModule {}
