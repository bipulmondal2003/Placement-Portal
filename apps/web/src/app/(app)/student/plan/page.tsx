'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Archive, Sparkles, Wand2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState, Query } from '@/components/states';
import { AiDisclaimer, AiErrorNotice, AiLabel, AiStatusBanner } from '@/components/student/ai-notice';
import type { Drive, Page, Plan, PlanTask } from '@/components/student/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/label';
import { Input, Select } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { api, errMessage } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { fmtDate } from '@/lib/utils';

interface Preview { source: string; disclaimer: string; driveId: string; days: number; hoursPerDay: number; startDate: string; basedOnInputsHash?: string; summary?: string; tasks: any[] }

function Inner() {
  const params = useSearchParams();
  const plans = useApi<Plan[]>('/preparation-plans');
  const drives = useApi<Page<Drive>>('/drives?limit=50');
  const [driveId, setDriveId] = useState(params.get('drive') ?? '');
  const [days, setDays] = useState(14);
  const [hours, setHours] = useState(2);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [aiErr, setAiErr] = useState<unknown>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [openPlan, setOpenPlan] = useState<string | null>(null);

  const valid = driveId && days >= 3 && days <= 60 && hours >= 0.5 && hours <= 10;

  const generate = async () => {
    setBusy('rule'); setErr(null); setPreview(null);
    try { const p = await api.post<Plan>('/preparation-plans', { driveId, days, hoursPerDay: hours }); await plans.mutate(); setOpenPlan(p._id); }
    catch (e) { setErr(errMessage(e)); } finally { setBusy(null); }
  };
  const aiPreview = async () => {
    setBusy('ai'); setAiErr(null); setPreview(null);
    try { setPreview(await api.post<Preview>('/ai/plan', { driveId, days, hoursPerDay: hours })); }
    catch (e) { setAiErr(e); } finally { setBusy(null); }
  };
  const accept = async () => {
    if (!preview) return;
    setBusy('accept'); setErr(null);
    try {
      const { driveId: d, hoursPerDay, startDate, summary, basedOnInputsHash, tasks } = preview;
      const p: any = await api.post('/ai/plan/accept', { driveId: d, hoursPerDay, startDate, summary, basedOnInputsHash, tasks });
      setPreview(null); await plans.mutate(); if (p?._id) setOpenPlan(p._id);
    } catch (e) { setErr(errMessage(e)); } finally { setBusy(null); }
  };

  return (
    <>
      <PageHeader title="Preparation plans" description="A day-by-day schedule built from your own gaps for one drive. The rule-based planner always works; the AI planner is optional and shown to you for review first." />
      <AiStatusBanner />
      <Card className="mb-6">
        <CardHeader><CardTitle>New plan</CardTitle><CardDescription>Plans target your verified gaps, highest impact first.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Drive" htmlFor="pl-drive"><Select id="pl-drive" value={driveId} onChange={(e) => setDriveId(e.target.value)}><option value="">Choose a drive…</option>{drives.data?.items.map((d) => <option key={d._id} value={d._id}>{d.company} · {d.role}</option>)}</Select></Field>
            <Field label="Days (3 to 60)" htmlFor="pl-days"><Input id="pl-days" type="number" min={3} max={60} value={days} onChange={(e) => setDays(Number(e.target.value))} /></Field>
            <Field label="Hours per day (0.5 to 10)" htmlFor="pl-hours"><Input id="pl-hours" type="number" step={0.5} min={0.5} max={10} value={hours} onChange={(e) => setHours(Number(e.target.value))} /></Field>
          </div>
          {err && <p role="alert" className="rounded-md border border-gap/30 bg-gap-soft p-3 text-sm">{err}</p>}
          <div className="flex flex-wrap gap-2">
            <Button loading={busy === 'rule'} disabled={!valid || !!busy} onClick={generate}><Wand2 />Generate rule-based plan</Button>
            <Button variant="outline" loading={busy === 'ai'} disabled={!valid || !!busy} onClick={aiPreview}><Sparkles />Preview AI plan</Button>
          </div>
          <AiErrorNotice error={aiErr} />
          {preview && (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between"><p className="font-medium">AI plan preview, not saved yet</p><AiLabel /></div>
              {preview.summary && <p className="text-sm">{preview.summary}</p>}
              <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">{preview.tasks.map((t, i) => <li key={i} className="rounded-md border p-2.5"><p className="font-medium">Day {t.dayIndex + 1}: {t.title}{t.checkpoint && <Badge className="ml-2" variant="primary">Checkpoint</Badge>}</p><p className="text-xs text-muted-foreground">{t.activity} · {t.estimatedMinutes} min</p></li>)}</ul>
              <AiDisclaimer text={preview.disclaimer} />
              <div className="flex gap-2"><Button loading={busy === 'accept'} onClick={accept}>Save this plan</Button><Button variant="ghost" onClick={() => setPreview(null)}>Discard</Button></div>
            </div>
          )}
        </CardContent>
      </Card>

      <Query q={plans} rows={2}>
        {(list) => list.length === 0 ? <EmptyState title="No plans yet" description="Pick a drive above and generate your first plan." /> : (
          <div className="space-y-4">{list.map((p) => <PlanCard key={p._id} plan={p} open={openPlan === p._id} onToggle={() => setOpenPlan(openPlan === p._id ? null : p._id)} onChanged={() => plans.mutate()} />)}</div>
        )}
      </Query>
    </>
  );
}

