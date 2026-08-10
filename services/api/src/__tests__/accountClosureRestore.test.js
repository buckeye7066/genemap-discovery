import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createPrismaMock } from './setup.js';
import {
  isEntrypoint,
  matchingTombstone,
  reconcileRestoredDatabase,
  unknownIdentityKeyIds,
} from '../../../../scripts/reconcile-account-closure-ledger.mjs';

const currentHashIdentity = (value) => `current:${value}`;
const retiredHashIdentity = (value) => `retired:${value}`;

function ledgerWithTombstones(tombstones) {
  return {
    identityKeyIds: ['current', 'retired'],
    hashIdentity: currentHashIdentity,
    hashIdentityCandidates: (value) => [
      { identityKeyId: 'current', userIdHash: currentHashIdentity(value) },
      { identityKeyId: 'retired', userIdHash: retiredHashIdentity(value) },
    ],
    listTombstones: vi.fn(async () => tombstones),
  };
}

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
      userIdHash: currentHashIdentity(user.id),
    };
    expect(matchingTombstone(user, [tombstone], currentHashIdentity)).toBe(tombstone);
    expect(matchingTombstone({ id: 'other', email: user.email }, [tombstone], currentHashIdentity)).toBeNull();
  });

  it('matches a tombstone written under a retained retired identity key', () => {
    const user = { id: 'rotation-user', email: 'rotation@example.invalid' };
    const tombstone = {
      version: 2,
      event: 'account_deletion_authorized',
      receiptId: 'receipt-retired-key',
      identityKeyId: 'retired',
      userIdHash: retiredHashIdentity(user.id),
    };
    const ledger = ledgerWithTombstones([tombstone]);

    expect(matchingTombstone(user, [tombstone], ledger)).toBe(tombstone);
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
    const ledger = ledgerWithTombstones([{
      version: 2,
      event: 'account_deletion_authorized',
      receiptId: 'receipt-restore-2',
      identityKeyId: 'current',
      userIdHash: currentHashIdentity(user.id),
      billing: { subscriptionsCancelled: 1, checkoutSessionsExpired: 0 },
    }]);

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

  it('deletes a resurrected account whose tombstone uses a retained historical key', async () => {
    const prisma = createPrismaMock();
    const user = seedUser(prisma, { id: 'restored-retired' });
    const ledger = ledgerWithTombstones([{
      version: 2,
      event: 'account_deletion_authorized',
      receiptId: 'receipt-historical',
      identityKeyId: 'retired',
      userIdHash: retiredHashIdentity(user.id),
      billing: {},
    }]);

    const result = await reconcileRestoredDatabase({ prisma, ledger, pageSize: 10 });

    expect(result.safeToExpose).toBe(true);
    expect(result.resurrectedAccountsDeleted).toBe(1);
    expect(prisma._store.user).toHaveLength(0);
  });

  it('blocks restored-service exposure when a tombstone references an unavailable historical key', async () => {
    const prisma = createPrismaMock();
    seedUser(prisma, { id: 'possibly-resurrected' });
    const tombstone = {
      version: 2,
      event: 'account_deletion_authorized',
      receiptId: 'receipt-unknown-key',
      identityKeyId: 'retired-not-loaded',
      userIdHash: 'f'.repeat(64),
    };
    const ledger = ledgerWithTombstones([tombstone]);

    expect(unknownIdentityKeyIds([tombstone], ledger)).toEqual(['retired-not-loaded']);
    const result = await reconcileRestoredDatabase({ prisma, ledger, pageSize: 10 });

    expect(result.safeToExpose).toBe(false);
    expect(result.blockers).toEqual([
      expect.objectContaining({
        identityKeyId: 'retired-not-loaded',
        code: 'ACCOUNT_DELETE_LEDGER_IDENTITY_KEY_UNKNOWN',
      }),
    ]);
    expect(prisma._store.user).toHaveLength(1);
  });

  it('does not skip resurrected accounts when deletions span multiple pages', async () => {
    const prisma = createPrismaMock();
    const users = [
      seedUser(prisma, { id: 'restored-a', email: 'a@example.invalid' }),
      seedUser(prisma, { id: 'restored-b', email: 'b@example.invalid' }),
      seedUser(prisma, { id: 'restored-c', email: 'c@example.invalid' }),
    ];
    const ledger = ledgerWithTombstones(users.map((user, index) => ({
      version: 2,
      event: 'account_deletion_authorized',
      receiptId: `receipt-page-${index + 1}`,
      identityKeyId: 'current',
      userIdHash: currentHashIdentity(user.id),
      billing: { subscriptionsCancelled: 0, checkoutSessionsExpired: 0 },
    })));

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
    const ledger = ledgerWithTombstones([{
      version: 2,
      event: 'account_deletion_authorized',
      receiptId: 'receipt-restore-blocked',
      identityKeyId: 'current',
      userIdHash: currentHashIdentity(user.id),
    }]);

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

  it('recognizes a symlinked CLI path as the real reconciliation entrypoint', () => {
    const scriptPath = fileURLToPath(new URL('../../../../scripts/reconcile-account-closure-ledger.mjs', import.meta.url));
    const directory = mkdtempSync(path.join(os.tmpdir(), 'genemap-ledger-entry-'));
    const symlinkPath = path.join(directory, 'reconcile-ledger');
    try {
      symlinkSync(scriptPath, symlinkPath);
      expect(isEntrypoint(pathToFileURL(scriptPath).href, symlinkPath)).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
