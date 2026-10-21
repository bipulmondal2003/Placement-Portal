'use client';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { ChartAlt, Headline, axisTick, oneDecimal, tooltipStyle } from './kit';
import type { BatchRow, DeptRow, Distribution, FunnelRow, SupplyRow, TrendRow } from './types';

const BIN_COLORS = ['hsl(var(--gap))', 'hsl(var(--pending))', 'hsl(var(--primary))', 'hsl(var(--primary))', 'hsl(var(--verified))'];

export function DistributionChart({ d }: { d: Distribution }) {
  if (d.total === 0) return <p className="text-sm text-muted-foreground">No readiness data yet. Run a recalculation.</p>;
  const top = [...d.bins].sort((a, b) => b.count - a.count)[0];
  return (
    <div>
      <Headline>{d.total} student–drive results (latest per pair), average readiness {oneDecimal(d.average)}. Most common band: {top.range} ({top.count}).</Headline>
      <div className="h-56" role="img" aria-label={`Students per readiness band: ${d.bins.map((b) => `${b.range} ${b.count}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%"><BarChart data={d.bins}><CartesianGrid vertical={false} stroke="hsl(var(--border))" /><XAxis dataKey="range" tick={axisTick} /><YAxis allowDecimals={false} tick={axisTick} /><Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, 'Students']} /><Bar dataKey="count" radius={[4, 4, 0, 0]}>{d.bins.map((_, i) => <Cell key={i} fill={BIN_COLORS[i % BIN_COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">{(Object.entries(d.dimensionAverages) as [string, number][]).map(([k, v]) => <div key={k} className="rounded-md border p-2"><dt className="text-xs text-muted-foreground">{k === 'projectDepth' ? 'Project depth' : k[0].toUpperCase() + k.slice(1)} (avg)</dt><dd className="tabular font-medium">{oneDecimal(v)}</dd></div>)}</dl>
    </div>
  );
}

export function FunnelTable({ rows }: { rows: FunnelRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No drives yet.</p>;
  const data = rows.map((r) => ({ name: r.drive.company, Eligible: r.eligible, Registered: r.registered, Shortlisted: r.shortlisted, Selected: r.selected }));
  return (
    <div>
      <div className="h-64" role="img" aria-label="Funnel per drive: eligible, registered, shortlisted, selected">
        <ResponsiveContainer width="100%" height="100%"><BarChart data={data}><CartesianGrid vertical={false} stroke="hsl(var(--border))" /><XAxis dataKey="name" tick={axisTick} /><YAxis allowDecimals={false} tick={axisTick} /><Tooltip contentStyle={tooltipStyle} /><Legend /><Bar dataKey="Eligible" fill="hsl(var(--muted-foreground))" /><Bar dataKey="Registered" fill="hsl(var(--primary))" /><Bar dataKey="Shortlisted" fill="hsl(var(--pending))" /><Bar dataKey="Selected" fill="hsl(var(--verified))" /></BarChart></ResponsiveContainer>
      </div>
      <ChartAlt summary="View as table"><Table><THead><TR><TH>Drive</TH><TH>Students</TH><TH>Eligible</TH><TH>Registered</TH><TH>Shortlisted</TH><TH>Selected</TH></TR></THead><TBody>{rows.map((r) => <TR key={r.drive.id}><TD>{r.drive.company} · {r.drive.role}</TD><TD className="tabular">{r.totalStudents}</TD><TD className="tabular">{r.eligible}</TD><TD className="tabular">{r.registered} <span className="text-xs text-muted-foreground">({r.conversion.eligibleToRegistered}%)</span></TD><TD className="tabular">{r.shortlisted}</TD><TD className="tabular">{r.selected}</TD></TR>)}</TBody></Table></ChartAlt>
    </div>
  );
}

/** Supply vs demand: demand is the weight drives put on a skill; supply is students with that skill verified at the required level. */
export function SupplyDemandTable({ rows, limit }: { rows: SupplyRow[]; limit?: number }) {
  const list = limit ? rows.slice(0, limit) : rows;
  if (list.length === 0) return <p className="text-sm text-muted-foreground">No demand data. Publish drives with requirements first.</p>;
  return (
    <div className="overflow-x-auto"><Table>
      <THead><TR><TH>Skill</TH><TH>Drives asking</TH><TH>Avg level needed</TH><TH>Students at target</TH><TH>Any verified</TH><TH>Coverage</TH><TH>Shortfall</TH></TR></THead>
      <TBody>{list.map((r) => (
        <TR key={r.label}>
          <TD className="font-medium">{r.label}{r.mandatory && <Badge className="ml-2" variant="gap">mandatory</Badge>}</TD>
          <TD className="tabular">{r.demandDrives}</TD><TD className="tabular">{oneDecimal(r.averageRequiredLevel)}</TD>
          <TD className="tabular">{r.supplyAtTarget}/{r.studentsInScope}</TD><TD className="tabular">{r.supplyAnyVerified}</TD>
          <TD className="tabular">{r.coveragePercent}%</TD><TD className="tabular font-medium">{r.shortfall}</TD>
        </TR>
      ))}</TBody>
    </Table></div>
  );
}

export function DeptTable({ rows }: { rows: DeptRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No data.</p>;
  return (
    <div className="overflow-x-auto"><Table>
      <THead><TR><TH>Department</TH><TH>Students</TH><TH>Avg readiness</TH><TH>Ready (≥ 75)</TH><TH>With verified evidence</TH><TH>Registrations</TH><TH>Selected</TH></TR></THead>
      <TBody>{rows.map((r) => <TR key={r.department}><TD className="font-medium">{r.department}</TD><TD className="tabular">{r.students}</TD><TD className="tabular">{oneDecimal(r.averageReadiness)}</TD><TD className="tabular">{oneDecimal(r.readyPercent)}%</TD><TD className="tabular">{r.verifiedStudentPercent}%</TD><TD className="tabular">{r.registrations}</TD><TD className="tabular">{r.selected}</TD></TR>)}</TBody>
    </Table></div>
  );
}

export function BatchBars({ rows }: { rows: BatchRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No data.</p>;
  return <div className="h-52" role="img" aria-label={`Average readiness by graduation year: ${rows.map((r) => `${r.graduationYear} ${oneDecimal(r.averageReadiness)}`).join(', ')}`}><ResponsiveContainer width="100%" height="100%"><BarChart data={rows}><CartesianGrid vertical={false} stroke="hsl(var(--border))" /><XAxis dataKey="graduationYear" tick={axisTick} /><YAxis domain={[0, 100]} tick={axisTick} /><Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [oneDecimal(v), 'Average readiness']} /><Bar dataKey="averageReadiness" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>;
}

export function TrendLine({ rows }: { rows: TrendRow[] }) {
  if (rows.length < 2) return <p className="text-sm text-muted-foreground">A trend needs at least two weeks of snapshots. Only {rows.length} so far.</p>;
  return <div className="h-52" role="img" aria-label={`Weekly average readiness: ${rows.map((r) => `${r.week} ${oneDecimal(r.averageReadiness)}`).join(', ')}`}><ResponsiveContainer width="100%" height="100%"><LineChart data={rows}><CartesianGrid vertical={false} stroke="hsl(var(--border))" /><XAxis dataKey="week" tick={axisTick} /><YAxis domain={[0, 100]} tick={axisTick} /><Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [oneDecimal(v), 'Average readiness']} /><Line type="monotone" dataKey="averageReadiness" stroke="hsl(var(--primary))" strokeWidth={2} dot /></LineChart></ResponsiveContainer></div>;
}
