import { ReadinessModule } from './readiness/readiness.module';
import { QueuesModule } from './queues/queues.module';
import { SkillsModule } from './skills/skills.module';
import { EvidenceModule } from './evidence/evidence.module';
import { DrivesModule } from './drives/drives.module';
import { StudentsModule } from './students/students.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { PlansModule } from './plans/plans.module';
import { RecruiterModule } from './recruiter/recruiter.module';
import { ReportsModule } from './reports/reports.module';
import { AiModule } from './ai/ai.module';

/**
 * Feature modules are registered here as they are built, so AppModule stays small.
 */
export const DomainModules: any[] = [
  ReadinessModule,
  QueuesModule,
  SkillsModule,
  EvidenceModule,
  DrivesModule,
  StudentsModule,
  AssessmentsModule,
  PlansModule,
  RecruiterModule,
  ReportsModule,
  AiModule,
];
