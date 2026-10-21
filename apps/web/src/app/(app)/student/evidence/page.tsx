'use client';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState, Query } from '@/components/states';
import { Paginator } from '@/components/paginator';
import { EvidenceStatusBadge } from '@/components/status-badges';
import { EvidenceForm } from '@/components/student/evidence-form';
import { ResumeAnalyzer } from '@/components/student/resume-analyzer';
import type { Evidence, Page } from '@/components/student/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Select } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, errMessage, qs } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { fmtDate, levelLabel, titleCase } from '@/lib/utils';

export default function StudentEvidence() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useApi<Page<Evidence>>(`/evidence/mine${qs({ page, limit: 10, status })}`);
  const detail = useApi<Evidence>(openId ? `/evidence/${openId}` : null);

  const withdraw = async (id: string) => {
    if (!window.confirm('Withdraw this evidence? Reviewed evidence cannot be withdrawn.')) return;
    setErr(null);
    try { await api.delete(`/evidence/${id}`); await q.mutate(); } catch (e) { setErr(errMessage(e)); }
  };

  return (
    <>
      <PageHeader title="Evidence" description="Evidence is how a claim becomes a verified skill. Faculty review every item; you will see their decision and comment here." actions={<Button onClick={() => setOpen(true)}><Plus />Add evidence</Button>} />
      <Tabs defaultValue="list">
        <TabsList><TabsTrigger value="list">My evidence</TabsTrigger><TabsTrigger value="resume">From my resume (AI)</TabsTrigger></TabsList>
        <TabsContent value="list">
          <div className="mb-3 flex items-center gap-2">
            <label htmlFor="ev-status" className="text-sm text-muted-foreground">Status</label>
            <Select id="ev-status" className="w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">All</option><option value="pending">Pending review</option><option value="verified">Verified</option><option value="rejected">Rejected</option>
            </Select>
          </div>
          {err && <p role="alert" className="mb-3 rounded-md border border-gap/30 bg-gap-soft p-3 text-sm">{err}</p>}
          <Query q={q} rows={4}>
            {(d) => d.items.length === 0 ? <EmptyState title="No evidence here" description="Add a project, certification or other proof and link it to the skills it shows." action={<Button onClick={() => setOpen(true)}>Add evidence</Button>} /> : (
              <>
                <Card><ul className="divide-y">
                  {d.items.map((e) => (
                    <li key={e._id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpenId(e._id)}>
                        <p className="font-medium hover:underline">{e.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{titleCase(e.type)} · {fmtDate(e.createdAt)}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">{e.skills.map((s) => <Badge key={s.skill._id}>{s.skill.name} · claimed {s.claimedLevel}</Badge>)}</div>
                      </button>
                      <div className="flex items-center gap-2">
                        <EvidenceStatusBadge status={e.status} />
                        {e.status === 'pending' && <Button variant="ghost" size="icon" aria-label={`Withdraw ${e.title}`} onClick={() => withdraw(e._id)}><Trash2 /></Button>}
                      </div>
                    </li>
                  ))}
                </ul></Card>
                <Paginator page={d.page} pages={d.pages} total={d.total} onPage={setPage} />
              </>
            )}
          </Query>
        </TabsContent>
        <TabsContent value="resume"><ResumeAnalyzer onSubmitted={() => q.mutate()} /></TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Add evidence" description="It starts as unverified and counts only after faculty approve it.">
          <EvidenceForm onDone={() => { setOpen(false); q.mutate(); }} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent title="Evidence details" description="What you submitted and what the reviewer decided.">
          <Query q={detail} rows={3}>
            {(e) => (
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-2"><p className="font-semibold">{e.title}</p><EvidenceStatusBadge status={e.status} /></div>
                {e.description && <p className="whitespace-pre-line text-muted-foreground">{e.description}</p>}
                {e.url && <p><a className="text-primary underline-offset-4 hover:underline" href={e.url} target="_blank" rel="noopener noreferrer">{e.url}</a></p>}
                <div>
                  <p className="mb-1 font-medium">Review history</p>
                  {(e.history ?? []).length === 0 ? <p className="text-muted-foreground">Not reviewed yet.</p> : (
                    <ul className="space-y-2">{e.history!.map((h) => (
                      <li key={h._id} className="rounded-md border p-2.5">
                        <p className="text-xs text-muted-foreground">{titleCase(h.decision)}{h.reviewer ? ` by ${h.reviewer.name}` : ''} · {fmtDate(h.createdAt)}</p>
                        {h.comment && <p className="mt-1">{h.comment}</p>}
                        {h.awarded?.map((a) => <p key={a.skill} className="mt-1 text-xs">Awarded {levelLabel(a.awardedLevel)} (you claimed {levelLabel(a.claimedLevel)})</p>)}
                      </li>
                    ))}</ul>
                  )}
                </div>
              </div>
            )}
          </Query>
        </DialogContent>
      </Dialog>
    </>
  );
}
