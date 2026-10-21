import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

export const GENAI_CLIENT = 'GENAI_CLIENT';

/** The slice of the SDK we use. Having an interface keeps the service testable with a stub. */
export interface GenAiLike {
  models: {
    generateContent(params: any): Promise<{ text?: string; candidates?: any[]; promptFeedback?: any }>;
    get?(params: { model: string }): Promise<any>;
  };
}

/**
 * Builds the official @google/genai client once. The key never leaves the backend. When the key is absent
 * the provider yields null and AiService reports AI_NOT_CONFIGURED instead of failing at startup.
 */
export const genAiProvider = {
  provide: GENAI_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): GenAiLike | null => {
    const apiKey = config.get<string>('GEMINI_API_KEY');
    if (!apiKey) return null;
    return new GoogleGenAI({ apiKey }) as unknown as GenAiLike;
  },
};
