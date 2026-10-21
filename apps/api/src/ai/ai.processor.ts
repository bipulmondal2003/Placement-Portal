import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnModuleInit } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUES } from '../common/constants';
import { AiFeaturesService } from './ai-features.service';
import { AiError } from './ai.errors';

/**
 * Long-running AI work. Concurrency is deliberately low and BullMQ's limiter caps the call rate so a burst of
 * jobs can't exhaust the Gemini quota. Only transient provider errors are retried; permanent ones fail fast.
 */
@Processor(QUEUES.AI, { limiter: { max: 10, duration: 60_000 } })
export class AiProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(AiProcessor.name);
  constructor(private readonly features: AiFeaturesService, private readonly config: ConfigService) {
    super();
  }

  onModuleInit() {
    this.worker.concurrency = 2;
  }

  async process(job: Job<{ studentId: string; text: string }>) {
    if (job.name !== 'resume-analysis') throw new Error(`Unknown AI job: ${job.name}`);
    try {
      return await this.features.resumeAnalyze(job.data.studentId, job.data.text);
    } catch (err) {
      const permanent = err instanceof AiError && ['AI_DISABLED', 'AI_NOT_CONFIGURED', 'AI_AUTH_FAILED', 'AI_MODEL_UNAVAILABLE', 'AI_BLOCKED'].includes(err.code);
      if (permanent) await job.discard();
      throw err;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, err: Error) {
    this.logger.warn(`ai job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts.attempts}): ${err.message}`);
  }
}
