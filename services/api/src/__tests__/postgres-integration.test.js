import { PrismaClient } from '@prisma/client';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { buildTestApp } from './setup.js';

vi.mock('stripe', () => {
  let nextEvent = null;
  const Stripe = function () {
    return {
      webhooks: { constructEvent: vi.fn(() => nextEvent) },
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
  Stripe.__setNextEvent = (event) => { nextEvent = event; };
  return { default: Stripe };
});

const runIfPostgres = process.env.TEST_DB === 'postgres' ? describe : describe.skip;

let app;
let prisma;
let Stripe;

async function resetDb() {
  await prisma.projectAnnotation.deleteMany();
  await prisma.projectCollaborator.deleteMany();
  await prisma.projectVersion.deleteMany();
  await prisma.researchProject.deleteMany();
  await prisma.licenseUsageLog.deleteMany();
  await prisma.licenseAssignment.deleteMany();
  await prisma.institutionalLicense.deleteMany();
  await prisma.stripeEvent.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.session.deleteMany();
  await prisma.learningSession.deleteMany();
  await prisma.learningProgress.deleteMany();
  await prisma.searchHistory.deleteMany();
  await prisma.userActivity.deleteMany();
  await prisma.medicalData.deleteMany();
  await prisma.aIConversation.deleteMany();
  await prisma.geneSet.deleteMany();
  await prisma.message.deleteMany();
  await prisma.consentRecord.deleteMany();
  await prisma.dataDeletionRequest.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.preBannedUser.deleteMany();
  await prisma.user.deleteMany();
}

function cookieHeaderFrom(response) {
  const setCookie = response.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie].filter(Boolean);
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

async function registerUser(email) {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'password123' },
  });
  expect(res.statusCode).toBe(200);
  return {
    user: JSON.parse(res.body).user,
    cookie: cookieHeaderFrom(res),
  };
}

function postWebhook() {
  return app.inject({
    method: 'POST',
    url: '/billing/webhook',
    headers: { 'stripe-signature': 't=1,v1=mock', 'content-type': 'application/json' },
    payload: '{}',
  });
}

runIfPostgres('Postgres integration smoke', () => {
  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    prisma = new PrismaClient();
    app = await buildTestApp(prisma, { csrf: false, includeBilling: true });
    Stripe = (await import('stripe')).default;
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb();
  });

  it('runs register, login, /auth/me, and logout against real Prisma', async () => {
    const registered = await registerUser('integration-auth@example.com');

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: registered.cookie },
    });
    expect(me.statusCode).toBe(200);
    expect(JSON.parse(me.body).email).toBe('integration-auth@example.com');

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'integration-auth@example.com', password: 'password123' },
    });
    expect(login.statusCode).toBe(200);
    const loginCookie = cookieHeaderFrom(login);

    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie: loginCookie },
    });
    expect(logout.statusCode).toBe(200);
    await expect(prisma.session.count()).resolves.toBe(0);
  });

  it('deduplicates concurrent webhook delivery for subscriptions and licenses', async () => {
    const buyer = await registerUser('buyer@example.com');

    Stripe.__setNextEvent({
      id: 'evt_pg_subscription',
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { userId: buyer.user.id },
          subscription: 'sub_pg_1',
          customer: 'cus_pg_1',
        },
      },
    });
    const subscriptionResponses = await Promise.all([postWebhook(), postWebhook()]);
    expect(subscriptionResponses.map((res) => res.statusCode)).toEqual([200, 200]);
    await expect(prisma.subscription.count()).resolves.toBe(1);
    await expect(prisma.stripeEvent.count({ where: { stripeEventId: 'evt_pg_subscription' } })).resolves.toBe(1);

    Stripe.__setNextEvent({
      id: 'evt_pg_license',
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: {
            userId: buyer.user.id,
            isInstitutional: 'true',
            organizationName: 'Integration Lab',
            contactEmail: 'admin@integration.test',
            licenseType: 'team',
            seats: '5',
          },
          subscription: 'sub_pg_license',
          customer: 'cus_pg_license',
        },
      },
    });
    const licenseResponses = await Promise.all([postWebhook(), postWebhook()]);
    expect(licenseResponses.map((res) => res.statusCode)).toEqual([200, 200]);
    await expect(prisma.institutionalLicense.count()).resolves.toBe(1);
    await expect(prisma.stripeEvent.count({ where: { stripeEventId: 'evt_pg_license' } })).resolves.toBe(1);
  });

  it('enforces project row scoping with real relations', async () => {
    const owner = await registerUser('owner-pg@example.com');
    const member = await registerUser('member-pg@example.com');
    const outsider = await registerUser('outsider-pg@example.com');

    const created = await app.inject({
      method: 'POST',
      url: '/entities/projects',
      headers: { cookie: owner.cookie },
      payload: { title: 'Real DB project', genes: ['BRCA1'] },
    });
    expect(created.statusCode).toBe(200);
    const project = JSON.parse(created.body).project;

    const outsiderUpdate = await app.inject({
      method: 'PUT',
      url: `/entities/projects/${project.id}`,
      headers: { cookie: outsider.cookie },
      payload: { title: 'Nope' },
    });
    expect(outsiderUpdate.statusCode).toBe(403);

    const addCollaborator = await app.inject({
      method: 'POST',
      url: `/entities/projects/${project.id}/collaborators`,
      headers: { cookie: owner.cookie },
      payload: { userEmail: member.user.email, role: 'viewer' },
    });
    expect(addCollaborator.statusCode).toBe(200);

    const memberVersions = await app.inject({
      method: 'GET',
      url: `/entities/projects/${project.id}/versions`,
      headers: { cookie: member.cookie },
    });
    expect(memberVersions.statusCode).toBe(200);

    const memberUpdate = await app.inject({
      method: 'PUT',
      url: `/entities/projects/${project.id}`,
      headers: { cookie: member.cookie },
      payload: { title: 'Viewer cannot edit project' },
    });
    expect(memberUpdate.statusCode).toBe(403);
  });
});
