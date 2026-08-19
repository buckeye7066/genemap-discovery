import crypto from 'node:crypto';
import Stripe from 'stripe';
import { AppError, NotFoundError } from '../utils/errors.js';
import { createAuditLog } from '../utils/audit.js';
import { createAccountClosureLedger } from './accountClosureLedger.js';
import { LEDGER_WRITE_FAILURE, emitOperatorAlert } from './operatorAlert.js';

const CLOSED_SUBSCRIPTION_STATUSES = new Set([
  'canceled',
  'cancelled',
  'ended',
  'expired',
  'incomplete_expired',
]);
const ACTIVE_LICENSE_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid']);
const CHECKOUT_AUDIT_ACTIONS = [
  'billing.checkout_created',
  'billing.institutional_checkout_created',
];
const CUSTOMER_CLEANUP_PENDING = 'account.closure_customer_cleanup_pending';
const CUSTOMER_CLEANUP_COMPLETED = 'account.closure_customer_cleanup_completed';

const cleanupRuntimeState = {
  running: false,
  pending: null,
  lastRunAt: null,
  lastError: null,
  lastCompleted: 0,
};

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function codedError(message, statusCode, code, details = null) {
  const error = new AppError(message, statusCode);
  error.code = code;
  if (details) error.details = details;
  return error;
}

function isMissingStripeResource(error) {
  return error?.code === 'resource_missing'
    || error?.raw?.code === 'resource_missing'
    || error?.statusCode === 404
    || error?.status === 404;
}

function stripeId(value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object' && typeof value.id === 'string') return value.id;
  return null;
}

function identityDigest(value, length = 20) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, length);
}

function deletedActorToken(userId) {
  return `deleted-user:${identityDigest(userId, 16)}`;
}

function anonymizedEmail(email) {
  return `deleted+${identityDigest(normalizeEmail(email), 24)}@example.invalid`;
}

function uniqueStrings(values) {
  return [...new Set((values || []).filter((value) => typeof value === 'string' && value.trim()))];
}

function billingPlan(subscriptions, checkoutAuditRows = []) {
  const subscriptionIds = uniqueStrings(
    subscriptions
      .filter((subscription) => (
        subscription.stripeSubscriptionId
        && !CLOSED_SUBSCRIPTION_STATUSES.has(String(subscription.status || '').toLowerCase())
      ))
      .map((subscription) => subscription.stripeSubscriptionId),
  );
  const customerIds = uniqueStrings(
    subscriptions.map((subscription) => subscription.stripeCustomerId),
  );
  const checkoutSessionIds = uniqueStrings(
    checkoutAuditRows.map((row) => row?.metadata?.sessionId),
  );
  return { subscriptionIds, customerIds, checkoutSessionIds };
}

function emptyBillingProgress(plan = {}) {
  return {
    checkoutSessionsExamined: [],
    checkoutSessionsExpired: [],
    subscriptionsCancelled: [],
    customersDeleted: [],
    discoveredSubscriptionIds: uniqueStrings(plan.subscriptionIds),
    discoveredCustomerIds: uniqueStrings(plan.customerIds),
  };
}

function cloneBillingProgress(progress) {
  return {
    checkoutSessionsExamined: [...(progress?.checkoutSessionsExamined || [])],
    checkoutSessionsExpired: [...(progress?.checkoutSessionsExpired || [])],
    subscriptionsCancelled: [...(progress?.subscriptionsCancelled || [])],
    customersDeleted: [...(progress?.customersDeleted || [])],
    discoveredSubscriptionIds: [...(progress?.discoveredSubscriptionIds || [])],
    discoveredCustomerIds: [...(progress?.discoveredCustomerIds || [])],
  };
}

function errorWithProgress(error, progress, receiptId = null) {
  error.billingProgress = cloneBillingProgress(progress);
  if (receiptId) error.receiptId = receiptId;
  return error;
}

