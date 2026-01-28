import { ZodError } from 'zod';
import { AppError, sanitizeError } from '../utils/errors.js';

export function errorHandler(error, request, reply) {
  console.error('Error:', sanitizeError(error));
  
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: 'Validation failed',
      details: error.errors,
    });
  }
  
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.message,
    });
  }
  
  return reply.status(500).send({
    error: 'Internal server error',
  });
}
