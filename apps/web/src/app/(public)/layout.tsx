import Link from 'next/link';
import { Brand } from '@/components/app-shell';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-4 sm:px-6">
        <Brand />
        <nav className="flex items-center gap-1" aria-label="Site">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex"><Link href="/recruiter/login">Recruiter portal</Link></Button>
          <ThemeToggle />
          <Button asChild variant="outline" size="sm"><Link href="/login">Sign in</Link></Button>
        </nav>
      </header>
      <div id="main">{children}</div>
      <footer className="mx-auto mt-24 max-w-[1200px] border-t px-4 py-8 text-sm text-muted-foreground sm:px-6">
        Built as a college project. Scores are calculated by the platform; AI only explains them.
      </footer>
    </div>
  );
}
