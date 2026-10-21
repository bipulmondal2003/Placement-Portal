import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DriveStatus } from '../common/constants';
import { BatchJob, BatchJobDocument } from '../database/schemas/system.schema';
import { StudentProfile, StudentProfileDocument } from '../database/schemas/user.schema';
import { ReadinessService } from '../readiness/readiness.service';

export const BATCH_CHUNK_SIZE = 100;

/**
 * Executes a batch readiness recalculation. Kept separate from the BullMQ processor so the logic is
 * unit-testable without Redis. Re-running is cheap and safe: unchanged inputs are skipped via inputsHash.
 */
@Injectable()
export class BatchRunner {
  private readonly logger = new Logger(BatchRunner.name);

  constructor(
    @InjectModel(BatchJob.name) private readonly batches: Model<BatchJobDocument>,
    @InjectModel(StudentProfile.name) private readonly profiles: Model<StudentProfileDocument>,
    private readonly readiness: ReadinessService,
    private readonly config: ConfigService,
  ) {}

  async run(batchJobId: string, onProgress?: (percent: number) => Promise<unknown> | void): Promise<BatchJobDocument> {
    const batch = await this.batches.findById(batchJobId);
    if (!batch) throw new Error(`BatchJob ${batchJobId} not found`);

    // Reset counters: a retried attempt starts clean (the work itself is idempotent).
    batch.status = 'active';
    batch.startedAt = new Date();
    batch.finishedAt = undefined;
    batch.processed = 0;
    batch.failed = 0;
    batch.skippedUnchanged = 0;
    batch.errorLog = [];
    await batch.save();

    const scope = batch.scope ?? {};
    const contexts = scope.driveIds?.length
      ? await this.readiness.loadDriveContexts(scope.driveIds, Object.values(DriveStatus))
      : await this.readiness.loadDriveContexts(undefined, [DriveStatus.Published]);

    const filter: Record<string, any> = {};
    if (scope.department) filter.department = scope.department;
    if (scope.graduationYear) filter.graduationYear = scope.graduationYear;
    const studentIds = (await this.profiles.find(filter).select('user').lean()).map((p) => String(p.user));

    batch.total = studentIds.length;
    await batch.save();

    if (!contexts.length || !studentIds.length) {
      batch.status = 'completed';
      batch.errorLog = [!contexts.length ? 'No drives in scope' : 'No students in scope'];
      batch.finishedAt = new Date();
      await batch.save();
      await onProgress?.(100);
      return batch;
    }

    const chunks: string[][] = [];
    for (let i = 0; i < studentIds.length; i += BATCH_CHUNK_SIZE) chunks.push(studentIds.slice(i, i + BATCH_CHUNK_SIZE));
    const concurrency = Math.max(1, this.config.get<number>('BATCH_CONCURRENCY') ?? 4);
    let failedChunks = 0;

    for (let i = 0; i < chunks.length; i += concurrency) {
      const group = chunks.slice(i, i + concurrency);
      await Promise.all(
        group.map(async (chunk) => {
          try {
            const { stats } = await this.readiness.computeMany(chunk, contexts, 'batch');
            await this.batches.updateOne(
              { _id: batch._id },
              {
                $inc: { processed: chunk.length, failed: stats.failed, skippedUnchanged: stats.skippedUnchanged },
                ...(stats.errors.length ? { $push: { errorLog: { $each: stats.errors.slice(0, 5), $slice: -50 } } } : {}),
              },
            );
          } catch (err) {
            failedChunks++;
            this.logger.error(`Batch ${batchJobId} chunk failed: ${(err as Error).message}`);
            await this.batches.updateOne(
              { _id: batch._id },
              { $inc: { failed: chunk.length }, $push: { errorLog: { $each: [`chunk error: ${(err as Error).message}`], $slice: -50 } } },
            );
          }
        }),
      );
      const done = Math.min(chunks.length, i + concurrency);
      await onProgress?.(Math.round((100 * done) / chunks.length));
    }

    const final = (await this.batches.findById(batchJobId))!;
    final.status = failedChunks === chunks.length ? 'failed' : final.failed > 0 ? 'partial' : 'completed';
    final.finishedAt = new Date();
    await final.save();
    return final;
  }

  /** Called when BullMQ has exhausted all retries. */
  async markFailed(batchJobId: string, reason: string) {
    await this.batches.updateOne(
      { _id: batchJobId },
      { $set: { status: 'failed', finishedAt: new Date() }, $push: { errorLog: { $each: [reason], $slice: -50 } } },
    );
  }
}
