import { AppError, ForbiddenError } from '../utils/errors.js';
import {
  FEATURES,
  FREE_TIER_LIMITS,
  TIERS,
  featuresForTier,
  minimumTierForFeature,
} from '../config/entitlementCatalog.js';

function isAdminUser(user) {
  return user.role === 'admin' || user.role === 'super_admin';
}

function activeSubscriptionWhere(now = new Date()) {
  return {
    status: { in: ['active', 'trialing'] },
    currentPeriodEnd: { gt: now },
  };
}

export function activePersonalSubscription(subscription, now = new Date()) {
  if (!subscription || !['active', 'trialing'].includes(subscription.status)) return false;
  const periodEnd = new Date(subscription.currentPeriodEnd);
  if (!Number.isFinite(periodEnd.getTime()) || periodEnd <= now) return false;

  if (subscription.planType === 'admin_granted') {
    return subscription.status === 'active'
      && !subscription.stripeCustomerId
      && !subscription.stripeSubscriptionId;
  }
  return ['month', 'year'].includes(subscription.planType)
    && typeof subscription.stripeCustomerId === 'string'
    && subscription.stripeCustomerId.length > 0
    && typeof subscription.stripeSubscriptionId === 'string'
    && subscription.stripeSubscriptionId.length > 0;
}

function activeInstitutionalAccess(access, now = new Date()) {
  if (!access || access.status !== 'active') return false;
  const license = access.license;
  if (!license || license.status !== 'active') return false;
  if (license.startDate && new Date(license.startDate) > now) return false;
  if (license.endDate && new Date(license.endDate) <= now) return false;
  return true;
}

function isoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function resolvedEntitlements({
  user,
  subscription,
  licenseAccess,
  licenseAssignment,
  managedLicense = null,
  now = new Date(),
}) {
  const effectiveLicenseAccess = licenseAccess || licenseAssignment || null;
  const isAdmin = isAdminUser(user);
  const isInstitutional = activeInstitutionalAccess(effectiveLicenseAccess, now);
  const personalSubscription = activePersonalSubscription(subscription, now) ? subscription : null;
  const hasPersonalAccess = Boolean(personalSubscription);
  const tier = isAdmin
    ? TIERS.ADMIN
    : isInstitutional
      ? TIERS.INSTITUTIONAL
      : hasPersonalAccess
        ? TIERS.PREMIUM
        : TIERS.FREE;
  const isInstitutionManager = isAdmin
    || Boolean(managedLicense)
    || effectiveLicenseAccess?.accessType === 'administrator';
  const features = featuresForTier(tier);
  if (isInstitutionManager && !features.includes(FEATURES.INSTITUTION_MANAGEMENT)) {
    features.push(FEATURES.INSTITUTION_MANAGEMENT);
  }
  const accessSource = isAdmin
    ? 'admin'
    : isInstitutional
      ? 'institutional'
      : personalSubscription?.planType === 'admin_granted'
        ? 'complimentary'
        : personalSubscription
          ? 'subscription'
          : 'free';
  const accessExpiresAt = isInstitutional
    ? isoDate(effectiveLicenseAccess.license.endDate)
    : isoDate(personalSubscription?.currentPeriodEnd);

  return {
    tier,
    isPremium: tier !== TIERS.FREE,
    isInstitutional,
    isAdmin,
    features,
    limits: tier === TIERS.FREE ? { ...FREE_TIER_LIMITS } : null,
    access: {
      source: accessSource,
      expiresAt: accessExpiresAt,
      canManageBilling: Boolean(
        personalSubscription?.stripeCustomerId
        || (isInstitutionManager && (
          managedLicense?.stripeCustomerId
          || effectiveLicenseAccess?.license?.stripeCustomerId
        )),
      ),
    },
    licenseInfo: isInstitutional
      ? {
          organizationName: effectiveLicenseAccess.license.organizationName,
          licenseType: effectiveLicenseAccess.license.licenseType,
          accessType: effectiveLicenseAccess.accessType || 'seat',
        }
      : null,
  };
}

