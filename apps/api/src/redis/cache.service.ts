import { Inject, Injectable, Logger } from '@nestjs/common';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/** Minimal subset of ioredis used here (also makes the service trivially testable with a fake). */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', ttl: number): Promise<unknown>;
  incr(key: string): Promise<number>;
  del(...keys: string[]): Promise<number>;
}

/**
 * Namespaced, versioned cache. MongoDB stays the source of truth:
 *  - every read/write failure degrades to "cache miss" (never breaks a request);
 *  - invalidation bumps a per-namespace version so stale keys are never read again (they expire via TTL);
 *  - callers must only cache NON-private, reusable data (taxonomy, aggregates).
 *    Per-user private data is never cached under a shared key.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisLike) {}

  private async version(ns: string): Promise<string> {
    try {
      return (await this.redis.get(`prp:cache:v:${ns}`)) ?? '0';
    } catch {
      return '0';
    }
  }

  async getOrSet<T>(ns: string, key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const v = await this.version(ns);
    const fullKey = `prp:cache:${ns}:${v}:${key}`;
    try {
      const hit = await this.redis.get(fullKey);
      if (hit !== null && hit !== undefined) return JSON.parse(hit) as T;
    } catch (err) {
      this.logger.warn(`cache read failed (${ns}): ${(err as Error).message}`);
    }
    const value = await loader();
    try {
      await this.redis.set(fullKey, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn(`cache write failed (${ns}): ${(err as Error).message}`);
    }
    return value;
  }

  /** Invalidate every key in a namespace. */
  async invalidate(...namespaces: string[]): Promise<void> {
    for (const ns of namespaces) {
      try {
        await this.redis.incr(`prp:cache:v:${ns}`);
      } catch (err) {
        this.logger.warn(`cache invalidate failed (${ns}): ${(err as Error).message}`);
      }
    }
  }
}
