import { Controller, Get, Inject } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ApiTags } from '@nestjs/swagger';
import { Connection } from 'mongoose';
import { Public } from '../common/decorators';
import { REDIS_CLIENT } from '../redis/cache.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly mongo: Connection,
    @Inject(REDIS_CLIENT) private readonly redis: { status: string },
  ) {}

  @Public()
  @Get()
  health() {
    return {
      status: 'ok',
      mongo: this.mongo.readyState === 1 ? 'up' : 'down',
      redis: this.redis.status === 'ready' ? 'up' : 'down',
      time: new Date().toISOString(),
    };
  }
}
