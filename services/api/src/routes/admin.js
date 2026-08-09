import { authenticate, requireRole } from '../middleware/auth.js';
import { createAuditLog } from '../utils/audit.js';
import { closeUserAccount } from '../services/accountClosure.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { FREE_PERIOD_DAYS, computeFreePeriodEnd, grantOrExtendFreePeriod } from '../utils/freePeriod.js';

const SAFE_ACTIVITY_TYPES = Object.freeze(['page_view', 'gene_view']);
const SAFE_SEARCH_TYPES = Object.freeze(['free', 'premium', 'general']);
const OTHER_GROUP = 'other';

function safeGroupBreakdown(rows, { field, outputKey, allowed }) {
  const counts = new Map();
  for (const row of rows || []) {
    const rawLabel = typeof row?.[field] === 'string' ? row[field] : '';
    const label = allowed.includes(rawLabel) ? rawLabel : OTHER_GROUP;
    const count = Number(row?._count?._all);
    if (!Number.isFinite(count) || count <= 0) continue;
    counts.set(label, (counts.get(label) || 0) + count);
  }

  return [...allowed, OTHER_GROUP]
    .filter((label) => counts.has(label))
    .map((label) => ({ [outputKey]: label, count: counts.get(label) }));
}

function startOfUtcDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function buildDailyActivity(activityRows, searchRows, timelineStart) {
  const byDate = new Map();
  for (let offset = 0; offset < 7; offset++) {
    const date = new Date(timelineStart);
    date.setUTCDate(timelineStart.getUTCDate() + offset);
    const key = date.toISOString().slice(0, 10);
    byDate.set(key, { date: key, activities: 0, searches: 0 });
  }

  const increment = (rows, key) => {
    for (const row of rows || []) {
      const date = new Date(row?.createdAt);
      if (!Number.isFinite(date.getTime())) continue;
      const bucket = byDate.get(date.toISOString().slice(0, 10));
      if (bucket) bucket[key] += 1;
    }
  };

  increment(activityRows, 'activities');
  increment(searchRows, 'searches');
  return [...byDate.values()];
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * Serialize a preBannedUser row (its own table, different column names) into a
 * user-like shape flagged `pre_banned`. The Ban Management page renders pre-bans
 * and real bans from ONE list and splits them on `pre_banned`; returning them
 * together in a uniform shape (rather than a separate array the page ignored)
 * is what finally makes the "Pre-Banned Users" list populate. Real user rows
 * keep their Prisma-native camelCase — the web app normalizes either case at
 * the edge (apps/web/lib/normalizeUser.js), which is also why this stays
 * tolerant of however the client reads it.
 */
function serializePreBannedUser(p) {
  if (!p) return p;
  return {
    id: p.id,
    email: p.email || null,
    role: 'user',
    banned: true,
    // Provide BOTH casings so any consumer (normalized or raw) renders it.
    reason: p.reason ?? null,
    ban_reason: p.reason ?? null,
    banReason: p.reason ?? null,
    banned_date: p.createdAt ?? null,
    bannedDate: p.createdAt ?? null,
    banned_by: p.bannedBy ?? null,
    bannedBy: p.bannedBy ?? null,
    full_name: p.fullName ?? null,
    fullName: p.fullName ?? null,
    phone_number: p.phoneNumber ?? null,
    phoneNumber: p.phoneNumber ?? null,
    created_date: p.createdAt ?? null,
    createdAt: p.createdAt ?? null,
    pre_banned: true,
  };
}

/**
 * Comp every (non-banned) user a free period. Existing admin-granted comps are
 * extended in place (never shortened); users without one get a fresh comp.
 * Real Stripe subscriptions are never touched — we only ever create/extend
 * rows whose planType is 'admin_granted'.
 */
async function grantFreePeriodToAll(prisma, days) {
  const freshEnd = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const comps = await prisma.subscription.findMany({
    where: { status: 'active', planType: 'admin_granted' },
    select: { id: true, userId: true, currentPeriodEnd: true },
  });

  for (const comp of comps) {
    await prisma.subscription.update({
      where: { id: comp.id },
      data: { currentPeriodEnd: computeFreePeriodEnd(comp.currentPeriodEnd, days) },
    });
  }

  const compedUserIds = comps.map((c) => c.userId);
  const usersWithout = await prisma.user.findMany({
    where: { banned: false, id: { notIn: compedUserIds } },
    select: { id: true },
  });

  if (usersWithout.length > 0) {
    await prisma.subscription.createMany({
      data: usersWithout.map((u) => ({
        userId: u.id,
        status: 'active',
        planType: 'admin_granted',
        currentPeriodEnd: freshEnd,
      })),
    });
  }

  return {
    extended: comps.length,
    created: usersWithout.length,
    total: comps.length + usersWithout.length,
  };
}

/**
 * End an admin-granted comp by canceling it and expiring its window. Scoped to
 * a single user, or all users when userId is null. Only 'admin_granted' rows
 * are affected, so paid Stripe subscriptions are left intact.
 */
async function revokeFreePeriod(prisma, userId) {
  const where = { status: 'active', planType: 'admin_granted' };
  if (userId) where.userId = userId;
  const result = await prisma.subscription.updateMany({
    where,
    data: { status: 'canceled', currentPeriodEnd: new Date() },
  });
  return { revoked: result.count };
}

export default async function adminRoutes(fastify) {
  const prisma = fastify.prisma;

  // Default scope: any admin or super_admin can view/moderate.
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireRole('admin', 'super_admin'));

  // The most dangerous actions (granting privileges, hard-deleting users)
  // are gated to super_admin only via per-route preHandler.
  const requireSuperAdmin = requireRole('super_admin');

  fastify.get('/users', async (request) => {
    const { search, page = 1, limit = 50 } = request.query;
    const skip = (page - 1) * limit;
    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { displayName: { contains: search, mode: 'insensitive' } },
            { fullName: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, email: true, displayName: true, fullName: true,
          phoneNumber: true, role: true, banned: true, banReason: true,
          bannedDate: true, educationLevel: true, demographicsCollected: true,
          mailingListOptIn: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.user.count({ where }),
    ]);

    // Derive "last active" from the most recent activity row per user. There is
    // no lastActiveAt column on the user, so the Users Log previously always
    // showed "Never active" even for users with hundreds of activity rows.
    const userIds = users.map((u) => u.id);
    let lastActivity = [];
    try {
      if (userIds.length) {
        lastActivity = await prisma.userActivity.groupBy({
          by: ['userId'],
          where: { userId: { in: userIds } },
          _max: { createdAt: true },
        });
      }
    } catch {
      // last-active is a non-critical decoration; never fail the user list over it.
      lastActivity = [];
    }
    const lastActiveByUser = new Map((lastActivity || []).map((r) => [r.userId, r._max?.createdAt]));
    const usersWithActivity = users.map((u) => ({
      ...u,
      lastActiveAt: lastActiveByUser.get(u.id) || null,
    }));

    return { users: usersWithActivity, total, page: Number(page), limit: Number(limit) };
  });

  fastify.post('/search-users', async (request) => {
    const { query } = request.body || {};
    if (!query) throw new ValidationError('query is required');

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: query, mode: 'insensitive' } },
          { displayName: { contains: query, mode: 'insensitive' } },
          { fullName: { contains: query, mode: 'insensitive' } },
          { phoneNumber: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true, email: true, displayName: true, fullName: true,
        phoneNumber: true, role: true, banned: true, createdAt: true,
      },
      take: 50,
    });

    return { users };
  });

  fastify.get('/banned', async () => {
    const [bannedUsers, preBannedUsers] = await Promise.all([
      prisma.user.findMany({
        where: { banned: true },
        select: {
          id: true, email: true, displayName: true, fullName: true,
          phoneNumber: true, role: true, banReason: true, bannedDate: true, bannedBy: true,
        },
      }),
      prisma.preBannedUser.findMany({ where: { status: 'active' } }),
    ]);

    // Return ONE combined list: real bans + active pre-bans, each flagged
    // `pre_banned`. The UI splits them on that flag, so emitting them together
    // (instead of a separate array it ignored) is what finally makes the
    // "Pre-Banned Users" list populate. Real user rows keep camelCase (the web
    // app normalizes at the edge); we only tag pre_banned:false. The raw
    // `preBannedUsers` array is kept for back-compat.
    return {
      bannedUsers: [
        ...bannedUsers.map((u) => ({ ...u, pre_banned: false })),
        ...preBannedUsers.map(serializePreBannedUser),
      ],
      preBannedUsers,
    };
  });

  fastify.post('/ban', async (request) => {
    const { userId, reason } = request.body || {};
    if (!userId) throw new ValidationError('userId is required');

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User not found');

    if (user.id === request.user.userId) {
      throw new ValidationError('Cannot ban your own account');
    }
    if (user.role === 'super_admin' && request.user.role !== 'super_admin') {
      throw new ValidationError('Only a super admin can ban another super admin');
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        banned: true,
        banReason: reason || null,
        bannedDate: new Date(),
        bannedBy: request.user.userId,
      },
    });

    await createAuditLog(
      prisma,
      {
        userId: request.user.userId,
        action: 'ban_user',
        entityType: 'user',
        entityId: userId,
        metadata: { reason },
      },
      { required: true }
    );

    return { success: true };
  });

  fastify.post('/unban', async (request) => {
    const { userId, preBanId, isPreBanned } = request.body || {};

    if (isPreBanned && preBanId) {
      await prisma.preBannedUser.delete({ where: { id: preBanId } });
    } else if (userId) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          banned: false,
          banReason: null,
          bannedDate: null,
          bannedBy: null,
        },
      });
    } else {
      throw new ValidationError('userId or preBanId is required');
    }

    await createAuditLog(
      prisma,
      {
        userId: request.user.userId,
        action: 'unban_user',
        entityType: 'user',
        entityId: userId || preBanId,
      },
      { required: true }
    );

    return { success: true };
  });

  fastify.post('/pre-ban', async (request) => {
    const { email, phoneNumber, fullName, reason } = request.body || {};
    if (!email && !phoneNumber && !fullName) {
      throw new ValidationError('At least one identifier (email, phoneNumber, fullName) is required');
    }

    if (email) {
      const existing = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
      if (existing) {
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            banned: true,
            banReason: reason || null,
            bannedDate: new Date(),
            bannedBy: request.user.userId,
          },
        });
        await createAuditLog(
          prisma,
          {
            userId: request.user.userId,
            action: 'pre_ban_user.immediate',
            entityType: 'user',
            entityId: existing.id,
            metadata: { reason },
          },
          { required: true }
        );
        return {
          success: true,
          type: 'immediate_ban',
          userId: existing.id,
          message: `${existing.email} already had an account and was banned immediately.`,
        };
      }
    }

    const preBan = await prisma.preBannedUser.create({
      data: {
        email: email ? normalizeEmail(email) : null,
        phoneNumber: phoneNumber || null,
        fullName: fullName || null,
        reason: reason || null,
        bannedBy: request.user.userId,
      },
    });

    await createAuditLog(
      prisma,
      {
        userId: request.user.userId,
        action: 'pre_ban_user',
        entityType: 'pre_banned_user',
        entityId: preBan.id,
        metadata: { email, phoneNumber, fullName, reason },
      },
      { required: true }
    );

    return {
      success: true,
      type: 'pre_ban',
      preBanId: preBan.id,
      message: 'User pre-banned. They will be blocked if they try to sign up or log in with any of these identifiers.',
    };
  });

  // Granting premium = a revenue bypass ("grant yourself premium without
  // payment"), so reserve it to super_admin — same boundary as grant-admin.
  // The Access Grants UI that calls this is itself super_admin-only now, but the
  // server is the real gate.
  fastify.post('/grant-premium', { preHandler: requireSuperAdmin }, async (request) => {
    const { userId } = request.body || {};
    if (!userId) throw new ValidationError('userId is required');

    await prisma.subscription.create({
      data: {
        userId,
        status: 'active',
        planType: 'admin_granted',
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });

    await createAuditLog(
      prisma,
      {
        userId: request.user.userId,
        action: 'grant_premium',
        entityType: 'user',
        entityId: userId,
      },
      { required: true }
    );

    return { success: true };
  });

  // Comp a user a free week or month of premium. Unlike grant-premium (a
  // year-long fixed grant) this is a short, self-expiring window: it extends an
  // existing admin-granted comp rather than spawning a new subscription row each
  // time, and it never touches a Stripe-owned subscription (those are driven by
  // webhooks). Expiry is enforced by checkEducationEntitlement honoring
  // currentPeriodEnd.
  fastify.post('/grant-free-period', { preHandler: requireSuperAdmin }, async (request) => {
    const { userId, period, scope } = request.body || {};

    const days = FREE_PERIOD_DAYS[period];
    if (!days) throw new ValidationError('period must be "week" or "month"');

    // Bulk grant: comp every non-banned user at once.
    if (scope === 'all') {
      const result = await grantFreePeriodToAll(prisma, days);
      await createAuditLog(
        prisma,
        {
          userId: request.user.userId,
          action: 'grant_free_period.all',
          entityType: 'system',
          entityId: 'all_users',
          metadata: { period, days, ...result },
        },
        { required: true }
      );
      return { success: true, scope: 'all', period, ...result };
    }

    if (!userId) throw new ValidationError('userId is required');

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User not found');

    // Reuse an active admin-granted comp so grants stack on one row (same
    // helper the automatic new-signup trial uses — see utils/signupTrial.js —
    // so a user can never end up with two competing comp rows). Real Stripe
    // subscriptions (planType month/year/team_*) are deliberately left alone.
    const newEnd = await grantOrExtendFreePeriod(prisma, userId, days);

    await createAuditLog(
      prisma,
      {
        userId: request.user.userId,
        action: 'grant_free_period',
        entityType: 'user',
        entityId: userId,
        metadata: { period, days, currentPeriodEnd: newEnd.toISOString() },
      },
      { required: true }
    );

    return { success: true, period, currentPeriodEnd: newEnd.toISOString() };
  });

  // End a complimentary period early — for one user, or all users at once.
  // Only admin-granted comps are canceled; paid Stripe subscriptions are
  // untouched and continue to be driven by webhooks.
  fastify.post('/revoke-free-period', { preHandler: requireSuperAdmin }, async (request) => {
    const { userId, scope } = request.body || {};

    if (scope === 'all') {
      const result = await revokeFreePeriod(prisma, null);
      await createAuditLog(
        prisma,
        {
          userId: request.user.userId,
          action: 'revoke_free_period.all',
          entityType: 'system',
          entityId: 'all_users',
          metadata: { ...result },
        },
        { required: true }
      );
      return { success: true, scope: 'all', ...result };
    }

    if (!userId) throw new ValidationError('userId is required');

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User not found');

    const result = await revokeFreePeriod(prisma, userId);
    await createAuditLog(
      prisma,
      {
        userId: request.user.userId,
        action: 'revoke_free_period',
        entityType: 'user',
        entityId: userId,
        metadata: { ...result },
      },
      { required: true }
    );

    return { success: true, ...result };
  });

  // Granting admin privileges is reserved for super_admin. Without this
  // separation any admin can promote any user (including themselves via a
  // proxy account) to admin, defeating the role boundary entirely.
  fastify.post('/grant-admin', { preHandler: requireSuperAdmin }, async (request) => {
    const { userId } = request.body || {};
    if (!userId) throw new ValidationError('userId is required');

    await prisma.user.update({
      where: { id: userId },
      data: { role: 'admin' },
    });

    await createAuditLog(
      prisma,
      {
        userId: request.user.userId,
        action: 'grant_admin',
        entityType: 'user',
        entityId: userId,
      },
      { required: true }
    );

    return { success: true };
  });

  fastify.get('/analytics', async (_request, reply) => {
    reply.header('Cache-Control', 'private, no-store');

    const todayUtc = startOfUtcDay(new Date());
    const timelineStart = new Date(todayUtc);
    timelineStart.setUTCDate(todayUtc.getUTCDate() - 6);
    const timelineEnd = new Date(todayUtc);
    timelineEnd.setUTCDate(todayUtc.getUTCDate() + 1);
    const timelineWhere = { createdAt: { gte: timelineStart, lt: timelineEnd } };

    const [
      totalUsers,
      activeSubscriptions,
      totalSearches,
      totalGeneSets,
      totalActivities,
      activityGroups,
      searchGroups,
      recentActivityDates,
      recentSearchDates,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.subscription.count({ where: { status: 'active' } }),
      prisma.searchHistory.count(),
      prisma.geneSet.count(),
      prisma.userActivity.count(),
      prisma.userActivity.groupBy({
        by: ['activityType'],
        _count: { _all: true },
      }),
      prisma.searchHistory.groupBy({
        by: ['queryType'],
        _count: { _all: true },
      }),
      prisma.userActivity.findMany({
        where: timelineWhere,
        select: { createdAt: true },
      }),
      prisma.searchHistory.findMany({
        where: timelineWhere,
        select: { createdAt: true },
      }),
    ]);

    return {
      stats: {
        totalUsers,
        activeSubscriptions,
        totalSearches,
        totalGeneSets,
        totalActivities,
      },
      activityTypeBreakdown: safeGroupBreakdown(activityGroups, {
        field: 'activityType',
        outputKey: 'activityType',
        allowed: SAFE_ACTIVITY_TYPES,
      }),
      searchTypeBreakdown: safeGroupBreakdown(searchGroups, {
        field: 'queryType',
        outputKey: 'queryType',
        allowed: SAFE_SEARCH_TYPES,
      }),
      dailyActivity: buildDailyActivity(recentActivityDates, recentSearchDates, timelineStart),
    };
  });

  fastify.get('/messages', async (request) => {
    const { status } = request.query;
    const where = status ? { status } : {};

    // Only top-level user messages (parentId: null) — admin replies are stored
    // as child rows and must not appear as their own inbox cards.
    const messages = await prisma.message.findMany({
      where: { ...where, category: 'support', parentId: null },
      orderBy: { createdAt: 'desc' },
      include: { sender: { select: { email: true, displayName: true } } },
      take: 100,
    });

    // Attach the latest admin reply (if any) to each message so the "Responded"
    // tab can show the response inline.
    const ids = messages.map((m) => m.id);
    const replies = ids.length
      ? await prisma.message.findMany({
          where: { parentId: { in: ids } },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    const latestReplyByParent = new Map();
    for (const r of replies) latestReplyByParent.set(r.parentId, r); // asc → last wins

    // Serialize to the snake_case shape the admin inbox renders. Without this
    // the page read `created_date`/`message` off Prisma's camelCase rows, so
    // `new Date(undefined)` threw "Invalid time value" and crashed the page,
    // and replies never showed. Status 'replied' is mapped to 'responded' to
    // match the UI's tab vocabulary.
    const serialized = messages.map((m) => {
      const reply = latestReplyByParent.get(m.id);
      return {
        id: m.id,
        subject: m.subject,
        message: m.body,
        created_by: m.sender?.email || m.sender?.displayName || 'Unknown user',
        created_date: m.createdAt,
        status: m.status === 'replied' ? 'responded' : m.status,
        is_issue: m.metadata?.isIssue === true,
        response: reply?.body ?? null,
        response_date: reply?.createdAt ?? null,
      };
    });

    return { messages: serialized };
  });

  fastify.post('/messages/:id/reply', async (request) => {
    const { id } = request.params;
    const { body } = request.body || {};
    if (!body) throw new ValidationError('body is required');

    const original = await prisma.message.findUnique({ where: { id } });
    if (!original) throw new NotFoundError('Message not found');

    const reply = await prisma.message.create({
      data: {
        senderId: request.user.userId,
        receiverId: original.senderId,
        subject: `Re: ${original.subject}`,
        body,
        category: 'support',
        parentId: id,
      },
    });

    await prisma.message.update({
      where: { id },
      data: { status: 'replied' },
    });

    return { reply };
  });

  fastify.post('/messages/:id/close', async (request) => {
    const { id } = request.params;
    await prisma.message.update({
      where: { id },
      data: { status: 'closed' },
    });
    return { success: true };
  });

  // Permanent administrator deletion uses the same account-closure authority as
  // self-service deletion. Stripe subscriptions/customers must be cancelled or
  // confirmed absent before the User row can disappear, and an account that is
  // still responsible for an active institutional license fails closed until
  // ownership is transferred or the license is cancelled.
  fastify.delete('/users/:idOrEmail', { preHandler: requireSuperAdmin }, async (request) => {
    const { idOrEmail } = request.params;

    const user = idOrEmail.includes('@')
      ? await prisma.user.findUnique({ where: { email: normalizeEmail(idOrEmail) } })
      : await prisma.user.findUnique({ where: { id: idOrEmail } });
    if (!user) throw new NotFoundError('User not found');

    if (user.id === request.user.userId) {
      throw new ValidationError('Cannot delete your own account');
    }
    if (user.role === 'super_admin') {
      throw new ValidationError('Cannot delete a super admin account');
    }

    return closeUserAccount({
      prisma,
      user,
      actorUserId: request.user.userId,
      actorMode: 'admin',
    });
  });
}
