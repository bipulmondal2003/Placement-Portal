import { Clock3 } from 'lucide-react';
import { daysUntil, fmtDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

export function deadlineText(date?: string | null) {
  const d = daysUntil(date);
  if (d === null) return '—';
  if (d < 0) return 'Deadline passed';
  if (d === 0) return 'Closes today';
  return `${d} day${d === 1 ? '' : 's'} left`;
}

export function Deadline({ date, className }: { date?: string | null; className?: string }) {
  const d = daysUntil(date);
  const urgent = d !== null && d >= 0 && d <= 3;
  return (
    <p className={cn('flex items-center gap-1.5 text-xs', urgent ? 'text-pending' : 'text-muted-foreground', className)}>
      <Clock3 className="size-3.5" aria-hidden />
      Deadline {fmtDate(date)} · {deadlineText(date)}
    </p>
  );
}
