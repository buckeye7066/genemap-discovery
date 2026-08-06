const DELETION_SCOPE = 'legacy_content_v1';
const LOCAL_PURGE_FAILURE = 'local_purge_failed';
const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const DEFAULT_RETRY_BASE_MS = 5 * 60 * 1000;
const DEFAULT_RETRY_MAX_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BATCH_SIZE = 25;

export const SELF_SERVICE_PURGE_TYPES = Object.freeze([
  'medicalData',
  'aiConversations',
  'searchHistory',
]);

export const PRIVACY_DELETION_SCOPE = DELETION_SCOPE;

class StaleDeletionLeaseError extends Error {
  constructor() {
    super('stale deletion lease');
    this.name = 'StaleDeletionLeaseError';
  }
}

function retryAt(attemptCount, now, baseMs = DEFAULT_RETRY_BASE_MS, maxMs = DEFAULT_RETRY_MAX_MS) {
  const exponent = Math.max(0, Number(attemptCount || 1) - 1);
  const delay = Math.min(baseMs * (2 ** exponent), maxMs);
  return new Date(now.getTime() + delay);
}

function dueWhere(now) {
  return {
    OR: [
      {
        status: 'pending',
        OR: [
          { nextAttemptAt: null },
          { nextAttemptAt: { lte: now } },
        ],
      },
      {
        status: 'retry_scheduled',
        nextAttemptAt: { lte: now },
      },
      {
        status: 'processing',
        leaseExpiresAt: { lte: now },
      },
    ],
  };
}

function claimEligibility(record, now) {
  if (record.status === 'processing') {
    return { leaseExpiresAt: { lte: now } };
  }
  if (record.status === 'pending') {
    return {
      OR: [
        { nextAttemptAt: null },
        { nextAttemptAt: { lte: now } },
      ],
    };
  }
  if (record.status === 'retry_scheduled') {
    return { nextAttemptAt: { lte: now } };
  }
  return null;
}

async function tryClaim(prisma, record, { now, leaseMs }) {
  const eligibility = claimEligibility(record, now);
  if (!eligibility) return null;

  const attemptCount = Number(record.attemptCount || 0);
  const result = await prisma.dataDeletionRequest.updateMany({
    where: {
      id: record.id,
      status: record.status,
      attemptCount,
      ...eligibility,
    },
    data: {
      status: 'processing',
      attemptCount: { increment: 1 },
      lastAttemptAt: now,
      nextAttemptAt: null,
      leaseExpiresAt: new Date(now.getTime() + leaseMs),
      failureCode: null,
      completedAt: null,
    },
  });

  if (result.count !== 1) return null;
  return prisma.dataDeletionRequest.findUnique({ where: { id: record.id } });
}

/**
 * Public projections deliberately omit userId, subjectRef, retry counters and
 * lease timestamps. Those fields are internal lifecycle controls.
 */
export function serializeDeletionRequest(record) {
  if (!record) return null;
  return {
    id: record.id,
    scope: record.scope || DELETION_SCOPE,
    status: record.status,
    requestedAt: record.requestedAt || null,
    completedAt: record.completedAt || null,
    requestedTypes: Array.isArray(record.requestedTypes)
      ? [...record.requestedTypes]
      : [...SELF_SERVICE_PURGE_TYPES],
    deletedTypes: Array.isArray(record.deletedTypes) ? [...record.deletedTypes] : [],
    failureCode: record.failureCode || null,
  };
}

export function serializeConsentRecord(record) {
  if (!record) return null;
  return {
    id: record.id,
    consentType: record.consentType,
    version: record.version,
    granted: Boolean(record.granted),
    createdAt: record.createdAt || null,
  };
}

export async function claimDeletionRequestById(
  prisma,
  requestId,
  { now = new Date(), leaseMs = DEFAULT_LEASE_MS } = {}
) {
  const record = await prisma.dataDeletionRequest.findUnique({ where: { id: requestId } });
  if (!record) return null;
  return tryClaim(prisma, record, { now, leaseMs });
}

export async function claimDueDeletionRequests(
  prisma,
  {
    now = new Date(),
    limit = DEFAULT_BATCH_SIZE,
    leaseMs = DEFAULT_LEASE_MS,
  } = {}
) {
  const boundedLimit = Math.max(1, Math.min(Number(limit) || DEFAULT_BATCH_SIZE, 100));
  const candidates = await prisma.dataDeletionRequest.findMany({
    where: dueWhere(now),
    orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
    take: boundedLimit * 3,
  });

  const claims = [];
  for (const candidate of candidates) {
    if (claims.length >= boundedLimit) break;
    const claim = await tryClaim(prisma, candidate, { now, leaseMs });
    if (claim) claims.push(claim);
  }
  return claims;
}

