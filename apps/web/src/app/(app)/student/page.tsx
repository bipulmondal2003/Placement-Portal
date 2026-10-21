'use client';
import Link from 'next/link';
import { ArrowRight, CalendarClock, FileCheck2, ShieldCheck, TriangleAlert } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { Query } from '@/components/states';
import { ScoreRing } from '@/components/score-ring';
import { EligibilityBadge, EvidenceStateBadge, RegistrationBadge } from '@/components/status-badges';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { EmptyState } from '@/components/states';
import { useApi } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { daysUntil, fmtDate } from '@/lib/utils';

interface Dash {
  completion: { percent: number; items: { key: string; label: string; done: boolean }[] };
  verifiedSkills: number;
  selfReportedOnly: number;
  pendingEvidence: number;
  readinessByDrive: { drive: { id: string; company: string; role: string; deadline: string; status: string }; eligibility: { eligible: boolean; reasons: string[] }; readiness: { score: number; topGap: string | null; gapCount: number } | null; registration: { status: string } | null }[];
  topGaps: { label: string; gap: number; impact: number; drive: string; evidenceState: string }[];
  upcomingDeadlines: { _id: string; company: string; role: string; deadline: string }[];
  plans: { drive: string; startDate: string; endDate: string; progress: { total: number; done: number; percent: number } }[];
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const q = useApi<Dash>('/dashboards/student');
  return (
    <>
      <PageHeader title={`Welcome back${user ? `, ${user.name.split(' ')[0]}` : ''}`} description="Your readiness for each drive, based on verified evidence only." />
      <Query q={q} rows={4}>
        {(d) => (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Verified skills" value={d.verifiedSkills} tone="verified" icon={<ShieldCheck />} hint="Count towards your readiness score" />
              <StatCard label="Self-reported only" value={d.selfReportedOnly} tone="pending" hint="Claimed but not yet verified" />
              <StatCard label="Evidence awaiting review" value={d.pendingEvidence} icon={<FileCheck2 />} hint="With your faculty mentor" />
              <StatCard label="Profile complete" value={`${d.completion.percent}%`} hint={d.completion.percent < 100 ? 'Eligibility needs a complete profile' : 'All set'} />
            </div>

            {d.completion.percent < 100 && (
              <Card className="border-pending/40 bg-pending-soft/50">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <p className="text-sm"><TriangleAlert className="mr-1.5 inline size-4 text-pending" aria-hidden />Still missing: {d.completion.items.filter((i) => !i.done).map((i) => i.label).join(', ')}.</p>
                  <Link className="text-sm font-medium text-primary underline-offset-4 hover:underline" href="/student/profile">Complete your profile</Link>
                </CardContent>
              </Card>
            )}

            <section aria-labelledby="drives-h">
              <h2 id="drives-h" className="mb-3 text-lg font-semibold">Your drives</h2>
              {d.readinessByDrive.length === 0 ? <EmptyState title="No open drives yet" description="Drives appear here when the placement cell publishes them." /> : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {d.readinessByDrive.map((r) => (
                    <Card key={r.drive.id}>
                      <CardContent className="flex gap-4 p-5">
                        <ScoreRing score={r.readiness?.score} capped={false} />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div>
                            <p className="truncate font-semibold">{r.drive.company}</p>
                            <p className="truncate text-sm text-muted-foreground">{r.drive.role}</p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <EligibilityBadge eligible={r.eligibility.eligible} />
                            {r.registration && <RegistrationBadge status={r.registration.status} />}
                          </div>
                          <p className="text-xs text-muted-foreground">{r.readiness?.topGap ? `Biggest gap: ${r.readiness.topGap}` : 'No gaps found'} · closes {fmtDate(r.drive.deadline, { day: 'numeric', month: 'short' })}</p>
                          <Link href={`/student/drives/${r.drive.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">See the breakdown <ArrowRight className="size-3.5" /></Link>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <Card>
                <CardHeader><CardTitle>Gaps worth closing first</CardTitle><CardDescription>Ranked by how much each one would lift your score.</CardDescription></CardHeader>
                <CardContent>
                  {d.topGaps.length === 0 ? <p className="text-sm text-muted-foreground">No open gaps.</p> : (
                    <ul className="divide-y">
                      {d.topGaps.map((g, i) => (
                        <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                          <div className="min-w-0"><p className="font-medium">{g.label}</p><p className="text-xs text-muted-foreground">{g.drive} · {g.gap} level{g.gap === 1 ? '' : 's'} short</p></div>
                          <EvidenceStateBadge state={g.evidenceState} />
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card>
                  <CardHeader><CardTitle>Deadlines</CardTitle></CardHeader>
                  <CardContent>
                    {d.upcomingDeadlines.length === 0 ? <p className="text-sm text-muted-foreground">Nothing due soon.</p> : (
                      <ul className="space-y-2">
                        {d.upcomingDeadlines.map((u) => {
                          const n = daysUntil(u.deadline);
                          return <li key={u._id} className="flex items-center justify-between gap-2 text-sm"><span className="flex items-center gap-2"><CalendarClock className="size-4 text-muted-foreground" aria-hidden />{u.company}</span><span className="text-muted-foreground">{n !== null && n >= 0 ? `${n} day${n === 1 ? '' : 's'} left` : 'closed'}</span></li>;
                        })}
                      </ul>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Preparation plans</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {d.plans.length === 0 ? <p className="text-sm text-muted-foreground">No plan yet. <Link className="text-primary underline-offset-4 hover:underline" href="/student/plan">Build one</Link> from a drive’s gaps.</p> : d.plans.map((p, i) => (
                      <div key={i}><div className="mb-1 flex justify-between text-sm"><span>{p.drive}</span><span className="tabular text-muted-foreground">{p.progress.done}/{p.progress.total} tasks</span></div><Progress value={p.progress.percent} aria-label={`${p.drive} plan progress`} /></div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
      </Query>
    </>
  );
}
