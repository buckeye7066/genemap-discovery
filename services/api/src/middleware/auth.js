import { verifyAccessToken } from '../utils/auth.js';
import { UnauthorizedError } from '../utils/errors.js';

export async function authenticate(request, reply) {
  const token = request.cookies.accessToken;
  
  if (!token) {
    throw new UnauthorizedError('Authentication required');
  }
  
  const payload = verifyAccessToken(token);
  if (!payload) {
    throw new UnauthorizedError('Invalid or expired token');
  }
  
  request.user = payload;
}

export function requireRole(...roles) {
  return async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }
    
    if (!roles.includes(request.user.role)) {
      throw new UnauthorizedError('Insufficient permissions');
    }
  };
}
