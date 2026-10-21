'use client';
import { PageHeader } from '@/components/page-header';
import { Query } from '@/components/states';
import { BatchBars, DeptTable, DistributionChart, FunnelTable, SupplyDemandTable, TrendLine } from '@/components/officer/analytics';
import { Callout, Section } from '@/components/officer/kit';
import type { BatchRow, DeptRow, Distribution, FunnelRow, SupplyRow, TrendRow, Training } from '@/components/officer/types';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApi } from '@/lib/hooks';
import { oneDecimal } from '@/components/officer/kit';

interface SD { studentsInScope: number; drivesConsidered: number; rows: SupplyRow[] }
interface GF { studentsAnalysed: number; rows: { label: string; students: number; percentOfStudents: number; averageGap: number; averageImpact: number; evidenceStates: Record<string, number> }[] }
interface VC { students: number; studentsWithVerifiedEvidence: number; studentsWithAnyEvidence: number; verifiedStudentPercent: number; reviewedPercent: number; totals: { pending: number; verified: number; rejected: number }; byType: { type: string; pending: number; verified: number; rejected: number }[] }

export default function OfficerReports() {
  const sd = useApi<SD>('/reports/skill-supply-demand');
  const gf = useApi<GF>('/reports/gap-frequency');
  const vc = useApi<VC>('/reports/verification-coverage');
  const dist = useApi<Distribution>('/reports/readiness-distribution');
  const funnel = useApi<FunnelRow[]>('/reports/funnel');
  const dept = useApi<DeptRow[]>('/reports/department-comparison');
  const batch = useApi<BatchRow[]>('/reports/batch-comparison');
  const trend = useApi<TrendRow[]>('/reports/readiness-trend');
  const train = useApi<Training>('/reports/training-effectiveness');
  return (
    <>
      <PageHeader title="Reports" description="Computed on demand from current data. Each table states what it counts." />
      <Tabs defaultValue="supply">
        <TabsList><TabsTrigger value="supply">Supply vs demand</TabsTrigger><TabsTrigger value="gaps">Common gaps</TabsTrigger><TabsTrigger value="verification">Verification</TabsTrigger><TabsTrigger value="readiness">Readiness</TabsTrigger><TabsTrigger value="funnel">Funnel</TabsTrigger><TabsTrigger value="training">Training</TabsTrigger></TabsList>
        <TabsContent value="supply"><Query q={sd} rows={4}>{(d) => (
          <Section title="Skill supply vs demand" description={`${d.drivesConsidered} published drives · ${d.studentsInScope} students in scope. Demand = drives requiring the skill. Supply = students with it verified at the average required level. Shortfall = students still short.`}><SupplyDemandTable rows={d.rows} /></Section>
        )}</Query></TabsContent>
        <TabsContent value="gaps"><Query q={gf} rows={4}>{(d) => (
          <Section title="Most frequent gaps" description={`Across ${d.studentsAnalysed} students and their drives. “No evidence” gaps are fixed by submitting evidence; “below target” ones by learning.`}>
            <div className="overflow-x-auto"><Table><THead><TR><TH>Skill</TH><TH>Students</TH><TH>% of students</TH><TH>Avg gap (levels)</TH><TH>Evidence status</TH></TR></THead><TBody>{d.rows.map((r) => <TR key={r.label}><TD className="font-medium">{r.label}</TD><TD className="tabular">{r.students}</TD><TD className="tabular">{r.percentOfStudents}%</TD><TD className="tabular">{oneDecimal(r.averageGap)}</TD><TD><div className="flex flex-wrap gap-1">{Object.entries(r.evidenceStates).filter(([, n]) => n > 0).map(([k, n]) => <Badge key={k}>{k.replace(/_/g, ' ')} {n}</Badge>)}</div></TD></TR>)}</TBody></Table></div>
          </Section>
        )}</Query></TabsContent>
        <TabsContent value="verification"><Query q={vc} rows={3}>{(d) => (
          <Section title="Verification coverage" description="How much of what students claim has actually been reviewed.">
            <p className="mb-3 text-sm">{d.studentsWithVerifiedEvidence} of {d.students} students ({d.verifiedStudentPercent}%) have at least one verified item; {d.studentsWithAnyEvidence} have submitted any. {oneDecimal(d.reviewedPercent)}% of submissions have been reviewed.</p>
            <Table><THead><TR><TH>Evidence type</TH><TH>Pending</TH><TH>Verified</TH><TH>Rejected</TH></TR></THead><TBody>{d.byType.map((r) => <TR key={r.type}><TD className="capitalize">{r.type.replace(/_/g, ' ')}</TD><TD className="tabular">{r.pending}</TD><TD className="tabular">{r.verified}</TD><TD className="tabular">{r.rejected}</TD></TR>)}</TBody></Table>
          </Section>
        )}</Query></TabsContent>
        <TabsContent value="readiness"><div className="grid gap-6 lg:grid-cols-2">
          <Section title="Distribution"><Query q={dist} rows={3}>{(d) => <DistributionChart d={d} />}</Query></Section>
          <Section title="Average readiness by department"><Query q={dept} rows={3}>{(d) => <DeptTable rows={d} />}</Query></Section>
          <Section title="By graduation year"><Query q={batch} rows={2}>{(d) => <BatchBars rows={d} />}</Query></Section>
          <Section title="Weekly trend"><Query q={trend} rows={2}>{(d) => <TrendLine rows={d} />}</Query></Section>
        </div></TabsContent>
        <TabsContent value="funnel"><Section title="Funnel by drive" description="Eligible → registered → shortlisted → selected."><Query q={funnel} rows={3}>{(d) => <FunnelTable rows={d} />}</Query></Section></TabsContent>
        <TabsContent value="training"><Query q={train} rows={3}>{(d) => (
          <div className="space-y-4"><Callout tone="warn" title="Observational, not causal">{d.note}</Callout>
            <Section title="Plan completion vs readiness change"><Table><THead><TR><TH>Plan completion</TH><TH>Students</TH><TH>Avg readiness change</TH></TR></THead><TBody>{d.planCompletionVsReadinessChange.map((r) => <TR key={r.band}><TD>{r.band}</TD><TD className="tabular">{r.students}</TD><TD className="tabular">{oneDecimal(r.averageReadinessChange)}</TD></TR>)}</TBody></Table></Section>
            <Section title="Assessment improvement on retake"><Table><THead><TR><TH>Assessment</TH><TH>Students with retakes</TH><TH>Avg change (points)</TH></TR></THead><TBody>{d.assessmentImprovement.map((r) => <TR key={r.assessment}><TD>{r.assessment}</TD><TD className="tabular">{r.studentsWithRetakes}</TD><TD className="tabular">{oneDecimal(r.averageImprovementPoints)}</TD></TR>)}</TBody></Table></Section></div>
        )}</Query></TabsContent>
      </Tabs>
    </>
  );
}
