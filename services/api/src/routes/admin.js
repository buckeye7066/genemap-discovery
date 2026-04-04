import { authenticate, requireRole } from '../middleware/auth.js';
import { createAuditLog } from '../utils/audit.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';

export default async function adminRoutes(fastify) {
  const prisma = fastify.prisma;

  // Require admin for all routes in this scope
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireRole('admin', 'super_admin'));

  // GET /admin/users — list all users with optional search
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

  // POST /admin/search-users — search users by email/name/phone
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

  // GET /admin/banned — get banned users and pre-banned users
  fastify.get('/banned', async () => {
    const [bannedUsers, preBannedUsers] = await Promise.all([
      prisma.user.findMany({
        where: { banned: true },
        select: {
          id: true, email: true, displayName: true, fullName: true,
          banReason: true, bannedDate: true, bannedBy: true,
        },
      }),
      prisma.preBannedUser.findMany({
        where: { status: 'active' },
      }),
    ]);

    return { bannedUsers, preBannedUsers };
  });

  // POST /admin/ban — ban a user
  fastify.post('/ban', async (request) => {
    const { userId, reason } = request.body || {};
    if (!userId) throw new ValidationError('userId is required');

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User not found');

    await prisma.user.update({
      where: { id: userId },
      data: {
        banned: true,
        banReason: reason || null,
        bannedDate: new Date(),
        bannedBy: request.user.userId,
      },
    });

    await createAuditLog(prisma, {
      userId: request.user.userId,
      action: 'ban_user',
      entityType: 'user',
      entityId: userId,
      metadata: { reason },
    });

    return { success: true };
  });

  // POST /admin/unban — unban a user or remove a pre-ban
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

    await createAuditLog(prisma, {
      userId: request.user.userId,
      action: 'unban_user',
      entityType: 'user',
      entityId: userId || preBanId,
    });

    return { success: true };
  });

  // POST /admin/pre-ban — pre-ban a user before they create an account
  fastify.post('/pre-ban', async (request) => {
    const { email, phoneNumber, fullName, reason } = request.body || {};
    if (!email && !phoneNumber && !fullName) {
      throw new ValidationError('At least one identifier (email, phoneNumber, fullName) is required');
    }

    // Check if user already exists and ban them directly
    if (email) {
      const existing = await prisma.user.findUnique({ where: { email } });
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
        return { success: true, type: 'immediate_ban', userId: existing.id };
      }
    }

    const preBan = await prisma.preBannedUser.create({
      data: {
        email: email || null,
        phoneNumber: phoneNumber || null,
        fullName: fullName || null,
        reason: reason || null,
        bannedBy: request.user.userId,
      },
    });

    await createAuditLog(prisma, {
      userId: request.user.userId,
      action: 'pre_ban_user',
      entityType: 'pre_banned_user',
      entityId: preBan.id,
      metadata: { email, phoneNumber, fullName, reason },
    });

    return { success: true, type: 'pre_ban', preBanId: preBan.id };
  });

  // POST /admin/grant-premium — grant premium access to a user
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

    await createAuditLog(prisma, {
      userId: request.user.userId,
      action: 'grant_premium',
      entityType: 'user',
      entityId: userId,
    });

    return { success: true };
  });

  // POST /admin/grant-admin — grant admin privileges
  fastify.post('/grant-admin', async (request) => {
    const { userId } = request.body || {};
    if (!userId) throw new ValidationError('userId is required');

    await prisma.user.update({
      where: { id: userId },
      data: { role: 'admin' },
    });

    await createAuditLog(prisma, {
      userId: request.user.userId,
      action: 'grant_admin',
      entityType: 'user',
      entityId: userId,
    });

    return { success: true };
  });

  // GET /admin/analytics — platform analytics
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

  // GET /admin/messages — list support messages
  fastify.get('/messages', async (request) => {
    const { status } = request.query;
    const where = status ? { status } : {};

    const messages = await prisma.message.findMany({
      where: { ...where, category: 'support' },
      orderBy: { createdAt: 'desc' },
      include: {
        sender: { select: { email: true, displayName: true } },
      },
      take: 100,
    });

    return { messages };
  });

  // POST /admin/messages/:id/reply — reply to a support message
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

  // POST /admin/messages/:id/close — close a support message
  fastify.post('/messages/:id/close', async (request) => {
    const { id } = request.params;
    await prisma.message.update({
      where: { id },
      data: { status: 'closed' },
    });
    return { success: true };
  });

  // DELETE /admin/users/:id — delete a user
  fastify.delete('/users/:id', async (request) => {
    const { id } = request.params;
    await prisma.user.delete({ where: { id } });

    await createAuditLog(prisma, {
      userId: request.user.userId,
      action: 'delete_user',
      entityType: 'user',
      entityId: id,
    });

    return { success: true };
  });
}
