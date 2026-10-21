'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingBlock, Query } from '@/components/states';
import { Paginator } from '@/components/paginator';
import { CandidateFacts, CandidateHeading, type Candidate } from '@/components/recruiter/candidate';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input, Select } from '@/components/ui/input';
import { qs } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { fmtDateTime } from '@/lib/utils';

interface Grant { driveId: string; company: string; role: string; accessExpiresAt: string; releasedFields: string[] }
interface Result { items: Candidate[]; total: number; matched: number; page: number; pages: number; capped: boolean; releasedFields: string[] }
interface Facets { totalCandidates: number; department?: Record<string, number>; graduationYear?: Record<string, number>; skills?: { name: string; count: number }[] }

function useDebounced<T>(v: T, ms = 400) { const [d, setD] = useState(v); useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]); return d; }

export default function RecruiterDrive() {
  const { id } = useParams<{ id: string }>();
  const grants = useApi<Grant[]>('/recruiter/drives');
  const grant = grants.data?.find((g) => g.driveId === id);
  const fields = grant?.releasedFields ?? [];
  const facets = useApi<Facets>(grant ? `/recruiter/drives/${id}/facets` : null);

  const [f, setF] = useState({ q: '', skill: '', minLevel: '', minReadiness: '', department: '', graduationYear: '', minCgpa: '' });
  const [page, setPage] = useState(1);
  const dq = useDebounced(f);
  const params = { ...dq, page, limit: 12 };
  const res = useApi<Result>(grant ? `/recruiter/drives/${id}/candidates${qs(params)}` : null, { keepPreviousData: true });
  const [open, setOpen] = useState<string | null>(null);
  const detail = useApi<Candidate>(open ? `/recruiter/drives/${id}/candidates/${open}` : null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setF((s) => ({ ...s, [k]: e.target.value })); setPage(1); };
  const can = (k: string) => fields.includes(k);

  if (grants.isLoading) return <LoadingBlock rows={3} />;
  if (grants.error) return <ErrorState error={grants.error} retry={() => grants.mutate()} />;
  if (!grant) return <EmptyState title="No access to this drive" description="Your access may have expired or been revoked. Ask the placement cell if you still need it." action={<Button asChild variant="outline"><Link href="/recruiter">Back to your drives</Link></Button>} />;

  return (
    <>
      <Link href="/recruiter" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />All drives</Link>
      <PageHeader title={`${grant.company} · ${grant.role}`} description={`Your access ends ${fmtDateTime(grant.accessExpiresAt)}. Searches and views are logged.`} />

      <Card className="mb-5"><CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {can('name') && <Field label="Name" htmlFor="rf-q"><Input id="rf-q" value={f.q} onChange={set('q')} maxLength={60} /></Field>}
        {can('verifiedSkills') && <>
          <Field label="Verified skill" htmlFor="rf-skill"><Input id="rf-skill" list="rf-skills" value={f.skill} onChange={set('skill')} maxLength={60} placeholder="e.g. React" /><datalist id="rf-skills">{facets.data?.skills?.map((s) => <option key={s.name} value={s.name} />)}</datalist></Field>
          <Field label="Minimum level" htmlFor="rf-lvl"><Select id="rf-lvl" value={f.minLevel} onChange={set('minLevel')}><option value="">Any</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}+</option>)}</Select></Field>
        </>}
        {can('readinessScore') && <Field label="Minimum readiness" htmlFor="rf-rd"><Input id="rf-rd" type="number" min={0} max={100} value={f.minReadiness} onChange={set('minReadiness')} /></Field>}
        {can('department') && <Field label="Department" htmlFor="rf-dep"><Select id="rf-dep" value={f.department} onChange={set('department')}><option value="">All</option>{Object.entries(facets.data?.department ?? {}).map(([k, n]) => <option key={k} value={k}>{k} ({n})</option>)}</Select></Field>}
        {can('graduationYear') && <Field label="Graduation year" htmlFor="rf-gy"><Select id="rf-gy" value={f.graduationYear} onChange={set('graduationYear')}><option value="">All</option>{Object.entries(facets.data?.graduationYear ?? {}).map(([k, n]) => <option key={k} value={k}>{k} ({n})</option>)}</Select></Field>}
        {can('cgpa') && <Field label="Minimum CGPA" htmlFor="rf-cg"><Input id="rf-cg" type="number" step="0.1" min={0} max={10} value={f.minCgpa} onChange={set('minCgpa')} /></Field>}
        <div className="flex items-end"><Button variant="ghost" onClick={() => { setF({ q: '', skill: '', minLevel: '', minReadiness: '', department: '', graduationYear: '', minCgpa: '' }); setPage(1); }}>Clear filters</Button></div>
      </CardContent></Card>

      <Query q={res} rows={4}>
        {(d) => (
          <>
            <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">{d.matched} candidate{d.matched === 1 ? '' : 's'} match{d.matched === 1 ? 'es' : ''}.{d.capped && ' Results are capped; narrow your filters to see the rest.'}</p>
            {d.items.length === 0 ? <EmptyState title="No candidates match" description="Loosen a filter and try again." /> : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  {d.items.map((c, i) => (
                    <Card key={c.candidateId}><CardContent className="space-y-3 p-5">
                      <CandidateHeading c={c} index={(d.page - 1) * 12 + i} />
                      <CandidateFacts c={c} />
                      <Button variant="outline" size="sm" onClick={() => setOpen(c.candidateId)}>View details</Button>
                    </CardContent></Card>
                  ))}
                </div>
                <Paginator page={d.page} pages={d.pages} total={d.total} onPage={setPage} />
              </>
            )}
          </>
        )}
      </Query>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent title="Candidate details" description="Only fields released to you are shown. This view is logged.">
          <Query q={detail} rows={3}>{(c) => <div className="space-y-3"><CandidateHeading c={c} /><CandidateFacts c={c} detail /></div>}</Query>
        </DialogContent>
      </Dialog>
    </>
  );
}
