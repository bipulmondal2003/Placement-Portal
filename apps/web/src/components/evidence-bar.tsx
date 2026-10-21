import { cn, levelLabel } from '@/lib/utils';

/**
 * The product's signature mark: one bar per skill that keeps three facts visibly separate.
 *  solid fill   = level verified by faculty or an objective assessment
 *  hatched fill = level the student claims but nobody has verified
 *  tick         = level the drive requires
 */
export function EvidenceBar({ verified, claimed, required, max = 5, className }: { verified: number; claimed?: number | null; required?: number | null; max?: number; className?: string }) {
  const v = Math.max(0, Math.min(max, verified ?? 0));
  const c = Math.max(v, Math.min(max, claimed ?? 0));
  const label = `Verified ${levelLabel(v)} (${v} of ${max})${c > v ? `, claimed ${levelLabel(c)}, not verified` : ''}${required ? `, required ${levelLabel(required)}` : ''}`;
  return (
    <div className={cn('relative h-3 w-full rounded-full bg-secondary', className)} role="img" aria-label={label}>
      <div className="hatch absolute inset-y-0 left-0 rounded-full" style={{ width: `${(c / max) * 100}%` }} />
      <div className="absolute inset-y-0 left-0 rounded-full bg-verified" style={{ width: `${(v / max) * 100}%` }} />
      {required ? (
        <div className="absolute -inset-y-1 w-0.5 rounded bg-ink" style={{ left: `calc(${(required / max) * 100}% - 1px)` }} aria-hidden>
          <span className="absolute -top-0.5 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-ink" />
        </div>
      ) : null}
    </div>
  );
}

export function EvidenceLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="How to read the bars">
      <li className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-5 rounded-full bg-verified" />Verified</li>
      <li className="flex items-center gap-1.5"><span className="hatch inline-block h-2.5 w-5 rounded-full" />Claimed, not verified</li>
      <li className="flex items-center gap-1.5"><span className="inline-block h-3.5 w-0.5 bg-ink" />Required by the drive</li>
    </ul>
  );
}
