import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrismaMock } from './setup.js';
import {
  SELF_SERVICE_PURGE_TYPES,
  claimDeletionRequestById,
  claimDueDeletionRequests,
  processClaimedDeletionRequest,
  processDeletionRequestNow,
  pruneExpiredSessions,
  runPrivacyMaintenance,
  serializeDeletionRequest,
} from '../services/privacyMaintenance.js';

let prisma;
const SUBJECT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PRIVACY_REF = '99999999-9999-4999-8999-999999999999';
const NOW = new Date('2026-08-06T13:00:00.000Z');
const FINISHED = new Date('2026-08-06T13:00:10.000Z');

function seedRequest(overrides = {}) {
  const row = {
    id: overrides.id || 'deletion-1',
    userId: SUBJECT,
    subjectRef: PRIVACY_REF,
    scope: 'legacy_content_v1',
    status: 'pending',
    requestedAt: new Date(NOW.getTime() - 60_000),
    completedAt: null,
    requestedTypes: [...SELF_SERVICE_PURGE_TYPES],
    deletedTypes: [],
    attemptCount: 0,
    lastAttemptAt: null,
    nextAttemptAt: new Date(NOW.getTime() - 1),
    leaseExpiresAt: null,
    failureCode: null,
    updatedAt: new Date(NOW.getTime() - 60_000),
    ...overrides,
  };
  prisma._store.dataDeletionRequest.push(row);
  return row;
}

beforeEach(() => {
  prisma = createPrismaMock();
});

