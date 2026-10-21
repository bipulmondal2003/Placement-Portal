export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}
export interface Bin { range: string; count: number }
export interface Distribution {
  total: number;
  average: number;
  bins: Bin[];
  dimensionAverages: { technical: number; aptitude: number; communication: number; projectDepth: number };
}
export interface SupplyRow {
  label: string;
  kind: string;
  demandDrives: number;
  totalWeight: number;
  averageRequiredLevel: number;
  mandatory: boolean;
  studentsInScope: number;
  supplyAtTarget: number;
  supplyAnyVerified: number;
  coveragePercent: number;
  shortfall: number;
  priority: number;
}
export interface DriveRef { id: string; company: string; role: string; status: string }
export interface FunnelRow {
  drive: DriveRef;
  totalStudents: number;
  eligible: number;
  registered: number;
  shortlisted: number;
  selected: number;
  conversion: { eligibleToRegistered: number; registeredToShortlisted: number; shortlistedToSelected: number };
}
export interface DeptRow { department: string; students: number; averageReadiness: number; readyPercent: number; verifiedStudentPercent: number; registrations: number; selected: number }
export interface BatchRow { graduationYear: number; students: number; averageReadiness: number }
export interface TrendRow { week: string; averageReadiness: number; snapshots: number }
export interface Training {
  note: string;
  planCompletionVsReadinessChange: Array<{ band: string; students: number; averageReadinessChange: number }>;
  assessmentImprovement: Array<{ assessment: string; studentsWithRetakes: number; averageImprovementPoints: number }>;
}
export interface QueueCounts { active: number; completed: number; delayed: number; failed: number; paused: number; prioritized: number; waiting: number; 'waiting-children': number }
export interface Queues { available: boolean; queues?: Record<string, QueueCounts> }
export interface Drive {
  _id: string;
  company: string;
  role: string;
  description?: string;
  roleFamily?: string;
  status: string;
  deadline: string;
  driveDate?: string;
  location?: string;
  package?: string;
  requirementsVersion: number;
}
export interface Requirement {
  id: string;
  kind: 'skill' | 'cluster';
  skill?: { id: string; name: string; category: string } | null;
  cluster?: { id: string; name: string } | null;
  requiredLevel: number;
  weight: number;
  mandatory: boolean;
}
export interface EligibilityRule {
  minCgpa?: number;
  minTenthPercent?: number;
  minTwelfthPercent?: number;
  departments?: string[];
  graduationYears?: number[];
  maxActiveBacklogs?: number;
  allowHistoryOfBacklogs?: boolean;
}
export interface DriveDetail extends Drive {
  requirements: Requirement[];
  eligibilityRule?: EligibilityRule | null;
  registrationCount: number;
}
export interface Taxonomy {
  skills: Array<{ id: string; name: string; category: string; dimension: string }>;
  clusters: Array<{ id: string; name: string; description: string }>;
}
export interface SkillMeta { proficiencyScale: Array<{ level: number; label: string; description: string }> }
export interface Batch {
  _id: string;
  status: string;
  scope: { driveIds?: string[]; department?: string; graduationYear?: number };
  total: number;
  processed: number;
  failed: number;
  skippedUnchanged: number;
  errorLog: string[];
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  percent?: number;
}
export const DEPARTMENTS_HINT = 'Leave empty for all departments';
export const DRIVE_STATUSES = ['draft', 'published', 'closed', 'completed'] as const;
