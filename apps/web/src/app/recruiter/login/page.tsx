'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Brand } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { errMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function RecruiterLogin() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password, 'recruiter');
      router.replace('/recruiter');
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-md space-y-6">
        <Brand />
        <Card className="p-6">
          <h1 className="text-2xl font-semibold">Recruiter portal</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sessions last 30 minutes. You only see candidates registered for drives you have been granted.</p>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <Field label="Work email" htmlFor="email"><Input id="email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Password" htmlFor="pw" error={error}><Input id="pw" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <Button type="submit" className="w-full" loading={busy}>Sign in to the portal</Button>
          </form>
          <details className="mt-5 rounded-md border p-3 text-sm">
            <summary className="cursor-pointer font-medium">Demo recruiter accounts (local seed data)</summary>
            <p className="mt-2 text-xs text-muted-foreground">Password: <code>Demo@12345</code></p>
            <ul className="mt-2 space-y-1">
              {['recruiter@acme.demo', 'recruiter@globex.demo', 'recruiter@nogrant.demo'].map((m) => (
                <li key={m}><button type="button" className="text-primary underline-offset-4 hover:underline" onClick={() => { setEmail(m); setPassword('Demo@12345'); }}>{m}</button></li>
              ))}
            </ul>
          </details>
          <p className="mt-4 text-sm text-muted-foreground"><Link className="text-primary underline-offset-4 hover:underline" href="/login">Back to the main sign-in</Link></p>
        </Card>
      </div>
    </div>
  );
}
