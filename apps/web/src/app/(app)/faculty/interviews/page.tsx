'use client';
import { useState } from 'react';
import { Plus, X } from 'lucide-react';
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
import { fmtDate, LEVELS } from '@/lib/utils';

interface Row { _id: string; student: { _id: string; name: string }; topic: string; conductedAt: string; ratings: Record<string, number>; feedback?: string }
interface Stu { _id: string; user: { _id: string; name: string } }
const RATINGS: [string, string][] = [['technical', 'Technical'], ['problemSolving', 'Problem solving'], ['communication', 'Communication'], ['confidence', 'Confidence']];

function Form({ onDone }: { onDone: () => void }) {
  const students = useApi<Page<Stu>>('/students?limit=100');
  const [student, setStudent] = useState(''); const [topic, setTopic] = useState('');
  const [ratings, setRatings] = useState<Record<string, number>>({ technical: 3, problemSolving: 3, communication: 3, confidence: 3 });
  const [skills, setSkills] = useState<{ id: string; name: string; level: number }[]>([]);
  const [feedback, setFeedback] = useState(''); const [improvements, setImprovements] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (!student) return setErr('Choose a student.');
    if (topic.trim().length < 3) return setErr('Enter a topic.');
    setBusy(true);
    try { await api.post('/mock-interviews', { student, topic: topic.trim(), ratings, skillLevels: skills.map((s) => ({ skill: s.id, level: s.level })), feedback: feedback || undefined, improvements: improvements || undefined }); onDone(); }
    catch (e2) { setErr(errMessage(e2)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Student" htmlFor="mi-s"><Select id="mi-s" value={student} onChange={(e) => setStudent(e.target.value)}><option value="">Choose…</option>{students.data?.items.map((s) => <option key={s._id} value={s.user._id}>{s.user.name}</option>)}</Select></Field>
        <Field label="Topic" htmlFor="mi-t"><Input id="mi-t" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. System design basics" /></Field>
      </div>
      <fieldset><legend className="mb-2 text-sm font-medium">Ratings (1 to 5)</legend><div className="grid gap-3 sm:grid-cols-4">{RATINGS.map(([k, l]) => <Field key={k} label={l} htmlFor={`mi-r-${k}`}><Select id={`mi-r-${k}`} value={ratings[k]} onChange={(e) => setRatings((r) => ({ ...r, [k]: Number(e.target.value) }))}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>)}</div></fieldset>
      <div className="space-y-2"><p className="text-sm font-medium">Skill levels you observed</p>
        {skills.map((s) => <div key={s.id} className="flex items-center gap-2 rounded-md border p-2"><span className="flex-1 text-sm">{s.name}</span><label className="sr-only" htmlFor={`mi-l-${s.id}`}>Level for {s.name}</label><Select id={`mi-l-${s.id}`} className="w-40" value={s.level} onChange={(e) => setSkills((p) => p.map((x) => x.id === s.id ? { ...x, level: Number(e.target.value) } : x))}>{LEVELS.map((l, i) => <option key={l} value={i}>{i} · {l}</option>)}</Select><Button type="button" variant="ghost" size="icon" aria-label={`Remove ${s.name}`} onClick={() => setSkills((p) => p.filter((x) => x.id !== s.id))}><X /></Button></div>)}
        <SkillPicker id="mi-skill" label="Add a skill" exclude={skills.map((s) => s.id)} onPick={(s) => setSkills((p) => [...p, { id: s.id, name: s.name, level: 3 }])} /></div>
      <Field label="Feedback" htmlFor="mi-f"><Textarea id="mi-f" value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={4000} /></Field>
      <Field label="Areas to improve" htmlFor="mi-i"><Textarea id="mi-i" value={improvements} onChange={(e) => setImprovements(e.target.value)} maxLength={2000} /></Field>
      {err && <p role="alert" className="rounded-md border border-gap/30 bg-gap-soft p-3 text-sm">{err}</p>}
      <div className="flex justify-end"><Button type="submit" loading={busy}>Record interview</Button></div>
    </form>
  );
}

export default function FacultyInterviews() {
  const [page, setPage] = useState(1); const [open, setOpen] = useState(false);
  const q = useApi<Page<Row>>(`/mock-interviews/conducted${qs({ page, limit: 10 })}`);
  return (
    <>
      <PageHeader title="Mock interviews" description="Record structured feedback. Skill levels you enter become verified evidence only if the administrator has enabled auto-verification; otherwise they follow the normal review rules." actions={<Button onClick={() => setOpen(true)}><Plus />Record interview</Button>} />
      <Query q={q} rows={3}>
        {(d) => d.items.length === 0 ? <EmptyState title="No interviews recorded" /> : (
          <><Card><ul className="divide-y">{d.items.map((r) => <li key={r._id} className="p-4 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{r.student?.name} · {r.topic}</p><span className="text-xs text-muted-foreground">{fmtDate(r.conductedAt)}</span></div><div className="mt-1.5 flex flex-wrap gap-1.5">{RATINGS.map(([k, l]) => <Badge key={k}>{l} {r.ratings?.[k]}/5</Badge>)}</div>{r.feedback && <p className="mt-2 text-muted-foreground">{r.feedback}</p>}</li>)}</ul></Card><Paginator page={d.page} pages={d.pages} total={d.total} onPage={setPage} /></>
        )}
      </Query>
      <Dialog open={open} onOpenChange={setOpen}><DialogContent title="Record mock interview"><Form onDone={() => { setOpen(false); q.mutate(); }} /></DialogContent></Dialog>
    </>
  );
}
