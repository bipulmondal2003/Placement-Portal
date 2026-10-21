import { CheckCircle2, CircleDashed, Clock3, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { titleCase } from '@/lib/utils';

export function EvidenceStatusBadge({ status }: { status: string }) {
  if (status === 'verified') return <Badge variant="verified"><CheckCircle2 className="size-3" />Verified</Badge>;
  if (status === 'rejected') return <Badge variant="gap"><XCircle className="size-3" />Rejected</Badge>;
  return <Badge variant="pending"><Clock3 className="size-3" />Pending review</Badge>;
}

export function EligibilityBadge({ eligible }: { eligible: boolean }) {
  return eligible ? <Badge variant="verified"><CheckCircle2 className="size-3" />Eligible</Badge> : <Badge variant="gap"><XCircle className="size-3" />Not eligible</Badge>;
}

export function DriveStatusBadge({ status }: { status: string }) {
  const v = status === 'published' ? 'primary' : status === 'completed' || status === 'closed' ? 'default' : 'outline';
  return <Badge variant={v as any}>{titleCase(status)}</Badge>;
}

export function RegistrationBadge({ status }: { status: string }) {
  const v = status === 'selected' ? 'verified' : status === 'rejected' || status === 'withdrawn' ? 'gap' : status === 'shortlisted' ? 'primary' : 'default';
  return <Badge variant={v as any}>{titleCase(status)}</Badge>;
}

const EVIDENCE_STATE: Record<string, { label: string; variant: 'gap' | 'pending' | 'default' | 'verified' }> = {
  no_evidence: { label: 'No evidence yet', variant: 'gap' },
  unverified_claim: { label: 'Claimed, unverified', variant: 'pending' },
  pending_review: { label: 'Awaiting review', variant: 'pending' },
  below_target: { label: 'Verified, below target', variant: 'default' },
  weak_evidence: { label: 'Weak evidence', variant: 'pending' },
  met: { label: 'Requirement met', variant: 'verified' },
};
export function EvidenceStateBadge({ state }: { state: string }) {
  const m = EVIDENCE_STATE[state] ?? { label: titleCase(state), variant: 'default' as const };
  return <Badge variant={m.variant}><CircleDashed className="size-3" />{m.label}</Badge>;
}
