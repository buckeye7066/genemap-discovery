import { z } from 'zod';
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  verifyRefreshToken,
  verifyRefreshTokenHash,
} from '../utils/auth.js';
import { authenticate } from '../middleware/auth.js';
import { ensureCsrfCookie } from '../middleware/csrf.js';
import { ValidationError, UnauthorizedError } from '../utils/errors.js';
import { createAuditLog } from '../utils/audit.js';
import { getAuthCookieOptions, getClearCookieOptions } from '../utils/cookies.js';

/**
 * Lower-case + trim the email before any DB lookup or write so the same
 * physical address can never produce two distinct users.
 *
 * NOTE: this runs on the application layer because the `users.email` column
 * is a plain `text UNIQUE`. A future migration should switch the column to
 * `citext` (and drop the application-side normalisation) — see
 * services/api/prisma/migrations/2_email_citext_*.sql when that ships.
 */
function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export default async function authRoutes(fastify) {
  const prisma = fastify.prisma;

  fastify.post('/register', async (request, reply) => {
    const parsed = registerSchema.parse(request.body);
    const email = normalizeEmail(parsed.email);

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ValidationError('Email already registered');
    }

    const passwordHash = await hashPassword(parsed.password);

    // SECURITY: never assign admin/super_admin during public self-registration.
    // ADMIN_EMAILS is only used during the initial bootstrap script
    // (scripts/grant-admin.js); a fresh signup is always 'user'.
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'user',
      },
    });

    await createAuditLog(prisma, {
      userId: user.id,
      action: 'user.register',
      entityType: 'user',
      entityId: user.id,
    });

    const accessToken = generateAccessToken({ userId: user.id, email: user.email, role: user.role });
    const refreshToken = generateRefreshToken({ userId: user.id });

    const refreshTokenHash = await hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.session.create({
      data: { userId: user.id, refreshTokenHash, expiresAt },
    });

    // Issue CSRF cookie on register so the SPA can immediately make
    // state-changing calls (logout, profile update) without a /auth/me
    // round-trip. Also return the token in the body: on a cross-site deploy
    // the SPA can't read the cookie (different domain), so the body is the
    // only channel that reaches it.
    const csrfToken = ensureCsrfCookie(request, reply);

    reply
      .setCookie('accessToken', accessToken, getAuthCookieOptions({ maxAge: 15 * 60 }))
      .setCookie('refreshToken', refreshToken, getAuthCookieOptions({ maxAge: 7 * 24 * 60 * 60 }))
      .send({
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        csrfToken,
      });
  });

  fastify.post('/login', async (request, reply) => {
    const parsed = loginSchema.parse(request.body);
    const email = normalizeEmail(parsed.email);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const isValid = await verifyPassword(parsed.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError('Invalid credentials');
    }

    if (user.banned) {
      throw new UnauthorizedError('Account has been suspended');
    }

    const preBanMatch = await prisma.preBannedUser.findFirst({
      where: {
        status: 'active',
        OR: [
          { email: { equals: user.email, mode: 'insensitive' } },
          ...(user.phoneNumber ? [{ phoneNumber: user.phoneNumber }] : []),
          ...(user.fullName ? [{ fullName: { equals: user.fullName, mode: 'insensitive' } }] : []),
        ],
      },
    });

    if (preBanMatch) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          banned: true,
          banReason: preBanMatch.reason || 'Pre-ban triggered',
          bannedDate: new Date(),
          bannedBy: preBanMatch.bannedBy,
        },
      });
      await prisma.preBannedUser.update({
        where: { id: preBanMatch.id },
        data: { status: 'triggered', triggeredAt: new Date() },
      });
      throw new UnauthorizedError('Account has been suspended');
    }

    await createAuditLog(prisma, {
      userId: user.id,
      action: 'user.login',
      entityType: 'user',
      entityId: user.id,
    });

    const accessToken = generateAccessToken({ userId: user.id, email: user.email, role: user.role });
    const refreshToken = generateRefreshToken({ userId: user.id });

    const refreshTokenHash = await hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.session.create({
      data: { userId: user.id, refreshTokenHash, expiresAt },
    });

    // Same rationale as /register: ensure the SPA always has a CSRF token
    // BEFORE its first authenticated state-changing call, and hand it back in
    // the body so cross-site SPAs (which can't read the cookie) get it too.
    const csrfToken = ensureCsrfCookie(request, reply);

    reply
      .setCookie('accessToken', accessToken, getAuthCookieOptions({ maxAge: 15 * 60 }))
      .setCookie('refreshToken', refreshToken, getAuthCookieOptions({ maxAge: 7 * 24 * 60 * 60 }))
      .send({
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        csrfToken,
      });
  });

  fastify.post('/logout', { preHandler: authenticate }, async (request, reply) => {
    const refreshToken = request.cookies.refreshToken;

    const logoutOps = [
      createAuditLog(prisma, {
        userId: request.user.userId,
        action: 'user.logout',
        entityType: 'user',
        entityId: request.user.userId,
      }),
    ];
    if (refreshToken) {
      logoutOps.push(
        prisma.session.deleteMany({
          where: { userId: request.user.userId },
        })
      );
    }
    await Promise.all(logoutOps);

    reply
      .clearCookie('accessToken', getClearCookieOptions())
      .clearCookie('refreshToken', getClearCookieOptions())
      .send({ success: true });
  });

  // POST /auth/refresh — rotate the refresh token + issue a new access token.
  fastify.post('/refresh', async (request, reply) => {
    const refreshToken = request.cookies?.refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedError('No refresh token');
    }

    const payload = verifyRefreshToken(refreshToken);
    if (!payload?.userId) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const sessions = await prisma.session.findMany({
      where: { userId: payload.userId, expiresAt: { gt: new Date() } },
    });
    let matched = null;
    for (const s of sessions) {
      if (await verifyRefreshTokenHash(refreshToken, s.refreshTokenHash)) {
        matched = s;
        break;
      }
    }
    if (!matched) {
      reply
        .clearCookie('accessToken', getClearCookieOptions())
        .clearCookie('refreshToken', getClearCookieOptions());
      throw new UnauthorizedError('Refresh token not recognised');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || user.banned) {
      throw new UnauthorizedError('Account not available');
    }

    const newAccess = generateAccessToken({ userId: user.id, email: user.email, role: user.role });
    const newRefresh = generateRefreshToken({ userId: user.id });
    const newHash = await hashRefreshToken(newRefresh);
    const newExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.session.delete({ where: { id: matched.id } }).catch(() => null);
    await prisma.session.create({
      data: { userId: user.id, refreshTokenHash: newHash, expiresAt: newExpires },
    });

    const csrfToken = ensureCsrfCookie(request, reply);

    reply
      .setCookie('accessToken', newAccess, getAuthCookieOptions({ maxAge: 15 * 60 }))
      .setCookie('refreshToken', newRefresh, getAuthCookieOptions({ maxAge: 7 * 24 * 60 * 60 }))
      .send({ ok: true, csrfToken });
  });

  fastify.get('/me', { preHandler: authenticate }, async (request, reply) => {
    const [user, licenseAssignment] = await Promise.all([
      prisma.user.findUnique({
        where: { id: request.user.userId },
        include: {
          subscriptions: {
            // Keep this in lock-step with checkEducationEntitlement: premium
            // requires an active/trialing AND unexpired subscription so the UI
            // never shows "Premium" after an admin-granted comp lapses.
            // currentPeriodEnd === null is treated as no-expiry (legacy rows).
            where: {
              status: { in: ['active', 'trialing'] },
              OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }],
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      prisma.licenseAssignment.findFirst({
        where: {
          userEmail: request.user.email,
          status: 'active',
        },
        include: { license: true },
      }),
    ]);

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    const isAdmin = user.role === 'admin' || user.role === 'super_admin';
    const isPremium = Boolean(
      isAdmin ||
        (user.subscriptions?.length ?? 0) > 0 ||
        (licenseAssignment && licenseAssignment.license?.status === 'active')
    );

    const entitlements = {
      isPremium,
      isAdmin,
      licenseInfo: licenseAssignment
        ? {
            organizationName: licenseAssignment.license.organizationName,
            licenseType: licenseAssignment.license.licenseType,
          }
        : null,
    };

    const csrfToken = ensureCsrfCookie(request, reply);

    reply.send({
      id: user.id,
      email: user.email,
      role: user.role,
      display_name: user.displayName || null,
      full_name: user.fullName || null,
      phone_number: user.phoneNumber || null,
      education_level: user.educationLevel || null,
      demographics_collected: user.demographicsCollected,
      mailing_list_opt_in: user.mailingListOptIn,
      age: user.age ?? null,
      field_of_study: user.fieldOfStudy || null,
      research_interests: user.researchInterests || null,
      current_projects: user.currentProjects || null,
      publications: user.publications || null,
      linkedin_url: user.linkedinUrl || null,
      orcid_id: user.orcidId || null,
      profile_picture: user.profilePicture || null,
      banned: user.banned,
      ban_reason: user.banReason || null,
      entitlements,
      csrfToken,
    });
  });

  fastify.put('/me', { preHandler: authenticate }, async (request, reply) => {
    const {
      displayName,
      fullName,
      phoneNumber,
      educationLevel,
      demographicsCollected,
      mailingListOptIn,
      age,
      fieldOfStudy,
      researchInterests,
      currentProjects,
      publications,
      linkedinUrl,
      orcidId,
      profilePicture,
    } = request.body || {};

    const data = {};
    if (displayName !== undefined) data.displayName = displayName;
    if (fullName !== undefined) data.fullName = fullName;
    if (phoneNumber !== undefined) data.phoneNumber = phoneNumber;
    if (educationLevel !== undefined) data.educationLevel = educationLevel;
    if (demographicsCollected !== undefined) data.demographicsCollected = demographicsCollected;
    if (mailingListOptIn !== undefined) data.mailingListOptIn = Boolean(mailingListOptIn);
    if (age !== undefined) {
      // The age input is a free <input type="number"> — empty string clears it,
      // anything non-numeric is ignored rather than throwing a Prisma type error.
      const parsed = age === '' || age === null ? null : Number.parseInt(age, 10);
      data.age = Number.isNaN(parsed) ? null : parsed;
    }
    if (fieldOfStudy !== undefined) data.fieldOfStudy = fieldOfStudy;
    if (researchInterests !== undefined) data.researchInterests = researchInterests;
    if (currentProjects !== undefined) data.currentProjects = currentProjects;
    if (publications !== undefined) data.publications = publications;
    if (linkedinUrl !== undefined) data.linkedinUrl = linkedinUrl;
    if (orcidId !== undefined) data.orcidId = orcidId;
    if (profilePicture !== undefined) data.profilePicture = profilePicture;

    const user = await prisma.user.update({
      where: { id: request.user.userId },
      data,
    });

    await createAuditLog(prisma, {
      userId: request.user.userId,
      action: 'user.update_profile',
      entityType: 'user',
      entityId: request.user.userId,
      metadata: { fields: Object.keys(data) },
    });

    reply.send({
      id: user.id,
      email: user.email,
      role: user.role,
      display_name: user.displayName,
      full_name: user.fullName,
      phone_number: user.phoneNumber || null,
      education_level: user.educationLevel,
      demographics_collected: user.demographicsCollected,
      mailing_list_opt_in: user.mailingListOptIn,
      age: user.age ?? null,
      field_of_study: user.fieldOfStudy || null,
      research_interests: user.researchInterests || null,
      current_projects: user.currentProjects || null,
      publications: user.publications || null,
      linkedin_url: user.linkedinUrl || null,
      orcid_id: user.orcidId || null,
      profile_picture: user.profilePicture || null,
    });
  });
}
