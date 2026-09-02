import { z } from 'zod';
import crypto from 'crypto';
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  verifyRefreshTokenHash,
} from '../utils/auth.js';
import { authenticate } from '../middleware/auth.js';
import { ensureCsrfCookie } from '../middleware/csrf.js';
import { ForbiddenError, ValidationError, UnauthorizedError } from '../utils/errors.js';
import { createAuditLog } from '../utils/audit.js';
import { recordSuccessfulLogin } from '../services/firstLoginNotifier.js';
import { getAuthCookieOptions, getClearCookieOptions } from '../utils/cookies.js';
import { signupTrialGrant } from '../utils/signupTrial.js';
import { grantOrExtendFreePeriod, FREE_PERIOD_DAYS } from '../utils/freePeriod.js';
import { resolveEntitlements } from '../middleware/entitlements.js';
import { withSerializableRetry } from '../utils/transactions.js';

/**
 * Lower-case + trim the email before any DB lookup or write so the same
 * physical address can never produce two distinct users.
 *
 * The database column is also case-insensitive (`citext`); keeping this
 * normalization at the edge gives consistent display and token payloads while
 * the database constraint closes races and non-application write paths.
 */
function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

// LOGIN MAINTENANCE MODE — while active, /login and /register return 503 so
// no new sessions can be created during the upgrade. /refresh and /logout
// stay open so already-signed-in users are not kicked out. Frontend twin:
// apps/web/lib/maintenance.js (fallback banner copy); the Login page asks
// GET /auth/maintenance at runtime, so this switch is the single source of
// truth.
//
// TOGGLE (no code change, no rebuild): set LOGIN_MAINTENANCE on the API
// service (Railway) — '0' forces OFF, '1' forces ON; unset falls back to the
// code default below. Default OFF: maintenance is armed only deliberately
// via the env var, so a fresh deploy or a dropped variable can never lock
// users out by surprise.
const LOGIN_MAINTENANCE_ACTIVE = false;
// ETA copy. A hardcoded date rots the moment the window moves: this string still
// read "Monday, July 21" when the banner was raised on 2026-08-07, and a
// maintenance notice promising a time already in the past is worse than one that
// promises no time at all. So the ETA is an env var the owner can change WITHOUT
// a deploy (LOGIN_MAINTENANCE_ETA, read at boot like LOGIN_MAINTENANCE itself),
// and the built-in default deliberately names no date.
function resolveLoginMaintenanceEta() {
  const override = process.env.LOGIN_MAINTENANCE_ETA;
  if (typeof override === 'string' && override.trim()) return override.trim();
  return 'We expect to be back online shortly.';
}

const LOGIN_MAINTENANCE_ETA = resolveLoginMaintenanceEta();
const LOGIN_MAINTENANCE_MESSAGE =
  'GeneMap Discovery is being upgraded and sign-in is temporarily disabled. ' +
  LOGIN_MAINTENANCE_ETA;
const LOGIN_MAINTENANCE_COPY = {
  title: 'GeneMap Discovery is being upgraded',
  message:
    'We are performing a scheduled upgrade. Sign-in and registration are temporarily disabled while we finish.',
  etaText: LOGIN_MAINTENANCE_ETA,
};

