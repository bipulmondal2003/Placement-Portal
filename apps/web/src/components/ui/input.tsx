import * as React from 'react';
import { cn } from '@/lib/utils';

const field = 'flex w-full rounded-md border border-input bg-background/60 px-3 text-sm placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50';
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, type, ...p }, ref) => <input ref={ref} type={type} className={cn(field, 'h-9', className)} {...p} />);
Input.displayName = 'Input';
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => <textarea ref={ref} className={cn(field, 'min-h-[88px] py-2', className)} {...p} />);
Textarea.displayName = 'Textarea';
/** Native select styled like the other inputs: accessible, works on mobile, no JS needed. */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => (
  <select ref={ref} className={cn(field, 'h-9 pr-8', className)} {...p}>{children}</select>
));
Select.displayName = 'Select';