function errorWithReceipt(error, receiptId) {
  if (error && receiptId) error.receiptId = receiptId;
  return error;
}

/**
 * A production account must not lose billing or checkout state merely because
 * the restore-independent deletion ledger is known to be unavailable. This
 * preflight runs before the closure receipt, audit-start row, checkout expiry,
 * or Stripe cancellation. The ledger still writes its exact authorization only
 * after billing has been secured, preserving the external deletion boundary.
 */
function assertAccountClosureLedgerReady(ledger, env = process.env) {
  if (env.NODE_ENV === 'production' && ledger?.configured !== true) {
    throw codedError(
      'Account deletion is temporarily unavailable because the independent deletion ledger is not configured. No billing or account data was changed.',
      503,
      'ACCOUNT_DELETE_LEDGER_UNAVAILABLE',
    );
  }
  if (typeof ledger?.authorize !== 'function' || typeof ledger?.hashIdentity !== 'function') {
    throw codedError(
      'Account deletion is temporarily unavailable because the independent deletion ledger client is incomplete. No billing or account data was changed.',
      503,
      'ACCOUNT_DELETE_LEDGER_UNAVAILABLE',
    );
  }
}

export function createAccountClosureStripeClient(env = process.env) {
  return env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;
}

async function retrieveCheckoutSession(stripeClient, sessionId, progress) {
  if (!stripeClient?.checkout?.sessions?.retrieve) return null;
  try {
    return await stripeClient.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'customer'],
    });
  } catch (error) {
    if (isMissingStripeResource(error)) return { id: sessionId, status: 'missing' };
    throw errorWithProgress(codedError(
      'Account deletion stopped because an outstanding checkout could not be reconciled. No account data was deleted.',
      503,
      'ACCOUNT_DELETE_CHECKOUT_RECONCILE_FAILED',
    ), progress);
  }
}

async function reconcileCheckoutSessions(stripeClient, sessionIds, progress) {
  for (const sessionId of uniqueStrings(sessionIds)) {
    progress.checkoutSessionsExamined.push(sessionId);
    let session = await retrieveCheckoutSession(stripeClient, sessionId, progress);

    // Some test doubles expose expire without retrieve. Real Stripe clients
    // expose both. Direct expiry remains a safe compatibility path.
    if (!session && stripeClient?.checkout?.sessions?.expire) {
      try {
        await stripeClient.checkout.sessions.expire(sessionId);
        progress.checkoutSessionsExpired.push(sessionId);
        continue;
      } catch (error) {
        if (isMissingStripeResource(error)) continue;
        throw errorWithProgress(codedError(
          'Account deletion stopped because an outstanding checkout could not be expired. No account data was deleted.',
          503,
          'ACCOUNT_DELETE_CHECKOUT_EXPIRE_FAILED',
        ), progress);
      }
    }

    if (!session || session.status === 'missing' || session.status === 'expired') continue;

    if (session.status === 'open') {
      try {
        await stripeClient.checkout.sessions.expire(sessionId);
        progress.checkoutSessionsExpired.push(sessionId);
        continue;
      } catch (error) {
        if (isMissingStripeResource(error)) continue;
        // The checkout can complete between retrieve and expire. Re-read once;
        // if it completed, secure the newly created resources below.
        try {
          session = await retrieveCheckoutSession(stripeClient, sessionId, progress);
        } catch (reconcileError) {
          if (reconcileError?.isOperational) throw reconcileError;
          throw errorWithProgress(codedError(
            'Account deletion stopped because an outstanding checkout changed state and could not be reconciled. No account data was deleted.',
            503,
            'ACCOUNT_DELETE_CHECKOUT_RACE_UNRESOLVED',
          ), progress);
        }
      }
    }

    if (session?.status === 'complete') {
      const subscriptionId = stripeId(session.subscription);
      const customerId = stripeId(session.customer);
      if (subscriptionId) progress.discoveredSubscriptionIds.push(subscriptionId);
      if (customerId) progress.discoveredCustomerIds.push(customerId);
      progress.discoveredSubscriptionIds = uniqueStrings(progress.discoveredSubscriptionIds);
      progress.discoveredCustomerIds = uniqueStrings(progress.discoveredCustomerIds);
      continue;
    }

    if (session?.status === 'expired' || session?.status === 'missing') continue;

    throw errorWithProgress(codedError(
      'Account deletion stopped because an outstanding checkout is in an unknown state. No account data was deleted.',
      503,
      'ACCOUNT_DELETE_CHECKOUT_STATE_UNKNOWN',
    ), progress);
  }
}

