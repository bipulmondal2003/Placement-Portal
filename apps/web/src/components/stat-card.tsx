import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function StatCard({ label, value, hint, tone = 'default', icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'verified' | 'pending' | 'gap'; icon?: ReactNode }) {
  const toneCls = { default: '', verified: 'text-verified', pending: 'text-pending', gap: 'text-gap' }[tone];
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        {icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
      </div>
      <p className={cn('tabular mt-1.5 text-3xl font-semibold leading-none', toneCls)}>{value}</p>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
