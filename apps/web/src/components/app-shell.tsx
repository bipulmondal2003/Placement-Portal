'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LogoMark } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { LoadingBlock } from '@/components/states';
import { HOME, useAuth, type Role } from '@/lib/auth';
import { NAV, ROLE_LABEL } from '@/lib/nav';
import { cn } from '@/lib/utils';

export function Brand({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold">
      <LogoMark className="size-9 shrink-0" />
      <span className="leading-tight">Placement Skill Matcher<br /><span className="text-xs font-normal text-muted-foreground">Readiness Analyser</span></span>
    </Link>
  );
}

/** Which role-prefixed areas a role may open (the API enforces the real rules; this keeps people out of dead-end pages). */
const AREAS: Record<string, Role[]> = {
  '/student': ['student'],
  '/faculty': ['faculty'],
  '/officer': ['placement_officer', 'placement_head'],
  '/head': ['placement_head'],
  '/admin': ['admin'],
};

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (user.role === 'recruiter') router.replace('/recruiter');
    else {
      const area = '/' + pathname.split('/')[1];
      const allowed = AREAS[area];
      if (allowed && !allowed.includes(user.role)) router.replace(HOME[user.role]);
    }
  }, [loading, user, pathname, router]);

  useEffect(() => setOpen(false), [pathname]);

  if (loading || !user || user.role === 'recruiter') {
    return <div className="mx-auto max-w-3xl p-8"><LoadingBlock /></div>;
  }
  const items = NAV[user.role];

  const Nav = (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {items.map((it) => {
        const active = pathname === it.href || (it.href !== HOME[user.role] && pathname.startsWith(it.href + '/')) || (it.href !== HOME[user.role] && pathname === it.href);
        const exact = items.every((o) => o === it || !o.href.startsWith(it.href + '/') || !pathname.startsWith(o.href));
        const isActive = active && exact;
        return (
          <Link key={it.href} href={it.href} aria-current={isActive ? 'page' : undefined} className={cn('flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors [&_svg]:size-4', isActive ? 'bg-accent font-medium text-accent-foreground shadow-[inset_3px_0_0_hsl(var(--brand))]' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
            <it.icon aria-hidden />{it.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="sticky top-3 hidden flex-col gap-6 glass-strong m-3 mr-0 rounded-xl p-4 lg:flex lg:h-[calc(100vh-1.5rem)]">
        <Brand href={HOME[user.role]} />
        {Nav}
        <div className="mt-auto space-y-3 border-t pt-4">
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{ROLE_LABEL[user.role]}{user.department ? ` · ${user.department}` : ''}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="flex-1" onClick={async () => { await logout(); router.replace('/login'); }}><LogOut />Sign out</Button>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between glass-strong px-4 py-2.5 lg:hidden">
          <Brand href={HOME[user.role]} />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="icon" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? <X /> : <Menu />}</Button>
          </div>
        </header>
        {open && (
          <div className="glass-strong border-t-0 p-3 lg:hidden">
            {Nav}
            <Button variant="outline" size="sm" className="mt-3 w-full" onClick={async () => { await logout(); router.replace('/login'); }}><LogOut />Sign out</Button>
          </div>
        )}
        <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