async function cancelSubscriptions(stripeClient, prisma, subscriptionIds, progress) {
  for (const subscriptionId of uniqueStrings(subscriptionIds)) {
    try {
      await stripeClient.subscriptions.cancel(subscriptionId);
    } catch (error) {
      if (!isMissingStripeResource(error)) {
        throw errorWithProgress(codedError(
          'Account deletion stopped because an active subscription could not be cancelled. The account remains available; retry after billing is available.',
          503,
          'ACCOUNT_DELETE_SUBSCRIPTION_CANCEL_FAILED',
        ), progress);
      }
    }

    progress.subscriptionsCancelled.push(subscriptionId);
    // Persist every successful/absent cancellation immediately. If a later
    // external or database step fails, local entitlements cannot remain active
    // while Stripe is canceled, and the retry receipt describes exact progress.
    try {
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscriptionId },
        data: { status: 'canceled' },
      });
    } catch (error) {
      throw errorWithProgress(codedError(
        'The subscription was cancelled, but GeneMap could not reconcile the local entitlement. The account remains available with billing cancelled; retry or contact support with the deletion receipt.',
        503,
        'ACCOUNT_DELETE_LOCAL_BILLING_RECONCILE_FAILED',
      ), progress);
    }
  }
}

async function deleteCustomers(stripeClient, customerIds, progress) {
  for (const customerId of uniqueStrings(customerIds)) {
    try {
      await stripeClient.customers.del(customerId);
    } catch (error) {
      if (!isMissingStripeResource(error)) {
        throw errorWithProgress(codedError(
          'The account was deleted and subscriptions were cancelled, but the non-billing Stripe customer record still requires cleanup.',
          503,
          'ACCOUNT_DELETE_CUSTOMER_DELETE_FAILED',
        ), progress);
      }
    }
    progress.customersDeleted.push(customerId);
  }
}

async function secureStripeBilling({ stripeClient, prisma, plan }) {
  const progress = emptyBillingProgress(plan);
  const needsStripe = plan.subscriptionIds.length
    || plan.customerIds.length
    || plan.checkoutSessionIds.length;

  if (needsStripe && !stripeClient) {
    throw errorWithProgress(codedError(
      'Account deletion is temporarily unavailable because billing cancellation cannot be verified. No account data was deleted.',
      503,
      'ACCOUNT_DELETE_BILLING_UNAVAILABLE',
    ), progress);
  }
  if (!needsStripe) return progress;

  await reconcileCheckoutSessions(stripeClient, plan.checkoutSessionIds, progress);
  await cancelSubscriptions(stripeClient, prisma, progress.discoveredSubscriptionIds, progress);
  // Stripe customer deletion is intentionally deferred until after the database
  // commit. Subscriptions are the billing-critical boundary; deleting a
  // customer before a database rollback would be irreversible and unnecessary.
  return progress;
}

function activeLicenseBlocksDeletion(license, userId, normalizedEmail) {
  if (!ACTIVE_LICENSE_STATUSES.has(String(license.status || '').toLowerCase())) return false;
  const remainingAdmins = (license.adminUsers || []).filter((id) => id !== userId);
  const ownsContactEmail = normalizeEmail(license.contactEmail) === normalizedEmail;
  return remainingAdmins.length === 0 || ownsContactEmail;
}

