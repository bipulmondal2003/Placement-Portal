'use client';
import { PageHeader } from '@/components/page-header';
import { AccessLog } from '@/components/officer/access-log';
import { Section } from '@/components/officer/kit';

export default function AdminAccess() {
  return (
    <>
      <PageHeader title="Recruiter access log" description="Read-only record of every recruiter portal request, including denied ones." />
      <Section title="Activity"><AccessLog /></Section>
    </>
  );
}
