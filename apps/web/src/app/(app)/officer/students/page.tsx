'use client';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { EmptyState, Query } from '@/components/states';
import { Paginator } from '@/components/paginator';
import type { Page } from '@/components/officer/types';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useApi } from '@/lib/hooks';
import { qs } from '@/lib/api';

interface S { _id: string; user: { _id: string; name: string; email: string }; rollNumber?: string; department?: string; graduationYear?: number; cgpa?: number; activeBacklogs?: number; mentor?: { name: string } | null }

export default function OfficerStudents() {
  const [page, setPage] = useState(1); const [department, setDepartment] = useState(''); const [year, setYear] = useState('');
  const q = useApi<Page<S>>(`/students${qs({ page, limit: 20, department, graduationYear: year })}`);
  return (
    <>
      <PageHeader title="Students" description="Academic records, mentors and readiness. Open a student to correct their record or assign a mentor." />
      <div className="mb-3 flex flex-wrap gap-3">
        <div><label htmlFor="sf-d" className="mb-1 block text-xs text-muted-foreground">Department</label><Input id="sf-d" className="w-40" value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1); }} placeholder="e.g. CSE" /></div>
        <div><label htmlFor="sf-y" className="mb-1 block text-xs text-muted-foreground">Graduation year</label><Input id="sf-y" type="number" className="w-36" value={year} onChange={(e) => { setYear(e.target.value); setPage(1); }} placeholder="e.g. 2027" /></div>
      </div>
      <Query q={q} rows={5}>
        {(d) => d.items.length === 0 ? <EmptyState title="No students match" /> : (
          <><Card><ul className="divide-y">{d.items.map((s) => (
            <li key={s._id}><Link href={`/officer/students/${s.user._id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-muted/50"><div><p className="font-medium">{s.user.name}</p><p className="text-xs text-muted-foreground">{s.rollNumber ?? 'no roll number'} · {s.department ?? '—'} · {s.graduationYear ?? '—'} · CGPA {s.cgpa ?? '—'} · {s.activeBacklogs ?? 0} backlogs</p></div><span className="text-xs text-muted-foreground">Mentor: {s.mentor?.name ?? 'none'}</span></Link></li>
          ))}</ul></Card><Paginator page={d.page} pages={d.pages} total={d.total} onPage={setPage} /></>
        )}
      </Query>
    </>
  );
}