function isLoginMaintenanceActive() {
  // Explicit env override wins in both directions.
  if (process.env.LOGIN_MAINTENANCE === '0') return false;
  if (process.env.LOGIN_MAINTENANCE === '1') return true;
  // Tests exercise the normal auth flows; maintenance is a production posture.
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return false;
  return LOGIN_MAINTENANCE_ACTIVE;
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const EDUCATION_LEVELS = [
  'elementary',
  'middle_school',
  'high_school',
  'undergraduate',
  'graduate',
  'postgraduate',
];

function optionalProfileText(max) {
  return z.preprocess(
    (value) => value === '' ? null : value,
    z.string().trim().max(max).nullable(),
  ).optional();
}

const profilePictureField = z.preprocess(
  (value) => value === '' ? null : value,
  z.string().max(750_000).refine((value) => (
    /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/u.test(value)
    || /^https:\/\/[^\s]+$/u.test(value)
  ), 'profilePicture must be a supported image data URL or HTTPS URL').nullable(),
).optional();

const profileUpdateSchema = z.object({
  displayName: optionalProfileText(160),
  fullName: optionalProfileText(200),
  phoneNumber: optionalProfileText(40),
  educationLevel: z.preprocess(
    (value) => value === '' ? null : value,
    z.enum(EDUCATION_LEVELS).nullable(),
  ).optional(),
  demographicsCollected: z.boolean().optional(),
  mailingListOptIn: z.boolean().optional(),
  age: z.preprocess(
    (value) => value === '' || value === null ? null : Number(value),
    z.number().int().min(1).max(130).nullable(),
  ).optional(),
  fieldOfStudy: optionalProfileText(160),
  researchInterests: optionalProfileText(5_000),
  currentProjects: optionalProfileText(5_000),
  publications: optionalProfileText(8_000),
  linkedinUrl: optionalProfileText(500),
  orcidId: optionalProfileText(32),
  profilePicture: profilePictureField,
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one profile field is required',
});

/**
 * Build the canonical "current user" payload returned by GET and PUT /auth/me.
 *
 * Both endpoints MUST return the identical shape — the SPA treats this object
 * as the single source of truth for the logged-in user (onboarding gate reads
 * `demographics_collected`; the Premium page reads `entitlements`). When PUT
 * returned a narrower object than GET, saving a profile silently dropped
 * `entitlements` and made premium users look downgraded until reload. Keeping
 * one serializer removes that drift class entirely.
 *
 * Returns null if the user no longer exists.
 */
async function serializeMe(prisma, userId) {
  const [user, entitlements] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    resolveEntitlements(prisma, userId),
  ]);

  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
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
  };
}

/**
 * Find the (unexpired) session row whose stored hash matches this refresh
 * token. The token itself isn't stored — only a bcrypt hash per session — so
 * we must compare against each candidate. Shared by /refresh and the /auth/me
 * refresh-fallback so both honor the exact same session-binding rules.
 */
async function findMatchingSession(prisma, userId, refreshToken) {
  const sessions = await prisma.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
  });
  for (const s of sessions) {
    if (await verifyRefreshTokenHash(refreshToken, s.refreshTokenHash)) {
      return s;
    }
  }
  return null;
}

