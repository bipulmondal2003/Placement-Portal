'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Query } from '@/components/states';
import { Paginator } from '@/components/paginator';
import { DriveStatusBadge, EligibilityBadge, RegistrationBadge } from '@/components/status-badges';
import { Callout, Section } from '@/components/officer/kit';
import type { DriveDetail, EligibilityRule, Page, Taxonomy } from '@/components/officer/types';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api, errMessage, qs } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { fmtDate, LEVELS } from '@/lib/utils';

interface Req { kind: 'skill' | 'cluster'; target: string; requiredLevel: number; weight: number; mandatory: boolean }
interface Reg { _id: string; student: { _id: string; name: string; email: string; department: string }; status: string; eligibility: { eligible: boolean; reasons: string[] }; readiness?: { score: number } | null; cgpa?: number; graduationYear?: number }

function useMsg() { const [m, setM] = useState<{ ok: boolean; text: string } | null>(null); return [m, setM] as const; }
function Msg({ m }: { m: { ok: boolean; text: string } | null }) { return m ? <p role={m.ok ? 'status' : 'alert'} className={`mt-3 rounded-md border p-3 text-sm ${m.ok ? 'border-verified/30 bg-verified-soft' : 'border-gap/30 bg-gap-soft'}`}>{m.text}</p> : null; }

