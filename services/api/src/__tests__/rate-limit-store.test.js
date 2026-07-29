import { beforeEach, describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import {
  createEmergencyRateLimitHook,
  createRateLimitRedis,
  isRateLimitRedisHealthy,
  markRateLimitRedisShuttingDown,
  rateLimitProtectionStatus,
  rateLimitStoreOptions,
  rateLimitStoreStatus,
  shouldBypassRateLimit,
  RATE_LIMIT_BYPASS_PATHS,
  RATE_LIMIT_NAMESPACE,
  REDIS_CLIENT_OPTIONS,
} from '../config/rateLimitStore.js';

/**
 * Mocked ioredis constructor: records constructor args and behaves as an
 * EventEmitter so connection-state listeners can be exercised without Redis.
 */
class FakeRedis extends EventEmitter {
  constructor(url, options) {
    super();
    this.url = url;
    this.options = options;
    this.status = 'connecting';
  }
}

const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function makeReply() {
  return {
    headers: new Map(),
    statusCode: 200,
    body: undefined,
    header(name, value) {
      this.headers.set(String(name).toLowerCase(), String(value));
      return this;
    },
    code(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
}

function runHook(hook, ip = '203.0.113.10', url = '/probe') {
  const reply = makeReply();
  const done = vi.fn();
  hook({ ip, url, raw: { url } }, reply, done);
  return { reply, done };
}

describe('rate-limit store selection and outage fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('health and readiness bypass policy', () => {
    it('has one explicit path set shared by both limiter layers', () => {
      expect([...RATE_LIMIT_BYPASS_PATHS].sort()).toEqual(
        ['/health', '/healthz', '/readyz'].sort()
      );
      expect(shouldBypassRateLimit({ url: '/healthz' })).toBe(true);
      expect(shouldBypassRateLimit({ url: '/readyz?details=1' })).toBe(true);
      expect(shouldBypassRateLimit({ raw: { url: '/health?legacy=1' } })).toBe(true);
      expect(shouldBypassRateLimit({ routeOptions: { url: '/readyz' }, url: '/wrong' })).toBe(true);
      expect(shouldBypassRateLimit({ url: '/api/health' })).toBe(false);
      expect(shouldBypassRateLimit({ url: '/healthcheck' })).toBe(false);
    });

    it('keeps primary Fastify rate limiting off health and readiness routes', async () => {
      const app = Fastify({ logger: false });
      await app.register(rateLimit, {
        max: 1,
        timeWindow: 60_000,
        allowList: shouldBypassRateLimit,
      });
      app.get('/healthz', async () => ({ status: 'ok' }));
      app.get('/readyz', async () => ({ status: 'ready' }));
      app.get('/health', async () => ({ status: 'ok' }));
      app.get('/probe', async () => ({ ok: true }));

      for (const url of ['/healthz', '/readyz?details=1', '/health']) {
        expect((await app.inject({ method: 'GET', url })).statusCode).toBe(200);
        expect((await app.inject({ method: 'GET', url })).statusCode).toBe(200);
      }

      const allowed = await app.inject({ method: 'GET', url: '/probe' });
      const blocked = await app.inject({ method: 'GET', url: '/probe' });
      expect(allowed.statusCode).toBe(200);
      expect(blocked.statusCode).toBe(429);

      await app.close();
    });
  });

  describe('REDIS_URL absent: Fastify in-memory store', () => {
    it('createRateLimitRedis returns null with no REDIS_URL', () => {
      const client = createRateLimitRedis(
        { REDIS_URL: undefined },
        { redisConstructor: FakeRedis, logger: silentLogger }
      );
      expect(client).toBeNull();
    });

    it('createRateLimitRedis returns null for empty env', () => {
      expect(createRateLimitRedis({}, { redisConstructor: FakeRedis })).toBeNull();
    });

    it('rateLimitStoreOptions(null) leaves the plugin on its default store', () => {
      expect(rateLimitStoreOptions(null)).toEqual({});
      expect(rateLimitStoreOptions(null, 'auth')).toEqual({});
    });

    it('reports memory protection without an emergency state', () => {
      expect(rateLimitStoreStatus(null)).toBe('memory');
      expect(rateLimitProtectionStatus(null)).toEqual({
        mode: 'memory',
        distributed: false,
        emergency: false,
        redisStatus: 'not-configured',
        degradedSince: null,
      });
    });

    it('the emergency hook is a no-op when Redis is not configured', () => {
      const hook = createEmergencyRateLimitHook({
        redisClient: null,
        max: 1,
        timeWindowMs: 1000,
      });
      const first = runHook(hook);
      const second = runHook(hook);
      expect(first.done).toHaveBeenCalledOnce();
      expect(second.done).toHaveBeenCalledOnce();
      expect(second.reply.statusCode).toBe(200);
    });
  });

  describe('REDIS_URL set: distributed store with emergency fallback', () => {
    const env = { REDIS_URL: 'redis://default:secret@redis.railway.internal:6379' };

    function makeClient(extra = {}) {
      return createRateLimitRedis(env, {
        redisConstructor: FakeRedis,
        logger: silentLogger,
        ...extra,
      });
    }

    it('constructs the client with the configured URL', () => {
      const client = makeClient();
      expect(client).toBeInstanceOf(FakeRedis);
      expect(client.url).toBe(env.REDIS_URL);
    });

    it('uses fail-fast connection settings with no offline queue', () => {
      const client = makeClient();
      expect(client.options.enableOfflineQueue).toBe(false);
      expect(client.options.maxRetriesPerRequest).toBe(1);
      expect(client.options.connectTimeout).toBe(REDIS_CLIENT_OPTIONS.connectTimeout);
      expect(client.options.family).toBe(0);
    });

    it('retryStrategy reconnects forever with capped backoff', () => {
      const client = makeClient();
      const retry = client.options.retryStrategy;
      expect(typeof retry).toBe('function');
      expect(retry(1)).toBeGreaterThan(0);
      expect(retry(10000)).toBeTypeOf('number');
      expect(retry(10000)).toBeLessThanOrEqual(15000);
    });

    it('wires Redis into distinct fail-open plugin namespaces', () => {
      const client = makeClient();
      const globalOpts = rateLimitStoreOptions(client);
      const authOpts = rateLimitStoreOptions(client, 'auth');

      expect(globalOpts).toEqual({
        redis: client,
        skipOnError: true,
        nameSpace: RATE_LIMIT_NAMESPACE,
      });
      expect(authOpts.redis).toBe(client);
      expect(authOpts.skipOnError).toBe(true);
      expect(authOpts.nameSpace).not.toBe(globalOpts.nameSpace);
      expect(authOpts.nameSpace).toContain('auth');
    });

    it('emits a high-priority transition alert, throttles repeats, and logs recovery', () => {
      let clock = Date.parse('2026-07-29T00:00:00.000Z');
      const client = makeClient({
        now: () => clock,
        alertIntervalMs: 60_000,
      });

      client.status = 'ready';
      client.emit('ready');
      vi.clearAllMocks();

      expect(() => client.emit('error', new Error('ECONNREFUSED'))).not.toThrow();
      expect(isRateLimitRedisHealthy(client)).toBe(false);
      expect(silentLogger.error).toHaveBeenCalledOnce();
      expect(silentLogger.error.mock.calls[0][0]).toMatchObject({
        event: 'rate_limit_redis_degraded',
        emergencyLimiter: 'active-per-instance',
      });

      // A related close event inside the alert window does not flood logs.
      client.emit('close');
      expect(silentLogger.error).toHaveBeenCalledOnce();

      clock += 60_001;
      client.emit('reconnecting');
      expect(silentLogger.error).toHaveBeenCalledTimes(2);

      const degraded = rateLimitProtectionStatus(client);
      expect(degraded.mode).toBe('emergency-memory');
      expect(degraded.emergency).toBe(true);
      expect(degraded.distributed).toBe(false);
      expect(degraded.degradedSince).toBe('2026-07-29T00:00:00.000Z');

      client.status = 'ready';
      client.emit('ready');
      expect(isRateLimitRedisHealthy(client)).toBe(true);
      expect(rateLimitProtectionStatus(client)).toMatchObject({
        mode: 'redis',
        distributed: true,
        emergency: false,
        redisStatus: 'ready',
      });
      expect(silentLogger.info).toHaveBeenCalledOnce();
      expect(silentLogger.info.mock.calls[0][0]).toMatchObject({
        event: 'rate_limit_redis_recovered',
        emergencyLimiter: 'inactive',
      });
    });

    it('does not emit outage alerts for expected graceful-shutdown events', () => {
      const client = makeClient();
      client.status = 'ready';
      client.emit('ready');
      vi.clearAllMocks();

      markRateLimitRedisShuttingDown(client);
      expect(() => client.emit('close')).not.toThrow();
      expect(() => client.emit('end')).not.toThrow();
      expect(() => client.emit('error', new Error('connection closed by quit'))).not.toThrow();
      expect(silentLogger.error).not.toHaveBeenCalled();
    });

    it('enforces a bounded local window while Redis is unavailable', () => {
      let clock = 10_000;
      const client = makeClient();
      const hook = createEmergencyRateLimitHook({
        redisClient: client,
        scope: 'global',
        max: 2,
        timeWindowMs: 1000,
        now: () => clock,
      });

      const first = runHook(hook);
      const second = runHook(hook);
      const blocked = runHook(hook);

      expect(first.done).toHaveBeenCalledOnce();
      expect(first.reply.headers.get('x-ratelimit-remaining')).toBe('1');
      expect(second.done).toHaveBeenCalledOnce();
      expect(second.reply.headers.get('x-ratelimit-remaining')).toBe('0');
      expect(blocked.done).not.toHaveBeenCalled();
      expect(blocked.reply.statusCode).toBe(429);
      expect(blocked.reply.headers.get('retry-after')).toBe('1');
      expect(blocked.reply.body).toEqual({
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please retry later.',
      });

      clock += 1001;
      const afterReset = runHook(hook);
      expect(afterReset.done).toHaveBeenCalledOnce();
      expect(afterReset.reply.statusCode).toBe(200);
    });

    it('keeps emergency health probes available while ordinary routes are limited', async () => {
      const client = makeClient();
      const app = Fastify({ logger: false });
      app.addHook(
        'onRequest',
        createEmergencyRateLimitHook({
          redisClient: client,
          max: 1,
          timeWindowMs: 60_000,
          skip: shouldBypassRateLimit,
        })
      );
      app.get('/healthz', async () => ({ status: 'ok' }));
      app.get('/readyz', async () => ({ status: 'ready', degraded: true }));
      app.get('/health', async () => ({ status: 'ok' }));
      app.get('/probe', async () => ({ ok: true }));

      for (const url of ['/healthz', '/readyz?details=1', '/health']) {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const response = await app.inject({ method: 'GET', url });
          expect(response.statusCode).toBe(200);
          expect(response.headers['x-ratelimit-limit']).toBeUndefined();
        }
      }

      const allowed = await app.inject({ method: 'GET', url: '/probe' });
      const blocked = await app.inject({ method: 'GET', url: '/probe' });
      expect(allowed.statusCode).toBe(200);
      expect(allowed.headers['x-ratelimit-remaining']).toBe('0');
      expect(blocked.statusCode).toBe(429);

      await app.close();
    });

    it('runs correctly inside the Fastify onRequest lifecycle', async () => {
      const client = makeClient();
      const app = Fastify({ logger: false });
      app.addHook(
        'onRequest',
        createEmergencyRateLimitHook({
          redisClient: client,
          max: 1,
          timeWindowMs: 60_000,
        })
      );
      app.get('/probe', async () => ({ ok: true }));

      const allowed = await app.inject({ method: 'GET', url: '/probe' });
      const blocked = await app.inject({ method: 'GET', url: '/probe' });

      expect(allowed.statusCode).toBe(200);
      expect(allowed.headers['x-ratelimit-remaining']).toBe('0');
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json()).toEqual({
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please retry later.',
      });

      await app.close();
    });

    it('keeps callers and auth/global scopes independent', () => {
      const client = makeClient();
      const globalHook = createEmergencyRateLimitHook({
        redisClient: client,
        scope: 'global',
        max: 1,
        timeWindowMs: 60_000,
      });
      const authHook = createEmergencyRateLimitHook({
        redisClient: client,
        scope: 'auth',
        max: 1,
        timeWindowMs: 60_000,
      });

      expect(runHook(globalHook, '198.51.100.1').reply.statusCode).toBe(200);
      expect(runHook(authHook, '198.51.100.1').reply.statusCode).toBe(200);
      expect(runHook(globalHook, '198.51.100.2').reply.statusCode).toBe(200);
      expect(runHook(globalHook, '198.51.100.1').reply.statusCode).toBe(429);
      expect(runHook(authHook, '198.51.100.1').reply.statusCode).toBe(429);
    });

    it('clears emergency counters immediately on Redis recovery', () => {
      const client = makeClient();
      const hook = createEmergencyRateLimitHook({
        redisClient: client,
        max: 1,
        timeWindowMs: 60_000,
      });

      expect(runHook(hook).reply.statusCode).toBe(200);
      expect(runHook(hook).reply.statusCode).toBe(429);

      // No request arrives while healthy. The ready event itself must clear the
      // local map before a later outage begins.
      client.status = 'ready';
      client.emit('ready');
      client.status = 'reconnecting';
      client.emit('reconnecting');

      const nextOutage = runHook(hook);
      expect(nextOutage.done).toHaveBeenCalledOnce();
      expect(nextOutage.reply.statusCode).toBe(200);
    });

    it('rejects invalid emergency limiter configuration', () => {
      expect(() =>
        createEmergencyRateLimitHook({ redisClient: makeClient(), max: 0, timeWindowMs: 1000 })
      ).toThrow(/max/);
      expect(() =>
        createEmergencyRateLimitHook({ redisClient: makeClient(), max: 1, timeWindowMs: 0 })
      ).toThrow(/timeWindowMs/);
      expect(() =>
        createEmergencyRateLimitHook({
          redisClient: makeClient(),
          max: 1,
          timeWindowMs: 1000,
          maxEntries: 0,
        })
      ).toThrow(/maxEntries/);
      expect(() =>
        createEmergencyRateLimitHook({
          redisClient: makeClient(),
          max: 1,
          timeWindowMs: 1000,
          skip: true,
        })
      ).toThrow(/skip/);
    });
  });
});
