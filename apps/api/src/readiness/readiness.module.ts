import { Global, Module } from '@nestjs/common';
import { ReadinessService } from './readiness.service';
import { SkillProfileService } from './skill-profile.service';

@Global()
@Module({
  providers: [SkillProfileService, ReadinessService],
  exports: [SkillProfileService, ReadinessService],
})
export class ReadinessModule {}
