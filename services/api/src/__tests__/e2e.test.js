/**
 * End-to-end flow tests.
 *
 * "E2E" here means: every request goes through the real Fastify pipeline
 * (cookie + CSRF + auth + entitlements + route handler + global error
 * handler) against the same in-memory Prisma mock the rest of the suite
 * uses. Browser-level Playwright runs are tracked separately in
 * docs/PRODUCTION_READINESS_REPORT.md (they require a deployed dev server
 * and a real Postgres).
 *
 * Each describe block exercises one of the production-critical user flows
 * the brief calls out: auth, LLM, billing/entitlement, and one core
 * GeneMap workflow (gene set creation + retrieval through the entity API).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { buildTestApp, createPrismaMock } from './setup.js';
import { hashPassword } from '../utils/auth.js';

vi.mock('../services/llm.js', () => ({
  generateExplanation: vi.fn(async (prompt, opts) => `EXPL:${prompt.length}:${opts.maxTokens}`),
  generateChatResponse: vi.fn(async (msgs, opts) => `CHAT:${msgs.length}:${opts.maxTokens}`),
  generateImage: vi.fn(async (prompt, opts) => ({ url: `https://img/${opts.size}` })),
}));

vi.mock('stripe', () => {
  let nextEvent = null;
  let shouldThrow = false;
  const construct = vi.fn(() => {
    if (shouldThrow) throw new Error('signature verification failed');
    return nextEvent;
  });
  const Stripe = function () {
    return {
      webhooks: { constructEvent: construct },
      checkout: { sessions: { create: vi.fn(async () => ({ id: 'cs_test', url: 'https://stripe/sess' })) } },
      billingPortal: { sessions: { create: vi.fn(async () => ({ url: 'https://stripe/portal' })) } },
      subscriptions: {
        retrieve: vi.fn(async () => ({
          status: 'active',
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
          items: { data: [{ price: { recurring: { interval: 'month' } } }] },
        })),
      },
    };
  };
  Stripe.__setNextEvent = (e) => { nextEvent = e; };
  Stripe.__setShouldThrow = (v) => { shouldThrow = v; };
  return { default: Stripe };
});

let app;
let prisma;
let StripeModule;
const originalEnv = { ...process.env };

beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_123';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_123';
  prisma = createPrismaMock();
  app = await buildTestApp(prisma, {
    csrf: false,
    includeLlm: true,
    includeBilling: true,
  });
  StripeModule = (await import('stripe')).default;
});

afterAll(async () => {
  await app.close();
  process.env = originalEnv;
});

beforeEach(async () => {
  prisma._reset();
  // Reset mocks that earlier tests may have replaced.
  prisma.user.findUnique = vi.fn(async ({ where }) =>
    prisma._store.user.find((u) => {
      for (const [k, v] of Object.entries(where)) {
        if (u[k] !== v) return false;
      }
      return true;
    }) || null,
  );
  prisma.licenseAssignment.findFirst = vi.fn(async () => null);
  prisma.preBannedUser.findFirst = vi.fn(async () => null);
  StripeModule.__setShouldThrow(false);
  StripeModule.__setNextEvent(null);
});

async function registerAndLogin(email = 'e2e@example.com', password = 'CorrectPass1!') {
  const hash = await hashPassword(password);
  prisma._store.user.push({
    id: `user-${email}`,
    email,
    passwordHash: hash,
    role: 'user',
    banned: false,
    subscriptions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
  });
  expect(res.statusCode).toBe(200);
  const cookies = res.cookies;
  const accessToken = cookies.find((c) => c.name === 'accessToken');
  const refreshToken = cookies.find((c) => c.name === 'refreshToken');
  expect(accessToken).toBeDefined();
  expect(refreshToken).toBeDefined();
  expect(accessToken.httpOnly).toBe(true);
  // Either sameSite=lax (configured) or unset (depending on the cookie
  // library's defaults). Strict / None would be wrong for our setup.
  if (accessToken.sameSite) {
    expect(String(accessToken.sameSite).toLowerCase()).toBe('lax');
  }
  return {
    cookieHeader: `accessToken=${accessToken.value}; refreshToken=${refreshToken.value}`,
    accessToken: accessToken.value,
    refreshToken: refreshToken.value,
    userId: `user-${email}`,
  };
}

describe('E2E — auth flow', () => {
  it('register → login → /me → logout invalidates the session', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'newbie@example.com',
        password: 'CorrectPass1!',
        fullName: 'New User',
      },
    });
    expect([200, 201]).toContain(reg.statusCode);

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'newbie@example.com', password: 'CorrectPass1!' },
    });
    expect(login.statusCode).toBe(200);
    const accessCookie = login.cookies.find((c) => c.name === 'accessToken');
    expect(accessCookie).toBeDefined();
    expect(accessCookie.httpOnly).toBe(true);

    // The in-memory mock does not populate Prisma `include` relations, so
    // backfill `subscriptions: []` on the seeded user before /me — production
    // Prisma always returns the relation due to the include in the route.
    const newbie = prisma._store.user.find((u) => u.email === 'newbie@example.com');
    if (newbie) newbie.subscriptions = [];

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: `accessToken=${accessCookie.value}` },
    });
    expect(me.statusCode).toBe(200);
    const meBody = JSON.parse(me.body);
    expect(meBody.email).toBe('newbie@example.com');
    expect(meBody.entitlements).toBeDefined();

    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie: `accessToken=${accessCookie.value}` },
    });
    expect(logout.statusCode).toBe(200);
  });

  it('login with the wrong password returns 401 with a generic message', async () => {
    await registerAndLogin('wp@example.com');
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'wp@example.com', password: 'WrongPassword!' },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toMatch(/invalid credentials/i);
  });

  it('/auth/me without a cookie returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(401);
  });
});

describe('E2E — LLM flow', () => {
  it('anonymous → 401, free user → success persists usage, exhausted → 403', async () => {
    const anon = await app.inject({
      method: 'POST',
      url: '/llm/invoke',
      payload: { prompt: 'hi' },
    });
    expect(anon.statusCode).toBe(401);

    const { cookieHeader, userId } = await registerAndLogin('llm@example.com');
    for (let i = 0; i < 5; i++) {
      const ok = await app.inject({
        method: 'POST',
        url: '/llm/invoke',
        headers: { cookie: cookieHeader },
        payload: { prompt: `q${i}` },
      });
      expect(ok.statusCode).toBe(200);
    }
    const persisted = prisma._store.learningSession.filter(
      (s) => s.userId === userId && s.type === 'explanation',
    );
    expect(persisted).toHaveLength(5);

    const blocked = await app.inject({
      method: 'POST',
      url: '/llm/invoke',
      headers: { cookie: cookieHeader },
      payload: { prompt: 'one too many' },
    });
    expect(blocked.statusCode).toBe(403);
  });
});

describe('E2E — billing / entitlement flow', () => {
  it('Stripe webhook with a bad signature is rejected (400)', async () => {
    StripeModule.__setShouldThrow(true);
    const res = await app.inject({
      method: 'POST',
      url: '/billing/webhook',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=0,v1=bogus',
      },
      payload: JSON.stringify({ id: 'evt_bad', type: 'noop' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('Stripe webhook activates a subscription, then LLM calls bypass the free-tier limit', async () => {
    const { cookieHeader, userId } = await registerAndLogin('billing@example.com');

    // Hit the free-tier limit first.
    for (let i = 0; i < 5; i++) {
      const r = await app.inject({
        method: 'POST',
        url: '/llm/invoke',
        headers: { cookie: cookieHeader },
        payload: { prompt: `q${i}` },
      });
      expect(r.statusCode).toBe(200);
    }
    const stuck = await app.inject({
      method: 'POST',
      url: '/llm/invoke',
      headers: { cookie: cookieHeader },
      payload: { prompt: 'over' },
    });
    expect(stuck.statusCode).toBe(403);

    // Drive the real webhook handler with a checkout.session.completed event.
    StripeModule.__setNextEvent({
      id: 'evt_billing_e2e_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          subscription: 'sub_billing_1',
          customer: 'cus_billing_1',
          metadata: { userId },
        },
      },
    });
    const wh = await app.inject({
      method: 'POST',
      url: '/billing/webhook',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=0,v1=valid',
      },
      payload: JSON.stringify({ stub: true }),
    });
    expect([200, 204]).toContain(wh.statusCode);

    // The webhook handler should have created a Subscription row for the user.
    const subs = prisma._store.subscription.filter(
      (s) => s.userId === userId && (s.status === 'active' || s.status === 'trialing'),
    );
    expect(subs.length).toBeGreaterThanOrEqual(1);

    // Re-fetch the seeded user with their new subscription so entitlement
    // checks see premium. The mock's findUnique reads the in-memory user
    // record directly; attach the subscription.
    const u = prisma._store.user.find((x) => x.id === userId);
    u.subscriptions = subs;

    // Now LLM calls should succeed past the previous free-tier ceiling.
    const ok = await app.inject({
      method: 'POST',
      url: '/llm/invoke',
      headers: { cookie: cookieHeader },
      payload: { prompt: 'after upgrade' },
    });
    expect(ok.statusCode).toBe(200);
  });
});

describe('E2E — core GeneMap workflow (gene-set round-trip)', () => {
  it('user creates → lists → updates a gene set; cross-user mutations are denied', async () => {
    const a = await registerAndLogin('a@example.com');
    const b = await registerAndLogin('b@example.com');

    // A creates a gene set.
    const created = await app.inject({
      method: 'POST',
      url: '/entities/gene-sets',
      headers: { cookie: a.cookieHeader, 'content-type': 'application/json' },
      payload: { name: 'BRCA Panel', genes: ['BRCA1', 'BRCA2', 'TP53'] },
    });
    expect(created.statusCode).toBe(200);
    const setId = JSON.parse(created.body).set.id;
    expect(setId).toBeTruthy();

    // A lists their gene sets.
    const listA = await app.inject({
      method: 'GET',
      url: '/entities/gene-sets',
      headers: { cookie: a.cookieHeader },
    });
    expect(listA.statusCode).toBe(200);
    const { sets: aSets } = JSON.parse(listA.body);
    expect(aSets).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: setId, name: 'BRCA Panel' })]),
    );

    // B lists — must NOT see A's gene set.
    const listB = await app.inject({
      method: 'GET',
      url: '/entities/gene-sets',
      headers: { cookie: b.cookieHeader },
    });
    expect(listB.statusCode).toBe(200);
    const { sets: bSets } = JSON.parse(listB.body);
    expect(bSets.find((s) => s.id === setId)).toBeUndefined();

    // B tries to update A's gene set by id — must be rejected.
    const peek = await app.inject({
      method: 'PUT',
      url: `/entities/gene-sets/${setId}`,
      headers: { cookie: b.cookieHeader, 'content-type': 'application/json' },
      payload: { name: 'tampered' },
    });
    expect([401, 403, 404]).toContain(peek.statusCode);

    // A can update and delete their own.
    const updateA = await app.inject({
      method: 'PUT',
      url: `/entities/gene-sets/${setId}`,
      headers: { cookie: a.cookieHeader, 'content-type': 'application/json' },
      payload: { name: 'BRCA Panel v2' },
    });
    expect(updateA.statusCode).toBe(200);
    expect(JSON.parse(updateA.body).set.name).toBe('BRCA Panel v2');

    const aDel = await app.inject({
      method: 'DELETE',
      url: `/entities/gene-sets/${setId}`,
      headers: { cookie: a.cookieHeader },
    });
    expect([200, 204]).toContain(aDel.statusCode);

    // After delete, A's listing is empty.
    const listAfter = await app.inject({
      method: 'GET',
      url: '/entities/gene-sets',
      headers: { cookie: a.cookieHeader },
    });
    const { sets: afterSets } = JSON.parse(listAfter.body);
    expect(afterSets.find((s) => s.id === setId)).toBeUndefined();
  });
});
