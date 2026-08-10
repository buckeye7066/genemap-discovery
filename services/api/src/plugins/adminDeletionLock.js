import { AppError } from '../utils/errors.js';
import {
  beginAccountClosureLock,
  releaseAccountClosureLock,
} from '../services/accountClosureState.js';

function isAdminDeleteRoute(routeOptions) {
  const method = Array.isArray(routeOptions.method) ? routeOptions.method : [routeOptions.method];
  const url = String(routeOptions.url || routeOptions.path || '');
  return method.includes('DELETE') && url.endsWith('/users/:idOrEmail');
}

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

/**
 * Wrap the existing authenticated super-admin deletion handler rather than
 * creating a second destructive route. The target lock is written before the
 * handler inventories pending checkout sessions, so individual/institutional
 * checkout cannot slip through the administrator path either.
 */
export default async function adminDeletionLockPlugin(fastify) {
  fastify.addHook('onRoute', (routeOptions) => {
    if (!isAdminDeleteRoute(routeOptions) || routeOptions.config?.accountClosureLockWrapped) return;
    const originalHandler = routeOptions.handler;
    routeOptions.config = {
      ...(routeOptions.config || {}),
      accountClosureLockWrapped: true,
    };
    routeOptions.handler = async function lockedAdminDelete(request, reply) {
      const { idOrEmail } = request.params || {};
      const prisma = request.server.prisma;
      const target = String(idOrEmail || '').includes('@')
        ? await prisma.user.findUnique({ where: { email: String(idOrEmail).trim().toLowerCase() } })
        : await prisma.user.findUnique({ where: { id: idOrEmail } });

      // Let the canonical handler return its normal not-found, self-delete, and
      // super-admin validation errors without creating a spurious lock.
      if (!target || target.id === request.user?.userId || target.role === 'super_admin') {
        return originalHandler.call(this, request, reply);
      }

      const lockToken = await beginAccountClosureLock(prisma, {
        userId: target.id,
        actorUserId: request.user?.userId || null,
        actorMode: 'admin',
      });
      try {
        return await originalHandler.call(this, request, reply);
      } catch (error) {
        try {
          await releaseAccountClosureLock(prisma, {
            userId: target.id,
            actorUserId: request.user?.userId || null,
            actorMode: 'admin',
            lockToken,
            reason: error?.code || 'ACCOUNT_DELETE_FAILED',
          });
        } catch (releaseError) {
          console.error('[adminDeletionLock] lock release failed:', releaseError?.message || releaseError);
        }
        throw operationalClosureError(error);
      }
    };
  });
}

export const __test = { isAdminDeleteRoute, operationalClosureError };