async function recordFailureAudit(prisma, {
  actorUserId,
  actorMode,
  user,
  receiptId,
  stage,
  error,
}) {
  try {
    await createAuditLog(prisma, {
      userId: actorUserId,
      action: 'account.closure_failed',
      entityType: 'user',
      entityId: user.id,
      metadata: {
        receiptId,
        actorMode,
        stage,
        code: error?.code || 'ACCOUNT_DELETE_FAILED',
        targetEmailHash: identityDigest(normalizeEmail(user.email), 32),
        billingProgress: error?.billingProgress || null,
      },
    }, { required: true });
  } catch (auditError) {
    // Preserve the original operational error while making the audit failure
    // visible to operators. No success response is ever produced here.
    console.error('[accountClosure] required failure audit could not be written:', auditError?.message || auditError);
  }
}

async function finalizeDatabaseClosure({
  prisma,
  user,
  actorUserId,
  actorMode,
  receiptId,
  billingProgress,
  ledgerResult,
}) {
  const normalizedEmail = normalizeEmail(user.email);
  const scrubbedEmail = anonymizedEmail(normalizedEmail);
  const actorToken = deletedActorToken(user.id);
  let institutionalSeatsRemoved = 0;
  let receivedMessagesDeleted = 0;

  await prisma.$transaction(async (tx) => {
    // Re-read ownership and seats inside the serializable transaction so a
    // concurrent transfer or assignment cannot be overwritten by a stale
    // pre-transaction snapshot.
    const [transactionLicenses, transactionAssignments] = await Promise.all([
      tx.institutionalLicense.findMany({
        where: {
          OR: [
            { adminUsers: { has: user.id } },
            { contactEmail: { equals: normalizedEmail, mode: 'insensitive' } },
          ],
        },
      }),
      tx.licenseAssignment.findMany({
        where: { userEmail: { equals: normalizedEmail, mode: 'insensitive' } },
      }),
    ]);

    for (const license of transactionLicenses) {
      if (activeLicenseBlocksDeletion(license, user.id, normalizedEmail)) {
        throw codedError(
          'Institutional-license ownership changed during account deletion. The account remains available with billing cancelled; transfer or cancel the license and retry with the deletion receipt.',
          409,
          'ACCOUNT_DELETE_LICENSE_CHANGED',
        );
      }
      const nextAdmins = (license.adminUsers || []).filter((id) => id !== user.id);
      const data = {};
      if (nextAdmins.length !== (license.adminUsers || []).length) data.adminUsers = nextAdmins;
      if (normalizeEmail(license.contactEmail) === normalizedEmail) data.contactEmail = scrubbedEmail;
      if (Object.keys(data).length) {
        await tx.institutionalLicense.update({ where: { id: license.id }, data });
      }
    }

    const assignmentCounts = new Map();
    for (const assignment of transactionAssignments) {
      if (String(assignment.status || '').toLowerCase() !== 'active') continue;
      assignmentCounts.set(
        assignment.licenseId,
        (assignmentCounts.get(assignment.licenseId) || 0) + 1,
      );
    }

    for (const [licenseId, removedActiveSeats] of assignmentCounts) {
      const result = await tx.institutionalLicense.updateMany({
        where: {
          id: licenseId,
          assignedSeats: { gte: removedActiveSeats },
        },
        data: { assignedSeats: { decrement: removedActiveSeats } },
      });
      if (result.count !== 1) {
        throw codedError(
          'Institutional seat accounting changed during account deletion. No database account data was deleted; reconcile the license and retry.',
          409,
          'ACCOUNT_DELETE_SEAT_RECONCILIATION_REQUIRED',
        );
      }
      institutionalSeatsRemoved += removedActiveSeats;
    }

    await tx.licenseAssignment.updateMany({
      where: { assignedBy: user.id },
      data: { assignedBy: actorToken },
    });
    await tx.licenseAssignment.deleteMany({
      where: { userEmail: { equals: normalizedEmail, mode: 'insensitive' } },
    });
    await tx.licenseUsageLog.updateMany({
      where: { userEmail: { equals: normalizedEmail, mode: 'insensitive' } },
      data: { userEmail: scrubbedEmail },
    });
    await tx.projectVersion.updateMany({
      where: { createdBy: user.id },
      data: { createdBy: actorToken },
    });
    await tx.projectCollaborator.updateMany({
      where: { addedBy: user.id },
      data: { addedBy: actorToken },
    });
    await tx.user.updateMany({
      where: { bannedBy: user.id },
      data: { bannedBy: actorToken },
    });
    await tx.preBannedUser.updateMany({
      where: { bannedBy: user.id },
      data: { bannedBy: actorToken },
    });

    // Messages sent by the user cascade. Received messages use SetNull and
    // would otherwise retain subject/body indefinitely after deletion.
    const received = await tx.message.deleteMany({ where: { receiverId: user.id } });
    receivedMessagesDeleted = received.count;

    const finalAction = actorMode === 'admin'
      ? 'account.deleted_by_admin'
      : actorMode === 'restore_reconciliation'
        ? 'account.restored_account_deleted'
        : 'account.self_deleted';
    await createAuditLog(tx, {
      userId: actorUserId,
      action: finalAction,
      entityType: 'user',
      entityId: user.id,
      metadata: {
        receiptId,
        targetEmailHash: identityDigest(normalizedEmail, 32),
        actorMode,
        independentLedgerRecorded: ledgerResult?.recorded === true,
        independentLedgerIdentityKeyId: ledgerResult?.identityKeyId || null,
        checkoutSessionsExpired: billingProgress.checkoutSessionsExpired.length,
        stripeSubscriptionsCancelled: billingProgress.subscriptionsCancelled.length,
        stripeCustomersPlanned: billingProgress.discoveredCustomerIds.length,
        institutionalSeatsRemoved,
        receivedMessagesDeleted,
      },
    }, { required: true });

    await tx.user.delete({ where: { id: user.id } });
  }, {
    isolationLevel: 'Serializable',
    maxWait: 5_000,
    timeout: 15_000,
  });

  return { institutionalSeatsRemoved, receivedMessagesDeleted };
}

