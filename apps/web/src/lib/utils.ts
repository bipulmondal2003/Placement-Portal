import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fmtDate = (d?: string | Date | null, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  d ? new Intl.DateTimeFormat('en-IN', opts).format(new Date(d)) : '—';

export const fmtDateTime = (d?: string | Date | null) => fmtDate(d, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function daysUntil(d?: string | Date | null) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
}

export const pct = (n?: number | null, digits = 0) => (n === null || n === undefined ? '—' : `${n.toFixed(digits)}%`);
export const num = (n?: number | null, digits = 0) => (n === null || n === undefined ? '—' : n.toFixed(digits));

export const titleCase = (s: string) => s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const LEVELS = ['Not started', 'Aware', 'Beginner', 'Working', 'Proficient', 'Expert'];
export const levelLabel = (n?: number | null) => (n === null || n === undefined ? '—' : (LEVELS[n] ?? String(n)));
