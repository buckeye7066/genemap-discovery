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
const MONITORED_REDIS_COMMAND = Symbol('genemapMonitoredRedisCommand');
const RATE_LIMIT_RECOVERED = Symbol('genemapRateLimitRecovered');

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
 * A trailing slash is normalized because load balancers and uptime services may
 * probe either spelling.
 */
export function shouldBypassRateLimit(request) {
  const rawPath =
    request?.routeOptions?.url || request?.url || request?.raw?.url || '';
  const pathname = String(rawPath).split('?', 1)[0];
  const normalized =
    pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return RATE_LIMIT_BYPASS_PATHS.has(normalized);
}

/**
 * A route that opts out of @fastify/rate-limit with `config: { rateLimit: false }`
 * (for example GET /auth/maintenance, which every login-page load fires) must
 * also be exempt from the emergency limiter. Otherwise a Redis outage would
 * silently re-throttle routes an operator deliberately unthrottled — the plugin
 * bucket and the emergency bucket would disagree about the route's policy.
 */
export function isRouteRateLimitDisabled(request) {
  return (
    request?.routeOptions?.config?.rateLimit === false ||
    // Fastify 4 / older plugin shapes keep route config here.
    request?.context?.config?.rateLimit === false ||
    request?.routeConfig?.rateLimit === false
  );
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

    // Always clear local emergency budgets once Redis is authoritative again,
    // not only after a logged degradation. The emergency hook also engages
    // while the client is merely still `connecting` (never `degraded`), and if
    // no request happens to arrive during the healthy window those stale
    // counters would carry straight into the NEXT outage and 429 a caller who
    // had spent nothing in it.
    client.emit(RATE_LIMIT_RECOVERED);
  };

  /**
   * A connection-level ready event proves transport recovery, but it does not
   * prove that a Redis endpoint which rejected the Lua write is writable again.
   * Keep emergency protection active after a command failure until the actual
   * `rateLimit` write command succeeds.
   */
  const markConnectionReady = () => {
    if (state.degraded && String(state.lastReason || '').startsWith('command:')) {
      writeLog(
        logger,
        'warn',
        {
          event: 'rate_limit_redis_ready_awaiting_write_probe',
          redisStatus: client.status || 'ready',
          reason: state.lastReason,
          emergencyLimiter: 'active-per-instance',
        },
        'Rate-limit Redis transport is ready, but write recovery is not yet proven'
      );
      return;
    }
    markReady();
  };

  /**
   * @fastify/rate-limit defines Lua-backed `rateLimit` / `rateLimitRead`
   * commands on the supplied ioredis client and receives failures through their
   * callbacks. A Redis command can fail while ioredis still reports `ready`
   * (READONLY, ACL, script, timeout, or transient server errors), so lifecycle
   * events alone are not a sufficient health signal. Wrap each defined command
   * and mark protection degraded before the plugin's skipOnError path continues.
   */
  const monitorCommand = (commandName) => {
    const original = client[commandName];
    if (typeof original !== 'function' || original[MONITORED_REDIS_COMMAND]) return;

    const wrapped = function monitoredRedisCommand(...args) {
      const callbackIndex = args.length - 1;
      const callback =
        callbackIndex >= 0 && typeof args[callbackIndex] === 'function'
          ? args[callbackIndex]
          : null;

      const recordFailure = (err) => {
        markDegraded(`command:${commandName}`, err);
      };
      const recordSuccess = () => {
        // Only a successful `rateLimit` call proves the required Lua write path
        // works again. A read-only command may succeed on a READONLY replica and
        // must never disable emergency limiting after a write failure.
        if (
          commandName === 'rateLimit' &&
          state.degraded &&
          client.status === 'ready'
        ) {
          markReady();
        }
      };

      if (callback) {
        args[callbackIndex] = (err, ...results) => {
          if (err) recordFailure(err);
          else recordSuccess();
          callback(err, ...results);
        };
      }

      let result;
      try {
        result = original.apply(this, args);
      } catch (err) {
        recordFailure(err);
        throw err;
      }

      // ioredis returns a promise when no callback is supplied. Monitor that
      // path as well so future store usage cannot bypass the health transition.
      if (!callback && result && typeof result.then === 'function') {
        return result.then(
          (value) => {
            recordSuccess();
            return value;
          },
          (err) => {
            recordFailure(err);
            throw err;
          }
        );
      }
      if (!callback) recordSuccess();
      return result;
    };

    Object.defineProperty(wrapped, MONITORED_REDIS_COMMAND, {
      value: true,
      enumerable: false,
    });
    client[commandName] = wrapped;
  };

  if (typeof client.defineCommand === 'function') {
    const originalDefineCommand = client.defineCommand.bind(client);
    client.defineCommand = function monitoredDefineCommand(commandName, definition) {
      const result = originalDefineCommand(commandName, definition);
      monitorCommand(commandName);
      return result;
    };
  }
  // Also cover clients on which another plugin defined the commands first.
  monitorCommand('rateLimit');
  monitorCommand('rateLimitRead');

  // An error listener is mandatory. EventEmitter would otherwise treat an
  // unhandled ioredis error as fatal to the process.
  client.on('error', (err) => markDegraded('error', err));
  client.on('close', () => markDegraded('close'));
  client.on('reconnecting', () => markDegraded('reconnecting'));
  client.on('end', () => markDegraded('end'));
  client.on('ready', markConnectionReady);

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

/**
 * Compact status used by existing readiness consumers. It must never report a
 * healthy-looking `redis:ready` string while emergency protection is active.
 */
export function rateLimitStoreStatus(redisClient) {
  if (!redisClient) return 'memory';
  const connectionStatus = redisClient.status || 'unknown';
  return isRateLimitRedisHealthy(redisClient)
    ? `redis:${connectionStatus}`
    : `redis:degraded:${connectionStatus}`;
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
 * Build a preHandler hook that enforces a fixed-window, per-instance limit only
 * while configured Redis protection is unavailable. Running after the primary
 * onRequest limiter lets a command callback mark the client degraded and makes
 * the emergency counter protect that same request. Counters are bounded and
 * cleared only after proven Redis recovery, so a later outage starts with a
 * clean local window without allowing a bare transport-ready event to erase an
 * active emergency budget.
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
    redisClient.on(RATE_LIMIT_RECOVERED, clearEmergencyState);
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
    if (isRouteRateLimitDisabled(request) || skip(request)) {
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
