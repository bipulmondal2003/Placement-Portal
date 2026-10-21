import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiFeaturesService } from './ai-features.service';
import { genAiProvider } from './ai.client';

@Module({
  controllers: [AiController],
  providers: [genAiProvider, AiService, AiFeaturesService],
  exports: [AiService, AiFeaturesService],
})
export class AiModule {}
