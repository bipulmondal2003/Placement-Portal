'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Info } from 'lucide-react';

export function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Card with a title and optional description and actions. */
export function Section({ title, description, actions, children, className }: { title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {actions}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function Callout({ children, tone = 'info', title }: { children: ReactNode; tone?: 'info' | 'warn'; title?: string }) {
  return (
    <div className={cn('flex gap-2.5 rounded-lg border p-3 text-sm', tone === 'warn' ? 'border-pending/30 bg-pending-soft' : 'bg-muted/50')}>
      <Info className={cn('mt-0.5 size-4 shrink-0', tone === 'warn' ? 'text-pending' : 'text-muted-foreground')} aria-hidden />
      <div className="min-w-0 space-y-0.5">
        {title && <p className="font-medium">{title}</p>}
        <div className="text-foreground/80">{children}</div>
      </div>
    </div>
  );
}

/** One-line takeaway above a chart. Always computed from data by the caller. */
export function Headline({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-sm font-medium">{children}</p>;
}

/** Collapsible text/table alternative for a chart. */
export function ChartAlt({ summary, children }: { summary?: string; children: ReactNode }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">{summary ?? 'View as table'}</summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

export const tooltipStyle = { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 };
export const axisTick = { fill: 'hsl(var(--muted-foreground))', fontSize: 12 };

export const driveName = (d?: { company: string; role: string } | null) => (d ? `${d.company} · ${d.role}` : '—');

export const oneDecimal = (n?: number | null) => (n === null || n === undefined ? '—' : (Math.round(n * 10) / 10).toString());