async function recordCustomerCleanup(prisma, {
  receiptId,
  customerIds,
  customersDeleted,
  pending,
  error = null,
}) {
  await createAuditLog(prisma, {
    userId: null,
    action: pending ? CUSTOMER_CLEANUP_PENDING : CUSTOMER_CLEANUP_COMPLETED,
    entityType: 'account_closure',
    entityId: receiptId,
    metadata: {
      receiptId,
      stripeCustomerIds: uniqueStrings(customerIds),
      stripeCustomersDeleted: uniqueStrings(customersDeleted),
      code: error?.code || null,
      message: error?.message || null,
    },
  }, { required: true });
}

async function cleanupCustomersAfterCommit({
  prisma,
  stripeClient,
  receiptId,
  billingProgress,
}) {
  const customerIds = uniqueStrings(billingProgress.discoveredCustomerIds);
  if (!customerIds.length) {
    await recordCustomerCleanup(prisma, {
      receiptId,
      customerIds: [],
      customersDeleted: [],
      pending: false,
    });
    return { pending: false, deleted: [] };
  }

  try {
    await deleteCustomers(stripeClient, customerIds, billingProgress);
    await recordCustomerCleanup(prisma, {
      receiptId,
      customerIds,
      customersDeleted: billingProgress.customersDeleted,
      pending: false,
    });
    return { pending: false, deleted: [...billingProgress.customersDeleted] };
  } catch (error) {
    // Billing is already cancelled and the account is already deleted. A
    // residual Stripe Customer object cannot bill by itself. Persist the exact
    // pending work for the bounded reconciliation worker rather than falsely
    // reporting that cleanup completed or leaving no retry authority.
    try {
      await recordCustomerCleanup(prisma, {
        receiptId,
        customerIds,
        customersDeleted: billingProgress.customersDeleted,
        pending: true,
        error,
      });
    } catch (auditError) {
      console.error('[accountClosure] customer cleanup pending receipt could not be written:', auditError?.message || auditError);
    }
    return { pending: true, deleted: [...billingProgress.customersDeleted] };
  }
}

