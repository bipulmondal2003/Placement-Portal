'use client';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { EmptyState, Query } from '@/components/states';
import { Paginator } from '@/components/paginator';
import { EvidenceBar, EvidenceLegend } from '@/components/evidence-bar';
import { ScoreRing } from '@/components/score-ring';
import { EligibilityBadge } from '@/components/status-badges';
import type { Page } from '@/components/student/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useApi } from '@/lib/hooks';
import { qs } from '@/lib/api';

interface S { _id: string; user: { _id: string; name: string; email: string }; rollNumber?: string; department?: string; graduationYear?: number; cgpa?: number; activeBacklogs?: number }
interface Skills { skills: { skillId: string; name: string; declaredLevel: number; selfReportedLevel: number; verifiedLevel: number; pendingEvidenceCount: number }[] }
interface Ready { drive: { id: string; company: string; role: string }; eligibility: { eligible: boolean }; readiness: { score: number; topGap?: string } | null }

function Detail({ id }: { id: string }) {
  const skills = useApi<Skills>(`/students/${id}/skills`);
  const ready = useApi<Ready[]>(`/students/${id}/readiness`);
  return (
    <div className="space-y-5">
      <section><h3 className="mb-2 text-sm font-semibold">Readiness by drive</h3>
        <Query q={ready} rows={2}>{(rows) => rows.length === 0 ? <p className="text-sm text-muted-foreground">No drives.</p> : (
          <ul className="grid gap-3 sm:grid-cols-2">{rows.map((r) => <li key={r.drive.id} className="flex items-center gap-3 rounded-md border p-3"><ScoreRing score={r.readiness?.score} size={64} label="" /><div className="min-w-0 text-sm"><p className="truncate font-medium">{r.drive.company}</p><div className="my-1"><EligibilityBadge eligible={r.eligibility.eligible} /></div><p className="text-xs text-muted-foreground">{r.readiness?.topGap ? `Top gap: ${r.readiness.topGap}` : 'No gaps'}</p></div></li>)}</ul>
        )}</Query></section>
      <section><h3 className="mb-2 text-sm font-semibold">Skills</h3><div className="mb-2"><EvidenceLegend /></div>
        <Query q={skills} rows={3}>{(d) => d.skills.length === 0 ? <p className="text-sm text-muted-foreground">No skills added.</p> : (
          <ul className="divide-y rounded-md border">{d.skills.map((s) => <li key={s.skillId} className="grid items-center gap-2 p-2.5 text-sm sm:grid-cols-[1fr_1.4fr]"><span>{s.name}{s.pendingEvidenceCount > 0 && <span className="ml-2 text-xs text-pending">{s.pendingEvidenceCount} pending</span>}</span><EvidenceBar verified={s.verifiedLevel} claimed={Math.max(s.declaredLevel, s.selfReportedLevel)} /></li>)}</ul>
        )}</Query></section>
    </div>
  );
}

export default function FacultyMentees() {
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<S | null>(null);
  const q = useApi<Page<S>>(`/students${qs({ page, limit: 15 })}`);
  return (
    <>
      <PageHeader title="My mentees" description="Students assigned to you. Readiness here is computed from verified evidence, the same as the student sees." />
      <Query q={q} rows={4}>
        {(d) => d.items.length === 0 ? <EmptyState title="No mentees assigned" description="The placement cell assigns mentors." /> : (
          <>
            <Card><ul className="divide-y">{d.items.map((s) => (
              <li key={s._id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium">{s.user.name}</p><p className="text-xs text-muted-foreground">{s.rollNumber} · {s.department} · {s.graduationYear} · CGPA {s.cgpa ?? '—'} · {s.activeBacklogs ?? 0} backlogs</p></div><Button variant="outline" size="sm" onClick={() => setSel(s)}>View progress</Button></li>
            ))}</ul></Card>
            <Paginator page={d.page} pages={d.pages} total={d.total} onPage={setPage} />
          </>
        )}
      </Query>
      <Dialog open={!!sel} onOpenChange={(o) => !o && setSel(null)}><DialogContent title={sel?.user.name ?? ''} description={sel?.user.email}>{sel && <Detail id={sel.user._id} />}</DialogContent></Dialog>
    </>
  );
}
