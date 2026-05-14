import { ZodError } from 'zod';
import { AppError, sanitizeError } from '../utils/errors.js';

// Detect operational app errors regardless of cross-realm prototype chains
// (vitest can load errors.js multiple times in some scenarios; relying on
// `instanceof` alone made errors fall through to Fastify's default JSON
// formatter, leaking statusCode/error/message instead of {error: '...'}).
function isAppError(error) {
  if (error instanceof AppError) return true;
  return Boolean(error && error.isOperational && typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 600);
}

export function errorHandler(error, request, reply) {
  // sanitizeError strips substrings like password|secret|key|token before logging.
  console.error('Error:', sanitizeError(error));

  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: 'Validation failed',
      details: error.errors,
    });
  }

  if (isAppError(error)) {
    return reply.status(error.statusCode).send({
      error: error.message,
    });
  }

  return reply.status(500).send({
    error: 'Internal server error',
  });
}
