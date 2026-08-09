import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stripe = vi.hoisted(() => ({
  subscriptionsCancel: vi.fn(async () => ({ status: 'canceled' })),
  customersDelete: vi.fn(async () => ({ deleted: true })),
}));

vi.mock('stripe', () => ({
  default: class StripeMock {
    constructor(secret) {
      this.secret = secret;
      this.subscriptions = { cancel: stripe.subscriptionsCancel };
      this.customers = { del: stripe.customersDelete };
    }
  },
}));

import { authCookie, buildTestApp, createPrismaMock, seedAuthUser } from './setup.js';

const SUPER = {
  userId: 'admin-delete-super',
  email: 'admin-delete-super@example.invalid',
  role: 'super_admin',
};

function seedTarget(prisma, overrides = {}) {
  const user = {
    id: 'admin-delete-target',
    email: 'admin-delete-target@example.invalid',
    role: 'user',
    banned: false,
    ...overrides,
  };
  prisma._store.user.push(user);
  return user;
}

describe('DELETE /admin/users/:idOrEmail billing and ownership safety', () => {
  let app;
  let prisma;
  let cookie;

  beforeEach(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_account_deletion_fixture';
    vi.clearAllMocks();
    prisma = createPrismaMock();
    seedAuthUser(prisma, SUPER);
    cookie = authCookie(SUPER, prisma);
    app = await buildTestApp(prisma, { csrf: false });
  });

  afterEach(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    await app.close();
  });

  it('cancels Stripe and deletes the customer before closing the target account', async () => {
    const target = seedTarget(prisma);
    prisma._store.subscription.push({
      id: 'admin-delete-sub-row',
      userId: target.id,
      stripeSubscriptionId: 'sub_admin_delete',
      stripeCustomerId: 'cus_admin_delete',
      status: 'active',
      planType: 'month',
    });

    const response = await app.inject({
      method: 'DELETE',
      url: `/admin/users/${target.id}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(stripe.subscriptionsCancel).toHaveBeenCalledWith('sub_admin_delete');
    expect(stripe.customersDelete).toHaveBeenCalledWith('cus_admin_delete');
    expect(prisma._store.user.find((user) => user.id === target.id)).toBeUndefined();
    expect(JSON.parse(response.payload)).toMatchObject({
      success: true,
      receiptId: expect.any(String),
      billing: { subscriptionsCancelled: 1, customersDeleted: 1 },
    });
    expect(prisma._store.auditLog).toEqual([
      expect.objectContaining({
        userId: SUPER.userId,
        action: 'account.deleted_by_admin',
        entityId: target.id,
      }),
    ]);
  });

  it('leaves the account intact when Stripe cancellation fails', async () => {
    const target = seedTarget(prisma);
    prisma._store.subscription.push({
      id: 'admin-delete-sub-row',
      userId: target.id,
      stripeSubscriptionId: 'sub_admin_delete_failure',
      stripeCustomerId: 'cus_admin_delete_failure',
      status: 'active',
      planType: 'month',
    });
    stripe.subscriptionsCancel.mockRejectedValueOnce(new Error('provider unavailable'));

    const response = await app.inject({
      method: 'DELETE',
      url: `/admin/users/${target.id}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.payload)).toMatchObject({
      code: 'ACCOUNT_DELETE_SUBSCRIPTION_CANCEL_FAILED',
    });
    expect(stripe.customersDelete).not.toHaveBeenCalled();
    expect(prisma._store.user.find((user) => user.id === target.id)).toBeDefined();
    expect(prisma._store.auditLog).toHaveLength(0);
  });

  it('blocks deletion while the target is responsible for an active institution', async () => {
    const target = seedTarget(prisma);
    prisma._store.institutionalLicense.push({
      id: 'admin-delete-license',
      organizationName: 'Deletion Fixture University',
      contactEmail: target.email,
      adminUsers: [target.id],
      status: 'active',
      assignedSeats: 0,
    });

    const response = await app.inject({
      method: 'DELETE',
      url: `/admin/users/${encodeURIComponent(target.email)}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.payload)).toMatchObject({
      code: 'ACCOUNT_DELETE_LICENSE_TRANSFER_REQUIRED',
    });
    expect(stripe.subscriptionsCancel).not.toHaveBeenCalled();
    expect(prisma._store.user.find((user) => user.id === target.id)).toBeDefined();
  });
});
