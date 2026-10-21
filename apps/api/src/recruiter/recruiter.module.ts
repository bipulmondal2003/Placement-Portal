import { Module } from '@nestjs/common';
import { RecruiterAccessController, RecruiterController } from './recruiter.controller';
import { RecruiterService } from './recruiter.service';

@Module({ controllers: [RecruiterController, RecruiterAccessController], providers: [RecruiterService], exports: [RecruiterService] })
export class RecruiterModule {}
