import Stripe from 'stripe';
import { z } from 'zod';
import crypto from 'crypto';
import { authenticate } from '../middleware/auth.js';
import { AppError, ValidationError, ForbiddenError } from '../utils/errors.js';
import { createAuditLog } from '../utils/audit.js';
import {
  assertCheckoutAllowed,
  expireCheckoutSession,
} from '../services/accountClosureState.js';
import { activePersonalSubscription } from '../middleware/entitlements.js';

const CHECKOUT_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const CHECKOUT_SESSION_LIFETIME_SECONDS = 31 * 60;

const stripe = (() => {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY is not configured');
    return null;
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY);
})();

function requireStripe() {
  if (!stripe) {
    console.error('Stripe not properly configured');
    throw new ValidationError('Stripe is not configured for this deployment');
  }
  return stripe;
}

/**
 * Build the price-id lookup table from server env. The previous implementation
 * accepted `priceId` directly off the request body; that lets a paying user
 * trick the API into checking out at any Stripe price they discover. We now
 * resolve a fixed set of plan keys to server-controlled price IDs.
 */
function priceIdsFromEnv() {
  return {
    monthly: process.env.STRIPE_PRICE_MONTHLY,
    yearly: process.env.STRIPE_PRICE_YEARLY,
    team_monthly: process.env.STRIPE_PRICE_TEAM_MONTHLY,
    team_yearly: process.env.STRIPE_PRICE_TEAM_YEARLY,
    department_monthly: process.env.STRIPE_PRICE_DEPT_MONTHLY,
    department_yearly: process.env.STRIPE_PRICE_DEPT_YEARLY,
    enterprise_monthly: process.env.STRIPE_PRICE_ENT_MONTHLY,
    enterprise_yearly: process.env.STRIPE_PRICE_ENT_YEARLY,
  };
}

function priceIdForKey(key) {
  const ids = priceIdsFromEnv();
  const id = ids[key];
  if (!id) {
    throw new ValidationError(`Plan '${key}' is not configured for this deployment`);
  }
  if (/^price_(monthly|yearly|team_|dept_|ent_)/.test(id)) {
    if (process.env.NODE_ENV === 'production') {
      throw new ValidationError(`Plan '${key}' is using a placeholder Stripe price ID`);
    }
  }
  return id;
}

