export interface DriveLite {
  id: string;
  company: string;
  role: string;
  deadline: string;
  status: string;
}

export interface Gap {
  key: string;
  skillId?: string;
  clusterId?: string;
  label: string;
  kind: string;
  dimension: string;
  requiredLevel: number;
  verifiedLevel: number;
  selfReportedLevel: number;
  gap: number;
  weight: number;
  mandatory: boolean;
  impact: number;
  evidenceState: string;
  action: string;
  credit: number;
  matchedVia?: string;
}

export interface EligibilityCheck {
  code: string;
  label: string;
  passed: boolean;
  required: string;
  actual: string;
  message: string;
}

export interface Dimensions {
  technical: number | null;
  aptitude: number | null;
  communication: number | null;
  projectDepth: number | null;
}

export interface Match {
  driveId: string;
  studentId: string;
  eligibility: { eligible: boolean; reasons: string[]; checks: EligibilityCheck[] };
  readiness: {
    score: number;
    dimensions: Dimensions;
    explanation: string[];
    gaps: Gap[];
    met: Gap[];
    nextActions: string[];
    cappedByMandatory: boolean;
  };
}

export interface ReadinessDetail extends Match {
  readiness: Match['readiness'] & { history: Array<{ _id: string; score: number; dimensions: Dimensions; trigger: string; computedAt: string }> };
}

export interface Registration {
  _id: string;
  status: string;
}

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
  myRegistration?: Registration | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface PlanTask {
  _id: string;
  plan: string | { _id: string; drive?: { _id: string; company: string; role: string } };
  dayIndex: number;
  date: string;
  title: string;
  objective: string;
  activity: string;
  exercise: string;
  expectedOutcome: string;
  estimatedMinutes: number;
  skill?: { _id: string; name: string } | null;
  checkpoint: boolean;
  status: 'todo' | 'in_progress' | 'done';
}

export interface Progress {
  total: number;
  done: number;
  inProgress: number;
  percent: number;
  minutesDone: number;
  minutesTotal: number;
}

export interface Plan {
  _id: string;
  drive: { _id: string; company: string; role: string; deadline?: string };
  startDate: string;
  endDate: string;
  hoursPerDay: number;
  source: 'ai' | 'rule_based';
  summary?: string;
  status: string;
  progress: Progress;
  stale?: boolean;
  tasks?: PlanTask[];
}

export interface TaxSkill {
  id: string;
  name: string;
  slug: string;
  category: string;
  description?: string;
  dimension: string;
  synonyms: string[];
}

export interface EvidenceSkill {
  skill: { _id: string; name: string };
  claimedLevel: number;
}

export interface Evidence {
  _id: string;
  type: 'project' | 'certification' | 'academic' | 'external' | 'assessment' | 'mock_interview';
  title: string;
  description?: string;
  url?: string;
  skills: EvidenceSkill[];
  source: string;
  status: 'pending' | 'verified' | 'rejected';
  createdAt: string;
  updatedAt: string;
  history?: Array<{
    _id: string;
    decision: 'approved' | 'rejected' | 'system_approved';
    comment?: string;
    reviewer?: { _id: string; name: string } | null;
    awarded?: Array<{ skill: string; claimedLevel: number; awardedLevel: number }>;
    createdAt: string;
  }>;
}
