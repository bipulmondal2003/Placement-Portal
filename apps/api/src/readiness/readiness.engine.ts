import { createHash } from 'crypto';

/**
 * Deterministic, explainable readiness engine. Pure functions only: no database, no AI.
 * See docs/readiness-model.md for the full specification.
 *
 *  gap            = max(0, requiredLevel - verifiedLevel)
 *  coverage       = min(verifiedLevel, requiredLevel) / requiredLevel
 *  evidenceFactor = floor + (1 - floor) * evidenceStrength        (only when verifiedLevel > 0)
 *  skillCredit    = coverage * evidenceFactor
 *  dimensionScore = 100 * sum(weight * skillCredit) / sum(weight)
 *  overall        = sum(dimWeight * dimScore) / sum(dimWeight)   (dimensions with no inputs are excluded)
 *
 * Self-reported levels and pending evidence NEVER earn credit. Missing proficiency counts as 0.
 */

export type Dimension = 'technical' | 'aptitude' | 'communication';
export const DIMENSIONS: Array<Dimension | 'projectDepth'> = ['technical', 'aptitude', 'communication', 'projectDepth'];
export const LEVEL_LABELS = ['None', 'Awareness', 'Beginner', 'Intermediate', 'Advanced', 'Expert'];

/** A mandatory requirement with zero verified proficiency caps the overall score at this value. */
export const MANDATORY_MISSING_CAP = 50;

export interface RequirementInput {
  /** requirement id (stable key for hashing) */
  key: string;
  kind: 'skill' | 'cluster';
  label: string;
  skillId?: string;
  clusterId?: string;
  /** For cluster requirements: skills that satisfy it (taxonomy expansion). */
  memberSkills?: Array<{ id: string; name: string }>;
  requiredLevel: number;
  weight: number;
  mandatory: boolean;
  dimension: Dimension;
}

export interface SkillState {
  skillId: string;
  declaredLevel?: number;
  selfReportedLevel: number;
  verifiedLevel: number;
  evidenceStrength: number;
  verifiedEvidenceCount: number;
  pendingEvidenceCount: number;
}

export interface EngineConfig {
  dimensionWeights: Record<string, number>;
  evidenceFloor: number;
  configVersion: number;
}

export type EvidenceState = 'met' | 'no_evidence' | 'unverified_claim' | 'pending_review' | 'below_target' | 'weak_evidence';

export interface GapResult {
  key: string;
  skillId?: string;
  clusterId?: string;
  label: string;
  kind: 'skill' | 'cluster';
  dimension: Dimension;
  requiredLevel: number;
  verifiedLevel: number;
  selfReportedLevel: number;
  matchedVia?: string;
  gap: number;
  weight: number;
  mandatory: boolean;
  impact: number;
  evidenceState: EvidenceState;
  action: string;
  credit: number;
}

