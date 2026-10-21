'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, ShieldCheck } from 'lucide-react';
import { Brand } from '@/components/app-shell';
import { ThemeToggle } from '@/components/theme-toggle';
import { LoadingBlock } from '@/components/states';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';

/** Recruiter portal: its own session cookie, its own minimal chrome, no links into the main app. */
export default function RecruiterPortalLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && (!user || user.role !== 'recruiter')) router.replace('/recruiter/login');
  }, [loading, user, router]);
  if (loading || !user || user.role !== 'recruiter') return <div className="mx-auto max-w-3xl p-8"><LoadingBlock /></div>;
  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Brand href="/recruiter" />
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user.name}{user.company ? ` · ${user.company}` : ''}</span>
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={async () => { await logout(); router.replace('/recruiter/login'); }}><LogOut />Sign out</Button>
          </div>
        </div>
        <p className="border-t bg-muted/50 px-4 py-1.5 text-center text-xs text-muted-foreground sm:px-6"><ShieldCheck className="mr-1 inline size-3.5" aria-hidden />You only see the candidates and fields the placement cell has released to you for a limited time. Every view is logged.</p>
      </header>
      <main id="main" className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:py-8">{children}</main>
    </div>
  );
}
