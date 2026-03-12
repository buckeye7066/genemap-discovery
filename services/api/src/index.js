import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { PrismaClient } from '@prisma/client';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import billingRoutes from './routes/billing.js';
import educationRoutes from './routes/education.js';

const prisma = new PrismaClient();

const fastify = Fastify({
  logger: true,
  bodyLimit: 1048576,
});

fastify.decorate('prisma', prisma);

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',');

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
  secret: process.env.COOKIE_SECRET,
});

if (!process.env.COOKIE_SECRET) {
  throw new Error('COOKIE_SECRET must be set in environment variables');
}

await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '15 minutes',
});

fastify.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
  req.rawBody = body;
  try {
    const json = JSON.parse(body);
    done(null, json);
  } catch (err) {
    done(err);
  }
});

await fastify.register(async (authScope) => {
  await authScope.register(rateLimit, {
    max: 10,
    timeWindow: '15 minutes',
  });
  await authScope.register(authRoutes, { prefix: '/auth' });
});

await fastify.register(billingRoutes, { prefix: '/billing' });
await fastify.register(educationRoutes, { prefix: '/education' });

fastify.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

fastify.setErrorHandler(errorHandler);

const start = async () => {
  try {
    const port = process.env.PORT || 3000;
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    console.log(`Server listening on ${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
