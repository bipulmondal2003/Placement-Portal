import type { RedisOptions } from 'ioredis';

/**
 * Single Redis connection strategy for the whole app: REDIS_URL.
 * BullMQ (queues + worker) and the cache client both derive their options from it.
 */
export function redisOptionsFromUrl(url: string): RedisOptions {
  const u = new URL(url);
  const opts: RedisOptions = {
    host: u.hostname,
    port: Number(u.port || 6379),
  };
  if (u.username) opts.username = decodeURIComponent(u.username);
  if (u.password) opts.password = decodeURIComponent(u.password);
  const db = u.pathname && u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0;
  if (Number.isFinite(db) && db > 0) opts.db = db;
  if (u.protocol === 'rediss:') opts.tls = {};
  return opts;
}
