import { authenticate, requireRole } from '../middleware/auth.js';
import { createAuditLog } from '../utils/audit.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { FREE_PERIOD_DAYS, computeFreePeriodEnd, grantOrExtendFreePeriod } from '../utils/freePeriod.js';

// How many agent-mesh lessons the analytics report carries. Bounded so the
// owner dashboard stays a summary, not a log dump.
const AGENT_MESH_LESSON_LIMIT = 20;

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

  /**
   * Real backend self-test. Replaces the old "ask an LLM to pretend it ran
   * tests" health check that reported "ALL TESTS PASSED" with zero checks.
   * Each check actually exercises a dependency (DB reachability, core tables,
   * required config) and contributes to honest pass/fail counts.
   */
  fastify.get('/self-test', async () => {
    const startedAt = Date.now();
    const checks = [];
    const record = async (name, fn) => {
      try {
        const detail = await fn();
        checks.push({ name, ok: true, detail: detail ?? 'ok' });
      } catch (err) {
        checks.push({ name, ok: false, detail: err?.message || String(err) });
      }
    };

    await record('database.connectivity', async () => {
      await prisma.$queryRaw`SELECT 1`;
      return 'reachable';
    });
    await record('database.users', async () => `${await prisma.user.count()} rows`);
    await record('database.learningSessions', async () => `${await prisma.learningSession.count()} rows`);
    await record('database.subscriptions', async () => `${await prisma.subscription.count()} rows`);
    await record('database.userActivity', async () => `${await prisma.userActivity.count()} rows`);

    const env = fastify.env;
    await record('config.llmProvider', async () => {
      if (!env.OPENAI_API_KEY && !env.ANTHROPIC_API_KEY) {
        throw new Error('Neither OPENAI_API_KEY nor ANTHROPIC_API_KEY is configured');
      }
      return env.OPENAI_API_KEY ? 'openai key present' : 'anthropic key present';
    });
    await record('config.stripe', async () => {
      if (!env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured');
      return 'configured';
    });
    await record('config.medicalEncryption', async () => {
      if (!env.hasMedicalEncryption()) throw new Error('MEDICAL_DATA_ENCRYPTION_KEY missing or invalid');
      return 'valid 32-byte key';
    });

    const checked = checks.length;
    const failed = checks.filter((c) => !c.ok).length;
    const passed = checked - failed;
    const errorReport = checks
      .map((c) => `[${c.ok ? 'PASS' : 'FAIL'}] ${c.name}: ${c.detail}`)
      .join('\n');

    return {
      ok: checked > 0 && failed === 0,
      data: { checked, passed, failed, skipped: 0, errorReport, checks },
      run_duration_ms: Date.now() - startedAt,
    };
  });

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

  fastify.get('/analytics', async () => {
    const [
      totalUsers, activeSubscriptions, totalSearches,
      totalConversations, totalMedicalRecords, totalGeneSets, totalActivities,
      recentActivity, recentSearches, recentConversations, medicalDataTypeBreakdown,
      agentMessagesLast7d, agentLessons,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.subscription.count({ where: { status: 'active' } }),
      prisma.searchHistory.count(),
      prisma.aIConversation.count(),
      prisma.medicalData.count(),
      prisma.geneSet.count(),
      prisma.userActivity.count(),
      prisma.userActivity.findMany({
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { user: { select: { email: true, displayName: true } } },
      }),
      // The dashboard's distribution charts need the rows, not just counts.
      // Keep these lean (no PII beyond what the chart aggregates). Medical
      // records are deliberately NOT listed here — only their count is exposed.
      prisma.searchHistory.findMany({
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: { id: true, query: true, queryType: true, createdAt: true },
      }),
      prisma.aIConversation.findMany({
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: { id: true, assistantType: true, createdAt: true },
      }),
      // Upload-TYPE counts only (e.g. "vcf": 4, "lab_report": 1) — never the
      // record rows themselves, so the dashboard can chart the mix without
      // any PHI (content/title/fileUrl) leaving the server.
      prisma.medicalData.groupBy({
        by: ['dataType'],
        _count: { _all: true },
      }),
      // Agent mesh (services/api/src/services/agentMesh.js). Both stores hold
      // OPERATIONAL metadata only — agent ids, topics, model names, counts —
      // so the whole surface is safe to report verbatim. Bounded on purpose.
      prisma.agentMessage.count({
        where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      }),
      prisma.agentLesson.findMany({
        orderBy: { updatedAt: 'desc' },
        take: AGENT_MESH_LESSON_LIMIT,
        select: {
          authorAgent: true, topic: true, claim: true, timesSeen: true, consumedBy: true,
        },
      }),
    ]);

    return {
      stats: {
        totalUsers, activeSubscriptions, totalSearches,
        totalConversations, totalMedicalRecords, totalGeneSets, totalActivities,
      },
      recentActivity,
      recentSearches,
      recentConversations,
      medicalDataTypeBreakdown: medicalDataTypeBreakdown.map((row) => ({
        dataType: row.dataType,
        count: row._count._all,
      })),
      agentMesh: {
        messagesLast7d: agentMessagesLast7d,
        lessons: (agentLessons || []).map((row) => ({
          authorAgent: row.authorAgent,
          topic: row.topic,
          claim: row.claim,
          timesSeen: row.timesSeen,
          consumedBy: row.consumedBy && typeof row.consumedBy === 'object' ? row.consumedBy : {},
        })),
      },
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

  // Hard-delete a user and (via onDelete: Cascade on every user-owned
  // relation in schema.prisma) all their data. Reserved to super_admin; the
  // UI's confirm dialog promises permanent deletion, so this must actually
  // remove the row — the old soft-ban here left "deleted" users in the list.
  // The param accepts a user id OR an email: the deployed web app has sent
  // both across versions, and an unknown identifier must be a 404, not a
  // Prisma P2025 500.
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

    // Write the audit entry BEFORE the delete: AuditLog.userId references the
    // acting admin (not the target), so it survives the cascade, but ordering
    // it first guarantees a trace exists even if the delete itself fails.
    await createAuditLog(
      prisma,
      {
        userId: request.user.userId,
        action: 'delete_user',
        entityType: 'user',
        entityId: user.id,
        metadata: { email: user.email },
      },
      { required: true }
    );

    await prisma.user.delete({ where: { id: user.id } });

    return { success: true };
  });
}
