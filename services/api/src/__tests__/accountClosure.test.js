import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../utils/errors.js';
import { createPrismaMock } from './setup.js';
import {
  closeUserAccount,
  reconcilePendingCustomerCleanup,
} from '../services/accountClosure.js';

function seedUser(prisma, overrides = {}) {
  const user = {
    id: 'user-delete-1',
    email: 'delete-me@example.invalid',
    passwordHash: 'unused-in-service-test',
    role: 'user',
    banned: false,
    ...overrides,
  };
  prisma._store.user.push(user);
  return user;
}

function stripeMock(overrides = {}) {
  return {
    subscriptions: { cancel: vi.fn(async () => ({ status: 'canceled' })) },
    customers: { del: vi.fn(async () => ({ deleted: true })) },
    checkout: {
      sessions: {
        retrieve: vi.fn(async (id) => ({ id, status: 'open' })),
        expire: vi.fn(async (id) => ({ id, status: 'expired' })),
      },
    },
    ...overrides,
  };
}

function ledgerMock(overrides = {}) {
  return {
    configured: true,
    hashIdentity: vi.fn((value) => `hash:${value}`),
    authorize: vi.fn(async ({ receiptId }) => ({
      mode: 'external',
      recorded: true,
      receiptId,
    })),
    ...overrides,
  };
}

function actions(prisma) {
  return prisma._store.auditLog.map((row) => row.action);
}

function finalDeletionAudit(prisma) {
  return prisma._store.auditLog.find((row) => (
    row.action === 'account.self_deleted' || row.action === 'account.deleted_by_admin'
  ));
}

