import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Logger, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { validateEnv } from './config/env';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { AuditModule } from './audit/audit.module';
import { AuthzModule } from './authz/authz.module';
import { SystemConfigModule } from './system-config/system-config.module';
import { ProcessorsModule } from './queues/processors';
import { DomainModules } from './domain.modules';

/**
 * Standalone BullMQ worker process (no HTTP server).
 *   development:  npm run start:worker:dev -w apps/api
 *   production:   node dist/worker.js        (docker-compose service `worker`)
 * It loads the same domain modules as the API so processors reuse the exact same services.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ uri: config.get<string>('MONGODB_URI')! }),
    }),
    DatabaseModule,
    RedisModule,
    AuditModule,
    AuthzModule,
    SystemConfigModule,
    ...DomainModules.filter((m) => !['RecruiterModule', 'ReportsModule'].includes(m.name)),
    ProcessorsModule,
  ],
})
class WorkerModule {}

async function main() {
  const app = await NestFactory.createApplicationContext(WorkerModule, { logger: ['log', 'warn', 'error'] });
  app.enableShutdownHooks();
  new Logger('Worker').log('Worker started: consuming queues readiness, batch-readiness, ai-tasks');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
