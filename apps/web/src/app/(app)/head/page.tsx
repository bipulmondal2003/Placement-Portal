'use client';
import { PageHeader } from '@/components/page-header';
import { Query } from '@/components/states';
import { BatchBars, DeptTable, DistributionChart, FunnelTable, SupplyDemandTable, TrendLine } from '@/components/officer/analytics';
import { Callout, Section, oneDecimal } from '@/components/officer/kit';
import type { BatchRow, DeptRow, Distribution, FunnelRow, SupplyRow, Training, TrendRow } from '@/components/officer/types';
import { StatCard } from '@/components/stat-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useApi } from '@/lib/hooks';

interface Dash { departments: DeptRow[]; batches: BatchRow[]; trend: TrendRow[]; training: Training; supplyDemand: SupplyRow[]; funnel: FunnelRow[]; distribution: Distribution }

export default function HeadDashboard() {
  const q = useApi<Dash>('/dashboards/head');
  return (
    <>
      <PageHeader title="Leadership view" description="Cohort-level comparison across departments and batches. Figures are live; training results are observational." />
      <Query q={q} rows={4}>
        {(d) => {
          const best = [...d.departments].sort((a, b) => b.averageReadiness - a.averageReadiness)[0];
          const students = d.departments.reduce((s, x) => s + x.students, 0);
          const selected = d.departments.reduce((s, x) => s + x.selected, 0);
          return (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Students" value={students} />
                <StatCard label="Average readiness" value={oneDecimal(d.distribution.average)} />
                <StatCard label="Highest department" value={best?.department ?? '—'} hint={best ? `average ${oneDecimal(best.averageReadiness)}` : undefined} />
                <StatCard label="Selected so far" value={selected} tone="verified" />
              </div>
              <Section title="Departments"><DeptTable rows={d.departments} /></Section>
              <div className="grid gap-6 lg:grid-cols-2">
                <Section title="Readiness distribution"><DistributionChart d={d.distribution} /></Section>
                <Section title="By graduation year"><BatchBars rows={d.batches} /></Section>
                <Section title="Weekly trend" description="Average readiness of snapshots computed that week."><TrendLine rows={d.trend} /></Section>
                <Section title="Funnel by drive"><FunnelTable rows={d.funnel} /></Section>
              </div>
              <Section title="Skill supply vs demand" description="Where training investment would close the most placement gaps."><SupplyDemandTable rows={d.supplyDemand} /></Section>
              <Section title="Training effectiveness">
                <div className="mb-3"><Callout tone="warn" title="Observational, not causal">{d.training.note}</Callout></div>
                <div className="grid gap-6 lg:grid-cols-2">
                  <Table><THead><TR><TH>Plan completion</TH><TH>Students</TH><TH>Avg readiness change</TH></TR></THead><TBody>{d.training.planCompletionVsReadinessChange.map((r) => <TR key={r.band}><TD>{r.band}</TD><TD className="tabular">{r.students}</TD><TD className="tabular">{oneDecimal(r.averageReadinessChange)}</TD></TR>)}</TBody></Table>
                  <Table><THead><TR><TH>Assessment</TH><TH>Retakers</TH><TH>Avg change (pts)</TH></TR></THead><TBody>{d.training.assessmentImprovement.map((r) => <TR key={r.assessment}><TD>{r.assessment}</TD><TD className="tabular">{r.studentsWithRetakes}</TD><TD className="tabular">{oneDecimal(r.averageImprovementPoints)}</TD></TR>)}</TBody></Table>
                </div>
              </Section>
            </div>
          );
        }}
      </Query>
    </>
  );
}
