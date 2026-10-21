import { createHash } from 'crypto';

/**
 * Pure aggregation of evidence into a levelled skill profile.
 * VERIFIED evidence determines verifiedLevel; everything else is a claim and is kept separate.
 */
export interface EvidenceLite {
  id: string;
  type: string;
  status: 'pending' | 'verified' | 'rejected';
  verifiedAt?: Date | null;
  skills: Array<{ skillId: string; claimedLevel: number; awardedLevel?: number | null }>;
}

export interface BuiltSkillEntry {
  skillId: string;
  declaredLevel: number;
  selfReportedLevel: number;
  verifiedLevel: number;
  verifiedEvidenceTypes: string[];
  verifiedEvidenceCount: number;
  pendingEvidenceCount: number;
  rejectedEvidenceCount: number;
  evidenceStrength: number;
  lastVerifiedAt?: Date;
}

export interface BuiltProfile {
  entries: BuiltSkillEntry[];
  projectDepth: number;
  inputsHash: string;
}

export interface ProfileConfig {
  evidenceWeights: Record<string, number>;
  projectDepthTargetLevel: number;
}

export function buildSkillProfile(
  evidence: EvidenceLite[],
  declared: Map<string, number>,
  cfg: ProfileConfig,
): BuiltProfile {
  const map = new Map<string, BuiltSkillEntry & { types: Set<string> }>();
  const get = (skillId: string) => {
    let e = map.get(skillId);
    if (!e) {
      e = {
        skillId,
        declaredLevel: declared.get(skillId) ?? 0,
        selfReportedLevel: 0,
        verifiedLevel: 0,
        verifiedEvidenceTypes: [],
        verifiedEvidenceCount: 0,
        pendingEvidenceCount: 0,
        rejectedEvidenceCount: 0,
        evidenceStrength: 0,
        types: new Set<string>(),
      };
      map.set(skillId, e);
    }
    return e;
  };

  for (const [skillId, level] of declared) if (level > 0) get(skillId);

  const projectLevels: number[] = [];
  for (const ev of evidence) {
    let projectItemLevel = 0;
    for (const claim of ev.skills) {
      const e = get(claim.skillId);
      if (ev.status === 'verified') {
        const awarded = claim.awardedLevel ?? 0;
        e.verifiedLevel = Math.max(e.verifiedLevel, awarded);
        e.verifiedEvidenceCount += 1;
        e.types.add(ev.type);
        if (ev.verifiedAt && (!e.lastVerifiedAt || ev.verifiedAt > e.lastVerifiedAt)) e.lastVerifiedAt = ev.verifiedAt;
        e.selfReportedLevel = Math.max(e.selfReportedLevel, claim.claimedLevel);
        projectItemLevel = Math.max(projectItemLevel, awarded);
      } else if (ev.status === 'pending') {
        e.pendingEvidenceCount += 1;
        e.selfReportedLevel = Math.max(e.selfReportedLevel, claim.claimedLevel);
      } else {
        e.rejectedEvidenceCount += 1;
      }
    }
    if (ev.type === 'project' && ev.status === 'verified') projectLevels.push(projectItemLevel);
  }

  const entries: BuiltSkillEntry[] = [];
  for (const e of map.values()) {
    e.selfReportedLevel = Math.max(e.selfReportedLevel, e.declaredLevel);
    // Verified level never exceeds what has been verified; strength comes only from distinct verified evidence types.
    e.evidenceStrength = Math.min(1, [...e.types].reduce((s, t) => s + (cfg.evidenceWeights[t] ?? 0), 0));
    e.verifiedEvidenceTypes = [...e.types].sort();
    const { types: _t, ...rest } = e;
    entries.push(rest);
  }
  entries.sort((a, b) => a.skillId.localeCompare(b.skillId));

  // Project depth: mean of the two best verified project levels, relative to the target level.
  const top2 = projectLevels.sort((a, b) => b - a).slice(0, 2);
  const target = Math.max(1, cfg.projectDepthTargetLevel);
  const projectDepth = Math.min(1, (top2[0] ?? 0) / target / 2 + (top2[1] ?? 0) / target / 2);

  const inputsHash = createHash('sha1')
    .update(JSON.stringify({ entries: entries.map((e) => [e.skillId, e.declaredLevel, e.selfReportedLevel, e.verifiedLevel, e.verifiedEvidenceTypes, e.verifiedEvidenceCount, e.pendingEvidenceCount, e.rejectedEvidenceCount]), projectDepth }))
    .digest('hex');

  return { entries, projectDepth, inputsHash };
}

/** Maps an assessment percentage to a proficiency level using ascending thresholds for levels 1..5. */
export function percentToLevel(percent: number, thresholds: number[]): number {
  let level = 0;
  thresholds.forEach((t, i) => {
    if (percent >= t) level = i + 1;
  });
  return level;
}