describe('privacy deletion lifecycle', () => {
  it('purges only the finite local categories for the claimed subject', async () => {
    for (const storeName of ['medicalData', 'aIConversation', 'searchHistory']) {
      prisma._store[storeName].push(
        { id: `${storeName}-subject`, userId: SUBJECT },
        { id: `${storeName}-other`, userId: OTHER }
      );
    }
    prisma._store.geneSet.push({ id: 'retained-unscoped', userId: SUBJECT });
    const row = seedRequest();

    const claim = await claimDeletionRequestById(prisma, row.id, { now: NOW });
    expect(claim).toMatchObject({ status: 'processing', attemptCount: 1 });

    const result = await processClaimedDeletionRequest(prisma, claim, {
      clock: () => FINISHED,
    });
    expect(result).toMatchObject({
      outcome: 'completed',
      request: {
        status: 'completed',
        deletedTypes: SELF_SERVICE_PURGE_TYPES,
        completedAt: FINISHED,
      },
    });
    for (const storeName of ['medicalData', 'aIConversation', 'searchHistory']) {
      expect(prisma._store[storeName].map((entry) => entry.userId)).toEqual([OTHER]);
    }
    expect(prisma._store.geneSet).toHaveLength(1);
  });

  it('rolls back partial deletes and retains a sanitized retry state', async () => {
    for (const storeName of ['medicalData', 'aIConversation', 'searchHistory']) {
      prisma._store[storeName].push({ id: storeName, userId: SUBJECT });
    }
    const row = seedRequest();
    const claim = await claimDeletionRequestById(prisma, row.id, { now: NOW });
    const originalDelete = prisma.aIConversation.deleteMany.getMockImplementation();
    prisma.aIConversation.deleteMany.mockImplementationOnce(async () => {
      throw new Error('patient@example.invalid private database detail');
    });

    const result = await processClaimedDeletionRequest(prisma, claim, {
      retryBaseMs: 1_000,
      clock: () => FINISHED,
    });
    prisma.aIConversation.deleteMany.mockImplementation(originalDelete);

    expect(result).toMatchObject({
      outcome: 'retry_scheduled',
      request: {
        status: 'retry_scheduled',
        attemptCount: 1,
        completedAt: null,
        deletedTypes: [],
        failureCode: 'local_purge_failed',
        leaseExpiresAt: null,
      },
    });
    expect(result.request.nextAttemptAt).toEqual(new Date(FINISHED.getTime() + 1_000));
    for (const storeName of ['medicalData', 'aIConversation', 'searchHistory']) {
      expect(prisma._store[storeName]).toHaveLength(1);
    }
    expect(JSON.stringify(result)).not.toMatch(/patient@example\.invalid|private database detail/u);
  });

  it('retains the processing lease when retry-state persistence is unavailable', async () => {
    const row = seedRequest({ id: 'retry-write-failure' });
    const claim = await claimDeletionRequestById(prisma, row.id, { now: NOW });
    prisma.medicalData.deleteMany.mockRejectedValueOnce(
      new Error('purge patient@example.invalid')
    );
    prisma.dataDeletionRequest.updateMany.mockRejectedValueOnce(
      new Error('retry persistence private canary')
    );

    const result = await processClaimedDeletionRequest(prisma, claim, {
      clock: () => FINISHED,
    });

    expect(result).toMatchObject({
      outcome: 'processing_retained',
      request: {
        id: 'retry-write-failure',
        status: 'processing',
        attemptCount: 1,
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/patient@example\.invalid|private canary/u);
  });

  it('reports a concurrent completion instead of a false claim miss', async () => {
    const row = seedRequest({ id: 'completed-race' });
    const originalUpdateMany = prisma.dataDeletionRequest.updateMany.getMockImplementation();
    prisma.dataDeletionRequest.updateMany.mockImplementationOnce(async () => {
      Object.assign(row, {
        status: 'completed',
        completedAt: FINISHED,
        deletedTypes: [...SELF_SERVICE_PURGE_TYPES],
        nextAttemptAt: null,
        failureCode: null,
      });
      return { count: 0 };
    });
    try {
      const result = await processDeletionRequestNow(prisma, row.id, { now: NOW });
      expect(result).toMatchObject({
        outcome: 'completed',
        request: { id: 'completed-race', status: 'completed' },
      });
    } finally {
      prisma.dataDeletionRequest.updateMany.mockImplementation(originalUpdateMany);
    }
  });

  it('claims due requests once and skips future, completed, and live-lease rows', async () => {
    seedRequest({ id: 'due' });
    seedRequest({
      id: 'future',
      status: 'retry_scheduled',
      nextAttemptAt: new Date(NOW.getTime() + 60_000),
    });
    seedRequest({ id: 'completed', status: 'completed', completedAt: NOW, nextAttemptAt: null });
    seedRequest({
      id: 'leased',
      status: 'processing',
      attemptCount: 1,
      nextAttemptAt: null,
      leaseExpiresAt: new Date(NOW.getTime() + 60_000),
    });

    const [first, second] = await Promise.all([
      claimDueDeletionRequests(prisma, { now: NOW }),
      claimDueDeletionRequests(prisma, { now: NOW }),
    ]);
    expect([...first, ...second].map((row) => row.id)).toEqual(['due']);
    expect(prisma._store.dataDeletionRequest.find((row) => row.id === 'due')).toMatchObject({
      status: 'processing',
      attemptCount: 1,
    });
  });

  it('recovers an expired lease and fences the stale attempt', async () => {
    seedRequest({
      id: 'expired',
      status: 'processing',
      attemptCount: 1,
      nextAttemptAt: null,
      leaseExpiresAt: new Date(NOW.getTime() - 1),
    });
    const claims = await claimDueDeletionRequests(prisma, { now: NOW });
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ id: 'expired', attemptCount: 2 });

    const staleResult = await processClaimedDeletionRequest(
      prisma,
      { ...claims[0], attemptCount: 1 },
      { now: NOW }
    );
    expect(staleResult.outcome).toBe('stale');
    expect(prisma._store.dataDeletionRequest[0]).toMatchObject({
      status: 'processing',
      attemptCount: 2,
    });
  });

  it('moves the bounded final failure to operator review', async () => {
    seedRequest({ id: 'max-attempts', attemptCount: 4 });
    const claim = await claimDeletionRequestById(prisma, 'max-attempts', { now: NOW });
    prisma.medicalData.deleteMany.mockRejectedValueOnce(new Error('private canary'));

    const result = await processClaimedDeletionRequest(prisma, claim, {
      now: NOW,
      maxAttempts: 5,
    });
    expect(result).toMatchObject({
      outcome: 'operator_review',
      request: {
        status: 'operator_review',
        attemptCount: 5,
        nextAttemptAt: null,
        failureCode: 'retry_exhausted',
      },
    });
    expect(JSON.stringify(result)).not.toContain('private canary');
  });

  it('moves an expired fifth lease to operator review without a sixth attempt', async () => {
    seedRequest({
      id: 'exhausted-lease',
      status: 'processing',
      attemptCount: 5,
      nextAttemptAt: null,
      leaseExpiresAt: new Date(NOW.getTime() - 1),
    });

    const summary = await runPrivacyMaintenance(prisma, { now: NOW, maxAttempts: 5 });
    expect(summary).toMatchObject({ claimed: 0, operatorReview: 1 });
    expect(prisma._store.dataDeletionRequest[0]).toMatchObject({
      status: 'operator_review',
      attemptCount: 5,
      failureCode: 'retry_exhausted',
    });
  });

  it('prunes only sessions at or before the expiry boundary', async () => {
    prisma._store.session.push(
      { id: 'past', expiresAt: new Date(NOW.getTime() - 1) },
      { id: 'boundary', expiresAt: NOW },
      { id: 'future', expiresAt: new Date(NOW.getTime() + 1) }
    );
    prisma._store.searchHistory.push({ id: 'unrelated', userId: SUBJECT });

    await expect(pruneExpiredSessions(prisma, { now: NOW })).resolves.toEqual({ count: 2 });
    await expect(pruneExpiredSessions(prisma, { now: NOW })).resolves.toEqual({ count: 0 });
    expect(prisma._store.session.map((row) => row.id)).toEqual(['future']);
    expect(prisma._store.searchHistory).toHaveLength(1);
  });

  it('bounds each expired-session sweep', async () => {
    prisma._store.session.push(
      { id: 'expired-1', expiresAt: new Date(NOW.getTime() - 3) },
      { id: 'expired-2', expiresAt: new Date(NOW.getTime() - 2) },
      { id: 'expired-3', expiresAt: new Date(NOW.getTime() - 1) },
      { id: 'future', expiresAt: new Date(NOW.getTime() + 1) }
    );

    await expect(pruneExpiredSessions(prisma, { now: NOW, limit: 2 }))
      .resolves.toEqual({ count: 2 });
    expect(prisma._store.session.map((row) => row.id)).toEqual(['expired-3', 'future']);
    await expect(pruneExpiredSessions(prisma, { now: NOW, limit: 2 }))
      .resolves.toEqual({ count: 1 });
    expect(prisma._store.session.map((row) => row.id)).toEqual(['future']);
  });

  it('returns aggregate maintenance results and a narrow public projection', async () => {
    prisma._store.session.push({ id: 'expired', expiresAt: NOW });
    seedRequest({ id: 'maintained' });
    const summary = await runPrivacyMaintenance(prisma, { now: NOW });
    expect(summary).toEqual({
      expiredSessionsDeleted: 1,
      claimed: 1,
      completed: 1,
      retryScheduled: 0,
      operatorReview: 0,
      stale: 0,
    });

    const internal = prisma._store.dataDeletionRequest[0];
    const projected = serializeDeletionRequest(internal);
    expect(projected).toMatchObject({ id: 'maintained', status: 'completed' });
    for (const forbidden of [
      'userId',
      'subjectRef',
      'attemptCount',
      'lastAttemptAt',
      'nextAttemptAt',
      'leaseExpiresAt',
      'updatedAt',
    ]) {
      expect(projected).not.toHaveProperty(forbidden);
    }
  });
});
