'use client';
import { AlertTriangle, Sparkles } from 'lucide-react';
import { useApi } from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/badge';

/** Specific, actionable copy for every typed AI error the backend can return. */
const AI_MESSAGES: Record<string, string> = {
  AI_DISABLED: 'AI features are switched off by the administrator. Everything else on this page still works.',
  AI_NOT_CONFIGURED: 'AI assistance is not set up on this server yet (no provider key). Use the rule-based tools instead; scores and gaps are unaffected.',
  AI_AUTH_FAILED: 'The AI provider rejected the server credentials. This is not something you can fix; please tell your placement cell.',
  AI_MODEL_UNAVAILABLE: 'The configured AI model is not available. Please tell your placement cell, and use the non-AI options meanwhile.',
  AI_RATE_LIMITED: 'The AI provider limit has been reached. Wait a minute and try again.',
  AI_TIMEOUT: 'The AI provider took too long to answer. Try again; a shorter input can help.',
  AI_NETWORK: 'The server could not reach the AI provider. Check back shortly and try again.',
  AI_PROVIDER_ERROR: 'The AI provider returned an error. Try again in a moment.',
  AI_EMPTY_RESPONSE: 'The AI provider sent back an empty answer. Try again.',
  AI_INVALID_OUTPUT: 'The AI answer failed validation, so it was discarded rather than shown. Try again.',
  AI_BLOCKED: 'The AI provider declined to process this content. Edit the text and try again.',
};

export function aiErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code && AI_MESSAGES[e.code]) return AI_MESSAGES[e.code];
    if (e.status === 429) return 'Too many AI requests in a short time. Wait a minute and try again.';
    return e.message;
  }
  return e instanceof Error ? e.message : 'Something went wrong. Try again.';
}

export const isAiUnavailable = (e: unknown) => e instanceof ApiError && !!e.code && e.code.startsWith('AI_') && e.code !== 'AI_RATE_LIMITED' && e.code !== 'AI_BLOCKED';

export function AiErrorNotice({ error, children }: { error: unknown; children?: React.ReactNode }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-pending/30 bg-pending-soft p-3 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-pending" aria-hidden />
      <div className="space-y-1">
        <p className="text-foreground">{aiErrorMessage(error)}</p>
        {children}
      </div>
    </div>
  );
}

export function AiLabel({ className }: { className?: string }) {
  return <Badge variant="primary" className={className}><Sparkles className="size-3" />AI-generated, advisory</Badge>;
}

export function AiDisclaimer({ text }: { text?: string }) {
  return (
    <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
      {text ?? 'AI-generated guidance. It does not change your eligibility, readiness score or verified skills.'}
    </p>
  );
}

/** Small banner shown only when AI is off or not configured. */
export function AiStatusBanner() {
  const { data } = useApi<{ enabled: boolean; configured: boolean; model: string }>('/ai/status');
  if (!data || (data.enabled && data.configured)) return null;
  return (
    <div role="status" className="mb-4 flex items-start gap-2 rounded-lg border bg-muted p-3 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <p>
        {!data.enabled ? 'AI features are switched off by the administrator.' : 'AI assistance is not configured on this server.'} AI actions will return an error; rule-based plans, readiness and assessments are unaffected.
      </p>
    </div>
  );
}
