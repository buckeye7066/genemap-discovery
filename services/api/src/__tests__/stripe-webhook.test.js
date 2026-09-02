import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
  authCookie,
  buildTestApp,
  createPrismaMock,
  seedAuthUser,
} from './setup.js';

// Stub the Stripe SDK so we control signature verification + retrieves.
vi.mock('stripe', () => {
  let nextEvent = null;
  let shouldThrow = false;
  let nextSubscription = null;
  let nextCheckoutSession = null;
  let checkoutCounter = 0;
  const checkoutSessions = new Map();
  const priceOverrides = new Map();
  const keyForEvent = () => {
    const metadata = nextEvent?.data?.object?.metadata || {};
    return metadata.isInstitutional === 'true'
      ? `${metadata.licenseType}_${metadata.billing}`
      : metadata.plan || 'monthly';
  };
  const priceForKey = (key) => priceOverrides.get(key) || ({
    id: `price_test_${key}`,
    active: true,
    type: 'recurring',
    unit_amount: key.includes('enterprise') ? 599 : key.includes('department') ? 699 : key.includes('team') ? 799 : key === 'yearly' ? 9999 : 999,
    currency: 'usd',
    recurring: { interval: key.endsWith('yearly') ? 'year' : 'month' },
  });
  const defaultSubscription = () => {
    const key = keyForEvent();
    const metadata = nextEvent?.data?.object?.metadata || {};
    const eventObject = nextEvent?.data?.object || {};
    const id = typeof eventObject.subscription === 'string'
      ? eventObject.subscription
      : eventObject.subscription?.id || eventObject.id;
    return ({
      id,
      status: 'active',
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      cancel_at_period_end: false,
      items: { data: [{
        price: priceForKey(key),
        quantity: metadata.isInstitutional === 'true' ? Number(metadata.seats) : 1,
      }] },
    });
  };
  const mockConstruct = vi.fn((rawBody, sig, secret) => {
    if (shouldThrow) throw new Error('signature verification failed');
    if (!sig) throw new Error('missing signature');
    return nextEvent;
  });
  const checkoutCreate = vi.fn(async (params) => {
    checkoutCounter += 1;
    const session = {
      id: `cs_test_${checkoutCounter}`,
      url: `https://stripe/sess/${checkoutCounter}`,
      status: 'open',
      mode: params.mode,
      metadata: params.metadata,
      expires_at: params.expires_at,
    };
    checkoutSessions.set(session.id, session);
    return session;
  });
  const checkoutRetrieve = vi.fn(async (id) => nextCheckoutSession || checkoutSessions.get(id) || null);
  const checkoutExpire = vi.fn(async (id) => {
    const session = checkoutSessions.get(id);
    if (session) session.status = 'expired';
    return session || { id, status: 'expired' };
  });
  const Stripe = function () {
    return {
      webhooks: { constructEvent: mockConstruct },
      checkout: {
        sessions: {
          create: checkoutCreate,
          retrieve: checkoutRetrieve,
          expire: checkoutExpire,
        },
      },
      billingPortal: { sessions: { create: vi.fn(async () => ({ url: 'https://stripe/portal' })) } },
      prices: {
        retrieve: vi.fn(async (id) => {
          const prefix = 'price_test_';
          return priceForKey(id.startsWith(prefix) ? id.slice(prefix.length) : id);
        }),
      },
      subscriptions: {
        retrieve: vi.fn(async () => nextSubscription || defaultSubscription()),
      },
    };
  };
  Stripe.__setNextEvent = (e) => { nextEvent = e; };
  Stripe.__setShouldThrow = (v) => { shouldThrow = v; };
  Stripe.__setSubscription = (value) => { nextSubscription = value; };
  Stripe.__setCheckoutSession = (value) => { nextCheckoutSession = value; };
  Stripe.__checkoutCreate = checkoutCreate;
  Stripe.__checkoutRetrieve = checkoutRetrieve;
  Stripe.__checkoutExpire = checkoutExpire;
  Stripe.__clearCheckoutSessions = () => {
    checkoutSessions.clear();
    checkoutCounter = 0;
    checkoutCreate.mockClear();
    checkoutRetrieve.mockClear();
    checkoutExpire.mockClear();
  };
  Stripe.__setPrice = (key, value) => { priceOverrides.set(key, value); };
  Stripe.__clearPrices = () => { priceOverrides.clear(); };
  return { default: Stripe };
});

let app;
let prisma;
let Stripe;

beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  process.env.STRIPE_PRICE_MONTHLY = 'price_test_monthly';
  process.env.STRIPE_PRICE_YEARLY = 'price_test_yearly';
  process.env.STRIPE_PRICE_TEAM_MONTHLY = 'price_test_team_monthly';
  process.env.STRIPE_PRICE_TEAM_YEARLY = 'price_test_team_yearly';
  process.env.STRIPE_PRICE_DEPT_MONTHLY = 'price_test_department_monthly';
  process.env.STRIPE_PRICE_DEPT_YEARLY = 'price_test_department_yearly';
  process.env.STRIPE_PRICE_ENT_MONTHLY = 'price_test_enterprise_monthly';
  process.env.STRIPE_PRICE_ENT_YEARLY = 'price_test_enterprise_yearly';
  prisma = createPrismaMock();
  app = await buildTestApp(prisma, { csrf: false, includeBilling: true });
  Stripe = (await import('stripe')).default;
});

