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

const NON_PUBLISHABLE_STATUSES = new Set(['withheld', 'unavailable', 'superseded']);

/**
 * Operational errors may expose only a validated non-publishable artifact.
 * This lets clients render an honest recovery state while ensuring generated
 * or fetched content can never leak through an error-details side channel.
 */
export function publicationErrorDetails(error) {
  const publication = error?.details?.publication;
  if (!publication || typeof publication !== 'object' || Array.isArray(publication)) return undefined;
  if (publication.contractVersion !== 1
    || !NON_PUBLISHABLE_STATUSES.has(publication.status)
    || publication.content !== null
    || typeof publication.reasonCode !== 'string'
    || !/^[a-z0-9][a-z0-9_.-]{0,63}$/u.test(publication.reasonCode)
    || typeof publication.correlationId !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u.test(publication.correlationId)
    || !Array.isArray(publication.limitations)
    || publication.limitations.some((item) => typeof item !== 'string')) {
    return undefined;
  }
  return { publication };
}

/**
 * A stable route label for logs / owner email / Sentry that NEVER carries user
 * values. Prefer the route PATTERN (e.g. "/genomics/gene/:symbol"); fall back to
 * the path with the query string stripped so query params — which can be PII on
 * a medical app (e.g. ?q=<phenotype>) — never reach the log pipeline or external
 * error tracking.
 *
 * NOTE: `request.routerPath` was REMOVED in Fastify v5; `routeOptions.url` is
 * the replacement. The old `request.routerPath || request.url` therefore always
 * fell back to the full URL (incl. query string) on every error.
 */
export function routeLabel(request) {
  return request.routeOptions?.url || String(request.url || '').split('?')[0];
}

export function errorHandler(error, request, reply) {
  const requestId = request.id;
  const isProd = request.server?.env?.isProduction ?? process.env.NODE_ENV === 'production';

  // Use the Fastify pino logger so logs are structured (JSON) and include
  // request context in production. The previous handler used console.error
  // which produced unindexed plain-text and lost the requestId/traceability.
  request.log.error(
    {
      requestId,
      err: {
        name: error.name,
        message: isProd ? undefined : sanitizeError(error),
        code: error.code,
        statusCode: error.statusCode,
        // Stack traces are useful in dev/test but can leak file system
        // layout in production logs that get aggregated to third parties.
        stack: isProd ? undefined : error.stack,
      },
      route: routeLabel(request),
      method: request.method,
    },
    'request failed'
  );

  // Framework-originated client errors (@fastify/rate-limit's 429, body
  // parser 400s/413s, …) carry a 4xx statusCode but are NOT AppErrors, so they
  // previously fell through to the generic 500 branch — a rate-limited client
  // saw "Internal server error" (masking the real "retry in N minutes"
  // message) and every 429 was captured by Sentry as a server failure.
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
    const details = publicationErrorDetails(error);
    return reply.status(error.statusCode).send({
      error: error.message,
      code: error.code,
      requestId,
      ...(details ? { details } : {}),
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