function PlanCard({ plan, open, onToggle, onChanged }: { plan: Plan; open: boolean; onToggle: () => void; onChanged: () => void }) {
  const detail = useApi<Plan>(open ? `/preparation-plans/${plan._id}` : null);
  const [err, setErr] = useState<string | null>(null);
  const setStatus = async (t: PlanTask, status: PlanTask['status']) => {
    setErr(null);
    try { await api.patch(`/preparation-plans/${plan._id}/tasks/${t._id}`, { status }); await Promise.all([detail.mutate(), onChanged()]); }
    catch (e) { setErr(errMessage(e)); }
  };
  const archive = async () => {
    if (!window.confirm('Archive this plan?')) return;
    try { await api.delete(`/preparation-plans/${plan._id}`); await onChanged(); } catch (e) { setErr(errMessage(e)); }
  };
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><p className="font-semibold">{plan.drive.company} · {plan.drive.role}</p><p className="text-xs text-muted-foreground">{fmtDate(plan.startDate)} to {fmtDate(plan.endDate)} · {plan.hoursPerDay} h/day · {plan.source === 'ai' ? 'AI-assisted' : 'Rule-based'}{plan.stale ? ' · gaps have changed since this was made' : ''}</p></div>
          <div className="flex gap-2"><Button variant="outline" size="sm" onClick={onToggle} aria-expanded={open}>{open ? 'Hide tasks' : 'Show tasks'}</Button><Button variant="ghost" size="icon" aria-label="Archive plan" onClick={archive}><Archive /></Button></div>
        </div>
        <div><div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>{plan.progress.done}/{plan.progress.total} tasks done</span><span>{Math.round(plan.progress.minutesDone / 60)}h of {Math.round(plan.progress.minutesTotal / 60)}h</span></div><Progress value={plan.progress.percent} aria-label="Plan progress" /></div>
        {err && <p role="alert" className="text-sm text-gap">{err}</p>}
        {open && <Query q={detail} rows={3}>{(d) => (
          <ul className="divide-y rounded-md border">{(d.tasks ?? []).map((t) => (
            <li key={t._id} className="grid gap-2 p-3 sm:grid-cols-[1fr_auto] sm:items-start">
              <div className="min-w-0 text-sm"><p className="font-medium">Day {t.dayIndex + 1} · {fmtDate(t.date, { day: 'numeric', month: 'short' })}: {t.title}{t.checkpoint && <Badge className="ml-2" variant="primary">Checkpoint</Badge>}</p><p className="text-muted-foreground">{t.activity}</p><p className="mt-1 text-xs text-muted-foreground"><span className="font-medium text-foreground">Exercise:</span> {t.exercise}</p><p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Outcome:</span> {t.expectedOutcome} · {t.estimatedMinutes} min</p></div>
              <div><label className="sr-only" htmlFor={`st-${t._id}`}>Status for {t.title}</label><Select id={`st-${t._id}`} className="w-36" value={t.status} onChange={(e) => setStatus(t, e.target.value as PlanTask['status'])}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option></Select></div>
            </li>
          ))}</ul>
        )}</Query>}
      </CardContent>
    </Card>
  );
}

export default function StudentPlan() {
  return <Suspense><Inner /></Suspense>;
}
