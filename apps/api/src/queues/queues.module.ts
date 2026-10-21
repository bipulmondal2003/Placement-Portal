import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { redisOptionsFromUrl } from '../config/redis';
import { QUEUES } from '../common/constants';
import { ReadinessModule } from '../readiness/readiness.module';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';

/**
 * Producer side of the queues. Used by the API process (and by the worker process, which adds consumers
 * through ProcessorsModule). One connection strategy: REDIS_URL.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          ...redisOptionsFromUrl(config.get<string>('REDIS_URL')!),
          // Producers must fail fast when Redis is down so callers can degrade instead of hanging.
          enableOfflineQueue: false,
          maxRetriesPerRequest: null,
        },
        prefix: 'prp',
      }),
    }),
    BullModule.registerQueue({ name: QUEUES.READINESS }, { name: QUEUES.BATCH }, { name: QUEUES.AI }),
    ReadinessModule,
  ],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService, BullModule],
})
export class QueuesModule {}