afterAll(async () => app.close());

beforeEach(() => {
  prisma._reset();
  Stripe.__setShouldThrow(false);
  Stripe.__setNextEvent(null);
  Stripe.__setSubscription(null);
  Stripe.__setCheckoutSession(null);
  Stripe.__clearCheckoutSessions();
  Stripe.__clearPrices();
});

describe('GET /billing/catalog', () => {
  const user = { userId: 'catalog-user', email: 'catalog@example.com', role: 'user' };

  it('returns amounts and seat bands verified from the configured Stripe prices', async () => {
    seedAuthUser(prisma, user);
    const res = await app.inject({
      method: 'GET',
      url: '/billing/catalog',
      headers: { cookie: authCookie(user, prisma) },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({
      version: 1,
      personal: {
        monthly: { amountMinor: 999, currency: 'usd', interval: 'month' },
        yearly: { amountMinor: 9999, currency: 'usd', interval: 'year' },
      },
      institutional: {
        team: { minSeats: 5, maxSeats: 20 },
        department: { minSeats: 21, maxSeats: 99 },
        enterprise: { minSeats: 100, maxSeats: 1_000 },
      },
    });
  });

  it('does not publish or permit checkout with a mismatched Stripe interval', async () => {
    seedAuthUser(prisma, user);
    Stripe.__setPrice('monthly', {
      id: 'price_test_monthly',
      active: true,
      type: 'recurring',
      unit_amount: 999,
      currency: 'usd',
      recurring: { interval: 'year' },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/billing/catalog',
      headers: { cookie: authCookie(user, prisma) },
    });

    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).code).toBe('BILLING_CATALOG_UNAVAILABLE');
  });

  it.each([false, undefined])('does not publish a Stripe price unless active is exactly true (%s)', async (active) => {
    seedAuthUser(prisma, user);
    Stripe.__setPrice('monthly', {
      id: 'price_test_monthly',
      active,
      type: 'recurring',
      unit_amount: 999,
      currency: 'usd',
      recurring: { interval: 'month' },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/billing/catalog',
      headers: { cookie: authCookie(user, prisma) },
    });

    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).code).toBe('BILLING_CATALOG_UNAVAILABLE');
  });
});

describe('POST /billing/checkout-session', () => {
  const buyer = { userId: 'personal-buyer', email: 'personal@example.com', role: 'user' };

  function checkout(plan = 'monthly') {
    seedAuthUser(prisma, buyer);
    return app.inject({
      method: 'POST',
      url: '/billing/checkout-session',
      headers: {
        cookie: authCookie(buyer, prisma),
        'content-type': 'application/json',
      },
      payload: {
        plan,
        successUrl: 'http://localhost:5173/premium?success=true',
        cancelUrl: 'http://localhost:5173/premium?canceled=true',
      },
    });
  }

  it('refuses a second checkout when a verified paid subscription is already active', async () => {
    seedAuthUser(prisma, buyer);
    prisma._store.subscription.push({
      id: 'existing-paid',
      userId: buyer.userId,
      stripeCustomerId: 'cus_existing',
      stripeSubscriptionId: 'sub_existing',
      status: 'active',
      planType: 'month',
      currentPeriodEnd: new Date(Date.now() + 86_400_000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await checkout();

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('ACTIVE_SUBSCRIPTION_EXISTS');
    expect(Stripe.__checkoutCreate).not.toHaveBeenCalled();
  });

  it('allows a complimentary user to start a paid checkout and records the session atomically', async () => {
    seedAuthUser(prisma, buyer);
    prisma._store.subscription.push({
      id: 'complimentary',
      userId: buyer.userId,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      status: 'active',
      planType: 'admin_granted',
      currentPeriodEnd: new Date(Date.now() + 86_400_000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await checkout();

    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ reused: false });
    expect(Stripe.__checkoutCreate).toHaveBeenCalledTimes(1);
    expect(prisma._store.auditLog).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userId: buyer.userId,
        action: 'billing.checkout_created',
        metadata: expect.objectContaining({ sessionId: res.json().sessionId, plan: 'monthly' }),
      }),
    ]));
  });

  it('reuses the same open Stripe session on a repeated request', async () => {
    const first = await checkout('monthly');
    const second = await checkout('monthly');

    expect(first.statusCode, first.body).toBe(200);
    expect(second.statusCode, second.body).toBe(200);
    expect(second.json()).toMatchObject({
      sessionId: first.json().sessionId,
      url: first.json().url,
      reused: true,
    });
    expect(Stripe.__checkoutCreate).toHaveBeenCalledTimes(1);
  });

  it('expires an open session before replacing it with a different personal plan', async () => {
    const monthly = await checkout('monthly');
    const yearly = await checkout('yearly');

    expect(monthly.statusCode, monthly.body).toBe(200);
    expect(yearly.statusCode, yearly.body).toBe(200);
    expect(yearly.json().sessionId).not.toBe(monthly.json().sessionId);
    expect(Stripe.__checkoutExpire).toHaveBeenCalledWith(monthly.json().sessionId);
    expect(Stripe.__checkoutCreate).toHaveBeenCalledTimes(2);
  });

  it('does not create another subscription while a completed checkout awaits its webhook', async () => {
    const first = await checkout('monthly');
    Stripe.__setCheckoutSession({
      id: first.json().sessionId,
      url: first.json().url,
      status: 'complete',
      mode: 'subscription',
      metadata: { userId: buyer.userId, plan: 'monthly' },
    });

    const second = await checkout('monthly');

    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('CHECKOUT_ACTIVATION_PENDING');
    expect(Stripe.__checkoutCreate).toHaveBeenCalledTimes(1);
  });

  it('expires the external session and rolls back when its required receipt fails', async () => {
    prisma.auditLog.create.mockRejectedValueOnce(new Error('audit unavailable'));

    const res = await checkout('monthly');

    expect(res.statusCode).toBe(500);
    expect(Stripe.__checkoutCreate).toHaveBeenCalledTimes(1);
    const sessionId = Stripe.__checkoutCreate.mock.results[0].value
      ? (await Stripe.__checkoutCreate.mock.results[0].value).id
      : null;
    expect(Stripe.__checkoutExpire).toHaveBeenCalledWith(sessionId);
    expect(prisma._store.auditLog).toHaveLength(0);
  });
});

