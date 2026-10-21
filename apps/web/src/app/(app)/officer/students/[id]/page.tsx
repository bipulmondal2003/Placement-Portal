'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Query } from '@/components/states';
import { EvidenceBar, EvidenceLegend } from '@/components/evidence-bar';
import { ScoreRing } from '@/components/score-ring';
import { EligibilityBadge } from '@/components/status-badges';
import { Section } from '@/components/officer/kit';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input, Select } from '@/components/ui/input';
import { api, errMessage } from '@/lib/api';
import { useApi } from '@/lib/hooks';

interface Profile { rollNumber?: string; department?: string; graduationYear?: number; cgpa?: number; tenthPercent?: number; twelfthPercent?: number; activeBacklogs?: number; name: string; email: string; mentor?: { _id: string; name: string } | null }
interface Skills { skills: { skillId: string; name: string; declaredLevel: number; selfReportedLevel: number; verifiedLevel: number }[] }
interface Ready { drive: { id: string; company: string; role: string }; eligibility: { eligible: boolean; reasons: string[] }; readiness: { score: number; topGap?: string } | null }
interface Fac { _id: string; name: string; department?: string }

function Msg({ m }: { m: { ok: boolean; text: string } | null }) { return m ? <p role={m.ok ? 'status' : 'alert'} className={`mt-3 rounded-md border p-3 text-sm ${m.ok ? 'border-verified/30 bg-verified-soft' : 'border-gap/30 bg-gap-soft'}`}>{m.text}</p> : null; }

function Edit({ p, id, onSaved }: { p: Profile; id: string; onSaved: () => void }) {
  const faculty = useApi<Fac[]>('/users/faculty');
  const [f, setF] = useState({ department: '', graduationYear: '', cgpa: '', tenthPercent: '', twelfthPercent: '', activeBacklogs: '' });
  const [mentor, setMentor] = useState('');
  const [m, setM] = useState<{ ok: boolean; text: string } | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { setF({ department: p.department ?? '', graduationYear: p.graduationYear?.toString() ?? '', cgpa: p.cgpa?.toString() ?? '', tenthPercent: p.tenthPercent?.toString() ?? '', twelfthPercent: p.twelfthPercent?.toString() ?? '', activeBacklogs: p.activeBacklogs?.toString() ?? '' }); setMentor(p.mentor?._id ?? ''); }, [p]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const n = (v: string) => (v === '' ? undefined : Number(v));
  const save = async () => {
    setBusy(true); setM(null);
    try {
      await api.patch(`/students/${id}/profile`, { department: f.department || undefined, graduationYear: n(f.graduationYear), cgpa: n(f.cgpa), tenthPercent: n(f.tenthPercent), twelfthPercent: n(f.twelfthPercent), activeBacklogs: n(f.activeBacklogs) });
      if (mentor && mentor !== p.mentor?._id) await api.put(`/users/${id}/mentor`, { facultyId: mentor });
      setM({ ok: true, text: 'Saved. Eligibility and readiness will refresh for this student.' }); onSaved();
    } catch (e) { setM({ ok: false, text: errMessage(e) }); } finally { setBusy(false); }
  };
  return (
    <Section title="Academic record and mentor" description="Students enter these themselves; the placement cell can correct them. Changes are audited.">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Department" htmlFor="se-d"><Input id="se-d" value={f.department} onChange={set('department')} /></Field>
        <Field label="Graduation year" htmlFor="se-y"><Input id="se-y" type="number" value={f.graduationYear} onChange={set('graduationYear')} /></Field>
        <Field label="CGPA" htmlFor="se-c"><Input id="se-c" type="number" step="0.01" value={f.cgpa} onChange={set('cgpa')} /></Field>
        <Field label="10th %" htmlFor="se-10"><Input id="se-10" type="number" value={f.tenthPercent} onChange={set('tenthPercent')} /></Field>
        <Field label="12th %" htmlFor="se-12"><Input id="se-12" type="number" value={f.twelfthPercent} onChange={set('twelfthPercent')} /></Field>
        <Field label="Active backlogs" htmlFor="se-b"><Input id="se-b" type="number" min={0} value={f.activeBacklogs} onChange={set('activeBacklogs')} /></Field>
        <Field label="Faculty mentor" htmlFor="se-m"><Select id="se-m" value={mentor} onChange={(e) => setMentor(e.target.value)}><option value="">Not assigned</option>{faculty.data?.map((x) => <option key={x._id} value={x._id}>{x.name}{x.department ? ` (${x.department})` : ''}</option>)}</Select></Field>
      </div>
      <Msg m={m} /><div className="mt-4"><Button loading={busy} onClick={save}>Save changes</Button></div>
    </Section>
  );
}

export default function OfficerStudentDetail() {
  const { id } = useParams<{ id: string }>();
  const profile = useApi<Profile>(`/students/${id}/profile`);
  const skills = useApi<Skills>(`/students/${id}/skills`);
  const ready = useApi<Ready[]>(`/students/${id}/readiness`);
  return (
    <>
      <Link href="/officer/students" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />All students</Link>
      <Query q={profile} rows={2}>{(p) => (
        <div className="space-y-6">
          <PageHeader title={p.name} description={`${p.email} · ${p.rollNumber ?? 'no roll number'} · Mentor: ${p.mentor?.name ?? 'none'}`} />
          <Edit p={p} id={id} onSaved={() => { profile.mutate(); ready.mutate(); }} />
          <Section title="Readiness by drive"><Query q={ready} rows={2}>{(rows) => rows.length === 0 ? <p className="text-sm text-muted-foreground">No drives.</p> : (
            <ul className="grid gap-3 sm:grid-cols-2">{rows.map((r) => <li key={r.drive.id} className="flex items-center gap-3 rounded-md border p-3"><ScoreRing score={r.readiness?.score} size={72} label="" /><div className="min-w-0 text-sm"><p className="truncate font-medium">{r.drive.company} · {r.drive.role}</p><div className="my-1"><EligibilityBadge eligible={r.eligibility.eligible} /></div>{r.eligibility.reasons.length > 0 && <p className="text-xs text-muted-foreground">{r.eligibility.reasons.join('; ')}</p>}</div></li>)}</ul>
          )}</Query></Section>
          <Section title="Skills"><div className="mb-2"><EvidenceLegend /></div><Query q={skills} rows={3}>{(d) => d.skills.length === 0 ? <p className="text-sm text-muted-foreground">No skills added.</p> : (
            <ul className="divide-y rounded-md border">{d.skills.map((s) => <li key={s.skillId} className="grid items-center gap-2 p-2.5 text-sm sm:grid-cols-[1fr_1.4fr]"><span>{s.name}</span><EvidenceBar verified={s.verifiedLevel} claimed={Math.max(s.declaredLevel, s.selfReportedLevel)} /></li>)}</ul>
          )}</Query></Section>
        </div>
      )}</Query>
    </>
  );
}
