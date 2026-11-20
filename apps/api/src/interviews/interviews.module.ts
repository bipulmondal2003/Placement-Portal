import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { RolesModule } from '../roles/roles.module';
import { InterviewsController } from './interviews.controller';
import { InterviewsService } from './interviews.service';

@Module({ imports: [AiModule, RolesModule], controllers: [InterviewsController], providers: [InterviewsService] })
export class InterviewsModule {}