/** Resolve the authenticated user's effective tier from server-owned records. */
export async function resolveEntitlements(prisma, userId, { now = new Date() } = {}) {
  if (!userId) throw new ForbiddenError('Authentication required');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      subscriptions: {
        where: activeSubscriptionWhere(now),
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  });
  if (!user) throw new ForbiddenError('User not found');

  const [licenseAssignments, administeredLicenses] = await Promise.all([
    prisma.licenseAssignment?.findMany
      ? prisma.licenseAssignment.findMany({
        where: { userEmail: user.email, status: 'active' },
        include: { license: true },
        orderBy: { createdAt: 'desc' },
      })
      : prisma.licenseAssignment?.findFirst
        ? Promise.resolve(prisma.licenseAssignment.findFirst({
          where: { userEmail: user.email, status: 'active' },
          include: { license: true },
        })).then((assignment) => assignment ? [assignment] : [])
        : [],
    prisma.institutionalLicense?.findMany
      ? prisma.institutionalLicense.findMany({
        where: { adminUsers: { has: user.id } },
        orderBy: { endDate: 'desc' },
      })
      : prisma.institutionalLicense?.findFirst
        ? Promise.resolve(prisma.institutionalLicense.findFirst({
          where: { adminUsers: { has: user.id } },
          orderBy: { endDate: 'desc' },
        })).then((license) => license ? [license] : [])
        : [],
  ]);

  // A person can have historical assignments from multiple organizations.
  // Do not let an expired row encountered first mask a later valid license.
  const activeSeatAccess = licenseAssignments
    .map((assignment) => ({ ...assignment, accessType: 'seat' }))
    .find((assignment) => activeInstitutionalAccess(assignment, now)) || null;
  const managedLicense = administeredLicenses[0] || null;
  const activeAdministeredLicense = administeredLicenses.find((license) => (
    activeInstitutionalAccess({ status: 'active', license }, now)
  )) || null;
  const administratorAccess = activeAdministeredLicense
    ? { status: 'active', accessType: 'administrator', license: activeAdministeredLicense }
    : null;

  // Prefer a Stripe-owned subscription when a user also has a complimentary
  // window. Otherwise a newer admin grant could hide billing management and
  // mislabel a paying account as complimentary even though access remained on.
  const activeSubscriptions = (user.subscriptions || []).filter((subscription) => (
    activePersonalSubscription(subscription, now)
  ));
  const activeSubscription = activeSubscriptions.find((subscription) => (
    Boolean(subscription.stripeCustomerId)
  )) || activeSubscriptions[0] || null;

  return resolvedEntitlements({
    user,
    subscription: activeSubscription,
    licenseAccess: activeSeatAccess || administratorAccess,
    managedLicense,
    now,
  });
}

export async function attachEntitlements(request) {
  if (request.entitlements) return request.entitlements;
  request.entitlements = await resolveEntitlements(
    request.server.prisma,
    request.user?.userId,
  );
  return request.entitlements;
}

export function requireFeature(feature) {
  return async function enforceFeature(request) {
    const entitlements = await attachEntitlements(request);
    if (entitlements.features.includes(feature)) return;

    const requiredTier = minimumTierForFeature(feature) || TIERS.PREMIUM;
    const error = new ForbiddenError(
      'This feature requires the ' + requiredTier +
      ' tier. Your current tier is ' + entitlements.tier + '.',
    );
    error.code = 'ENTITLEMENT_REQUIRED';
    error.entitlement = { feature, requiredTier, currentTier: entitlements.tier };
    throw error;
  };
}

/** Backward-compatible name used by the bounded education routes. */
export async function checkEducationEntitlement(request) {
  await attachEntitlements(request);
}

