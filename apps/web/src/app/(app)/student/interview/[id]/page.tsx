'use client';
import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bot, Send, Square, User } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Query } from '@/components/states';
import type { InterviewView } from '@/components/student/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { api, errMessage } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { titleCase } from '@/lib/utils';

export default function InterviewChat({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useApi<InterviewView>(`/interviews/${id}`);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const turnCount = q.data?.turns.length ?? 0;
  useEffect(() => { endRef.current?.scrollIntoView?.({ behavior: 'smooth' }); }, [turnCount]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || answer.trim().length < 2) return;
    setBusy(true); setErr(null);
    try {
      const v = await api.post<InterviewView>(`/interviews/${id}/answer`, { answer: answer.trim() });
      await q.mutate(v, { revalidate: false });
      setAnswer('');
    } catch (e2) { setErr(errMessage(e2)); } finally { setBusy(false); }
  };
  const end = async () => {
    if (!window.confirm('End the interview now? You will get a summary of the answers so far.')) return;
    setBusy(true); setErr(null);
    try { const v = await api.post<InterviewView>(`/interviews/${id}/end`); await q.mutate(v, { revalidate: false }); } catch (e2) { setErr(errMessage(e2)); } finally { setBusy(false); }
  };

  return (
    <Query q={q} rows={4}>
      {(s) => (
        <>
          <PageHeader title={`Mock interview: ${s.role.title}`} description={`${titleCase(s.mode)} mode · ${titleCase(s.difficulty)} · ${s.answered} of ${s.plannedQuestions} answered`} actions={<>
            <Button asChild variant="outline"><Link href="/student/interview">All interviews</Link></Button>
            {s.status === 'active' && <Button variant="outline" onClick={end} disabled={busy}><Square />End now</Button>}
          </>} />
          <p className="mb-3 rounded-md border bg-secondary/50 p-3 text-xs text-muted-foreground">{s.notice}</p>
          <Card><CardContent className="space-y-4 p-4" aria-live="polite">
            {s.turns.map((t, i) => (
              <div key={i} className={t.role === 'candidate' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={`max-w-[85%] space-y-2 rounded-lg p-3 text-sm ${t.role === 'candidate' ? 'bg-primary text-primary-foreground' : 'glass'}`}>
                  <p className="flex items-center gap-1.5 text-xs opacity-80">{t.role === 'candidate' ? <User className="size-3" /> : <Bot className="size-3" />}{t.role === 'candidate' ? 'You' : 'Interviewer'}{t.skill ? ` · ${t.skill}` : ''}</p>
                  <p className="whitespace-pre-line">{t.text}</p>
                  {t.feedback && (
                    <div className="space-y-1 rounded-md bg-background/90 p-2 text-xs text-foreground">
                      <p className="font-semibold">Feedback: {t.feedback.score}/5</p>
                      {t.feedback.strengths.length > 0 && <p><span className="font-medium">Good: </span>{t.feedback.strengths.join(' ')}</p>}
                      {t.feedback.improvements.length > 0 && <p><span className="font-medium">Improve: </span>{t.feedback.improvements.join(' ')}</p>}
                      {t.feedback.hint && <p className="text-muted-foreground">Hint: {t.feedback.hint}</p>}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && <p className="text-sm text-muted-foreground" role="status">Interviewer is thinking…</p>}
            <div ref={endRef} />
          </CardContent></Card>
          {err && <p role="alert" className="mt-3 rounded-md border border-gap/30 bg-gap-soft p-3 text-sm">{err}</p>}
          {s.status === 'active' ? (
            <form onSubmit={send} className="mt-3 space-y-2">
              <label htmlFor="iv-answer" className="sr-only">Your answer</label>
              <Textarea id="iv-answer" value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={4000} placeholder="Type your answer…" disabled={busy} />
              <div className="flex justify-end"><Button type="submit" loading={busy} disabled={answer.trim().length < 2}><Send />Send answer</Button></div>
            </form>
          ) : s.summary && (
            <Card className="mt-4">
              <CardHeader><CardTitle>Interview summary · {s.summary.averageScore}/5 average</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>{s.summary.overall}</p>
                {s.summary.bySkill.length > 0 && <div className="flex flex-wrap gap-1.5">{s.summary.bySkill.map((b) => <Badge key={b.skill} variant={b.score >= 4 ? 'verified' : b.score >= 3 ? 'pending' : 'gap'}>{b.skill}: {b.score}/5</Badge>)}</div>}
                {s.summary.strengths.length > 0 && <div><p className="font-medium">Strengths</p><ul className="list-disc pl-5">{s.summary.strengths.map((x) => <li key={x}>{x}</li>)}</ul></div>}
                {s.summary.improvements.length > 0 && <div><p className="font-medium">To improve</p><ul className="list-disc pl-5">{s.summary.improvements.map((x) => <li key={x}>{x}</li>)}</ul></div>}
                {s.summary.practiceTopics.length > 0 && <p><span className="font-medium">Practise next: </span>{s.summary.practiceTopics.join(', ')}</p>}
                <p className="text-xs text-muted-foreground">To raise your readiness score, add evidence or take an assessment. Interview results do not change it.</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Query>
  );
}
