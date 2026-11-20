'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Brand } from '@/components/app-shell';
import { LogoMark } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { errMessage } from '@/lib/api';
import { HOME, useAuth } from '@/lib/auth';

const DEMO = [
  ['Student', 'student01@demo.edu'],
  ['Faculty mentor', 'faculty1@demo.edu'],
  ['Placement officer', 'officer@demo.edu'],
  ['Placement head', 'head@demo.edu'],
  ['Administrator', 'admin@demo.edu'],
];

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const u = await login(email.trim(), password);
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : HOME[u.role]);
    } catch (err) {
      setError(errMessage(err));
      toast.error('Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-md p-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-muted-foreground">Students, faculty, the placement cell and administrators sign in here.</p>
      <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
        <Field label="Email" htmlFor="email"><Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password" htmlFor="password" error={error}><Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Button type="submit" className="w-full" loading={busy}>Sign in</Button>
      </form>
      <p className="mt-4 text-sm text-muted-foreground">New student? <Link className="text-primary underline-offset-4 hover:underline" href="/register">Create an account</Link>. Recruiter? <Link className="text-primary underline-offset-4 hover:underline" href="/recruiter/login">Use the recruiter portal</Link>.</p>

      <details className="mt-5 rounded-md border p-3 text-sm">
        <summary className="cursor-pointer font-medium">Demo accounts (local seed data)</summary>
        <p className="mt-2 text-xs text-muted-foreground">Created by <code>npm run seed</code>. Password for all: <code>Demo@12345</code>. Development only.</p>
        <ul className="mt-2 space-y-1">
          {DEMO.map(([label, mail]) => (
            <li key={mail}><button type="button" className="text-left text-primary underline-offset-4 hover:underline" onClick={() => { setEmail(mail); setPassword('Demo@12345'); }}>{label}: {mail}</button></li>
          ))}
        </ul>
      </details>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="brand-gradient relative hidden flex-col justify-between p-10 text-white lg:flex">
        <div className="flex items-center gap-3 text-lg font-semibold"><LogoMark className="size-11" />Placement Skill Matcher</div>
        <div>
          <h2 className="max-w-md text-4xl font-bold leading-tight">Prove your skills. Close your gaps. Get placed.</h2>
          <ul className="mt-6 space-y-2 text-white/90">
            <li>• Match your verified skills to 7 target roles</li>
            <li>• Upload certificates for faculty review</li>
            <li>• Practise chat-style mock interviews</li>
          </ul>
        </div>
        <p className="text-xs text-white/80">Independent student project, not an official university portal.</p>
      </aside>
      <main className="grid place-items-center p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="lg:hidden"><Brand /></div>
          <Suspense><LoginForm /></Suspense>
        </div>
      </main>
    </div>
  );
}