export async function enforceUsageLimit(request) {
  if (request.entitlements?.isPremium || request.entitlements?.isAdmin) return;

  const prisma = request.server.prisma;
  const userId = request.user.userId;
  const limits = request.entitlements?.limits || FREE_TIER_LIMITS;
  const policy = usagePolicyForRequest(request, limits);
  const now = new Date();
  const today = utcDayStart(now);
  const activeReservationCutoff = new Date(now.getTime() - USAGE_RESERVATION_TTL_MS);
  const reservationType = usageReservationType(policy.sessionType);
  const educationInput = request.educationInput || {};
  const topic = educationInput.topic?.id || educationInput.topic || policy.sessionType;
  const level = educationInput.level || educationInput.taskInput?.level || 'standard';

  let reservation;
  let typeCount;
  for (let attempt = 1; attempt <= USAGE_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        await tx.learningSession.deleteMany({
          where: {
            userId,
            type: reservationType,
            createdAt: { lt: activeReservationCutoff },
          },
        });
        const count = await tx.learningSession.count({
          where: {
            userId,
            OR: [
              { type: policy.sessionType, createdAt: { gte: today } },
              { type: reservationType, createdAt: { gte: activeReservationCutoff } },
            ],
          },
        });

        if (count >= policy.limit) {
          const error = new ForbiddenError(
            'Daily limit reached (' + policy.limit + ' ' + policy.sessionType +
            's per day on the free tier). Upgrade to Premium for unlimited access.',
          );
          error.code = 'DAILY_TIER_LIMIT_REACHED';
          throw error;
        }

        const created = await tx.learningSession.create({
          data: {
            userId,
            topic,
            level,
            type: reservationType,
            content: {
              quotaReservation: true,
              expiresAt: new Date(now.getTime() + USAGE_RESERVATION_TTL_MS).toISOString(),
            },
          },
        });
        return { reservation: created, typeCount: count };
      }, {
        isolationLevel: 'Serializable',
        maxWait: 5_000,
        timeout: 10_000,
      });
      reservation = result.reservation;
      typeCount = result.typeCount;
      break;
    } catch (error) {
      if (error?.code === 'DAILY_TIER_LIMIT_REACHED') throw error;
      if (error?.code === 'P2034' && attempt < USAGE_TRANSACTION_ATTEMPTS) continue;
      request.log.error(
        { code: error?.code || 'USAGE_RESERVATION_FAILED' },
        'free-tier usage reservation failed',
      );
      const unavailable = new AppError(
        'Usage accounting is temporarily unavailable. Please retry shortly.',
        503,
      );
      unavailable.code = 'USAGE_ACCOUNTING_UNAVAILABLE';
      throw unavailable;
    }
  }

  if (!reservation) {
    const unavailable = new AppError(
      'Usage accounting is temporarily unavailable. Please retry shortly.',
      503,
    );
    unavailable.code = 'USAGE_ACCOUNTING_UNAVAILABLE';
    throw unavailable;
  }

  request.usageReservation = {
    id: reservation.id,
    sessionType: policy.sessionType,
  };
  request.usageInfo = {
    used: typeCount,
    limit: policy.limit,
    type: policy.sessionType,
    remaining: policy.limit - typeCount,
  };
}

export const requireResearchSearch = requireFeature(FEATURES.RESEARCH_SEARCH);
export const requireResearchWorkspace = requireFeature(FEATURES.RESEARCH_WORKSPACE);
export const requireResearchAi = requireFeature(FEATURES.RESEARCH_AI);
export const requireGenomicsTools = requireFeature(FEATURES.GENOMICS_TOOLS);
export const requireHealthRecords = requireFeature(FEATURES.HEALTH_RECORDS);
export const requireProfileAssistants = requireFeature(FEATURES.PROFILE_ASSISTANTS);
export const requireInstitutionManagement = requireFeature(FEATURES.INSTITUTION_MANAGEMENT);

/**
 * Persist a usage record so that subsequent limit checks see the increment.
 * Terminal publication states use a non-counted type so outages do not consume
 * a user's allowance.
 */
export async function recordUsage(prisma, userId, sessionType, content = {}) {
  if (!prisma || !userId || !sessionType) {
    const error = new AppError('Usage accounting is unavailable.', 503);
    error.code = 'USAGE_ACCOUNTING_UNAVAILABLE';
    throw error;
  }
  try {
    return await prisma.learningSession.create({
      data: {
        userId,
        topic: content.topic || sessionType,
        level: content.level || 'standard',
        type: sessionType,
        content,
      },
    });
  } catch (err) {
    console.error('[entitlements] recordUsage failed:', err?.message || err);
    const error = new AppError(
      'Usage accounting is temporarily unavailable. Please retry shortly.',
      503,
    );
    error.code = 'USAGE_ACCOUNTING_UNAVAILABLE';
    throw error;
  }
}

