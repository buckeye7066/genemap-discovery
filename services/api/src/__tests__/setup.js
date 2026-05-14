/**
 * Test setup for @genemap/api
 *
 * Sets environment variables, creates a reusable Fastify test-instance builder,
 * and provides an in-memory Prisma mock so that tests run without a real database.
 */

import { vi } from 'vitest';
import crypto from 'crypto';

// ── Environment variables required by the app ────────────────────────────────
process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-that-is-long-enough';
process.env.COOKIE_SECRET = 'test-cookie-secret';
process.env.CORS_ORIGINS = '*';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
// No MEDICAL_DATA_ENCRYPTION_KEY — encryption gracefully degrades in tests

// ── In-memory Prisma mock ────────────────────────────────────────────────────

/**
 * Creates a lightweight in-memory mock of PrismaClient.
 * Each model exposes the standard Prisma methods (findMany, findUnique, etc.)
 * backed by a plain JS array so tests can verify behaviour without a database.
 */
export function createPrismaMock() {
  const store = {};

  function getStore(name) {
    if (!store[name]) store[name] = [];
    return store[name];
  }

  const createModel = (name) => ({
    findMany: vi.fn(async (args = {}) => {
      let records = [...getStore(name)];
      const { where, orderBy, take, skip, include, select } = args;

      if (where) {
        records = records.filter((r) => matchWhere(r, where));
      }
      if (skip) records = records.slice(skip);
      if (take) records = records.slice(0, take);
      return records;
    }),

    findUnique: vi.fn(async ({ where }) => {
      const records = getStore(name);
      return records.find((r) => {
        for (const [key, val] of Object.entries(where)) {
          if (r[key] !== val) return false;
        }
        return true;
      }) || null;
    }),

    findFirst: vi.fn(async (args = {}) => {
      let records = [...getStore(name)];
      const { where } = args;
      if (where) {
        records = records.filter((r) => matchWhere(r, where));
      }
      return records[0] || null;
    }),

    create: vi.fn(async ({ data }) => {
      const record = {
        id: crypto.randomUUID(),
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      getStore(name).push(record);
      return record;
    }),

    update: vi.fn(async ({ where, data }) => {
      const arr = getStore(name);
      const idx = arr.findIndex((r) => {
        for (const [key, val] of Object.entries(where)) {
          if (r[key] !== val) return false;
        }
        return true;
      });
      if (idx >= 0) {
        arr[idx] = { ...arr[idx], ...data, updatedAt: new Date() };
        return arr[idx];
      }
      return null;
    }),

    delete: vi.fn(async ({ where }) => {
      const arr = getStore(name);
      const idx = arr.findIndex((r) => {
        for (const [key, val] of Object.entries(where)) {
          if (r[key] !== val) return false;
        }
        return true;
      });
      if (idx >= 0) {
        const [removed] = arr.splice(idx, 1);
        return removed;
      }
      return null;
    }),

    deleteMany: vi.fn(async (args = {}) => {
      const { where } = args;
      if (!where) {
        const count = getStore(name).length;
        store[name] = [];
        return { count };
      }
      const before = getStore(name).length;
      store[name] = getStore(name).filter((r) => !matchWhere(r, where));
      return { count: before - getStore(name).length };
    }),

    count: vi.fn(async (args = {}) => {
      let records = [...getStore(name)];
      const { where } = args;
      if (where) {
        records = records.filter((r) => matchWhere(r, where));
      }
      return records.length;
    }),
  });

  const prisma = {
    user: createModel('user'),
    session: createModel('session'),
    auditLog: createModel('auditLog'),
    searchHistory: createModel('searchHistory'),
    userActivity: createModel('userActivity'),
    medicalData: createModel('medicalData'),
    aIConversation: createModel('aIConversation'),
    geneSet: createModel('geneSet'),
    researchProject: createModel('researchProject'),
    projectVersion: createModel('projectVersion'),
    projectCollaborator: createModel('projectCollaborator'),
    message: createModel('message'),
    subscription: createModel('subscription'),
    preBannedUser: createModel('preBannedUser'),
    institutionalLicense: createModel('institutionalLicense'),
    licenseAssignment: createModel('licenseAssignment'),
    licenseUsageLog: createModel('licenseUsageLog'),
    consentRecord: createModel('consentRecord'),
    dataDeletionRequest: createModel('dataDeletionRequest'),
    learningSession: createModel('learningSession'),
    stripeEvent: createModel('stripeEvent'),
    projectAnnotation: createModel('projectAnnotation'),
    $queryRaw: vi.fn(async () => [{ '?column?': 1 }]),
    $disconnect: vi.fn(),
    $transaction: vi.fn(async (callback) => {
      if (typeof callback === 'function') return callback(prisma);
      return Promise.all(callback);
    }),

    // Expose internals for test assertions
    _store: store,
    _reset() {
      for (const key of Object.keys(store)) {
        store[key] = [];
      }
    },
  };

  // Pre-initialise stores so tests can do prisma._store.user.push(...)
  // immediately after _reset() without first hitting a model method.
  const PRE_INIT = [
    'user', 'session', 'auditLog', 'searchHistory', 'userActivity',
    'medicalData', 'aIConversation', 'geneSet', 'researchProject',
    'projectVersion', 'projectCollaborator', 'message', 'subscription',
    'preBannedUser', 'institutionalLicense', 'licenseAssignment',
    'licenseUsageLog', 'consentRecord', 'dataDeletionRequest',
    'learningSession', 'stripeEvent', 'projectAnnotation',
  ];
  for (const k of PRE_INIT) getStore(k);

  return prisma;
}

/** Very simple where-clause matcher — handles flat equality and `in` operator. */
function matchWhere(record, where) {
  for (const [key, condition] of Object.entries(where)) {
    if (key === 'OR') {
      const orMatch = condition.some((sub) => matchWhere(record, sub));
      if (!orMatch) return false;
      continue;
    }
    if (key === 'AND') {
      const andMatch = condition.every((sub) => matchWhere(record, sub));
      if (!andMatch) return false;
      continue;
    }
    if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
      if ('in' in condition) {
        if (!condition.in.includes(record[key])) return false;
        continue;
      }
      if ('contains' in condition) {
        const val = condition.mode === 'insensitive'
          ? String(record[key] || '').toLowerCase()
          : String(record[key] || '');
        const search = condition.mode === 'insensitive'
          ? condition.contains.toLowerCase()
          : condition.contains;
        if (!val.includes(search)) return false;
        continue;
      }
      if ('equals' in condition) {
        const a = condition.mode === 'insensitive' ? String(record[key] || '').toLowerCase() : record[key];
        const b = condition.mode === 'insensitive' ? String(condition.equals || '').toLowerCase() : condition.equals;
        if (a !== b) return false;
        continue;
      }
      if ('gte' in condition) {
        if (!(record[key] >= condition.gte)) return false;
        continue;
      }
      if ('some' in condition) {
        // Simplified: skip relation filtering in mock
        continue;
      }
      if ('has' in condition) {
        if (!Array.isArray(record[key]) || !record[key].includes(condition.has)) return false;
        continue;
      }
      if ('increment' in condition) {
        // handled separately in update
        continue;
      }
      if ('decrement' in condition) {
        continue;
      }
      // Nested object — treat as sub-where
      if (!matchWhere(record[key] || {}, condition)) return false;
      continue;
    }
    if (record[key] !== condition) return false;
  }
  return true;
}

