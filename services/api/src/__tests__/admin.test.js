import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { buildTestApp, createPrismaMock, authCookie } from './setup.js';

let app;
let prisma;

const ADMIN = { userId: 'admin-1', email: 'admin@example.com', role: 'admin' };
const REGULAR = { userId: 'user-1', email: 'user@example.com', role: 'user' };
const adminCookie = authCookie(ADMIN);
const userCookie = authCookie(REGULAR);

beforeAll(async () => {
  prisma = createPrismaMock();
  app = await buildTestApp(prisma, { csrf: false });
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  prisma._reset();
});

// ─── Access Control ──────────────────────────────────────────────────────────

describe('Admin access control', () => {
  it('should allow admin to access admin routes', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: { cookie: adminCookie },
    });

    expect(res.statusCode).toBe(200);
  });

  it('should deny regular user access to admin routes (401)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: { cookie: userCookie },
    });

    // requireRole throws UnauthorizedError (401) for insufficient permissions
    expect(res.statusCode).toBe(401);
  });

  it('should deny unauthenticated access to admin routes', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/users',
    });

    expect(res.statusCode).toBe(401);
  });
});

// ─── GET /admin/users ────────────────────────────────────────────────────────

describe('GET /admin/users', () => {
  it('should return paginated user list', async () => {
    prisma._store.user.push(
      { id: 'u-1', email: 'a@test.com', role: 'user', createdAt: new Date() },
      { id: 'u-2', email: 'b@test.com', role: 'user', createdAt: new Date() },
    );

    const res = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: { cookie: adminCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.users).toHaveLength(2);
    expect(body.total).toBe(2);
  });
});

// ─── POST /admin/ban ─────────────────────────────────────────────────────────

describe('POST /admin/ban', () => {
  it('should ban an existing user', async () => {
    prisma._store.user.push({
      id: 'target-1',
      email: 'bad@example.com',
      role: 'user',
      banned: false,
      createdAt: new Date(),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/admin/ban',
      headers: { cookie: adminCookie },
      payload: { userId: 'target-1', reason: 'Spam account' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);

    // Verify user was updated
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'target-1' },
        data: expect.objectContaining({ banned: true, banReason: 'Spam account' }),
      }),
    );
  });

  it('should reject ban with missing userId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/ban',
      headers: { cookie: adminCookie },
      payload: { reason: 'No user specified' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('should return 404 for non-existent user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/ban',
      headers: { cookie: adminCookie },
      payload: { userId: 'does-not-exist' },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ─── POST /admin/unban ──────────────────────────────────────────────────────

describe('POST /admin/unban', () => {
  it('should unban a user', async () => {
    prisma._store.user.push({
      id: 'banned-1',
      email: 'banned@example.com',
      role: 'user',
      banned: true,
      banReason: 'Old reason',
      bannedDate: new Date(),
      bannedBy: 'admin-1',
      createdAt: new Date(),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/admin/unban',
      headers: { cookie: adminCookie },
      payload: { userId: 'banned-1' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'banned-1' },
        data: expect.objectContaining({ banned: false, banReason: null }),
      }),
    );
  });

  it('should remove a pre-ban entry', async () => {
    prisma._store.preBannedUser.push({
      id: 'pb-1',
      email: 'future@example.com',
      status: 'active',
      reason: 'Known bad actor',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/admin/unban',
      headers: { cookie: adminCookie },
      payload: { preBanId: 'pb-1', isPreBanned: true },
    });

    expect(res.statusCode).toBe(200);
    expect(prisma.preBannedUser.delete).toHaveBeenCalledWith({ where: { id: 'pb-1' } });
  });

  it('should reject when neither userId nor preBanId is provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/unban',
      headers: { cookie: adminCookie },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });
});

// ─── Ban / Unban full flow ───────────────────────────────────────────────────

describe('Ban/Unban full flow', () => {
  it('should ban then unban a user', async () => {
    prisma._store.user.push({
      id: 'flow-user',
      email: 'flow@example.com',
      role: 'user',
      banned: false,
      createdAt: new Date(),
    });

    // Ban
    const banRes = await app.inject({
      method: 'POST',
      url: '/admin/ban',
      headers: { cookie: adminCookie },
      payload: { userId: 'flow-user', reason: 'Testing' },
    });
    expect(banRes.statusCode).toBe(200);

    // Verify banned state in store
    const bannedUser = prisma._store.user.find((u) => u.id === 'flow-user');
    expect(bannedUser.banned).toBe(true);

    // Unban
    const unbanRes = await app.inject({
      method: 'POST',
      url: '/admin/unban',
      headers: { cookie: adminCookie },
      payload: { userId: 'flow-user' },
    });
    expect(unbanRes.statusCode).toBe(200);

    const unbannedUser = prisma._store.user.find((u) => u.id === 'flow-user');
    expect(unbannedUser.banned).toBe(false);
    expect(unbannedUser.banReason).toBeNull();
  });
});

// ─── GET /admin/analytics ────────────────────────────────────────────────────

describe('GET /admin/analytics', () => {
  it('should return platform statistics', async () => {
    prisma._store.user.push(
      { id: 'u-1', email: 'a@test.com', createdAt: new Date() },
      { id: 'u-2', email: 'b@test.com', createdAt: new Date() },
    );
    prisma._store.subscription.push(
      { id: 's-1', userId: 'u-1', status: 'active', createdAt: new Date() },
    );

    const res = await app.inject({
      method: 'GET',
      url: '/admin/analytics',
      headers: { cookie: adminCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.stats).toBeDefined();
    expect(body.stats.totalUsers).toBe(2);
    expect(body.stats.activeSubscriptions).toBe(1);
    expect(body.recentActivity).toBeDefined();
  });

  it('should deny regular user access', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/analytics',
      headers: { cookie: userCookie },
    });

    expect(res.statusCode).toBe(401);
  });
});

