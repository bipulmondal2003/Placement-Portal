import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/schibsted-grotesk';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: { default: 'Placement Skill Matcher', template: '%s · Placement Skill Matcher' },
  description: 'Evidence-based placement readiness and skill-gap analysis for campus placements.',
};
export const viewport: Viewport = { themeColor: [{ media: '(prefers-color-scheme: dark)', color: '#0a0f1f' }, { media: '(prefers-color-scheme: light)', color: '#f1f4fa' }] };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">Skip to content</a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
