'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { CheckCircle2, ListChecks, Sparkles, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Query } from '@/components/states';
import { ScoreRing } from '@/components/score-ring';
import { ReadinessRadar } from '@/components/readiness-radar';
import { EvidenceBar, EvidenceLegend } from '@/components/evidence-bar';
import { DriveStatusBadge, EligibilityBadge, EvidenceStateBadge, RegistrationBadge } from '@/components/status-badges';
import { AiDisclaimer, AiErrorNotice, AiLabel } from '@/components/student/ai-notice';
import { Deadline } from '@/components/student/deadline';
import type { Drive, Match } from '@/components/student/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, errMessage } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { cn } from '@/lib/utils';

interface Explain { authoritative: unknown; explanation: string; disclaimer: string }

export default function StudentDriveDetail() {
  const { id } = useParams<{ id: string }>();
  const drive = useApi<Drive>(`/drives/${id}`);
  const match = useApi<Match>(`/drives/${id}/match`);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; reasons?: string[] } | null>(null);
  const [explain, setExplain] = useState<Explain | null>(null);
  const [explainErr, setExplainErr] = useState<unknown>(null);
  const [explaining, setExplaining] = useState(false);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); await Promise.all([drive.mutate(), match.mutate()]); }
    catch (e: any) { setMsg({ ok: false, text: errMessage(e), reasons: e?.reasons }); }
    finally { setBusy(false); }
  };
  const runExplain = async () => {
    setExplaining(true); setExplainErr(null);
    try { setExplain(await api.post<Explain>('/ai/explain-readiness', { driveId: id })); }
    catch (e) { setExplainErr(e); }
    finally { setExplaining(false); }
  };

  return (
    <Query q={drive} rows={2}>
      {(d) => (
        <>
          <PageHeader
            title={`${d.company} · ${d.role}`}
            description={d.description}
            actions={<div className="flex items-center gap-2"><DriveStatusBadge status={d.status} />{d.myRegistration && <RegistrationBadge status={d.myRegistration.status} />}</div>}
          />
          <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2"><Deadline date={d.deadline} />{d.location && <span className="text-xs text-muted-foreground">{d.location}</span>}{d.package && <span className="text-xs text-muted-foreground">{d.package}</span>}</div>

          <Query q={match} rows={3}>
            {(m) => {
              const registered = d.myRegistration && d.myRegistration.status !== 'withdrawn';
              return (
                <div className="space-y-6">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Card>
                      <CardHeader className="flex-row items-start justify-between gap-2">
                        <div><CardTitle>Eligibility</CardTitle><CardDescription>Fixed rules set by the placement cell. Pass or fail, with no scoring.</CardDescription></div>
                        <EligibilityBadge eligible={m.eligibility.eligible} />
                      </CardHeader>
                      <CardContent>
                        <ul className="divide-y">
                          {m.eligibility.checks.map((c) => (
                            <li key={c.code} className="flex items-start gap-2 py-2.5 text-sm">
                              {c.passed ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-verified" aria-label="Passed" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-gap" aria-label="Failed" />}
                              <div><p className="font-medium">{c.label}</p><p className="text-xs text-muted-foreground">Needs {c.required}; you have {c.actual}.{!c.passed && c.message ? ` ${c.message}` : ''}</p></div>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-4 space-y-2">
                          {msg && <div role={msg.ok ? 'status' : 'alert'} className={cn('rounded-md border p-3 text-sm', msg.ok ? 'border-verified/30 bg-verified-soft' : 'border-gap/30 bg-gap-soft')}>{msg.text}{msg.reasons && <ul className="mt-1 list-disc pl-5">{msg.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}</div>}
                          {registered ? (
                            d.myRegistration!.status === 'registered' && <Button variant="outline" loading={busy} onClick={() => act(() => api.delete(`/drives/${id}/register`), 'Registration withdrawn.')}>Withdraw registration</Button>
                          ) : (
                            <Button loading={busy} disabled={!m.eligibility.eligible || d.status !== 'published'} onClick={() => act(() => api.post(`/drives/${id}/register`), 'You are registered for this drive.')}>Register for this drive</Button>
                          )}
                          {!registered && !m.eligibility.eligible && <p className="text-xs text-muted-foreground">Registration is open only to eligible students.</p>}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader><CardTitle>Readiness</CardTitle><CardDescription>Computed from verified evidence only. Claims you have not had verified do not add to the score.</CardDescription></CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap items-center gap-6">
                          <ScoreRing score={m.readiness.score} size={112} capped={m.readiness.cappedByMandatory} />
                          <div className="min-w-[200px] flex-1"><ReadinessRadar dimensions={m.readiness.dimensions} height={190} /></div>
                        </div>
                        {m.readiness.cappedByMandatory && <p className="mt-3 rounded-md border border-pending/30 bg-pending-soft p-2.5 text-sm">Your score is capped because a mandatory skill is still missing. Closing it removes the cap.</p>}
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader><CardTitle>Skill by skill</CardTitle><CardDescription>Biggest score impact first.</CardDescription><EvidenceLegend /></CardHeader>
                    <CardContent>
                      <ul className="divide-y">
                        {[...m.readiness.gaps, ...m.readiness.met].map((g) => (
                          <li key={g.key} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center">
                            <div className="min-w-0">
                              <p className="font-medium">{g.label}{g.mandatory && <span className="ml-2 text-xs font-normal text-gap">mandatory</span>}</p>
                              <div className="mt-1"><EvidenceStateBadge state={g.gap > 0 ? g.evidenceState : 'met'} /></div>
                            </div>
                            <div>
                              <EvidenceBar verified={g.verifiedLevel} claimed={g.selfReportedLevel} required={g.requiredLevel} />
                              {g.gap > 0 && g.action && <p className="mt-1.5 text-xs text-muted-foreground">{g.action}</p>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <Card>
                      <CardHeader><CardTitle>Why this score</CardTitle><CardDescription>Generated by rules, not by AI.</CardDescription></CardHeader>
                      <CardContent><ul className="list-disc space-y-1 pl-5 text-sm">{m.readiness.explanation.map((x, i) => <li key={i}>{x}</li>)}</ul></CardContent>
                    </Card>
                    <Card>
                      <CardHeader><CardTitle>Next actions</CardTitle></CardHeader>
                      <CardContent>
                        <ol className="list-decimal space-y-1 pl-5 text-sm">{m.readiness.nextActions.map((x, i) => <li key={i}>{x}</li>)}</ol>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button asChild variant="outline"><Link href={`/student/plan?drive=${id}`}><ListChecks />Build a preparation plan</Link></Button>
                          <Button asChild variant="outline"><Link href="/student/evidence">Add evidence</Link></Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader className="flex-row items-start justify-between gap-2">
                      <div><CardTitle>Explain it in plain language</CardTitle><CardDescription>Optional. The AI rewords the numbers above. It cannot change them.</CardDescription></div>
                      <Button variant="outline" loading={explaining} onClick={runExplain}><Sparkles />{explain ? 'Explain again' : 'Explain my result'}</Button>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <AiErrorNotice error={explainErr} />
                      {explain && <><AiLabel /><p className="whitespace-pre-line text-sm">{explain.explanation}</p><AiDisclaimer text={explain.disclaimer} /></>}
                    </CardContent>
                  </Card>
                </div>
              );
            }}
          </Query>
        </>
      )}
    </Query>
  );
}
