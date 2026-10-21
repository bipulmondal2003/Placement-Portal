import { Global, Logger, Module, OnApplicationShutdown, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import { redisOptionsFromUrl } from '../config/redis';
import { CacheService, REDIS_CLIENT } from './cache.service';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logger = new Logger('Redis');
        const client = new IORedis({
          ...redisOptionsFromUrl(config.get<string>('REDIS_URL')!),
          // Fail fast for cache commands when Redis is down instead of queueing forever.
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          retryStrategy: (times) => Math.min(times * 500, 5000),
        });
        client.on('error', (e) => logger.warn(`Redis error: ${e.message}`));
        client.on('ready', () => logger.log('Redis connected'));
        return client;
      },
    },
    CacheService,
  ],
  exports: [REDIS_CLIENT, CacheService],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly client: IORedis) {}
  async onApplicationShutdown() {
    await this.client.quit().catch(() => undefined);
  }
}
