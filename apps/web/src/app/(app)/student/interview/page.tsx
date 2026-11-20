'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { MessageSquare, Play, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState, Query } from '@/components/states';
import type { InterviewListItem, InterviewView, RoleMatchRow } from '@/components/student/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/label';
import { Select } from '@/components/ui/input';
import { api, errMessage } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { fmtDate, titleCase } from '@/lib/utils';

interface Options { aiAvailable: boolean; aiEnabled: boolean; aiConfigured: boolean; maxActive: number }

function Inner() {
  const router = useRouter();
  const sp = useSearchParams();
  const roles = useApi<RoleMatchRow[]>('/roles/matches');
  const opts = useApi<Options>('/interviews/options');
  const list = useApi<InterviewListItem[]>('/interviews');
  const [roleId, setRoleId] = useState(sp.get('role') ?? '');
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState('intermediate');
  const [mode, setMode] = useState<'practice' | 'ai'>('practice');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const chosen = roleId || roles.data?.find((r) => r.isTarget)?.roleId || roles.data?.[0]?.roleId;
    if (!chosen) return setErr('Choose a role first.');
    setBusy(true);
    try {
      const v = await api.post<InterviewView>('/interviews', { roleId: chosen, questionCount: count, difficulty, mode });
      router.push(`/student/interview/${v.id}`);
    } catch (e2) { setErr(errMessage(e2)); setBusy(false); }
  };
  const discard = async (id: string) => {
    if (!window.confirm('Discard this interview?')) return;
    try { await api.delete(`/interviews/${id}`); await list.mutate(); } catch (e) { setErr(errMessage(e)); }
  };

  return (
    <>
      <PageHeader title="Mock interview" description="Practise a chat-style interview for a target role. Questions focus on the skills the role expects. Feedback is advisory and never changes your readiness score." />
      {err && <p role="alert" className="mb-3 rounded-md border border-gap/30 bg-gap-soft p-3 text-sm">{err}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Start an interview</CardTitle><CardDescription>Pick a role, length and style.</CardDescription></CardHeader>
          <CardContent>
            <form onSubmit={start} className="space-y-4">
              {roles.data && roles.data.length === 0 && <p role="status" className="rounded-md border border-pending/30 bg-pending-soft p-3 text-sm">No roles are loaded in this database yet. Ask an admin to run the seed command (<code>npm run seed:prod -w apps/api</code> with <code>ALLOW_SEED_IN_PRODUCTION=true</code>), then refresh.</p>}
              {roles.error && <p role="alert" className="rounded-md border border-gap/30 bg-gap-soft p-3 text-sm">Could not load roles. Check that you are signed in as a student and the API is up.</p>}
              <Field label="Role" htmlFor="iv-role"><Select id="iv-role" value={roleId || roles.data?.find((r) => r.isTarget)?.roleId || ''} onChange={(e) => setRoleId(e.target.value)}>
                <option value="" disabled>Select a role…</option>
                {(roles.data ?? []).map((r) => <option key={r.roleId} value={r.roleId}>{r.title}{r.isTarget ? ' (target)' : ''}</option>)}
              </Select></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Questions" htmlFor="iv-count"><Select id="iv-count" value={count} onChange={(e) => setCount(Number(e.target.value))}>{[3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
                <Field label="Difficulty" htmlFor="iv-diff"><Select id="iv-diff" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></Select></Field>
              </div>
              <Field label="Interviewer" htmlFor="iv-mode" hint={opts.data?.aiAvailable ? 'AI mode adapts follow-up questions and gives written feedback.' : 'AI mode is not available right now (it needs an AI key and admin approval). Practice mode works without it.'}>
                <Select id="iv-mode" value={mode} onChange={(e) => setMode(e.target.value as 'practice' | 'ai')}>
                  <option value="practice">Practice (built-in question bank, keyword check)</option>
                  <option value="ai" disabled={!opts.data?.aiAvailable}>AI interviewer</option>
                </Select>
              </Field>
              <Button type="submit" loading={busy}><Play />Start</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Your interviews</CardTitle><CardDescription>Latest 20.</CardDescription></CardHeader>
          <CardContent>
            <Query q={list} rows={2}>
              {(rows) => rows.length === 0 ? <EmptyState title="No interviews yet" description="Start one on the left." /> : (
                <ul className="divide-y">
                  {rows.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 py-3 text-sm">
                      <Link href={`/student/interview/${r.id}`} className="min-w-0 flex-1 hover:underline">
                        <p className="truncate font-medium"><MessageSquare className="mr-1 inline size-3.5" />{r.roleTitle}</p>
                        <p className="text-xs text-muted-foreground">{titleCase(r.mode)} · {r.answered}/{r.plannedQuestions} answered · {fmtDate(r.createdAt)}</p>
                      </Link>
                      <Badge variant={r.status === 'completed' ? 'verified' : 'pending'}>{r.status === 'completed' ? `Done${r.averageScore != null ? ` · ${r.averageScore}/5` : ''}` : 'In progress'}</Badge>
                      <Button variant="ghost" size="icon" aria-label="Discard interview" onClick={() => discard(r.id)}><Trash2 /></Button>
                    </li>
                  ))}
                </ul>
              )}
            </Query>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default function InterviewHome() {
  return <Suspense><Inner /></Suspense>;
}
