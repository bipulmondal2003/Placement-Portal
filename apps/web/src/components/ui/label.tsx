'use client';
import * as React from 'react';
import * as L from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

export const Label = ({ className, ...p }: React.ComponentProps<typeof L.Root>) => <L.Root className={cn('text-sm font-medium leading-none', className)} {...p} />;

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