describe('closeUserAccount', () => {
  let prisma;

  beforeEach(() => {
    prisma = createPrismaMock();
  });

  it('deletes a non-billable account, records the external authorization, removes received messages, and releases seats atomically', async () => {
    const user = seedUser(prisma);
    const ledger = ledgerMock();
    prisma._store.institutionalLicense.push({
      id: 'license-1',
      organizationName: 'Fixture University',
      contactEmail: 'owner@example.invalid',
      adminUsers: ['other-admin'],
      status: 'active',
      assignedSeats: 3,
    });
    prisma._store.licenseAssignment.push({
      id: 'seat-1',
      licenseId: 'license-1',
      userEmail: user.email,
      assignedBy: 'other-admin',
      status: 'active',
    });
    prisma._store.licenseUsageLog.push({
      id: 'usage-1',
      licenseId: 'license-1',
      userEmail: user.email,
      action: 'seat_assigned',
    });
    prisma._store.projectVersion.push({ id: 'version-1', createdBy: user.id });
    prisma._store.message.push({
      id: 'received-message',
      senderId: 'support-user',
      receiverId: user.id,
      subject: 'Private subject',
      body: 'Private body',
    });

    const result = await closeUserAccount({
      prisma,
      user,
      actorUserId: user.id,
      stripeClient: null,
      ledger,
    });

    expect(result.success).toBe(true);
    expect(result.billing).toEqual({
      checkoutSessionsExpired: 0,
      subscriptionsCancelled: 0,
      customersDeleted: 0,
      customerCleanupPending: false,
    });
    expect(result.cleanup).toEqual({ institutionalSeatsRemoved: 1, receivedMessagesDeleted: 1 });
    expect(ledger.authorize).toHaveBeenCalledWith(expect.objectContaining({
      receiptId: result.receiptId,
      userIdHash: `hash:${user.id}`,
      billing: { checkoutSessionsExpired: 0, subscriptionsCancelled: 0 },
    }));
    expect(prisma._store.user).toHaveLength(0);
    expect(prisma._store.message).toHaveLength(0);
    expect(prisma._store.licenseAssignment).toHaveLength(0);
    expect(prisma._store.institutionalLicense[0].assignedSeats).toBe(2);
    expect(prisma._store.licenseUsageLog[0].userEmail).toMatch(/^deleted\+[a-f0-9]+@example\.invalid$/);
    expect(prisma._store.projectVersion[0].createdBy).toMatch(/^deleted-user:/);
    expect(actions(prisma)).toEqual([
      'account.closure_started',
      'account.closure_billing_secured',
      'account.self_deleted',
      'account.closure_customer_cleanup_completed',
    ]);
    expect(finalDeletionAudit(prisma)).toEqual(expect.objectContaining({
      action: 'account.self_deleted',
      entityType: 'user',
      entityId: user.id,
      metadata: expect.objectContaining({
        receiptId: result.receiptId,
        independentLedgerRecorded: true,
        stripeSubscriptionsCancelled: 0,
        stripeCustomersPlanned: 0,
        institutionalSeatsRemoved: 1,
        receivedMessagesDeleted: 1,
      }),
    }));
  });

  it('cancels subscriptions before database deletion and removes Stripe customers only after commit', async () => {
    const user = seedUser(prisma);
    prisma._store.subscription.push({
      id: 'subscription-row',
      userId: user.id,
      stripeSubscriptionId: 'sub_live_fixture',
      stripeCustomerId: 'cus_live_fixture',
      status: 'active',
    });
    const stripe = stripeMock();

    const result = await closeUserAccount({
      prisma,
      user,
      actorUserId: user.id,
      stripeClient: stripe,
      ledger: ledgerMock(),
    });

    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_live_fixture');
    expect(stripe.customers.del).toHaveBeenCalledWith('cus_live_fixture');
    expect(stripe.subscriptions.cancel.mock.invocationCallOrder[0])
      .toBeLessThan(prisma.user.delete.mock.invocationCallOrder[0]);
    expect(prisma.user.delete.mock.invocationCallOrder[0])
      .toBeLessThan(stripe.customers.del.mock.invocationCallOrder[0]);
    expect(result.billing).toEqual({
      checkoutSessionsExpired: 0,
      subscriptionsCancelled: 1,
      customersDeleted: 1,
      customerCleanupPending: false,
    });
    expect(prisma._store.user).toHaveLength(0);
  });

  it('fails closed when billing cancellation cannot be verified and returns a durable retry receipt', async () => {
    const user = seedUser(prisma);
    prisma._store.subscription.push({
      id: 'subscription-row',
      userId: user.id,
      stripeSubscriptionId: 'sub_requires_stripe',
      stripeCustomerId: 'cus_requires_stripe',
      status: 'trialing',
    });

    let caught;
    try {
      await closeUserAccount({
        prisma,
        user,
        actorUserId: user.id,
        stripeClient: null,
        ledger: ledgerMock(),
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      statusCode: 503,
      code: 'ACCOUNT_DELETE_BILLING_UNAVAILABLE',
      receiptId: expect.any(String),
    });
    expect(prisma._store.user).toHaveLength(1);
    expect(actions(prisma)).toEqual(['account.closure_started', 'account.closure_failed']);
    expect(prisma._store.auditLog.at(-1).metadata).toMatchObject({
      receiptId: caught.receiptId,
      stage: 'billing_reconciliation',
      code: 'ACCOUNT_DELETE_BILLING_UNAVAILABLE',
    });
  });

  it('blocks deletion of the sole responsible account for an active institutional license before external mutation', async () => {
    const user = seedUser(prisma);
    prisma._store.institutionalLicense.push({
      id: 'license-1',
      organizationName: 'Fixture University',
      contactEmail: user.email,
      adminUsers: [user.id],
      status: 'active',
      assignedSeats: 0,
    });
    const stripe = stripeMock();
    const ledger = ledgerMock();

    await expect(closeUserAccount({
      prisma,
      user,
      actorUserId: user.id,
      stripeClient: stripe,
      ledger,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: 'ACCOUNT_DELETE_LICENSE_TRANSFER_REQUIRED',
    });

    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect(ledger.authorize).not.toHaveBeenCalled();
    expect(prisma._store.user).toHaveLength(1);
    expect(prisma._store.auditLog).toHaveLength(0);
  });

  it('treats already-missing Stripe resources as idempotently completed', async () => {
    const user = seedUser(prisma);
    prisma._store.subscription.push({
      id: 'subscription-row',
      userId: user.id,
      stripeSubscriptionId: 'sub_already_gone',
      stripeCustomerId: 'cus_already_gone',
      status: 'active',
    });
    const missing = Object.assign(new Error('No such resource'), { code: 'resource_missing' });
    const stripe = stripeMock({
      subscriptions: { cancel: vi.fn(async () => { throw missing; }) },
      customers: { del: vi.fn(async () => { throw missing; }) },
    });

    const result = await closeUserAccount({
      prisma,
      user,
      actorUserId: user.id,
      stripeClient: stripe,
      ledger: ledgerMock(),
    });

    expect(result.billing).toMatchObject({
      subscriptionsCancelled: 1,
      customersDeleted: 1,
      customerCleanupPending: false,
    });
    expect(prisma._store.user).toHaveLength(0);
  });

  it('expires an outstanding checkout before the user can disappear', async () => {
    const user = seedUser(prisma);
    prisma._store.auditLog.push({
      id: 'checkout-audit',
      userId: user.id,
      action: 'billing.checkout_created',
      entityType: 'subscription',
      metadata: { sessionId: 'cs_open_fixture' },
    });
    const stripe = stripeMock();

    const result = await closeUserAccount({
      prisma,
      user,
      actorUserId: user.id,
      stripeClient: stripe,
      ledger: ledgerMock(),
    });

    expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledWith(
      'cs_open_fixture',
      { expand: ['subscription', 'customer'] },
    );
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith('cs_open_fixture');
    expect(result.billing.checkoutSessionsExpired).toBe(1);
  });

  it('persists partial cancellation progress and leaves the account retryable when a later subscription fails', async () => {
    const user = seedUser(prisma);
    prisma._store.subscription.push(
      {
        id: 'sub-row-1',
        userId: user.id,
        stripeSubscriptionId: 'sub_first',
        stripeCustomerId: 'cus_one',
        status: 'active',
      },
      {
        id: 'sub-row-2',
        userId: user.id,
        stripeSubscriptionId: 'sub_second',
        stripeCustomerId: 'cus_two',
        status: 'active',
      },
    );
    const stripe = stripeMock({
      subscriptions: {
        cancel: vi.fn(async (id) => {
          if (id === 'sub_second') throw new Error('provider unavailable');
          return { status: 'canceled' };
        }),
      },
    });

    await expect(closeUserAccount({
      prisma,
      user,
      actorUserId: user.id,
      stripeClient: stripe,
      ledger: ledgerMock(),
    })).rejects.toMatchObject({
      code: 'ACCOUNT_DELETE_SUBSCRIPTION_CANCEL_FAILED',
      receiptId: expect.any(String),
      billingProgress: expect.objectContaining({ subscriptionsCancelled: ['sub_first'] }),
    });

    expect(prisma._store.user).toHaveLength(1);
    expect(prisma._store.subscription.find((row) => row.id === 'sub-row-1').status).toBe('canceled');
    expect(prisma._store.subscription.find((row) => row.id === 'sub-row-2').status).toBe('active');
    expect(prisma._store.auditLog.at(-1).metadata.billingProgress.subscriptionsCancelled)
      .toEqual(['sub_first']);
  });

  it('reconciles a checkout that completed during the deletion window', async () => {
    const user = seedUser(prisma);
    prisma._store.auditLog.push({
      id: 'checkout-audit-complete',
      userId: user.id,
      action: 'billing.checkout_created',
      entityType: 'subscription',
      metadata: { sessionId: 'cs_complete_fixture' },
    });
    const stripe = stripeMock({
      checkout: {
        sessions: {
          retrieve: vi.fn(async () => ({
            id: 'cs_complete_fixture',
            status: 'complete',
            subscription: 'sub_from_checkout',
            customer: 'cus_from_checkout',
          })),
          expire: vi.fn(),
        },
      },
    });

    const result = await closeUserAccount({
      prisma,
      user,
      actorUserId: user.id,
      stripeClient: stripe,
      ledger: ledgerMock(),
    });

    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_from_checkout');
    expect(stripe.customers.del).toHaveBeenCalledWith('cus_from_checkout');
    expect(result.billing).toMatchObject({
      subscriptionsCancelled: 1,
      customersDeleted: 1,
      customerCleanupPending: false,
    });
    expect(prisma._store.user).toHaveLength(0);
  });

  it('stops after subscription cancellation when the independent ledger cannot record authorization', async () => {
    const user = seedUser(prisma);
    prisma._store.subscription.push({
      id: 'sub-row-ledger',
      userId: user.id,
      stripeSubscriptionId: 'sub_ledger_fixture',
      stripeCustomerId: 'cus_ledger_fixture',
      status: 'active',
    });
    const ledgerError = new AppError('ledger unavailable', 503);
    ledgerError.code = 'ACCOUNT_DELETE_LEDGER_WRITE_FAILED';
    const ledger = ledgerMock({ authorize: vi.fn(async () => { throw ledgerError; }) });
    const stripe = stripeMock();

    await expect(closeUserAccount({
      prisma,
      user,
      actorUserId: user.id,
      stripeClient: stripe,
      ledger,
    })).rejects.toMatchObject({
      code: 'ACCOUNT_DELETE_LEDGER_WRITE_FAILED',
      receiptId: expect.any(String),
      billingProgress: expect.objectContaining({ subscriptionsCancelled: ['sub_ledger_fixture'] }),
    });

    expect(stripe.subscriptions.cancel).toHaveBeenCalledOnce();
    expect(stripe.customers.del).not.toHaveBeenCalled();
    expect(prisma._store.user).toHaveLength(1);
    expect(prisma._store.subscription[0].status).toBe('canceled');
    expect(prisma._store.auditLog.at(-1).metadata.stage).toBe('external_tombstone');
  });

  it('persists residual customer cleanup and the worker completes it without restoring billing', async () => {
    const user = seedUser(prisma);
    prisma._store.subscription.push({
      id: 'sub-row-customer',
      userId: user.id,
      stripeSubscriptionId: 'sub_customer_fixture',
      stripeCustomerId: 'cus_cleanup_fixture',
      status: 'active',
    });
    const firstStripe = stripeMock({
      customers: { del: vi.fn(async () => { throw new Error('temporary customer API outage'); }) },
    });

    const result = await closeUserAccount({
      prisma,
      user,
      actorUserId: user.id,
      stripeClient: firstStripe,
      ledger: ledgerMock(),
    });

    expect(result.success).toBe(true);
    expect(result.billing).toMatchObject({
      subscriptionsCancelled: 1,
      customersDeleted: 0,
      customerCleanupPending: true,
    });
    expect(prisma._store.user).toHaveLength(0);
    expect(actions(prisma)).toContain('account.closure_customer_cleanup_pending');

    const retryStripe = stripeMock();
    const retry = await reconcilePendingCustomerCleanup({
      prisma,
      stripeClient: retryStripe,
    });

    expect(retry).toMatchObject({ attempted: 1, completed: 1, pending: 0, configured: true });
    expect(retryStripe.customers.del).toHaveBeenCalledWith('cus_cleanup_fixture');
    expect(actions(prisma)).toContain('account.closure_customer_cleanup_completed');
  });
});
