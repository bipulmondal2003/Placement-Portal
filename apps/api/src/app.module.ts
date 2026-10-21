
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as path from 'node:path';

import { validateEnv } from './config/env';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { AuditModule } from './audit/audit.module';
import { AuthzModule } from './authz/authz.module';
import { SystemConfigModule } from './system-config/system-config.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { UsersModule } from './users/users.module';
import { HealthController } from './health/health.controller';
import { DomainModules } from './domain.modules';
import { ProcessorsModule } from './queues/processors';

/**
 * In development, the API also consumes queues so a single process is enough.
 * In production, run node dist/worker.js separately.
 */
const embedWorker = () =>
  (
    process.env.EMBED_WORKER ??
    (process.env.NODE_ENV === 'production' ? 'false' : 'true')
  ).toLowerCase() === 'true';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), '../../.env'),
        path.resolve(__dirname, '../../../.env'),
      ],
      validate: validateEnv,
    }),

    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI')!,
      }),
    }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'default',
          ttl: 60_000,
          limit: config.get<number>('THROTTLE_LIMIT')!,
        },
        {
          name: 'recruiter',
          ttl: 60_000,
          limit: config.get<number>('RECRUITER_THROTTLE_LIMIT')!,
          skipIf: (ctx) =>
            !/^\/api\/recruiter(?:\/|$)/.test(
              ctx.switchToHttp().getRequest().originalUrl ?? '',
            ),
        },
      ],
    }),

    DatabaseModule,
    RedisModule,
    AuditModule,
    AuthzModule,
    SystemConfigModule,
    AuthModule,
    UsersModule,
    ...DomainModules,
    ...(embedWorker() ? [ProcessorsModule] : []),
  ],

  controllers: [HealthController],

  providers: [
    // Order matters: rate limit -> authenticate -> authorise by role.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}




// import { Module } from '@nestjs/common';
// import { ConfigModule, ConfigService } from '@nestjs/config';
// import { APP_GUARD } from '@nestjs/core';
// import { MongooseModule } from '@nestjs/mongoose';
// import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
// import { validateEnv } from './config/env';
// import { DatabaseModule } from './database/database.module';
// import { RedisModule } from './redis/redis.module';
// import { AuditModule } from './audit/audit.module';
// import { AuthzModule } from './authz/authz.module';
// import { SystemConfigModule } from './system-config/system-config.module';
// import { AuthModule } from './auth/auth.module';
// import { JwtAuthGuard } from './auth/jwt-auth.guard';
// import { RolesGuard } from './auth/roles.guard';
// import { UsersModule } from './users/users.module';
// import { HealthController } from './health/health.controller';
// import { DomainModules } from './domain.modules';
// import { ProcessorsModule } from './queues/processors';

// /** In development the API also consumes queues so a single process is enough. In production run `node dist/worker.js` separately. */
// const embedWorker = () => (process.env.EMBED_WORKER ?? (process.env.NODE_ENV === 'production' ? 'false' : 'true')).toLowerCase() === 'true';

// @Module({
//   imports: [
//     ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
//     MongooseModule.forRootAsync({
//       inject: [ConfigService],
//       useFactory: (config: ConfigService) => ({ uri: config.get<string>('MONGODB_URI')! }),
//     }),
//     ThrottlerModule.forRootAsync({
//       inject: [ConfigService],
//       useFactory: (config: ConfigService) => [
//         { name: 'default', ttl: 60_000, limit: config.get<number>('THROTTLE_LIMIT')! },
//         {
//           // Stricter limit applied only to the recruiter portal route group.
//           name: 'recruiter',
//           ttl: 60_000,
//           limit: config.get<number>('RECRUITER_THROTTLE_LIMIT')!,
//           skipIf: (ctx) => !/^\/api\/recruiter\//.test(ctx.switchToHttp().getRequest().originalUrl ?? ''),
//         },
//       ],
//     }),
//     DatabaseModule,
//     RedisModule,
//     AuditModule,
//     AuthzModule,
//     SystemConfigModule,
//     AuthModule,
//     UsersModule,
//     ...DomainModules,
//     ...(embedWorker() ? [ProcessorsModule] : []),
//   ],
//   controllers: [HealthController],
//   providers: [
//     // Order matters: rate limit -> authenticate -> authorise by role.
//     { provide: APP_GUARD, useClass: ThrottlerGuard },
//     { provide: APP_GUARD, useClass: JwtAuthGuard },
//     { provide: APP_GUARD, useClass: RolesGuard },
//   ],
// })
// export class AppModule {}
