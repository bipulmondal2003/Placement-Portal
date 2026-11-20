import { GapResult, ReadinessResult } from '../readiness/readiness.engine';

/**
 * Plain-language readiness indication for a score. Purely presentational: it is derived from the
 * deterministic score and never feeds back into it.
 */
export type ReadinessBand = 'getting_started' | 'building' | 'almost_ready' | 'role_ready';
export const BAND_LABELS: Record<ReadinessBand, string> = {
  getting_started: 'Getting started',
  building: 'Building up',
  almost_ready: 'Almost ready',
  role_ready: 'Role-ready',
};
export function readinessBand(score: number): ReadinessBand {
  if (score >= 85) return 'role_ready';
  if (score >= 65) return 'almost_ready';
  if (score >= 40) return 'building';
  return 'getting_started';
}

const slim = (g: GapResult) => ({
  key: g.key,
  skillId: g.skillId,
  clusterId: g.clusterId,
  label: g.label,
  dimension: g.dimension,
  requiredLevel: g.requiredLevel,
  verifiedLevel: g.verifiedLevel,
  selfReportedLevel: g.selfReportedLevel,
  weight: g.weight,
  mandatory: g.mandatory,
  gap: g.gap,
  evidenceState: g.evidenceState,
  matchedVia: g.matchedVia,
  action: g.action,
});

/** Splits an engine result into the three student-facing groups: matched, needs improvement, missing. */
export function groupMatch(result: ReadinessResult) {
  const matched = [...result.met, ...result.gaps.filter((g) => g.gap === 0)].map(slim);
  const improve = result.gaps.filter((g) => g.gap > 0 && g.verifiedLevel > 0).map(slim);
  const missing = result.gaps.filter((g) => g.gap > 0 && g.verifiedLevel === 0).map(slim);
  return { matched, improve, missing };
}
