import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema, StudentProfile, StudentProfileSchema } from './schemas/user.schema';
import { Skill, SkillSchema, SkillCluster, SkillClusterSchema, SkillSynonym, SkillSynonymSchema } from './schemas/skill.schema';
import { EvidenceItem, EvidenceItemSchema, Verification, VerificationSchema } from './schemas/evidence.schema';
import {
  Assessment,
  AssessmentSchema,
  AssessmentAttempt,
  AssessmentAttemptSchema,
  MockInterview,
  MockInterviewSchema,
} from './schemas/assessment.schema';
import {
  PlacementDrive,
  PlacementDriveSchema,
  DriveRequirement,
  DriveRequirementSchema,
  EligibilityRule,
  EligibilityRuleSchema,
  Registration,
  RegistrationSchema,
} from './schemas/drive.schema';
import {
  SkillProfile,
  SkillProfileSchema,
  ReadinessSnapshot,
  ReadinessSnapshotSchema,
  GapAnalysis,
  GapAnalysisSchema,
} from './schemas/readiness.schema';
import { PreparationPlan, PreparationPlanSchema, PreparationTask, PreparationTaskSchema } from './schemas/plan.schema';
import {
  RecruiterAccessGrant,
  RecruiterAccessGrantSchema,
  AccessLog,
  AccessLogSchema,
  AuditLog,
  AuditLogSchema,
} from './schemas/recruiter.schema';
import { InterviewSession, InterviewSessionSchema } from './schemas/interview.schema';
import { StoredFile, StoredFileSchema } from './schemas/file.schema';
import { RoleProfile, RoleProfileSchema } from './schemas/role.schema';
import { BatchJob, BatchJobSchema, SystemConfig, SystemConfigSchema } from './schemas/system.schema';

const models = MongooseModule.forFeature([
  { name: User.name, schema: UserSchema },
  { name: StudentProfile.name, schema: StudentProfileSchema },
  { name: Skill.name, schema: SkillSchema },
  { name: SkillCluster.name, schema: SkillClusterSchema },
  { name: SkillSynonym.name, schema: SkillSynonymSchema },
  { name: EvidenceItem.name, schema: EvidenceItemSchema },
  { name: Verification.name, schema: VerificationSchema },
  { name: Assessment.name, schema: AssessmentSchema },
  { name: AssessmentAttempt.name, schema: AssessmentAttemptSchema },
  { name: MockInterview.name, schema: MockInterviewSchema },
  { name: PlacementDrive.name, schema: PlacementDriveSchema },
  { name: DriveRequirement.name, schema: DriveRequirementSchema },
  { name: EligibilityRule.name, schema: EligibilityRuleSchema },
  { name: Registration.name, schema: RegistrationSchema },
  { name: SkillProfile.name, schema: SkillProfileSchema },
  { name: ReadinessSnapshot.name, schema: ReadinessSnapshotSchema },
  { name: GapAnalysis.name, schema: GapAnalysisSchema },
  { name: PreparationPlan.name, schema: PreparationPlanSchema },
  { name: PreparationTask.name, schema: PreparationTaskSchema },
  { name: RecruiterAccessGrant.name, schema: RecruiterAccessGrantSchema },
  { name: AccessLog.name, schema: AccessLogSchema },
  { name: AuditLog.name, schema: AuditLogSchema },
  { name: BatchJob.name, schema: BatchJobSchema },
  { name: SystemConfig.name, schema: SystemConfigSchema },
  { name: RoleProfile.name, schema: RoleProfileSchema },
  { name: StoredFile.name, schema: StoredFileSchema },
  { name: InterviewSession.name, schema: InterviewSessionSchema },
]);

/** Registers every model once, globally, so feature modules just `@InjectModel(X.name)`. */
@Global()
@Module({ imports: [models], exports: [models] })
export class DatabaseModule {}
