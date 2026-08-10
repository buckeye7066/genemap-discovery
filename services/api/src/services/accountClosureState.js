import crypto from 'node:crypto';
import { AppError } from '../utils/errors.js';
import { createAuditLog } from '../utils/audit.js';

export const ACCOUNT_CLOSURE_LOCK_ACTION = 'account.closure_lock';
export const ACCOUNT_CLOSURE_RELEASE_ACTION = 'account.closure_lock_released';
const ACTIVE_ACTIONS = new Set([
  ACCOUNT_CLOSURE_LOCK_ACTION,
  'account.closure_started',
  'account.closure_billing_secured',
]);
const TERMINAL_ACTIONS = new Set([
  ACCOUNT_CLOSURE_RELEASE_ACTION,
  'account.closure_failed',
  'account.self_deleted',
  'account.deleted_by_admin',
  'account.restored_account_deleted',
]);
const STATE_ACTIONS = [...ACTIVE_ACTIONS, ...TERMINAL_ACTIONS];

function closureError(message = 'Billing changes are temporarily unavailable while account deletion is in progress.') {
  const error = new AppError(message, 409);
  error.code = 'ACCOUNT_CLOSURE_IN_PROGRESS';
  return error;
}

export async function latestAccountClosureState(prisma, userId) {
  if (!prisma || !userId) return { active: false, row: null, token: null };
  const rows = await prisma.auditLog.findMany({
    where: {
      userId,
      action: { in: STATE_ACTIONS },
    },
    orderBy: { createdAt: 'desc' },
    take: 1,
  });
  const row = rows?.[0] || null;
  return {
    active: Boolean(row && ACTIVE_ACTIONS.has(row.action)),
    row,
    token: row?.metadata?.lockToken || null,
  };
}

export async function assertCheckoutAllowed(prisma, userId) {
  const state = await latestAccountClosureState(prisma, userId);
  if (state.active) throw closureError();
  return state;
}

export async function beginAccountClosureLock(prisma, {
  userId,
  actorUserId,
  actorMode,
}) {
  const existing = await latestAccountClosureState(prisma, userId);
  if (existing.active) throw closureError('Account deletion is already in progress. Use the existing deletion receipt or retry after the current attempt finishes.');
  const lockToken = crypto.randomUUID();
  await createAuditLog(prisma, {
    userId,
    action: ACCOUNT_CLOSURE_LOCK_ACTION,
    entityType: 'user',
    entityId: userId,
    metadata: { lockToken, actorUserId, actorMode },
  }, { required: true });
  return lockToken;
}

export async function releaseAccountClosureLock(prisma, {
  userId,
  actorUserId,
  actorMode,
  lockToken,
  reason,
}) {
  await createAuditLog(prisma, {
    userId,
    action: ACCOUNT_CLOSURE_RELEASE_ACTION,
    entityType: 'user',
    entityId: userId,
    metadata: {
      lockToken,
      actorUserId,
      actorMode,
      reason: String(reason || 'closure_failed').slice(0, 128),
    },
  }, { required: true });
}

export async function withAccountClosureLock(prisma, options, operation) {
  const lockToken = await beginAccountClosureLock(prisma, options);
  try {
    return await operation(lockToken);
  } catch (error) {
    try {
      await releaseAccountClosureLock(prisma, {
        ...options,
        lockToken,
        reason: error?.code || 'ACCOUNT_DELETE_FAILED',
      });
    } catch (releaseError) {
      // Preserve the original operation failure while making the stuck-lock
      // condition explicit to operators. Checkout remains safely blocked.
      console.error('[accountClosureState] lock release failed:', releaseError?.message || releaseError);
    }
    throw error;
  }
}

export async function expireCheckoutSession(stripeClient, sessionId) {
  if (!stripeClient?.checkout?.sessions?.expire || !sessionId) return false;
  try {
    await stripeClient.checkout.sessions.expire(sessionId);
    return true;
  } catch (error) {
    if (error?.code === 'resource_missing' || error?.raw?.code === 'resource_missing' || error?.statusCode === 404) {
      return true;
    }
    const wrapped = closureError('A checkout was created during account deletion and could not be safely expired. The checkout was not returned to the user; contact support before retrying.');
    wrapped.code = 'ACCOUNT_CLOSURE_CHECKOUT_EXPIRE_FAILED';
    throw wrapped;
  }
}

export async function recordCheckoutOrExpire({
  prisma,
  stripeClient,
  userId,
  session,
  action,
  entityType,
  metadata,
}) {
  try {
    await createAuditLog(prisma, {
      userId,
      action,
      entityType,
      metadata: { sessionId: session.id, ...metadata },
    }, { required: true });
  } catch (error) {
    await expireCheckoutSession(stripeClient, session.id);
    const wrapped = new AppError('Checkout could not be durably recorded, so the new Stripe session was expired. No subscription was started.', 503);
    wrapped.code = 'CHECKOUT_AUDIT_WRITE_FAILED';
    throw wrapped;
  }

  const state = await latestAccountClosureState(prisma, userId);
  if (state.active) {
    await expireCheckoutSession(stripeClient, session.id);
    throw closureError('Account deletion started while checkout was being created. The new Stripe session was expired; finish or cancel deletion before starting checkout.');
  }
}

export const __test = {
  ACTIVE_ACTIONS,
  STATE_ACTIONS,
  TERMINAL_ACTIONS,
};
