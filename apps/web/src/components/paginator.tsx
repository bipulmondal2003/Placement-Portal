import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Paginator({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  if (pages <= 1) return <p className="mt-3 text-xs text-muted-foreground">{total} result{total === 1 ? '' : 's'}</p>;
  return (
    <div className="mt-3 flex items-center justify-between text-sm">
      <span className="text-xs text-muted-foreground">{total} results · page {page} of {pages}</span>
      <div className="flex gap-1">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft /></Button>
        <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight /></Button>
      </div>
    </div>
  );
}