/**
 * Permanently close a user account through a durable saga:
 *
 * 1. record the exact external plan before mutation;
 * 2. expire pending checkout sessions and cancel subscriptions;
 * 3. persist a restore-independent deletion authorization;
 * 4. finalize account data in one serializable transaction;
 * 5. delete non-billing Stripe Customer objects after commit;
 * 6. retain exact receipts and retry any residual customer cleanup.
 */
export async function closeUserAccount({
  prisma,
  user,
  actorUserId,
  actorMode = 'self_service',
  stripeClient = createAccountClosureStripeClient(),
  ledger = createAccountClosureLedger(),
  alert = emitOperatorAlert,
}) {
  if (!user?.id) throw new NotFoundError('User not found');

  const normalizedEmail = normalizeEmail(user.email);
  const [subscriptions, relatedLicenses, checkoutAuditRows] = await Promise.all([
    prisma.subscription.findMany({ where: { userId: user.id } }),
    prisma.institutionalLicense.findMany({
      where: {
        OR: [
          { adminUsers: { has: user.id } },
          { contactEmail: { equals: normalizedEmail, mode: 'insensitive' } },
        ],
      },
    }),
    prisma.auditLog.findMany({
      where: {
        userId: user.id,
        action: { in: CHECKOUT_AUDIT_ACTIONS },
      },
    }),
  ]);

  for (const license of relatedLicenses) {
    if (activeLicenseBlocksDeletion(license, user.id, normalizedEmail)) {
      throw codedError(
        'Transfer or cancel the active institutional license before deleting this account. No account data was deleted.',
        409,
        'ACCOUNT_DELETE_LICENSE_TRANSFER_REQUIRED',
      );
    }
  }

  assertAccountClosureLedgerReady(ledger);

  const receiptId = crypto.randomUUID();
  const plan = billingPlan(subscriptions, checkoutAuditRows);

  await createAuditLog(prisma, {
    userId: actorUserId,
    action: 'account.closure_started',
    entityType: 'user',
    entityId: user.id,
    metadata: {
      receiptId,
      actorMode,
      targetEmailHash: identityDigest(normalizedEmail, 32),
      stripeSubscriptionsPlanned: plan.subscriptionIds,
      stripeCustomersPlanned: plan.customerIds,
      checkoutSessionsPlanned: plan.checkoutSessionIds,
    },
  }, { required: true });

  let billingProgress;
  let ledgerResult;
  try {
    billingProgress = await secureStripeBilling({ stripeClient, prisma, plan });
    ledgerResult = await ledger.authorize({
      receiptId,
      userIdHash: ledger.hashIdentity(user.id),
      actorMode,
      authorizedAt: new Date().toISOString(),
      billing: {
        checkoutSessionsExpired: billingProgress.checkoutSessionsExpired.length,
        subscriptionsCancelled: billingProgress.subscriptionsCancelled.length,
      },
    });
    await createAuditLog(prisma, {
      userId: actorUserId,
      action: 'account.closure_billing_secured',
      entityType: 'user',
      entityId: user.id,
      metadata: {
        receiptId,
        actorMode,
        independentLedgerRecorded: ledgerResult?.recorded === true,
        independentLedgerIdentityKeyId: ledgerResult?.identityKeyId || null,
        checkoutSessionsExamined: billingProgress.checkoutSessionsExamined,
        checkoutSessionsExpired: billingProgress.checkoutSessionsExpired,
        stripeSubscriptionsCancelled: billingProgress.subscriptionsCancelled,
        stripeCustomersPlanned: billingProgress.discoveredCustomerIds,
      },
    }, { required: true });
  } catch (error) {
    const failureProgress = error?.billingProgress
      || billingProgress
      || emptyBillingProgress(plan);
    const wrapped = errorWithProgress(
      errorWithReceipt(error, receiptId),
      failureProgress,
      receiptId,
    );
    const ledgerStage = Boolean(error?.code?.startsWith('ACCOUNT_DELETE_LEDGER_'));
    await recordFailureAudit(prisma, {
      actorUserId,
      actorMode,
      user,
      receiptId,
      stage: ledgerStage ? 'external_tombstone' : 'billing_reconciliation',
      error: wrapped,
    });
    if (ledgerStage) {
      // The failure audit lands in the SAME Postgres the ledger exists to be
      // independent of, and nobody reads it unprompted. A failed tombstone
      // write leaves an account the user asked to delete still present, so it
      // has to reach a person. Awaited, but `alert` never throws.
      await alert({
        kind: LEDGER_WRITE_FAILURE,
        severity: 'critical',
        summary:
          'An account deletion was stopped because the restore-independent deletion ledger could not be written. '
          + 'The account still exists and the deletion is NOT recorded. Investigate the ledger service before retrying.',
        details: {
          receiptId,
          code: error?.code || null,
          actorMode,
          checkoutSessionsExpired: failureProgress?.checkoutSessionsExpired?.length || 0,
          subscriptionsCancelled: failureProgress?.subscriptionsCancelled?.length || 0,
        },
      });
    }
    throw wrapped;
  }

  let cleanup;
  try {
    cleanup = await finalizeDatabaseClosure({
      prisma,
      user,
      actorUserId,
      actorMode,
      receiptId,
      billingProgress,
      ledgerResult,
    });
  } catch (error) {
    const wrapped = error?.isOperational
      ? error
      : codedError(
          'Billing resources were secured and the independent deletion authorization was recorded, but the database could not finish deleting the account. The account remains available with billing cancelled; retry or contact support with the deletion receipt.',
          503,
          'ACCOUNT_DELETE_DATABASE_FINALIZE_FAILED',
        );
    const wrappedWithProgress = errorWithProgress(
      errorWithReceipt(wrapped, receiptId),
      billingProgress,
      receiptId,
    );
    await recordFailureAudit(prisma, {
      actorUserId,
      actorMode,
      user,
      receiptId,
      stage: 'database_finalize',
      error: wrappedWithProgress,
    });
    throw wrappedWithProgress;
  }

  const customerCleanup = await cleanupCustomersAfterCommit({
    prisma,
    stripeClient,
    receiptId,
    billingProgress,
  });

  return {
    success: true,
    receiptId,
    billing: {
      checkoutSessionsExpired: billingProgress.checkoutSessionsExpired.length,
      subscriptionsCancelled: billingProgress.subscriptionsCancelled.length,
      customersDeleted: customerCleanup.deleted.length,
      customerCleanupPending: customerCleanup.pending,
    },
    cleanup,
  };
}

