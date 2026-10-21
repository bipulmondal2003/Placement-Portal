'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Brand } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/label';
import { Input, Select } from '@/components/ui/input';
import { api, errMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const DEPARTMENTS = ['CSE', 'IT', 'ECE', 'EEE', 'MECH', 'CIVIL', 'Other'];

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [f, setF] = useState({ name: '', email: '', password: '', department: 'CSE' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/register', f);
      await login(f.email.trim(), f.password);
      toast.success('Account created');
      router.replace('/student/profile');
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
          <h1 className="text-2xl font-semibold">Create a student account</h1>
          <p className="mt-1 text-sm text-muted-foreground">Faculty, placement staff and recruiters are added by an administrator.</p>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <Field label="Full name" htmlFor="name"><Input id="name" required minLength={2} autoComplete="name" value={f.name} onChange={set('name')} /></Field>
            <Field label="College email" htmlFor="email"><Input id="email" type="email" required autoComplete="username" value={f.email} onChange={set('email')} /></Field>
            <Field label="Department" htmlFor="dept"><Select id="dept" value={f.department} onChange={set('department')}>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</Select></Field>
            <Field label="Password" htmlFor="pw" hint="At least 10 characters, with letters and numbers." error={error}><Input id="pw" type="password" required minLength={10} autoComplete="new-password" value={f.password} onChange={set('password')} /></Field>
            <Button type="submit" className="w-full" loading={busy}>Create account</Button>
          </form>
          <p className="mt-4 text-sm text-muted-foreground">Already registered? <Link className="text-primary underline-offset-4 hover:underline" href="/login">Sign in</Link></p>
        </Card>
      </div>
    </div>
  );
}
