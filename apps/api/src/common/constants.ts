export enum Role {
  Student = 'student',
  Faculty = 'faculty',
  PlacementOfficer = 'placement_officer',
  PlacementHead = 'placement_head',
  Recruiter = 'recruiter',
  Admin = 'admin',
}

export const STAFF_ROLES = [Role.Faculty, Role.PlacementOfficer, Role.PlacementHead, Role.Admin];
export const PLACEMENT_CELL = [Role.PlacementOfficer, Role.PlacementHead];

/** Proficiency scale used for requirements, evidence and verified levels. */
export const PROFICIENCY_SCALE = [
  { level: 0, label: 'None', description: 'No demonstrated knowledge' },
  { level: 1, label: 'Awareness', description: 'Knows the concepts and vocabulary' },
  { level: 2, label: 'Beginner', description: 'Can complete guided tasks' },
  { level: 3, label: 'Intermediate', description: 'Works independently on standard problems' },
  { level: 4, label: 'Advanced', description: 'Solves complex problems and makes design trade-offs' },
  { level: 5, label: 'Expert', description: 'Can mentor others and handle novel, ambiguous problems' },
] as const;
export const MAX_LEVEL = 5;

export enum EvidenceType {
  Academic = 'academic',
  Project = 'project',
  Assessment = 'assessment',
  MockInterview = 'mock_interview',
  Certification = 'certification',
  External = 'external',
}

export enum EvidenceStatus {
  Pending = 'pending',
  Verified = 'verified',
  Rejected = 'rejected',
}

export enum EvidenceSource {
  Manual = 'manual',
  ResumeAi = 'resume_ai',
  System = 'system',
  Faculty = 'faculty',
}

export enum SkillDimension {
  Technical = 'technical',
  Aptitude = 'aptitude',
  Communication = 'communication',
}

export const SKILL_CATEGORIES = [
  'Programming Languages',
  'Data Structures & Algorithms',
  'Frontend Development',
  'Backend Development',
  'Databases',
  'Cloud & DevOps',
  'Software Engineering',
  'Aptitude & Communication',
  'Data & Analytics',
  'Testing & QA',
] as const;

export enum DriveStatus {
  Draft = 'draft',
  Published = 'published',
  Closed = 'closed',
  Completed = 'completed',
}

export enum RegistrationStatus {
  Registered = 'registered',
  Shortlisted = 'shortlisted',
  Selected = 'selected',
  Rejected = 'rejected',
  Withdrawn = 'withdrawn',
}

/**
 * Fields a recruiter can ever be granted. Anything not listed here can never be released,
 * regardless of what an officer submits. Documented in docs/data-release-policy.md.
 */
export const RECRUITER_RELEASABLE_FIELDS = [
  'name',
  'department',
  'graduationYear',
  'cgpa',
  'readinessScore',
  'readinessDimensions',
  'verifiedSkills',
  'projects',
  'email',
  'phone',
] as const;
export type ReleasableField = (typeof RECRUITER_RELEASABLE_FIELDS)[number];

export const QUEUES = {
  READINESS: 'readiness',
  BATCH: 'batch-readiness',
  AI: 'ai-tasks',
} as const;

export const COOKIE_APP = 'prp_session';
export const COOKIE_RECRUITER = 'prp_recruiter_session';