const USAGE_RESERVATION_TTL_MS = 5 * 60 * 1000;
const USAGE_TRANSACTION_ATTEMPTS = 3;

function utcDayStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function usageReservationType(sessionType) {
  return `quota_reservation:${sessionType}`;
}

function usagePolicyForRequest(request, limits) {
  const routeUrl = String(request.routeOptions?.url || request.url || '').split('?')[0];
  let limitKey = 'explanations_per_day';
  let sessionType = 'explanation';
  if (routeUrl.endsWith('/quiz')) {
    limitKey = 'quizzes_per_day';
    sessionType = 'quiz';
  } else if (routeUrl.endsWith('/chat')) {
    limitKey = 'chat_messages_per_day';
    sessionType = 'chat';
  }
  return {
    limitKey,
    sessionType,
    limit: limits[limitKey] || FREE_TIER_LIMITS[limitKey] || 5,
  };
}

/**
 * Release a pending quota reservation after an early handler failure. Stale
 * reservations also age out of quota calculations, so a process crash cannot
 * block a user for the rest of the day.
 */
export async function releaseUsageReservation(prisma, request) {
  const pendingReservation = request?.usageReservation;
  const reservationId = pendingReservation?.id;
  if (!prisma || !reservationId) return;
  request.usageReservation = null;
  try {
    await prisma.learningSession.deleteMany({
      where: {
        id: reservationId,
        type: usageReservationType(pendingReservation.sessionType),
      },
    });
  } catch (error) {
    request.log?.error(
      { code: error?.code || 'USAGE_RESERVATION_RELEASE_FAILED' },
      'free-tier usage reservation release failed',
    );
  }
}

/**
 * Convert a pending free-tier reservation into the durable session that the
 * caller may receive. Premium sessions use the same required persistence path.
 * A successful publication is never returned on a best-effort counter write.
 */
export async function finalizeUsageSession(prisma, request, {
  topic,
  level,
  type,
  content,
  counted,
}) {
  const pendingReservation = request?.usageReservation;
  try {
    let session;
    if (pendingReservation) {
      if (pendingReservation.sessionType !== type) {
        throw new Error('usage reservation type does not match publication type');
      }
      const finalType = counted ? type : `${type}_status`;
      const updated = await prisma.learningSession.updateMany({
        where: {
          id: pendingReservation.id,
          type: usageReservationType(type),
        },
        data: {
          topic,
          level,
          type: finalType,
          content,
          createdAt: new Date(),
        },
      });
      if (updated.count !== 1) {
        throw new Error('usage reservation was missing or already finalized');
      }
      session = { id: pendingReservation.id, type: finalType };
      request.usageReservation = null;
      if (counted && request.usageInfo) {
        request.usageInfo.used += 1;
        request.usageInfo.remaining = Math.max(0, request.usageInfo.remaining - 1);
      }
    } else {
      session = await prisma.learningSession.create({
        data: {
          userId: request.user.userId,
          topic,
          level,
          type: counted ? type : `${type}_status`,
          content,
        },
      });
    }
    return session;
  } catch (error) {
    await releaseUsageReservation(prisma, request);
    request.log?.error(
      { code: error?.code || 'USAGE_FINALIZATION_FAILED', type },
      'publication usage finalization failed',
    );
    const unavailable = new AppError(
      'The generated result could not be recorded safely. Please retry shortly.',
      503,
    );
    unavailable.code = 'USAGE_ACCOUNTING_UNAVAILABLE';
    throw unavailable;
  }
}

export const __test = {
  activeInstitutionalAccess,
  activePersonalSubscription,
  activeSubscriptionWhere,
  resolvedEntitlements,
  usagePolicyForRequest,
  usageReservationType,
  utcDayStart,
  USAGE_RESERVATION_TTL_MS,
};
