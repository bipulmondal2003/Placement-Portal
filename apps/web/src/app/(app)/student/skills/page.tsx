'use client';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { EmptyState, Query } from '@/components/states';
import { EvidenceBar, EvidenceLegend } from '@/components/evidence-bar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { SkillPicker } from '@/components/student/skill-picker';
import { useApi } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { api, errMessage } from '@/lib/api';
import { LEVELS, levelLabel, titleCase } from '@/lib/utils';

interface Row { skillId: string; name: string; category: string; dimension: string; declaredLevel: number; selfReportedLevel: number; verifiedLevel: number; verifiedEvidenceCount: number; pendingEvidenceCount: number; rejectedEvidenceCount: number; status: string }
interface Res { skills: Row[]; projectDepth: number }

export default function StudentSkills() {
  const { user } = useAuth();
  const q = useApi<Res>(user ? `/students/${user.id}/skills` : null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const setLevel = async (skillId: string, level: number) => {
    if (!user) return;
    setSaving(skillId); setErr(null);
    try { await api.put(`/students/${user.id}/skills/${skillId}/declared`, { level }); await q.mutate(); }
    catch (e) { setErr(errMessage(e)); }
    finally { setSaving(null); }
  };

  return (
    <>
      <PageHeader title="My skills" description="Say what you think you know. Only faculty-reviewed evidence and objective assessments turn a claim into a verified level." />
      <div className="mb-4"><EvidenceLegend /></div>
      {err && <p role="alert" className="mb-3 rounded-md border border-gap/30 bg-gap-soft p-3 text-sm">{err}</p>}
      <Query q={q} rows={5}>
        {(d) => (
          <div className="space-y-6">
            <Card>
              <CardContent className="p-5">
                <h2 className="mb-3 text-base font-semibold">Add a skill to your profile</h2>
                <div className="max-w-xl"><SkillPicker exclude={d.skills.map((s) => s.skillId)} onPick={(s) => setLevel(s.id, 1)} /></div>
                <p className="mt-2 text-xs text-muted-foreground">Picking a skill adds it as “Aware”. Change the level below.</p>
              </CardContent>
            </Card>
            {d.skills.length === 0 ? <EmptyState title="No skills yet" description="Add your first skill above, then attach evidence to get it verified." /> : (
              <Card>
                <ul className="divide-y">
                  {d.skills.map((s) => (
                    <li key={s.skillId} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_150px] md:items-center">
                      <div className="min-w-0">
                        <p className="font-medium">{s.name}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                          <Badge>{s.category}</Badge>
                          {s.pendingEvidenceCount > 0 && <Badge variant="pending">{s.pendingEvidenceCount} awaiting review</Badge>}
                          {s.rejectedEvidenceCount > 0 && <Badge variant="gap">{s.rejectedEvidenceCount} rejected</Badge>}
                        </div>
                      </div>
                      <div>
                        <EvidenceBar verified={s.verifiedLevel} claimed={Math.max(s.declaredLevel, s.selfReportedLevel)} />
                        <p className="mt-1 text-xs text-muted-foreground">Verified: <span className="font-medium text-foreground">{levelLabel(s.verifiedLevel)}</span>{s.verifiedEvidenceCount > 0 ? ` (${s.verifiedEvidenceCount} item${s.verifiedEvidenceCount === 1 ? '' : 's'})` : ''} · {titleCase(s.status)}</p>
                      </div>
                      <div>
                        <label htmlFor={`lvl-${s.skillId}`} className="mb-1 block text-xs text-muted-foreground">My claimed level</label>
                        <Select id={`lvl-${s.skillId}`} value={s.declaredLevel} disabled={saving === s.skillId} onChange={(e) => setLevel(s.skillId, Number(e.target.value))}>
                          {LEVELS.map((l, i) => <option key={l} value={i}>{i} · {l}</option>)}
                        </Select>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}
      </Query>
    </>
  );
}
