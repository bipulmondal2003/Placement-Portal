import { plainToInstance, ClassConstructor } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AiError } from './ai.errors';

/**
 * Untrusted text (resume contents, free-text answers, chat messages) is data, never instructions.
 * We strip control characters, cap the length and neutralise our own delimiter tags so the content
 * cannot close the data block and masquerade as instructions.
 */
export function sanitizeUntrusted(text: string, max: number): string {
  return String(text ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/<\/?\s*(resume_text|student_answer|user_message|context|system|instructions)\s*>/gi, ' ')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, max);
}

/** Pulls the JSON object out of a model reply (handles ```json fences and stray prose). */
export function extractJson(raw: string): unknown {
  const text = raw.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start < 0) throw new AiError('AI_INVALID_OUTPUT', 'no JSON found');
  const open = candidate[start];
  const close = open === '{' ? '}' : ']';
  const end = candidate.lastIndexOf(close);
  if (end <= start) throw new AiError('AI_INVALID_OUTPUT', 'unterminated JSON');
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new AiError('AI_INVALID_OUTPUT', 'malformed JSON');
  }
}

/** Validates parsed model output against a class-validator schema; unknown properties are stripped. */
export function validateOutput<T extends object>(cls: ClassConstructor<T>, data: unknown): T {
  if (data === null || typeof data !== 'object') throw new AiError('AI_INVALID_OUTPUT', 'not an object');
  const inst = plainToInstance(cls, data, { enableImplicitConversion: false });
  const errors = validateSync(inst as object, { whitelist: true, forbidUnknownValues: true });
  if (errors.length) {
    const first = errors[0];
    throw new AiError('AI_INVALID_OUTPUT', `${first.property}: ${Object.values(first.constraints ?? {})[0] ?? 'invalid'}`);
  }
  return inst;
}
