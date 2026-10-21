'use client';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { EmptyState, Query } from '@/components/states';
import { Paginator } from '@/components/paginator';
import { DriveStatusBadge, RegistrationBadge } from '@/components/status-badges';
import { Card } from '@/components/ui/card';
import { useApi } from '@/lib/hooks';
import { qs } from '@/lib/api';
import { daysUntil, fmtDate } from '@/lib/utils';

interface Drive { _id: string; company: string; role: string; description?: string; status: string; deadline: string; location?: string; package?: string; myRegistration?: { status: string } | null }
interface Page { items: Drive[]; total: number; page: number; pages: number }

export default function StudentDrives() {
  const [page, setPage] = useState(1);
  const q = useApi<Page>(`/drives${qs({ page, limit: 12 })}`);
  return (
    <>
      <PageHeader title="Drives" description="Open a drive to see whether you are eligible, how ready you are and what to work on." />
      <Query q={q} rows={4}>
        {(d) => d.items.length === 0 ? <EmptyState title="No drives yet" description="Published drives will show up here." /> : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {d.items.map((x) => {
                const n = daysUntil(x.deadline);
                return (
                  <Link key={x._id} href={`/student/drives/${x._id}`} className="group">
                    <Card className="h-full p-5 transition-colors group-hover:border-primary/50">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0"><h2 className="truncate text-lg font-semibold">{x.company}</h2><p className="truncate text-sm text-muted-foreground">{x.role}</p></div>
                        <DriveStatusBadge status={x.status} />
                      </div>
                      {x.description && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{x.description}</p>}
                      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>Apply by {fmtDate(x.deadline)}{n !== null && n >= 0 ? ` (${n} day${n === 1 ? '' : 's'})` : ''}</span>
                        {x.location && <span>{x.location}</span>}
                        {x.package && <span>{x.package}</span>}
                        {x.myRegistration && <RegistrationBadge status={x.myRegistration.status} />}
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
            <Paginator page={d.page} pages={d.pages} total={d.total} onPage={setPage} />
          </>
        )}
      </Query>
    </>
  );
}
