import { ZodError } from 'zod';
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

/**
 * A stable route label for logs / owner email / Sentry that NEVER carries user
 * values. Prefer the route PATTERN (e.g. "/genomics/gene/:symbol"); fall back to
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
    return reply.status(error.statusCode).send({
      error: error.message,
      code: error.code,
      requestId,
      ...(typeof error.receiptId === 'string' ? { receiptId: error.receiptId } : {}),
      ...(billingProgress ? { details: { billingProgress } } : {}),
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
