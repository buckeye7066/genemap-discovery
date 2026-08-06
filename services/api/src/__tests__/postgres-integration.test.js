import { PrismaClient } from '@prisma/client';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { buildTestApp } from './setup.js';
import {
  SELF_SERVICE_PURGE_TYPES,
  claimDueDeletionRequests,
  pruneExpiredSessions,
} from '../services/privacyMaintenance.js';

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
    // Scoped to the Stripe-driven row itself (not a bare total count): every
    // new registration also gets its own always-on signup-trial comp
    // (planType 'admin_granted', see utils/signupTrial.js), so the buyer now
    // legitimately has 2 subscription rows. What this test actually verifies —
    // that concurrent webhook delivery for the SAME Stripe subscription is
    // deduplicated into one row — is unaffected.
    await expect(
      prisma.subscription.count({ where: { stripeSubscriptionId: 'sub_pg_1' } })
    ).resolves.toBe(1);
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

  it('preserves pseudonymous privacy evidence when a local account is deleted', async () => {
    const admin = await registerUser('privacy-admin@example.com');
    await prisma.user.update({
      where: { id: admin.user.id },
      data: { role: 'super_admin' },
    });
    const target = await registerUser('privacy-target@example.com');
    const targetUser = await prisma.user.findUnique({ where: { id: target.user.id } });
    const subjectRef = targetUser.privacySubjectRef;
    const requestedAt = new Date('2026-08-06T12:00:00.000Z');

    const consent = await prisma.consentRecord.create({
      data: {
        userId: target.user.id,
        subjectRef,
        consentType: 'research',
        version: '1.0',
        granted: true,
        ipAddress: '192.0.2.20',
        metadata: { email: target.user.email },
      },
    });
    const pending = await prisma.dataDeletionRequest.create({
      data: {
        userId: target.user.id,
        subjectRef,
        scope: 'legacy_content_v1',
        status: 'pending',
        requestedAt,
        requestedTypes: [...SELF_SERVICE_PURGE_TYPES],
        deletedTypes: [],
        nextAttemptAt: requestedAt,
      },
    });
    const completed = await prisma.dataDeletionRequest.create({
      data: {
        userId: target.user.id,
        subjectRef,
        scope: 'legacy_content_v1',
        status: 'completed',
        requestedAt,
        completedAt: requestedAt,
        requestedTypes: [...SELF_SERVICE_PURGE_TYPES],
        deletedTypes: [...SELF_SERVICE_PURGE_TYPES],
        nextAttemptAt: null,
      },
    });
    await prisma.searchHistory.create({
      data: {
        userId: target.user.id,
        query: 'private query',
        queryType: 'general',
      },
    });

    const response = await app.inject({
      method: 'DELETE',
      url: `/admin/users/${target.user.id}`,
      headers: { cookie: admin.cookie },
    });
    expect(response.statusCode).toBe(200);

    await expect(prisma.user.findUnique({ where: { id: target.user.id } })).resolves.toBeNull();
    await expect(prisma.session.count({ where: { userId: target.user.id } })).resolves.toBe(0);
    await expect(prisma.searchHistory.count({ where: { userId: target.user.id } })).resolves.toBe(0);

    const retainedConsent = await prisma.consentRecord.findUnique({ where: { id: consent.id } });
    expect(retainedConsent).toMatchObject({
      userId: null,
      subjectRef,
      ipAddress: null,
      metadata: { erasedOnAccountDeletion: true },
    });

    const retainedRequests = await prisma.dataDeletionRequest.findMany({
      where: { id: { in: [pending.id, completed.id] } },
      orderBy: { id: 'asc' },
    });
    expect(retainedRequests).toHaveLength(2);
    for (const request of retainedRequests) {
      expect(request).toMatchObject({
        userId: null,
        subjectRef,
        status: 'completed',
        deletedTypes: SELF_SERVICE_PURGE_TYPES,
      });
    }

    const audit = await prisma.auditLog.findFirst({
      where: {
        userId: admin.user.id,
        action: 'local_account_deleted',
        entityId: subjectRef,
      },
    });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit?.metadata || {})).not.toContain(target.user.email);
  });

  it('claims one due deletion exactly once under concurrent workers', async () => {
    const subject = await registerUser('privacy-claim@example.com');
    const subjectUser = await prisma.user.findUnique({ where: { id: subject.user.id } });
    const now = new Date();
    await prisma.dataDeletionRequest.create({
      data: {
        userId: subject.user.id,
        subjectRef: subjectUser.privacySubjectRef,
        scope: 'legacy_content_v1',
        status: 'pending',
        requestedTypes: [...SELF_SERVICE_PURGE_TYPES],
        deletedTypes: [],
        nextAttemptAt: new Date(now.getTime() - 1),
      },
    });

    const [left, right] = await Promise.all([
      claimDueDeletionRequests(prisma, { now, limit: 1 }),
      claimDueDeletionRequests(prisma, { now, limit: 1 }),
    ]);
    expect([...left, ...right]).toHaveLength(1);

    const stored = await prisma.dataDeletionRequest.findFirst({
      where: { subjectRef: subjectUser.privacySubjectRef },
    });
    expect(stored).toMatchObject({ status: 'processing', attemptCount: 1 });
  });

  it('deletes expired sessions at the exact boundary and retains future sessions', async () => {
    const subject = await registerUser('privacy-sessions@example.com');
    const now = new Date();
    await prisma.session.deleteMany({ where: { userId: subject.user.id } });
    await prisma.session.createMany({
      data: [
        {
          userId: subject.user.id,
          refreshTokenHash: 'expired',
          expiresAt: new Date(now.getTime() - 1),
        },
        {
          userId: subject.user.id,
          refreshTokenHash: 'boundary',
          expiresAt: now,
        },
        {
          userId: subject.user.id,
          refreshTokenHash: 'future',
          expiresAt: new Date(now.getTime() + 60_000),
        },
      ],
    });

    await expect(pruneExpiredSessions(prisma, { now })).resolves.toEqual({ count: 2 });
    const remaining = await prisma.session.findMany({ where: { userId: subject.user.id } });
    expect(remaining.map((session) => session.refreshTokenHash)).toEqual(['future']);
  });

});