/**
 * Retry post-delete Stripe Customer cleanup from durable audit receipts.
 * Customer objects cannot bill without subscriptions, so this worker never
 * controls entitlement. It closes the residual privacy/housekeeping loop.
 */
export async function reconcilePendingCustomerCleanup({
  prisma,
  stripeClient = createAccountClosureStripeClient(),
  limit = 50,
} = {}) {
  if (!prisma) throw new TypeError('prisma is required');
  cleanupRuntimeState.running = true;
  cleanupRuntimeState.lastError = null;
  cleanupRuntimeState.lastRunAt = new Date().toISOString();
  cleanupRuntimeState.lastCompleted = 0;

  try {
    const [pendingRows, completedRows] = await Promise.all([
      prisma.auditLog.findMany({
        where: { action: CUSTOMER_CLEANUP_PENDING },
        orderBy: { createdAt: 'asc' },
        take: limit,
      }),
      prisma.auditLog.findMany({
        where: { action: CUSTOMER_CLEANUP_COMPLETED },
        orderBy: { createdAt: 'desc' },
        take: Math.max(limit * 4, 200),
      }),
    ]);
    const completedReceipts = new Set(
      completedRows.map((row) => row?.metadata?.receiptId || row?.entityId).filter(Boolean),
    );
    const unresolved = pendingRows.filter((row) => {
      const receiptId = row?.metadata?.receiptId || row?.entityId;
      return receiptId && !completedReceipts.has(receiptId);
    });
    cleanupRuntimeState.pending = unresolved.length;

    if (unresolved.length && !stripeClient) {
      cleanupRuntimeState.lastError = 'Stripe is not configured';
      return { attempted: 0, completed: 0, pending: unresolved.length, configured: false };
    }

    let completed = 0;
    for (const row of unresolved) {
      const receiptId = row?.metadata?.receiptId || row?.entityId;
      const customerIds = uniqueStrings(row?.metadata?.stripeCustomerIds);
      const progress = emptyBillingProgress({ customerIds });
      try {
        await deleteCustomers(stripeClient, customerIds, progress);
        await recordCustomerCleanup(prisma, {
          receiptId,
          customerIds,
          customersDeleted: progress.customersDeleted,
          pending: false,
        });
        completed += 1;
      } catch (error) {
        await createAuditLog(prisma, {
          userId: null,
          action: 'account.closure_customer_cleanup_retry_failed',
          entityType: 'account_closure',
          entityId: receiptId,
          metadata: {
            receiptId,
            stripeCustomerIds: customerIds,
            code: error?.code || 'ACCOUNT_DELETE_CUSTOMER_DELETE_FAILED',
          },
        });
      }
    }
    cleanupRuntimeState.lastCompleted = completed;
    cleanupRuntimeState.pending = Math.max(0, unresolved.length - completed);
    return {
      attempted: unresolved.length,
      completed,
      pending: cleanupRuntimeState.pending,
      configured: true,
    };
  } catch (error) {
    cleanupRuntimeState.lastError = error?.message || String(error);
    throw error;
  } finally {
    cleanupRuntimeState.running = false;
  }
}

