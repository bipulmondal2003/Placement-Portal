'use client';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState, Query } from '@/components/states';
import { Paginator } from '@/components/paginator';
import { SkillPicker } from '@/components/student/skill-picker';
import type { Page } from '@/components/student/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input, Select, Textarea } from '@/components/ui/input';
import { api, errMessage, qs } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { fmtDate, titleCase } from '@/lib/utils';

interface A { _id: string; title: string; description?: string; questions: unknown[]; durationMinutes: number; maxAttempts: number; status: string; departments: string[]; graduationYears: number[]; createdAt: string }
interface R { _id: string; student: { name: string; email: string }; score: number; total: number; percent: number; submittedAt: string }
interface Q { prompt: string; options: string[]; correctIndex: number; skill?: { id: string; name: string }; explanation: string }
const blankQ = (): Q => ({ prompt: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' });

function Create({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState(''); const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(30); const [attempts, setAttempts] = useState(2);
  const [departments, setDepartments] = useState(''); const [years, setYears] = useState('');
  const [qs_, setQs] = useState<Q[]>([blankQ()]);
  const [publish, setPublish] = useState(true);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const upd = (i: number, p: Partial<Q>) => setQs((a) => a.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (title.trim().length < 3) return setErr('Give the assessment a title.');
    for (const [i, q] of qs_.entries()) {
      if (q.prompt.trim().length < 3) return setErr(`Question ${i + 1} needs text.`);
      if (q.options.filter((o) => o.trim()).length < 2) return setErr(`Question ${i + 1} needs at least two options.`);
      if (!q.options[q.correctIndex]?.trim()) return setErr(`Question ${i + 1}: the correct answer is an empty option.`);
      if (!q.skill) return setErr(`Question ${i + 1} must be linked to a skill.`);
    }
    setBusy(true);
    try {
      await api.post('/assessments', {
        title: title.trim(), description: description || undefined, durationMinutes: duration, maxAttempts: attempts, status: publish ? 'published' : 'draft',
        departments: departments.split(',').map((s) => s.trim()).filter(Boolean), graduationYears: years.split(',').map((s) => Number(s.trim())).filter(Boolean),
        questions: qs_.map((q) => {
          // Drop blank options but keep the correct index pointing at the same text.
          const kept = q.options.map((o, idx) => ({ o: o.trim(), idx })).filter((x) => x.o);
          return { prompt: q.prompt.trim(), options: kept.map((x) => x.o), correctIndex: kept.findIndex((x) => x.idx === q.correctIndex), skill: q.skill!.id, explanation: q.explanation || undefined };
        }),
      });
      onDone();
    } catch (e2) { setErr(errMessage(e2)); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Title" htmlFor="as-t"><Input id="as-t" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Description" htmlFor="as-d"><Textarea id="as-d" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Minutes" htmlFor="as-m"><Input id="as-m" type="number" min={5} max={240} value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></Field>
        <Field label="Max attempts" htmlFor="as-a"><Input id="as-a" type="number" min={1} max={20} value={attempts} onChange={(e) => setAttempts(Number(e.target.value))} /></Field>
        <Field label="Departments" htmlFor="as-dep" hint="Comma separated. Blank = all"><Input id="as-dep" value={departments} onChange={(e) => setDepartments(e.target.value)} /></Field>
        <Field label="Graduation years" htmlFor="as-y" hint="Blank = all"><Input id="as-y" value={years} onChange={(e) => setYears(e.target.value)} placeholder="2027, 2028" /></Field>
      </div>
      <div className="space-y-3">
        {qs_.map((q, i) => (
          <fieldset key={i} className="space-y-3 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">Question {i + 1}</legend>
            <Field label="Prompt" htmlFor={`q-p-${i}`}><Textarea id={`q-p-${i}`} className="min-h-[60px]" value={q.prompt} onChange={(e) => upd(i, { prompt: e.target.value })} /></Field>
            <div className="space-y-2">{q.options.map((o, oi) => (
              <div key={oi} className="flex items-center gap-2"><input type="radio" className="size-4" name={`q-c-${i}`} checked={q.correctIndex === oi} onChange={() => upd(i, { correctIndex: oi })} aria-label={`Option ${oi + 1} is correct`} /><Input aria-label={`Option ${oi + 1}`} value={o} onChange={(e) => upd(i, { options: q.options.map((x, k) => (k === oi ? e.target.value : x)) })} placeholder={`Option ${oi + 1}`} /></div>
            ))}<p className="text-xs text-muted-foreground">Select the radio next to the correct option.</p></div>
            <div>{q.skill ? <p className="text-sm">Skill: <Badge variant="primary">{q.skill.name}</Badge> <button type="button" className="ml-2 text-xs text-primary underline" onClick={() => upd(i, { skill: undefined })}>change</button></p> : <SkillPicker id={`q-s-${i}`} label="Skill this tests" onPick={(s) => upd(i, { skill: { id: s.id, name: s.name } })} />}</div>
            <Field label="Explanation (shown after submission)" htmlFor={`q-e-${i}`}><Input id={`q-e-${i}`} value={q.explanation} onChange={(e) => upd(i, { explanation: e.target.value })} /></Field>
            {qs_.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => setQs((a) => a.filter((_, j) => j !== i))}><Trash2 />Remove question</Button>}
          </fieldset>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setQs((a) => [...a, blankQ()])}><Plus />Add question</Button>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={publish} onChange={(e) => setPublish(e.target.checked)} />Publish immediately (students can take it)</label>
      {err && <p role="alert" className="rounded-md border border-gap/30 bg-gap-soft p-3 text-sm">{err}</p>}
      <div className="flex justify-end"><Button type="submit" loading={busy}>Create assessment</Button></div>
    </form>
  );
}

function Results({ id }: { id: string }) {
  const q = useApi<Page<R>>(`/assessments/${id}/results?limit=50`);
  return <Query q={q} rows={3}>{(d) => d.items.length === 0 ? <p className="text-sm text-muted-foreground">No attempts yet.</p> : (
    <ul className="divide-y rounded-md border text-sm">{d.items.map((r) => <li key={r._id} className="flex justify-between gap-2 p-2.5"><span>{r.student?.name}<span className="ml-2 text-xs text-muted-foreground">{fmtDate(r.submittedAt)}</span></span><span className="tabular font-medium">{r.score}/{r.total} · {r.percent}%</span></li>)}</ul>
  )}</Query>;
}

export default function FacultyAssessments() {
  const [page, setPage] = useState(1); const [open, setOpen] = useState(false); const [res, setRes] = useState<A | null>(null); const [err, setErr] = useState<string | null>(null);
  const q = useApi<Page<A>>(`/assessments/manage${qs({ page, limit: 10 })}`);
  const setStatus = async (id: string, status: string) => { setErr(null); try { await api.patch(`/assessments/${id}/status`, { status }); await q.mutate(); } catch (e) { setErr(errMessage(e)); } };
  return (
    <>
      <PageHeader title="Assessments" description="Objective multiple-choice tests. Scores become evidence for the skills each question tests." actions={<Button onClick={() => setOpen(true)}><Plus />New assessment</Button>} />
      {err && <p role="alert" className="mb-3 rounded-md border border-gap/30 bg-gap-soft p-3 text-sm">{err}</p>}
      <Query q={q} rows={3}>
        {(d) => d.items.length === 0 ? <EmptyState title="No assessments yet" action={<Button onClick={() => setOpen(true)}>Create one</Button>} /> : (
          <><Card><ul className="divide-y">{d.items.map((a) => (
            <li key={a._id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0"><p className="font-medium">{a.title} <Badge variant={a.status === 'published' ? 'verified' : 'default'}>{titleCase(a.status)}</Badge></p><p className="text-xs text-muted-foreground">{a.questions.length} questions · {a.durationMinutes} min · {a.maxAttempts} attempts · {a.departments.length ? a.departments.join(', ') : 'all departments'}{a.graduationYears.length ? ` · ${a.graduationYears.join(', ')}` : ''}</p></div>
              <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setRes(a)}>Results</Button>
                <label className="sr-only" htmlFor={`st-${a._id}`}>Status of {a.title}</label>
                <Select id={`st-${a._id}`} className="h-8 w-32" value={a.status} onChange={(e) => setStatus(a._id, e.target.value)}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></Select></div>
            </li>
          ))}</ul></Card><Paginator page={d.page} pages={d.pages} total={d.total} onPage={setPage} /></>
        )}
      </Query>
      <Dialog open={open} onOpenChange={setOpen}><DialogContent title="New assessment"><Create onDone={() => { setOpen(false); q.mutate(); }} /></DialogContent></Dialog>
      <Dialog open={!!res} onOpenChange={(o) => !o && setRes(null)}><DialogContent title={res?.title ?? ''} description="Attempts by your students">{res && <Results id={res._id} />}</DialogContent></Dialog>
    </>
  );
}
