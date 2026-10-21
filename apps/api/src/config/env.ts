export interface AppEnv {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  MONGODB_URI: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  RECRUITER_JWT_EXPIRES_IN: string;
  FRONTEND_URL: string;
  REDIS_URL: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  BATCH_CONCURRENCY: number;
  RECALC_DEBOUNCE_MS: number;
  THROTTLE_LIMIT: number;
  RECRUITER_THROTTLE_LIMIT: number;
  EMBED_WORKER: boolean;
  AI_TIMEOUT_MS: number;
}

const WEAK_SECRETS = ['change-me', 'secret', 'changeme', 'password'];

/**
 * Validates and normalises process env at startup. Throws a single error that lists
 * every problem so a misconfigured deployment fails fast with a clear message.
 */
export function validateEnv(raw: Record<string, any>): AppEnv {
  const errors: string[] = [];
  const str = (key: string, fallback?: string): string => {
    const v = raw[key];
    if (v === undefined || v === null || String(v).trim() === '') {
      if (fallback !== undefined) return fallback;
      errors.push(`${key} is required but missing`);
      return '';
    }
    return String(v).trim();
  };
  const num = (key: string, fallback: number, min = 0): number => {
    const v = raw[key];
    if (v === undefined || String(v).trim() === '') return fallback;
    const n = Number(v);
    if (!Number.isFinite(n) || n < min) {
      errors.push(`${key} must be a number >= ${min} (got "${v}")`);
      return fallback;
    }
    return n;
  };

  const nodeEnv = str('NODE_ENV', 'development') as AppEnv['NODE_ENV'];
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    errors.push(`NODE_ENV must be development|production|test (got "${nodeEnv}")`);
  }

  const jwtSecret = str('JWT_SECRET');
  if (jwtSecret) {
    if (jwtSecret.length < 32) errors.push('JWT_SECRET must be at least 32 characters');
    if (nodeEnv === 'production' && WEAK_SECRETS.some((w) => jwtSecret.toLowerCase().startsWith(w))) {
      errors.push('JWT_SECRET looks like a placeholder; set a strong random value in production');
    }
  }

  const mongo = str('MONGODB_URI');
  if (mongo && !/^mongodb(\+srv)?:\/\//.test(mongo)) errors.push('MONGODB_URI must start with mongodb:// or mongodb+srv://');
  const redis = str('REDIS_URL');
  if (redis && !/^rediss?:\/\//.test(redis)) errors.push('REDIS_URL must start with redis:// or rediss://');

  const embedDefault = nodeEnv === 'production' ? 'false' : 'true';

  const env: AppEnv = {
    NODE_ENV: nodeEnv,
    PORT: num('PORT', 4000, 1),
    MONGODB_URI: mongo,
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: str('JWT_EXPIRES_IN', '8h'),
    RECRUITER_JWT_EXPIRES_IN: str('RECRUITER_JWT_EXPIRES_IN', '30m'),
    FRONTEND_URL: str('FRONTEND_URL', 'http://localhost:3000'),
    REDIS_URL: redis,
    GEMINI_API_KEY: str('GEMINI_API_KEY', ''),
    GEMINI_MODEL: str('GEMINI_MODEL', 'gemini-3.8-flash'),
    BATCH_CONCURRENCY: num('BATCH_CONCURRENCY', 4, 1),
    RECALC_DEBOUNCE_MS: num('RECALC_DEBOUNCE_MS', 3000, 0),
    THROTTLE_LIMIT: num('THROTTLE_LIMIT', 120, 1),
    RECRUITER_THROTTLE_LIMIT: num('RECRUITER_THROTTLE_LIMIT', 20, 1),
    EMBED_WORKER: String(raw.EMBED_WORKER ?? embedDefault).toLowerCase() === 'true',
    AI_TIMEOUT_MS: num('AI_TIMEOUT_MS', 30000, 1000),
  };

  if (errors.length) {
    throw new Error(
      `Invalid environment configuration:\n - ${errors.join('\n - ')}\nSee .env.example for the expected variables.`,
    );
  }
  return env;
}
