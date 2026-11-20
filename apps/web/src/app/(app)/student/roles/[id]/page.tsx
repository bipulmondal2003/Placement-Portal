'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import { Mic, Target } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Query } from '@/components/states';
import { ScoreRing } from '@/components/score-ring';
import { EvidenceBar, EvidenceLegend } from '@/components/evidence-bar';
import type { RoleItem, RoleMatch } from '@/components/student/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, errMessage } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { levelLabel, titleCase } from '@/lib/utils';
import { bandVariant } from '@/components/student/role-utils';

function Group({ title, hint, items, empty }: { title: string; hint: string; items: RoleItem[]; empty: string }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title} ({items.length})</CardTitle><CardDescription>{hint}</CardDescription></CardHeader>
      <CardContent>
        {items.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : (
          <ul className="space-y-3">
            {items.map((i) => (
              <li key={i.label}>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{i.label}{i.mandatory && <Badge variant="gap" className="ml-2">Mandatory</Badge>}</span>
                  <span className="text-xs text-muted-foreground">verified {levelLabel(i.verifiedLevel)} · needs {levelLabel(i.requiredLevel)}</span>
                </div>
                <EvidenceBar verified={i.verifiedLevel} claimed={i.selfReportedLevel} required={i.requiredLevel} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function RoleMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useApi<RoleMatch>(`/roles/${id}/match`);
  const [err, setErr] = useState<string | null>(null);
  const setTarget = async (roleId: string | null) => {
    setErr(null);
    try { await api.put('/roles/target', { roleId }); await q.mutate(); } catch (e) { setErr(errMessage(e)); }
  };
  return (
    <Query q={q} rows={4}>
      {(m) => (
        <>
          <PageHeader title={m.role.title} description={m.role.summary} actions={<>
            <Button asChild variant="outline"><Link href={`/student/interview?role=${m.role.id}`}><Mic />Practise interview</Link></Button>
            {m.isTarget ? <Button variant="ghost" onClick={() => setTarget(null)}>Clear target</Button> : <Button onClick={() => setTarget(m.role.id)}><Target />Set as target</Button>}
          </>} />
          {err && <p role="alert" className="mb-3 rounded-md border border-gap/30 bg-gap-soft p-3 text-sm">{err}</p>}
          <Card className="mb-4"><CardContent className="flex flex-wrap items-center gap-6 p-5">
            <ScoreRing score={m.score} label="Match" capped={m.cappedByMandatory} />
            <div className="min-w-0 flex-1 space-y-2">
              <Badge variant={bandVariant(m.band)}>{m.bandLabel}</Badge>
              {m.cappedByMandatory && <p className="text-sm">Your score is capped because a mandatory skill is below the required level.</p>}
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{m.explanation.map((e) => <li key={e}>{e}</li>)}</ul>
              <div className="flex flex-wrap gap-1.5 text-xs">{Object.entries(m.dimensions).map(([k, v]) => <Badge key={k} variant="outline">{titleCase(k)}: {v === null ? 'n/a' : Math.round(v)}</Badge>)}</div>
            </div>
          </CardContent></Card>
          <div className="mb-3"><EvidenceLegend /></div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Group title="Matched" hint="Verified at or above the level this role expects." items={m.matched} empty="Nothing matched yet. Verified evidence will appear here." />
            <Group title="Needs improvement" hint="You have some verified level, but below what the role expects." items={m.improve} empty="No partial skills." />
            <Group title="Missing" hint="No verified level yet." items={m.missing} empty="No missing skills." />
          </div>
          <Card className="mt-4">
            <CardHeader><CardTitle>Preparation guidance</CardTitle><CardDescription>Highest-impact gaps first. Only faculty-verified evidence or objective assessments raise your score.</CardDescription></CardHeader>
            <CardContent>
              {m.guidance.length === 0 ? <p className="text-sm text-muted-foreground">No gaps. You meet every expectation for this role.</p> : (
                <ol className="space-y-3">
                  {m.guidance.map((g) => (
                    <li key={g.label} className="rounded-md border p-3 text-sm">
                      <p className="font-medium">{g.label} <span className="text-xs font-normal text-muted-foreground">verified {levelLabel(g.verifiedLevel)} → needs {levelLabel(g.requiredLevel)}</span></p>
                      <p className="mt-1 text-muted-foreground">{g.action}</p>
                    </li>
                  ))}
                </ol>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline"><Link href="/student/evidence">Add evidence or certificate</Link></Button>
                <Button asChild size="sm" variant="outline"><Link href="/student/assessments">Take an assessment</Link></Button>
                <Button asChild size="sm" variant="outline"><Link href="/student/skills">My skills</Link></Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </Query>
  );
}