export interface ReadinessResult {
  score: number;
  dimensions: { technical: number | null; aptitude: number | null; communication: number | null; projectDepth: number | null };
  gaps: GapResult[];
  met: GapResult[];
  explanation: string[];
  nextActions: string[];
  inputsHash: string;
  cappedByMandatory: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function stateFor(req: RequirementInput, states: Map<string, SkillState>) {
  const candidates = req.kind === 'cluster' ? (req.memberSkills ?? []) : req.skillId ? [{ id: req.skillId, name: req.label }] : [];
  let best: { st?: SkillState; name?: string } = {};
  for (const c of candidates) {
    const st = states.get(c.id);
    if (!st) continue;
    const better =
      !best.st ||
      st.verifiedLevel > best.st.verifiedLevel ||
      (st.verifiedLevel === best.st.verifiedLevel && st.evidenceStrength > best.st.evidenceStrength) ||
      (st.verifiedLevel === best.st.verifiedLevel && st.verifiedLevel === 0 && st.selfReportedLevel > best.st.selfReportedLevel);
    if (better) best = { st, name: c.name };
  }
  return best;
}

function actionFor(state: EvidenceState, req: RequirementInput, verified: number, self: number): string {
  const target = `level ${req.requiredLevel} (${LEVEL_LABELS[req.requiredLevel]})`;
  switch (state) {
    case 'no_evidence':
      return `Build verified evidence for ${req.label}: complete a skill assessment or submit a project demonstrating ${target}.`;
    case 'unverified_claim':
      return `You rate yourself ${self}/5 in ${req.label}, but nothing is verified yet. Submit evidence for faculty review or take the assessment.`;
    case 'pending_review':
      return `Your evidence for ${req.label} is awaiting review. Ask your mentor to review it so it can count.`;
    case 'below_target':
      return `Raise ${req.label} from level ${verified} to ${target} with targeted practice, then re-verify through an assessment or reviewed project.`;
    case 'weak_evidence':
      return `${req.label} meets the target but rests on thin evidence. Add a second verified evidence type to strengthen it.`;
    default:
      return `${req.label} meets the target.`;
  }
}

export function computeReadiness(
  requirements: RequirementInput[],
  states: Map<string, SkillState>,
  projectDepth: number,
  cfg: EngineConfig,
  driveDimensionWeights?: Record<string, number> | null,
): ReadinessResult {
  const floor = Math.min(1, Math.max(0, cfg.evidenceFloor));
  const results: GapResult[] = [];

  for (const req of requirements) {
    const { st, name } = stateFor(req, states);
    const verified = st?.verifiedLevel ?? 0;
    const self = st?.selfReportedLevel ?? 0;
    const strength = st?.evidenceStrength ?? 0;
    const coverage = Math.min(verified, req.requiredLevel) / req.requiredLevel;
    const evidenceFactor = verified > 0 ? floor + (1 - floor) * strength : 0;
    const credit = coverage * evidenceFactor;
    const gap = Math.max(0, req.requiredLevel - verified);

    let evState: EvidenceState;
    if (gap === 0) evState = strength < 0.5 ? 'weak_evidence' : 'met';
    else if (st && st.pendingEvidenceCount > 0 && self >= req.requiredLevel) evState = 'pending_review';
    else if (verified === 0 && self > 0) evState = 'unverified_claim';
    else if (verified === 0) evState = 'no_evidence';
    else evState = 'below_target';

    results.push({
      key: req.key,
      skillId: req.skillId,
      clusterId: req.clusterId,
      label: req.label,
      kind: req.kind,
      dimension: req.dimension,
      requiredLevel: req.requiredLevel,
      verifiedLevel: verified,
      selfReportedLevel: self,
      matchedVia: req.kind === 'cluster' && verified > 0 ? name : undefined,
      gap,
      weight: req.weight,
      mandatory: req.mandatory,
      impact: req.weight * gap,
      evidenceState: evState,
      action: actionFor(evState, req, verified, self),
      credit,
    });
  }

  // Dimension scores
  const dimScore = (dim: Dimension): number | null => {
    const rows = results.filter((r) => r.dimension === dim);
    if (!rows.length) return null;
    const totalW = rows.reduce((s, r) => s + r.weight, 0);
    return round1((100 * rows.reduce((s, r) => s + r.weight * r.credit, 0)) / totalW);
  };
  const dimensions = {
    technical: dimScore('technical'),
    aptitude: dimScore('aptitude'),
    communication: dimScore('communication'),
    projectDepth: round1(100 * Math.min(1, Math.max(0, projectDepth))),
  };

  const weights = { ...cfg.dimensionWeights, ...(driveDimensionWeights ?? {}) };
  let num = 0;
  let den = 0;
  for (const d of DIMENSIONS) {
    const v = dimensions[d];
    const w = Number(weights[d] ?? 0);
    if (v === null || w <= 0) continue;
    num += w * v;
    den += w;
  }
  let score = den > 0 ? num / den : 0;
  const cappedByMandatory = results.some((r) => r.mandatory && r.verifiedLevel === 0) && score > MANDATORY_MISSING_CAP;
  if (cappedByMandatory) score = MANDATORY_MISSING_CAP;
  score = round1(score);

  // Ranking: real gaps first by impact (weight * gap) desc, mandatory first on ties, then weak-evidence notes.
  const gaps = results
    .filter((r) => r.gap > 0)
    .sort((a, b) => b.impact - a.impact || Number(b.mandatory) - Number(a.mandatory) || a.label.localeCompare(b.label));
  const weak = results.filter((r) => r.gap === 0 && r.evidenceState === 'weak_evidence').sort((a, b) => b.weight - a.weight);
  const met = results.filter((r) => r.gap === 0 && r.evidenceState === 'met');

  const explanation: string[] = [];
  explanation.push(
    `Readiness is computed only from VERIFIED proficiency. Self-reported levels and pending evidence earn no credit, and missing proficiency counts as 0.`,
  );
  for (const d of ['technical', 'aptitude', 'communication'] as Dimension[]) {
    const rows = results.filter((r) => r.dimension === d);
    if (rows.length) {
      const ok = rows.filter((r) => r.gap === 0).length;
      explanation.push(`${cap(d)}: ${dimensions[d]}/100 across ${rows.length} requirement(s) (${ok} at target, ${rows.length - ok} below target).`);
    }
  }
  explanation.push(`Project depth: ${dimensions.projectDepth}/100 from verified project evidence.`);
  const noEv = results.filter((r) => r.verifiedLevel === 0).length;
  if (noEv) explanation.push(`${noEv} requirement(s) have no verified proficiency at all and contribute 0.`);
  explanation.push(`Evidence strength adjusts each skill's credit: credit = coverage x (${floor} + ${round1(1 - floor)} x evidenceStrength).`);
  if (cappedByMandatory) explanation.push(`A mandatory skill has no verified proficiency, so the overall score is capped at ${MANDATORY_MISSING_CAP}.`);
  if (gaps[0]) explanation.push(`Largest gap: ${gaps[0].label} (needs level ${gaps[0].requiredLevel}, verified ${gaps[0].verifiedLevel}, weight ${gaps[0].weight}).`);

  const nextActions = gaps.slice(0, 3).map((g) => g.action);
  const pending = [...states.values()].reduce((s, st) => s + st.pendingEvidenceCount, 0);
  if (pending > 0) nextActions.push(`${pending} evidence item(s) are pending review. Follow up with your mentor.`);
  if (!gaps.length && !nextActions.length) nextActions.push('All requirements are at target. Keep evidence current and prepare for interviews.');

  // Hash of every input that can change the output; identical hash => identical snapshot => skip.
  const relevantIds = new Set<string>();
  for (const r of requirements) {
    if (r.skillId) relevantIds.add(r.skillId);
    r.memberSkills?.forEach((m) => relevantIds.add(m.id));
  }
  const stateDigest = [...relevantIds]
    .sort()
    .map((id) => {
      const s = states.get(id);
      return s ? [id, s.verifiedLevel, round1(s.evidenceStrength * 100), s.selfReportedLevel, s.pendingEvidenceCount] : [id];
    });
  const inputsHash = createHash('sha1')
    .update(
      JSON.stringify({
        reqs: requirements.map((r) => [r.key, r.kind, r.skillId, r.clusterId, r.requiredLevel, r.weight, r.mandatory, r.dimension, r.memberSkills?.map((m) => m.id).sort()]),
        stateDigest,
        projectDepth: round1(projectDepth * 1000),
        weights,
        floor,
        v: cfg.configVersion,
      }),
    )
    .digest('hex');

  return {
    score,
    dimensions,
    gaps: [...gaps, ...weak],
    met,
    explanation,
    nextActions,
    inputsHash,
    cappedByMandatory,
  };
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
