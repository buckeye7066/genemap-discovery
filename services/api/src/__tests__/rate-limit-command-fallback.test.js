import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import {
  createEmergencyRateLimitHook,
  createRateLimitRedis,
  isRateLimitRedisHealthy,
  rateLimitProtectionStatus,
} from '../config/rateLimitStore.js';

/**
 * Minimal ioredis test double with the same defineCommand callback contract used
 * by @fastify/rate-limit's RedisStore. The socket status can stay `ready` while
 * one Lua command fails, which is the regression this suite protects.
 */
class CommandRedis extends EventEmitter {
  constructor(url, options) {
    super();
    this.url = url;
    this.options = options;
    this.status = 'connecting';
    this.commandError = null;
    this.commandResult = [1, 60_000];
  }

  defineCommand(name) {
    this[name] = (...args) => {
      const callback = typeof args.at(-1) === 'function' ? args.at(-1) : null;
      if (callback) {
        queueMicrotask(() => {
          if (this.commandError) callback(this.commandError, null);
          else callback(null, this.commandResult);
        });
        return undefined;
      }

      return this.commandError
        ? Promise.reject(this.commandError)
        : Promise.resolve(this.commandResult);
    };
  }
}

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const env = {
  REDIS_URL: 'redis://default:secret@redis.railway.internal:6379',
};

function makeClient() {
  return createRateLimitRedis(env, {
    redisConstructor: CommandRedis,
    logger,
  });
}

function invokeRateLimit(client) {
  return new Promise((resolve, reject) => {
    client.rateLimit('test-key', 60_000, 1, false, false, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

describe('Redis command-level rate-limit fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks protection degraded when a Lua command fails while the socket remains ready', async () => {
    const client = makeClient();
    client.defineCommand('rateLimit', { numberOfKeys: 1, lua: 'return {1, 60000}' });
    client.status = 'ready';
    client.emit('ready');
    vi.clearAllMocks();

    client.commandError = new Error('READONLY replica cannot accept writes');
    await expect(invokeRateLimit(client)).rejects.toThrow('READONLY');

    expect(client.status).toBe('ready');
    expect(isRateLimitRedisHealthy(client)).toBe(false);
    expect(rateLimitProtectionStatus(client)).toMatchObject({
      mode: 'emergency-memory',
      distributed: false,
      emergency: true,
      redisStatus: 'ready',
    });
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error.mock.calls[0][0]).toMatchObject({
      event: 'rate_limit_redis_degraded',
      reason: 'command:rateLimit',
      emergencyLimiter: 'active-per-instance',
    });

    // A successful command on the still-ready connection is the recovery signal
    // for command failures that never forced ioredis to reconnect.
    client.commandError = null;
    await expect(invokeRateLimit(client)).resolves.toEqual([1, 60_000]);
    expect(isRateLimitRedisHealthy(client)).toBe(true);
    expect(logger.info).toHaveBeenCalledOnce();
    expect(logger.info.mock.calls[0][0]).toMatchObject({
      event: 'rate_limit_redis_recovered',
      emergencyLimiter: 'inactive',
    });
  });

  it('limits the same request path after skipOnError sees a ready-socket command failure', async () => {
    const client = makeClient();
    client.status = 'ready';
    client.emit('ready');
    vi.clearAllMocks();

    const app = Fastify({ logger: false });
    await app.register(rateLimit, {
      max: 1,
      timeWindow: 60_000,
      redis: client,
      skipOnError: true,
    });
    app.addHook(
      'preHandler',
      createEmergencyRateLimitHook({
        redisClient: client,
        max: 1,
        timeWindowMs: 60_000,
      })
    );
    app.get('/probe', async () => ({ ok: true }));

    // Registration has now defined and wrapped the exact Lua command used by
    // the plugin. Fail it without changing the client's public connection state.
    client.commandError = new Error('READONLY replica cannot accept writes');

    const first = await app.inject({ method: 'GET', url: '/probe' });
    const second = await app.inject({ method: 'GET', url: '/probe' });

    expect(client.status).toBe('ready');
    expect(isRateLimitRedisHealthy(client)).toBe(false);
    expect(first.statusCode).toBe(200);
    expect(first.headers['x-ratelimit-remaining']).toBe('0');
    expect(second.statusCode).toBe(429);
    expect(second.headers['retry-after']).toBeTruthy();
    expect(second.json()).toEqual({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please retry later.',
    });

    await app.close();
  });
});
