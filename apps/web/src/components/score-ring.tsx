import { cn } from '@/lib/utils';

export function ScoreRing({ score, size = 96, label = 'Readiness', capped }: { score?: number | null; size?: number; label?: string; capped?: boolean }) {
  const s = Math.max(0, Math.min(100, score ?? 0));
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const tone = s >= 75 ? 'stroke-verified' : s >= 50 ? 'stroke-primary' : s >= 25 ? 'stroke-pending' : 'stroke-gap';
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`${label} ${Math.round(s)} out of 100${capped ? ', limited by a missing mandatory skill' : ''}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={8} className="fill-none stroke-secondary" />
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={8} strokeLinecap="round" className={cn('fill-none transition-all', tone)} strokeDasharray={c} strokeDashoffset={c - (s / 100) * c} />
      </svg>
      <div className="absolute text-center">
        <div className="tabular text-2xl font-semibold leading-none">{score === null || score === undefined ? '—' : Math.round(s)}</div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
