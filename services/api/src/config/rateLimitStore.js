import Redis from 'ioredis';

/**
 * Redis-backed rate-limit store selection for @fastify/rate-limit.
 *
 * When REDIS_URL is set, counters live in Redis so limits apply across every
 * API instance. The plugin still uses skipOnError so a Redis outage can never
 * turn into a blanket 500 outage. A separate bounded emergency hook takes over
 * with per-instance counters whenever the Redis client is not healthy, so the
 * application remains protected instead of silently becoming unlimited.
 */

export const RATE_LIMIT_NAMESPACE = 'genemap-rate-limit-';
export const DEFAULT_RATE_LIMIT_ALERT_INTERVAL_MS = 5 * 60 * 1000;
export const DEFAULT_EMERGENCY_MAX_ENTRIES = 10_000;
export const RATE_LIMIT_BYPASS_PATHS = new Set(['/healthz', '/readyz', '/health']);

const RATE_LIMIT_HEALTH = Symbol('genemapRateLimitHealth');

export const REDIS_CLIENT_OPTIONS = {
  // Fail fast on connect instead of hanging request-adjacent work.
  connectTimeout: 2000,
  // One retry per command, then error out (skipOnError lets the request move to
  // the emergency limiter rather than returning 500).
  maxRetriesPerRequest: 1,
  // Never queue commands while disconnected.
  enableOfflineQueue: false,
  // Railway private networking can be IPv6-only. family 0 resolves A and AAAA.
  family: 0,
  // Reconnect forever with capped backoff.
  retryStrategy: (times) => Math.min(times * 500, 15000),
};

function writeLog(logger, level, fields, message) {
  const fn = logger?.[level] || logger?.warn || logger?.log;
  if (typeof fn === 'function') fn.call(logger, fields, message);
}

function healthState(redisClient) {
  return redisClient?.[RATE_LIMIT_HEALTH] || null;
}

function requestIdentity(request) {
  return (
    request?.ip ||
    request?.socket?.remoteAddress ||
    request?.raw?.socket?.remoteAddress ||
    'unknown'
  );
}

function setRateHeaders(reply, { max, count, resetAt }) {
  if (!reply || typeof reply.header !== 'function') return;
  reply.header('x-ratelimit-limit', String(max));
  reply.header('x-ratelimit-remaining', String(Math.max(0, max - count)));
  reply.header('x-ratelimit-reset', String(Math.ceil(resetAt / 1000)));
}

/**
 * Health and readiness endpoints must remain probeable even when rate-limit
 * infrastructure is degraded. Both @fastify/rate-limit's allowList callback and
 * the emergency hook use this one predicate so their bypass rules cannot drift.
 */
export function shouldBypassRateLimit(request) {
  const rawPath =
    request?.routeOptions?.url || request?.url || request?.raw?.url || '';
  const pathname = String(rawPath).split('?', 1)[0];
  return RATE_LIMIT_BYPASS_PATHS.has(pathname);
}

/**
 * Create the shared ioredis client, or null when Redis is not configured.
 * Operational state is attached privately to the client so readiness and the
 * emergency limiter can distinguish a healthy connection from a recent error
 * whose public ioredis status has not changed yet.
 */
