import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { createHash } from 'crypto';
import { Model } from 'mongoose';
import { QUEUES } from '../common/constants';
import { BatchJob, BatchJobDocument } from '../database/schemas/system.schema';
import { ReadinessService } from '../readiness/readiness.service';

export interface BatchScope {
  driveIds?: string[];
  department?: string;
  graduationYear?: number;
}

export const DEFAULT_JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: { count: 200, age: 3600 },
  removeOnFail: { count: 500 },
};

function withTimeout<T>(p: Promise<T>, ms = 3000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Redis/queue operation timed out')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectQueue(QUEUES.READINESS) private readonly readinessQueue: Queue,
    @InjectQueue(QUEUES.BATCH) private readonly batchQueue: Queue,
    @InjectQueue(QUEUES.AI) private readonly aiQueue: Queue,
    @InjectModel(BatchJob.name) private readonly batches: Model<BatchJobDocument>,
    private readonly readiness: ReadinessService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Debounced, de-duplicated recalculation request for ONE student (trailing-edge debounce).
   *  - delayed job exists  -> push its delay out again and merge the affected skills;
   *  - waiting job exists  -> merge the affected skills;
   *  - active job exists   -> schedule one follow-up so changes made mid-run are not lost;
   *  - Redis unavailable   -> recompute inline so verified evidence never leaves readiness stale.
   * Retries are safe: the readiness service only writes a snapshot when the inputs hash changed.
   */
  async requestRecalculation(studentId: string, skillIds: string[] = [], reason = 'evidence_change') {
    const delay = this.config.get<number>('RECALC_DEBOUNCE_MS') ?? 3000;
    const jobId = `recalc-${studentId}`;
    try {
      const existing = await withTimeout(this.readinessQueue.getJob(jobId));
      if (existing) {
        const state = await existing.getState();
        if (state === 'delayed' || state === 'waiting' || state === 'prioritized') {
          const prev: string[] = existing.data.skillIds ?? [];
          const merged = prev.length === 0 || skillIds.length === 0 ? [] : [...new Set([...prev, ...skillIds])];
          await existing.updateData({ ...existing.data, skillIds: merged, reason });
          if (state === 'delayed') await existing.changeDelay(delay);
          return { queued: true, debounced: true };
        }
        if (state === 'active') {
          await this.readinessQueue.add('recalculate', { studentId, skillIds, reason }, { ...DEFAULT_JOB_OPTS, jobId: `${jobId}-next`, delay });
          return { queued: true, followUp: true };
        }
        await existing.remove().catch(() => undefined); // completed/failed leftovers block re-adding the same id
      }
      await withTimeout(this.readinessQueue.add('recalculate', { studentId, skillIds, reason }, { ...DEFAULT_JOB_OPTS, jobId, delay }));
      return { queued: true };
    } catch (err) {
      this.logger.warn(`Queue unavailable (${(err as Error).message}); recalculating inline for ${studentId}`);
      await this.readiness.recomputeForStudent(studentId, skillIds, 'evidence_change');
      return { queued: false, inline: true };
    }
  }

  /** Starts a batch readiness recalculation as a background job. Returns the existing batch if an identical one is in flight. */
  async startBatch(requestedBy: string, scope: BatchScope) {
    const normalised = {
      driveIds: [...(scope.driveIds ?? [])].sort(),
      department: scope.department ?? null,
      graduationYear: scope.graduationYear ?? null,
    };
    const dedupeKey = createHash('sha1').update(JSON.stringify(normalised)).digest('hex');

    const inFlight = await this.batches.findOne({ dedupeKey, status: { $in: ['queued', 'active'] } });
    if (inFlight) return { batch: inFlight, duplicate: true };

    let batch: BatchJobDocument;
    try {
      batch = await this.batches.create({ requestedBy, scope, dedupeKey, status: 'queued' });
    } catch (err: any) {
      if (err?.code === 11000) {
        const again = await this.batches.findOne({ dedupeKey, status: { $in: ['queued', 'active'] } });
        if (again) return { batch: again, duplicate: true };
      }
      throw err;
    }

    try {
      const job = await withTimeout(
        this.batchQueue.add('batch-readiness', { batchJobId: String(batch._id) }, { ...DEFAULT_JOB_OPTS, attempts: 2, jobId: `batch-${batch._id}` }),
      );
      batch.bullJobId = String(job.id);
      await batch.save();
    } catch (err) {
      batch.status = 'failed';
      batch.errorLog = [`Could not enqueue job: ${(err as Error).message}`];
      batch.finishedAt = new Date();
      await batch.save();
      throw new ServiceUnavailableException('Background job queue (Redis) is unavailable. Start Redis and try again.');
    }
    return { batch, duplicate: false };
  }

  async queueStatus() {
    try {
      const [readiness, batch, ai] = await withTimeout(
        Promise.all([this.readinessQueue.getJobCounts(), this.batchQueue.getJobCounts(), this.aiQueue.getJobCounts()]),
      );
      return { available: true, queues: { [QUEUES.READINESS]: readiness, [QUEUES.BATCH]: batch, [QUEUES.AI]: ai } };
    } catch (err) {
      return { available: false, error: (err as Error).message, queues: {} };
    }
  }

  /** Generic AI-queue enqueue (resume analysis, bulk plan generation). */
  async enqueueAi(name: string, data: Record<string, any>, jobId?: string) {
    try {
      const job = await withTimeout(this.aiQueue.add(name, data, { ...DEFAULT_JOB_OPTS, attempts: 2, jobId }));
      return { id: String(job.id) };
    } catch (err) {
      throw new ServiceUnavailableException(`Background job queue is unavailable: ${(err as Error).message}`);
    }
  }

  async getAiJob(jobId: string) {
    try {
      let job = await withTimeout(this.aiQueue.getJob(jobId));
      if (!job) return null;
      const state = await job.getState();
      // The job may have finished between the two reads above; re-read so returnvalue/failedReason are current.
      if (state === 'completed' || state === 'failed') job = (await withTimeout(this.aiQueue.getJob(jobId))) ?? job;
      return { id: String(job.id), state, data: job.data, result: job.returnvalue, failedReason: job.failedReason, progress: job.progress };
    } catch (err) {
      throw new ServiceUnavailableException(`Background job queue is unavailable: ${(err as Error).message}`);
    }
  }
}
