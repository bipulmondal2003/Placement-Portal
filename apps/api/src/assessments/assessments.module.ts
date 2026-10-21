import { Module } from '@nestjs/common';
import { AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';
import { MockInterviewsService } from './mock-interviews.service';

@Module({ controllers: [AssessmentsController], providers: [AssessmentsService, MockInterviewsService], exports: [AssessmentsService, MockInterviewsService] })
export class AssessmentsModule {}
