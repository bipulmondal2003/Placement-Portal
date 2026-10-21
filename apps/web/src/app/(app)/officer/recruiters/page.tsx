'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Query } from '@/components/states';
import { Paginator } from '@/components/paginator';
import { AccessLog } from '@/components/officer/access-log';
import { Callout, Section } from '@/components/officer/kit';
import type { Page } from '@/components/officer/types';
import type { Drive as SDrive, Page as SPage } from '@/components/student/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input, Select } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, errMessage, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { fmtDateTime, titleCase } from '@/lib/utils';

interface Grant { _id: string; recruiter: { _id: string; name: string; company?: string; email: string }; drive: { _id: string; company: string; role: string }; releasedFields: string[]; validFrom: string; expiresAt: string; maxResultsPerSearch: number; state: string }
interface Fields { fields: string[]; headOnly: string[] }

const toLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

function CreateGrant({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const recs = useApi<{ _id: string; name: string; company?: string; email: string }[]>('/recruiter-access/recruiters');
  const drives = useApi<SPage<SDrive>>('/drives?limit=50');
  const fields = useApi<Fields>('/recruiter-access/releasable-fields');
  const [recruiterId, setR] = useState(''); const [driveId, setD] = useState('');
  const [picked, setPicked] = useState<string[]>(['department', 'graduationYear', 'readinessScore', 'verifiedSkills']);
  const [exp, setExp] = useState(toLocal(new Date(Date.now() + 14 * 86400000))); const [max, setMax] = useState(25);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const isHead = user?.role === 'placement_head';
  const toggle = (f: string) => setPicked((p) => (p.includes(f) ? p.filter((x) => x !== f) : [...p, f]));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (!recruiterId || !driveId) return setErr('Choose a recruiter and a drive.');
    if (picked.length === 0) return setErr('Release at least one field.');
    setBusy(true);
    try { await api.post('/recruiter-access/grants', { recruiterId, driveId, releasedFields: picked, expiresAt: new Date(exp).toISOString(), maxResultsPerSearch: max }); onDone(); }
    catch (e2) { setErr(errMessage(e2)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Recruiter" htmlFor="gr-r"><Select id="gr-r" value={recruiterId} onChange={(e) => setR(e.target.value)}><option value="">Choose…</option>{recs.data?.map((r) => <option key={r._id} value={r._id}>{r.name} · {r.company}</option>)}</Select></Field>
        <Field label="Drive" htmlFor="gr-d" hint="They see only students registered for this drive"><Select id="gr-d" value={driveId} onChange={(e) => setD(e.target.value)}><option value="">Choose…</option>{drives.data?.items.map((d) => <option key={d._id} value={d._id}>{d.company} · {d.role}</option>)}</Select></Field>
        <Field label="Access ends (max 90 days)" htmlFor="gr-e"><Input id="gr-e" type="datetime-local" value={exp} onChange={(e) => setExp(e.target.value)} /></Field>
        <Field label="Max results per search (1-50)" htmlFor="gr-m"><Input id="gr-m" type="number" min={1} max={50} value={max} onChange={(e) => setMax(Number(e.target.value))} /></Field>
      </div>
      <fieldset><legend className="mb-2 text-sm font-medium">Fields to release</legend>
        <div className="grid gap-2 sm:grid-cols-2">{fields.data?.fields.map((f) => {
          const locked = fields.data!.headOnly.includes(f) && !isHead;
          return <label key={f} className={`flex items-center gap-2 rounded-md border p-2 text-sm ${locked ? 'opacity-60' : ''}`}><input type="checkbox" className="size-4" disabled={locked} checked={picked.includes(f)} onChange={() => toggle(f)} />{titleCase(f)}{locked && <Badge>Head only</Badge>}</label>;
        })}</div>
        <p className="mt-1 text-xs text-muted-foreground">Only checked fields leave the system. Contact details can be released by the Placement Head only.</p>
      </fieldset>
      {err && <p role="alert" className="rounded-md border border-gap/30 bg-gap-soft p-3 text-sm">{err}</p>}
      <div className="flex justify-end"><Button type="submit" loading={busy}>Grant access</Button></div>
    </form>
  );
}

function Grants() {
  const [page, setPage] = useState(1); const [status, setStatus] = useState(''); const [open, setOpen] = useState(false); const [err, setErr] = useState<string | null>(null);
  const q = useApi<Page<Grant>>(`/recruiter-access/grants${qs({ page, limit: 10, status })}`);
  const revoke = async (g: Grant) => {
    const reason = window.prompt(`Revoke ${g.recruiter.name}'s access to ${g.drive.company}? Optional reason:`);
    if (reason === null) return;
    setErr(null);
    try { await api.post(`/recruiter-access/grants/${g._id}/revoke`, { reason: reason || undefined }); await q.mutate(); } catch (e) { setErr(errMessage(e)); }
  };
  return (
    <Section title="Grants" description="Each grant is one recruiter, one drive, a fixed field list and an end time." actions={<Button size="sm" onClick={() => setOpen(true)}><Plus />New grant</Button>}>
      <div className="mb-3 flex items-center gap-2"><label htmlFor="gs" className="text-sm text-muted-foreground">State</label><Select id="gs" className="h-8 w-36" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All</option><option value="active">Active</option><option value="expired">Expired</option><option value="revoked">Revoked</option></Select></div>
      {err && <p role="alert" className="mb-2 text-sm text-gap">{err}</p>}
      <Query q={q} rows={3}>{(d) => d.items.length === 0 ? <p className="text-sm text-muted-foreground">No grants.</p> : (
        <><ul className="divide-y">{d.items.map((g) => (
          <li key={g._id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
            <div className="min-w-0"><p className="font-medium">{g.recruiter.name} <span className="font-normal text-muted-foreground">({g.recruiter.company})</span> → {g.drive.company} · {g.drive.role}</p><p className="text-xs text-muted-foreground">{fmtDateTime(g.validFrom)} to {fmtDateTime(g.expiresAt)} · up to {g.maxResultsPerSearch} results</p><div className="mt-1.5 flex flex-wrap gap-1">{g.releasedFields.map((f) => <Badge key={f}>{titleCase(f)}</Badge>)}</div></div>
            <div className="flex items-center gap-2"><Badge variant={g.state === 'active' ? 'verified' : 'default'}>{titleCase(g.state)}</Badge>{g.state === 'active' && <Button variant="outline" size="sm" onClick={() => revoke(g)}>Revoke</Button>}</div>
          </li>
        ))}</ul><Paginator page={d.page} pages={d.pages} total={d.total} onPage={setPage} /></>
      )}</Query>
      <Dialog open={open} onOpenChange={setOpen}><DialogContent title="Grant recruiter access" description="Time-boxed and limited to one drive."><CreateGrant onDone={() => { setOpen(false); q.mutate(); }} /></DialogContent></Dialog>
    </Section>
  );
}

export default function OfficerRecruiters() {
  return (
    <>
      <PageHeader title="Recruiter access" description="Recruiters never see student data by default. You release specific fields for one drive, for a limited time." />
      <div className="mb-4"><Callout>There is no bulk export. Recruiters see at most 50 candidates per search, identified by a drive-specific candidate id rather than a student account id. Every search and view is logged below.</Callout></div>
      <Tabs defaultValue="grants"><TabsList><TabsTrigger value="grants">Grants</TabsTrigger><TabsTrigger value="log">Access log</TabsTrigger></TabsList>
        <TabsContent value="grants"><Grants /></TabsContent><TabsContent value="log"><Section title="Access log"><AccessLog /></Section></TabsContent></Tabs>
    </>
  );
}
