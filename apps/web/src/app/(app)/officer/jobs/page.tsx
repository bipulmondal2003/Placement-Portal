'use client';
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Query } from '@/components/states';
import { Paginator } from '@/components/paginator';
import { Callout, Section } from '@/components/officer/kit';
import type { Batch, Page, Queues } from '@/components/officer/types';
import type { Drive as SDrive, Page as SPage } from '@/components/student/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input, Select } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { api, errMessage, qs } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { fmtDateTime, titleCase } from '@/lib/utils';

export default function OfficerJobs() {
  const [page, setPage] = useState(1);
  const hasActive = (b?: Page<Batch>) => !!b?.items.some((x) => x.status === 'queued' || x.status === 'active');
  const batches = useApi<Page<Batch>>(`/jobs/batches${qs({ page, limit: 8 })}`, { refreshInterval: (d) => (hasActive(d) ? 2000 : 0) });
  const queues = useApi<Queues>('/jobs/queues', { refreshInterval: 5000 });
  const drives = useApi<SPage<SDrive>>('/drives?limit=50');
  const [driveId, setDriveId] = useState(''); const [department, setDepartment] = useState(''); const [year, setYear] = useState('');
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const start = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api.post<{ duplicate: boolean }>('/jobs/batch-readiness', { driveIds: driveId ? [driveId] : undefined, department: department || undefined, graduationYear: year ? Number(year) : undefined });
      setMsg({ ok: true, text: r.duplicate ? 'An identical recalculation is already running; showing that one.' : 'Recalculation queued.' });
      await batches.mutate();
    } catch (e) { setMsg({ ok: false, text: errMessage(e) }); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Recalculation" description="Scores update automatically when evidence or profiles change. Run a batch after changing a drive’s requirements or the scoring settings." />
      <div className="space-y-6">
        <Section title="Start a batch" description="Leave everything empty to recalculate every student for every published drive. Unchanged inputs are skipped, so reruns are cheap.">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Drive" htmlFor="jb-d"><Select id="jb-d" value={driveId} onChange={(e) => setDriveId(e.target.value)}><option value="">All published drives</option>{drives.data?.items.map((d) => <option key={d._id} value={d._id}>{d.company} · {d.role}</option>)}</Select></Field>
            <Field label="Department" htmlFor="jb-dep"><Input id="jb-dep" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="All" /></Field>
            <Field label="Graduation year" htmlFor="jb-y"><Input id="jb-y" type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="All" /></Field>
          </div>
          {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mt-3 rounded-md border p-3 text-sm ${msg.ok ? 'border-verified/30 bg-verified-soft' : 'border-gap/30 bg-gap-soft'}`}>{msg.text}</p>}
          <div className="mt-4"><Button loading={busy} onClick={start}><RefreshCw />Start recalculation</Button></div>
        </Section>

        <Section title="Queues">
          <Query q={queues} rows={1}>{(d) => !d.available ? <Callout tone="warn" title="Queue unavailable">Redis is not reachable, so background jobs cannot run. Recalculation still happens inline for single students.</Callout> : (
            <div className="grid gap-3 sm:grid-cols-3">{Object.entries(d.queues ?? {}).map(([name, c]) => <div key={name} className="rounded-md border p-3 text-sm"><p className="mb-1 font-medium">{name}</p><p className="text-xs text-muted-foreground">waiting {c.waiting} · active {c.active} · completed {c.completed} · failed {c.failed}</p></div>)}</div>
          )}</Query>
        </Section>

        <Section title="Batch history">
          <Query q={batches} rows={2}>{(d) => d.items.length === 0 ? <p className="text-sm text-muted-foreground">No batches run yet.</p> : (
            <><ul className="divide-y">{d.items.map((b) => {
              const pct = b.total ? Math.round((100 * (b.processed + b.failed)) / b.total) : b.status === 'completed' ? 100 : 0;
              return (
                <li key={b._id} className="space-y-1.5 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2"><Badge variant={b.status === 'completed' ? 'verified' : b.status === 'failed' || b.status === 'partial' ? 'gap' : 'pending'}>{titleCase(b.status)}</Badge><span className="text-muted-foreground">{fmtDateTime(b.createdAt)}</span></span><span className="tabular text-xs text-muted-foreground">{b.processed}/{b.total} students · {b.skippedUnchanged} unchanged pairs skipped · {b.failed} failed</span></div>
                  <Progress value={pct} aria-label="Batch progress" />
                  {b.errorLog?.length > 0 && <details className="text-xs"><summary className="cursor-pointer text-gap">{b.errorLog.length} error{b.errorLog.length === 1 ? '' : 's'}</summary><ul className="mt-1 list-disc pl-5">{b.errorLog.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}</ul></details>}
                </li>
              );
            })}</ul><Paginator page={d.page} pages={d.pages} total={d.total} onPage={setPage} /></>
          )}</Query>
        </Section>
      </div>
    </>
  );
}
