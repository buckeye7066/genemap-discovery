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
// Test-only: restrict CORS to the local dev origin so tests still exercise
// same-origin/CORS validation. This setup file is never used in production builds.
process.env.CORS_ORIGINS = 'http://localhost:5173';
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
  const uniqueFields = {
    user: ['email'],
    stripeEvent: ['stripeEventId'],
    subscription: ['stripeSubscriptionId'],
  };

  function getStore(name) {
    if (!store[name]) store[name] = [];
    return store[name];
  }

  function createUniqueError(model, field) {
    const err = new Error(`Unique constraint failed on ${model}.${field}`);
    err.code = 'P2002';
    err.meta = { target: [field] };
    return err;
  }

  function assertUnique(name, data, ignoreId = null) {
    for (const field of uniqueFields[name] || []) {
      if (data[field] === undefined || data[field] === null) continue;
      const duplicate = getStore(name).find((record) =>
        record.id !== ignoreId && record[field] === data[field]
      );
      if (duplicate) throw createUniqueError(name, field);
    }
  }

  // Apply a Prisma `data` object to a record, honoring atomic
  // increment/decrement/set operators the way the real client does.
  const applyData = (record, data) => {
    const next = { ...record };
    for (const [key, val] of Object.entries(data)) {
      if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
        if ('increment' in val) { next[key] = (next[key] || 0) + val.increment; continue; }
        if ('decrement' in val) { next[key] = (next[key] || 0) - val.decrement; continue; }
        if ('set' in val) { next[key] = val.set; continue; }
      }
      next[key] = val;
    }
    next.updatedAt = new Date();
    return next;
  };

  const createModel = (name) => ({
    findMany: vi.fn(async (args = {}) => {
      let records = [...getStore(name)];
      const { where, take, skip } = args;

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
      assertUnique(name, data);
      const record = {
        id: crypto.randomUUID(),
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      getStore(name).push(record);
      return record;
    }),

    createMany: vi.fn(async ({ data }) => {
      const rows = Array.isArray(data) ? data : [data];
      for (const d of rows) {
        getStore(name).push({
          id: crypto.randomUUID(),
          ...d,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      return { count: rows.length };
    }),

    update: vi.fn(async ({ where, data }) => {
      const arr = getStore(name);
      const idx = arr.findIndex((r) => matchWhere(r, where));
      if (idx >= 0) {
        arr[idx] = applyData(arr[idx], data);
        return arr[idx];
      }
      return null;
    }),

    updateMany: vi.fn(async ({ where, data }) => {
      const arr = getStore(name);
      let count = 0;
      for (let i = 0; i < arr.length; i++) {
        if (!where || matchWhere(arr[i], where)) {
          arr[i] = applyData(arr[i], data);
          count++;
        }
      }
      return { count };
    }),

    upsert: vi.fn(async ({ where, create, update }) => {
      const arr = getStore(name);
      const idx = arr.findIndex((r) => matchWhere(r, where));
      if (idx >= 0) {
        arr[idx] = applyData(arr[idx], update);
        return arr[idx];
      }
      assertUnique(name, create);
      const record = { id: crypto.randomUUID(), ...create, createdAt: new Date(), updatedAt: new Date() };
      arr.push(record);
      return record;
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

    // Mirrors Prisma's groupBy: returns one row per distinct combination of
    // the `by` fields, carrying those fields plus any requested aggregations
    // (_count/_max/_min/_sum/_avg) in the same nested shape the real client
    // produces, e.g. [{ dataType: 'vcf', _count: { _all: 4 } }].
    groupBy: vi.fn(async (args = {}) => {
      const { by = [], where, _count, _max, _min, _sum, _avg } = args;
      const fields = Array.isArray(by) ? by : [by];
      let records = [...getStore(name)];
      if (where) {
        records = records.filter((r) => matchWhere(r, where));
      }

      const groups = new Map();
      for (const r of records) {
        const key = JSON.stringify(fields.map((f) => r[f] ?? null));
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
      }

      const defined = (v) => v !== null && v !== undefined;
      const numeric = (rows, field) => rows.map((r) => r[field]).filter(defined).map(Number);

      return [...groups.values()].map((rows) => {
        const result = {};
        for (const f of fields) result[f] = rows[0][f] ?? null;
        if (_count) {
          if (_count === true) {
            result._count = rows.length;
          } else {
            result._count = {};
            for (const f of Object.keys(_count)) {
              result._count[f] = f === '_all' ? rows.length : rows.filter((r) => defined(r[f])).length;
            }
          }
        }
        if (_max) {
          result._max = {};
          for (const f of Object.keys(_max)) {
            const vals = rows.map((r) => r[f]).filter(defined);
            result._max[f] = vals.length ? vals.reduce((a, b) => (a > b ? a : b)) : null;
          }
        }
        if (_min) {
          result._min = {};
          for (const f of Object.keys(_min)) {
            const vals = rows.map((r) => r[f]).filter(defined);
            result._min[f] = vals.length ? vals.reduce((a, b) => (a < b ? a : b)) : null;
          }
        }
        if (_sum) {
          result._sum = {};
          for (const f of Object.keys(_sum)) {
            const vals = numeric(rows, f);
            result._sum[f] = vals.length ? vals.reduce((a, b) => a + b, 0) : null;
          }
        }
        if (_avg) {
          result._avg = {};
          for (const f of Object.keys(_avg)) {
            const vals = numeric(rows, f);
            result._avg[f] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
          }
        }
        return result;
      });
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
    learningProgress: createModel('learningProgress'),
    stripeEvent: createModel('stripeEvent'),
    projectAnnotation: createModel('projectAnnotation'),
    agentMessage: createModel('agentMessage'),
    agentLesson: createModel('agentLesson'),
    $queryRaw: vi.fn(async () => [{ '?column?': 1 }]),
    $disconnect: vi.fn(),
    $transaction: vi.fn(async (callback) => {
      if (typeof callback === 'function') {
        const snapshot = Object.fromEntries(
          Object.entries(store).map(([key, rows]) => [key, rows.map((row) => ({ ...row }))])
        );
        try {
          return await callback(prisma);
        } catch (err) {
          for (const key of Object.keys(store)) {
            store[key] = snapshot[key] ? snapshot[key].map((row) => ({ ...row })) : [];
          }
          throw err;
        }
      }
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
    'learningSession', 'learningProgress', 'stripeEvent', 'projectAnnotation',
    'agentMessage', 'agentLesson',
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
      if ('notIn' in condition) {
        if (condition.notIn.includes(record[key])) return false;
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
      if ('gt' in condition) {
        if (!(record[key] > condition.gt)) return false;
        continue;
      }
      if ('lte' in condition) {
        if (!(record[key] <= condition.lte)) return false;
        continue;
      }
      if ('lt' in condition) {
        if (!(record[key] < condition.lt)) return false;
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
      // A compound unique key (e.g. `projectId_userId: { projectId, userId }`)
      // names no real column, so flatten its entries into sibling equality
      // checks against the record itself.
      if (record[key] === undefined) {
        if (!matchWhere(record, condition)) return false;
        continue;
      }
      // Otherwise it's a nested JSON column — treat as a sub-where.
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
  const app = Fastify({ logger: false, ...(opts.fastifyOptions || {}) });

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
  if (opts.includeGenomics) {
    const { default: genomicsRoutes } = await import('../routes/genomics.js');
    await app.register(genomicsRoutes, { prefix: '/genomics' });
  }
  if (opts.includeEducation) {
    const { default: educationRoutes } = await import('../routes/education.js');
    await app.register(educationRoutes, { prefix: '/education' });
  }

  await app.ready();
  return app;
}

/**
 * Helper: generate a valid access-token cookie string for a given user payload.
 */
import { generateAccessToken } from '../utils/auth.js';

/**
 * Push a stub user record into the mock prisma store so the new DB-hydrating
 * `authenticate()` middleware can find it. Idempotent.
 */
export function seedAuthUser(prisma, userPayload) {
  if (!prisma) return;
  const existing = prisma._store.user.find((u) => u.id === userPayload.userId);
  if (existing) return;
  prisma._store.user.push({
    id: userPayload.userId,
    email: userPayload.email,
    role: userPayload.role,
    passwordHash: '$2b$10$mockHashForAuthTests',
    banned: false,
    banReason: null,
    bannedDate: null,
    bannedBy: null,
    displayName: null,
    fullName: null,
    phoneNumber: null,
    educationLevel: null,
    demographicsCollected: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

export function authCookie(userPayload, prisma) {
  // When a prisma instance is provided, also seed the user record so the
  // DB-hydrating authenticate() middleware can resolve it. Tests that pre-
  // date this contract still get a token; they are expected to seed the
  // user themselves (most do) or call seedAuthUser explicitly.
  if (prisma) seedAuthUser(prisma, userPayload);
  const token = generateAccessToken(userPayload);
  return `accessToken=${token}`;
}