describe('POST /billing/institutional-checkout', () => {
  const buyer = { userId: 'institution-buyer', email: 'buyer@example.com', role: 'user' };

  function checkout(seats, licenseType) {
    seedAuthUser(prisma, buyer);
    return app.inject({
      method: 'POST',
      url: '/billing/institutional-checkout',
      headers: {
        cookie: authCookie(buyer, prisma),
        'content-type': 'application/json',
      },
      payload: {
        organizationName: 'Example Institute',
        contactEmail: buyer.email,
        licenseType,
        billing: 'monthly',
        seats,
        successUrl: 'http://localhost:5173/institutionalpricing?success=true',
        cancelUrl: 'http://localhost:5173/institutionalpricing?canceled=true',
        _selfTest: true,
      },
    });
  }

  function liveCheckout(overrides = {}) {
    seedAuthUser(prisma, buyer);
    return app.inject({
      method: 'POST',
      url: '/billing/institutional-checkout',
      headers: {
        cookie: authCookie(buyer, prisma),
        'content-type': 'application/json',
      },
      payload: {
        organizationName: 'Example Institute',
        contactEmail: buyer.email,
        licenseType: 'team',
        billing: 'monthly',
        seats: 5,
        successUrl: 'http://localhost:5173/institutionalpricing?success=true',
        cancelUrl: 'http://localhost:5173/institutionalpricing?canceled=true',
        ...overrides,
      },
    });
  }

  it.each([
    ['team', 21],
    ['department', 20],
    ['department', 100],
    ['enterprise', 99],
  ])('rejects %s checkout outside its server-owned seat band', async (licenseType, seats) => {
    const res = await checkout(seats, licenseType);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/require between/iu);
  });

  it('rejects an institutional checkout above the global seat ceiling', async () => {
    const res = await checkout(1_001, 'enterprise');
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('Validation failed');
  });

  it.each([
    ['team', 5],
    ['team', 20],
    ['department', 21],
    ['department', 99],
    ['enterprise', 100],
    ['enterprise', 1_000],
  ])('accepts %s checkout at a valid seat boundary', async (licenseType, seats) => {
    const res = await checkout(seats, licenseType);
    expect(res.statusCode, res.body).toBe(200);
    expect(JSON.parse(res.body).sessionId).toMatch(/^cs_test_mock_institutional_/u);
  });

  it('reuses an open checkout for the same organization and exact license terms', async () => {
    const first = await liveCheckout();
    const second = await liveCheckout();

    expect(first.statusCode, first.body).toBe(200);
    expect(second.statusCode, second.body).toBe(200);
    expect(second.json()).toMatchObject({
      sessionId: first.json().sessionId,
      url: first.json().url,
      reused: true,
    });
    expect(Stripe.__checkoutCreate).toHaveBeenCalledTimes(1);
  });

  it('expires an open organization checkout before replacing changed terms', async () => {
    const first = await liveCheckout();
    const changed = await liveCheckout({ billing: 'yearly' });

    expect(first.statusCode, first.body).toBe(200);
    expect(changed.statusCode, changed.body).toBe(200);
    expect(changed.json().sessionId).not.toBe(first.json().sessionId);
    expect(Stripe.__checkoutExpire).toHaveBeenCalledWith(first.json().sessionId);
    expect(Stripe.__checkoutCreate).toHaveBeenCalledTimes(2);
  });

  it('does not create another license while the organization checkout awaits its webhook', async () => {
    const first = await liveCheckout();
    Stripe.__setCheckoutSession({
      id: first.json().sessionId,
      url: first.json().url,
      status: 'complete',
      mode: 'subscription',
      metadata: {
        userId: buyer.userId,
        organizationName: 'Example Institute',
        contactEmail: buyer.email,
        licenseType: 'team',
        billing: 'monthly',
        seats: '5',
        isInstitutional: 'true',
      },
    });

    const second = await liveCheckout();

    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('CHECKOUT_ACTIVATION_PENDING');
    expect(Stripe.__checkoutCreate).toHaveBeenCalledTimes(1);
  });

  it('refuses checkout when the same organization already has a current Stripe license', async () => {
    prisma._store.institutionalLicense.push({
      id: 'existing-license',
      organizationName: 'EXAMPLE   INSTITUTE',
      contactEmail: buyer.email.toUpperCase(),
      licenseType: 'team',
      maxSeats: 5,
      status: 'active',
      startDate: new Date(Date.now() - 60_000),
      endDate: new Date(Date.now() + 86_400_000),
      renewalDate: new Date(Date.now() + 86_400_000),
      stripeCustomerId: 'cus_existing_institution',
      stripeSubscriptionId: 'sub_existing_institution',
      adminUsers: [buyer.userId],
      pricing: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await liveCheckout();

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('ACTIVE_INSTITUTIONAL_LICENSE_EXISTS');
    expect(Stripe.__checkoutCreate).not.toHaveBeenCalled();
  });

  it('expires the institutional Stripe session and rolls back when its receipt fails', async () => {
    prisma.auditLog.create.mockRejectedValueOnce(new Error('audit unavailable'));

    const res = await liveCheckout();

    expect(res.statusCode).toBe(500);
    expect(Stripe.__checkoutCreate).toHaveBeenCalledTimes(1);
    const sessionId = (await Stripe.__checkoutCreate.mock.results[0].value).id;
    expect(Stripe.__checkoutExpire).toHaveBeenCalledWith(sessionId);
    expect(prisma._store.auditLog).toHaveLength(0);
  });
});

describe('POST /billing/portal-session', () => {
  it('uses the Stripe-owned subscription when a newer complimentary grant also exists', async () => {
    const user = { userId: 'portal-owner', email: 'portal@example.com', role: 'user' };
    seedAuthUser(prisma, user);
    prisma._store.subscription.push(
      {
        id: 'paid-subscription',
        userId: user.userId,
        stripeCustomerId: 'cus_paid_owner',
        stripeSubscriptionId: 'sub_paid_owner',
        status: 'active',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 'complimentary-grant',
        userId: user.userId,
        stripeCustomerId: null,
        stripeSubscriptionId: 'admin_granted_portal_owner',
        status: 'active',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
        updatedAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    );

    const res = await app.inject({
      method: 'POST',
      url: '/billing/portal-session',
      headers: {
        cookie: authCookie(user, prisma),
        'content-type': 'application/json',
      },
      payload: { returnUrl: 'http://localhost:5173/premium' },
    });

    expect(res.statusCode, res.body).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ url: 'https://stripe/portal' });
    expect(prisma._store.auditLog).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userId: user.userId,
        action: 'billing.portal_accessed',
      }),
    ]));
  });

  it('opens Stripe billing for an owner whose customer belongs to an institutional license', async () => {
    const user = { userId: 'institution-portal-owner', email: 'owner@institute.example', role: 'user' };
    seedAuthUser(prisma, user);
    prisma._store.institutionalLicense.push({
      id: 'managed-license',
      organizationName: 'Example Institute',
      contactEmail: user.email,
      licenseType: 'department',
      maxSeats: 25,
      assignedSeats: 0,
      status: 'active',
      startDate: new Date(Date.now() - 60_000),
      endDate: new Date(Date.now() + 86_400_000),
      renewalDate: new Date(Date.now() + 86_400_000),
      autoRenew: true,
      stripeCustomerId: 'cus_institution_owner',
      stripeSubscriptionId: 'sub_institution_owner',
      adminUsers: [user.userId],
      pricing: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/billing/portal-session',
      headers: {
        cookie: authCookie(user, prisma),
        'content-type': 'application/json',
      },
      payload: { returnUrl: 'http://localhost:5173/institutionaladmin' },
    });

    expect(res.statusCode, res.body).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ url: 'https://stripe/portal' });
    expect(prisma._store.auditLog).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userId: user.userId,
        action: 'billing.portal_accessed',
        entityType: 'institutional_license',
        entityId: 'managed-license',
      }),
    ]));
  });
});

