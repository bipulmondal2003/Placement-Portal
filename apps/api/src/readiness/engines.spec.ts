import { evaluateEligibility } from './eligibility.engine';
import { computeReadiness, RequirementInput, SkillState, EngineConfig, MANDATORY_MISSING_CAP } from './readiness.engine';
import { buildSkillProfile, percentToLevel, EvidenceLite } from './profile.builder';

const cfg: EngineConfig = {
  dimensionWeights: { technical: 0.6, aptitude: 0.15, communication: 0.15, projectDepth: 0.1 },
  evidenceFloor: 0.8,
  configVersion: 1,
};

const req = (over: Partial<RequirementInput> & { key: string }): RequirementInput => ({
  kind: 'skill',
  label: over.key,
  skillId: over.key,
  requiredLevel: 3,
  weight: 5,
  mandatory: false,
  dimension: 'technical',
  ...over,
});

const state = (skillId: string, over: Partial<SkillState> = {}): SkillState => ({
  skillId,
  selfReportedLevel: 0,
  verifiedLevel: 0,
  evidenceStrength: 0,
  verifiedEvidenceCount: 0,
  pendingEvidenceCount: 0,
  ...over,
});

describe('eligibility engine', () => {
  const rule = { minCgpa: 7, departments: ['CSE', 'IT'], graduationYears: [2027], maxActiveBacklogs: 0, allowHistoryOfBacklogs: false };

  it('is eligible when every criterion is satisfied', () => {
    const r = evaluateEligibility({ department: 'cse', graduationYear: 2027, cgpa: 8, activeBacklogs: 0, historyOfBacklogs: false }, rule);
    expect(r.eligible).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('returns a clear reason for every failed condition', () => {
    const r = evaluateEligibility({ department: 'ECE', graduationYear: 2026, cgpa: 6.2, activeBacklogs: 2, historyOfBacklogs: true }, rule);
    expect(r.eligible).toBe(false);
    expect(r.reasons).toHaveLength(5);
    expect(r.reasons.join(' ')).toMatch(/CGPA 6.2 is below the minimum of 7/);
    expect(r.reasons.join(' ')).toMatch(/Department "ECE"/);
  });

  it('treats a missing CGPA as a failure, not a pass', () => {
    const r = evaluateEligibility({ department: 'CSE', graduationYear: 2027, activeBacklogs: 0 }, { minCgpa: 7 });
    expect(r.eligible).toBe(false);
    expect(r.reasons[0]).toMatch(/not recorded/);
  });

  it('is eligible when the drive has no rule', () => {
    expect(evaluateEligibility({}, null).eligible).toBe(true);
  });
});

describe('readiness engine', () => {
  it('gives zero credit for self-reported or pending skills (missing evidence is not competence)', () => {
    const states = new Map([['react', state('react', { selfReportedLevel: 5, pendingEvidenceCount: 1 })]]);
    const r = computeReadiness([req({ key: 'react' })], states, 0, cfg);
    expect(r.dimensions.technical).toBe(0);
    expect(r.score).toBe(0);
    expect(r.gaps[0].evidenceState).toBe('pending_review');
    expect(r.gaps[0].gap).toBe(3);
  });

  it('distinguishes no evidence from an unverified self-claim', () => {
    const states = new Map([['a', state('a', { selfReportedLevel: 2 })]]);
    const r = computeReadiness([req({ key: 'a' }), req({ key: 'b' })], states, 0, cfg);
    expect(r.gaps.find((g) => g.key === 'a')!.evidenceState).toBe('unverified_claim');
    expect(r.gaps.find((g) => g.key === 'b')!.evidenceState).toBe('no_evidence');
  });

  it('applies the evidence factor: full coverage with strong evidence scores 100 technical', () => {
    const states = new Map([['a', state('a', { verifiedLevel: 3, evidenceStrength: 1, selfReportedLevel: 3 })]]);
    const strong = computeReadiness([req({ key: 'a' })], states, 1, cfg);
    expect(strong.dimensions.technical).toBe(100);
    const weakStates = new Map([['a', state('a', { verifiedLevel: 3, evidenceStrength: 0.2, selfReportedLevel: 3 })]]);
    const weak = computeReadiness([req({ key: 'a' })], weakStates, 1, cfg);
    expect(weak.dimensions.technical).toBeLessThan(100);
    expect(weak.dimensions.technical).toBeCloseTo(100 * (0.8 + 0.2 * 0.2), 1);
    expect(weak.gaps[0].evidenceState).toBe('weak_evidence');
  });

  it('expands clusters: verified React satisfies a "Frontend Framework" requirement', () => {
    const states = new Map([['react', state('react', { verifiedLevel: 4, evidenceStrength: 0.9, selfReportedLevel: 4 })]]);
    const r = computeReadiness(
      [req({ key: 'c1', kind: 'cluster', skillId: undefined, clusterId: 'fw', label: 'Frontend Framework', memberSkills: [{ id: 'react', name: 'React' }, { id: 'vue', name: 'Vue' }] })],
      states,
      0,
      cfg,
    );
    expect(r.gaps.filter((g) => g.gap > 0)).toHaveLength(0);
    expect(r.met[0].matchedVia).toBe('React');
  });

  it('ranks gaps by impact = weight x gap', () => {
    const states = new Map([['a', state('a', { verifiedLevel: 2 })], ['b', state('b'), ]]);
    const r = computeReadiness(
      [req({ key: 'a', weight: 10, requiredLevel: 3 }), req({ key: 'b', weight: 2, requiredLevel: 5 }), req({ key: 'c', weight: 9, requiredLevel: 4 })],
      states,
      0,
      cfg,
    );
    // impacts: c=36, a=10, b=10 -> the a/b tie is broken alphabetically by label
    expect(r.gaps.map((g) => g.key)).toEqual(['c', 'a', 'b']);
    expect(r.gaps[0].impact).toBe(36);
  });

  it('caps the score when a mandatory skill has no verified proficiency', () => {
    const states = new Map([
      ['a', state('a', { verifiedLevel: 5, evidenceStrength: 1 })],
      ['m', state('m')],
    ]);
    const r = computeReadiness([req({ key: 'a', requiredLevel: 3 }), req({ key: 'm', mandatory: true, weight: 1 })], states, 1, cfg);
    expect(r.cappedByMandatory).toBe(true);
    expect(r.score).toBe(MANDATORY_MISSING_CAP);
  });

  it('excludes dimensions with no requirements and renormalises weights', () => {
    const states = new Map([['a', state('a', { verifiedLevel: 3, evidenceStrength: 1 })]]);
    const r = computeReadiness([req({ key: 'a' })], states, 1, cfg);
    expect(r.dimensions.aptitude).toBeNull();
    expect(r.score).toBe(100);
  });

  it('is deterministic and the hash changes only when relevant inputs change', () => {
    const base = new Map([['a', state('a', { verifiedLevel: 2, evidenceStrength: 0.5 })]]);
    const r1 = computeReadiness([req({ key: 'a' })], base, 0.2, cfg);
    const r2 = computeReadiness([req({ key: 'a' })], new Map(base), 0.2, cfg);
    expect(r1).toEqual(r2);
    const unrelated = new Map(base).set('zzz', state('zzz', { verifiedLevel: 5 }));
    expect(computeReadiness([req({ key: 'a' })], unrelated, 0.2, cfg).inputsHash).toBe(r1.inputsHash);
    const changed = new Map([['a', state('a', { verifiedLevel: 3, evidenceStrength: 0.5 })]]);
    expect(computeReadiness([req({ key: 'a' })], changed, 0.2, cfg).inputsHash).not.toBe(r1.inputsHash);
  });

  it('is independent of eligibility: an ineligible student can still have a high readiness score', () => {
    const states = new Map([['a', state('a', { verifiedLevel: 4, evidenceStrength: 1 })]]);
    const readiness = computeReadiness([req({ key: 'a' })], states, 1, cfg);
    const eligibility = evaluateEligibility({ cgpa: 5 }, { minCgpa: 7 });
    expect(readiness.score).toBe(100);
    expect(eligibility.eligible).toBe(false);
  });
});

describe('skill profile builder', () => {
  const pcfg = { evidenceWeights: { assessment: 0.5, project: 0.4, certification: 0.25 }, projectDepthTargetLevel: 4 };
  const ev = (over: Partial<EvidenceLite> & { id: string }): EvidenceLite => ({ type: 'project', status: 'pending', skills: [], ...over });

  it('counts only verified evidence toward verified level and keeps claims separate', () => {
    const p = buildSkillProfile(
      [
        ev({ id: '1', status: 'verified', verifiedAt: new Date(), skills: [{ skillId: 'js', claimedLevel: 4, awardedLevel: 3 }] }),
        ev({ id: '2', status: 'pending', skills: [{ skillId: 'js', claimedLevel: 5 }, { skillId: 'go', claimedLevel: 3 }] }),
        ev({ id: '3', status: 'rejected', skills: [{ skillId: 'rust', claimedLevel: 5 }] }),
      ],
      new Map(),
      pcfg,
    );
    const js = p.entries.find((e) => e.skillId === 'js')!;
    expect(js.verifiedLevel).toBe(3);
    expect(js.selfReportedLevel).toBe(5);
    expect(js.pendingEvidenceCount).toBe(1);
    const go = p.entries.find((e) => e.skillId === 'go')!;
    expect(go.verifiedLevel).toBe(0);
    expect(go.selfReportedLevel).toBe(3);
    const rust = p.entries.find((e) => e.skillId === 'rust')!;
    expect(rust.verifiedLevel).toBe(0);
    expect(rust.rejectedEvidenceCount).toBe(1);
  });

  it('builds evidence strength from distinct verified evidence types, capped at 1', () => {
    const p = buildSkillProfile(
      [
        ev({ id: '1', type: 'assessment', status: 'verified', skills: [{ skillId: 'js', claimedLevel: 3, awardedLevel: 3 }] }),
        ev({ id: '2', type: 'assessment', status: 'verified', skills: [{ skillId: 'js', claimedLevel: 3, awardedLevel: 3 }] }),
        ev({ id: '3', type: 'project', status: 'verified', skills: [{ skillId: 'js', claimedLevel: 3, awardedLevel: 3 }] }),
        ev({ id: '4', type: 'certification', status: 'verified', skills: [{ skillId: 'js', claimedLevel: 3, awardedLevel: 3 }] }),
      ],
      new Map(),
      pcfg,
    );
    expect(p.entries[0].evidenceStrength).toBe(1); // .5 + .4 + .25 capped
    expect(p.entries[0].verifiedEvidenceCount).toBe(4);
  });

  it('computes project depth from the two best verified projects', () => {
    const p = buildSkillProfile(
      [
        ev({ id: '1', status: 'verified', skills: [{ skillId: 'js', claimedLevel: 4, awardedLevel: 4 }] }),
        ev({ id: '2', status: 'verified', skills: [{ skillId: 'js', claimedLevel: 2, awardedLevel: 2 }] }),
        ev({ id: '3', status: 'pending', skills: [{ skillId: 'js', claimedLevel: 5 }] }),
      ],
      new Map(),
      pcfg,
    );
    expect(p.projectDepth).toBeCloseTo((4 / 4 + 2 / 4) / 2, 5);
  });

  it('keeps declared levels without letting them verify anything', () => {
    const p = buildSkillProfile([], new Map([['sql', 4]]), pcfg);
    expect(p.entries[0]).toMatchObject({ skillId: 'sql', declaredLevel: 4, selfReportedLevel: 4, verifiedLevel: 0 });
  });

  it('produces a stable hash for identical inputs', () => {
    const e = [ev({ id: '1', status: 'verified', skills: [{ skillId: 'js', claimedLevel: 3, awardedLevel: 3 }] })];
    expect(buildSkillProfile(e, new Map(), pcfg).inputsHash).toBe(buildSkillProfile(e, new Map(), pcfg).inputsHash);
  });

  it('maps assessment percentage to levels', () => {
    const t = [30, 50, 70, 85, 95];
    expect([0, 29, 30, 69, 70, 84, 85, 94, 95, 100].map((p) => percentToLevel(p, t))).toEqual([0, 0, 1, 2, 3, 3, 4, 4, 5, 5]);
  });
});
