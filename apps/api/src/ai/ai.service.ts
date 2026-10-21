import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClassConstructor } from 'class-transformer';
import { GENAI_CLIENT, GenAiLike } from './ai.client';
import { AiError, mapProviderError } from './ai.errors';
import { extractJson, validateOutput } from './ai.util';
import { SystemConfigService } from '../system-config/system-config.service';

export interface GenerateOpts {
  system: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}

/**
 * Thin, defensive wrapper around Gemini. Responsibilities:
 *  - gate on the admin flag and key presence;
 *  - enforce a hard timeout (AbortSignal + SDK timeout);
 *  - turn every failure into a typed AiError (never a fake "successful" answer);
 *  - validate structured output against a schema before anyone can use it.
 * It has no access to the database: callers pass only the minimal, authorised context.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @Inject(GENAI_CLIENT) private readonly client: GenAiLike | null,
    private readonly config: ConfigService,
    private readonly sysConfig: SystemConfigService,
  ) {}

  get model(): string {
    return this.config.get<string>('GEMINI_MODEL') ?? 'gemini-3.8-flash';
  }

  get configured(): boolean {
    return !!this.client;
  }

  async status(verify = false) {
    const cfg = await this.sysConfig.get();
    const out: Record<string, any> = { enabled: cfg.aiFeaturesEnabled, configured: this.configured, model: this.model };
    if (verify) {
      if (!this.client?.models.get) out.modelAvailable = null;
      else {
        try {
          await this.client.models.get({ model: this.model });
          out.modelAvailable = true;
        } catch (e) {
          out.modelAvailable = false;
          out.error = mapProviderError(e).code;
        }
      }
    }
    return out;
  }

  private async guard(): Promise<GenAiLike> {
    const cfg = await this.sysConfig.get();
    if (!cfg.aiFeaturesEnabled) throw new AiError('AI_DISABLED');
    if (!this.client) throw new AiError('AI_NOT_CONFIGURED');
    return this.client;
  }

  private async call(opts: GenerateOpts, json: boolean): Promise<string> {
    const client = await this.guard();
    const timeoutMs = this.config.get<number>('AI_TIMEOUT_MS') ?? 30000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await client.models.generateContent({
        model: this.model,
        contents: opts.prompt,
        config: {
          systemInstruction: opts.system,
          temperature: opts.temperature ?? 0.3,
          maxOutputTokens: opts.maxOutputTokens ?? 4096,
          ...(json ? { responseMimeType: 'application/json' } : {}),
          abortSignal: controller.signal,
          httpOptions: { timeout: timeoutMs },
        },
      });
      if (res?.promptFeedback?.blockReason) throw new AiError('AI_BLOCKED');
      const text = (typeof res?.text === 'string' ? res.text : res?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('')) ?? '';
      if (!text.trim()) throw new AiError('AI_EMPTY_RESPONSE');
      return text;
    } catch (err) {
      const mapped = mapProviderError(err);
      if (mapped.code !== 'AI_EMPTY_RESPONSE' && mapped.code !== 'AI_BLOCKED') this.logger.warn(`Gemini call failed: ${mapped.code}`);
      throw mapped;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Free-text reply (chatbot). */
  async generateText(opts: GenerateOpts): Promise<string> {
    return (await this.call(opts, false)).trim();
  }

  /** Structured reply, parsed and validated against `schema`. Invalid output is discarded. */
  async generateStructured<T extends object>(opts: GenerateOpts, schema: ClassConstructor<T>): Promise<T> {
    const raw = await this.call(opts, true);
    return validateOutput(schema, extractJson(raw));
  }
}
