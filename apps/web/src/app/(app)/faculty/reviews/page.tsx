'use client';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { EmptyState, Query } from '@/components/states';
import { Paginator } from '@/components/paginator';
import { EvidenceBar } from '@/components/evidence-bar';
import type { Evidence, Page } from '@/components/student/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Select, Textarea } from '@/components/ui/input';
import { api, errMessage, qs } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { fmtDate, LEVELS, levelLabel, titleCase } from '@/lib/utils';

interface QItem extends Omit<Evidence, 'history'> { student: any; url?: string }

function ReviewDialog({ item, onClose, onDone }: { item: QItem; onClose: () => void; onDone: () => void }) {
  const [award, setAward] = useState<Record<string, number>>(Object.fromEntries(item.skills.map((s) => [s.skill._id, s.claimedLevel])));
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const decide = async (decision: 'approved' | 'rejected') => {
    if (decision === 'rejected' && !comment.trim()) return setErr('Explain the rejection so the student knows what to fix.');
    setBusy(decision); setErr(null);
    try {
      await api.post(`/evidence/${item._id}/review`, { decision, comment: comment.trim() || undefined, awarded: decision === 'approved' ? item.skills.map((s) => ({ skill: s.skill._id, level: award[s.skill._id] ?? 0 })) : undefined });
      onDone();
    } catch (e) { setErr(errMessage(e)); } finally { setBusy(null); }
  };
  return (
    <div className="space-y-4 text-sm">
      <div><p className="font-semibold">{item.title}</p><p className="text-xs text-muted-foreground">{titleCase(item.type)} · {item.student?.name} · {item.student?.department} · submitted {fmtDate(item.createdAt)}</p></div>
      {item.description && <p className="whitespace-pre-line text-muted-foreground">{item.description}</p>}
      {item.url ? <p><a className="text-primary underline-offset-4 hover:underline" href={item.url} target="_blank" rel="noopener noreferrer">Open the submitted link</a></p> : <p className="text-xs text-muted-foreground">No link was provided.</p>}
      <div>
        <p className="mb-2 font-medium">Level to award for each skill</p>
        <ul className="space-y-2">{item.skills.map((s) => (
          <li key={s.skill._id} className="grid items-center gap-2 rounded-md border p-2.5 sm:grid-cols-[1fr_150px]">
            <div><p className="font-medium">{s.skill.name}</p><p className="text-xs text-muted-foreground">Student claims {levelLabel(s.claimedLevel)}</p><EvidenceBar className="mt-1.5" verified={award[s.skill._id] ?? 0} claimed={s.claimedLevel} /></div>
            <div><label className="sr-only" htmlFor={`aw-${s.skill._id}`}>Level awarded for {s.skill.name}</label><Select id={`aw-${s.skill._id}`} value={award[s.skill._id] ?? 0} onChange={(e) => setAward((a) => ({ ...a, [s.skill._id]: Number(e.target.value) }))}>{LEVELS.map((l, i) => <option key={l} value={i}>{i} · {l}</option>)}</Select></div>
          </li>
        ))}</ul>
        <p className="mt-1 text-xs text-muted-foreground">Award what the evidence demonstrates, not necessarily what was claimed. Awarding 0 verifies nothing for that skill.</p>
      </div>
      <Field label="Comment (required for rejection)" htmlFor="rv-c"><Textarea id="rv-c" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} /></Field>
      {err && <p role="alert" className="rounded-md border border-gap/30 bg-gap-soft p-3">{err}</p>}
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="destructive" loading={busy === 'rejected'} disabled={!!busy} onClick={() => decide('rejected')}>Reject</Button><Button variant="verified" loading={busy === 'approved'} disabled={!!busy} onClick={() => decide('approved')}>Approve</Button></div>
    </div>
  );
}

export default function FacultyReviews() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('pending');
  const [sel, setSel] = useState<QItem | null>(null);
  const q = useApi<Page<QItem>>(`/evidence/queue${qs({ page, limit: 10, status })}`);
  return (
    <>
      <PageHeader title="Evidence reviews" description="Approve what the evidence supports, reject what it does not, and say why. You cannot review your own submissions." />
      <div className="mb-3 flex items-center gap-2"><label htmlFor="rq-s" className="text-sm text-muted-foreground">Show</label><Select id="rq-s" className="w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="pending">Pending</option><option value="verified">Verified</option><option value="rejected">Rejected</option></Select></div>
      <Query q={q} rows={4}>
        {(d) => d.items.length === 0 ? <EmptyState title={status === 'pending' ? 'Queue is clear' : 'Nothing here'} description={status === 'pending' ? 'No evidence from your mentees is waiting.' : undefined} /> : (
          <>
            <Card><ul className="divide-y">{d.items.map((e) => (
              <li key={e._id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0"><p className="font-medium">{e.title}</p><p className="text-xs text-muted-foreground">{e.student?.name} · {titleCase(e.type)} · {fmtDate(e.createdAt)}{e.source === 'resume_ai' ? ' · AI-extracted claim' : ''}</p><div className="mt-1.5 flex flex-wrap gap-1.5">{e.skills.map((s) => <Badge key={s.skill._id}>{s.skill.name} · claims {s.claimedLevel}</Badge>)}</div></div>
                {status === 'pending' ? <Button size="sm" onClick={() => setSel(e)}>Review</Button> : <Badge variant={status === 'verified' ? 'verified' : 'gap'}>{titleCase(status)}</Badge>}
              </li>
            ))}</ul></Card>
            <Paginator page={d.page} pages={d.pages} total={d.total} onPage={setPage} />
          </>
        )}
      </Query>
      <Dialog open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <DialogContent title="Review evidence" description="Your decision is recorded with your name and is visible to the student.">
          {sel && <ReviewDialog item={sel} onClose={() => setSel(null)} onDone={() => { setSel(null); q.mutate(); }} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
