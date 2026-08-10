import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeUserAccount } from '../services/accountClosure.js';
import { createPrismaMock } from './setup.js';

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  vi.restoreAllMocks();
});

function seedBillableUser(prisma, overrides = {}) {
  const user = {
    id: 'review-regression-user',
    email: 'review-regression@example.invalid',
    passwordHash: 'unused',
    role: 'user',
    banned: false,
    ...overrides,
  };
  prisma._store.user.push(user);
  prisma._store.subscription.push({
    id: 'review-regression-subscription',
    userId: user.id,
    stripeSubscriptionId: 'sub_review_regression',
    stripeCustomerId: 'cus_review_regression',
    status: 'active',
  });
  return user;
}

function stripeMock() {
  return {
    subscriptions: { cancel: vi.fn(async () => ({ status: 'canceled' })) },
    customers: { del: vi.fn(async () => ({ deleted: true })) },
    checkout: {
      sessions: {
        retrieve: vi.fn(async (id) => ({ id, status: 'open' })),
        expire: vi.fn(async (id) => ({ id, status: 'expired' })),
      },
    },
  };
}

function configuredLedger() {
  return {
    configured: true,
    hashIdentity: vi.fn((value) => `hash:${value}`),
    authorize: vi.fn(async ({ receiptId }) => ({
      mode: 'external',
      recorded: true,
      receiptId,
      identityKeyId: 'test-current',
    })),
  };
}

describe('account-closure fresh-review regressions', () => {
  it('refuses a known-unconfigured production ledger before any billing, local entitlement, receipt, or audit mutation', async () => {
    process.env.NODE_ENV = 'production';
    const prisma = createPrismaMock();
    const user = seedBillableUser(prisma);
    const stripe = stripeMock();
    const ledger = {
      configured: false,
      hashIdentity: vi.fn(),
      authorize: vi.fn(),
    };

    await expect(closeUserAccount({
      prisma,
      user,
      actorUserId: user.id,
      stripeClient: stripe,
      ledger,
    })).rejects.toMatchObject({
      statusCode: 503,
      code: 'ACCOUNT_DELETE_LEDGER_UNAVAILABLE',
    });

    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.expire).not.toHaveBeenCalled();
    expect(stripe.customers.del).not.toHaveBeenCalled();
    expect(ledger.authorize).not.toHaveBeenCalled();
    expect(prisma._store.subscription[0].status).toBe('active');
    expect(prisma._store.user).toHaveLength(1);
    expect(prisma._store.auditLog).toHaveLength(0);
  });

  it('preserves exact checkout and subscription progress in the thrown error and failure audit when database finalization fails', async () => {
    process.env.NODE_ENV = 'test';
    const prisma = createPrismaMock();
    const user = seedBillableUser(prisma);
    prisma._store.auditLog.push({
      id: 'checkout-created-audit',
      userId: user.id,
      action: 'billing.checkout_created',
      entityType: 'subscription',
      metadata: { sessionId: 'cs_review_regression' },
    });
    const stripe = stripeMock();
    const ledger = configuredLedger();
    prisma.$transaction.mockRejectedValueOnce(new Error('database unavailable'));

    let caught;
    try {
      await closeUserAccount({
        prisma,
        user,
        actorUserId: user.id,
        stripeClient: stripe,
        ledger,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      statusCode: 503,
      code: 'ACCOUNT_DELETE_DATABASE_FINALIZE_FAILED',
      receiptId: expect.any(String),
      billingProgress: expect.objectContaining({
        checkoutSessionsExamined: ['cs_review_regression'],
        checkoutSessionsExpired: ['cs_review_regression'],
        subscriptionsCancelled: ['sub_review_regression'],
      }),
    });
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith('cs_review_regression');
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_review_regression');
    expect(stripe.customers.del).not.toHaveBeenCalled();
    expect(ledger.authorize).toHaveBeenCalledWith(expect.objectContaining({
      receiptId: caught.receiptId,
      billing: { checkoutSessionsExpired: 1, subscriptionsCancelled: 1 },
    }));
    expect(prisma._store.subscription[0].status).toBe('canceled');
    expect(prisma._store.user).toHaveLength(1);

    const failureAudit = prisma._store.auditLog.findLast((row) => row.action === 'account.closure_failed');
    expect(failureAudit).toEqual(expect.objectContaining({
      entityId: user.id,
      metadata: expect.objectContaining({
        receiptId: caught.receiptId,
        stage: 'database_finalize',
        code: 'ACCOUNT_DELETE_DATABASE_FINALIZE_FAILED',
        billingProgress: expect.objectContaining({
          checkoutSessionsExpired: ['cs_review_regression'],
          subscriptionsCancelled: ['sub_review_regression'],
        }),
      }),
    }));
  });
});