export function accountClosureCleanupStatus() {
  return {
    running: cleanupRuntimeState.running,
    pending: cleanupRuntimeState.pending,
    lastRunAt: cleanupRuntimeState.lastRunAt,
    lastError: cleanupRuntimeState.lastError ? 'present' : null,
    lastCompleted: cleanupRuntimeState.lastCompleted,
  };
}

/**
 * Restore reconciliation entry point. The caller must obtain a signed external
 * tombstone first and keep the restored service quarantined. Billing was already
 * secured before the tombstone was written, so this function performs only the
 * deterministic database finalization and writes a restore-reconciliation audit.
 */
export async function finalizeAuthorizedDatabaseDeletion({
  prisma,
  user,
  receiptId,
  billing = {},
}) {
  if (!user?.id) throw new NotFoundError('User not found');
  const progress = emptyBillingProgress();
  progress.checkoutSessionsExpired = Array.from({ length: Number(billing.checkoutSessionsExpired || 0) }, (_, index) => `externally-recorded-${index + 1}`);
  progress.subscriptionsCancelled = Array.from({ length: Number(billing.subscriptionsCancelled || 0) }, (_, index) => `externally-recorded-${index + 1}`);
  return finalizeDatabaseClosure({
    prisma,
    user,
    actorUserId: null,
    actorMode: 'restore_reconciliation',
    receiptId,
    billingProgress: progress,
    ledgerResult: { recorded: true, mode: 'external_restore' },
  });
}

export const __test = {
  normalizeEmail,
  identityDigest,
  anonymizedEmail,
  isMissingStripeResource,
  billingPlan,
  assertAccountClosureLedgerReady,
  reconcileCheckoutSessions,
  secureStripeBilling,
  finalizeDatabaseClosure,
  cleanupCustomersAfterCommit,
};