// ── Fastify test instance builder ────────────────────────────────────────────

import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { errorHandler } from '../middleware/errorHandler.js';
import { requireCsrf } from '../middleware/csrf.js';
import authRoutes from '../routes/auth.js';
import adminRoutes from '../routes/admin.js';
import entityRoutes from '../routes/entities.js';
// NOTE: billing routes and llm routes are NOT imported at the top level.
// They pull in the `stripe` SDK / LLM service modules eagerly, which would
// freeze those modules before individual test files have a chance to
// vi.mock(...) them.

/**
 * Builds a Fastify instance wired up with the mock Prisma client and all
 * routes needed for testing.  Call `app.close()` in afterAll / afterEach.
 */
export async function buildTestApp(prismaMock, opts = {}) {
  const app = Fastify({ logger: false });

  app.decorate('prisma', prismaMock);

  await app.register(cookie, { secret: process.env.COOKIE_SECRET });

  // Custom JSON parser matching the main app — also captures rawBody for
  // Stripe-webhook signature verification.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
    req.rawBody = body;
    try {
      const json = body.length > 0 ? JSON.parse(body) : {};
      done(null, json);
    } catch (err) {
      done(err);
    }
  });

  // Set error handler BEFORE route registration so all encapsulated
  // plugin scopes inherit it (matches the production index.js order).
  app.setErrorHandler(errorHandler);

  // CSRF middleware on by default (matches production); some tests opt out.
  if (opts.csrf !== false) {
    app.addHook('preHandler', requireCsrf);
  }

  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(adminRoutes, { prefix: '/admin' });
  await app.register(entityRoutes, { prefix: '/entities' });
  if (opts.includeLlm) {
    const { default: llmRoutes } = await import('../routes/llm.js');
    await app.register(llmRoutes, { prefix: '/llm' });
  }
  if (opts.includeBilling) {
    const { default: billingRoutes } = await import('../routes/billing.js');
    await app.register(billingRoutes, { prefix: '/billing' });
  }

  await app.ready();
  return app;
}

/**
 * Helper: generate a valid access-token cookie string for a given user payload.
 */
import { generateAccessToken } from '../utils/auth.js';

export function authCookie(userPayload) {
  const token = generateAccessToken(userPayload);
  return `accessToken=${token}`;
}
