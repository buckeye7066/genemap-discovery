import { ZodError } from 'zod';
import { isCanonicalPublicationArtifact } from '@genemap/shared/publicationStatus';
import { AppError, sanitizeError } from '../utils/errors.js';

/**
 * Detect operational app errors regardless of cross-realm prototype chains
 * (vitest can load errors.js multiple times in some scenarios; relying on
 * `instanceof` alone made errors fall through to Fastify's default JSON
 * formatter, leaking statusCode/error/message instead of {error: '...'}).
 */
function isAppError(error) {
  if (error instanceof AppError) return true;
  return Boolean(
    error &&
      error.isOperational &&
      typeof error.statusCode === 'number' &&
      error.statusCode >= 400 &&
      error.statusCode < 600
  );
}

const NON_PUBLISHABLE_STATUSES = new Set(['withheld', 'unavailable', 'superseded']);

/**
 * Operational errors may expose only a validated non-publishable artifact.
 * This lets clients render an honest recovery state while ensuring generated
 * or fetched content can never leak through an error-details side channel.
 */
export function publicationErrorDetails(error) {
  const publication = error?.details?.publication;
  if (!publication || typeof publication !== 'object' || Array.isArray(publication)) {
    return undefined;
  }
  const projected = {
    contractVersion: publication.contractVersion,
    status: publication.status,
    content: publication.content,
    reasonCode: publication.reasonCode,
    correlationId: publication.correlationId,
    limitations: Array.isArray(publication.limitations)
      ? [...publication.limitations]
      : publication.limitations,
  };
  if (!isCanonicalPublicationArtifact(projected)
    || !NON_PUBLISHABLE_STATUSES.has(projected.status)) return undefined;
  return { publication: projected };
}

/**
 * A stable route label for logs / owner email / Sentry that NEVER carries user
 * values. Prefer the route PATTERN (e.g. "/entities/projects/:id"); fall back to
 * the path with the query string stripped so query params — which can be PII on
 * a medical app (e.g. ?q=<phenotype>) — never reach the log pipeline or external
 * error tracking.
 */
export function routeLabel(request) {
  return request.routeOptions?.url || String(request.url || '').split('?')[0];
}

function boundedCount(value) {
  if (Array.isArray(value)) return Math.min(value.length, 1_000_000);
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0
    ? Math.min(numeric, 1_000_000)
    : 0;
}

/**
 * Account-closure recovery needs to tell the user which classes of work
 * completed, but Stripe/session identifiers must never be serialized. Reduce
 * the internal exact receipt to bounded counts only.
 */
export function publicBillingProgress(progress) {
  if (!progress || typeof progress !== 'object') return null;
  return {
    checkoutSessionsExamined: boundedCount(progress.checkoutSessionsExamined),
    checkoutSessionsExpired: boundedCount(progress.checkoutSessionsExpired),
    subscriptionsCancelled: boundedCount(progress.subscriptionsCancelled),
    customersDeleted: boundedCount(progress.customersDeleted),
  };
}

const PUBLIC_TIERS = new Set(['free', 'premium', 'institutional', 'admin']);
const PUBLIC_FEATURE = /^[a-z][a-z0-9_.]{1,80}$/u;

function publicEntitlementDetails(error) {
  const value = error?.entitlement;
  if (!value || typeof value !== 'object') return null;
  if (!PUBLIC_FEATURE.test(String(value.feature || ''))) return null;
  if (!PUBLIC_TIERS.has(value.requiredTier) || !PUBLIC_TIERS.has(value.currentTier)) return null;
  return {
    feature: value.feature,
    requiredTier: value.requiredTier,
    currentTier: value.currentTier,
  };
}

export function errorHandler(error, request, reply) {
  const requestId = request.id;
  const isProd = request.server?.env?.isProduction ?? process.env.NODE_ENV === 'production';

  request.log.error(
    {
      requestId,
      err: {
        name: error.name,
        message: isProd ? undefined : sanitizeError(error),
        code: error.code,
        statusCode: error.statusCode,
        stack: isProd ? undefined : error.stack,
      },
      route: routeLabel(request),
      method: request.method,
    },
    'request failed'
  );

  const isFrameworkClientError =
    Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 500;

  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: 'Validation failed',
      requestId,
      details: error.errors,
    });
  }

  if (isAppError(error)) {
    const billingProgress = publicBillingProgress(error.billingProgress);
    const publicationDetails = publicationErrorDetails(error);
    const entitlement = publicEntitlementDetails(error);
    const details = {
      ...(billingProgress ? { billingProgress } : {}),
      ...(publicationDetails || {}),
      ...(entitlement ? { entitlement } : {}),
    };
    const hasDetails = Object.keys(details).length > 0;
    return reply.status(error.statusCode).send({
      error: error.message,
      code: error.code,
      requestId,
      ...(typeof error.receiptId === 'string' ? { receiptId: error.receiptId } : {}),
      ...(hasDetails ? { details } : {}),
    });
  }

  if (isFrameworkClientError) {
    return reply.status(error.statusCode).send({
      error: error.message,
      code: error.code,
      requestId,
    });
  }

  return reply.status(500).send({
    error: 'Internal server error',
    requestId,
  });
}
