'use client';
import Link from 'next/link';
import { Clock3 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState, Query } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useApi } from '@/lib/hooks';
import { daysUntil, fmtDateTime, titleCase } from '@/lib/utils';

interface Grant { driveId: string; company: string; role: string; status: string; driveDate?: string; accessExpiresAt: string; releasedFields: string[] }

export default function RecruiterHome() {
  const q = useApi<Grant[]>('/recruiter/drives');
  return (
    <>
      <PageHeader title="Your drives" description="Access is granted per drive for a limited time. Open a drive to search the candidates the placement cell released to you." />
      <Query q={q} rows={3}>
        {(rows) => rows.length === 0 ? <EmptyState title="No active access" description="You have no active grants. Ask the placement cell to release a drive to you." /> : (
          <div className="grid gap-4 md:grid-cols-2">
            {rows.map((g) => {
              const left = daysUntil(g.accessExpiresAt);
              return (
                <Link key={g.driveId} href={`/recruiter/drives/${g.driveId}`} className="group">
                  <Card className="h-full space-y-3 p-5 transition-colors group-hover:border-primary/50">
                    <div><h2 className="text-lg font-semibold">{g.company}</h2><p className="text-sm text-muted-foreground">{g.role}</p></div>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="size-3.5" aria-hidden />Access ends {fmtDateTime(g.accessExpiresAt)}{left !== null && left >= 0 ? ` (${left} day${left === 1 ? '' : 's'})` : ''}</p>
                    <div className="flex flex-wrap gap-1.5">{g.releasedFields.map((f) => <Badge key={f}>{titleCase(f)}</Badge>)}</div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </Query>
    </>
  );
}
