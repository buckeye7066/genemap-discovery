import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    delete process.env.STRIPE_SECRET_KEY;
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

  it('closes a non-billable target through the shared account-closure authority', async () => {
    const target = seedTarget(prisma);

    const response = await app.inject({
      method: 'DELETE',
      url: `/admin/users/${target.id}`,
      headers: { cookie },
    });

    expect(response.statusCode, response.payload).toBe(200);
    expect(prisma._store.user.find((user) => user.id === target.id)).toBeUndefined();
    const body = JSON.parse(response.payload);
    expect(body).toMatchObject({
      success: true,
      receiptId: expect.any(String),
      billing: { subscriptionsCancelled: 0, customersDeleted: 0 },
    });
    expect(prisma._store.auditLog).toEqual([
      expect.objectContaining({
        userId: SUPER.userId,
        action: 'account.deleted_by_admin',
        entityType: 'user',
        entityId: target.id,
        metadata: expect.objectContaining({
          receiptId: body.receiptId,
          actorMode: 'admin',
        }),
      }),
    ]);
  });

  it('leaves a billable account intact when cancellation cannot be verified', async () => {
    const target = seedTarget(prisma);
    prisma._store.subscription.push({
      id: 'admin-delete-sub-row',
      userId: target.id,
      stripeSubscriptionId: 'sub_requires_provider_confirmation',
      stripeCustomerId: 'cus_requires_provider_confirmation',
      status: 'active',
      planType: 'month',
    });

    const response = await app.inject({
      method: 'DELETE',
      url: `/admin/users/${target.id}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.payload)).toMatchObject({
      code: 'ACCOUNT_DELETE_BILLING_UNAVAILABLE',
    });
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
    expect(prisma._store.user.find((user) => user.id === target.id)).toBeDefined();
  });
});
