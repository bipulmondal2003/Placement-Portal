'use client';
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { qs } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { TaxSkill } from './types';

/** Synonym-aware skill search backed by GET /skills?q= (the API resolves synonyms like "js" -> JavaScript). */
export function SkillPicker({ onPick, exclude = [], label = 'Search skills', id = 'skill-search' }: { onPick: (s: TaxSkill) => void; exclude?: string[]; label?: string; id?: string }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isLoading, error } = useApi<TaxSkill[]>(`/skills${qs({ q: debounced })}`);
  const rows = (data ?? []).filter((s) => !exclude.includes(s.id)).slice(0, 8);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
        <Input id={id} className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try a name or alias, for example js, k8s or postgres" autoComplete="off" />
      </div>
      <div aria-live="polite" className="text-xs text-muted-foreground">
        {isLoading ? 'Searching…' : error ? 'Could not search skills. Try again.' : rows.length === 0 ? 'No matching skills.' : `${rows.length} suggestion${rows.length === 1 ? '' : 's'}${debounced ? '' : ' (popular first). Type to narrow down'}`}
      </div>
      {rows.length > 0 && (
        <ul className="max-h-56 divide-y overflow-y-auto rounded-md border bg-card">
          {rows.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => onPick(s)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent">
                <span className="min-w-0">
                  <span className="font-medium">{s.name}</span>
                  {s.synonyms?.length > 0 && <span className="ml-2 text-xs text-muted-foreground">{s.synonyms.slice(0, 3).join(', ')}</span>}
                </span>
                <Badge variant="outline">{s.category}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
