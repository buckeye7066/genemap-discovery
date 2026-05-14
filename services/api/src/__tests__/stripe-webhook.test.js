import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { buildTestApp, createPrismaMock } from './setup.js';

// Stub the Stripe SDK so we control signature verification + retrieves.
vi.mock('stripe', () => {
  let nextEvent = null;
  let shouldThrow = false;
  const mockConstruct = vi.fn((rawBody, sig, secret) => {
    if (shouldThrow) throw new Error('signature verification failed');
    if (!sig) throw new Error('missing signature');
    return nextEvent;
  });
  const Stripe = function () {
    return {
      webhooks: { constructEvent: mockConstruct },
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
let Stripe;

beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  prisma = createPrismaMock();
  app = await buildTestApp(prisma, { csrf: false, includeBilling: true });
  Stripe = (await import('stripe')).default;
});

afterAll(async () => app.close());

beforeEach(() => {
  prisma._reset();
  Stripe.__setShouldThrow(false);
  Stripe.__setNextEvent(null);
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

  it('does NOT mark the event as processed when handling fails', async () => {
    prisma._store.user.push({ id: 'u-1', email: 'a@x.com', role: 'user' });
    // Force prisma.subscription.create to blow up to simulate a downstream failure.
    prisma.subscription.create = vi.fn(async () => { throw new Error('db down'); });
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
