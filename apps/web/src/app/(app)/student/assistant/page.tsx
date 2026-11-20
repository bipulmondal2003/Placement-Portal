'use client';
import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { AiDisclaimer, AiErrorNotice, AiLabel, AiStatusBanner } from '@/components/student/ai-notice';
import type { Drive, Page } from '@/components/student/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/label';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { cn } from '@/lib/utils';

interface Turn { role: 'user' | 'assistant'; text: string }
interface Feedback { strengths: string[]; missingConcepts: string[]; clarity: string; suggestions: string[]; practiceTopics: string[]; disclaimer: string }

function Chat() {
  const drives = useApi<Page<Drive>>('/drives?limit=50');
  const [driveId, setDriveId] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [turns, busy]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = msg.trim();
    if (!text || busy) return;
    const history = turns.slice(-12);
    setTurns((t) => [...t, { role: 'user', text }]); setMsg(''); setBusy(true); setErr(null);
    try {
      const r = await api.post<{ reply: string }>('/ai/chat', { message: text, driveId: driveId || undefined, history });
      setTurns((t) => [...t, { role: 'assistant', text: r.reply }]);
    } catch (e2) { setErr(e2); } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Ask about your preparation</CardTitle><CardDescription>The assistant sees your own gaps and drive requirements only. It cannot change any score.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <Field label="Focus on a drive (optional)" htmlFor="ch-drive"><Select id="ch-drive" className="max-w-sm" value={driveId} onChange={(e) => setDriveId(e.target.value)}><option value="">No specific drive</option>{drives.data?.items.map((d) => <option key={d._id} value={d._id}>{d.company} · {d.role}</option>)}</Select></Field>
        <div className="h-[380px] space-y-3 overflow-y-auto rounded-md border bg-muted/30 p-3" role="log" aria-live="polite" aria-label="Conversation">
          {turns.length === 0 && <p className="text-sm text-muted-foreground">Try: “What should I study first for this drive?” or “How do I show my React skills as evidence?”</p>}
          {turns.map((t, i) => (
            <div key={i} className={cn('max-w-[85%] whitespace-pre-line rounded-lg px-3 py-2 text-sm', t.role === 'user' ? 'ml-auto bg-primary text-primary-foreground' : 'glass')}>{t.role === 'assistant' && <AiLabel className="mb-1" />}<p>{t.text}</p></div>
          ))}
          {busy && <p className="text-sm text-muted-foreground">Thinking…</p>}
          <div ref={end} />
        </div>
        <AiErrorNotice error={err} />
        <form onSubmit={send} className="flex gap-2">
          <label htmlFor="ch-msg" className="sr-only">Message</label>
          <Input id="ch-msg" value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={1500} placeholder="Type your question" autoComplete="off" />
          <Button type="submit" loading={busy} disabled={!msg.trim()}><Send />Send</Button>
        </form>
        <AiDisclaimer />
      </CardContent>
    </Card>
  );
}

function MockFeedback() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [fb, setFb] = useState<Feedback | null>(null);
  const run = async () => {
    setBusy(true); setErr(null); setFb(null);
    try { setFb(await api.post<Feedback>('/ai/mock-interview/feedback', { question, answer, topic: topic || undefined })); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const List = ({ title, items }: { title: string; items: string[] }) => items.length ? <div><p className="mb-1 text-sm font-medium">{title}</p><ul className="list-disc space-y-0.5 pl-5 text-sm">{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div> : null;
  return (
    <Card>
      <CardHeader><CardTitle>Practice answer feedback</CardTitle><CardDescription>Write your answer to an interview question and get written feedback. This is practice only: it never becomes evidence or changes a skill level.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <Field label="Question" htmlFor="mf-q"><Input id="mf-q" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={800} placeholder="e.g. Explain the difference between a process and a thread" /></Field>
        <Field label="Topic (optional)" htmlFor="mf-t"><Input id="mf-t" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={120} /></Field>
        <Field label="Your answer" htmlFor="mf-a"><Textarea id="mf-a" className="min-h-[160px]" value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={4000} /></Field>
        <Button loading={busy} disabled={question.trim().length < 5 || answer.trim().length < 10} onClick={run}>Get feedback</Button>
        <AiErrorNotice error={err} />
        {fb && (
          <div className="space-y-3 rounded-lg border p-4"><AiLabel />
            <List title="Strengths" items={fb.strengths} /><List title="Concepts you missed" items={fb.missingConcepts} />
            <div><p className="mb-1 text-sm font-medium">Clarity</p><p className="text-sm">{fb.clarity}</p></div>
            <List title="Suggestions" items={fb.suggestions} /><List title="Practice topics" items={fb.practiceTopics} />
            <AiDisclaimer text={fb.disclaimer} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function StudentAssistant() {
  return (
    <>
      <PageHeader title="AI assistant" description="Optional help with preparation. Everything here is advisory; your eligibility, readiness and verified skills are computed by fixed rules." />
      <AiStatusBanner />
      <Tabs defaultValue="chat"><TabsList><TabsTrigger value="chat">Ask a question</TabsTrigger><TabsTrigger value="mock">Practice interview answer</TabsTrigger></TabsList>
        <TabsContent value="chat"><Chat /></TabsContent><TabsContent value="mock"><MockFeedback /></TabsContent></Tabs>
    </>
  );
}
