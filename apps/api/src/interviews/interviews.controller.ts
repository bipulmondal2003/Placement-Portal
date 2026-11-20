import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsInt, IsMongoId, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AuthUser, ClientIp, CurrentUser, Roles } from '../common/decorators';
import { Role } from '../common/constants';
import { InterviewsService } from './interviews.service';

const AI_LIMIT = { default: { limit: Number(process.env.AI_THROTTLE_LIMIT ?? 10) * 3, ttl: 60_000 } };

class StartDto {
  @IsMongoId() roleId: string;
  @IsOptional() @IsInt() @Min(3) @Max(8) questionCount?: number;
  @IsOptional() @IsIn(['beginner', 'intermediate', 'advanced']) difficulty?: 'beginner' | 'intermediate' | 'advanced';
  @IsOptional() @IsIn(['ai', 'practice']) mode?: 'ai' | 'practice';
}
class AnswerDto {
  @IsString() @MinLength(1) @MaxLength(6000) answer: string;
}

@ApiTags('interviews')
@Roles(Role.Student)
@Controller('interviews')
export class InterviewsController {
  constructor(private readonly svc: InterviewsService) {}

  @Get('options')
  options() {
    return this.svc.options();
  }

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.svc.list(u);
  }

  @Throttle(AI_LIMIT)
  @Post()
  start(@CurrentUser() u: AuthUser, @Body() dto: StartDto, @ClientIp() ip: string) {
    return this.svc.start(u, dto, ip);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.get(u, id);
  }

  @Throttle(AI_LIMIT)
  @Post(':id/answer')
  answer(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: AnswerDto, @ClientIp() ip: string) {
    return this.svc.answer(u, id, dto.answer, ip);
  }

  @Post(':id/end')
  end(@CurrentUser() u: AuthUser, @Param('id') id: string, @ClientIp() ip: string) {
    return this.svc.end(u, id, ip);
  }

  @Delete(':id')
  discard(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.discard(u, id);
  }
}
