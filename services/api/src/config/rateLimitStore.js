/**
 * Redis-backed rate-limit store selection for @fastify/rate-limit.
 *
 * When REDIS_URL is set, rate-limit counters live in Redis so limits are
 * enforced ACROSS instances (required for horizontal scaling). When it is
 * unset, the plugin keeps its default per-process in-memory store — behaviour
 * is unchanged from before this module existed.
 *
 * Failure philosophy: rate limiting must never take the API down.
 *  - The ioredis client is configured to fail FAST when Redis is unreachable
 *    (`enableOfflineQueue: false`, `maxRetriesPerRequest: 1`) instead of
 *    queueing commands and stalling requests.
 *  - Every registration passes `skipOnError: true` to @fastify/rate-limit, so
 *    a store error means the request is ALLOWED (fail open) rather than 500ing.
 *  - An `error` listener is always attached — an unhandled ioredis 'error'
 *    event would otherwise crash the process.
 *  - `retryStrategy` reconnects forever with capped backoff, so a transient
 *    Redis outage self-heals and distributed limiting resumes automatically.
 */
import Redis from 'ioredis';

export const RATE_LIMIT_NAMESPACE = 'genemap-rate-limit-';

export const REDIS_CLIENT_OPTIONS = {
  // Fail fast on connect instead of hanging request-adjacent work.
  connectTimeout: 2000,
  // One retry per command, then error out (skipOnError turns that into allow).
  maxRetriesPerRequest: 1,
  // Never queue commands while disconnected — reject immediately so requests
  // are not held hostage by a Redis outage.
  enableOfflineQueue: false,
  // Railway private networking (redis.railway.internal) is IPv6-only; family 0
  // resolves both A and AAAA records instead of IPv4-only.
  family: 0,
  // Reconnect forever with capped exponential-ish backoff.
  retryStrategy: (times) => Math.min(times * 500, 15000),
};

/**
 * Create the shared ioredis client for rate limiting, or null when REDIS_URL
 * is not configured (in-memory store keeps being used).
 *
 * @param {object} env - loadEnv() result (reads env.REDIS_URL)
 * @param {object} [opts]
 * @param {object} [opts.logger] - pino-compatible logger (info/warn)
 * @param {new (url: string, options: object) => object} [opts.redisConstructor]
 *   - injectable for tests; defaults to ioredis
 * @returns {object|null}
 */
export function createRateLimitRedis(env, opts = {}) {
  const url = env?.REDIS_URL;
  if (!url) return null;

  const RedisCtor = opts.redisConstructor || Redis;
  const logger = opts.logger || console;

  const client = new RedisCtor(url, { ...REDIS_CLIENT_OPTIONS });

  // REQUIRED: without an 'error' listener, ioredis emits an unhandled 'error'
  // event and crashes the process when Redis is unreachable.
  client.on('error', (err) => {
    logger.warn({ err: { message: err?.message } }, 'rate-limit redis error (failing open to allow)');
  });
  client.on('ready', () => {
    logger.info('rate-limit redis store connected — distributed rate limiting active');
  });

  return client;
}

/**
 * Options to spread into a @fastify/rate-limit registration.
 *
 * With no Redis client this returns {} so the plugin's default in-memory
 * store is used exactly as before. With a client it wires the Redis store,
 * fail-open error handling, and a per-scope key namespace.
 *
 * The `scope` suffix is REQUIRED to differ between registrations that share
 * the client: the Redis store keys on `nameSpace + ip`, so without distinct
 * namespaces the global limiter (100/15m) and the auth limiter (10/15m)
 * would increment the SAME counters and interfere with each other.
 *
 * @param {object|null} redisClient - result of createRateLimitRedis()
 * @param {string} [scope] - e.g. 'auth' for the stricter auth-scope limiter
 * @returns {object}
 */
export function rateLimitStoreOptions(redisClient, scope) {
  if (!redisClient) return {};
  return {
    redis: redisClient,
    nameSpace: scope ? `${RATE_LIMIT_NAMESPACE}${scope}-` : RATE_LIMIT_NAMESPACE,
    // Store failure => allow the request (never 500 because Redis blinked).
    skipOnError: true,
  };
}

/**
 * Human-readable store status for health/readiness reporting.
 * 'memory' when Redis is not configured; otherwise the ioredis connection
 * status ('ready', 'connecting', 'reconnecting', 'close', 'end', ...).
 */
export function rateLimitStoreStatus(redisClient) {
  if (!redisClient) return 'memory';
  return `redis:${redisClient.status || 'unknown'}`;
}
