'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { EmptyState, Query } from '@/components/states';
import { Paginator } from '@/components/paginator';
import { DriveStatusBadge } from '@/components/status-badges';
import type { Drive, Page } from '@/components/officer/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input, Select, Textarea } from '@/components/ui/input';
import { api, errMessage, qs } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { fmtDate } from '@/lib/utils';

function CreateDrive({ onCreated }: { onCreated: (id: string) => void }) {
  const [f, setF] = useState({ company: '', role: '', description: '', roleFamily: 'software-development', deadline: '', driveDate: '', location: '', package: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<any>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (f.company.trim().length < 2 || f.role.trim().length < 2) return setErr('Company and role are required.');
    if (!f.deadline) return setErr('Set an application deadline.');
    setBusy(true);
    try {
      const d = await api.post<{ _id: string }>('/drives', { ...f, deadline: new Date(f.deadline).toISOString(), driveDate: f.driveDate ? new Date(f.driveDate).toISOString() : undefined, description: f.description || undefined, location: f.location || undefined, package: f.package || undefined });
      onCreated(d._id);
    } catch (e2) { setErr(errMessage(e2)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company" htmlFor="dr-c"><Input id="dr-c" value={f.company} onChange={set('company')} /></Field>
        <Field label="Role" htmlFor="dr-r"><Input id="dr-r" value={f.role} onChange={set('role')} /></Field>
        <Field label="Role family" htmlFor="dr-f" hint="Decides which skill taxonomy applies"><Select id="dr-f" value={f.roleFamily} onChange={set('roleFamily')}><option value="software-development">Software development</option><option value="data">Data</option><option value="testing">Testing / QA</option></Select></Field>
        <Field label="Package" htmlFor="dr-p"><Input id="dr-p" value={f.package} onChange={set('package')} placeholder="e.g. 8 LPA" /></Field>
        <Field label="Application deadline" htmlFor="dr-d"><Input id="dr-d" type="datetime-local" value={f.deadline} onChange={set('deadline')} /></Field>
        <Field label="Drive date" htmlFor="dr-dd"><Input id="dr-dd" type="datetime-local" value={f.driveDate} onChange={set('driveDate')} /></Field>
        <Field label="Location" htmlFor="dr-l"><Input id="dr-l" value={f.location} onChange={set('location')} /></Field>
      </div>
      <Field label="Description" htmlFor="dr-ds"><Textarea id="dr-ds" value={f.description} onChange={set('description')} /></Field>
      <p className="text-xs text-muted-foreground">The drive is created as a draft. Add requirements and the eligibility rule, then publish.</p>
      {err && <p role="alert" className="rounded-md border border-gap/30 bg-gap-soft p-3 text-sm">{err}</p>}
      <div className="flex justify-end"><Button type="submit" loading={busy}>Create draft</Button></div>
    </form>
  );
}

export default function OfficerDrives() {
  const router = useRouter();
  const [page, setPage] = useState(1); const [status, setStatus] = useState(''); const [open, setOpen] = useState(false);
  const q = useApi<Page<Drive & { registrationCount?: number }>>(`/drives${qs({ page, limit: 12, status })}`);
  return (
    <>
      <PageHeader title="Drives" description="Create drives, define what they require, and control who may register." actions={<Button onClick={() => setOpen(true)}><Plus />New drive</Button>} />
      <div className="mb-3 flex items-center gap-2"><label htmlFor="dl-s" className="text-sm text-muted-foreground">Status</label><Select id="dl-s" className="w-40" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All</option><option value="draft">Draft</option><option value="published">Published</option><option value="closed">Closed</option><option value="completed">Completed</option></Select></div>
      <Query q={q} rows={4}>
        {(d) => d.items.length === 0 ? <EmptyState title="No drives" action={<Button onClick={() => setOpen(true)}>Create the first drive</Button>} /> : (
          <><Card><ul className="divide-y">{d.items.map((x) => (
            <li key={x._id}><Link href={`/officer/drives/${x._id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-muted/50"><div className="min-w-0"><p className="font-medium">{x.company} · {x.role}</p><p className="text-xs text-muted-foreground">Deadline {fmtDate(x.deadline)}{x.location ? ` · ${x.location}` : ''}{x.package ? ` · ${x.package}` : ''}</p></div><DriveStatusBadge status={x.status} /></Link></li>
          ))}</ul></Card><Paginator page={d.page} pages={d.pages} total={d.total} onPage={setPage} /></>
        )}
      </Query>
      <Dialog open={open} onOpenChange={setOpen}><DialogContent title="New drive"><CreateDrive onCreated={(id) => router.push(`/officer/drives/${id}`)} /></DialogContent></Dialog>
    </>
  );
}
