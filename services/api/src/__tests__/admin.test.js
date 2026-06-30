import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { buildTestApp, createPrismaMock, authCookie, seedAuthUser } from './setup.js';

let app;
let prisma;

const ADMIN = { userId: 'admin-1', email: 'admin@example.com', role: 'admin' };
const REGULAR = { userId: 'user-1', email: 'user@example.com', role: 'user' };
const SUPER = { userId: 'super-admin-1', email: 'superadmin@example.com', role: 'super_admin' };
const adminCookie = authCookie(ADMIN);
const userCookie = authCookie(REGULAR);
const superCookie = authCookie(SUPER);

beforeAll(async () => {
  prisma = createPrismaMock();
  app = await buildTestApp(prisma, { csrf: false });
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  prisma._reset();
  // The new DB-hydrating authenticate middleware needs the cookie's user
  // to exist. Seed both standard test principals on every test so the
  // existing assertions on user counts still hold while routing works.
  seedAuthUser(prisma, ADMIN);
  seedAuthUser(prisma, REGULAR);
  seedAuthUser(prisma, SUPER);
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

  it('should deny regular user access to admin routes (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: { cookie: userCookie },
    });

    // requireRole throws ForbiddenError (403) when authenticated but lacks role
    expect(res.statusCode).toBe(403);
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
    // 2 pushed + 3 auth-seeded baseline (admin-1 + user-1 + super-admin-1).
    expect(body.users).toHaveLength(5);
    expect(body.total).toBe(5);
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
    // 2 pushed + 3 auth-seeded baseline (admin-1 + user-1 + super-admin-1).
    expect(body.stats.totalUsers).toBe(5);
    expect(body.stats.activeSubscriptions).toBe(1);
    expect(body.recentActivity).toBeDefined();
  });

  it('should deny regular user access', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/analytics',
      headers: { cookie: userCookie },
    });

    expect(res.statusCode).toBe(403);
  });
});

// ─── GET /admin/banned ──────────────────────────────────────────────────────