const checkoutSchema = z.object({
  plan: z.enum(['monthly', 'yearly']).default('monthly'),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

const institutionalCheckoutSchema = z.object({
  organizationName: z.string().trim().min(1).max(200),
  contactEmail: z.string().trim().toLowerCase().email().max(320),
  licenseType: z.enum(['team', 'department', 'enterprise']),
  billing: z.enum(['monthly', 'yearly']),
  seats: z.number().int().min(5).max(1_000),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

const institutionalWebhookMetadataSchema = z.object({
  userId: z.string().trim().min(1).max(128),
  organizationName: z.string().trim().min(1).max(200),
  contactEmail: z.string().trim().toLowerCase().email().max(320),
  licenseType: z.enum(['team', 'department', 'enterprise']),
  billing: z.enum(['monthly', 'yearly']),
  seats: z.coerce.number().int().min(5).max(1_000),
  isInstitutional: z.literal('true'),
  organizationKey: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  purchaseKey: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
}).strict();

const INSTITUTIONAL_SEAT_RANGES = Object.freeze({
  team: Object.freeze({ min: 5, max: 20 }),
  department: Object.freeze({ min: 21, max: 99 }),
  enterprise: Object.freeze({ min: 100, max: 1_000 }),
});

const BILLING_PRICE_KEYS = Object.freeze([
  'monthly',
  'yearly',
  'team_monthly',
  'team_yearly',
  'department_monthly',
  'department_yearly',
  'enterprise_monthly',
  'enterprise_yearly',
]);

function expectedStripeInterval(priceKey) {
  return priceKey.endsWith('yearly') ? 'year' : 'month';
}

function billingCatalogError(message) {
  const error = new AppError(message, 503);
  error.code = 'BILLING_CATALOG_UNAVAILABLE';
  return error;
}

function verifiedStripePrice(price, priceKey) {
  const configuredId = priceIdForKey(priceKey);
  const interval = expectedStripeInterval(priceKey);
  if (
    !price
    || price.id !== configuredId
    || price.active !== true
    || price.type !== 'recurring'
    || price.recurring?.interval !== interval
    || !Number.isInteger(price.unit_amount)
    || price.unit_amount <= 0
    || typeof price.currency !== 'string'
    || !price.currency.trim()
  ) {
    throw billingCatalogError(`Stripe price '${priceKey}' does not match the published recurring plan`);
  }
  return {
    id: configuredId,
    currency: price.currency.toLowerCase(),
    amountMinor: price.unit_amount,
    interval,
  };
}

async function retrieveVerifiedStripePrice(stripeClient, priceKey) {
  let price;
  try {
    price = await stripeClient.prices.retrieve(priceIdForKey(priceKey));
  } catch {
    throw billingCatalogError(`Stripe price '${priceKey}' could not be verified`);
  }
  return verifiedStripePrice(price, priceKey);
}

function publicPrice(price) {
  return {
    currency: price.currency,
    amountMinor: price.amountMinor,
    interval: price.interval,
  };
}

async function buildBillingCatalog(stripeClient) {
  const entries = await Promise.all(BILLING_PRICE_KEYS.map(async (key) => (
    [key, await retrieveVerifiedStripePrice(stripeClient, key)]
  )));
  const prices = Object.fromEntries(entries);
  const institution = (licenseType) => ({
    minSeats: INSTITUTIONAL_SEAT_RANGES[licenseType].min,
    maxSeats: INSTITUTIONAL_SEAT_RANGES[licenseType].max,
    monthly: publicPrice(prices[`${licenseType}_monthly`]),
    yearly: publicPrice(prices[`${licenseType}_yearly`]),
  });
  return {
    version: 1,
    personal: {
      monthly: publicPrice(prices.monthly),
      yearly: publicPrice(prices.yearly),
    },
    institutional: {
      team: institution('team'),
      department: institution('department'),
      enterprise: institution('enterprise'),
    },
  };
}

function subscriptionLine(subscription) {
  const items = Array.isArray(subscription?.items?.data) ? subscription.items.data : [];
  if (items.length !== 1) {
    throw new ValidationError('Stripe subscription must contain exactly one published plan');
  }
  return items[0];
}

function verifySubscriptionPrice(subscription, priceKey, expectedQuantity = 1) {
  const item = subscriptionLine(subscription);
  const price = item.price;
  if (stripeObjectId(price) !== priceIdForKey(priceKey)) {
    throw new ValidationError('Stripe subscription price does not match checkout metadata');
  }
  if (item.quantity !== expectedQuantity) {
    throw new ValidationError('Stripe subscription quantity does not match checkout metadata');
  }
  return verifiedStripePrice(price, priceKey);
}

function personalPriceKey(session, subscription) {
  const plan = session?.metadata?.plan;
  if (plan === 'monthly' || plan === 'yearly') return plan;
  const priceId = stripeObjectId(subscriptionLine(subscription).price);
  const configured = priceIdsFromEnv();
  if (priceId === configured.monthly) return 'monthly';
  if (priceId === configured.yearly) return 'yearly';
  throw new ValidationError('Personal checkout is not linked to a published plan');
}

function assertInstitutionalSeatRange({ licenseType, seats }) {
  const range = INSTITUTIONAL_SEAT_RANGES[licenseType];
  if (!range || seats < range.min || seats > range.max) {
    throw new ValidationError(
      `${licenseType} licenses require between ${range?.min || 5} and ${range?.max || 1_000} seats`,
    );
  }
}

function parseInstitutionalWebhookMetadata(metadata) {
  const parsed = institutionalWebhookMetadataSchema.safeParse(metadata);
  if (!parsed.success) {
    throw new ValidationError('Institutional checkout metadata is invalid');
  }
  assertInstitutionalSeatRange(parsed.data);
  const keys = institutionalCheckoutKeys(parsed.data);
  if (
    (parsed.data.organizationKey && parsed.data.organizationKey !== keys.organizationKey)
    || (parsed.data.purchaseKey && parsed.data.purchaseKey !== keys.purchaseKey)
  ) {
    throw new ValidationError('Institutional checkout identity metadata is invalid');
  }
  return { ...parsed.data, ...keys };
}

const portalSchema = z.object({
  returnUrl: z.string().url(),
});

const checkoutStatusSchema = z.object({
  sessionId: z.string().min(8).max(255).regex(/^cs_[A-Za-z0-9_]+$/u),
});

function isStripeEventDuplicate(error) {
  if (error?.code !== 'P2002') return false;
  const target = error?.meta?.target;
  if (!target) return false;
  const fields = Array.isArray(target) ? target : [String(target)];
  return fields.some((field) => field === 'stripeEventId' || field === 'stripe_event_id');
}

function assertAllowedRedirect(url, env) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new ValidationError('Invalid redirect URL');
  }
  const allowed = env.corsAllowList();
  if (allowed.length === 0) {
    throw new ValidationError('No allowed redirect origins configured');
  }
  if (allowed.includes('*')) return;
  if (!allowed.includes(parsed.origin)) {
    throw new ForbiddenError('Redirect URL origin is not allowed');
  }
}

function selfTestEnabled() {
  return process.env.NODE_ENV === 'test';
}

function selfTestSuccessUrl(successUrl, sessionId) {
  if (successUrl.includes('{CHECKOUT_SESSION_ID}')) {
    return successUrl.replace('{CHECKOUT_SESSION_ID}', sessionId);
  }
  const parsed = new URL(successUrl);
  parsed.searchParams.set('session_id', sessionId);
  return parsed.toString();
}

function stripeObjectId(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value.id === 'string') return value.id;
  return null;
}

function stripeTimestamp(value) {
  if (!Number.isFinite(value) || value <= 0) return null;
  return new Date(value * 1000);
}

function subscriptionPeriod(subscription) {
  const items = Array.isArray(subscription?.items?.data) ? subscription.items.data : [];
  const starts = [subscription?.current_period_start, ...items.map((item) => item.current_period_start)]
    .filter((value) => Number.isFinite(value));
  const ends = [subscription?.current_period_end, ...items.map((item) => item.current_period_end)]
    .filter((value) => Number.isFinite(value));
  return {
    start: stripeTimestamp(starts.length ? Math.min(...starts) : null),
    end: stripeTimestamp(ends.length ? Math.max(...ends) : null),
  };
}

function institutionalStatus(subscriptionStatus) {
  return subscriptionStatus === 'trialing' ? 'active' : subscriptionStatus;
}

function subscriptionGrantsAccess(status) {
  return status === 'active' || status === 'trialing';
}

function checkoutStateError(message, code, statusCode = 409) {
  const error = new AppError(message, statusCode);
  error.code = code;
  return error;
}

async function lockCheckout(tx, lockKey) {
  // A PostgreSQL transaction-scoped advisory lock serializes checkout creation
  // for one purchase identity across every API process. This closes the gap where two
  // simultaneous requests could both observe "no subscription" and create two
  // billable Stripe sessions before either webhook arrived.
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"
  `;
}

async function activePaidPersonalSubscription(tx, userId, now = new Date()) {
  const candidates = await tx.subscription.findMany({
    where: {
      userId,
      status: { in: ['active', 'trialing'] },
      currentPeriodEnd: { gt: now },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return candidates.find((candidate) => (
    candidate.planType !== 'admin_granted'
    && activePersonalSubscription(candidate, now)
  )) || null;
}

async function recentPersonalCheckout(tx, userId, now = new Date()) {
  return tx.auditLog.findFirst({
    where: {
      userId,
      action: 'billing.checkout_created',
      createdAt: { gte: new Date(now.getTime() - CHECKOUT_LOOKBACK_MS) },
    },
    orderBy: { createdAt: 'desc' },
  });
}

function validateRecordedCheckout(session, audit, userId) {
  const sessionId = audit?.metadata?.sessionId;
  const recordedPlan = audit?.metadata?.plan;
  if (
    !session
    || session.id !== sessionId
    || session.mode !== 'subscription'
    || session.metadata?.userId !== userId
    || !['monthly', 'yearly'].includes(recordedPlan)
    || session.metadata?.plan !== recordedPlan
  ) {
    throw checkoutStateError(
      'The existing Stripe checkout could not be verified. No additional checkout was created.',
      'CHECKOUT_STATE_INVALID',
      503,
    );
  }
  return recordedPlan;
}

async function retrieveRecordedCheckout(stripeClient, audit) {
  const sessionId = audit?.metadata?.sessionId;
  if (typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) return null;
  try {
    return await stripeClient.checkout.sessions.retrieve(sessionId);
  } catch (error) {
    if (
      error?.code === 'resource_missing'
      || error?.raw?.code === 'resource_missing'
      || error?.statusCode === 404
    ) return null;
    throw checkoutStateError(
      'Stripe could not verify the existing checkout. No additional checkout was created.',
      'CHECKOUT_STATE_UNAVAILABLE',
      503,
    );
  }
}

async function resolvePendingPersonalCheckout(stripeClient, audit, userId, requestedPlan) {
  const session = await retrieveRecordedCheckout(stripeClient, audit);
  if (!session) return null;
  const recordedPlan = validateRecordedCheckout(session, audit, userId);

  if (session.status === 'complete') {
    throw checkoutStateError(
      'Your completed checkout is still being activated. Wait for activation instead of starting another subscription.',
      'CHECKOUT_ACTIVATION_PENDING',
    );
  }
  if (session.status === 'expired') return null;
  if (session.status !== 'open' || typeof session.url !== 'string' || !session.url) {
    throw checkoutStateError(
      'The existing Stripe checkout is in an unsupported state. No additional checkout was created.',
      'CHECKOUT_STATE_INVALID',
      503,
    );
  }
  if (recordedPlan === requestedPlan) {
    return session;
  }

  // A deliberate plan switch replaces the prior open session. Expiration is
  // confirmed before a new session is created, so two differently-priced open
  // checkouts cannot coexist for the same personal account.
  await expireCheckoutSession(stripeClient, session.id);
  return null;
}

function digestCheckoutIdentity(parts) {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function normalizeOrganizationName(value) {
  return String(value || '').trim().replace(/\s+/gu, ' ').toLowerCase();
}

function institutionalCheckoutKeys(value) {
  const identity = {
    organizationName: normalizeOrganizationName(value?.organizationName),
    contactEmail: String(value?.contactEmail || '').trim().toLowerCase(),
  };
  const purchase = {
    ...identity,
    licenseType: String(value?.licenseType || ''),
    billing: String(value?.billing || ''),
    seats: Number(value?.seats),
  };
  return {
    organizationKey: digestCheckoutIdentity(identity),
    purchaseKey: digestCheckoutIdentity(purchase),
  };
}

async function activeInstitutionalContract(tx, keys, now = new Date()) {
  const licenses = await tx.institutionalLicense.findMany({
    where: {
      status: 'active',
      endDate: { gt: now },
      stripeCustomerId: { not: null },
      stripeSubscriptionId: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return licenses.find((license) => (
    institutionalCheckoutKeys(license).organizationKey === keys.organizationKey
  )) || null;
}

async function recentInstitutionalCheckoutAudits(tx, userId, keys, now = new Date()) {
  const exact = await tx.auditLog.findMany({
    where: {
      action: 'billing.institutional_checkout_created',
      entityType: 'institutional_checkout',
      entityId: keys.organizationKey,
      createdAt: { gte: new Date(now.getTime() - CHECKOUT_LOOKBACK_MS) },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  if (exact.length) return exact;

  // Transitional fallback for sessions recorded before organizationKey became
  // the entity id. It is user-scoped and validated against Stripe metadata
  // before reuse, so legacy audit rows cannot cross account boundaries.
  return tx.auditLog.findMany({
    where: {
      userId,
      action: 'billing.institutional_checkout_created',
      createdAt: { gte: new Date(now.getTime() - CHECKOUT_LOOKBACK_MS) },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
}

async function resolvePendingInstitutionalCheckout(stripeClient, audits, userId, keys) {
  for (const audit of audits) {
    const session = await retrieveRecordedCheckout(stripeClient, audit);
    if (!session) continue;
    if (
      session.id !== audit?.metadata?.sessionId
      || session.mode !== 'subscription'
      || session.metadata?.userId !== userId
      || session.metadata?.isInstitutional !== 'true'
    ) {
      throw checkoutStateError(
        'The existing institutional checkout could not be verified. No additional checkout was created.',
        'CHECKOUT_STATE_INVALID',
        503,
      );
    }

    const sessionKeys = institutionalCheckoutKeys(session.metadata);
    if (sessionKeys.organizationKey !== keys.organizationKey) continue;
    if (session.status === 'complete') {
      throw checkoutStateError(
        'Your completed institutional checkout is still being activated. Wait for activation instead of starting another license.',
        'CHECKOUT_ACTIVATION_PENDING',
      );
    }
    if (session.status === 'expired') continue;
    if (session.status !== 'open' || typeof session.url !== 'string' || !session.url) {
      throw checkoutStateError(
        'The existing institutional checkout is in an unsupported state. No additional checkout was created.',
        'CHECKOUT_STATE_INVALID',
        503,
      );
    }
    if (sessionKeys.purchaseKey === keys.purchaseKey) return session;

    await expireCheckoutSession(stripeClient, session.id);
    return null;
  }
  return null;
}

async function trackedEntitlementForSubscription(tx, stripeSubscriptionId) {
  const [personalSubscriptions, institutionalLicenses] = await Promise.all([
    tx.subscription.findMany({
      where: { stripeSubscriptionId },
      take: 2,
    }),
    tx.institutionalLicense.findMany({
      where: { stripeSubscriptionId },
      take: 2,
    }),
  ]);

  const records = [
    ...personalSubscriptions.map((record) => ({ kind: 'personal', record })),
    ...institutionalLicenses.map((record) => ({ kind: 'institutional', record })),
  ];
  if (records.length === 0) return null;
  if (records.length !== 1) {
    return { kind: 'ambiguous', records };
  }
  return records[0];
}

function verifiedTrackedContract(tracked, subscription) {
  if (tracked.kind === 'personal') {
    const priceKey = personalPriceKey({}, subscription);
    const price = verifySubscriptionPrice(subscription, priceKey, 1);
    return { planType: price.interval };
  }

  if (tracked.kind !== 'institutional') {
    throw new ValidationError('Stripe subscription maps to multiple entitlements');
  }

  const { licenseType, maxSeats } = tracked.record;
  assertInstitutionalSeatRange({ licenseType, seats: maxSeats });
  const priceId = stripeObjectId(subscriptionLine(subscription).price);
  const configured = priceIdsFromEnv();
  const monthlyKey = `${licenseType}_monthly`;
  const yearlyKey = `${licenseType}_yearly`;
  const priceKey = priceId === configured[monthlyKey]
    ? monthlyKey
    : priceId === configured[yearlyKey]
      ? yearlyKey
      : null;
  if (!priceKey) {
    throw new ValidationError('Institutional subscription is not linked to its published plan');
  }
  const price = verifySubscriptionPrice(subscription, priceKey, maxSeats);
  return {
    pricing: {
      billing: priceKey.endsWith('_yearly') ? 'yearly' : 'monthly',
      currency: price.currency,
      amountMinor: price.amountMinor,
      interval: price.interval,
    },
  };
}

async function revokeMismatchedContract(tx, stripeSubscriptionId) {
  await Promise.all([
    tx.subscription.updateMany({
      where: { stripeSubscriptionId },
      data: { status: 'contract_invalid' },
    }),
    tx.institutionalLicense.updateMany({
      where: { stripeSubscriptionId },
      data: { status: 'contract_invalid' },
    }),
  ]);
}

export default async function billingRoutes(fastify) {
  const prisma = fastify.prisma;
  const env = fastify.env;

  fastify.get('/catalog', { preHandler: authenticate }, async () => {
    return buildBillingCatalog(requireStripe());
  });

  fastify.post('/checkout-session', { preHandler: authenticate }, async (request, reply) => {
    const body = checkoutSchema.parse(request.body);
    assertAllowedRedirect(body.successUrl, env);
    assertAllowedRedirect(body.cancelUrl, env);

    if (selfTestEnabled() && request.body?._selfTest === true) {
      const sessionId = `cs_test_mock_${Date.now()}`;
      return reply.send({
        url: selfTestSuccessUrl(body.successUrl, sessionId),
        sessionId,
      });
    }

    const userId = request.user.userId;
    await assertCheckoutAllowed(prisma, userId);
    const verifiedPrice = await retrieveVerifiedStripePrice(requireStripe(), body.plan);
    const stripeClient = requireStripe();
    let createdSession = null;
    try {
      const result = await prisma.$transaction(async (tx) => {
        await lockCheckout(tx, `genemap:personal-checkout:${userId}`);
        await assertCheckoutAllowed(tx, userId);

        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) throw new ValidationError('User not found');

        const paidSubscription = await activePaidPersonalSubscription(tx, user.id);
        if (paidSubscription) {
          throw checkoutStateError(
            'An active personal subscription already exists. Use billing management to change or cancel it.',
            'ACTIVE_SUBSCRIPTION_EXISTS',
          );
        }

        const priorAudit = await recentPersonalCheckout(tx, user.id);
        if (priorAudit) {
          const pending = await resolvePendingPersonalCheckout(
            stripeClient,
            priorAudit,
            user.id,
            body.plan,
          );
          if (pending) return { session: pending, reused: true };
        }

        const priorCustomer = await tx.subscription.findFirst({
          where: {
            userId: user.id,
            stripeCustomerId: { not: null },
          },
          orderBy: { createdAt: 'desc' },
        });
        const customerId = priorCustomer?.stripeCustomerId || null;
        const sessionParams = {
          mode: 'subscription',
          customer: customerId || undefined,
          customer_email: customerId ? undefined : user.email,
          line_items: [{ price: verifiedPrice.id, quantity: 1 }],
          success_url: body.successUrl,
          cancel_url: body.cancelUrl,
          expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_LIFETIME_SECONDS,
          metadata: { userId: user.id, plan: body.plan },
          subscription_data: { metadata: { userId: user.id, plan: body.plan } },
        };

        createdSession = await stripeClient.checkout.sessions.create(sessionParams);
        await createAuditLog(tx, {
          userId: user.id,
          action: 'billing.checkout_created',
          entityType: 'subscription',
          metadata: { sessionId: createdSession.id, plan: body.plan },
        }, { required: true });

        // Account closure uses the same audit ledger. Re-check after the
        // external call so a closure begun during Stripe creation prevents the
        // session from being returned; the catch below expires it.
        await assertCheckoutAllowed(tx, user.id);
        return { session: createdSession, reused: false };
      }, {
        maxWait: 5_000,
        timeout: 20_000,
      });

      return reply.send({
        url: result.session.url,
        sessionId: result.session.id,
        reused: result.reused,
      });
    } catch (error) {
      if (createdSession?.id) {
        try {
          await expireCheckoutSession(stripeClient, createdSession.id);
        } catch (expirationError) {
          request.log.error(
            { code: expirationError?.code || 'CHECKOUT_COMPENSATION_FAILED' },
            'failed to expire uncommitted personal checkout',
          );
          throw expirationError;
        }
      }
      throw error;
    }
  });

  fastify.post('/portal-session', { preHandler: authenticate }, async (request, reply) => {
    const body = portalSchema.parse(request.body);
    assertAllowedRedirect(body.returnUrl, env);

    if (selfTestEnabled() && request.body?._selfTest === true) {
      return reply.send({ url: body.returnUrl });
    }

    await assertCheckoutAllowed(prisma, request.user.userId);
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: request.user.userId,
        stripeCustomerId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    });
    const managedLicense = subscription?.stripeCustomerId
      ? null
      : await prisma.institutionalLicense.findFirst({
        where: {
          adminUsers: { has: request.user.userId },
          stripeCustomerId: { not: null },
        },
        orderBy: { updatedAt: 'desc' },
      });
    const customerId = subscription?.stripeCustomerId || managedLicense?.stripeCustomerId;

    if (!customerId) {
      throw new ValidationError('No Stripe billing account found');
    }

    const session = await requireStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: body.returnUrl,
    });

    await createAuditLog(prisma, {
      userId: request.user.userId,
      action: 'billing.portal_accessed',
      entityType: managedLicense ? 'institutional_license' : 'subscription',
      entityId: managedLicense?.id || subscription?.id,
    }, { required: true });

    return reply.send({ url: session.url });
  });

  fastify.post('/institutional-checkout', { preHandler: authenticate }, async (request, reply) => {
    const body = institutionalCheckoutSchema.parse(request.body);
    assertInstitutionalSeatRange(body);
    assertAllowedRedirect(body.successUrl, env);
    assertAllowedRedirect(body.cancelUrl, env);

    if (selfTestEnabled() && request.body?._selfTest === true) {
      const sessionId = `cs_test_mock_institutional_${Date.now()}`;
      return reply.send({
        url: selfTestSuccessUrl(body.successUrl, sessionId),
        sessionId,
      });
    }

    const userId = request.user.userId;
    await assertCheckoutAllowed(prisma, userId);
    const priceKey = `${body.licenseType}_${body.billing}`;
    const verifiedPrice = await retrieveVerifiedStripePrice(requireStripe(), priceKey);
    const stripeClient = requireStripe();
    const keys = institutionalCheckoutKeys(body);
    let createdSession = null;
    try {
      const result = await prisma.$transaction(async (tx) => {
        await lockCheckout(tx, `genemap:institutional-checkout:${keys.organizationKey}`);
        await assertCheckoutAllowed(tx, userId);

        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) throw new ValidationError('User not found');

        const activeContract = await activeInstitutionalContract(tx, keys);
        if (activeContract) {
          throw checkoutStateError(
            'An active Stripe license already exists for this organization and billing contact. Manage or renew that license instead.',
            'ACTIVE_INSTITUTIONAL_LICENSE_EXISTS',
          );
        }

        const priorAudits = await recentInstitutionalCheckoutAudits(tx, user.id, keys);
        const pending = await resolvePendingInstitutionalCheckout(
          stripeClient,
          priorAudits,
          user.id,
          keys,
        );
        if (pending) return { session: pending, reused: true };

        const stripeMetadata = {
          userId: user.id,
          organizationName: body.organizationName,
          contactEmail: body.contactEmail,
          licenseType: body.licenseType,
          billing: body.billing,
          seats: String(body.seats),
          isInstitutional: 'true',
          organizationKey: keys.organizationKey,
          purchaseKey: keys.purchaseKey,
        };
        createdSession = await stripeClient.checkout.sessions.create({
          mode: 'subscription',
          customer_email: body.contactEmail,
          line_items: [{ price: verifiedPrice.id, quantity: body.seats }],
          success_url: body.successUrl,
          cancel_url: body.cancelUrl,
          expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_LIFETIME_SECONDS,
          metadata: stripeMetadata,
          subscription_data: { metadata: stripeMetadata },
        });

        await createAuditLog(tx, {
          userId: user.id,
          action: 'billing.institutional_checkout_created',
          entityType: 'institutional_checkout',
          entityId: keys.organizationKey,
          metadata: {
            sessionId: createdSession.id,
            organizationKey: keys.organizationKey,
            purchaseKey: keys.purchaseKey,
            licenseType: body.licenseType,
            billing: body.billing,
            seats: body.seats,
          },
        }, { required: true });
        await assertCheckoutAllowed(tx, user.id);
        return { session: createdSession, reused: false };
      }, {
        maxWait: 5_000,
        timeout: 20_000,
      });

      return reply.send({
        url: result.session.url,
        sessionId: result.session.id,
        reused: result.reused,
      });
    } catch (error) {
      if (createdSession?.id) {
        try {
          await expireCheckoutSession(stripeClient, createdSession.id);
        } catch (expirationError) {
          request.log.error(
            { code: expirationError?.code || 'CHECKOUT_COMPENSATION_FAILED' },
            'failed to expire uncommitted institutional checkout',
          );
          throw expirationError;
        }
      }
      throw error;
    }
  });

  // A Stripe success redirect proves only that the browser returned from
  // Checkout. It does not prove that our signed webhook has committed the
  // entitlement. The UI polls this owner-bound status until both facts are
  // true, so it never advertises access that the API will still reject.
  fastify.get('/checkout-status', { preHandler: authenticate }, async (request) => {
    const { sessionId } = checkoutStatusSchema.parse(request.query);
    let session;
    try {
      session = await requireStripe().checkout.sessions.retrieve(sessionId);
    } catch (error) {
      if (error?.type === 'StripeInvalidRequestError' || error?.statusCode === 404) {
        throw new ValidationError('Checkout session could not be verified');
      }
      const unavailable = new AppError('Checkout verification is temporarily unavailable', 503);
      unavailable.code = 'CHECKOUT_VERIFICATION_UNAVAILABLE';
      throw unavailable;
    }

    if (session?.metadata?.userId !== request.user.userId) {
      throw new ForbiddenError('Checkout session does not belong to this account');
    }

    const subscriptionId = stripeObjectId(session.subscription);
    const kind = session.metadata?.isInstitutional === 'true' ? 'institutional' : 'personal';
    const checkoutComplete = session.status === 'complete';
    const now = new Date();
    let entitlementActive = false;

    if (checkoutComplete && subscriptionId) {
      if (kind === 'institutional') {
        entitlementActive = Boolean(await prisma.institutionalLicense.findFirst({
          where: {
            stripeSubscriptionId: subscriptionId,
            adminUsers: { has: request.user.userId },
            status: 'active',
            startDate: { lte: now },
            endDate: { gt: now },
          },
        }));
      } else {
        entitlementActive = Boolean(await prisma.subscription.findFirst({
          where: {
            stripeSubscriptionId: subscriptionId,
            userId: request.user.userId,
            status: { in: ['active', 'trialing'] },
            currentPeriodEnd: { gt: now },
            planType: { in: ['month', 'year'] },
            stripeCustomerId: { not: null },
          },
        }));
      }
    }

    return {
      state: entitlementActive ? 'active' : checkoutComplete ? 'processing' : 'incomplete',
      kind,
      checkoutComplete,
      entitlementActive,
    };
  });

  fastify.post('/webhook', async (request, reply) => {
    const sig = request.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig) return reply.status(400).send({ error: 'Missing stripe-signature header' });
    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not configured');
      return reply.status(400).send({ error: 'Webhook not configured' });
    }

    const stripeClient = stripe;
    if (!stripeClient) {
      console.error('STRIPE_SECRET_KEY not configured');
      return reply.status(500).send({ error: 'Stripe not configured' });
    }

    let event;
    try {
      event = stripeClient.webhooks.constructEvent(request.rawBody, sig, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return reply.status(400).send({ error: 'Webhook signature verification failed' });
    }

    try {
      let prefetchedSubscription = null;
      if (event.type === 'checkout.session.completed') {
        const s = event.data.object;
        const subscriptionId = stripeObjectId(s.subscription);
        if (s.metadata?.userId && subscriptionId) {
          prefetchedSubscription = await stripeClient.subscriptions.retrieve(subscriptionId);
        }
      } else if (
        event.type === 'customer.subscription.updated'
        && subscriptionGrantsAccess(event.data.object?.status)
      ) {
        const subscriptionId = stripeObjectId(event.data.object);
        if (subscriptionId) {
          prefetchedSubscription = await stripeClient.subscriptions.retrieve(subscriptionId);
        }
      } else if (event.type === 'invoice.payment_succeeded') {
        const subscriptionId = stripeObjectId(event.data.object?.subscription);
        if (subscriptionId) {
          prefetchedSubscription = await stripeClient.subscriptions.retrieve(subscriptionId);
        }
      }

      await prisma.$transaction(async (tx) => {
        await tx.stripeEvent.create({
          data: { stripeEventId: event.id, type: event.type },
        });

        switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const subscriptionId = stripeObjectId(session.subscription);
          const customerId = stripeObjectId(session.customer);
          if (!session.metadata?.userId || !subscriptionId || !customerId || !prefetchedSubscription) {
            throw new ValidationError('Checkout session is missing verified subscription metadata');
          }
          const period = subscriptionPeriod(prefetchedSubscription);
          if (!period.end) {
            throw new ValidationError('Stripe subscription is missing its current billing period');
          }
          const owner = await tx.user.findUnique({
            where: { id: session.metadata.userId },
          });
          if (!owner) {
            throw new ValidationError('Checkout owner no longer exists');
          }

          if (session.metadata?.isInstitutional === 'true') {
            const metadata = parseInstitutionalWebhookMetadata(session.metadata);
            const priceKey = `${metadata.licenseType}_${metadata.billing}`;
            const verifiedPrice = verifySubscriptionPrice(
              prefetchedSubscription,
              priceKey,
              metadata.seats,
            );
            const pricing = {
              billing: metadata.billing,
              currency: verifiedPrice.currency,
              amountMinor: verifiedPrice.amountMinor,
              interval: verifiedPrice.interval,
            };

            const license = await tx.institutionalLicense.create({
              data: {
                organizationName: metadata.organizationName,
                contactEmail: metadata.contactEmail,
                licenseType: metadata.licenseType,
                maxSeats: metadata.seats,
                status: institutionalStatus(prefetchedSubscription.status),
                startDate: period.start || new Date(),
                endDate: period.end,
                renewalDate: period.end,
                autoRenew: prefetchedSubscription.cancel_at_period_end !== true,
                stripeCustomerId: customerId,
                stripeSubscriptionId: subscriptionId,
                pricing,
                adminUsers: [metadata.userId],
              },
            });

            await createAuditLog(tx, {
              userId: metadata.userId,
              action: 'license.created',
              entityType: 'institutional_license',
              entityId: license.id,
              metadata: {
                stripeEventId: event.id,
                licenseType: metadata.licenseType,
                billing: metadata.billing,
                seats: metadata.seats,
              },
            }, { required: true });
          } else {
            const userId = session.metadata?.userId;
            const subscription = prefetchedSubscription;
            const priceKey = personalPriceKey(session, subscription);
            verifySubscriptionPrice(subscription, priceKey, 1);

            await tx.subscription.upsert({
              where: { stripeSubscriptionId: subscriptionId },
              create: {
                userId,
                stripeCustomerId: customerId,
                stripeSubscriptionId: subscriptionId,
                status: subscription.status,
                planType: subscription.items.data[0]?.price?.recurring?.interval || 'month',
                currentPeriodEnd: period.end,
              },
              update: {
                userId,
                stripeCustomerId: customerId,
                status: subscription.status,
                planType: subscription.items.data[0]?.price?.recurring?.interval || 'month',
                currentPeriodEnd: period.end,
              },
            });

            await createAuditLog(tx, {
              userId,
              action: 'subscription.created',
              entityType: 'subscription',
              entityId: subscriptionId,
              metadata: { stripeEventId: event.id },
            }, { required: true });
          }
          break;
        }

        case 'customer.subscription.updated': {
          const eventSubscription = event.data.object;
          const subscription = subscriptionGrantsAccess(eventSubscription.status)
            ? prefetchedSubscription
            : eventSubscription;
          if (!subscription || stripeObjectId(subscription) !== eventSubscription.id) {
            throw new ValidationError('Stripe subscription update could not be verified');
          }
          const tracked = await trackedEntitlementForSubscription(tx, subscription.id);
          if (!tracked) break;

          let contractUpdate = {};
          const period = subscriptionPeriod(subscription);
          if (subscriptionGrantsAccess(subscription.status)) {
            try {
              contractUpdate = verifiedTrackedContract(tracked, subscription);
              if (!period.end) {
                throw new ValidationError('Active subscription is missing its current billing period');
              }
            } catch (error) {
              await revokeMismatchedContract(tx, subscription.id);
              request.log.error({
                stripeEventId: event.id,
                stripeSubscriptionId: subscription.id,
                reason: error.message,
              }, 'Revoked entitlement after Stripe contract verification failed');
              break;
            }
          }

          const personalUpdate = {
            status: subscription.status,
            ...(tracked.kind === 'personal' ? contractUpdate : {}),
            ...(period.end ? { currentPeriodEnd: period.end } : {}),
          };
          const institutionUpdate = {
            status: institutionalStatus(subscription.status),
            autoRenew: subscription.cancel_at_period_end !== true,
            ...(tracked.kind === 'institutional' ? contractUpdate : {}),
            ...(period.end ? { endDate: period.end, renewalDate: period.end } : {}),
          };
          if (tracked.kind === 'personal') {
            await tx.subscription.updateMany({
              where: { stripeSubscriptionId: subscription.id },
              data: personalUpdate,
            });
          } else if (tracked.kind === 'institutional') {
            await tx.institutionalLicense.updateMany({
              where: { stripeSubscriptionId: subscription.id },
              data: institutionUpdate,
            });
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object;
          await Promise.all([
            tx.subscription.updateMany({
              where: { stripeSubscriptionId: subscription.id },
              data: { status: 'canceled' },
            }),
            tx.institutionalLicense.updateMany({
              where: { stripeSubscriptionId: subscription.id },
              data: { status: 'canceled' },
            }),
          ]);
          break;
        }

        case 'invoice.payment_succeeded': {
          const invoice = event.data.object;
          const subscriptionId = stripeObjectId(invoice.subscription);
          if (!subscriptionId) break;
          const subscription = prefetchedSubscription;
          if (!subscription || stripeObjectId(subscription) !== subscriptionId) {
            throw new ValidationError('Paid invoice subscription could not be verified');
          }
          const tracked = await trackedEntitlementForSubscription(tx, subscriptionId);
          if (!tracked) break;

          let contractUpdate = {};
          const period = subscriptionPeriod(subscription);
          if (subscriptionGrantsAccess(subscription.status)) {
            try {
              contractUpdate = verifiedTrackedContract(tracked, subscription);
              if (!period.end) {
                throw new ValidationError('Paid subscription is missing its current billing period');
              }
            } catch (error) {
              await revokeMismatchedContract(tx, subscriptionId);
              request.log.error({
                stripeEventId: event.id,
                stripeSubscriptionId: subscriptionId,
                reason: error.message,
              }, 'Rejected paid invoice because its Stripe contract no longer matches');
              break;
            }
          }

          if (tracked.kind === 'personal') {
            await tx.subscription.updateMany({
              where: { stripeSubscriptionId: subscriptionId },
              data: {
                status: subscription.status,
                ...contractUpdate,
                ...(period.end ? { currentPeriodEnd: period.end } : {}),
              },
            });
          } else if (tracked.kind === 'institutional') {
            await tx.institutionalLicense.updateMany({
              where: { stripeSubscriptionId: subscriptionId },
              data: {
                status: institutionalStatus(subscription.status),
                autoRenew: subscription.cancel_at_period_end !== true,
                ...contractUpdate,
                ...(period.end ? { endDate: period.end, renewalDate: period.end } : {}),
              },
            });
          }
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object;
          const subscriptionId = stripeObjectId(invoice.subscription);
          if (!subscriptionId) break;
          await Promise.all([
            tx.subscription.updateMany({
              where: { stripeSubscriptionId: subscriptionId },
              data: { status: 'past_due' },
            }),
            tx.institutionalLicense.updateMany({
              where: { stripeSubscriptionId: subscriptionId },
              data: { status: 'past_due' },
            }),
          ]);
          break;
        }
        }
      });
    } catch (error) {
      if (isStripeEventDuplicate(error)) {
        return reply.send({ received: true, duplicate: true });
      }
      console.error('Error processing webhook:', error.message);
      return reply.status(500).send({ error: 'Webhook processing failed' });
    }

    return reply.send({ received: true });
  });
}
