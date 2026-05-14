import Fastify from 'fastify';
import compress from '@fastify/compress';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { PrismaClient } from '@prisma/client';
import { loadEnv } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requireCsrf } from './middleware/csrf.js';
import authRoutes from './routes/auth.js';
import billingRoutes from './routes/billing.js';
import educationRoutes from './routes/education.js';
import llmRoutes from './routes/llm.js';
import adminRoutes from './routes/admin.js';
import entityRoutes from './routes/entities.js';
import genomicsRoutes from './routes/genomics.js';
import clinicalTrialRoutes from './routes/clinicalTrials.js';

// Load + validate env BEFORE constructing anything that depends on it.
// loadEnv() throws in production if required secrets are missing.
const env = loadEnv();

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

await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '15 minutes',
});

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
    max: 10,
    timeWindow: '15 minutes',
  });
  await authScope.register(authRoutes, { prefix: '/auth' });
});

await fastify.register(billingRoutes, { prefix: '/billing' });
await fastify.register(educationRoutes, { prefix: '/education' });
await fastify.register(llmRoutes, { prefix: '/llm' });
await fastify.register(adminRoutes, { prefix: '/admin' });
await fastify.register(entityRoutes, { prefix: '/entities' });
await fastify.register(genomicsRoutes, { prefix: '/genomics' });
await fastify.register(clinicalTrialRoutes, { prefix: '/clinical-trials' });

// Liveness — process is up. Cheap, never touches the DB.
fastify.get('/healthz', async () => ({ status: 'ok', uptime: process.uptime() }));

// Readiness — process is up AND can reach its hard dependencies.
// Used by orchestrators (Railway, k8s) to gate traffic. Returns 503 when
// the database is unreachable so traffic is not routed to a broken instance.
fastify.get('/readyz', async (request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    reply.status(503);
    return { status: 'not_ready', reason: 'database unreachable' };
  }
  return {
    status: 'ready',
    medicalEncryption: env.hasMedicalEncryption(),
    timestamp: new Date().toISOString(),
  };
});

// Legacy `/health` retained for backward compatibility.
fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

const start = async () => {
  try {
    await fastify.listen({ port: env.PORT, host: env.HOST });
    fastify.log.info({ port: env.PORT, host: env.HOST, env: env.NODE_ENV }, 'API listening');
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
  await fastify.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
