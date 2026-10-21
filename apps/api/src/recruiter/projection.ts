import { RECRUITER_RELEASABLE_FIELDS, ReleasableField } from '../common/constants';

/**
 * Field-level release control. Everything a recruiter can ever receive about a candidate passes through
 * `projectCandidate`. It is a WHITELIST: a field leaves the system only if
 *   (a) it is in RECRUITER_RELEASABLE_FIELDS (hard-coded ceiling), and
 *   (b) it is in the grant's `releasedFields` (explicitly approved per recruiter and drive).
 * Student ids, mentors, backlog data, eligibility reasons, evidence, self-reported levels and anything else
 * are not releasable under any grant.
 */
export interface CandidateSource {
  candidateId: string;
  registrationStatus: string;
  name?: string;
  email?: string;
  phone?: string;
  department?: string;
  graduationYear?: number;
  cgpa?: number;
  readiness?: { score: number; dimensions: Record<string, number | null> } | null;
  verifiedSkills?: Array<{ name: string; level: number }>;
  projects?: Array<{ title: string; techStack?: string[] }>;
}

export function effectiveFields(released: string[]): ReleasableField[] {
  const ceiling = new Set<string>(RECRUITER_RELEASABLE_FIELDS);
  return [...new Set(released)].filter((f) => ceiling.has(f)) as ReleasableField[];
}

export function projectCandidate(src: CandidateSource, released: string[]): Record<string, any> {
  const fields = new Set<string>(effectiveFields(released));
  // The candidate id is a drive-scoped registration id, never the student's user id.
  const out: Record<string, any> = { candidateId: src.candidateId, status: src.registrationStatus };
  if (fields.has('name')) out.name = src.name;
  if (fields.has('department')) out.department = src.department;
  if (fields.has('graduationYear')) out.graduationYear = src.graduationYear;
  if (fields.has('cgpa')) out.cgpa = src.cgpa;
  if (fields.has('readinessScore')) out.readinessScore = src.readiness?.score ?? null;
  if (fields.has('readinessDimensions')) out.readinessDimensions = src.readiness?.dimensions ?? null;
  if (fields.has('verifiedSkills')) out.verifiedSkills = (src.verifiedSkills ?? []).map((s) => ({ name: s.name, level: s.level }));
  if (fields.has('projects')) out.projects = (src.projects ?? []).map((p) => ({ title: p.title, techStack: p.techStack ?? [] }));
  if (fields.has('email')) out.email = src.email;
  if (fields.has('phone')) out.phone = src.phone;
  return out;
}

/** Which search filters a grant allows. Filtering on a hidden attribute would let a recruiter infer it. */
export const FILTER_REQUIRES: Record<string, ReleasableField> = {
  skill: 'verifiedSkills',
  minLevel: 'verifiedSkills',
  minReadiness: 'readinessScore',
  department: 'department',
  graduationYear: 'graduationYear',
  minCgpa: 'cgpa',
  q: 'name',
};

export function disallowedFilters(used: string[], released: string[]): string[] {
  const allowed = new Set<string>(effectiveFields(released));
  return used.filter((f) => FILTER_REQUIRES[f] && !allowed.has(FILTER_REQUIRES[f]));
}

/** Contact details are the most sensitive release; only the Placement Head may approve them. */
export const HEAD_ONLY_FIELDS: ReleasableField[] = ['email', 'phone'];
