'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Query } from '@/components/states';
import { Callout, Section } from '@/components/officer/kit';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { api, errMessage } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { fmtDateTime, titleCase } from '@/lib/utils';

interface Cfg {
  dimensionWeights: Record<string, number>; evidenceWeights: Record<string, number>; evidenceFloor: number; projectDepthTargetLevel: number; assessmentLevelThresholds: number[];
  assessmentAutoVerify: boolean; mockInterviewAutoVerify: boolean; registrationOpenForStudents: boolean; aiFeaturesEnabled: boolean; version: number; updatedAt: string;
}

function Form({ c, onSaved }: { c: Cfg; onSaved: () => void }) {
  const [dw, setDw] = useState(c.dimensionWeights); const [ew, setEw] = useState(c.evidenceWeights);
  const [floor, setFloor] = useState(c.evidenceFloor); const [pd, setPd] = useState(c.projectDepthTargetLevel); const [th, setTh] = useState(c.assessmentLevelThresholds.join(', '));
  const [sw, setSw] = useState({ assessmentAutoVerify: c.assessmentAutoVerify, mockInterviewAutoVerify: c.mockInterviewAutoVerify, registrationOpenForStudents: c.registrationOpenForStudents, aiFeaturesEnabled: c.aiFeaturesEnabled });
  const [busy, setBusy] = useState(false); const [m, setM] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setDw(c.dimensionWeights); setEw(c.evidenceWeights); }, [c]);
  const sum = Object.values(dw).reduce((a, b) => a + (Number(b) || 0), 0);

  const save = async () => {
    const thresholds = th.split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
    setBusy(true); setM(null);
    try { await api.patch('/admin/config', { dimensionWeights: dw, evidenceWeights: ew, evidenceFloor: floor, projectDepthTargetLevel: pd, assessmentLevelThresholds: thresholds, ...sw }); setM({ ok: true, text: 'Settings saved. Existing scores change only after a recalculation (Placement → Recalculation).' }); onSaved(); }
    catch (e) { setM({ ok: false, text: errMessage(e) }); } finally { setBusy(false); }
  };
  const num = (set: React.Dispatch<React.SetStateAction<Record<string, number>>>, k: string) => (e: React.ChangeEvent<HTMLInputElement>) => set((s) => ({ ...s, [k]: Number(e.target.value) }));
  return (
    <div className="space-y-6">
      <Callout title="These settings change how every student is scored">Weights are renormalised to sum to 1, so only their ratios matter. Version {c.version}, last changed {fmtDateTime(c.updatedAt)}.</Callout>
      <Section title="Readiness dimension weights" description={`Current sum ${sum.toFixed(2)}. Dimensions a drive does not use are left out and the rest renormalised.`}>
        <div className="grid gap-4 sm:grid-cols-4">{Object.entries(dw).map(([k, v]) => <Field key={k} label={titleCase(k)} htmlFor={`dw-${k}`}><Input id={`dw-${k}`} type="number" step="0.05" min={0} max={1} value={v} onChange={num(setDw, k)} /></Field>)}</div>
      </Section>
      <Section title="Evidence strength" description="How much each kind of verified evidence is trusted when it supports a level. The floor is the minimum credit any verified evidence earns.">
        <div className="grid gap-4 sm:grid-cols-3">{Object.entries(ew).map(([k, v]) => <Field key={k} label={titleCase(k)} htmlFor={`ew-${k}`}><Input id={`ew-${k}`} type="number" step="0.05" min={0} max={1} value={v} onChange={num(setEw, k)} /></Field>)}
          <Field label="Evidence floor (0-1)" htmlFor="ef"><Input id="ef" type="number" step="0.05" min={0} max={1} value={floor} onChange={(e) => setFloor(Number(e.target.value))} /></Field></div>
      </Section>
      <Section title="Levels and thresholds">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project depth target level (1-5)" htmlFor="pd"><Input id="pd" type="number" min={1} max={5} value={pd} onChange={(e) => setPd(Number(e.target.value))} /></Field>
          <Field label="Assessment score thresholds (%) for levels 1-5" htmlFor="th" hint="Five ascending numbers, comma separated"><Input id="th" value={th} onChange={(e) => setTh(e.target.value)} /></Field>
        </div>
      </Section>
      <Section title="Switches">
        <ul className="space-y-3 text-sm">{([['assessmentAutoVerify', 'Assessment results count as verified evidence automatically'], ['mockInterviewAutoVerify', 'Mock interview ratings count as verified evidence automatically'], ['registrationOpenForStudents', 'Students may register for drives'], ['aiFeaturesEnabled', 'AI assistance enabled (needs a server API key; never affects scores)']] as const).map(([k, l]) => (
          <li key={k} className="flex items-center gap-3"><Switch id={`sw-${k}`} checked={sw[k]} onCheckedChange={(v) => setSw((s) => ({ ...s, [k]: v }))} /><label htmlFor={`sw-${k}`}>{l}</label></li>
        ))}</ul>
      </Section>
      {m && <p role={m.ok ? 'status' : 'alert'} className={`rounded-md border p-3 text-sm ${m.ok ? 'border-verified/30 bg-verified-soft' : 'border-gap/30 bg-gap-soft'}`}>{m.text}</p>}
      <div><Button size="lg" loading={busy} onClick={save}>Save settings</Button></div>
    </div>
  );
}

export default function AdminConfig() {
  const q = useApi<Cfg>('/admin/config');
  return (
    <>
      <PageHeader title="Scoring and settings" description="Tune the readiness model and feature switches. Changes are audited." />
      <Query q={q} rows={4}>{(c) => <Form key={c.version} c={c} onSaved={() => q.mutate()} />}</Query>
    </>
  );
}
