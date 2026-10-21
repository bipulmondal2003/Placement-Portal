import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    variant: {
      default: 'bg-secondary text-secondary-foreground',
      primary: 'bg-accent text-accent-foreground',
      verified: 'bg-verified-soft text-verified',
      pending: 'bg-pending-soft text-pending',
      gap: 'bg-gap-soft text-gap',
      outline: 'border text-muted-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}
export const Badge = ({ className, variant, ...p }: BadgeProps) => <span className={cn(badgeVariants({ variant }), className)} {...p} />;
