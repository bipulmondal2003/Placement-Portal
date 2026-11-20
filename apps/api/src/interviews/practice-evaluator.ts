import { InterviewFeedback } from '../database/schemas/interview.schema';
import { BankQuestion } from './question-bank';

const EXAMPLE = /(for example|for instance|e\.g\.?|such as|in my project|i used|i built|i worked|like when)/i;

/**
 * Deterministic keyword-coverage feedback for practice mode. It measures which expected ideas the answer
 * mentions, not whether the answer is correct or well reasoned, and the UI says so.
 */
export function evaluatePractice(entry: BankQuestion, answer: string): InterviewFeedback & { covered: string[] } {
  const text = ` ${answer.toLowerCase()} `;
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  const covered = entry.concepts.filter((c) => c.any.some((k) => text.includes(k)));
  const missing = entry.concepts.filter((c) => !covered.includes(c));
  const ratio = covered.length / entry.concepts.length;

  let score = ratio >= 0.8 ? 5 : ratio >= 0.6 ? 4 : ratio >= 0.4 ? 3 : ratio >= 0.2 ? 2 : 1;
  if (words < 12) score = Math.min(score, 2);
  const hasExample = EXAMPLE.test(answer);

  const strengths = covered.slice(0, 4).map((c) => `You covered: ${c.label}.`);
  if (hasExample && score >= 3) strengths.push('You supported your answer with an example.');
  if (!strengths.length) strengths.push('You attempted the question. Build on this with the key ideas below.');

  const improvements = missing.slice(0, 3).map((c) => `Also mention: ${c.label}.`);
  if (words < 30) improvements.push('Give a fuller answer: aim for three to five sentences.');
  if (!hasExample && !entry.behavioural) improvements.push('Add a short real example, ideally from a project you built.');
  if (entry.behavioural && missing.length) improvements.push('Structure your answer as Situation, Task, Action, Result.');

  return {
    score,
    strengths,
    improvements,
    hint: missing.length ? `A strong answer also touches on: ${missing.map((c) => c.label).join('; ')}.` : undefined,
    covered: covered.map((c) => c.label),
  };
}
