'use client';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { Query } from '@/components/states';
import { Section, Callout } from '@/components/officer/kit';
import type { Queues } from '@/components/officer/types';
import { useApi } from '@/lib/hooks';
import { titleCase } from '@/lib/utils';

interface Dash { usersByRole: Record<string, number>; activeUsers: number; auditEventsLast24h: number; skills: number; clusters: number; roles: string[]; queues: Queues }

export default function AdminOverview() {
  const q = useApi<Dash>('/dashboards/admin');
  const ai = useApi<{ enabled: boolean; configured: boolean; model: string }>('/ai/status');
  return (
    <>
      <PageHeader title="Administration" description="Accounts, taxonomy, scoring settings and system health." />
      <Query q={q} rows={3}>{(d) => (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Active accounts" value={d.activeUsers} />
            <StatCard label="Skills" value={d.skills} hint={`${d.clusters} clusters`} />
            <StatCard label="Audit events (24h)" value={d.auditEventsLast24h} />
            <StatCard label="AI provider" value={ai.data ? (ai.data.enabled && ai.data.configured ? 'Ready' : ai.data.enabled ? 'Not configured' : 'Disabled') : '…'} tone={ai.data?.enabled && ai.data.configured ? 'verified' : 'pending'} hint={ai.data?.model} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Accounts by role"><ul className="divide-y text-sm">{Object.entries(d.usersByRole).map(([r, n]) => <li key={r} className="flex justify-between py-2"><span>{titleCase(r)}</span><span className="tabular font-medium">{n}</span></li>)}</ul></Section>
            <Section title="Background queues">{!d.queues.available ? <Callout tone="warn" title="Redis unavailable">Queues and caching are offline. Core features still work but batch recalculation will not run.</Callout> : (
              <ul className="divide-y text-sm">{Object.entries(d.queues.queues ?? {}).map(([n, c]) => <li key={n} className="py-2"><p className="font-medium">{n}</p><p className="text-xs text-muted-foreground">waiting {c.waiting} · active {c.active} · completed {c.completed} · failed {c.failed}</p></li>)}</ul>
            )}</Section>
          </div>
        </div>
      )}</Query>
    </>
  );
}
