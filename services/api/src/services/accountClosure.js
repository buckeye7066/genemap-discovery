import crypto from 'node:crypto';
import Stripe from 'stripe';
import { AppError, NotFoundError } from '../utils/errors.js';
import { createAuditLog } from '../utils/audit.js';

const CLOSED_SUBSCRIPTION_STATUSES = new Set([
  'canceled',
  'cancelled',
  'ended',
  'expired',
  'incomplete_expired',
]);
const ACTIVE_LICENSE_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid']);

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function codedError(message, statusCode, code) {
  const error = new AppError(message, statusCode);
  error.code = code;
  return error;
}

function isMissingStripeResource(error) {
  return error?.code === 'resource_missing'
    || error?.statusCode === 404
    || error?.status === 404;
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

export function createAccountClosureStripeClient(env = process.env) {
  return env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;
}

async function cancelStripeResources(stripeClient, subscriptions) {
  const subscriptionIds = [...new Set(
    subscriptions
      .filter((subscription) => (
        subscription.stripeSubscriptionId
        && !CLOSED_SUBSCRIPTION_STATUSES.has(String(subscription.status || '').toLowerCase())
      ))
      .map((subscription) => subscription.stripeSubscriptionId),
  )];
  const customerIds = [...new Set(
    subscriptions
      .map((subscription) => subscription.stripeCustomerId)
      .filter(Boolean),
  )];

  if ((subscriptionIds.length || customerIds.length) && !stripeClient) {
    throw codedError(
      'Account deletion is temporarily unavailable because billing cancellation cannot be verified. No account data was deleted.',
      503,
      'ACCOUNT_DELETE_BILLING_UNAVAILABLE',
    );
  }

  const cancelledSubscriptions = [];
  for (const subscriptionId of subscriptionIds) {
    try {
      await stripeClient.subscriptions.cancel(subscriptionId);
      cancelledSubscriptions.push(subscriptionId);
    } catch (error) {
      if (isMissingStripeResource(error)) {
        cancelledSubscriptions.push(subscriptionId);
        continue;
      }
      throw codedError(
        'Account deletion stopped because an active subscription could not be cancelled. No account data was deleted; retry after billing is available.',
        503,
        'ACCOUNT_DELETE_SUBSCRIPTION_CANCEL_FAILED',
      );
    }
  }

  const deletedCustomers = [];
  for (const customerId of customerIds) {
    try {
      await stripeClient.customers.del(customerId);
      deletedCustomers.push(customerId);
    } catch (error) {
      if (isMissingStripeResource(error)) {
        deletedCustomers.push(customerId);
        continue;
      }
      throw codedError(
        'Account deletion stopped because the billing customer record could not be removed. No account data was deleted; retry after billing is available.',
        503,
        'ACCOUNT_DELETE_CUSTOMER_DELETE_FAILED',
      );
    }
  }

  return { cancelledSubscriptions, deletedCustomers };
}

/**
 * Permanently close a user account only after every externally billable Stripe
 * resource has been cancelled or confirmed absent. Active institutional
 * licenses require a transfer/cancellation first so deleting one login can
 * never strand an organization or silently remove its only administrator.
 *
 * The transaction removes or pseudonymizes non-relational identity references
 * before deleting the User row. User-owned relations cascade; the required
 * audit receipt survives because AuditLog.userId uses onDelete: SetNull.
 */
export async function closeUserAccount({
  prisma,
  user,
  actorUserId,
  actorMode = 'self_service',
  stripeClient = createAccountClosureStripeClient(),
}) {
  if (!user?.id) throw new NotFoundError('User not found');

  const normalizedEmail = normalizeEmail(user.email);
  const [subscriptions, relatedLicenses, seatAssignments] = await Promise.all([
    prisma.subscription.findMany({ where: { userId: user.id } }),
    prisma.institutionalLicense.findMany({
      where: {
        OR: [
          { adminUsers: { has: user.id } },
          { contactEmail: { equals: normalizedEmail, mode: 'insensitive' } },
        ],
      },
    }),
    prisma.licenseAssignment.findMany({
      where: { userEmail: { equals: normalizedEmail, mode: 'insensitive' } },
    }),
  ]);

  for (const license of relatedLicenses) {
    if (!ACTIVE_LICENSE_STATUSES.has(String(license.status || '').toLowerCase())) continue;
    const remainingAdmins = (license.adminUsers || []).filter((id) => id !== user.id);
    const ownsContactEmail = normalizeEmail(license.contactEmail) === normalizedEmail;
    if (remainingAdmins.length === 0 || ownsContactEmail) {
      throw codedError(
        'Transfer or cancel the active institutional license before deleting this account. No account data was deleted.',
        409,
        'ACCOUNT_DELETE_LICENSE_TRANSFER_REQUIRED',
      );
    }
  }

  const receiptId = crypto.randomUUID();
  const scrubbedEmail = anonymizedEmail(normalizedEmail);
  const actorToken = deletedActorToken(user.id);

  // Plan Stripe teardown but do not execute until after a successful DB commit.
  const plannedSubscriptionIds = [...new Set(
    subscriptions
      .filter((subscription) => (
        subscription.stripeSubscriptionId
        && !CLOSED_SUBSCRIPTION_STATUSES.has(String(subscription.status || '').toLowerCase())
      ))
      .map((subscription) => subscription.stripeSubscriptionId),
  )];
  const plannedCustomerIds = [...new Set(
    subscriptions.map((s) => s.stripeCustomerId).filter(Boolean),
  )];

  /** @type {Map<string, number>} */
  const assignmentCounts = new Map();
  for (const assignment of seatAssignments) {
    if (String(assignment.status || '').toLowerCase() !== 'active') continue;
    assignmentCounts.set(
      assignment.licenseId,
      (assignmentCounts.get(assignment.licenseId) || 0) + 1,
    );
  }
  const seatLicenseIds = [...assignmentCounts.keys()];
  const seatLicenses = seatLicenseIds.length
    ? await prisma.institutionalLicense.findMany({ where: { id: { in: seatLicenseIds } } })
    : [];
  const licenseById = new Map(
    [...relatedLicenses, ...seatLicenses].map((license) => [license.id, license]),
  );

  await prisma.$transaction(async (tx) => {
    for (const license of relatedLicenses) {
      const nextAdmins = (license.adminUsers || []).filter((id) => id !== user.id);
      const data = {};
      if (nextAdmins.length !== (license.adminUsers || []).length) data.adminUsers = nextAdmins;
      if (normalizeEmail(license.contactEmail) === normalizedEmail) data.contactEmail = scrubbedEmail;
      if (Object.keys(data).length) {
        await tx.institutionalLicense.update({ where: { id: license.id }, data });
      }
    }

    for (const [licenseId, removedActiveSeats] of assignmentCounts) {
      const license = licenseById.get(licenseId);
      if (!license) continue;
      await tx.institutionalLicense.update({
        where: { id: licenseId },
        data: { assignedSeats: Math.max(0, Number(license.assignedSeats || 0) - removedActiveSeats) },
      });
    }

    // Remove the user's own seats, but preserve historical operational records
    // in pseudonymous form where they are not relationally owned by the user.
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

    await createAuditLog(
      tx,
      {
        userId: actorUserId,
        action: actorMode === 'admin' ? 'account.deleted_by_admin' : 'account.self_deleted',
        entityType: 'user',
        entityId: user.id,
        metadata: {
          receiptId,
          targetEmailHash: identityDigest(normalizedEmail, 32),
          actorMode,
          // Record intended Stripe teardown counts; actual API calls occur post-commit.
          stripeSubscriptionsCancelled: plannedSubscriptionIds.length,
          stripeCustomersDeleted: plannedCustomerIds.length,
          institutionalSeatsRemoved: seatAssignments.length,
        },
      },
      { required: true },
    );

    await tx.user.delete({ where: { id: user.id } });
  });

  // After the database changes are durably committed, perform Stripe teardown.
  let stripeResult = { cancelledSubscriptions: [], deletedCustomers: [] };
  try {
    stripeResult = await cancelStripeResources(stripeClient, subscriptions);
  } catch (err) {
    // Do not throw after commit; log for follow-up and return zeroed counts.
    console.warn('[accountClosure] Stripe teardown failed post-commit:', err?.message || err);
  }

  return {
    success: true,
    receiptId,
    billing: {
      subscriptionsCancelled: stripeResult.cancelledSubscriptions.length,
      customersDeleted: stripeResult.deletedCustomers.length,
    },
  };
}

export const __test = {
  normalizeEmail,
  identityDigest,
  anonymizedEmail,
  isMissingStripeResource,
  cancelStripeResources,
};