function Requirements({ d, onSaved }: { d: DriveDetail; onSaved: () => void }) {
  const tax = useApi<Taxonomy>('/skills/taxonomy');
  const [rows, setRows] = useState<Req[]>([]);
  const [m, setM] = useMsg(); const [busy, setBusy] = useState(false);
  useEffect(() => { setRows(d.requirements.map((r) => ({ kind: r.kind, target: (r.kind === 'skill' ? r.skill?.id : r.cluster?.id) ?? '', requiredLevel: r.requiredLevel, weight: r.weight, mandatory: r.mandatory }))); }, [d.requirements]);
  const upd = (i: number, p: Partial<Req>) => setRows((a) => a.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const save = async () => {
    if (rows.some((r) => !r.target)) return setM({ ok: false, text: 'Choose a skill or cluster for every row.' });
    setBusy(true); setM(null);
    try { await api.put(`/drives/${d._id}/requirements`, { requirements: rows.map((r) => ({ kind: r.kind, [r.kind]: r.target, requiredLevel: r.requiredLevel, weight: r.weight, mandatory: r.mandatory })) }); setM({ ok: true, text: 'Requirements saved. Run a recalculation to refresh student scores.' }); onSaved(); }
    catch (e) { setM({ ok: false, text: errMessage(e) }); } finally { setBusy(false); }
  };
  return (
    <Section title="Requirements" description="Skills (or skill clusters, where any one member counts) a student needs. Weight sets how much it moves the score; a missing mandatory skill caps readiness." actions={<Button variant="outline" size="sm" onClick={() => setRows((a) => [...a, { kind: 'skill', target: '', requiredLevel: 3, weight: 5, mandatory: false }])}><Plus />Add</Button>}>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">No requirements yet. Readiness cannot be computed until at least one is added.</p>}
      <ul className="space-y-2">{rows.map((r, i) => (
        <li key={i} className="grid items-end gap-2 rounded-md border p-2.5 sm:grid-cols-[110px_1fr_130px_90px_100px_auto]">
          <Field label="Type" htmlFor={`rq-k-${i}`}><Select id={`rq-k-${i}`} value={r.kind} onChange={(e) => upd(i, { kind: e.target.value as any, target: '' })}><option value="skill">Skill</option><option value="cluster">Cluster</option></Select></Field>
          <Field label={r.kind === 'skill' ? 'Skill' : 'Cluster'} htmlFor={`rq-t-${i}`}><Select id={`rq-t-${i}`} value={r.target} onChange={(e) => upd(i, { target: e.target.value })}><option value="">Choose…</option>{(r.kind === 'skill' ? tax.data?.skills : tax.data?.clusters)?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
          <Field label="Level needed" htmlFor={`rq-l-${i}`}><Select id={`rq-l-${i}`} value={r.requiredLevel} onChange={(e) => upd(i, { requiredLevel: Number(e.target.value) })}>{LEVELS.slice(1).map((l, k) => <option key={l} value={k + 1}>{k + 1} · {l}</option>)}</Select></Field>
          <Field label="Weight 1-10" htmlFor={`rq-w-${i}`}><Input id={`rq-w-${i}`} type="number" min={1} max={10} value={r.weight} onChange={(e) => upd(i, { weight: Number(e.target.value) })} /></Field>
          <div className="flex items-center gap-2 pb-2"><Switch id={`rq-m-${i}`} checked={r.mandatory} onCheckedChange={(v) => upd(i, { mandatory: v })} /><label htmlFor={`rq-m-${i}`} className="text-sm">Mandatory</label></div>
          <Button variant="ghost" size="icon" aria-label="Remove requirement" onClick={() => setRows((a) => a.filter((_, j) => j !== i))}><Trash2 /></Button>
        </li>
      ))}</ul>
      <Msg m={m} />
      <div className="mt-4"><Button loading={busy} onClick={save}>Save requirements</Button></div>
    </Section>
  );
}

function Eligibility({ d, onSaved }: { d: DriveDetail; onSaved: () => void }) {
  const r: EligibilityRule = d.eligibilityRule ?? {};
  const [f, setF] = useState({ minCgpa: '', minTenthPercent: '', minTwelfthPercent: '', maxActiveBacklogs: '', departments: '', graduationYears: '', allowHistoryOfBacklogs: true });
  useEffect(() => setF({ minCgpa: r.minCgpa?.toString() ?? '', minTenthPercent: r.minTenthPercent?.toString() ?? '', minTwelfthPercent: r.minTwelfthPercent?.toString() ?? '', maxActiveBacklogs: r.maxActiveBacklogs?.toString() ?? '', departments: (r.departments ?? []).join(', '), graduationYears: (r.graduationYears ?? []).join(', '), allowHistoryOfBacklogs: r.allowHistoryOfBacklogs ?? true }), [d.eligibilityRule]); // eslint-disable-line react-hooks/exhaustive-deps
  const [m, setM] = useMsg(); const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const n = (v: string) => (v === '' ? undefined : Number(v));
  const save = async () => {
    setBusy(true); setM(null);
    try {
      await api.put(`/drives/${d._id}/eligibility-rule`, { minCgpa: n(f.minCgpa), minTenthPercent: n(f.minTenthPercent), minTwelfthPercent: n(f.minTwelfthPercent), maxActiveBacklogs: n(f.maxActiveBacklogs), departments: f.departments.split(',').map((s) => s.trim()).filter(Boolean), graduationYears: f.graduationYears.split(',').map((s) => Number(s.trim())).filter(Boolean), allowHistoryOfBacklogs: f.allowHistoryOfBacklogs });
      setM({ ok: true, text: 'Eligibility rule saved.' }); onSaved();
    } catch (e) { setM({ ok: false, text: errMessage(e) }); } finally { setBusy(false); }
  };
  return (
    <Section title="Eligibility rule" description="Pass or fail checks against the student’s academic record. Empty fields are not checked. Separate from readiness.">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Minimum CGPA" htmlFor="el-c"><Input id="el-c" type="number" step="0.1" value={f.minCgpa} onChange={set('minCgpa')} /></Field>
        <Field label="Minimum 10th %" htmlFor="el-10"><Input id="el-10" type="number" value={f.minTenthPercent} onChange={set('minTenthPercent')} /></Field>
        <Field label="Minimum 12th %" htmlFor="el-12"><Input id="el-12" type="number" value={f.minTwelfthPercent} onChange={set('minTwelfthPercent')} /></Field>
        <Field label="Max active backlogs" htmlFor="el-b"><Input id="el-b" type="number" min={0} value={f.maxActiveBacklogs} onChange={set('maxActiveBacklogs')} /></Field>
        <Field label="Departments" htmlFor="el-d" hint="Comma separated. Blank = all"><Input id="el-d" value={f.departments} onChange={set('departments')} /></Field>
        <Field label="Graduation years" htmlFor="el-y" hint="Blank = all"><Input id="el-y" value={f.graduationYears} onChange={set('graduationYears')} placeholder="2027" /></Field>
      </div>
      <div className="mt-3 flex items-center gap-2"><Switch id="el-h" checked={f.allowHistoryOfBacklogs} onCheckedChange={(v) => setF((s) => ({ ...s, allowHistoryOfBacklogs: v }))} /><label htmlFor="el-h" className="text-sm">Allow students with a history of cleared backlogs</label></div>
      <Msg m={m} /><div className="mt-4"><Button loading={busy} onClick={save}>Save rule</Button></div>
    </Section>
  );
}

function Registrations({ id }: { id: string }) {
  const [page, setPage] = useState(1); const [status, setStatus] = useState('');
  const q = useApi<Page<Reg>>(`/drives/${id}/registrations${qs({ page, limit: 15, status })}`);
  const [err, setErr] = useState<string | null>(null);
  const set = async (regId: string, s: string) => { setErr(null); try { await api.patch(`/drives/${id}/registrations/${regId}`, { status: s }); await q.mutate(); } catch (e) { setErr(errMessage(e)); } };
  return (
    <Section title="Registrations" actions={<><label htmlFor="rg-s" className="sr-only">Filter by status</label><Select id="rg-s" className="h-8 w-36" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option><option value="registered">Registered</option><option value="shortlisted">Shortlisted</option><option value="selected">Selected</option><option value="rejected">Rejected</option></Select></>}>
      {err && <p role="alert" className="mb-2 text-sm text-gap">{err}</p>}
      <Query q={q} rows={3}>{(d) => d.items.length === 0 ? <p className="text-sm text-muted-foreground">No registrations.</p> : (
        <><div className="overflow-x-auto"><Table><THead><TR><TH>Student</TH><TH>Dept</TH><TH>CGPA</TH><TH>Eligibility</TH><TH>Readiness</TH><TH>Status</TH></TR></THead><TBody>{d.items.map((r) => (
          <TR key={r._id}><TD><Link className="font-medium hover:underline" href={`/officer/students/${r.student._id}`}>{r.student.name}</Link></TD><TD>{r.student.department}</TD><TD className="tabular">{r.cgpa ?? '—'}</TD><TD><EligibilityBadge eligible={r.eligibility.eligible} /></TD><TD className="tabular">{r.readiness?.score ?? '—'}</TD>
            <TD>{r.status === 'withdrawn' ? <RegistrationBadge status={r.status} /> : <><label className="sr-only" htmlFor={`rs-${r._id}`}>Status for {r.student.name}</label><Select id={`rs-${r._id}`} className="h-8 w-32" value={r.status} onChange={(e) => set(r._id, e.target.value)}><option value="registered">Registered</option><option value="shortlisted">Shortlisted</option><option value="selected">Selected</option><option value="rejected">Rejected</option></Select></>}</TD></TR>
        ))}</TBody></Table></div><Paginator page={d.page} pages={d.pages} total={d.total} onPage={setPage} /></>
      )}</Query>
    </Section>
  );
}

export default function OfficerDriveDetail() {
  const { id } = useParams<{ id: string }>();
  const q = useApi<DriveDetail>(`/drives/${id}`);
  const [m, setM] = useMsg();
  const setStatus = async (status: string) => { setM(null); try { await api.post(`/drives/${id}/status`, { status }); await q.mutate(); setM({ ok: true, text: `Drive is now ${status}.` }); } catch (e) { setM({ ok: false, text: errMessage(e) }); } };
  return (
    <>
      <Link href="/officer/drives" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />All drives</Link>
      <Query q={q} rows={4}>{(d) => (
        <div className="space-y-6">
          <PageHeader title={`${d.company} · ${d.role}`} description={d.description} actions={<DriveStatusBadge status={d.status} />} />
          <Section title="Status" description={`Deadline ${fmtDate(d.deadline)} · ${d.registrationCount} registered · requirements version ${d.requirementsVersion}`}>
            <div className="flex flex-wrap gap-2">{(['draft', 'published', 'closed', 'completed'] as const).map((s) => <Button key={s} variant={d.status === s ? 'default' : 'outline'} size="sm" disabled={d.status === s} onClick={() => setStatus(s)}>{s === 'published' ? 'Publish' : s[0].toUpperCase() + s.slice(1)}</Button>)}</div>
            <Msg m={m} />
            {d.status === 'draft' && <div className="mt-3"><Callout>Students cannot see or register for a draft. Add requirements and an eligibility rule before publishing.</Callout></div>}
          </Section>
          <Requirements d={d} onSaved={() => q.mutate()} />
          <Eligibility d={d} onSaved={() => q.mutate()} />
          <Registrations id={id} />
        </div>
      )}</Query>
    </>
  );
}
