import Link from 'next/link';
import { Brand } from '@/components/app-shell';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="glass-strong sticky top-3 z-30 mx-3 mt-3 flex max-w-[1200px] items-center justify-between rounded-xl px-4 py-3 sm:px-6 xl:mx-auto">
        <Brand />
        <nav className="flex items-center gap-1" aria-label="Site">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex"><Link href="/recruiter/login">Recruiter portal</Link></Button>
          <ThemeToggle />
          <Button asChild variant="outline" size="sm"><Link href="/login">Sign in</Link></Button>
        </nav>
      </header>
      <div id="main">{children}</div>
      <footer className="mx-auto mt-24 max-w-[1200px] px-4 pb-10 sm:px-6">
        <div className="glass rounded-2xl p-6 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Placement Skill Matcher &amp; Readiness Analyser</p>
          <p className="mt-1">An independent student project. It is not affiliated with, endorsed by or operated by any university, and it is not an official placement portal. Scores are calculated by the platform; AI only explains them.</p>
        </div>
      </footer>
    </div>
  );
}
