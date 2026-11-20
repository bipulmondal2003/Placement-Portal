'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Target } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState, Query } from '@/components/states';
import type { RoleMatchRow } from '@/components/student/types';
import { bandVariant } from '@/components/student/role-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { api, errMessage } from '@/lib/api';
import { useApi } from '@/lib/hooks';

export default function RolesPage() {
  const q = useApi<RoleMatchRow[]>('/roles/matches');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const setTarget = async (roleId: string | null) => {
    setErr(null);
    setBusy(roleId ?? 'clear');
    try { await api.put('/roles/target', { roleId }); await q.mutate(); } catch (e) { setErr(errMessage(e)); } finally { setBusy(null); }
  };

  return (
    <>
      <PageHeader title="Target roles" description="See how your verified skills match each job role. Scores use verified evidence only, the same rules as drive readiness. Pick a target role to track it on your dashboard." />
      {err && <p role="alert" className="mb-3 rounded-md border border-gap/30 bg-gap-soft p-3 text-sm">{err}</p>}
      <Query q={q} rows={4}>
        {(rows) => rows.length === 0 ? <EmptyState title="No roles available" description="Ask an administrator to load the role catalogue." /> : (
          <ul className="grid gap-4 md:grid-cols-2">
            {rows.map((r) => (
              <li key={r.roleId}>
                <Card className={r.isTarget ? 'border-primary' : undefined}>
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="font-semibold">{r.title}</h2>
                        <p className="text-xs text-muted-foreground">{r.family}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant={bandVariant(r.band)}>{r.bandLabel}</Badge>
                        {r.isTarget && <Badge variant="primary"><Target className="size-3" />Your target</Badge>}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 flex justify-between text-sm"><span className="text-muted-foreground">Match</span><span className="tabular font-semibold">{Math.round(r.score)} / 100</span></div>
                      <Progress value={r.score} aria-label={`Match for ${r.title}`} />
                    </div>
                    <p className="text-xs text-muted-foreground">{r.matchedCount} matched · {r.improveCount} to improve · {r.missingCount} missing{r.topGap ? ` · biggest gap: ${r.topGap}` : ''}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline"><Link href={`/student/roles/${r.roleId}`}>Skill gap<ArrowRight /></Link></Button>
                      {r.isTarget
                        ? <Button size="sm" variant="ghost" loading={busy === 'clear'} onClick={() => setTarget(null)}>Clear target</Button>
                        : <Button size="sm" loading={busy === r.roleId} onClick={() => setTarget(r.roleId)}>Set as target</Button>}
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Query>
    </>
  );
}
