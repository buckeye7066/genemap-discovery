import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { verifyPassword } from '../utils/auth.js';
import { getClearCookieOptions } from '../utils/cookies.js';
import { AppError, UnauthorizedError, ValidationError } from '../utils/errors.js';
import { closeUserAccount } from '../services/accountClosure.js';
import { withAccountClosureLock } from '../services/accountClosureState.js';

const deleteAccountSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(512),
  confirmation: z.literal('DELETE MY ACCOUNT'),
}).strict();

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * The closure service always attaches the exact receipt and internal progress
 * before rethrowing a post-billing failure. Convert an unexpected persistence
 * error into an operational response while preserving only the safe fields the
 * central error handler publishes as counts.
 */
function operationalClosureError(error) {
  if (error?.isOperational || !error?.receiptId || !error?.billingProgress) return error;
  const wrapped = new AppError(
    'Billing and deletion authorization were secured, but GeneMap could not finish closing the account. The account remains available with billing cancelled; retry or contact support with the deletion receipt.',
    503,
  );
  wrapped.code = 'ACCOUNT_DELETE_FINALIZE_RECOVERY_REQUIRED';
  wrapped.receiptId = error.receiptId;
  wrapped.billingProgress = error.billingProgress;
  return wrapped;
}

export default async function accountRoutes(fastify) {
  const prisma = fastify.prisma;

  fastify.post(
    '/delete',
    {
      preHandler: authenticate,
      config: {
        rateLimit: { max: 5, timeWindow: '1 hour' },
      },
    },
    async (request, reply) => {
      const body = deleteAccountSchema.parse(request.body);
      const user = await prisma.user.findUnique({ where: { id: request.user.userId } });
      if (!user) throw new UnauthorizedError('Account not found');

      if (normalizeEmail(body.email) !== normalizeEmail(user.email)) {
        throw new ValidationError('Enter the email address currently assigned to this account.');
      }
      if (user.role === 'super_admin') {
        throw new ValidationError('A super administrator account must be transferred before it can be deleted.');
      }

      const passwordMatches = await verifyPassword(body.password, user.passwordHash);
      if (!passwordMatches) {
        throw new UnauthorizedError('Password confirmation failed');
      }

      const result = await withAccountClosureLock(
        prisma,
        {
          userId: user.id,
          actorUserId: user.id,
          actorMode: 'self_service',
        },
        async () => {
          try {
            return await closeUserAccount({
              prisma,
              user,
              actorUserId: user.id,
              actorMode: 'self_service',
            });
          } catch (error) {
            throw operationalClosureError(error);
          }
        },
      );

      return reply
        .clearCookie('accessToken', getClearCookieOptions())
        .clearCookie('refreshToken', getClearCookieOptions())
        .clearCookie('csrfToken', getClearCookieOptions())
        .send(result);
    },
  );
}

export const __test = { operationalClosureError };