describe('GET /billing/checkout-status', () => {
  const user = { userId: 'checkout-owner', email: 'owner@example.com', role: 'user' };

  function cookie() {
    seedAuthUser(prisma, user);
    return authCookie(user, prisma);
  }

  it('does not treat a completed Stripe redirect as an active entitlement before the webhook commit', async () => {
    Stripe.__setCheckoutSession({
      id: 'cs_test_processing',
      status: 'complete',
      subscription: 'sub_processing',
      metadata: { userId: user.userId },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/billing/checkout-status?sessionId=cs_test_processing',
      headers: { cookie: cookie() },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({
      state: 'processing',
      checkoutComplete: true,
      entitlementActive: false,
      kind: 'personal',
    });
  });

  it('confirms a personal checkout only after its exact subscription row is active', async () => {
    Stripe.__setCheckoutSession({
      id: 'cs_test_personal',
      status: 'complete',
      subscription: 'sub_personal',
      metadata: { userId: user.userId },
    });
    prisma._store.subscription.push({
      id: 'subscription-row', userId: user.userId,
      stripeSubscriptionId: 'sub_personal', stripeCustomerId: 'cus_personal',
      status: 'active', planType: 'month',
      currentPeriodEnd: new Date(Date.now() + 86_400_000),
      createdAt: new Date(), updatedAt: new Date(),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/billing/checkout-status?sessionId=cs_test_personal',
      headers: { cookie: cookie() },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({
      state: 'active', entitlementActive: true, kind: 'personal',
    });
  });

  it('confirms an institutional checkout only for its purchaser and exact license subscription', async () => {
    Stripe.__setCheckoutSession({
      id: 'cs_test_institution',
      status: 'complete',
      subscription: 'sub_institution',
      metadata: { userId: user.userId, isInstitutional: 'true' },
    });
    prisma._store.institutionalLicense.push({
      id: 'license-row', adminUsers: [user.userId],
      stripeSubscriptionId: 'sub_institution', status: 'active',
      startDate: new Date(Date.now() - 86_400_000),
      endDate: new Date(Date.now() + 86_400_000),
      createdAt: new Date(), updatedAt: new Date(),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/billing/checkout-status?sessionId=cs_test_institution',
      headers: { cookie: cookie() },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({
      state: 'active', entitlementActive: true, kind: 'institutional',
    });
  });

  it('rejects a valid Stripe session owned by another account', async () => {
    Stripe.__setCheckoutSession({
      id: 'cs_test_foreign',
      status: 'complete',
      subscription: 'sub_foreign',
      metadata: { userId: 'someone-else' },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/billing/checkout-status?sessionId=cs_test_foreign',
      headers: { cookie: cookie() },
    });

    expect(res.statusCode).toBe(403);
  });
});

function postWebhook(payload, sig = 't=1,v1=mock') {
  return app.inject({
    method: 'POST',
    url: '/billing/webhook',
    headers: { 'stripe-signature': sig, 'content-type': 'application/json' },
    payload: JSON.stringify(payload),
  });
}

describe('POST /billing/webhook', () => {
  beforeEach(() => {
    prisma._store.user.push({ id: 'u-admin', email: 'admin@acme.test', role: 'user' });
  });

  it('rejects when stripe-signature header is missing', async () => {
    Stripe.__setNextEvent({ id: 'evt_1', type: 'checkout.session.completed', data: { object: {} } });
    const res = await app.inject({
      method: 'POST',
      url: '/billing/webhook',
      payload: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects when signature verification throws', async () => {
    Stripe.__setShouldThrow(true);
    Stripe.__setNextEvent({ id: 'evt_2', type: 'checkout.session.completed', data: { object: {} } });
    const res = await postWebhook({ test: true });
    expect(res.statusCode).toBe(400);
    Stripe.__setShouldThrow(false);
  });

  it('records the event and processes a non-institutional checkout', async () => {
    prisma._store.user.push({ id: 'u-1', email: 'a@x.com', role: 'user' });
    Stripe.__setNextEvent({
      id: 'evt_ok',
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { userId: 'u-1' },
          subscription: 'sub_1',
          customer: 'cus_1',
        },
      },
    });
    const res = await postWebhook({});
    expect(res.statusCode).toBe(200);
    expect(prisma._store.subscription.length).toBe(1);
    expect(prisma._store.stripeEvent.length).toBe(1);
  });

  it('rejects a personal checkout whose Stripe price is not a published personal plan', async () => {
    prisma._store.user.push({ id: 'u-price-mismatch', email: 'mismatch@x.com', role: 'user' });
    Stripe.__setSubscription({
      status: 'active',
      current_period_start: 1_788_000_000,
      current_period_end: 1_790_592_000,
      cancel_at_period_end: false,
      items: { data: [{
        price: {
          id: 'price_test_team_monthly',
          active: true,
          type: 'recurring',
          unit_amount: 799,
          currency: 'usd',
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }] },
    });
    Stripe.__setNextEvent({
      id: 'evt_personal_price_mismatch',
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { userId: 'u-price-mismatch', plan: 'monthly' },
          subscription: 'sub_personal_price_mismatch',
          customer: 'cus_personal_price_mismatch',
        },
      },
    });

    const res = await postWebhook({});
    expect(res.statusCode).toBe(500);
    expect(prisma._store.subscription).toEqual([]);
    expect(prisma._store.stripeEvent).toEqual([]);
  });

  it('skips duplicate events without re-processing', async () => {
    prisma._store.stripeEvent.push({ id: 's1', stripeEventId: 'evt_dup', type: 'checkout.session.completed' });
    Stripe.__setNextEvent({
      id: 'evt_dup',
      type: 'checkout.session.completed',
      data: { object: { metadata: { userId: 'u-1' }, subscription: 'sub_1', customer: 'cus_1' } },
    });
    const res = await postWebhook({});
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).duplicate).toBe(true);
    // No new subscription should have been created from the duplicate.
    expect(prisma._store.subscription.length).toBe(0);
  });

  it('claims concurrent duplicate subscription checkouts before side effects', async () => {
    prisma._store.user.push({ id: 'u-1', email: 'a@x.com', role: 'user' });
    Stripe.__setNextEvent({
      id: 'evt_concurrent_subscription',
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { userId: 'u-1' },
          subscription: 'sub_concurrent',
          customer: 'cus_concurrent',
        },
      },
    });

    const responses = await Promise.all([postWebhook({}), postWebhook({})]);
    expect(responses.map((res) => res.statusCode)).toEqual([200, 200]);
    expect(responses.some((res) => JSON.parse(res.body).duplicate === true)).toBe(true);
    expect(prisma._store.subscription).toHaveLength(1);
    expect(prisma._store.stripeEvent).toHaveLength(1);
  });

  it('claims concurrent duplicate institutional checkouts before side effects', async () => {
    Stripe.__setNextEvent({
      id: 'evt_concurrent_license',
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: {
            userId: 'u-admin',
            isInstitutional: 'true',
            organizationName: 'Acme Genetics',
            contactEmail: 'admin@acme.test',
            licenseType: 'team',
            billing: 'monthly',
            seats: '5',
          },
          subscription: 'sub_license',
          customer: 'cus_license',
        },
      },
    });

    const responses = await Promise.all([postWebhook({}), postWebhook({})]);
    expect(responses.map((res) => res.statusCode)).toEqual([200, 200]);
    expect(responses.some((res) => JSON.parse(res.body).duplicate === true)).toBe(true);
    expect(prisma._store.institutionalLicense).toHaveLength(1);
    expect(prisma._store.stripeEvent).toHaveLength(1);
  });

  it('uses the verified Stripe billing period for an institutional license', async () => {
    const periodStart = 1_788_000_000;
    const periodEnd = periodStart + (30 * 24 * 60 * 60);
    Stripe.__setSubscription({
      status: 'trialing',
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: true,
      items: { data: [{
        price: {
          id: 'price_test_team_monthly',
          active: true,
          type: 'recurring',
          unit_amount: 799,
          currency: 'usd',
          recurring: { interval: 'month' },
        },
        quantity: 5,
      }] },
    });
    Stripe.__setNextEvent({
      id: 'evt_institution_period',
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: {
            userId: 'u-admin',
            isInstitutional: 'true',
            organizationName: 'Monthly Lab',
            contactEmail: 'admin@monthly.test',
            licenseType: 'team',
            billing: 'monthly',
            seats: '5',
          },
          subscription: 'sub_institution_period',
          customer: 'cus_institution_period',
        },
      },
    });

    const res = await postWebhook({});
    expect(res.statusCode).toBe(200);
    const license = prisma._store.institutionalLicense[0];
    expect(license.status).toBe('active');
    expect(license.startDate).toEqual(new Date(periodStart * 1000));
    expect(license.endDate).toEqual(new Date(periodEnd * 1000));
    expect(license.renewalDate).toEqual(new Date(periodEnd * 1000));
    expect(license.autoRenew).toBe(false);
    expect(license.pricing).toEqual({
      billing: 'monthly',
      currency: 'usd',
      amountMinor: 799,
      interval: 'month',
    });
  });

  it('accepts the signed webhook metadata emitted by the live institutional checkout route', async () => {
    const principal = { userId: 'u-admin', email: 'admin@acme.test', role: 'user' };
    const checkout = await app.inject({
      method: 'POST',
      url: '/billing/institutional-checkout',
      headers: {
        cookie: authCookie(principal, prisma),
        'content-type': 'application/json',
      },
      payload: {
        organizationName: 'Route Metadata Institute',
        contactEmail: principal.email,
        licenseType: 'team',
        billing: 'monthly',
        seats: 5,
        successUrl: 'http://localhost:5173/institutionalpricing?success=true',
        cancelUrl: 'http://localhost:5173/institutionalpricing?canceled=true',
      },
    });
    expect(checkout.statusCode, checkout.body).toBe(200);
    const checkoutParams = Stripe.__checkoutCreate.mock.calls[0][0];

    Stripe.__setNextEvent({
      id: 'evt_route_institution_metadata',
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: checkoutParams.metadata,
          subscription: 'sub_route_institution_metadata',
          customer: 'cus_route_institution_metadata',
        },
      },
    });

    const res = await postWebhook({});
    expect(res.statusCode, res.body).toBe(200);
    expect(prisma._store.institutionalLicense).toEqual(expect.arrayContaining([
      expect.objectContaining({
        organizationName: 'Route Metadata Institute',
        stripeSubscriptionId: 'sub_route_institution_metadata',
      }),
    ]));
  });

  it('rejects a webhook whose organization checkout fingerprint was altered', async () => {
    Stripe.__setNextEvent({
      id: 'evt_tampered_institution_identity',
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: {
            userId: 'u-admin',
            isInstitutional: 'true',
            organizationName: 'Acme Genetics',
            contactEmail: 'admin@acme.test',
            licenseType: 'team',
            billing: 'monthly',
            seats: '5',
            organizationKey: '0'.repeat(64),
            purchaseKey: '1'.repeat(64),
          },
          subscription: 'sub_tampered_institution_identity',
          customer: 'cus_tampered_institution_identity',
        },
      },
    });

    const res = await postWebhook({});
    expect(res.statusCode).toBe(500);
    expect(prisma._store.institutionalLicense).toEqual([]);
    expect(prisma._store.stripeEvent).toEqual([]);
  });

  it.each([
    ['a different configured price', 'price_test_department_monthly', 5],
    ['a different quantity', 'price_test_team_monthly', 4],
  ])('rejects institutional checkout when Stripe reports %s', async (_label, priceId, quantity) => {
    Stripe.__setSubscription({
      status: 'active',
      current_period_start: 1_788_000_000,
      current_period_end: 1_790_592_000,
      cancel_at_period_end: false,
      items: { data: [{
        price: {
          id: priceId,
          active: true,
          type: 'recurring',
          unit_amount: 799,
          currency: 'usd',
          recurring: { interval: 'month' },
        },
        quantity,
      }] },
    });
    Stripe.__setNextEvent({
      id: `evt_institution_mismatch_${quantity}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: {
            userId: 'u-admin',
            isInstitutional: 'true',
            organizationName: 'Mismatch Lab',
            contactEmail: 'admin@acme.test',
            licenseType: 'team',
            billing: 'monthly',
            seats: '5',
          },
          subscription: `sub_institution_mismatch_${quantity}`,
          customer: 'cus_institution_mismatch',
        },
      },
    });

    const res = await postWebhook({});
    expect(res.statusCode).toBe(500);
    expect(prisma._store.institutionalLicense).toEqual([]);
    expect(prisma._store.stripeEvent).toEqual([]);
  });

  it('rejects invalid institutional metadata without creating an entitlement or claiming the event', async () => {
    Stripe.__setNextEvent({
      id: 'evt_invalid_institution_metadata',
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: {
            userId: 'u-admin',
            isInstitutional: 'true',
            organizationName: 'Acme Genetics',
            contactEmail: 'admin@acme.test',
            licenseType: 'department',
            billing: 'monthly',
            seats: '100',
          },
          subscription: 'sub_invalid_institution_metadata',
          customer: 'cus_invalid_institution_metadata',
        },
      },
    });

    const res = await postWebhook({});
    expect(res.statusCode).toBe(500);
    expect(prisma._store.institutionalLicense).toEqual([]);
    expect(prisma._store.stripeEvent).toEqual([]);
  });

  it('rolls back personal access and the event claim when the required audit write fails', async () => {
    prisma._store.user.push({ id: 'u-audit', email: 'audit@example.com', role: 'user' });
    prisma.auditLog.create.mockRejectedValueOnce(new Error('audit storage unavailable'));
    Stripe.__setNextEvent({
      id: 'evt_audit_failure',
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { userId: 'u-audit' },
          subscription: 'sub_audit_failure',
          customer: 'cus_audit_failure',
        },
      },
    });

    const res = await postWebhook({});
    expect(res.statusCode).toBe(500);
    expect(prisma._store.subscription).toEqual([]);
    expect(prisma._store.auditLog).toEqual([]);
    expect(prisma._store.stripeEvent).toEqual([]);
  });

  it('synchronizes institutional access on subscription and invoice events', async () => {
    const license = {
      id: 'lic-sync',
      licenseType: 'team',
      maxSeats: 5,
      stripeSubscriptionId: 'sub_sync',
      status: 'active',
      autoRenew: true,
      endDate: new Date(0),
      renewalDate: new Date(0),
      pricing: {
        billing: 'monthly', currency: 'usd', amountMinor: 799, interval: 'month',
      },
    };
    prisma._store.institutionalLicense.push(license);
    const currentLicense = () => prisma._store.institutionalLicense.find((row) => row.id === license.id);

    Stripe.__setNextEvent({
      id: 'evt_sub_update',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_sync',
          status: 'past_due',
          current_period_end: 1_800_000_000,
          cancel_at_period_end: true,
          items: { data: [] },
        },
      },
    });
    expect((await postWebhook({})).statusCode).toBe(200);
    expect(currentLicense().status).toBe('past_due');
    expect(currentLicense().autoRenew).toBe(false);
    expect(currentLicense().endDate).toEqual(new Date(1_800_000_000 * 1000));

    Stripe.__setSubscription({
      id: 'sub_sync',
      status: 'active',
      current_period_start: 1_800_000_000,
      current_period_end: 1_802_592_000,
      cancel_at_period_end: false,
      items: { data: [{
        price: {
          id: 'price_test_team_monthly',
          active: true,
          type: 'recurring',
          unit_amount: 799,
          currency: 'usd',
          recurring: { interval: 'month' },
        },
        quantity: 5,
      }] },
    });
    Stripe.__setNextEvent({
      id: 'evt_invoice_success',
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          subscription: { id: 'sub_sync' },
          lines: { data: [{ period: { end: 1_802_592_000 } }] },
        },
      },
    });
    expect((await postWebhook({})).statusCode).toBe(200);
    expect(currentLicense().status).toBe('active');
    expect(currentLicense().endDate).toEqual(new Date(1_802_592_000 * 1000));

    Stripe.__setNextEvent({
      id: 'evt_invoice_failed',
      type: 'invoice.payment_failed',
      data: { object: { subscription: 'sub_sync' } },
    });
    expect((await postWebhook({})).statusCode).toBe(200);
    expect(currentLicense().status).toBe('past_due');

    Stripe.__setNextEvent({
      id: 'evt_sub_deleted',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_sync' } },
    });
    expect((await postWebhook({})).statusCode).toBe(200);
    expect(currentLicense().status).toBe('canceled');
  });

  it('revokes personal access when an active subscription moves to an unpublished price', async () => {
    prisma._store.subscription.push({
      id: 'personal-contract',
      userId: 'u-admin',
      stripeSubscriptionId: 'sub_personal_changed',
      status: 'active',
      planType: 'month',
      currentPeriodEnd: new Date('2027-01-01T00:00:00.000Z'),
    });
    Stripe.__setSubscription({
      id: 'sub_personal_changed',
      status: 'active',
      current_period_end: 1_800_000_000,
      cancel_at_period_end: false,
      items: { data: [{
        price: {
          id: 'price_unpublished_personal',
          active: true,
          type: 'recurring',
          unit_amount: 1,
          currency: 'usd',
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }] },
    });
    Stripe.__setNextEvent({
      id: 'evt_personal_contract_changed',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_personal_changed', status: 'active' } },
    });

    const res = await postWebhook({});
    expect(res.statusCode).toBe(200);
    expect(prisma._store.subscription[0].status).toBe('contract_invalid');
    expect(prisma._store.stripeEvent).toEqual(expect.arrayContaining([
      expect.objectContaining({ stripeEventId: 'evt_personal_contract_changed' }),
    ]));
  });

  it('accepts a verified personal monthly-to-yearly switch and stores the new cadence', async () => {
    prisma._store.subscription.push({
      id: 'personal-cadence',
      userId: 'u-admin',
      stripeSubscriptionId: 'sub_personal_cadence',
      status: 'active',
      planType: 'month',
      currentPeriodEnd: new Date(0),
    });
    Stripe.__setSubscription({
      id: 'sub_personal_cadence',
      status: 'active',
      current_period_end: 1_900_000_000,
      cancel_at_period_end: false,
      items: { data: [{
        price: {
          id: 'price_test_yearly',
          active: true,
          type: 'recurring',
          unit_amount: 9999,
          currency: 'usd',
          recurring: { interval: 'year' },
        },
        quantity: 1,
      }] },
    });
    Stripe.__setNextEvent({
      id: 'evt_personal_cadence',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_personal_cadence', status: 'active' } },
    });

    const res = await postWebhook({});
    expect(res.statusCode).toBe(200);
    expect(prisma._store.subscription[0]).toMatchObject({
      status: 'active',
      planType: 'year',
      currentPeriodEnd: new Date(1_900_000_000 * 1000),
    });
  });

  it('does not reactivate an institutional license when paid invoice quantity no longer matches', async () => {
    prisma._store.institutionalLicense.push({
      id: 'institution-contract',
      licenseType: 'team',
      maxSeats: 5,
      stripeSubscriptionId: 'sub_institution_changed',
      status: 'past_due',
      pricing: {
        billing: 'monthly', currency: 'usd', amountMinor: 799, interval: 'month',
      },
    });
    Stripe.__setSubscription({
      id: 'sub_institution_changed',
      status: 'active',
      current_period_end: 1_900_000_000,
      cancel_at_period_end: false,
      items: { data: [{
        price: {
          id: 'price_test_team_monthly',
          active: true,
          type: 'recurring',
          unit_amount: 799,
          currency: 'usd',
          recurring: { interval: 'month' },
        },
        quantity: 4,
      }] },
    });
    Stripe.__setNextEvent({
      id: 'evt_institution_quantity_changed',
      type: 'invoice.payment_succeeded',
      data: { object: { subscription: 'sub_institution_changed' } },
    });

    const res = await postWebhook({});
    expect(res.statusCode).toBe(200);
    expect(prisma._store.institutionalLicense[0].status).toBe('contract_invalid');
    expect(prisma._store.stripeEvent).toEqual(expect.arrayContaining([
      expect.objectContaining({ stripeEventId: 'evt_institution_quantity_changed' }),
    ]));
  });

  it('does NOT mark the event as processed when handling fails', async () => {
    prisma._store.user.push({ id: 'u-1', email: 'a@x.com', role: 'user' });
    // Force the subscription write to blow up to simulate a downstream failure.
    prisma.subscription.upsert = vi.fn(async () => { throw new Error('db down'); });
    Stripe.__setNextEvent({
      id: 'evt_fail',
      type: 'checkout.session.completed',
      data: { object: { metadata: { userId: 'u-1' }, subscription: 'sub_x', customer: 'cus_x' } },
    });

    const res = await postWebhook({});
    expect(res.statusCode).toBe(500);
    // The bug we fixed: we must NOT have recorded the event, otherwise Stripe's
    // retry will short-circuit to "duplicate" and the subscription is lost.
    expect(prisma._store.stripeEvent.length).toBe(0);
  });
});
