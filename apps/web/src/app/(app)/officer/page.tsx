'use client';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { Query } from '@/components/states';
import { DistributionChart, FunnelTable, SupplyDemandTable } from '@/components/officer/analytics';
import { Section } from '@/components/officer/kit';
import type { Distribution, FunnelRow, SupplyRow } from '@/components/officer/types';
import { useApi } from '@/lib/hooks';

interface Dash {
  totalStudents: number;
  drives: { published: number; draft: number; completed: number };
  registrations: { registered: number; shortlisted: number; selected: number; rejected: number };
  readinessDistribution: Distribution;
  verification: { verifiedStudentPercent: number; reviewedPercent: number; pending: number };
  topSkillShortfalls: SupplyRow[];
  funnel: FunnelRow[];
}

export default function OfficerOverview() {
  const q = useApi<Dash>('/dashboards/officer');
  return (
    <>
      <PageHeader title="Placement overview" description="Live figures from the database. Nothing on this page is estimated." />
      <Query q={q} rows={4}>
        {(d) => (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Students" value={d.totalStudents} />
              <StatCard label="Published drives" value={d.drives.published} hint={`${d.drives.draft} draft · ${d.drives.completed} completed`} />
              <StatCard label="Registrations" value={d.registrations.registered + d.registrations.shortlisted + d.registrations.selected} hint={`${d.registrations.shortlisted} shortlisted · ${d.registrations.selected} selected`} />
              <StatCard label="Students with verified evidence" value={`${d.verification.verifiedStudentPercent}%`} tone="verified" hint={`${d.verification.pending} items awaiting review`} />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <Section title="Readiness distribution" description="Latest snapshot per student and drive."><DistributionChart d={d.readinessDistribution} /></Section>
              <Section title="Funnel by drive"><FunnelTable rows={d.funnel} /></Section>
            </div>
            <Section title="Biggest skill shortfalls" description="Skills drives ask for that too few students have verified at the required level." actions={<Link className="text-sm text-primary underline-offset-4 hover:underline" href="/officer/reports">Full report</Link>}>
              <SupplyDemandTable rows={d.topSkillShortfalls} />
            </Section>
          </div>
        )}
      </Query>
    </>
  );
}
