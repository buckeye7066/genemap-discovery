export function sanitizeError(error) {
  const message = error?.message || 'An unexpected error occurred';
  // Mask common secret-bearing tokens in error strings before they hit the
  // log pipeline. Conservative pattern: matches both whole-word identifiers
  // and inline values like "Bearer eyJ...".
  return String(message)
    .replace(/(password|secret|key|token|authorization)[=:][^\s,]+/gi, '$1=***')
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***');
}

export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed') {
    super(message, 400);
  }
}
