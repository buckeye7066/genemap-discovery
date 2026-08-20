import Fastify from 'fastify';
import compress from '@fastify/compress';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { PrismaClient } from '@prisma/client';
import { loadEnv } from './config/env.js';
import { initSentry } from './config/sentry.js';
import { releaseSha } from './config/releaseIdentity.js';
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
import adminDeletionLockPlugin from './plugins/adminDeletionLock.js';
import authRoutes from './routes/auth.js';
import accountRoutes from './routes/account.js';
import billingRoutes from './routes/billing.js';
import educationRoutes from './routes/education.js';
import llmRoutes, { isModelPublicationEnabled } from './routes/llm.js';
import adminRoutes from './routes/admin.js';
import entityRoutes from './routes/entities.js';
import genomicsRoutes from './routes/genomics.js';
import publicationConceptRoutes from './routes/publicationConcepts.js';
import clinicalTrialRoutes from './routes/clinicalTrials.js';
import clientErrorRoutes from './routes/clientError.js';
import {
  accountClosureCleanupStatus,
  createAccountClosureStripeClient,
  reconcilePendingCustomerCleanup,
} from './services/accountClosure.js';
import { accountClosureLedgerStatus } from './services/accountClosureLedger.js';
import { operatorAlertStatus } from './services/operatorAlert.js';
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
const currentReleaseSha = releaseSha(process.env);

// initSentry() is a deliberate NO-OP STUB that always returns false. SENTRY_DSN
// is read nowhere in the tree, so it can never be 'set' into working -- saying
// 'no-op unless SENTRY_DSN set' implied a switch that does not exist.
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

await fastify.register(helmet, {
  // GATED (2026-08-20, owner instruction "gate genemap's findings"). This was
  // `false`, so the API sent NO Content-Security-Policy at all and the
  // processor register had to record that browser egress was prevented by the
  // ABSENCE OF CODE rather than by enforcement. The API serves JSON to a
  // separate origin and renders no HTML of its own, so the tightest possible
  // policy is also the correct one: nothing may load, connect, or frame.
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      'default-src': ["'none'"],
      'frame-ancestors': ["'none'"],
      'base-uri': ["'none'"],
      'form-action': ["'none'"],
    },
  },
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

if (!env.COOKIE_SECRET || env.COOKIE_SECRET === 'defaultValue' || env.COOKIE_SECRET.trim() === '') {
  throw new Error('Invalid COOKIE_SECRET');
}
await fastify.register(cookie, {
  secret: env.COOKIE_SECRET,
});

const rateLimitRedis = createRateLimitRedis(env, { logger: fastify.log });
const accountClosureStripeClient = createAccountClosureStripeClient(process.env);
let accountClosureCleanupTimer = null;

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

fastify.addHook('onRequest', enforceHiddenPathBoundary);
fastify.addHook('preHandler', enforcePublishingBoundary);
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

fastify.setErrorHandler(errorHandler);

await fastify.register(async (authScope) => {
  await authScope.register(rateLimit, {
    max: AUTH_RATE_LIMIT_MAX,
    timeWindow: '15 minutes',
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

// Install the admin-delete wrapper in the root route scope before admin routes
// are declared. It wraps only DELETE .../users/:idOrEmail after that route's
// authentication/role preHandlers have succeeded.
await adminDeletionLockPlugin(fastify);

await fastify.register(accountRoutes, { prefix: '/account' });
await fastify.register(billingRoutes, { prefix: '/billing' });
await fastify.register(educationRoutes, { prefix: '/education' });
await fastify.register(llmRoutes, { prefix: '/llm' });
await fastify.register(adminRoutes, { prefix: '/admin' });
await fastify.register(entityRoutes, { prefix: '/entities' });
await fastify.register(genomicsRoutes, { prefix: '/genomics' });
await fastify.register(publicationConceptRoutes, { prefix: '/genomics/publication-concepts' });
await fastify.register(clinicalTrialRoutes, { prefix: '/clinical-trials' });
await fastify.register(clientErrorRoutes);

fastify.get(
  '/healthz',
  { config: { rateLimit: false } },
  async () => ({ status: 'ok', uptime: process.uptime(), releaseSha: currentReleaseSha })
);

fastify.get('/readyz', { config: { rateLimit: false } }, async (request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    reply.status(503);
    return { status: 'not_ready', reason: 'database unreachable', releaseSha: currentReleaseSha };
  }

  const rateLimitProtection = rateLimitProtectionStatus(rateLimitRedis);
  const modelPublicationEnabled = isModelPublicationEnabled(process.env);
  const ledger = accountClosureLedgerStatus(process.env);
  const accountClosureCleanup = accountClosureCleanupStatus();
  const accountClosureDegraded = env.isProduction && (
    !ledger.configured
    || accountClosureCleanup.lastError
    || Number(accountClosureCleanup.pending || 0) > 0
  );
  const degraded = rateLimitProtection.emergency
    || !modelPublicationEnabled
    || accountClosureDegraded;
  return {
    status: degraded ? 'degraded' : 'ready',
    degraded,
    releaseSha: currentReleaseSha,
    publicationMode: PUBLICATION_MODE,
    modelPublication: {
      enabled: modelPublicationEnabled,
      status: modelPublicationEnabled ? 'enabled' : 'disabled_for_safe_recovery',
    },
    medicalEncryption: env.hasMedicalEncryption(),
    accountClosureLedger: ledger,
    // Reported, never degrading: an unconfigured mailbox still leaves the
    // structured [operator-alert] stderr trail, so it is a visibility gap to
    // close, not a reason to fail readiness.
    operatorAlert: operatorAlertStatus(process.env),
    accountClosureCleanup,
    rateLimitStore: rateLimitStoreStatus(rateLimitRedis),
    rateLimitProtection,
    timestamp: new Date().toISOString(),
  };
});

fastify.get(
  '/health',
  { config: { rateLimit: false } },
  async () => ({ status: 'ok', timestamp: new Date().toISOString() })
);

async function runAccountClosureCleanup() {
  try {
    const result = await reconcilePendingCustomerCleanup({
      prisma,
      stripeClient: accountClosureStripeClient,
    });
    if (result.pending || result.completed) {
      fastify.log.info({ result }, 'account-closure customer cleanup reconciliation completed');
    }
  } catch (error) {
    fastify.log.error({ err: error }, 'account-closure customer cleanup reconciliation failed');
  }
}

const start = async () => {
  try {
    fastify.server.keepAliveTimeout = Number(process.env.HTTP_KEEPALIVE_TIMEOUT_MS || 620_000);
    fastify.server.headersTimeout = fastify.server.keepAliveTimeout + 5_000;
    await fastify.listen({ port: env.PORT, host: env.HOST });
    await runAccountClosureCleanup();
    accountClosureCleanupTimer = setInterval(runAccountClosureCleanup, 15 * 60 * 1000);
    accountClosureCleanupTimer.unref?.();
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
    markRateLimitRedisShuttingDown(rateLimitRedis);
  }
  if (accountClosureCleanupTimer) {
    clearInterval(accountClosureCleanupTimer);
    accountClosureCleanupTimer = null;
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
