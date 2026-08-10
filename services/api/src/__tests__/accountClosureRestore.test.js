import { describe, expect, it, vi } from 'vitest';
import { createPrismaMock } from './setup.js';
import {
  matchingTombstone,
  reconcileRestoredDatabase,
} from '../../../../scripts/reconcile-account-closure-ledger.mjs';

const hashIdentity = (value) => `ledger:${value}`;

function seedUser(prisma, overrides = {}) {
  const user = {
    id: 'restored-user-1',
    email: 'restored@example.invalid',
    role: 'user',
    ...overrides,
  };
  prisma._store.user.push(user);
  return user;
}

describe('restore-time deletion tombstone reconciliation', () => {
  it('matches the stable user identifier only and ignores a recycled email address', () => {
    const user = { id: 'u-1', email: 'User@Example.invalid' };
    const tombstone = {
      version: 1,
      event: 'account_deletion_authorized',
      receiptId: 'receipt-restore-1',
      userIdHash: hashIdentity(user.id),
    };
    expect(matchingTombstone(user, [tombstone], hashIdentity)).toBe(tombstone);
    expect(matchingTombstone({ id: 'other', email: user.email }, [tombstone], hashIdentity)).toBeNull();
  });

  it('deletes a resurrected account in quarantine and reports zero blockers', async () => {
    const prisma = createPrismaMock();
    const user = seedUser(prisma);
    prisma._store.message.push({
      id: 'restored-received-message',
      senderId: 'support',
      receiverId: user.id,
      subject: 'Private',
      body: 'Private',
    });
    const ledger = {
      hashIdentity,
      listTombstones: vi.fn(async () => [{
        version: 1,
        event: 'account_deletion_authorized',
        receiptId: 'receipt-restore-2',
        userIdHash: hashIdentity(user.id),
        billing: { subscriptionsCancelled: 1, checkoutSessionsExpired: 0 },
      }]),
    };

    const result = await reconcileRestoredDatabase({ prisma, ledger, pageSize: 10 });

    expect(result).toEqual({
      tombstones: 1,
      usersScanned: 1,
      resurrectedAccountsDeleted: 1,
      blockers: [],
      safeToExpose: true,
    });
    expect(prisma._store.user).toHaveLength(0);
    expect(prisma._store.message).toHaveLength(0);
    expect(prisma._store.auditLog.map((row) => row.action))
      .toContain('account.restored_account_deleted');
  });

  it('does not skip resurrected accounts when deletions span multiple pages', async () => {
    const prisma = createPrismaMock();
    const users = [
      seedUser(prisma, { id: 'restored-a', email: 'a@example.invalid' }),
      seedUser(prisma, { id: 'restored-b', email: 'b@example.invalid' }),
      seedUser(prisma, { id: 'restored-c', email: 'c@example.invalid' }),
    ];
    const ledger = {
      hashIdentity,
      listTombstones: vi.fn(async () => users.map((user, index) => ({
        version: 1,
        event: 'account_deletion_authorized',
        receiptId: `receipt-page-${index + 1}`,
        userIdHash: hashIdentity(user.id),
        billing: { subscriptionsCancelled: 0, checkoutSessionsExpired: 0 },
      }))),
    };

    const result = await reconcileRestoredDatabase({ prisma, ledger, pageSize: 1 });

    expect(result).toMatchObject({
      tombstones: 3,
      usersScanned: 3,
      resurrectedAccountsDeleted: 3,
      blockers: [],
      safeToExpose: true,
    });
    expect(prisma._store.user).toHaveLength(0);
  });

  it('keeps the restored service blocked when an institutional responsibility conflicts', async () => {
    const prisma = createPrismaMock();
    const user = seedUser(prisma);
    prisma._store.institutionalLicense.push({
      id: 'restored-license',
      organizationName: 'Restored University',
      contactEmail: user.email,
      adminUsers: [user.id],
      status: 'active',
      assignedSeats: 0,
    });
    const ledger = {
      hashIdentity,
      listTombstones: vi.fn(async () => [{
        version: 1,
        event: 'account_deletion_authorized',
        receiptId: 'receipt-restore-blocked',
        userIdHash: hashIdentity(user.id),
      }]),
    };

    const result = await reconcileRestoredDatabase({ prisma, ledger, pageSize: 10 });

    expect(result.safeToExpose).toBe(false);
    expect(result.blockers).toEqual([
      expect.objectContaining({
        receiptId: 'receipt-restore-blocked',
        code: 'ACCOUNT_DELETE_LICENSE_CHANGED',
      }),
    ]);
    expect(prisma._store.user).toHaveLength(1);
  });
});
