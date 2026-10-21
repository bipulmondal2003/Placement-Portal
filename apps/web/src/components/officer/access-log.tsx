'use client';
import { useState } from 'react';
import { Paginator } from '@/components/paginator';
import { Query } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { qs } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { fmtDateTime, titleCase } from '@/lib/utils';
import type { Page } from './types';

interface Log { _id: string; recruiter?: { name: string; company?: string; email: string }; drive?: { company: string; role: string }; action: string; outcome: string; fieldsReleased: string[]; resultCount?: number; ip?: string; createdAt: string }

/** Every recruiter portal request, allowed or denied. Read-only. */
export function AccessLog() {
  const [page, setPage] = useState(1); const [outcome, setOutcome] = useState(''); const [action, setAction] = useState('');
  const q = useApi<Page<Log>>(`/recruiter-access/logs${qs({ page, limit: 15, outcome, action })}`);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-3">
        <div><label htmlFor="lg-o" className="mr-2 text-sm text-muted-foreground">Outcome</label><Select id="lg-o" className="inline-block w-32" value={outcome} onChange={(e) => { setOutcome(e.target.value); setPage(1); }}><option value="">All</option><option value="allowed">Allowed</option><option value="denied">Denied</option></Select></div>
        <div><label htmlFor="lg-a" className="mr-2 text-sm text-muted-foreground">Action</label><Select id="lg-a" className="inline-block w-44" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}><option value="">All</option><option value="list_drives">List drives</option><option value="search">Search</option><option value="candidate_detail">Candidate detail</option></Select></div>
      </div>
      <Query q={q} rows={3}>{(d) => d.items.length === 0 ? <p className="text-sm text-muted-foreground">No recruiter activity logged.</p> : (
        <><div className="overflow-x-auto"><Table><THead><TR><TH>When</TH><TH>Recruiter</TH><TH>Drive</TH><TH>Action</TH><TH>Outcome</TH><TH>Fields released</TH><TH>Results</TH></TR></THead><TBody>{d.items.map((l) => (
          <TR key={l._id}><TD className="whitespace-nowrap text-xs">{fmtDateTime(l.createdAt)}</TD><TD>{l.recruiter?.name}<span className="block text-xs text-muted-foreground">{l.recruiter?.company}</span></TD><TD>{l.drive ? `${l.drive.company} · ${l.drive.role}` : '—'}</TD><TD>{titleCase(l.action)}</TD><TD><Badge variant={l.outcome === 'allowed' ? 'verified' : 'gap'}>{titleCase(l.outcome)}</Badge></TD><TD className="max-w-[220px] text-xs">{l.fieldsReleased?.join(', ') || '—'}</TD><TD className="tabular">{l.resultCount ?? '—'}</TD></TR>
        ))}</TBody></Table></div><Paginator page={d.page} pages={d.pages} total={d.total} onPage={setPage} /></>
      )}</Query>
    </div>
  );
}