export async function processClaimedDeletionRequest(
  prisma,
  claim,
  {
    now = new Date(),
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    retryBaseMs = DEFAULT_RETRY_BASE_MS,
    retryMaxMs = DEFAULT_RETRY_MAX_MS,
  } = {}
) {
  if (!claim || claim.status !== 'processing') {
    return { outcome: 'not_claimed', request: claim || null };
  }

  const claimedAttempt = Number(claim.attemptCount || 0);
  const subjectRef = String(claim.subjectRef || '');
  if (!subjectRef) {
    return { outcome: 'not_claimed', request: claim };
  }

  try {
    const completed = await prisma.$transaction(async (tx) => {
      await tx.medicalData.deleteMany({ where: { userId: subjectRef } });
      await tx.aIConversation.deleteMany({ where: { userId: subjectRef } });
      await tx.searchHistory.deleteMany({ where: { userId: subjectRef } });

      const updated = await tx.dataDeletionRequest.updateMany({
        where: {
          id: claim.id,
          status: 'processing',
          attemptCount: claimedAttempt,
        },
        data: {
          status: 'completed',
          completedAt: now,
          deletedTypes: [...SELF_SERVICE_PURGE_TYPES],
          nextAttemptAt: null,
          leaseExpiresAt: null,
          failureCode: null,
        },
      });
      if (updated.count !== 1) throw new StaleDeletionLeaseError();

      return tx.dataDeletionRequest.findUnique({ where: { id: claim.id } });
    });

    return { outcome: 'completed', request: completed };
  } catch (error) {
    if (error instanceof StaleDeletionLeaseError) {
      return {
        outcome: 'stale',
        request: await prisma.dataDeletionRequest.findUnique({ where: { id: claim.id } }),
      };
    }

    const operatorReview = claimedAttempt >= Math.max(1, Number(maxAttempts) || DEFAULT_MAX_ATTEMPTS);
    const updated = await prisma.dataDeletionRequest.updateMany({
      where: {
        id: claim.id,
        status: 'processing',
        attemptCount: claimedAttempt,
      },
      data: {
        status: operatorReview ? 'operator_review' : 'retry_scheduled',
        completedAt: null,
        deletedTypes: [],
        nextAttemptAt: operatorReview
          ? null
          : retryAt(claimedAttempt, now, retryBaseMs, retryMaxMs),
        leaseExpiresAt: null,
        failureCode: LOCAL_PURGE_FAILURE,
      },
    });

    if (updated.count !== 1) {
      return {
        outcome: 'stale',
        request: await prisma.dataDeletionRequest.findUnique({ where: { id: claim.id } }),
      };
    }

    return {
      outcome: operatorReview ? 'operator_review' : 'retry_scheduled',
      request: await prisma.dataDeletionRequest.findUnique({ where: { id: claim.id } }),
    };
  }
}

export async function processDeletionRequestNow(prisma, requestId, options = {}) {
  const claim = await claimDeletionRequestById(prisma, requestId, options);
  if (!claim) {
    return {
      outcome: 'not_claimed',
      request: await prisma.dataDeletionRequest.findUnique({ where: { id: requestId } }),
    };
  }
  return processClaimedDeletionRequest(prisma, claim, options);
}

export async function pruneExpiredSessions(prisma, { now = new Date() } = {}) {
  return prisma.session.deleteMany({
    where: { expiresAt: { lte: now } },
  });
}

export async function runPrivacyMaintenance(
  prisma,
  {
    now = new Date(),
    limit = DEFAULT_BATCH_SIZE,
    leaseMs = DEFAULT_LEASE_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    retryBaseMs = DEFAULT_RETRY_BASE_MS,
    retryMaxMs = DEFAULT_RETRY_MAX_MS,
  } = {}
) {
  const sessionResult = await pruneExpiredSessions(prisma, { now });
  const claims = await claimDueDeletionRequests(prisma, { now, limit, leaseMs });
  const summary = {
    expiredSessionsDeleted: Number(sessionResult?.count || 0),
    claimed: claims.length,
    completed: 0,
    retryScheduled: 0,
    operatorReview: 0,
    stale: 0,
  };

  for (const claim of claims) {
    const result = await processClaimedDeletionRequest(prisma, claim, {
      now,
      maxAttempts,
      retryBaseMs,
      retryMaxMs,
    });
    if (result.outcome === 'completed') summary.completed += 1;
    else if (result.outcome === 'retry_scheduled') summary.retryScheduled += 1;
    else if (result.outcome === 'operator_review') summary.operatorReview += 1;
    else summary.stale += 1;
  }

  return summary;
}
