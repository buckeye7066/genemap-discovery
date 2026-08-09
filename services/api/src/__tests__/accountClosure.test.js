import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrismaMock } from './setup.js';
import { closeUserAccount } from '../services/accountClosure.js';

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

function stripeMock() {
  return {
    subscriptions: { cancel: vi.fn(async () => ({ status: 'canceled' })) },
    customers: { del: vi.fn(async () => ({ deleted: true })) },
  };
}

describe('closeUserAccount', () => {
  let prisma;

  beforeEach(() => {
    prisma = createPrismaMock();
  });

  it('deletes a non-billable account, preserves a receipt, and releases institutional seats', async () => {
    const user = seedUser(prisma);
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

    const result = await closeUserAccount({
      prisma,
      user,
      actorUserId: user.id,
      stripeClient: null,
    });

    expect(result.success).toBe(true);
    expect(result.billing).toEqual({ subscriptionsCancelled: 0, customersDeleted: 0 });
    expect(prisma._store.user).toHaveLength(0);
    expect(prisma._store.licenseAssignment).toHaveLength(0);
    expect(prisma._store.institutionalLicense[0].assignedSeats).toBe(2);
    expect(prisma._store.licenseUsageLog[0].userEmail).toMatch(/^deleted\+[a-f0-9]+@example\.invalid$/);
    expect(prisma._store.projectVersion[0].createdBy).toMatch(/^deleted-user:/);
    expect(prisma._store.auditLog).toEqual([
      expect.objectContaining({
        action: 'account.self_deleted',
        entityType: 'user',
        entityId: user.id,
        metadata: expect.objectContaining({
          receiptId: result.receiptId,
          stripeSubscriptionsCancelled: 0,
          institutionalSeatsRemoved: 1,
        }),
      }),
    ]);
  });

  it('cancels active Stripe resources before deleting the database account', async () => {
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
    });

    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_live_fixture');
    expect(stripe.customers.del).toHaveBeenCalledWith('cus_live_fixture');
    expect(result.billing).toEqual({ subscriptionsCancelled: 1, customersDeleted: 1 });
    expect(prisma._store.user).toHaveLength(0);
  });

  it('fails closed when billing cancellation cannot be verified', async () => {
    const user = seedUser(prisma);
    prisma._store.subscription.push({
      id: 'subscription-row',
      userId: user.id,
      stripeSubscriptionId: 'sub_requires_stripe',
      stripeCustomerId: 'cus_requires_stripe',
      status: 'trialing',
    });

    await expect(closeUserAccount({
      prisma,
      user,
      actorUserId: user.id,
      stripeClient: null,
    })).rejects.toMatchObject({
      statusCode: 503,
      code: 'ACCOUNT_DELETE_BILLING_UNAVAILABLE',
    });

    expect(prisma._store.user).toHaveLength(1);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('blocks deletion of the sole responsible account for an active institutional license', async () => {
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

    await expect(closeUserAccount({
      prisma,
      user,
      actorUserId: user.id,
      stripeClient: stripe,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: 'ACCOUNT_DELETE_LICENSE_TRANSFER_REQUIRED',
    });

    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect(prisma._store.user).toHaveLength(1);
  });

  it('treats already-missing Stripe resources as an idempotent completed cancellation', async () => {
    const user = seedUser(prisma);
    prisma._store.subscription.push({
      id: 'subscription-row',
      userId: user.id,
      stripeSubscriptionId: 'sub_already_gone',
      stripeCustomerId: 'cus_already_gone',
      status: 'active',
    });
    const missing = Object.assign(new Error('No such resource'), { code: 'resource_missing' });
    const stripe = {
      subscriptions: { cancel: vi.fn(async () => { throw missing; }) },
      customers: { del: vi.fn(async () => { throw missing; }) },
    };

    const result = await closeUserAccount({
      prisma,
      user,
      actorUserId: user.id,
      stripeClient: stripe,
    });

    expect(result.billing).toEqual({ subscriptionsCancelled: 1, customersDeleted: 1 });
    expect(prisma._store.user).toHaveLength(0);
  });
});