// ─── GET /admin/banned ──────────────────────────────────────────────────────

describe('GET /admin/banned', () => {
  it('should return banned and pre-banned users', async () => {
    prisma._store.user.push(
      { id: 'u-1', email: 'banned@test.com', banned: true, banReason: 'Spam', bannedDate: new Date() },
      { id: 'u-2', email: 'good@test.com', banned: false },
    );
    prisma._store.preBannedUser.push(
      { id: 'pb-1', email: 'future@test.com', status: 'active', reason: 'Known abuser' },
      { id: 'pb-2', email: 'old@test.com', status: 'triggered' },
    );

    const res = await app.inject({
      method: 'GET',
      url: '/admin/banned',
      headers: { cookie: adminCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.bannedUsers).toHaveLength(1);
    expect(body.bannedUsers[0].email).toBe('banned@test.com');
    expect(body.preBannedUsers).toHaveLength(1);
    expect(body.preBannedUsers[0].email).toBe('future@test.com');
  });
});

// ─── POST /admin/grant-premium ──────────────────────────────────────────────

describe('POST /admin/grant-premium', () => {
  it('should create a subscription for the target user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/grant-premium',
      headers: { cookie: adminCookie },
      payload: { userId: 'target-user' },
    });

    expect(res.statusCode).toBe(200);
    expect(prisma.subscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'target-user',
          status: 'active',
          planType: 'admin_granted',
        }),
      }),
    );
  });

  it('should reject missing userId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/grant-premium',
      headers: { cookie: adminCookie },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });
});

// ─── POST /admin/grant-admin ────────────────────────────────────────────────

describe('POST /admin/grant-admin', () => {
  it('should promote user to admin role', async () => {
    prisma._store.user.push({
      id: 'promote-me',
      email: 'regular@test.com',
      role: 'user',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/admin/grant-admin',
      headers: { cookie: adminCookie },
      payload: { userId: 'promote-me' },
    });

    expect(res.statusCode).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'promote-me' },
        data: { role: 'admin' },
      }),
    );
  });
});

// ─── DELETE /admin/users/:id ─────────────────────────────────────────────────

describe('DELETE /admin/users/:id', () => {
  it('should delete a user', async () => {
    prisma._store.user.push({ id: 'del-1', email: 'delete@test.com' });

    const res = await app.inject({
      method: 'DELETE',
      url: '/admin/users/del-1',
      headers: { cookie: adminCookie },
    });

    expect(res.statusCode).toBe(200);
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'del-1' } });
  });
});

// ─── POST /admin/search-users ────────────────────────────────────────────────

describe('POST /admin/search-users', () => {
  it('should search users by query', async () => {
    prisma._store.user.push(
      { id: 'u-1', email: 'alice@test.com', displayName: 'Alice', fullName: 'Alice Smith', phoneNumber: null },
      { id: 'u-2', email: 'bob@test.com', displayName: 'Bob', fullName: 'Bob Jones', phoneNumber: null },
    );

    const res = await app.inject({
      method: 'POST',
      url: '/admin/search-users',
      headers: { cookie: adminCookie },
      payload: { query: 'alice' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.users.length).toBeGreaterThanOrEqual(1);
  });

  it('should reject missing query', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/search-users',
      headers: { cookie: adminCookie },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });
});
