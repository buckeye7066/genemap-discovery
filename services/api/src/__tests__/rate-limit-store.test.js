import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  createRateLimitRedis,
  rateLimitStoreOptions,
  rateLimitStoreStatus,
  RATE_LIMIT_NAMESPACE,
  REDIS_CLIENT_OPTIONS,
} from '../config/rateLimitStore.js';

/**
 * Mocked ioredis constructor: records constructor args, behaves as an
 * EventEmitter so listener wiring can be exercised without a live Redis.
 */
class FakeRedis extends EventEmitter {
  constructor(url, options) {
    super();
    this.url = url;
    this.options = options;
    this.status = 'connecting';
  }
}

const silentLogger = { info: vi.fn(), warn: vi.fn() };

describe('rate-limit store selection', () => {
  describe('REDIS_URL absent → in-memory store (unchanged behaviour)', () => {
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

    it('rateLimitStoreOptions(null) is {} so the plugin uses its default store', () => {
      expect(rateLimitStoreOptions(null)).toEqual({});
      expect(rateLimitStoreOptions(null, 'auth')).toEqual({});
    });

    it('status reports "memory"', () => {
      expect(rateLimitStoreStatus(null)).toBe('memory');
    });
  });

  describe('REDIS_URL set → Redis store', () => {
    const env = { REDIS_URL: 'redis://default:secret@redis.railway.internal:6379' };

    function makeClient() {
      return createRateLimitRedis(env, {
        redisConstructor: FakeRedis,
        logger: silentLogger,
      });
    }

    it('constructs the client with the configured URL', () => {
      const client = makeClient();
      expect(client).toBeInstanceOf(FakeRedis);
      expect(client.url).toBe(env.REDIS_URL);
    });

    it('uses production-safe connection settings (fail fast, no offline queue)', () => {
      const client = makeClient();
      expect(client.options.enableOfflineQueue).toBe(false);
      expect(client.options.maxRetriesPerRequest).toBe(1);
      expect(client.options.connectTimeout).toBe(REDIS_CLIENT_OPTIONS.connectTimeout);
      // Railway private networking is IPv6-only; family 0 = dual-stack lookup.
      expect(client.options.family).toBe(0);
    });

    it('retryStrategy reconnects forever with capped backoff', () => {
      const client = makeClient();
      const retry = client.options.retryStrategy;
      expect(typeof retry).toBe('function');
      expect(retry(1)).toBeGreaterThan(0);
      // Never returns null/undefined (which would stop reconnecting)…
      expect(retry(10000)).toBeTypeOf('number');
      // …and is capped so backoff does not grow unbounded.
      expect(retry(10000)).toBeLessThanOrEqual(15000);
    });

    it('attaches an error listener so an ioredis error event cannot crash the process', () => {
      const client = makeClient();
      expect(client.listenerCount('error')).toBeGreaterThan(0);
      // Emitting 'error' on an EventEmitter with no listener throws — this
      // must not.
      expect(() => client.emit('error', new Error('ECONNREFUSED'))).not.toThrow();
      expect(silentLogger.warn).toHaveBeenCalled();
    });

    it('rateLimitStoreOptions wires the client with fail-open skipOnError', () => {
      const client = makeClient();
      const opts = rateLimitStoreOptions(client);
      expect(opts.redis).toBe(client);
      expect(opts.skipOnError).toBe(true);
      expect(opts.nameSpace).toBe(RATE_LIMIT_NAMESPACE);
    });

    it('scoped registrations get distinct namespaces (auth vs global must not share counters)', () => {
      const client = makeClient();
      const globalOpts = rateLimitStoreOptions(client);
      const authOpts = rateLimitStoreOptions(client, 'auth');
      expect(authOpts.nameSpace).not.toBe(globalOpts.nameSpace);
      expect(authOpts.nameSpace).toContain('auth');
      expect(authOpts.redis).toBe(client);
      expect(authOpts.skipOnError).toBe(true);
    });

    it('status reflects the live ioredis connection status', () => {
      const client = makeClient();
      expect(rateLimitStoreStatus(client)).toBe('redis:connecting');
      client.status = 'ready';
      expect(rateLimitStoreStatus(client)).toBe('redis:ready');
    });
  });
});
