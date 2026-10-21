import { HttpException, HttpStatus } from '@nestjs/common';

export type AiErrorCode =
  | 'AI_DISABLED'
  | 'AI_NOT_CONFIGURED'
  | 'AI_AUTH_FAILED'
  | 'AI_MODEL_UNAVAILABLE'
  | 'AI_RATE_LIMITED'
  | 'AI_TIMEOUT'
  | 'AI_NETWORK'
  | 'AI_PROVIDER_ERROR'
  | 'AI_EMPTY_RESPONSE'
  | 'AI_INVALID_OUTPUT'
  | 'AI_BLOCKED';

const STATUS: Record<AiErrorCode, number> = {
  AI_DISABLED: HttpStatus.SERVICE_UNAVAILABLE,
  AI_NOT_CONFIGURED: HttpStatus.SERVICE_UNAVAILABLE,
  AI_AUTH_FAILED: HttpStatus.BAD_GATEWAY,
  AI_MODEL_UNAVAILABLE: HttpStatus.BAD_GATEWAY,
  AI_RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  AI_TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
  AI_NETWORK: HttpStatus.BAD_GATEWAY,
  AI_PROVIDER_ERROR: HttpStatus.BAD_GATEWAY,
  AI_EMPTY_RESPONSE: HttpStatus.BAD_GATEWAY,
  AI_INVALID_OUTPUT: HttpStatus.BAD_GATEWAY,
  AI_BLOCKED: HttpStatus.UNPROCESSABLE_ENTITY,
};

/** User-facing messages never contain provider internals or keys. */
const MESSAGE: Record<AiErrorCode, string> = {
  AI_DISABLED: 'AI features are turned off by the administrator. Your readiness, gaps and eligibility are unaffected.',
  AI_NOT_CONFIGURED: 'AI assistance is not configured on this server (no Gemini API key). All deterministic features still work.',
  AI_AUTH_FAILED: 'The AI provider rejected the server credentials. Please contact the administrator.',
  AI_MODEL_UNAVAILABLE: 'The configured AI model is not available for this account. Please contact the administrator.',
  AI_RATE_LIMITED: 'The AI provider rate limit or quota has been reached. Please try again later.',
  AI_TIMEOUT: 'The AI provider took too long to respond. Please try again.',
  AI_NETWORK: 'Could not reach the AI provider. Please check connectivity and try again.',
  AI_PROVIDER_ERROR: 'The AI provider returned an error. Please try again shortly.',
  AI_EMPTY_RESPONSE: 'The AI provider returned an empty response. Please try again.',
  AI_INVALID_OUTPUT: 'The AI response could not be validated, so it was discarded. Please try again.',
  AI_BLOCKED: 'The AI provider declined to process this content.',
};

export class AiError extends HttpException {
  constructor(public readonly code: AiErrorCode, detail?: string) {
    super({ statusCode: STATUS[code], error: code, message: MESSAGE[code], ...(detail ? { detail } : {}), aiUnavailable: true }, STATUS[code]);
  }
}

/** Maps SDK/transport failures to typed errors. Never fabricates a result. */
export function mapProviderError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  const e = err as any;
  const status: number | undefined = e?.status ?? e?.code ?? e?.error?.code;
  const text = String(e?.message ?? e ?? '').toLowerCase();
  if (e?.name === 'AbortError' || text.includes('aborted') || text.includes('timed out') || text.includes('timeout') || e?.code === 'ETIMEDOUT') return new AiError('AI_TIMEOUT');
  if (status === 429 || text.includes('quota') || text.includes('resource_exhausted') || text.includes('rate limit')) return new AiError('AI_RATE_LIMITED');
  if (status === 401 || status === 403 || text.includes('api key') || text.includes('api_key') || text.includes('permission_denied') || text.includes('unauthenticated')) return new AiError('AI_AUTH_FAILED');
  if (status === 404 || (text.includes('model') && (text.includes('not found') || text.includes('not supported')))) return new AiError('AI_MODEL_UNAVAILABLE');
  if (['ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', 'EAI_AGAIN'].includes(e?.code) || text.includes('fetch failed') || text.includes('network') || text.includes('econn')) return new AiError('AI_NETWORK');
  return new AiError('AI_PROVIDER_ERROR');
}
