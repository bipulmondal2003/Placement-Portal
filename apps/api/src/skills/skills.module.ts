import { Global, Module } from '@nestjs/common';
import { SkillsController } from './skills.controller';
import { SkillsService } from './skills.service';

@Global()
@Module({ controllers: [SkillsController], providers: [SkillsService], exports: [SkillsService] })
export class SkillsModule {}
