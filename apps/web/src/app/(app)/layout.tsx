import { AppShell } from '@/components/app-shell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell><div id="main">{children}</div></AppShell>;
}
