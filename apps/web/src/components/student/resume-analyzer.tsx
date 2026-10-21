'use client';
import { useState } from 'react';
import { FileSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, Textarea } from '@/components/ui/input';
import { AiDisclaimer, AiErrorNotice, AiLabel, AiStatusBanner } from './ai-notice';
import { api } from '@/lib/api';
import { LEVELS } from '@/lib/utils';

interface Analysis {
  disclaimer: string;
  matchedSkills: { skillId: string; name: string; mentionedAs: string; evidence?: string }[];
  unmatchedSkills: { mentionedAs: string; evidence?: string }[];
  projects: { title: string; technologies: string[]; summary: string }[];
  experience: { role: string; organization: string; summary: string }[];
  keywords: string[];
}

export function ResumeAnalyzer({ onSubmitted }: { onSubmitted: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [res, setRes] = useState<Analysis | null>(null);
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const analyze = async () => {
    setBusy(true); setError(null); setRes(null); setDone(null);
    try {
      const r = await api.post<Analysis>('/ai/resume/analyze', { text });
      setRes(r);
      setPicked(new Set());
      setLevels(Object.fromEntries(r.matchedSkills.map((m) => [m.skillId, 2])));
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const submit = async () => {
    setSubmitting(true); setError(null);
    try {
      await api.post('/ai/resume/claims', { items: [...picked].map((id) => ({ skill: id, claimedLevel: levels[id] ?? 2 })) });
      setDone(`${picked.size} claim${picked.size === 1 ? '' : 's'} sent to faculty. They stay unverified until reviewed.`);
      setPicked(new Set());
      onSubmitted();
    } catch (e) { setError(e); } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-4">
      <AiStatusBanner />
      <Card>
        <CardHeader><CardTitle>Resume analyzer</CardTitle><CardDescription>Paste your resume text. AI lists the skills it finds; you choose what to claim. Nothing is verified automatically.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <label htmlFor="resume-text" className="sr-only">Resume text</label>
          <Textarea id="resume-text" className="min-h-[200px]" value={text} onChange={(e) => setText(e.target.value)} maxLength={15000} placeholder="Paste at least a few lines of resume text…" />
          <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{text.length}/15000 · avoid pasting phone numbers or addresses</span><Button loading={busy} disabled={text.trim().length < 40} onClick={analyze}><FileSearch />Analyze</Button></div>
          <AiErrorNotice error={error} />
        </CardContent>
      </Card>

      {res && (
        <Card>
          <CardHeader className="flex-row items-center justify-between"><CardTitle>Skills found</CardTitle><AiLabel /></CardHeader>
          <CardContent className="space-y-4">
            <AiDisclaimer text={res.disclaimer} />
            {res.matchedSkills.length === 0 ? <p className="text-sm text-muted-foreground">No skills matched the placement taxonomy.</p> : (
              <ul className="divide-y rounded-md border">
                {res.matchedSkills.map((m) => (
                  <li key={m.skillId} className="flex flex-wrap items-center gap-3 p-3">
                    <input id={`pk-${m.skillId}`} type="checkbox" className="size-4" checked={picked.has(m.skillId)} onChange={() => toggle(m.skillId)} />
                    <label htmlFor={`pk-${m.skillId}`} className="min-w-0 flex-1 text-sm"><span className="font-medium">{m.name}</span>{m.evidence && <span className="block truncate text-xs text-muted-foreground">{m.evidence}</span>}</label>
                    <Select aria-label={`Level you claim for ${m.name}`} className="w-40" value={levels[m.skillId] ?? 2} onChange={(e) => setLevels((l) => ({ ...l, [m.skillId]: Number(e.target.value) }))}>
                      {LEVELS.slice(1).map((l, i) => <option key={l} value={i + 1}>{i + 1} · {l}</option>)}
                    </Select>
                  </li>
                ))}
              </ul>
            )}
            {res.unmatchedSkills.length > 0 && <div><p className="mb-1 text-sm font-medium">Not in the taxonomy (cannot be claimed)</p><div className="flex flex-wrap gap-1.5">{res.unmatchedSkills.map((u) => <Badge key={u.mentionedAs}>{u.mentionedAs}</Badge>)}</div></div>}
            {res.projects.length > 0 && <div><p className="mb-1 text-sm font-medium">Projects mentioned</p><ul className="list-disc space-y-1 pl-5 text-sm">{res.projects.map((p, i) => <li key={i}><span className="font-medium">{p.title}</span>: {p.summary}</li>)}</ul></div>}
            {done && <p role="status" className="rounded-md border border-verified/30 bg-verified-soft p-3 text-sm">{done}</p>}
            <div className="flex justify-end"><Button loading={submitting} disabled={picked.size === 0} onClick={submit}>Submit {picked.size || ''} selected as unverified claims</Button></div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
