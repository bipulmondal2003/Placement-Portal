'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState, Query } from '@/components/states';
import { Paginator } from '@/components/paginator';
import { useOptionalDebounce } from '@/components/admin/debounce';
import type { Page } from '@/components/officer/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input, Select } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api, errMessage, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { titleCase } from '@/lib/utils';

interface U { _id: string; name: string; email: string; role: string; department?: string; company?: string; active: boolean }
const ROLES = ['student', 'faculty', 'placement_officer', 'placement_head', 'recruiter', 'admin'];

function CreateUser({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'student', department: '', company: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<any>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try { await api.post('/users', { ...f, department: f.department || undefined, company: f.company || undefined }); onDone(); } catch (e2) { setErr(errMessage(e2)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Name" htmlFor="nu-n"><Input id="nu-n" value={f.name} onChange={set('name')} /></Field>
      <Field label="Email" htmlFor="nu-e"><Input id="nu-e" type="email" value={f.email} onChange={set('email')} /></Field>
      <Field label="Temporary password" htmlFor="nu-p" hint="10+ characters with a letter and a number. Ask the user to change it."><Input id="nu-p" type="password" autoComplete="new-password" value={f.password} onChange={set('password')} /></Field>
      <Field label="Role" htmlFor="nu-r"><Select id="nu-r" value={f.role} onChange={set('role')}>{ROLES.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}</Select></Field>
      {f.role === 'recruiter' ? <Field label="Company" htmlFor="nu-c"><Input id="nu-c" value={f.company} onChange={set('company')} /></Field> : <Field label="Department" htmlFor="nu-d"><Input id="nu-d" value={f.department} onChange={set('department')} /></Field>}
      {err && <p role="alert" className="rounded-md border border-gap/30 bg-gap-soft p-3 text-sm">{err}</p>}
      <div className="flex justify-end"><Button type="submit" loading={busy}>Create account</Button></div>
    </form>
  );
}

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [page, setPage] = useState(1); const [role, setRole] = useState(''); const [search, setSearch] = useState(''); const [open, setOpen] = useState(false); const [err, setErr] = useState<string | null>(null);
  const dq = useOptionalDebounce(search);
  const q = useApi<Page<U>>(`/users${qs({ page, limit: 15, role, q: dq })}`);
  const patch = async (id: string, body: object) => { setErr(null); try { await api.patch(`/users/${id}`, body); await q.mutate(); } catch (e) { setErr(errMessage(e)); } };
  return (
    <>
      <PageHeader title="Users" description="Create accounts, change roles and deactivate users. Role changes and deactivation sign the user out immediately." actions={<Button onClick={() => setOpen(true)}><Plus />New user</Button>} />
      <div className="mb-3 flex flex-wrap gap-3">
        <div><label htmlFor="us-q" className="mb-1 block text-xs text-muted-foreground">Search name or email</label><Input id="us-q" className="w-64" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
        <div><label htmlFor="us-r" className="mb-1 block text-xs text-muted-foreground">Role</label><Select id="us-r" className="w-44" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}><option value="">All roles</option>{ROLES.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}</Select></div>
      </div>
      {err && <p role="alert" className="mb-3 rounded-md border border-gap/30 bg-gap-soft p-3 text-sm">{err}</p>}
      <Query q={q} rows={5}>{(d) => d.items.length === 0 ? <EmptyState title="No users match" /> : (
        <><div className="overflow-x-auto glass rounded-xl"><Table><THead><TR><TH>Name</TH><TH>Email</TH><TH>Role</TH><TH>Dept / company</TH><TH>Status</TH><TH><span className="sr-only">Actions</span></TH></TR></THead><TBody>{d.items.map((u) => {
          const self = u._id === me?.id;
          return (
            <TR key={u._id}><TD className="font-medium">{u.name}</TD><TD className="text-xs">{u.email}</TD>
              <TD><label className="sr-only" htmlFor={`ur-${u._id}`}>Role for {u.name}</label><Select id={`ur-${u._id}`} className="h-8 w-40" disabled={self} value={u.role} onChange={(e) => patch(u._id, { role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}</Select></TD>
              <TD className="text-xs">{u.company ?? u.department ?? '—'}</TD><TD><Badge variant={u.active ? 'verified' : 'default'}>{u.active ? 'Active' : 'Inactive'}</Badge></TD>
              <TD><Button variant="outline" size="sm" disabled={self} title={self ? 'You cannot deactivate yourself' : undefined} onClick={() => patch(u._id, { active: !u.active })}>{u.active ? 'Deactivate' : 'Reactivate'}</Button></TD></TR>
          );
        })}</TBody></Table></div><Paginator page={d.page} pages={d.pages} total={d.total} onPage={setPage} /></>
      )}</Query>
      <Dialog open={open} onOpenChange={setOpen}><DialogContent title="New account"><CreateUser onDone={() => { setOpen(false); q.mutate(); }} /></DialogContent></Dialog>
    </>
  );
}
