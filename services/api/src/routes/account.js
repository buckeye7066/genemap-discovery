import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { verifyPassword } from '../utils/auth.js';
import { getClearCookieOptions } from '../utils/cookies.js';
import { UnauthorizedError, ValidationError } from '../utils/errors.js';
import { closeUserAccount } from '../services/accountClosure.js';

const deleteAccountSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(512),
  confirmation: z.literal('DELETE MY ACCOUNT'),
}).strict();

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
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

      const result = await closeUserAccount({
        prisma,
        user,
        actorUserId: user.id,
        actorMode: 'self_service',
      });

      return reply
        .clearCookie('accessToken', getClearCookieOptions())
        .clearCookie('refreshToken', getClearCookieOptions())
        .clearCookie('csrfToken', getClearCookieOptions())
        .send(result);
    },
  );
}