export function createRateLimitRedis(env, opts = {}) {
  const url = env?.REDIS_URL;
  if (!url) return null;

  const RedisCtor = opts.redisConstructor || Redis;
  const logger = opts.logger || console;
  const now = opts.now || Date.now;
  const alertIntervalMs =
    opts.alertIntervalMs ?? DEFAULT_RATE_LIMIT_ALERT_INTERVAL_MS;

  const client = new RedisCtor(url, { ...REDIS_CLIENT_OPTIONS });
  const state = {
    degraded: false,
    degradedSince: null,
    lastAlertAt: 0,
    lastReason: null,
    shuttingDown: false,
  };
  Object.defineProperty(client, RATE_LIMIT_HEALTH, {
    value: state,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  const markDegraded = (reason, err) => {
    // Expected close/end events during a graceful process shutdown are not an
    // outage and must not page operators while the instance is terminating.
    if (state.shuttingDown) return;

    const at = now();
    const firstAlert = !state.degraded;
    state.degraded = true;
    state.degradedSince ??= at;
    state.lastReason = reason;

    if (firstAlert || at - state.lastAlertAt >= alertIntervalMs) {
      state.lastAlertAt = at;
      writeLog(
        logger,
        'error',
        {
          event: 'rate_limit_redis_degraded',
          redisStatus: client.status || 'unknown',
          reason,
          err: err ? { message: err.message } : undefined,
          emergencyLimiter: 'active-per-instance',
        },
        'RATE_LIMIT_DEGRADED: Redis is unavailable; emergency per-instance limiting is active'
      );
    }
  };

  const markReady = () => {
    const recovered = state.degraded;
    const recoveredAfterMs = state.degradedSince
      ? Math.max(0, now() - state.degradedSince)
      : 0;

    state.degraded = false;
    state.degradedSince = null;
    state.lastAlertAt = 0;
    state.lastReason = null;

    if (recovered) {
      writeLog(
        logger,
        'info',
        {
          event: 'rate_limit_redis_recovered',
          redisStatus: client.status || 'ready',
          recoveredAfterMs,
          emergencyLimiter: 'inactive',
        },
        'Rate-limit Redis recovered; distributed limiting is active again'
      );
    } else {
      writeLog(
        logger,
        'info',
        { event: 'rate_limit_redis_ready', redisStatus: client.status || 'ready' },
        'Rate-limit Redis connected; distributed limiting is active'
      );
    }
  };

  // An error listener is mandatory. EventEmitter would otherwise treat an
  // unhandled ioredis error as fatal to the process.
  client.on('error', (err) => markDegraded('error', err));
  client.on('close', () => markDegraded('close'));
  client.on('reconnecting', () => markDegraded('reconnecting'));
  client.on('end', () => markDegraded('end'));
  client.on('ready', markReady);

  return client;
}

/** Suppress expected Redis close/end alerts during graceful app shutdown. */
export function markRateLimitRedisShuttingDown(redisClient) {
  const state = healthState(redisClient);
  if (state) state.shuttingDown = true;
}

/**
 * Options for @fastify/rate-limit. Redis errors are skipped by the plugin so
 * requests can proceed to the emergency per-instance limiter instead of 500ing.
 */
export function rateLimitStoreOptions(redisClient, scope) {
  if (!redisClient) return {};
  return {
    redis: redisClient,
    nameSpace: scope ? `${RATE_LIMIT_NAMESPACE}${scope}-` : RATE_LIMIT_NAMESPACE,
    skipOnError: true,
  };
}

/** True when Redis can currently enforce distributed limits. */
export function isRateLimitRedisHealthy(redisClient) {
  if (!redisClient) return true;
  const state = healthState(redisClient);
  return redisClient.status === 'ready' && state?.degraded !== true;
}

/** Backward-compatible compact status used by existing readiness consumers. */
export function rateLimitStoreStatus(redisClient) {
  if (!redisClient) return 'memory';
  return `redis:${redisClient.status || 'unknown'}`;
}

/**
 * Structured protection status for operations and readiness reporting.
 * Redis is not a hard dependency because emergency limiting remains active.
 */
export function rateLimitProtectionStatus(redisClient) {
  if (!redisClient) {
    return {
      mode: 'memory',
      distributed: false,
      emergency: false,
      redisStatus: 'not-configured',
      degradedSince: null,
    };
  }

  const state = healthState(redisClient);
  const healthy = isRateLimitRedisHealthy(redisClient);
  return {
    mode: healthy ? 'redis' : 'emergency-memory',
    distributed: healthy,
    emergency: !healthy,
    redisStatus: redisClient.status || 'unknown',
    degradedSince: state?.degradedSince
      ? new Date(state.degradedSince).toISOString()
      : null,
  };
}

/**
 * Build an onRequest hook that enforces a fixed-window, per-instance limit only
 * while configured Redis protection is unavailable. Counters are bounded and
 * cleared on the Redis ready event, so a later outage starts with a clean local
 * window even when no request arrives during the healthy interval.
 */
export function createEmergencyRateLimitHook({
  redisClient,
  scope = 'global',
  max,
  timeWindowMs,
  now = Date.now,
  maxEntries = DEFAULT_EMERGENCY_MAX_ENTRIES,
  skip = () => false,
}) {
  if (!Number.isInteger(max) || max < 1) {
    throw new TypeError('Emergency rate-limit max must be a positive integer');
  }
  if (!Number.isFinite(timeWindowMs) || timeWindowMs <= 0) {
    throw new TypeError('Emergency rate-limit timeWindowMs must be positive');
  }
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new TypeError('Emergency rate-limit maxEntries must be a positive integer');
  }
  if (typeof skip !== 'function') {
    throw new TypeError('Emergency rate-limit skip must be a function');
  }

  const windows = new Map();
  let emergencyWasActive = false;

  const clearEmergencyState = () => {
    windows.clear();
    emergencyWasActive = false;
  };
  if (redisClient && typeof redisClient.on === 'function') {
    redisClient.on('ready', clearEmergencyState);
  }

  const prune = (at) => {
    for (const [key, entry] of windows) {
      if (entry.resetAt <= at) windows.delete(key);
    }
    while (windows.size >= maxEntries) {
      const oldest = windows.keys().next().value;
      if (oldest === undefined) break;
      windows.delete(oldest);
    }
  };

  return function emergencyRateLimit(request, reply, done) {
    if (skip(request)) {
      if (typeof done === 'function') done();
      return;
    }

    const active = Boolean(redisClient) && !isRateLimitRedisHealthy(redisClient);

    if (!active) {
      if (emergencyWasActive) clearEmergencyState();
      if (typeof done === 'function') done();
      return;
    }

    emergencyWasActive = true;
    const at = now();
    const key = `${scope}:${requestIdentity(request)}`;
    let entry = windows.get(key);

    if (!entry || entry.resetAt <= at) {
      prune(at);
      entry = { count: 0, resetAt: at + timeWindowMs };
      windows.set(key, entry);
    }

    if (entry.count >= max) {
      setRateHeaders(reply, { max, count: entry.count, resetAt: entry.resetAt });
      if (typeof reply?.header === 'function') {
        reply.header(
          'retry-after',
          String(Math.max(1, Math.ceil((entry.resetAt - at) / 1000)))
        );
      }
      reply.code(429).send({
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please retry later.',
      });
      return;
    }

    entry.count += 1;
    setRateHeaders(reply, { max, count: entry.count, resetAt: entry.resetAt });
    if (typeof done === 'function') done();
  };
}
