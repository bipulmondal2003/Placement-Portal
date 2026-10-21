'use client';
import Link from 'next/link';
import { Clock, RotateCcw } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState, Query } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Page } from '@/components/student/types';
import { useApi } from '@/lib/hooks';
import { fmtDate } from '@/lib/utils';

interface A { id: string; title: string; description?: string; durationMinutes: number; maxAttempts: number; questionCount: number; attemptsUsed: number; bestPercent?: number | null; lastAttemptAt?: string }
interface Attempt { _id: string; assessment: { _id: string; title: string }; score: number; total: number; percent: number; submittedAt: string }

export default function StudentAssessments() {
  const list = useApi<A[]>('/assessments');
  const attempts = useApi<Page<Attempt>>('/assessments/attempts/mine?limit=10');
  return (
    <>
      <PageHeader title="Assessments" description="Objective tests set by faculty. Your best result is recorded as verified evidence for the skills it covers." />
      <Query q={list} rows={3}>
        {(rows) => rows.length === 0 ? <EmptyState title="No assessments available" description="Faculty publish assessments for your department and batch." /> : (
          <div className="grid gap-4 md:grid-cols-2">
            {rows.map((a) => {
              const left = a.maxAttempts - a.attemptsUsed;
              return (
                <Card key={a.id}><CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-2"><h2 className="font-semibold">{a.title}</h2>{a.bestPercent !== null && a.bestPercent !== undefined && <Badge variant="verified">Best {Math.round(a.bestPercent)}%</Badge>}</div>
                  {a.description && <p className="text-sm text-muted-foreground">{a.description}</p>}
                  <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{a.questionCount} questions</span><span className="flex items-center gap-1"><Clock className="size-3.5" />{a.durationMinutes} min (guidance only)</span><span><RotateCcw className="mr-1 inline size-3.5" />{left} of {a.maxAttempts} attempts left</span></p>
                  {a.lastAttemptAt && <p className="text-xs text-muted-foreground">Last attempt {fmtDate(a.lastAttemptAt)}</p>}
                  <Button asChild disabled={left <= 0}><Link href={`/student/assessments/${a.id}`} aria-disabled={left <= 0} tabIndex={left <= 0 ? -1 : 0}>{a.attemptsUsed > 0 ? 'Retake' : 'Start'}</Link></Button>
                </CardContent></Card>
              );
            })}
          </div>
        )}
      </Query>
      <h2 className="mb-3 mt-8 text-lg font-semibold">Recent attempts</h2>
      <Query q={attempts} rows={2}>
        {(d) => d.items.length === 0 ? <p className="text-sm text-muted-foreground">You have not taken any assessment yet.</p> : (
          <Card><ul className="divide-y">{d.items.map((x) => <li key={x._id} className="flex items-center justify-between gap-2 p-4 text-sm"><span>{x.assessment?.title}<span className="ml-2 text-xs text-muted-foreground">{fmtDate(x.submittedAt)}</span></span><span className="tabular font-medium">{x.score}/{x.total} · {x.percent}%</span></li>)}</ul></Card>
        )}
      </Query>
    </>
  );
}
