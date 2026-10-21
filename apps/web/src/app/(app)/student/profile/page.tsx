'use client';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Query } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/label';
import { Input, Textarea } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { api, errMessage } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';

interface Project { title: string; description?: string; techStack?: string[]; url?: string }
interface Cert { name: string; issuer?: string; year?: number; credentialUrl?: string }
interface Profile { rollNumber?: string; department?: string; graduationYear?: number; cgpa?: number; tenthPercent?: number; twelfthPercent?: number; activeBacklogs?: number; historyOfBacklogs?: boolean; phone?: string; headline?: string; projects?: Project[]; certifications?: Cert[]; mentor?: { name: string } | null; completion: { percent: number; items: { key: string; label: string; done: boolean }[] } }

const numOrUndef = (v: string) => (v === '' ? undefined : Number(v));

function ProfileForm({ p, id, onSaved }: { p: Profile; id: string; onSaved: () => void }) {
  const [f, setF] = useState({ rollNumber: p.rollNumber ?? '', department: p.department ?? '', graduationYear: p.graduationYear?.toString() ?? '', cgpa: p.cgpa?.toString() ?? '', tenthPercent: p.tenthPercent?.toString() ?? '', twelfthPercent: p.twelfthPercent?.toString() ?? '', activeBacklogs: p.activeBacklogs?.toString() ?? '0', historyOfBacklogs: !!p.historyOfBacklogs, phone: p.phone ?? '', headline: p.headline ?? '' });
  const [projects, setProjects] = useState<Project[]>(p.projects ?? []);
  const [certs, setCerts] = useState<Cert[]>(p.certifications ?? []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      await api.patch(`/students/${id}/profile`, {
        rollNumber: f.rollNumber || undefined, department: f.department || undefined, graduationYear: numOrUndef(f.graduationYear), cgpa: numOrUndef(f.cgpa),
        tenthPercent: numOrUndef(f.tenthPercent), twelfthPercent: numOrUndef(f.twelfthPercent), activeBacklogs: numOrUndef(f.activeBacklogs), historyOfBacklogs: f.historyOfBacklogs,
        phone: f.phone || undefined, headline: f.headline || undefined,
        projects: projects.filter((x) => x.title.trim()).map((x) => ({ title: x.title.trim(), description: x.description || undefined, techStack: x.techStack?.length ? x.techStack : undefined, url: x.url || undefined })),
        certifications: certs.filter((x) => x.name.trim()).map((x) => ({ name: x.name.trim(), issuer: x.issuer || undefined, year: x.year || undefined, credentialUrl: x.credentialUrl || undefined })),
      });
      setMsg({ ok: true, text: 'Profile saved. Eligibility and readiness will refresh shortly.' }); onSaved();
    } catch (err) { setMsg({ ok: false, text: errMessage(err) }); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={save} className="space-y-6" noValidate>
      <Card><CardHeader><CardTitle>Academic details</CardTitle><CardDescription>Used for eligibility rules. These are self-entered and the placement cell can correct them.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Roll number" htmlFor="pf-roll"><Input id="pf-roll" value={f.rollNumber} onChange={set('rollNumber')} /></Field>
          <Field label="Department" htmlFor="pf-dep"><Input id="pf-dep" value={f.department} onChange={set('department')} placeholder="e.g. CSE" /></Field>
          <Field label="Graduation year" htmlFor="pf-gy"><Input id="pf-gy" type="number" value={f.graduationYear} onChange={set('graduationYear')} /></Field>
          <Field label="CGPA (0 to 10)" htmlFor="pf-cgpa"><Input id="pf-cgpa" type="number" step="0.01" min={0} max={10} value={f.cgpa} onChange={set('cgpa')} /></Field>
          <Field label="10th %" htmlFor="pf-10"><Input id="pf-10" type="number" step="0.1" min={0} max={100} value={f.tenthPercent} onChange={set('tenthPercent')} /></Field>
          <Field label="12th %" htmlFor="pf-12"><Input id="pf-12" type="number" step="0.1" min={0} max={100} value={f.twelfthPercent} onChange={set('twelfthPercent')} /></Field>
          <Field label="Active backlogs" htmlFor="pf-bl"><Input id="pf-bl" type="number" min={0} max={30} value={f.activeBacklogs} onChange={set('activeBacklogs')} /></Field>
          <div className="flex items-end gap-3 pb-1"><Switch id="pf-hist" checked={f.historyOfBacklogs} onCheckedChange={(v) => setF((s) => ({ ...s, historyOfBacklogs: v }))} /><label htmlFor="pf-hist" className="text-sm">I have cleared backlogs in the past</label></div>
          <Field label="Phone" htmlFor="pf-ph"><Input id="pf-ph" value={f.phone} onChange={set('phone')} /></Field>
          <div className="sm:col-span-2 lg:col-span-3"><Field label="Headline" htmlFor="pf-hl"><Input id="pf-hl" value={f.headline} onChange={set('headline')} maxLength={200} placeholder="One line about you" /></Field></div>
          <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">Mentor: {p.mentor?.name ?? 'not assigned yet. Ask the placement cell.'}</p>
        </CardContent></Card>

      <Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle>Projects</CardTitle><CardDescription>Projects feed the project-depth part of readiness only after you submit them as evidence.</CardDescription></div><Button type="button" variant="outline" size="sm" onClick={() => setProjects((x) => [...x, { title: '' }])}><Plus />Add</Button></CardHeader>
        <CardContent className="space-y-4">{projects.length === 0 && <p className="text-sm text-muted-foreground">No projects yet.</p>}{projects.map((x, i) => (
          <div key={i} className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
            <Field label="Title" htmlFor={`pr-t-${i}`}><Input id={`pr-t-${i}`} value={x.title} onChange={(e) => setProjects((a) => a.map((y, j) => (j === i ? { ...y, title: e.target.value } : y)))} /></Field>
            <Field label="Tech stack (comma separated)" htmlFor={`pr-s-${i}`}><Input id={`pr-s-${i}`} value={(x.techStack ?? []).join(', ')} onChange={(e) => setProjects((a) => a.map((y, j) => (j === i ? { ...y, techStack: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } : y)))} /></Field>
            <div className="sm:col-span-2"><Field label="Description" htmlFor={`pr-d-${i}`}><Textarea id={`pr-d-${i}`} value={x.description ?? ''} onChange={(e) => setProjects((a) => a.map((y, j) => (j === i ? { ...y, description: e.target.value } : y)))} /></Field></div>
            <Field label="URL" htmlFor={`pr-u-${i}`}><Input id={`pr-u-${i}`} type="url" value={x.url ?? ''} onChange={(e) => setProjects((a) => a.map((y, j) => (j === i ? { ...y, url: e.target.value } : y)))} placeholder="https://" /></Field>
            <div className="flex items-end"><Button type="button" variant="ghost" onClick={() => setProjects((a) => a.filter((_, j) => j !== i))}><Trash2 />Remove</Button></div>
          </div>
        ))}</CardContent></Card>

      <Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle>Certifications</CardTitle></div><Button type="button" variant="outline" size="sm" onClick={() => setCerts((x) => [...x, { name: '' }])}><Plus />Add</Button></CardHeader>
        <CardContent className="space-y-4">{certs.length === 0 && <p className="text-sm text-muted-foreground">No certifications yet.</p>}{certs.map((x, i) => (
          <div key={i} className="grid gap-3 rounded-md border p-3 sm:grid-cols-3">
            <Field label="Name" htmlFor={`ce-n-${i}`}><Input id={`ce-n-${i}`} value={x.name} onChange={(e) => setCerts((a) => a.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} /></Field>
            <Field label="Issuer" htmlFor={`ce-i-${i}`}><Input id={`ce-i-${i}`} value={x.issuer ?? ''} onChange={(e) => setCerts((a) => a.map((y, j) => (j === i ? { ...y, issuer: e.target.value } : y)))} /></Field>
            <Field label="Year" htmlFor={`ce-y-${i}`}><Input id={`ce-y-${i}`} type="number" value={x.year ?? ''} onChange={(e) => setCerts((a) => a.map((y, j) => (j === i ? { ...y, year: e.target.value ? Number(e.target.value) : undefined } : y)))} /></Field>
            <div className="sm:col-span-3"><Button type="button" variant="ghost" onClick={() => setCerts((a) => a.filter((_, j) => j !== i))}><Trash2 />Remove</Button></div>
          </div>
        ))}</CardContent></Card>

      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`rounded-md border p-3 text-sm ${msg.ok ? 'border-verified/30 bg-verified-soft' : 'border-gap/30 bg-gap-soft'}`}>{msg.text}</p>}
      <div className="flex justify-end"><Button type="submit" size="lg" loading={busy}>Save profile</Button></div>
    </form>
  );
}

