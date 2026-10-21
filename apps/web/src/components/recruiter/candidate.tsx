import { Badge } from '@/components/ui/badge';
import { ReadinessRadar } from '@/components/readiness-radar';
import { RegistrationBadge } from '@/components/status-badges';
import { levelLabel } from '@/lib/utils';

export interface Candidate {
  candidateId: string;
  status: string;
  name?: string;
  department?: string;
  graduationYear?: number;
  cgpa?: number;
  readinessScore?: number | null;
  readinessDimensions?: Record<string, number | null> | null;
  verifiedSkills?: { name: string; level: number }[];
  projects?: { title: string; techStack: string[] }[];
  email?: string;
  phone?: string;
}

/** Renders only the keys the API returned. A missing key means the field was not released; nothing is guessed or filled in. */
export function CandidateFacts({ c, detail = false }: { c: Candidate; detail?: boolean }) {
  const has = (k: keyof Candidate) => c[k] !== undefined;
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
        {has('department') && <div><dt className="text-xs text-muted-foreground">Department</dt><dd>{c.department}</dd></div>}
        {has('graduationYear') && <div><dt className="text-xs text-muted-foreground">Graduating</dt><dd>{c.graduationYear}</dd></div>}
        {has('cgpa') && <div><dt className="text-xs text-muted-foreground">CGPA</dt><dd className="tabular">{c.cgpa}</dd></div>}
        {has('readinessScore') && <div><dt className="text-xs text-muted-foreground">Readiness for this drive</dt><dd className="tabular font-medium">{c.readinessScore ?? '—'} / 100</dd></div>}
        {has('email') && <div className="col-span-2"><dt className="text-xs text-muted-foreground">Email</dt><dd className="break-all">{c.email}</dd></div>}
        {has('phone') && <div><dt className="text-xs text-muted-foreground">Phone</dt><dd>{c.phone}</dd></div>}
      </dl>
      {c.verifiedSkills && (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Verified skills</p>
          {c.verifiedSkills.length === 0 ? <p className="text-sm text-muted-foreground">None verified yet.</p> : (
            <ul className="flex flex-wrap gap-1.5">{(detail ? c.verifiedSkills : c.verifiedSkills.slice(0, 8)).map((s) => <li key={s.name}><Badge variant="verified">{s.name} · {levelLabel(s.level)}</Badge></li>)}{!detail && c.verifiedSkills.length > 8 && <li><Badge>+{c.verifiedSkills.length - 8} more</Badge></li>}</ul>
          )}
        </div>
      )}
      {detail && c.readinessDimensions && <div className="max-w-sm"><p className="mb-1 text-xs text-muted-foreground">Readiness by dimension</p><ReadinessRadar dimensions={c.readinessDimensions as any} height={200} /></div>}
      {detail && c.projects && c.projects.length > 0 && (
        <div><p className="mb-1 text-xs text-muted-foreground">Projects</p><ul className="space-y-1 text-sm">{c.projects.map((p, i) => <li key={i}><span className="font-medium">{p.title}</span>{p.techStack.length > 0 && <span className="text-muted-foreground"> · {p.techStack.join(', ')}</span>}</li>)}</ul></div>
      )}
    </div>
  );
}

export function CandidateHeading({ c, index }: { c: Candidate; index?: number }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="font-semibold">{c.name ?? `Candidate ${index !== undefined ? index + 1 : c.candidateId.slice(-6)}`}</p>
      <RegistrationBadge status={c.status} />
    </div>
  );
}
