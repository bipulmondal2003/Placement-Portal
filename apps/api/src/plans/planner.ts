import { LEVEL_LABELS, GapResult } from '../readiness/readiness.engine';

/**
 * Deterministic preparation-plan generator (no AI). Turns ranked gaps into dated, time-boxed tasks plus
 * weekly checkpoints. It never invents external resources or links: activities are derived from the gap itself
 * (skill, current verified level, target level) and the taxonomy's level descriptors when available.
 */
export interface PlannedTask {
  dayIndex: number;
  date: Date;
  title: string;
  objective: string;
  activity: string;
  exercise: string;
  expectedOutcome: string;
  estimatedMinutes: number;
  skill?: string;
  checkpoint: boolean;
}

export interface PlanOptions {
  startDate: Date;
  days: number;
  hoursPerDay: number;
  maxSkills?: number;
  /** skillId -> level descriptors (index 0 = level 1) */
  descriptors?: Map<string, string[]>;
}

const SESSION_MINUTES = 90;
const MIN_SESSION = 30;
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
};

export function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function sessionsFor(gap: GapResult, minutes: number): Array<{ phase: 'learn' | 'practice' | 'apply'; minutes: number }> {
  const out: Array<{ phase: 'learn' | 'practice' | 'apply'; minutes: number }> = [];
  const phases: Array<'learn' | 'practice' | 'apply'> = gap.verifiedLevel === 0 ? ['learn', 'practice', 'apply'] : ['practice', 'apply', 'learn'];
  let left = minutes;
  let i = 0;
  while (left >= MIN_SESSION) {
    const m = Math.min(SESSION_MINUTES, left);
    out.push({ phase: phases[i % phases.length], minutes: m });
    left -= m;
    i++;
  }
  return out;
}

function taskText(gap: GapResult, phase: 'learn' | 'practice' | 'apply', descriptors?: string[]) {
  const target = `level ${gap.requiredLevel} (${LEVEL_LABELS[gap.requiredLevel]})`;
  const next = Math.min(5, gap.verifiedLevel + 1);
  const nextDesc = descriptors?.[next - 1];
  const targetDesc = descriptors?.[gap.requiredLevel - 1];
  const from = gap.verifiedLevel === 0 ? 'no verified proficiency' : `verified level ${gap.verifiedLevel}`;
  switch (phase) {
    case 'learn':
      return {
        title: `Learn: ${gap.label}`,
        objective: `Close the gap from ${from} to ${target}.${nextDesc ? ` Next milestone: ${nextDesc}` : ''}`,
        activity: `Study the core concepts of ${gap.label} needed for ${target}. Write short notes in your own words and list what you could not explain.`,
        exercise: `Without looking at your notes, explain the key ideas of ${gap.label} aloud for 5 minutes, then check what you missed.`,
        expectedOutcome: `You can explain the fundamentals of ${gap.label} clearly and have a list of weak spots to practise.`,
      };
    case 'practice':
      return {
        title: `Practice: ${gap.label}`,
        objective: `Build working fluency in ${gap.label} toward ${target}.`,
        activity: `Solve a set of graded problems or exercises in ${gap.label}, increasing difficulty as you go.`,
        exercise: `Complete at least 5 exercises on ${gap.label}; redo any you got wrong without help.`,
        expectedOutcome: `You solve typical ${gap.label} problems independently and know your common mistakes.`,
      };
    default:
      return {
        title: `Apply: ${gap.label}`,
        objective: `Demonstrate ${gap.label} on something real so it can be verified.${targetDesc ? ` Target capability: ${targetDesc}` : ''}`,
        activity: `Build or extend a small project feature that uses ${gap.label}, then write a short description of what you built and the decisions you made.`,
        exercise: `Submit the project as evidence (with a link and the skills used) for faculty review.`,
        expectedOutcome: `A reviewable artefact that can raise your verified level in ${gap.label}.`,
      };
  }
}

