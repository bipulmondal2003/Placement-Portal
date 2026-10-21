'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Query } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { api, errMessage } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { cn, levelLabel } from '@/lib/utils';

interface Take { id: string; title: string; description?: string; durationMinutes: number; maxAttempts: number; attemptsUsed: number; questions: { id: string; prompt: string; options: string[]; skill: string }[] }
interface Result {
  attemptId: string; score: number; total: number; percent: number; attemptsRemaining: number; evidenceAutoVerified: boolean;
  perSkill: { skill: string; correct: number; total: number; percent: number; awardedLevel: number }[];
  review: { questionId: string; prompt: string; yourAnswer: number; correctIndex: number; correct: boolean; explanation?: string; options: string[] }[];
}
interface Tax { skills: { id: string; name: string }[] }

export default function TakeAssessment() {
  const { id } = useParams<{ id: string }>();
  const take = useApi<Take>(`/assessments/${id}/take`, { revalidateOnMount: true });
  const tax = useApi<Tax>('/skills/taxonomy');
  const names = useMemo(() => new Map((tax.data?.skills ?? []).map((s) => [s.id, s.name])), [tax.data]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const submit = async (t: Take) => {
    const unanswered = t.questions.filter((q) => answers[q.id] === undefined).length;
    if (unanswered > 0 && !window.confirm(`${unanswered} question${unanswered === 1 ? ' is' : 's are'} unanswered and will score zero. Submit anyway?`)) return;
    setBusy(true); setErr(null);
    try { setResult(await api.post<Result>(`/assessments/${id}/submit`, { answers: t.questions.map((q) => answers[q.id] ?? -1) })); window.scrollTo({ top: 0 }); }
    catch (e) { setErr(errMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <Query q={take} rows={4}>
      {(t) => result ? (
        <>
          <PageHeader title={`${t.title}: result`} />
          <Card className="mb-6"><CardContent className="space-y-4 p-6">
            <p className="tabular text-3xl font-semibold">{result.score}/{result.total} <span className="text-lg font-normal text-muted-foreground">({result.percent}%)</span></p>
            <p className="text-sm text-muted-foreground">{result.evidenceAutoVerified ? 'Your result was recorded as verified evidence for the skills below.' : 'Your result was recorded and is awaiting faculty verification.'} Attempts left: {result.attemptsRemaining}.</p>
            <ul className="grid gap-2 sm:grid-cols-2">{result.perSkill.map((s) => (
              <li key={s.skill} className="rounded-md border p-3 text-sm"><div className="flex justify-between"><span className="font-medium">{names.get(String(s.skill)) ?? 'Skill'}</span><span className="tabular">{s.correct}/{s.total}</span></div><Progress className="mt-2" value={s.percent} aria-label={`${names.get(String(s.skill)) ?? 'Skill'} ${s.percent}%`} /><p className="mt-1 text-xs text-muted-foreground">Level from this test: {levelLabel(s.awardedLevel)}</p></li>
            ))}</ul>
            <div className="flex gap-2"><Button asChild variant="outline"><Link href="/student/assessments">Back to assessments</Link></Button><Button asChild><Link href="/student">Dashboard</Link></Button></div>
          </CardContent></Card>
          <h2 className="mb-3 text-lg font-semibold">Review</h2>
          <ol className="space-y-3">{result.review.map((r, i) => (
            <li key={r.questionId}><Card><CardContent className="space-y-2 p-4">
              <p className="flex items-start gap-2 font-medium">{r.correct ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-verified" aria-label="Correct" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-gap" aria-label="Incorrect" />}{i + 1}. {r.prompt}</p>
              <ul className="space-y-1 text-sm">{r.options.map((o, oi) => <li key={oi} className={cn('rounded px-2 py-1', oi === r.correctIndex && 'bg-verified-soft font-medium', oi === r.yourAnswer && oi !== r.correctIndex && 'bg-gap-soft')}>{o}{oi === r.correctIndex && ' (correct)'}{oi === r.yourAnswer && oi !== r.correctIndex && ' (your answer)'}</li>)}</ul>
              {r.yourAnswer === -1 && <p className="text-xs text-muted-foreground">Not answered.</p>}
              {r.explanation && <p className="text-sm text-muted-foreground">{r.explanation}</p>}
            </CardContent></Card></li>
          ))}</ol>
        </>
      ) : (
        <>
          <PageHeader title={t.title} description={t.description} />
          <p className="mb-4 text-sm text-muted-foreground">Suggested time {t.durationMinutes} minutes (not enforced). Attempt {t.attemptsUsed + 1} of {t.maxAttempts}. Answered {Object.keys(answers).length}/{t.questions.length}.</p>
          <Progress className="mb-6" value={(Object.keys(answers).length / t.questions.length) * 100} aria-label="Questions answered" />
          <ol className="space-y-4">
            {t.questions.map((q, i) => (
              <li key={q.id}><Card><CardContent className="p-5">
                <fieldset><legend className="mb-3 font-medium">{i + 1}. {q.prompt}</legend>
                  <div className="space-y-2">{q.options.map((o, oi) => (
                    <label key={oi} className={cn('flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm hover:bg-accent', answers[q.id] === oi && 'border-primary bg-primary/5')}>
                      <input type="radio" name={`q-${q.id}`} className="size-4" checked={answers[q.id] === oi} onChange={() => setAnswers((a) => ({ ...a, [q.id]: oi }))} />{o}
                    </label>
                  ))}</div>
                </fieldset>
              </CardContent></Card></li>
            ))}
          </ol>
          {err && <p role="alert" className="mt-4 rounded-md border border-gap/30 bg-gap-soft p-3 text-sm">{err}</p>}
          <div className="mt-6 flex justify-end"><Button size="lg" loading={busy} onClick={() => submit(t)}>Submit answers</Button></div>
        </>
      )}
    </Query>
  );
}
