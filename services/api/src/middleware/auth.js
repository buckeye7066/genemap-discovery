import { verifyAccessToken } from '../utils/auth.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';

/**
 * Verify the access token AND hydrate the latest user row.
 *
 * Why: a JWT carries the role/email at issue time and is valid for 15 min.
 * Without re-reading the user, a banned or demoted user keeps their access
 * until the token expires. For a regulated medical-data app that's not
 * acceptable, so we trade a per-request DB lookup for fresh authorisation.
 *
 * The lookup is a single indexed PK fetch and is cheap relative to the
 * downstream Prisma queries every authenticated route runs anyway.
 */
export async function authenticate(request) {
  const token = request.cookies.accessToken;

  if (!token) {
    throw new UnauthorizedError('Authentication required');
  }

  const payload = verifyAccessToken(token);
  if (!payload?.userId) {
    throw new UnauthorizedError('Invalid or expired token');
  }

  const user = await request.server.prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, privacySubjectRef: true, email: true, role: true, banned: true },
  });

  if (!user) {
    throw new UnauthorizedError('Account not found');
  }

  if (user.banned) {
    throw new UnauthorizedError('Account has been suspended');
  }

  // Authoritative source of truth for downstream handlers — never trust the
  // role embedded in the JWT.
  request.user = {
    userId: user.id,
    privacySubjectRef: user.privacySubjectRef,
    email: user.email,
    role: user.role,
  };
}

export function requireRole(...roles) {
  return async (request) => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!roles.includes(request.user.role)) {
      throw new ForbiddenError('Insufficient permissions');
    }
  };
}