export function buildRuleBasedPlan(gaps: GapResult[], opts: PlanOptions): PlannedTask[] {
  const days = Math.max(3, Math.min(90, Math.floor(opts.days)));
  const dailyMinutes = Math.max(30, Math.round(opts.hoursPerDay * 60));
  const start = startOfUtcDay(opts.startDate);
  const active = gaps.filter((g) => g.gap > 0).slice(0, opts.maxSkills ?? 6);
  const tasks: PlannedTask[] = [];

  if (!active.length) {
    return [
      {
        dayIndex: 0,
        date: start,
        title: 'Maintain readiness',
        objective: 'All requirements for this drive are at target.',
        activity: 'Revise your strongest skills and rehearse explaining your projects.',
        exercise: 'Do one timed mock interview question per day.',
        expectedOutcome: 'Stay interview-ready.',
        estimatedMinutes: Math.min(dailyMinutes, 60),
        checkpoint: false,
      },
    ];
  }

  // Reserve time for checkpoints (one 30-minute checkpoint per 7 days + a final one).
  const checkpointDays = new Set<number>();
  for (let d = 6; d < days; d += 7) checkpointDays.add(d);
  checkpointDays.add(days - 1);
  const reserved = checkpointDays.size * 30;
  const budget = Math.max(MIN_SESSION, days * dailyMinutes - reserved);

  // Allocate study minutes proportional to impact (weight x gap), at least one session each.
  const totalImpact = active.reduce((s, g) => s + g.impact, 0) || 1;
  const allocations = active.map((g) => ({ gap: g, minutes: Math.max(MIN_SESSION * 2, Math.round((budget * g.impact) / totalImpact / 15) * 15) }));
  const sum = allocations.reduce((s, a) => s + a.minutes, 0);
  if (sum > budget) allocations.forEach((a) => (a.minutes = Math.max(MIN_SESSION, Math.floor((a.minutes * budget) / sum / 15) * 15)));

  // Interleave sessions by priority: highest-impact gap first, round-robin across skills.
  const queues = allocations.map((a) => ({ gap: a.gap, sessions: sessionsFor(a.gap, a.minutes) }));
  const ordered: Array<{ gap: GapResult; phase: 'learn' | 'practice' | 'apply'; minutes: number }> = [];
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const q of queues) {
      const s = q.sessions.shift();
      if (s) {
        ordered.push({ gap: q.gap, ...s });
        progressed = true;
      }
    }
  }

  let day = 0;
  let used = 0;
  for (const s of ordered) {
    while (day < days && checkpointDays.has(day) && used + s.minutes > dailyMinutes - 30) {
      day++;
      used = 0;
    }
    if (used + s.minutes > dailyMinutes && used > 0) {
      day++;
      used = 0;
    }
    if (day >= days) break; // out of time: lowest-priority sessions are dropped, not squeezed in
    const txt = taskText(s.gap, s.phase, opts.descriptors?.get(s.gap.skillId ?? ''));
    tasks.push({ dayIndex: day, date: addDays(start, day), ...txt, estimatedMinutes: Math.min(s.minutes, dailyMinutes), skill: s.gap.skillId, checkpoint: false });
    used += s.minutes;
  }

  for (const d of [...checkpointDays].sort((a, b) => a - b)) {
    const final = d === days - 1;
    const focus = active.slice(0, 3).map((g) => g.label).join(', ');
    tasks.push({
      dayIndex: d,
      date: addDays(start, d),
      title: final ? 'Final checkpoint: re-verify your progress' : `Week ${Math.floor(d / 7) + 1} checkpoint`,
      objective: 'Turn study into verified evidence so your readiness score can actually move.',
      activity: `Take a relevant assessment and submit evidence for faculty review. Focus: ${focus}.`,
      exercise: 'Open your gap analysis, check which gaps closed, and adjust the remaining plan.',
      expectedOutcome: 'New verified evidence submitted and an updated readiness score.',
      estimatedMinutes: 30,
      checkpoint: true,
    });
  }

  return tasks.sort((a, b) => a.dayIndex - b.dayIndex || Number(a.checkpoint) - Number(b.checkpoint));
}
