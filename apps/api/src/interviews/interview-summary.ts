import { InterviewFeedback, InterviewTurn } from '../database/schemas/interview.schema';

export interface SessionSummary {
  averageScore: number;
  overall: string;
  strengths: string[];
  improvements: string[];
  practiceTopics: string[];
  bySkill: Array<{ skill: string; score: number }>;
}

/**
 * Numbers in a summary (average, per-skill scores) are always computed here from the per-answer scores, never
 * taken from a model. The AI may only supply the wording.
 */
export function buildSummary(turns: InterviewTurn[]): SessionSummary {
  const scored: Array<{ skill: string; score: number }> = [];
  turns.forEach((t, i) => {
    if (t.role !== 'candidate' || !t.feedback) return;
    const q = [...turns.slice(0, i)].reverse().find((x) => x.role === 'interviewer');
    scored.push({ skill: q?.skill || 'General', score: (t.feedback as InterviewFeedback).score });
  });
  if (!scored.length) return { averageScore: 0, overall: 'No answers were given, so there is nothing to assess yet.', strengths: [], improvements: [], practiceTopics: [], bySkill: [] };

  const per = new Map<string, number[]>();
  for (const s of scored) per.set(s.skill, [...(per.get(s.skill) ?? []), s.score]);
  const bySkill = [...per.entries()].map(([skill, xs]) => ({ skill, score: Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 }));
  const avg = Math.round((scored.reduce((a, b) => a + b.score, 0) / scored.length) * 10) / 10;

  const strengths = bySkill.filter((s) => s.score >= 4).map((s) => `Strong answer on ${s.skill}.`);
  const improvements = bySkill.filter((s) => s.score <= 2.5).map((s) => `Revise ${s.skill}: your answer missed several key ideas.`);
  const practiceTopics = bySkill.filter((s) => s.score < 4).sort((a, b) => a.score - b.score).map((s) => s.skill);
  const overall =
    avg >= 4 ? 'Strong practice round. Keep refining your examples and keep your answers structured.' : avg >= 3 ? 'A solid start. Tighten the weaker topics below and rehearse with concrete examples.' : 'Good that you practised. Focus on the topics below, then try another round.';
  return { averageScore: avg, overall, strengths, improvements, practiceTopics, bySkill };
}
