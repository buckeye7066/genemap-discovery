import Fastify from 'fastify';
import compress from '@fastify/compress';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { PrismaClient } from '@prisma/client';
import { loadEnv } from './config/env.js';
import { resolveRailwayReleaseSha } from './config/releaseIdentity.js';
import { initSentry } from './config/sentry.js';
import {
  createEmergencyRateLimitHook,
  createRateLimitRedis,
  markRateLimitRedisShuttingDown,
  rateLimitProtectionStatus,
  rateLimitStoreOptions,
  rateLimitStoreStatus,
  shouldBypassRateLimit,
} from './config/rateLimitStore.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requireCsrf } from './middleware/csrf.js';
import authRoutes from './routes/auth.js';
import billingRoutes from './routes/billing.js';
import educationRoutes from './routes/education.js';
import llmRoutes from './routes/llm.js';
import adminRoutes from './routes/admin.js';
import entityRoutes from './routes/entities.js';
import genomicsRoutes from './routes/genomics.js';
import publicationConceptRoutes from './routes/publicationConcepts.js';
import clinicalTrialRoutes from './routes/clinicalTrials.js';
import clientErrorRoutes from './routes/clientError.js';
import {
  PUBLICATION_MODE,
  enforceHiddenPathBoundary,
  enforcePublishingBoundary,
} from './config/publishingBoundary.js';

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const GLOBAL_RATE_LIMIT_MAX = 100;
const AUTH_RATE_LIMIT_MAX = 10;

// Load + validate env BEFORE constructing anything that depends on it.
// loadEnv() throws in production if required secrets are missing.
const env = loadEnv();
const releaseSha = resolveRailwayReleaseSha(process.env, {
  production: env.isProduction,
});

// Initialize error tracking as early as possible (no-op unless SENTRY_DSN set).
const sentryEnabled = initSentry(env);

const prisma = new PrismaClient({
  log: env.isDevelopment ? ['query', 'warn', 'error'] : ['error'],
});

const fastify = Fastify({
  logger: {
    level: env.LOG_LEVEL || (env.isProduction ? 'warn' : 'info'),
    redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-csrf-token"]'],
  },
  bodyLimit: 1048576,
});

fastify.decorate('prisma', prisma);
fastify.decorate('env', env);

// Security headers on every API response. This is a JSON API on its own origin
// (the web app is served from Vercel with its own headers), so we keep the
// browser-page protections minimal and focus on transport + sniffing:
//  - HSTS: force HTTPS for a year incl. subdomains (the API is HTTPS-only on
//    Railway). Harmless if a proxy already sets it.
//  - nosniff + frameguard(deny) + no-referrer: defense in depth.
//  - CSP/COEP are disabled: they govern HTML documents, and this origin never
//    serves one, so enabling CSP here only risks breaking JSON clients.
//  - x-powered-by is removed so we do not advertise the framework.
await fastify.register(helmet, {
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'no-referrer' },
});

await fastify.register(compress, { global: true });

const allowedOrigins = env.corsAllowList();
await fastify.register(cors, {
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      cb(null, true);
    } else {
      cb(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
});

await fastify.register(cookie, {
  secret: env.COOKIE_SECRET,
});

// Rate limiting is distributed through Redis when configured. The Fastify
// plugin skips a Redis command error so a cache outage cannot produce blanket
// 500s. Its command callbacks mark the shared client degraded, then the
// preHandler emergency limiter takes over on that same request with bounded,
// per-instance counters. Health/readiness routes bypass both layers so an outage
// can never hide the very status operators need.
const rateLimitRedis = createRateLimitRedis(env, { logger: fastify.log });

await fastify.register(rateLimit, {
  max: GLOBAL_RATE_LIMIT_MAX,
  timeWindow: '15 minutes',
  allowList: shouldBypassRateLimit,
  ...rateLimitStoreOptions(rateLimitRedis),
});
fastify.addHook(
  'preHandler',
  createEmergencyRateLimitHook({
    redisClient: rateLimitRedis,
    scope: 'global',
    max: GLOBAL_RATE_LIMIT_MAX,
    timeWindowMs: RATE_LIMIT_WINDOW_MS,
    skip: shouldBypassRateLimit,
  })
);

// Reject hidden path families during onRequest, before content-type parsing,
// so the publication build never accepts a VCF/medical/clinical request body.
fastify.addHook('onRequest', enforceHiddenPathBoundary);

// Enforce bounded generation contracts after parsing their small structured
// bodies. Register before CSRF and child route authentication/handlers.
fastify.addHook('preHandler', enforcePublishingBoundary);

// Global CSRF guard for state-changing requests on cookie-authenticated paths.
fastify.addHook('preHandler', requireCsrf);

fastify.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
  req.rawBody = body;
  try {
    const json = body.length > 0 ? JSON.parse(body) : {};
    done(null, json);
  } catch (err) {
    done(err);
  }
});