export default async function authRoutes(fastify) {
  const prisma = fastify.prisma;

  /**
   * preHandler for /auth/me. Authenticates on the access token like the normal
   * middleware, BUT when the access token is missing or expired it transparently
   * falls back to a still-valid, session-matched refresh token and mints a fresh
   * access-token cookie inline.
   *
   * Why: access tokens live 15 min, refresh tokens 7 days. Without this, the
   * first /auth/me after the access token lapses always 401s — the SPA then
   * silently refreshes and retries, but the browser still logs a spurious
   * `401 ()` on every return visit. Honoring the refresh token here removes that
   * error at the source and saves the client a round-trip. Security is identical
   * to /refresh (valid HMAC/JWT, session-bound, not banned); we deliberately do
   * NOT rotate the refresh token so a GET stays idempotent and never races the
   * client's own /refresh.
   */
  const authenticateOrRefresh = async (request, reply) => {
    const accessToken = request.cookies?.accessToken;
    const accessPayload = accessToken ? verifyAccessToken(accessToken) : null;

    let userId = accessPayload?.userId || null;

    if (!userId) {
      const refreshToken = request.cookies?.refreshToken;
      const refreshPayload = refreshToken ? verifyRefreshToken(refreshToken) : null;
      if (!refreshPayload?.userId) {
        throw new UnauthorizedError('Authentication required');
      }
      const matched = await findMatchingSession(prisma, refreshPayload.userId, refreshToken);
      if (!matched) {
        throw new UnauthorizedError('Authentication required');
      }
      userId = refreshPayload.userId;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, banned: true },
    });
    if (!user) {
      throw new UnauthorizedError('Account not found');
    }
    if (user.banned) {
      throw new UnauthorizedError('Account has been suspended');
    }

    // Came in on the refresh path — issue a new short-lived access token so the
    // rest of this session's requests authenticate normally.
    if (!accessPayload?.userId) {
      const newAccess = generateAccessToken({ userId: user.id, email: user.email, role: user.role });
      reply.setCookie('accessToken', newAccess, getAuthCookieOptions({ maxAge: 15 * 60 }));
    }

    request.user = { userId: user.id, email: user.email, role: user.role };
  };

  // Public status probe: the Login page asks this at runtime so the banner
  // follows the server-side switch without a frontend rebuild. No auth.
  //
  // Exempt from rate limiting: this scope's strict bucket (10/15min) exists
  // to slow credential stuffing on login/register, but EVERY login-page load
  // fires this read-only GET (twice under React StrictMode in dev), so a
  // visitor reloading /login a few times exhausted the bucket and then the
  // probe — and their actual sign-in attempt — started failing. A constant
  // in-memory JSON response needs no throttle.
  fastify.get('/maintenance', { config: { rateLimit: false } }, async () => ({
    active: isLoginMaintenanceActive(),
    ...LOGIN_MAINTENANCE_COPY,
  }));

  fastify.post('/register', async (request, reply) => {
    if (isLoginMaintenanceActive()) {
      return reply.code(503).send({ error: LOGIN_MAINTENANCE_MESSAGE });
    }
    const parsed = registerSchema.parse(request.body);
    const email = normalizeEmail(parsed.email);
    const passwordHash = await hashPassword(parsed.password);
    const trial = signupTrialGrant(process.env);
    const userId = crypto.randomUUID();
    const accessToken = generateAccessToken({ userId, email, role: 'user' });
    const refreshToken = generateRefreshToken({ userId });
    const refreshTokenHash = await hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const user = await withSerializableRetry(prisma, async (tx) => {
      const [existingUser, preBanMatch] = await Promise.all([
        tx.user.findUnique({ where: { email } }),
        tx.preBannedUser.findFirst({
          where: {
            status: 'active',
            email: { equals: email, mode: 'insensitive' },
          },
        }),
      ]);
      if (existingUser) throw new ValidationError('Email already registered');
      if (preBanMatch) {
        throw new ForbiddenError('Registration is not available for this account');
      }

      // SECURITY: public registration always creates a standard user. The
      // account, configured trial, session, and required registration receipt
      // form one commit so the caller never receives a partially provisioned
      // account that contradicts the advertised tier state.
      const created = await tx.user.create({
        data: {
          id: userId,
          email,
          passwordHash,
          role: 'user',
        },
      });

      if (trial) {
        await grantOrExtendFreePeriod(tx, created.id, FREE_PERIOD_DAYS[trial.period]);
      }

      await tx.session.create({
        data: { userId: created.id, refreshTokenHash, expiresAt },
      });

      await createAuditLog(tx, {
        userId: created.id,
        action: 'user.register',
        entityType: 'user',
        entityId: created.id,
        metadata: {
          trialPeriod: trial?.period || null,
          trialDays: trial?.days || 0,
        },
      }, { required: true });

      return created;
    });

    // Registration issues a session immediately, so it IS the first sign-in.
    // Fire-and-forget: stamping last_login_at / notifying the owner must never
    // affect the response.
    void recordSuccessfulLogin({ prisma, user, method: 'register' });

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
    if (isLoginMaintenanceActive()) {
      return reply.code(503).send({ error: LOGIN_MAINTENANCE_MESSAGE });
    }
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
      await withSerializableRetry(prisma, async (tx) => {
        const activeMatch = await tx.preBannedUser.findFirst({
          where: { id: preBanMatch.id, status: 'active' },
        });
        if (!activeMatch) return;

        await tx.user.update({
          where: { id: user.id },
          data: {
            banned: true,
            banReason: activeMatch.reason || 'Pre-ban triggered',
            bannedDate: new Date(),
            bannedBy: activeMatch.bannedBy,
          },
        });
        await tx.preBannedUser.update({
          where: { id: activeMatch.id },
          data: { status: 'triggered', triggeredAt: new Date() },
        });
        await createAuditLog(tx, {
          userId: user.id,
          action: 'user.pre_ban_triggered',
          entityType: 'user',
          entityId: user.id,
          metadata: { preBanId: activeMatch.id },
        }, { required: true });
      });
      throw new UnauthorizedError('Account has been suspended');
    }

    await createAuditLog(prisma, {
      userId: user.id,
      action: 'user.login',
      entityType: 'user',
      entityId: user.id,
    });

    // Fire-and-forget: stamp last_login_at; a NULL→set transition (first ever
    // sign-in) emails the owner. Never affects the login response.
    void recordSuccessfulLogin({ prisma, user, method: 'login' });

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
      // The CSRF cookie was left behind: routes/account.js already clears all
      // three on deletion, logout cleared only two. A stale double-submit
      // token must not survive a sign-out on a shared device.
      .clearCookie('csrfToken', getClearCookieOptions())
      .send({ success: true });
  });

  // POST /auth/refresh — rotate the refresh token + issue a new access token.
  fastify.post('/refresh', async (request, reply) => {
    const refreshToken = request.cookies?.refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedError('No refresh token');
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedError('Invalid refresh token');
    }
    if (!payload?.userId) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const matched = await findMatchingSession(prisma, payload.userId, refreshToken);
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

    try {
      await prisma.$transaction(async (tx) => {
        // Consume the presented session and create its replacement in one
        // commit. `deleteMany` makes concurrent refreshes deterministic: only
        // the transaction that consumes exactly one live row may mint a new
        // token. If replacement persistence fails, the delete rolls back and
        // the caller can safely retry the original token.
        const consumed = await tx.session.deleteMany({
          where: {
            id: matched.id,
            userId: user.id,
            expiresAt: { gt: new Date() },
          },
        });
        if (consumed.count !== 1) {
          throw new UnauthorizedError('Refresh token has already been used');
        }
        await tx.session.create({
          data: { userId: user.id, refreshTokenHash: newHash, expiresAt: newExpires },
        });
      });
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        reply
          .clearCookie('accessToken', getClearCookieOptions())
          .clearCookie('refreshToken', getClearCookieOptions())
          .clearCookie('csrfToken', getClearCookieOptions());
      }
      throw error;
    }

    const csrfToken = ensureCsrfCookie(request, reply);

    reply
      .setCookie('accessToken', newAccess, getAuthCookieOptions({ maxAge: 15 * 60 }))
      .setCookie('refreshToken', newRefresh, getAuthCookieOptions({ maxAge: 7 * 24 * 60 * 60 }))
      .send({ ok: true, csrfToken });
  });

  fastify.get('/me', { preHandler: authenticateOrRefresh }, async (request, reply) => {
    const me = await serializeMe(prisma, request.user.userId);
    if (!me) {
      throw new UnauthorizedError('User not found');
    }

    const csrfToken = ensureCsrfCookie(request, reply);
    return reply.send({ ...me, csrfToken });
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
    } = profileUpdateSchema.parse(request.body || {});

    const data = {};
    if (displayName !== undefined) data.displayName = displayName;
    if (fullName !== undefined) data.fullName = fullName;
    if (phoneNumber !== undefined) data.phoneNumber = phoneNumber;
    if (educationLevel !== undefined) data.educationLevel = educationLevel;
    if (demographicsCollected !== undefined) data.demographicsCollected = demographicsCollected;
    if (mailingListOptIn !== undefined) data.mailingListOptIn = mailingListOptIn;
    if (age !== undefined) {
      data.age = age;
    }
    if (fieldOfStudy !== undefined) data.fieldOfStudy = fieldOfStudy;
    if (researchInterests !== undefined) data.researchInterests = researchInterests;
    if (currentProjects !== undefined) data.currentProjects = currentProjects;
    if (publications !== undefined) data.publications = publications;
    if (linkedinUrl !== undefined) data.linkedinUrl = linkedinUrl;
    if (orcidId !== undefined) data.orcidId = orcidId;
    if (profilePicture !== undefined) data.profilePicture = profilePicture;

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: request.user.userId },
        data,
      });
      await createAuditLog(tx, {
        userId: request.user.userId,
        action: 'user.update_profile',
        entityType: 'user',
        entityId: request.user.userId,
        metadata: { fields: Object.keys(data) },
      }, { required: true });
    });

    // Return the SAME canonical shape as GET /auth/me (incl. `entitlements`).
    // The SPA's applyUser() replaces the auth user with this payload; returning
    // a narrower object dropped entitlements and made premium users appear
    // downgraded until a full reload.
    const me = await serializeMe(prisma, request.user.userId);
    if (!me) {
      throw new UnauthorizedError('User not found');
    }
    return reply.send(me);
  });
}
