'use client';
import type { ReactNode } from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { errMessage } from '@/lib/api';

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border border-gap/30 bg-gap-soft p-4 text-sm">
      <div className="flex items-center gap-2 font-medium text-gap"><AlertTriangle className="size-4" />Couldn’t load this</div>
      <p className="text-foreground/80">{errMessage(error)}</p>
      {retry && <Button size="sm" variant="outline" onClick={retry}>Try again</Button>}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
      <Inbox className="size-6 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}

/** Renders loading / error / content for an SWR result. */
export function Query<T>({ q, children, rows }: { q: { data?: T; error?: unknown; isLoading: boolean; mutate: () => unknown }; children: (data: T) => ReactNode; rows?: number }) {
  if (q.isLoading) return <LoadingBlock rows={rows} />;
  if (q.error) return <ErrorState error={q.error} retry={() => void q.mutate()} />;
  if (q.data === undefined) return null;
  return <>{children(q.data)}</>;
}