describe('GET /admin/banned', () => {
  it('should return real bans and active pre-bans in one snake_case list', async () => {
    prisma._store.user.push(
      { id: 'u-1', email: 'banned@test.com', banned: true, banReason: 'Spam', bannedDate: new Date(), fullName: 'Bad Actor' },
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

    // The page renders real bans + active pre-bans from one list, split on
    // `pre_banned`. Only the active pre-ban (pb-1) is included; pb-2 is triggered.
    expect(body.bannedUsers).toHaveLength(2);

    const real = body.bannedUsers.find((u) => u.email === 'banned@test.com');
    expect(real).toBeDefined();
    expect(real.pre_banned).toBe(false);
    // Real user rows keep Prisma camelCase; the web app normalizes at the edge.
    expect(real.banReason).toBe('Spam');
    expect(real.fullName).toBe('Bad Actor');

    const pre = body.bannedUsers.find((u) => u.email === 'future@test.com');
    expect(pre).toBeDefined();
    expect(pre.pre_banned).toBe(true);
    expect(pre.ban_reason).toBe('Known abuser');

    // Raw array kept for back-compat; only the active pre-ban appears.
    expect(body.preBannedUsers).toHaveLength(1);
    expect(body.preBannedUsers[0].email).toBe('future@test.com');
  });
});

// ─── GET /admin/messages ──────────────────────────────────────────────────────

describe('GET /admin/messages', () => {
  let originalFindMany;

  beforeEach(() => {
    originalFindMany = prisma.message.findMany;
    // The route uses `include: { sender }`; the generic mock ignores relations,
    // so wrap it to attach the sender the route reads for `created_by`.
    prisma.message.findMany = async (args) => {
      const rows = await originalFindMany(args);
      return rows.map((m) => ({
        ...m,
        sender: m.senderId === 'sender-1'
          ? { email: 'user@example.com', displayName: 'A User' }
          : null,
      }));
    };
  });

  afterEach(() => {
    prisma.message.findMany = originalFindMany;
  });

  it('serializes to the inbox shape, maps replied→responded, and attaches the reply', async () => {
    prisma._store.message.push(
      {
        id: 'm-1', senderId: 'sender-1', subject: 'Help', body: 'It is broken',
        category: 'support', status: 'replied', parentId: null, createdAt: new Date(),
      },
      // Admin reply — a child row that must NOT appear as its own inbox card.
      {
        id: 'r-1', senderId: 'admin-1', subject: 'Re: Help', body: 'We fixed it',
        category: 'support', status: 'open', parentId: 'm-1', createdAt: new Date(),
      },
    );

    const res = await app.inject({
      method: 'GET',
      url: '/admin/messages',
      headers: { cookie: adminCookie },
    });

    expect(res.statusCode).toBe(200);
    const { messages } = JSON.parse(res.body);
    // Only the top-level message, not the reply row.
    expect(messages).toHaveLength(1);
    const m = messages[0];
    expect(m.message).toBe('It is broken');     // body → message
    expect(m.created_by).toBe('user@example.com');
    expect(m.created_date).toBeTruthy();          // not undefined → no crash
    expect(m.status).toBe('responded');           // replied → responded
    expect(m.response).toBe('We fixed it');       // reply attached
    expect(m.response_date).toBeTruthy();
  });
});

// ─── POST /admin/pre-ban ─────────────────────────────────────────────────────

describe('POST /admin/pre-ban', () => {
  it('creates a pre-ban and returns a human-readable success message', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/pre-ban',
      headers: { cookie: adminCookie },
      payload: { email: 'future-bad@example.com', reason: 'Known abuser' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.type).toBe('pre_ban');
    // The page shows `response.message`; without it the success alert was blank.
    expect(typeof body.message).toBe('string');
    expect(body.message.length).toBeGreaterThan(0);
  });

  it('immediately bans an already-registered user and says so', async () => {
    prisma._store.user.push({
      id: 'existing-bad', email: 'existing-bad@example.com', role: 'user', banned: false,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/admin/pre-ban',
      headers: { cookie: adminCookie },
      payload: { email: 'existing-bad@example.com', reason: 'TOS' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.type).toBe('immediate_ban');
    expect(body.message).toMatch(/banned immediately/i);
  });

  it('rejects when no identifier is provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/pre-ban',
      headers: { cookie: adminCookie },
      payload: { reason: 'no identifier' },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── POST /admin/grant-premium ──────────────────────────────────────────────

describe('POST /admin/grant-premium', () => {
  // Granting premium is a revenue bypass — now super_admin-only. The existing
  // success tests are written against `adminCookie`; shadow it with the super
  // cookie so they exercise the authorized path without per-test edits.
  const adminCookie = superCookie;

  it('denies a plain admin (403) — revenue bypass is super_admin-only', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/grant-premium',
      headers: { cookie: authCookie(ADMIN) },
      payload: { userId: 'target-user' },
    });
    expect(res.statusCode).toBe(403);
  });

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

// ─── POST /admin/grant-free-period ──────────────────────────────────────────

describe('POST /admin/grant-free-period', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const adminCookie = superCookie; // comp grants are super_admin-only now

  beforeEach(() => {
    prisma._store.user.push({ id: 'comp-target', email: 'comp@test.com', role: 'user' });
  });

  it('creates a self-expiring admin_granted subscription for a free week', async () => {
    const before = Date.now();
    const res = await app.inject({
      method: 'POST',
      url: '/admin/grant-free-period',
      headers: { cookie: adminCookie },
      payload: { userId: 'comp-target', period: 'week' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.period).toBe('week');

    const end = new Date(body.currentPeriodEnd).getTime();
    // ~7 days out, with a little slack for execution time.
    expect(end).toBeGreaterThan(before + 7 * DAY - 5000);
    expect(end).toBeLessThan(before + 7 * DAY + 5000);

    const sub = prisma._store.subscription.find((s) => s.userId === 'comp-target');
    expect(sub).toMatchObject({ status: 'active', planType: 'admin_granted' });
  });

  it('grants 30 days for a free month', async () => {
    const before = Date.now();
    const res = await app.inject({
      method: 'POST',
      url: '/admin/grant-free-period',
      headers: { cookie: adminCookie },
      payload: { userId: 'comp-target', period: 'month' },
    });

    expect(res.statusCode).toBe(200);
    const end = new Date(res.json().currentPeriodEnd).getTime();
    expect(end).toBeGreaterThan(before + 30 * DAY - 5000);
    expect(end).toBeLessThan(before + 30 * DAY + 5000);
  });

  it('stacks onto an existing comp instead of creating a second row', async () => {
    const existingEnd = new Date(Date.now() + 10 * DAY);
    prisma._store.subscription.push({
      id: 'existing-comp',
      userId: 'comp-target',
      status: 'active',
      planType: 'admin_granted',
      currentPeriodEnd: existingEnd,
      createdAt: new Date(),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/admin/grant-free-period',
      headers: { cookie: adminCookie },
      payload: { userId: 'comp-target', period: 'week' },
    });

    expect(res.statusCode).toBe(200);
    // One row, extended from the existing (later) end — never shortened.
    const comps = prisma._store.subscription.filter((s) => s.userId === 'comp-target');
    expect(comps).toHaveLength(1);
    const end = new Date(res.json().currentPeriodEnd).getTime();
    expect(end).toBeGreaterThan(existingEnd.getTime() + 7 * DAY - 5000);
  });

  it('rejects an invalid period', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/grant-free-period',
      headers: { cookie: adminCookie },
      payload: { userId: 'comp-target', period: 'decade' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects missing userId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/grant-free-period',
      headers: { cookie: adminCookie },
      payload: { period: 'week' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('404s when the target user does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/grant-free-period',
      headers: { cookie: adminCookie },
      payload: { userId: 'ghost', period: 'week' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('denies a regular user (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/grant-free-period',
      headers: { cookie: userCookie },
      payload: { userId: 'comp-target', period: 'week' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('scope:"all" comps every non-banned user and skips banned ones', async () => {
    prisma._store.user.push(
      { id: 'u-a', email: 'a@test.com', role: 'user', banned: false },
      { id: 'u-b', email: 'b@test.com', role: 'user', banned: false },
      { id: 'u-banned', email: 'banned@test.com', role: 'user', banned: true },
    );
    // One user already has a comp — it should be extended, not duplicated.
    prisma._store.subscription.push({
      id: 'sub-a', userId: 'u-a', status: 'active', planType: 'admin_granted',
      currentPeriodEnd: new Date(Date.now() + 2 * DAY), createdAt: new Date(),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/admin/grant-free-period',
      headers: { cookie: adminCookie },
      payload: { scope: 'all', period: 'week' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.scope).toBe('all');
    expect(body.extended).toBe(1); // u-a
    // Every non-banned user without a comp gets one (admin, regular, comp-target,
    // u-b — but not the banned user).
    const compRows = prisma._store.subscription.filter((s) => s.planType === 'admin_granted');
    expect(compRows.some((s) => s.userId === 'u-banned')).toBe(false);
    expect(compRows.some((s) => s.userId === 'u-b')).toBe(true);
    // u-a still has exactly one comp row (extended in place).
    expect(compRows.filter((s) => s.userId === 'u-a')).toHaveLength(1);
  });
});

// ─── POST /admin/revoke-free-period ──────────────────────────────────────────

describe('POST /admin/revoke-free-period', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const adminCookie = superCookie; // comp revokes are super_admin-only now

  it('cancels a single user\'s comp but leaves a paid sub intact', async () => {
    prisma._store.user.push({ id: 'rev-target', email: 'rev@test.com', role: 'user' });
    prisma._store.subscription.push(
      { id: 'comp', userId: 'rev-target', status: 'active', planType: 'admin_granted',
        currentPeriodEnd: new Date(Date.now() + 5 * DAY) },
      { id: 'paid', userId: 'rev-target', status: 'active', planType: 'month',
        currentPeriodEnd: new Date(Date.now() + 20 * DAY) },
    );

    const res = await app.inject({
      method: 'POST',
      url: '/admin/revoke-free-period',
      headers: { cookie: adminCookie },
      payload: { userId: 'rev-target' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().revoked).toBe(1);
    const comp = prisma._store.subscription.find((s) => s.id === 'comp');
    const paid = prisma._store.subscription.find((s) => s.id === 'paid');
    expect(comp.status).toBe('canceled');
    expect(paid.status).toBe('active'); // Stripe sub untouched
  });

  it('scope:"all" cancels every active comp and no paid subs', async () => {
    prisma._store.subscription.push(
      { id: 'c1', userId: 'x', status: 'active', planType: 'admin_granted', currentPeriodEnd: new Date() },
      { id: 'c2', userId: 'y', status: 'active', planType: 'admin_granted', currentPeriodEnd: new Date() },
      { id: 'p1', userId: 'z', status: 'active', planType: 'year', currentPeriodEnd: new Date() },
    );

    const res = await app.inject({
      method: 'POST',
      url: '/admin/revoke-free-period',
      headers: { cookie: adminCookie },
      payload: { scope: 'all' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().revoked).toBe(2);
    expect(prisma._store.subscription.find((s) => s.id === 'p1').status).toBe('active');
  });

  it('rejects missing userId without scope', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/revoke-free-period',
      headers: { cookie: adminCookie },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('denies a regular user (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/revoke-free-period',
      headers: { cookie: userCookie },
      payload: { scope: 'all' },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ─── POST /admin/grant-admin ────────────────────────────────────────────────

describe('POST /admin/grant-admin', () => {
  it('should refuse a regular admin (super_admin only)', async () => {
    prisma._store.user.push({ id: 'promote-me', email: 'regular@test.com', role: 'user' });

    const res = await app.inject({
      method: 'POST',
      url: '/admin/grant-admin',
      headers: { cookie: adminCookie },
      payload: { userId: 'promote-me' },
    });

    // requireRole rejects insufficient permissions with 403 (ForbiddenError).
    expect(res.statusCode).toBe(403);
  });

  it('should promote user to admin when the caller is super_admin', async () => {
    const SUPER = { userId: 'super-1', email: 'super@example.com', role: 'super_admin' };
    seedAuthUser(prisma, SUPER);
    const superCookie = authCookie(SUPER);

    prisma._store.user.push({ id: 'promote-me', email: 'regular@test.com', role: 'user' });

    const res = await app.inject({
      method: 'POST',
      url: '/admin/grant-admin',
      headers: { cookie: superCookie },
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
  it('should refuse a regular admin (super_admin only)', async () => {
    prisma._store.user.push({ id: 'del-1', email: 'delete@test.com' });

    const res = await app.inject({
      method: 'DELETE',
      url: '/admin/users/del-1',
      headers: { cookie: adminCookie },
    });

    expect(res.statusCode).toBe(403);
  });

  it('should soft-delete (ban) a user when the caller is super_admin', async () => {
    const SUPER = { userId: 'super-1', email: 'super@example.com', role: 'super_admin' };
    seedAuthUser(prisma, SUPER);
    const superCookie = authCookie(SUPER);

    prisma._store.user.push({ id: 'del-1', email: 'delete@test.com', banned: false });

    const res = await app.inject({
      method: 'DELETE',
      url: '/admin/users/del-1',
      headers: { cookie: superCookie },
    });

    expect(res.statusCode).toBe(200);
    // Soft-delete: user is marked banned, not removed from the store.
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'del-1' },
        data: expect.objectContaining({ banned: true }),
      }),
    );
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
