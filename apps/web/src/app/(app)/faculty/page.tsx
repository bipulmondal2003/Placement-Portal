'use client';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { EmptyState, Query } from '@/components/states';
import { ChartAlt, axisTick, tooltipStyle } from '@/components/officer/kit';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/lib/hooks';
import { fmtDateTime, titleCase } from '@/lib/utils';

interface Dash {
  mentees: number; pendingReviews: number; decisions: { approved: number; rejected: number };
  recentDecisions: { _id: string; evidence?: { title: string }; student?: { name: string }; decision: string; comment?: string; createdAt: string }[];
  assessmentPerformance: { assessment: string; attempts: number; averagePercent: number }[];
}

export default function FacultyDashboard() {
  const q = useApi<Dash>('/dashboards/faculty');
  return (
    <>
      <PageHeader title="Faculty overview" description="Your review queue and how your students are doing." />
      <Query q={q} rows={4}>
        {(d) => (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Mentees" value={d.mentees} />
              <StatCard label="Awaiting your review" value={d.pendingReviews} tone={d.pendingReviews > 0 ? 'pending' : 'default'} hint={<Link className="text-primary underline-offset-4 hover:underline" href="/faculty/reviews">Open the queue</Link>} />
              <StatCard label="Approved by you" value={d.decisions.approved} tone="verified" />
              <StatCard label="Rejected by you" value={d.decisions.rejected} />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Assessment performance</CardTitle><CardDescription>Average score per assessment.</CardDescription></CardHeader>
                <CardContent>
                  {d.assessmentPerformance.length === 0 ? <p className="text-sm text-muted-foreground">No attempts yet.</p> : (
                    <ChartAlt summary={d.assessmentPerformance.map((a) => `${a.assessment} ${a.averagePercent}% over ${a.attempts} attempts`).join('; ')}>
                      <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={d.assessmentPerformance} layout="vertical" margin={{ left: 8 }}><CartesianGrid horizontal={false} stroke="hsl(var(--border))" /><XAxis type="number" domain={[0, 100]} tick={axisTick} /><YAxis type="category" dataKey="assessment" width={130} tick={axisTick} /><Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`, 'Average']} /><Bar dataKey="averagePercent" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div>
                    </ChartAlt>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Recent decisions</CardTitle></CardHeader>
                <CardContent>
                  {d.recentDecisions.length === 0 ? <EmptyState title="No decisions yet" /> : (
                    <ul className="divide-y">{d.recentDecisions.map((r) => (
                      <li key={r._id} className="py-2.5 text-sm"><div className="flex items-center justify-between gap-2"><span className="font-medium">{r.evidence?.title ?? 'Evidence'}</span><Badge variant={r.decision === 'rejected' ? 'gap' : 'verified'}>{titleCase(r.decision)}</Badge></div><p className="text-xs text-muted-foreground">{r.student?.name} · {fmtDateTime(r.createdAt)}</p>{r.comment && <p className="mt-1 text-xs">{r.comment}</p>}</li>
                    ))}</ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </Query>
    </>
  );
}
