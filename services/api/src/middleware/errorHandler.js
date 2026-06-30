import { ZodError } from 'zod';
import { AppError, sanitizeError } from '../utils/errors.js';
import { reportErrorToOwner } from '../services/errorReporter.js';
import { captureException } from '../config/sentry.js';

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
        message: sanitizeError(error),
        code: error.code,
        statusCode: error.statusCode,
        // Stack traces are useful in dev/test but can leak file system
        // layout in production logs that get aggregated to third parties.
        stack: isProd ? undefined : error.stack,
      },
      route: request.routerPath || request.url,
      method: request.method,
    },
    'request failed'
  );

  // Resolve the status code we are about to return so the owner is only
  // notified about genuine server-side failures (>=500), not client/validation
  // errors. Fire-and-forget; never awaited and never throws. The reporter
  // itself excludes admin/owner users.
  const resolvedStatus = error instanceof ZodError ? 400 : isAppError(error) ? error.statusCode : 500;
  if (resolvedStatus >= 500) {
    reportErrorToOwner({
      error,
      source: 'backend',
      user: request.user,
      route: request.routerPath || request.url,
      method: request.method,
      requestId,
      statusCode: resolvedStatus,
    });
    // Also send to Sentry when configured (no-op otherwise). Minimal,
    // non-PII context — never the request body.
    captureException(error, {
      requestId,
      route: request.routerPath || request.url,
      method: request.method,
      userId: request.user?.userId,
    });
  }

  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: 'Validation failed',
      requestId,
      details: error.errors,
    });
  }

  if (isAppError(error)) {
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
