const DELETION_SCOPE = 'legacy_content_v1';
const FAILURE_LOCAL_PURGE = 'local_purge_failed';
const FAILURE_RETRY_EXHAUSTED = 'retry_exhausted';
const FAILURE_SUBJECT_UNAVAILABLE = 'subject_unavailable';
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
export const MAX_DELETION_ATTEMPTS = DEFAULT_MAX_ATTEMPTS;

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
      // Transitional state written by a rolling older #113 API. The database
      // trigger normally converts it, and the worker also fails closed here.
      { status: 'failed' },
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
  if (record.status === 'failed') return {};
  return null;
}

async function moveOneToOperatorReview(prisma, record, eligibility, failureCode) {
  const attemptCount = Number(record.attemptCount || 0);
  const result = await prisma.dataDeletionRequest.updateMany({
    where: {
      id: record.id,
      status: record.status,
      attemptCount,
      ...eligibility,
    },
    data: {
      status: 'operator_review',
      completedAt: null,
      deletedTypes: [],
      nextAttemptAt: null,
      leaseExpiresAt: null,
      failureCode,
    },
  });
  return result.count === 1;
}

async function tryClaim(prisma, record, { now, leaseMs, maxAttempts }) {
  const eligibility = claimEligibility(record, now);
  if (!eligibility) return null;

  const attemptCount = Number(record.attemptCount || 0);
  if (attemptCount >= maxAttempts) {
    await moveOneToOperatorReview(
      prisma,
      record,
      eligibility,
      FAILURE_RETRY_EXHAUSTED
    );
    return null;
  }

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
      deletedTypes: [],
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
    requestedTypes: [...SELF_SERVICE_PURGE_TYPES],
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

async function readDeletionRequest(prisma, requestId, fallback = null) {
  try {
    return await prisma.dataDeletionRequest.findUnique({ where: { id: requestId } })
      || fallback;
  } catch {
    return fallback;
  }
}

export async function claimDeletionRequestById(
  prisma,
  requestId,
  {
    now = new Date(),
    leaseMs = DEFAULT_LEASE_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
  } = {}
) {
  const record = await prisma.dataDeletionRequest.findUnique({ where: { id: requestId } });
  if (!record) return null;
  return tryClaim(prisma, record, { now, leaseMs, maxAttempts });
}

export async function moveExhaustedDeletionRequests(
  prisma,
  {
    now = new Date(),
    limit = DEFAULT_BATCH_SIZE,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
  } = {}
) {
  const boundedLimit = Math.max(1, Math.min(Number(limit) || DEFAULT_BATCH_SIZE, 100));
  const candidates = await prisma.dataDeletionRequest.findMany({
    where: {
      ...dueWhere(now),
      attemptCount: { gte: maxAttempts },
    },
    orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
    take: boundedLimit,
  });

  let moved = 0;
  for (const candidate of candidates) {
    const eligibility = claimEligibility(candidate, now);
    if (!eligibility) continue;
    if (await moveOneToOperatorReview(
      prisma,
      candidate,
      eligibility,
      FAILURE_RETRY_EXHAUSTED
    )) {
      moved += 1;
    }
  }
  return moved;
}

export async function claimDueDeletionRequests(
  prisma,
  {
    now = new Date(),
    limit = DEFAULT_BATCH_SIZE,
    leaseMs = DEFAULT_LEASE_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
  } = {}
) {
  const boundedLimit = Math.max(1, Math.min(Number(limit) || DEFAULT_BATCH_SIZE, 100));
  const candidates = await prisma.dataDeletionRequest.findMany({
    where: {
      ...dueWhere(now),
      attemptCount: { lt: maxAttempts },
    },
    orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
    take: boundedLimit * 3,
  });

  const claims = [];
  for (const candidate of candidates) {
    if (claims.length >= boundedLimit) break;
    const claim = await tryClaim(prisma, candidate, { now, leaseMs, maxAttempts });
    if (claim) claims.push(claim);
  }
  return claims;
}

export async function processClaimedDeletionRequest(
  prisma,
  claim,
  {
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    retryBaseMs = DEFAULT_RETRY_BASE_MS,
    retryMaxMs = DEFAULT_RETRY_MAX_MS,
    clock = () => new Date(),
  } = {}
) {
  if (!claim || claim.status !== 'processing') {
    return { outcome: 'not_claimed', request: claim || null };
  }

  const claimedAttempt = Number(claim.attemptCount || 0);
  const userId = typeof claim.userId === 'string' ? claim.userId : '';
  if (!userId) {
    const moved = await prisma.dataDeletionRequest.updateMany({
      where: {
        id: claim.id,
        status: 'processing',
        attemptCount: claimedAttempt,
      },
      data: {
        status: 'operator_review',
        completedAt: null,
        deletedTypes: [],
        nextAttemptAt: null,
        leaseExpiresAt: null,
        failureCode: FAILURE_SUBJECT_UNAVAILABLE,
      },
    });
    return {
      outcome: moved.count === 1 ? 'operator_review' : 'stale',
      request: await readDeletionRequest(prisma, claim.id, claim),
    };
  }

  try {
    const completed = await prisma.$transaction(async (tx) => {
      await tx.medicalData.deleteMany({ where: { userId } });
      await tx.aIConversation.deleteMany({ where: { userId } });
      await tx.searchHistory.deleteMany({ where: { userId } });

      const completedAt = clock();
      const updated = await tx.dataDeletionRequest.updateMany({
        where: {
          id: claim.id,
          status: 'processing',
          attemptCount: claimedAttempt,
        },
        data: {
          status: 'completed',
          completedAt,
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
        request: await readDeletionRequest(prisma, claim.id, claim),
      };
    }

    const failureAt = clock();
    const operatorReview = claimedAttempt >= Math.max(1, Number(maxAttempts) || DEFAULT_MAX_ATTEMPTS);
    let updated;
    try {
      updated = await prisma.dataDeletionRequest.updateMany({
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
            : retryAt(claimedAttempt, failureAt, retryBaseMs, retryMaxMs),
          leaseExpiresAt: null,
          failureCode: operatorReview ? FAILURE_RETRY_EXHAUSTED : FAILURE_LOCAL_PURGE,
        },
      });
    } catch {
      // The processing lease remains durable and recoverable after expiry.
      return {
        outcome: 'processing_retained',
        request: await readDeletionRequest(prisma, claim.id, claim),
      };
    }

    if (updated.count !== 1) {
      return {
        outcome: 'stale',
        request: await readDeletionRequest(prisma, claim.id, claim),
      };
    }

    const retained = {
      ...claim,
      status: operatorReview ? 'operator_review' : 'retry_scheduled',
      completedAt: null,
      deletedTypes: [],
      nextAttemptAt: operatorReview
        ? null
        : retryAt(claimedAttempt, failureAt, retryBaseMs, retryMaxMs),
      leaseExpiresAt: null,
      failureCode: operatorReview ? FAILURE_RETRY_EXHAUSTED : FAILURE_LOCAL_PURGE,
    };
    return {
      outcome: operatorReview ? 'operator_review' : 'retry_scheduled',
      request: await readDeletionRequest(prisma, claim.id, retained),
    };
  }
}

export async function processDeletionRequestNow(prisma, requestId, options = {}) {
  const claim = await claimDeletionRequestById(prisma, requestId, options);
  if (!claim) {
    const request = await prisma.dataDeletionRequest.findUnique({ where: { id: requestId } });
    const persistedOutcome = {
      completed: 'completed',
      operator_review: 'operator_review',
      retry_scheduled: 'retry_scheduled',
    }[request?.status] || 'not_claimed';
    return { outcome: persistedOutcome, request };
  }
  return processClaimedDeletionRequest(prisma, claim, options);
}

export async function pruneExpiredSessions(
  prisma,
  { now = new Date(), limit = 1_000 } = {}
) {
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 1_000, 10_000));
  const candidates = await prisma.session.findMany({
    where: { expiresAt: { lte: now } },
    orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
    take: boundedLimit,
  });
  const ids = candidates.map((session) => session.id);
  if (ids.length === 0) return { count: 0 };
  return prisma.session.deleteMany({
    where: {
      id: { in: ids },
      expiresAt: { lte: now },
    },
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
    sessionLimit = 1_000,
    clock = () => new Date(),
  } = {}
) {
  const boundedLimit = Math.max(1, Math.min(Number(limit) || DEFAULT_BATCH_SIZE, 100));
  const exhausted = await moveExhaustedDeletionRequests(prisma, {
    now,
    limit: boundedLimit,
    maxAttempts,
  });
  const summary = {
    expiredSessionsDeleted: 0,
    claimed: 0,
    completed: 0,
    retryScheduled: 0,
    operatorReview: exhausted,
    stale: 0,
  };

  // Claim immediately before processing so later items do not burn attempts or
  // age their leases while earlier items are still running.
  for (let index = 0; index < boundedLimit; index += 1) {
    const claimTime = index === 0 ? now : clock();
    const claims = await claimDueDeletionRequests(prisma, {
      now: claimTime,
      limit: 1,
      leaseMs,
      maxAttempts,
    });
    const claim = claims[0];
    if (!claim) break;

    summary.claimed += 1;
    const result = await processClaimedDeletionRequest(prisma, claim, {
      maxAttempts,
      retryBaseMs,
      retryMaxMs,
      clock,
    });
    if (result.outcome === 'completed') summary.completed += 1;
    else if (result.outcome === 'retry_scheduled') summary.retryScheduled += 1;
    else if (result.outcome === 'operator_review') summary.operatorReview += 1;
    else summary.stale += 1;
  }

  // Session cleanup is bounded and runs after deletion processing so a large or
  // degraded session table cannot starve durable privacy requests.
  const sessionResult = await pruneExpiredSessions(prisma, {
    now: clock(),
    limit: sessionLimit,
  });
  summary.expiredSessionsDeleted = Number(sessionResult?.count || 0);

  return summary;
}
