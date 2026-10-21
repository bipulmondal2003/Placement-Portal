/**
 * Deterministic eligibility engine.
 *
 * Eligibility answers ONLY: "does the student satisfy the formal recruitment criteria?"
 * It never looks at skills, evidence or readiness, and readiness never looks at these rules.
 * No AI is involved anywhere in this file.
 */
export interface StudentFacts {
  department?: string | null;
  graduationYear?: number | null;
  cgpa?: number | null;
  tenthPercent?: number | null;
  twelfthPercent?: number | null;
  activeBacklogs?: number | null;
  historyOfBacklogs?: boolean | null;
}

export interface EligibilityRuleData {
  minCgpa?: number | null;
  minTenthPercent?: number | null;
  minTwelfthPercent?: number | null;
  departments?: string[];
  graduationYears?: number[];
  maxActiveBacklogs?: number | null;
  allowHistoryOfBacklogs?: boolean;
}

export interface EligibilityCheck {
  code: 'department' | 'graduation_year' | 'cgpa' | 'tenth_percent' | 'twelfth_percent' | 'active_backlogs' | 'backlog_history';
  label: string;
  passed: boolean;
  required: string;
  actual: string;
  message: string;
}

export interface EligibilityResult {
  eligible: boolean;
  checks: EligibilityCheck[];
  /** Human-readable reasons for every failed check (empty when eligible). */
  reasons: string[];
}

const norm = (s: string) => s.trim().toLowerCase();

export function evaluateEligibility(student: StudentFacts, rule: EligibilityRuleData | null | undefined): EligibilityResult {
  const checks: EligibilityCheck[] = [];
  const r = rule ?? {};

  if (r.departments && r.departments.length > 0) {
    const ok = !!student.department && r.departments.map(norm).includes(norm(student.department));
    checks.push({
      code: 'department',
      label: 'Department',
      passed: ok,
      required: r.departments.join(', '),
      actual: student.department || 'not set',
      message: ok
        ? 'Department is eligible'
        : student.department
          ? `Department "${student.department}" is not in the eligible list (${r.departments.join(', ')})`
          : 'Your department is not set on your profile',
    });
  }

  if (r.graduationYears && r.graduationYears.length > 0) {
    const ok = student.graduationYear != null && r.graduationYears.includes(student.graduationYear);
    checks.push({
      code: 'graduation_year',
      label: 'Graduation year',
      passed: ok,
      required: r.graduationYears.join(', '),
      actual: student.graduationYear != null ? String(student.graduationYear) : 'not set',
      message: ok
        ? 'Graduation year is eligible'
        : student.graduationYear != null
          ? `Graduation year ${student.graduationYear} is not eligible (allowed: ${r.graduationYears.join(', ')})`
          : 'Your graduation year is not set on your profile',
    });
  }

  const minCheck = (
    code: 'cgpa' | 'tenth_percent' | 'twelfth_percent',
    label: string,
    min: number | null | undefined,
    actual: number | null | undefined,
    unit: string,
  ) => {
    if (min == null) return;
    const ok = actual != null && actual >= min;
    checks.push({
      code,
      label,
      passed: ok,
      required: `>= ${min}${unit}`,
      actual: actual != null ? `${actual}${unit}` : 'not recorded',
      message: ok
        ? `${label} requirement met`
        : actual != null
          ? `${label} ${actual}${unit} is below the minimum of ${min}${unit}`
          : `${label} is not recorded on your profile (minimum ${min}${unit})`,
    });
  };
  minCheck('cgpa', 'CGPA', r.minCgpa, student.cgpa, '');
  minCheck('tenth_percent', '10th percentage', r.minTenthPercent, student.tenthPercent, '%');
  minCheck('twelfth_percent', '12th percentage', r.minTwelfthPercent, student.twelfthPercent, '%');

  if (r.maxActiveBacklogs != null) {
    const actual = student.activeBacklogs ?? 0;
    const ok = actual <= r.maxActiveBacklogs;
    checks.push({
      code: 'active_backlogs',
      label: 'Active backlogs',
      passed: ok,
      required: `<= ${r.maxActiveBacklogs}`,
      actual: String(actual),
      message: ok ? 'Active backlog limit satisfied' : `${actual} active backlog(s) exceed the allowed maximum of ${r.maxActiveBacklogs}`,
    });
  }

  if (r.allowHistoryOfBacklogs === false) {
    const has = !!student.historyOfBacklogs;
    checks.push({
      code: 'backlog_history',
      label: 'Backlog history',
      passed: !has,
      required: 'no history of backlogs',
      actual: has ? 'has history of backlogs' : 'none',
      message: has ? 'This drive does not allow candidates with a history of backlogs' : 'No backlog history',
    });
  }

  const failed = checks.filter((c) => !c.passed);
  return { eligible: failed.length === 0, checks, reasons: failed.map((c) => c.message) };
}
