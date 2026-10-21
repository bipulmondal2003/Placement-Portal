'use client';
import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input, Select, Textarea } from '@/components/ui/input';
import { SkillPicker } from './skill-picker';
import { api, errMessage } from '@/lib/api';
import { LEVELS } from '@/lib/utils';

const TYPES = [
  ['project', 'Project'],
  ['certification', 'Certification'],
  ['academic', 'Academic work'],
  ['external', 'External (competition, internship, open source)'],
];

/** Submits unverified evidence. Nothing here changes the verified level until faculty approve it. */
export function EvidenceForm({ onDone, initialSkill }: { onDone: () => void; initialSkill?: { id: string; name: string } }) {
  const [type, setType] = useState('project');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [skills, setSkills] = useState<{ id: string; name: string; level: number }[]>(initialSkill ? [{ ...initialSkill, level: 3 }] : []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (title.trim().length < 3) return setError('Give the evidence a title of at least 3 characters.');
    if (skills.length === 0) return setError('Link at least one skill.');
    setBusy(true);
    try {
      await api.post('/evidence', {
        type,
        title: title.trim(),
        description: description.trim() || undefined,
        url: url.trim() || undefined,
        skills: skills.map((s) => ({ skill: s.id, claimedLevel: s.level })),
      });
      onDone();
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Type" htmlFor="ev-type"><Select id="ev-type" value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
      <Field label="Title" htmlFor="ev-title"><Input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Placement tracker, MERN stack" /></Field>
      <Field label="What did you do?" htmlFor="ev-desc" hint="Reviewers read this. Be specific about your own contribution."><Textarea id="ev-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} /></Field>
      <Field label="Link (optional)" htmlFor="ev-url" hint="Repository, certificate or demo URL starting with https://. Files cannot be uploaded in this version."><Input id="ev-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/…" /></Field>

      <div className="space-y-2">
        <p className="text-sm font-medium">Skills this shows</p>
        {skills.length > 0 && (
          <ul className="space-y-2">
            {skills.map((s) => (
              <li key={s.id} className="flex items-center gap-2 rounded-md border p-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
                <label className="sr-only" htmlFor={`cl-${s.id}`}>Level you claim for {s.name}</label>
                <Select id={`cl-${s.id}`} className="w-40" value={s.level} onChange={(e) => setSkills((p) => p.map((x) => (x.id === s.id ? { ...x, level: Number(e.target.value) } : x)))}>
                  {LEVELS.slice(1).map((l, i) => <option key={l} value={i + 1}>{i + 1} · {l}</option>)}
                </Select>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${s.name}`} onClick={() => setSkills((p) => p.filter((x) => x.id !== s.id))}><X /></Button>
              </li>
            ))}
          </ul>
        )}
        <SkillPicker id="ev-skill" label="Add a skill" exclude={skills.map((s) => s.id)} onPick={(s) => setSkills((p) => (p.length >= 15 ? p : [...p, { id: s.id, name: s.name, level: 3 }]))} />
      </div>

      {error && <p role="alert" className="rounded-md border border-gap/30 bg-gap-soft p-3 text-sm">{error}</p>}
      <div className="flex justify-end"><Button type="submit" loading={busy}><Plus />Submit for review</Button></div>
    </form>
  );
}