function ChangePassword() {
  const [cur, setCur] = useState(''); const [next, setNext] = useState(''); const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try { await api.post('/auth/change-password', { currentPassword: cur, newPassword: next }); setCur(''); setNext(''); setMsg({ ok: true, text: 'Password changed. Other devices have been signed out.' }); }
    catch (err) { setMsg({ ok: false, text: errMessage(err) }); } finally { setBusy(false); }
  };
  return (
    <Card><CardHeader><CardTitle>Password</CardTitle><CardDescription>10 to 128 characters with at least one letter and one number. Changing it signs you out everywhere else.</CardDescription></CardHeader>
      <CardContent><form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Current password" htmlFor="pw-c"><Input id="pw-c" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
        <Field label="New password" htmlFor="pw-n"><Input id="pw-n" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={`rounded-md border p-3 text-sm sm:col-span-2 ${msg.ok ? 'border-verified/30 bg-verified-soft' : 'border-gap/30 bg-gap-soft'}`}>{msg.text}</p>}
        <div className="sm:col-span-2"><Button type="submit" variant="outline" loading={busy} disabled={!cur || next.length < 10}>Change password</Button></div>
      </form></CardContent></Card>
  );
}

export default function StudentProfile() {
  const { user } = useAuth();
  const q = useApi<Profile>(user ? `/students/${user.id}/profile` : null);
  return (
    <>
      <PageHeader title="Profile" description="Complete academic details are needed before eligibility can be checked." />
      <Query q={q} rows={4}>
        {(p) => (
          <div className="space-y-6">
            <Card><CardContent className="space-y-2 p-5"><div className="flex justify-between text-sm"><span className="font-medium">Profile completeness</span><span className="tabular">{p.completion.percent}%</span></div><Progress value={p.completion.percent} aria-label="Profile completeness" />{p.completion.percent < 100 && <p className="text-xs text-muted-foreground">Missing: {p.completion.items.filter((i) => !i.done).map((i) => i.label).join(', ')}</p>}</CardContent></Card>
            <ProfileForm key={JSON.stringify([p.cgpa, p.rollNumber])} p={p} id={user!.id} onSaved={() => q.mutate()} />
            <ChangePassword />
          </div>
        )}
      </Query>
    </>
  );
}
