'use client';
import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Query } from '@/components/states';
import { useOptionalDebounce } from '@/components/admin/debounce';
import { Section } from '@/components/officer/kit';
import type { Taxonomy } from '@/components/officer/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, errMessage, qs } from '@/lib/api';
import { useApi } from '@/lib/hooks';

interface Skill { id: string; name: string; category: string; description?: string; dimension: string; roles: string[]; synonyms: string[]; cluster?: string | null }
interface Meta { categories: string[]; dimensions: string[]; roles: string[] }

function SkillForm({ skill, meta, onDone }: { skill?: Skill; meta: Meta; onDone: () => void }) {
  const [f, setF] = useState({ name: skill?.name ?? '', category: skill?.category ?? meta.categories[0], dimension: skill?.dimension ?? 'technical', description: skill?.description ?? '' });
  const [roles, setRoles] = useState<string[]>(skill?.roles ?? ['software-development']);
  const [syn, setSyn] = useState(''); const [list, setList] = useState<string[]>(skill?.synonyms ?? []);
  const [mergeTo, setMergeTo] = useState('');
  const all = useApi<Skill[]>('/skills');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<any>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setErr(null); try { await fn(); } catch (e) { setErr(errMessage(e)); return false; } finally { setBusy(false); } return true; };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return setErr('Name is required.');
    const ok = await run(() => (skill ? api.patch(`/skills/${skill.id}`, { ...f, name: f.name.trim(), roles }) : api.post('/skills', { ...f, name: f.name.trim(), description: f.description || undefined, roles })));
    if (ok) onDone();
  };
  const addSyn = async () => { const t = syn.trim(); if (!t || !skill) return; if (await run(() => api.post(`/skills/${skill.id}/synonyms`, { term: t }))) { setList((l) => [...l, t]); setSyn(''); } };
  const rmSyn = async (t: string) => { if (skill && (await run(() => api.delete(`/skills/${skill.id}/synonyms/${encodeURIComponent(t)}`)))) setList((l) => l.filter((x) => x !== t)); };
  const merge = async () => {
    if (!skill || !mergeTo || !window.confirm(`Merge “${skill.name}” into the selected skill? Student claims, evidence and requirements move to the target. This cannot be undone.`)) return;
    if (await run(() => api.post(`/skills/${skill.id}/merge`, { targetId: mergeTo }))) onDone();
  };
  const deactivate = async () => { if (skill && window.confirm('Deactivate this skill? It disappears from search but existing data is kept.') && (await run(() => api.patch(`/skills/${skill.id}`, { active: false })))) onDone(); };

  return (
    <div className="space-y-5">
      <form onSubmit={save} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="sk-n"><Input id="sk-n" value={f.name} onChange={set('name')} maxLength={80} /></Field>
          <Field label="Category" htmlFor="sk-c"><Select id="sk-c" value={f.category} onChange={set('category')}>{meta.categories.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Dimension" htmlFor="sk-d" hint="Which readiness dimension it counts towards"><Select id="sk-d" value={f.dimension} onChange={set('dimension')}>{meta.dimensions.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <fieldset><legend className="mb-1.5 text-sm font-medium">Role families</legend><div className="flex flex-wrap gap-3">{meta.roles.map((r) => <label key={r} className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="size-4" checked={roles.includes(r)} onChange={() => setRoles((a) => (a.includes(r) ? a.filter((x) => x !== r) : [...a, r]))} />{r}</label>)}</div></fieldset>
        </div>
        <Field label="Description" htmlFor="sk-ds"><Textarea id="sk-ds" value={f.description} onChange={set('description')} maxLength={600} /></Field>
        <Button type="submit" loading={busy}>{skill ? 'Save changes' : 'Create skill'}</Button>
      </form>
      {skill && <>
        <div><p className="mb-1 text-sm font-medium">Synonyms</p><p className="mb-2 text-xs text-muted-foreground">Search and resume matching resolve these to “{skill.name}”.</p>
          <div className="mb-2 flex flex-wrap gap-1.5">{list.map((t) => <Badge key={t}>{t}<button type="button" aria-label={`Remove synonym ${t}`} className="ml-1" onClick={() => rmSyn(t)}><X className="size-3" /></button></Badge>)}</div>
          <div className="flex gap-2"><label htmlFor="sk-syn" className="sr-only">New synonym</label><Input id="sk-syn" value={syn} onChange={(e) => setSyn(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSyn(); } }} placeholder="e.g. js" /><Button type="button" variant="outline" onClick={addSyn}><Plus />Add</Button></div></div>
        <div className="space-y-2 border-t pt-4"><p className="text-sm font-medium">Merge duplicates</p>
          <div className="flex gap-2"><label htmlFor="sk-mg" className="sr-only">Merge into</label><Select id="sk-mg" value={mergeTo} onChange={(e) => setMergeTo(e.target.value)}><option value="">Merge into…</option>{all.data?.filter((s) => s.id !== skill.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select><Button type="button" variant="outline" disabled={!mergeTo} onClick={merge}>Merge</Button></div>
          <Button type="button" variant="ghost" className="text-gap" onClick={deactivate}>Deactivate skill</Button></div>
      </>}
      {err && <p role="alert" className="rounded-md border border-gap/30 bg-gap-soft p-3 text-sm">{err}</p>}
    </div>
  );
}

function Clusters({ onChanged }: { onChanged: () => void }) {
  const tax = useApi<Taxonomy>('/skills/taxonomy');
  const [name, setName] = useState(''); const [description, setDescription] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const add = async (e: React.FormEvent) => { e.preventDefault(); setErr(null); try { await api.post('/skills/clusters', { name: name.trim(), description: description || undefined, roles: ['software-development', 'data', 'testing'] }); setName(''); setDescription(''); await tax.mutate(); onChanged(); } catch (e2) { setErr(errMessage(e2)); } };
  return (
    <Section title="Clusters" description="A cluster is a group of alternatives (for example React, Vue or Angular). A drive requirement on a cluster is met by any one member.">
      <Query q={tax} rows={2}>{(d) => <ul className="mb-4 divide-y text-sm">{d.clusters.map((c) => <li key={c.id} className="py-2"><p className="font-medium">{c.name}</p><p className="text-xs text-muted-foreground">{c.description}</p></li>)}</ul>}</Query>
      <form onSubmit={add} className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end" noValidate>
        <Field label="New cluster" htmlFor="cl-n"><Input id="cl-n" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Description" htmlFor="cl-d"><Input id="cl-d" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Button type="submit" disabled={!name.trim()}>Add</Button>
      </form>
      {err && <p role="alert" className="mt-2 text-sm text-gap">{err}</p>}
    </Section>
  );
}

export default function AdminSkills() {
  const meta = useApi<Meta>('/skills/meta');
  const [search, setSearch] = useState(''); const [category, setCategory] = useState('');
  const dq = useOptionalDebounce(search);
  const list = useApi<Skill[]>(`/skills${qs({ q: dq, category })}`);
  const [edit, setEdit] = useState<Skill | 'new' | null>(null);
  const done = () => { setEdit(null); list.mutate(); };
  return (
    <>
      <PageHeader title="Skill taxonomy" description="The shared vocabulary for requirements, evidence and assessments. Merging and renaming keep existing data attached." actions={<Button onClick={() => setEdit('new')} disabled={!meta.data}><Plus />New skill</Button>} />
      <Tabs defaultValue="skills"><TabsList><TabsTrigger value="skills">Skills</TabsTrigger><TabsTrigger value="clusters">Clusters</TabsTrigger></TabsList>
        <TabsContent value="skills">
          <div className="mb-3 flex flex-wrap gap-3">
            <div><label htmlFor="ts-q" className="mb-1 block text-xs text-muted-foreground">Search</label><Input id="ts-q" className="w-64" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or synonym" /></div>
            <div><label htmlFor="ts-c" className="mb-1 block text-xs text-muted-foreground">Category</label><Select id="ts-c" className="w-56" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All</option>{meta.data?.categories.map((c) => <option key={c}>{c}</option>)}</Select></div>
          </div>
          <Query q={list} rows={5}>{(rows) => (
            <ul className="divide-y glass rounded-xl">{rows.map((s) => (
              <li key={s.id}><button type="button" onClick={() => setEdit(s)} className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left text-sm hover:bg-muted/50"><span><span className="font-medium">{s.name}</span>{s.synonyms.length > 0 && <span className="ml-2 text-xs text-muted-foreground">{s.synonyms.join(', ')}</span>}</span><span className="flex gap-1.5"><Badge>{s.category}</Badge><Badge variant="outline">{s.dimension}</Badge></span></button></li>
            ))}{rows.length === 0 && <li className="p-4 text-sm text-muted-foreground">No skills match.</li>}</ul>
          )}</Query>
        </TabsContent>
        <TabsContent value="clusters"><Clusters onChanged={() => list.mutate()} /></TabsContent>
      </Tabs>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}><DialogContent title={edit === 'new' ? 'New skill' : 'Edit skill'}>{edit && meta.data && <SkillForm key={edit === 'new' ? 'new' : edit.id} skill={edit === 'new' ? undefined : edit} meta={meta.data} onDone={done} />}</DialogContent></Dialog>
    </>
  );
}
