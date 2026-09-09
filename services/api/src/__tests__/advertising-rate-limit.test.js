import { expect, it } from 'vitest';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { ADVERTISING_RATE_LIMIT_MAX, advertisingRateConfig, isAdvertisingTraffic } from '../config/advertisingRateLimit.js';
import { createEmergencyRateLimitHook } from '../config/rateLimitStore.js';

it('keeps rotation traffic bounded without consuming the ordinary API budget', async () => {
  const app = Fastify();
  await app.register(rateLimit, { max: 2, timeWindow: 900_000 });
  app.get('/advertising/feed', { config: advertisingRateConfig }, async () => ({ creatives: [] }));
  app.get('/normal', async () => ({ ok: true }));
  try {
    for (let i = 0; i < ADVERTISING_RATE_LIMIT_MAX; i++) expect((await app.inject('/advertising/feed')).statusCode).toBe(200);
    expect((await app.inject('/advertising/feed')).statusCode).toBe(429);
    expect((await app.inject('/normal')).statusCode).toBe(200);
    expect((await app.inject('/normal')).statusCode).toBe(200);
    expect((await app.inject('/normal')).statusCode).toBe(429);
  } finally { await app.close(); }
});
it('preserves independent bounded budgets during a Redis outage', async () => {
  const app = Fastify();
  const redisClient = { status: 'end' };
  app.addHook('preHandler', createEmergencyRateLimitHook({ redisClient, scope: 'global', max: 2, timeWindowMs: 900_000, skip: isAdvertisingTraffic }));
  app.addHook('preHandler', createEmergencyRateLimitHook({ redisClient, scope: 'advertising', max: 3, timeWindowMs: 900_000, skip: (request) => !isAdvertisingTraffic(request) }));
  app.get('/advertising/feed', { config: advertisingRateConfig }, async () => ({ creatives: [] }));
  app.get('/normal', async () => ({ ok: true }));
  try {
    for (let i = 0; i < 3; i++) expect((await app.inject('/advertising/feed')).statusCode).toBe(200);
    expect((await app.inject('/advertising/feed')).statusCode).toBe(429);
    expect((await app.inject('/normal')).statusCode).toBe(200);
    expect((await app.inject('/normal')).statusCode).toBe(200);
    expect((await app.inject('/normal')).statusCode).toBe(429);
    expect(isAdvertisingTraffic({ url: '/advertising/feed' })).toBe(false);
  } finally { await app.close(); }
});
