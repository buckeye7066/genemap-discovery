import { describe, expect, it, vi } from 'vitest';
import {
  assertCheckoutAllowed,
  beginAccountClosureLock,
  recordCheckoutOrExpire,
  releaseAccountClosureLock,
} from '../services/accountClosureState.js';

function prismaDouble(rows = []) {
  return {
    rows,
    auditLog: {
      findMany: vi.fn(async ({ where, take }) => rows
        .filter((row) => row.userId === where.userId && where.action.in.includes(row.action))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, take)),
      create: vi.fn(async ({ data }) => {
        const row = {
          id: `audit-${rows.length + 1}`,
          createdAt: new Date(Date.now() + rows.length),
          ...data,
        };
        rows.push(row);
        return row;
      }),
    },
  };
}

function stripeDouble() {
  return {
    checkout: {
      sessions: {
        expire: vi.fn(async (id) => ({ id, status: 'expired' })),
      },
    },
  };
}

describe('account closure / checkout race contract', () => {
  it('blocks checkout while a deletion lock is active and releases on failure', async () => {
    const prisma = prismaDouble();
    const lockToken = await beginAccountClosureLock(prisma, {
      userId: 'user-1',
      actorUserId: 'user-1',
      actorMode: 'self_service',
    });

    await expect(assertCheckoutAllowed(prisma, 'user-1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'ACCOUNT_CLOSURE_IN_PROGRESS',
    });

    await releaseAccountClosureLock(prisma, {
      userId: 'user-1',
      actorUserId: 'user-1',
      actorMode: 'self_service',
      lockToken,
      reason: 'ACCOUNT_DELETE_LEDGER_UNAVAILABLE',
    });
    await expect(assertCheckoutAllowed(prisma, 'user-1')).resolves.toMatchObject({ active: false });
  });

  it('expires a session when account deletion starts between Stripe creation and the post-create check', async () => {
    const prisma = prismaDouble();
    const stripeClient = stripeDouble();
    const originalCreate = prisma.auditLog.create;
    prisma.auditLog.create = vi.fn(async ({ data }) => {
      const created = await originalCreate({ data });
      if (data.action === 'billing.checkout_created') {
        await originalCreate({
          data: {
            userId: data.userId,
            action: 'account.closure_lock',
            entityType: 'user',
            entityId: data.userId,
            metadata: { lockToken: 'race-lock' },
          },
        });
      }
      return created;
    });

    await expect(recordCheckoutOrExpire({
      prisma,
      stripeClient,
      userId: 'user-race',
      session: { id: 'cs_race' },
      action: 'billing.checkout_created',
      entityType: 'subscription',
      metadata: { plan: 'monthly' },
    })).rejects.toMatchObject({
      statusCode: 409,
      code: 'ACCOUNT_CLOSURE_IN_PROGRESS',
    });
    expect(stripeClient.checkout.sessions.expire).toHaveBeenCalledWith('cs_race');
  });

  it('expires a Stripe session when the required audit receipt cannot be written', async () => {
    const prisma = prismaDouble();
    prisma.auditLog.create.mockRejectedValueOnce(new Error('database unavailable'));
    const stripeClient = stripeDouble();

    await expect(recordCheckoutOrExpire({
      prisma,
      stripeClient,
      userId: 'user-audit-fail',
      session: { id: 'cs_untracked' },
      action: 'billing.checkout_created',
      entityType: 'subscription',
      metadata: { plan: 'monthly' },
    })).rejects.toMatchObject({
      statusCode: 503,
      code: 'CHECKOUT_AUDIT_WRITE_FAILED',
    });
    expect(stripeClient.checkout.sessions.expire).toHaveBeenCalledWith('cs_untracked');
  });
});
