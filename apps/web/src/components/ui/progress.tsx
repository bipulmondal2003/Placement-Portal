'use client';
import * as React from 'react';
import * as P from '@radix-ui/react-progress';
import { cn } from '@/lib/utils';

export const Progress = ({ value, className, indicatorClassName, ...p }: React.ComponentProps<typeof P.Root> & { indicatorClassName?: string }) => (
  <P.Root value={value} className={cn('relative h-2 w-full overflow-hidden rounded-full bg-secondary', className)} {...p}>
    <P.Indicator className={cn('h-full brand-gradient transition-all', indicatorClassName)} style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
  </P.Root>
);
