import { authenticate, requireRole } from '../middleware/auth.js';
import { createAuditLog } from '../utils/audit.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// Complimentary access windows an admin can grant. Kept as whole days so the
// expiry is unambiguous regardless of the hour the grant is issued.
const FREE_PERIOD_DAYS = { week: 7, month: 30 };

/**
 * Compute the new expiry for a complimentary access window.
 *
 * Never shortens an existing window: if the user already has access that runs
 * past what this grant would give, we keep the later date. Otherwise we extend
 * from whichever is later — "now" or the current end — so repeated grants stack
 * cleanly instead of overlapping.
 */
function computeFreePeriodEnd(currentEnd, days) {
  const now = Date.now();
  const base = currentEnd && currentEnd.getTime() > now ? currentEnd.getTime() : now;
  return new Date(base + days * 24 * 60 * 60 * 1000);
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
          role: true, banned: true, banReason: true, bannedDate: true,
          educationLevel: true, demographicsCollected: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total, page: Number(page), limit: Number(limit) };
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
        role: true, banned: true, createdAt: true,
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
          banReason: true, bannedDate: true, bannedBy: true,
        },
      }),
      prisma.preBannedUser.findMany({ where: { status: 'active' } }),
    ]);

    return { bannedUsers, preBannedUsers };
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
        return { success: true, type: 'immediate_ban', userId: existing.id };
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

    return { success: true, type: 'pre_ban', preBanId: preBan.id };
  });

  // Granting premium access does not change role boundaries — keep accessible
  // to admin and super_admin, but audit it as a security-relevant change.
  fastify.post('/grant-premium', async (request) => {
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
  fastify.post('/grant-free-period', async (request) => {
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

    // Reuse an active admin-granted comp so grants stack on one row. Real Stripe
    // subscriptions (planType month/year/team_*) are deliberately left alone.
    const existingComp = await prisma.subscription.findFirst({
      where: { userId, status: 'active', planType: 'admin_granted' },
      orderBy: { createdAt: 'desc' },
    });

    const newEnd = computeFreePeriodEnd(existingComp?.currentPeriodEnd ?? null, days);

    if (existingComp) {
      await prisma.subscription.update({
        where: { id: existingComp.id },
        data: { currentPeriodEnd: newEnd },
      });
    } else {
      await prisma.subscription.create({
        data: {
          userId,
          status: 'active',
          planType: 'admin_granted',
          currentPeriodEnd: newEnd,
        },
      });
    }

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
  fastify.post('/revoke-free-period', async (request) => {
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

  fastify.get('/analytics', async () => {
    const [
      totalUsers, activeSubscriptions, totalSearches,
      totalConversations, totalMedicalRecords, totalGeneSets,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.subscription.count({ where: { status: 'active' } }),
      prisma.searchHistory.count(),
      prisma.aIConversation.count(),
      prisma.medicalData.count(),
      prisma.geneSet.count(),
    ]);

    const recentActivity = await prisma.userActivity.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: { select: { email: true, displayName: true } } },
    });

    return {
      stats: {
        totalUsers, activeSubscriptions, totalSearches,
        totalConversations, totalMedicalRecords, totalGeneSets,
      },
      recentActivity,
    };
  });

  fastify.get('/messages', async (request) => {
    const { status } = request.query;
    const where = status ? { status } : {};

    const messages = await prisma.message.findMany({
      where: { ...where, category: 'support' },
      orderBy: { createdAt: 'desc' },
      include: { sender: { select: { email: true, displayName: true } } },
      take: 100,
    });

    return { messages };
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

  // Hard-deleting a user cascades through every owned record. Reserve to
  // super_admin and prefer soft deactivation (banned=true) for admins.
  fastify.delete('/users/:id', { preHandler: requireSuperAdmin }, async (request) => {
    const { id } = request.params;

    if (id === request.user.userId) {
      throw new ValidationError('Cannot delete your own account');
    }

    // Soft-delete by ban + reason for compliance-friendly audit trail.
    await prisma.user.update({
      where: { id },
      data: {
        banned: true,
        banReason: 'Deleted/deactivated by super admin',
        bannedDate: new Date(),
        bannedBy: request.user.userId,
      },
    });

    await createAuditLog(
      prisma,
      {
        userId: request.user.userId,
        action: 'delete_user',
        entityType: 'user',
        entityId: id,
      },
      { required: true }
    );

    return { success: true };
  });
}
