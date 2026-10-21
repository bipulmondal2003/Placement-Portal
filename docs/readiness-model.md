# Eligibility and readiness model

Both are deterministic pure functions (`eligibility.engine.ts`, `readiness.engine.ts`). They use no database access and no AI, so the same inputs always give the same output, and every number can be explained.

## Eligibility

A drive's rule can check: department, graduation year, CGPA, 10th %, 12th %, active backlogs, and whether past (cleared) backlogs are allowed. Unset fields are not checked. The result is pass or fail with one entry per check (`required` versus `actual` and a message), so a student is told exactly why. An incomplete profile is reported as a failure of the affected check, not guessed at. Registration is refused for ineligible students. Readiness never changes eligibility, and a high score never overrides a failed check.

## Readiness inputs

For each requirement of a drive (a skill, or a cluster where any member satisfies it):

- `requiredLevel` (1 to 5), `weight` (1 to 10), `mandatory` flag
- the student's **verified** level for that skill (or the best member of the cluster)
- the student's **evidence strength** for it

Levels: 0 None, 1 Awareness, 2 Beginner, 3 Intermediate, 4 Advanced, 5 Expert.

A verified level comes only from approved evidence (faculty decision), or from an assessment or mock interview when the administrator has enabled auto-verification for those. Self-reported levels, declared levels and pending evidence are ignored by the engine.

## Formula

```
gap            = max(0, requiredLevel - verifiedLevel)
coverage       = min(verifiedLevel, requiredLevel) / requiredLevel
evidenceFactor = floor + (1 - floor) * evidenceStrength      (only when verifiedLevel > 0, else 0)
skillCredit    = coverage * evidenceFactor
dimensionScore = 100 * sum(weight * skillCredit) / sum(weight)       per dimension
overall        = sum(dimWeight * dimensionScore) / sum(dimWeight)    over dimensions that have inputs
```

- **Evidence strength** is the sum of the configured weights of the *distinct verified evidence types* behind a skill, capped at 1. Defaults: assessment 0.5, project 0.4, mock interview 0.35, academic 0.3, certification 0.25, external 0.2. Ten certificates do not beat one assessment plus one project.
- **Floor** defaults to 0.8, so evidence strength modulates credit between 80 % and 100 % rather than dominating it.
- **Dimensions**: technical, aptitude, communication, and project depth (project depth is derived from verified project evidence against a target level, default 4). Default dimension weights: 0.6, 0.15, 0.15, 0.1. A dimension a drive does not use is left out and the rest are renormalised, so a drive is never penalised for something it did not ask about.
- **Mandatory cap**: if any mandatory requirement has verified level 0, the overall score is capped at 50 and the result says so.
- **Impact** of a gap is `weight * gap`. Gaps are ranked by impact; the top ones drive "next actions".
- **Evidence state** per requirement explains the gap: `met`, `no_evidence`, `unverified_claim`, `pending_review`, `below_target`, `weak_evidence`.

## Idempotence and history

Each computation hashes its inputs (requirements, levels, strengths, config version). If the hash equals the latest snapshot's, nothing is written. Otherwise a new `ReadinessSnapshot` is stored, which is what trend reports and "since last time" views read.

## Assessments to levels

An assessment's per-skill percentage is mapped to a level with admin-configurable thresholds (default 30 / 50 / 70 / 85 / 95 % for levels 1 to 5). Retakes keep the best result.

## What AI may and may not do

AI may reword an already-computed result ("explain my result"), draft a plan from the gap list for the student to review, give feedback on a practice answer, and extract candidate skills from a resume. It never sets a level, never marks anything verified, and its output is labelled as advisory in the UI.