// Register the error handler BEFORE plugins so child scopes inherit it.
fastify.setErrorHandler(errorHandler);

await fastify.register(async (authScope) => {
  await authScope.register(rateLimit, {
    max: AUTH_RATE_LIMIT_MAX,
    timeWindow: '15 minutes',
    // Distinct namespace: without it the auth counters would share Redis keys
    // with the global limiter (both key on nameSpace + ip).
    ...rateLimitStoreOptions(rateLimitRedis, 'auth'),
  });
  authScope.addHook(
    'preHandler',
    createEmergencyRateLimitHook({
      redisClient: rateLimitRedis,
      scope: 'auth',
      max: AUTH_RATE_LIMIT_MAX,
      timeWindowMs: RATE_LIMIT_WINDOW_MS,
    })
  );
  await authScope.register(authRoutes, { prefix: '/auth' });
});

await fastify.register(billingRoutes, { prefix: '/billing' });
await fastify.register(educationRoutes, { prefix: '/education' });
await fastify.register(llmRoutes, { prefix: '/llm' });
await fastify.register(adminRoutes, { prefix: '/admin' });
await fastify.register(entityRoutes, { prefix: '/entities' });
await fastify.register(genomicsRoutes, { prefix: '/genomics' });
await fastify.register(publicationConceptRoutes, { prefix: '/genomics/publication-concepts' });
await fastify.register(clinicalTrialRoutes, { prefix: '/clinical-trials' });

// Frontend error ingest (auth optional). Registered at root so the web app can
// POST uncaught errors to `/report-client-error`.
await fastify.register(clientErrorRoutes);

// Liveness: the process is up. Cheap, never touches the DB, and is explicitly
// excluded from rate limiting as a second layer of defense beyond allowList.
fastify.get(
  '/healthz',
  { config: { rateLimit: false } },
  async () => ({ status: 'ok', uptime: process.uptime() })
);

// Readiness: the process is up and can reach its hard dependencies. Redis is
// deliberately not a hard dependency because emergency local limiting remains
// active during an outage. The structured field makes that degraded protection
// state visible to operators and monitoring, so this route must never be 429'd.
fastify.get('/readyz', { config: { rateLimit: false } }, async (request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    reply.status(503);
    return { status: 'not_ready', reason: 'database unreachable' };
  }

  const rateLimitProtection = rateLimitProtectionStatus(rateLimitRedis);
  return {
    status: 'ready',
    degraded: rateLimitProtection.emergency,
    publicationMode: PUBLICATION_MODE,
    releaseSha,
    medicalEncryption: env.hasMedicalEncryption(),
    rateLimitStore: rateLimitStoreStatus(rateLimitRedis),
    rateLimitProtection,
    timestamp: new Date().toISOString(),
  };
});

// Legacy `/health` retained for backward compatibility and probeability.
fastify.get(
  '/health',
  { config: { rateLimit: false } },
  async () => ({ status: 'ok', timestamp: new Date().toISOString() })
);

const start = async () => {
  try {
    // Keep-alive race fix: Node's default keepAliveTimeout (5s; Fastify's 72s
    // default can also sit under a proxy's idle window) is shorter than the
    // Railway edge proxy's idle timeout, so the server can close an idle
    // socket at the exact moment the proxy writes the next request into it.
    // The server-side timeout must exceed the proxy's so the proxy closes first;
    // headersTimeout must exceed keepAliveTimeout.
    fastify.server.keepAliveTimeout = Number(process.env.HTTP_KEEPALIVE_TIMEOUT_MS || 620_000);
    fastify.server.headersTimeout = fastify.server.keepAliveTimeout + 5_000;
    await fastify.listen({ port: env.PORT, host: env.HOST });
    fastify.log.info(
      { port: env.PORT, host: env.HOST, env: env.NODE_ENV, sentry: sentryEnabled },
      'API listening'
    );
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

let isShuttingDown = false;

const gracefulShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  fastify.log.info(`Received ${signal}, shutting down gracefully...`);
  if (rateLimitRedis) {
    // Fastify plugins may begin teardown during close(), so suppress expected
    // Redis close/end events before any application resource is dismantled.
    markRateLimitRedisShuttingDown(rateLimitRedis);
  }
  await fastify.close();
  await prisma.$disconnect();
  if (rateLimitRedis) {
    await rateLimitRedis.quit().catch(() => rateLimitRedis.disconnect());
  }
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
