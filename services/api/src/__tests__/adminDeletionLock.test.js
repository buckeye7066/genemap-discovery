import { describe, expect, it, vi } from 'vitest';
import adminDeletionLockPlugin from '../plugins/adminDeletionLock.js';

function prismaDouble(target) {
  const rows = [];
  return {
    rows,
    user: {
      findUnique: vi.fn(async ({ where }) => (
        where.id === target.id || where.email === target.email ? target : null
      )),
    },
    auditLog: {
      findMany: vi.fn(async ({ where, take }) => rows
        .filter((row) => row.userId === where.userId && where.action.in.includes(row.action))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, take)),
      create: vi.fn(async ({ data }) => {
        const row = { id: `audit-${rows.length + 1}`, createdAt: new Date(Date.now() + rows.length), ...data };
        rows.push(row);
        return row;
      }),
    },
  };
}

describe('admin deletion lock plugin', () => {
  it('wraps only the authenticated admin delete route and writes the lock before the canonical handler', async () => {
    let onRoute;
    await adminDeletionLockPlugin({
      addHook: vi.fn((name, callback) => {
        expect(name).toBe('onRoute');
        onRoute = callback;
      }),
    });
    const target = { id: 'target-user', email: 'target@example.invalid', role: 'user' };
    const prisma = prismaDouble(target);
    const handler = vi.fn(async () => ({ success: true }));
    const routeOptions = {
      method: 'DELETE',
      url: '/admin/users/:idOrEmail',
      config: {},
      handler,
    };

    onRoute(routeOptions);
    const request = {
      params: { idOrEmail: target.id },
      user: { userId: 'admin-user' },
      server: { prisma },
    };
    const result = await routeOptions.handler(request, {});

    expect(result).toEqual({ success: true });
    expect(handler).toHaveBeenCalledOnce();
    expect(prisma.rows[0]).toMatchObject({
      userId: target.id,
      action: 'account.closure_lock',
      entityId: target.id,
    });
  });

  it('releases the lock when the canonical admin deletion handler fails', async () => {
    let onRoute;
    await adminDeletionLockPlugin({ addHook: (_name, callback) => { onRoute = callback; } });
    const target = { id: 'target-user', email: 'target@example.invalid', role: 'user' };
    const prisma = prismaDouble(target);
    const error = Object.assign(new Error('billing unavailable'), { code: 'ACCOUNT_DELETE_BILLING_UNAVAILABLE' });
    const routeOptions = {
      method: 'DELETE',
      url: '/admin/users/:idOrEmail',
      config: {},
      handler: vi.fn(async () => { throw error; }),
    };
    onRoute(routeOptions);

    await expect(routeOptions.handler({
      params: { idOrEmail: target.id },
      user: { userId: 'admin-user' },
      server: { prisma },
    }, {})).rejects.toBe(error);

    expect(prisma.rows.map((row) => row.action)).toEqual([
      'account.closure_lock',
      'account.closure_lock_released',
    ]);
  });
});
