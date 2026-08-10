#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { createAccountClosureLedger } from '../services/api/src/services/accountClosureLedger.js';
import { finalizeAuthorizedDatabaseDeletion } from '../services/api/src/services/accountClosure.js';

const REQUIRED_ACK = 'I CONFIRM THIS RESTORED DATABASE IS QUARANTINED';

export function matchingTombstone(user, tombstones, hashIdentity) {
  if (typeof hashIdentity !== 'function') {
    throw new TypeError('hashIdentity is required for restore reconciliation');
  }
  const idHash = hashIdentity(user.id);
  return tombstones.find((tombstone) => tombstone.userIdHash === idHash) || null;
}

export async function reconcileRestoredDatabase({
  prisma,
  ledger,
  pageSize = 250,
}) {
  const tombstones = await ledger.listTombstones();
  let scanned = 0;
  let deleted = 0;
  const blockers = [];

  // Keyset pagination is required because this loop deletes matching users.
  // Offset pagination would skip rows after every deletion as the remaining
  // records shift left in the result set.
  let lastSeenId = null;
  for (;;) {
    const users = await prisma.user.findMany({
      orderBy: { id: 'asc' },
      where: lastSeenId ? { id: { gt: lastSeenId } } : undefined,
      take: pageSize,
    });
    if (!users.length) break;
    scanned += users.length;
    lastSeenId = users.at(-1).id;

    for (const user of users) {
      const tombstone = matchingTombstone(user, tombstones, ledger.hashIdentity);
      if (!tombstone) continue;
      try {
        await finalizeAuthorizedDatabaseDeletion({
          prisma,
          user,
          receiptId: tombstone.receiptId,
          billing: tombstone.billing || {},
        });
        deleted += 1;
      } catch (error) {
        blockers.push({
          userIdHash: ledger.hashIdentity(user.id),
          receiptId: tombstone.receiptId,
          code: error?.code || 'RESTORE_RECONCILIATION_FAILED',
          message: error?.message || String(error),
        });
      }
    }

    if (users.length < pageSize) break;
  }

  return {
    tombstones: tombstones.length,
    usersScanned: scanned,
    resurrectedAccountsDeleted: deleted,
    blockers,
    safeToExpose: blockers.length === 0,
  };
}

async function main() {
  if (process.env.RESTORE_RECONCILIATION_ACK !== REQUIRED_ACK) {
    throw new Error(
      `Refusing to reconcile: set RESTORE_RECONCILIATION_ACK="${REQUIRED_ACK}" only inside an isolated restored environment with outbound application traffic disabled.`,
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must point to the isolated restored database.');
  }

  const prisma = new PrismaClient();
  try {
    const result = await reconcileRestoredDatabase({
      prisma,
      ledger: createAccountClosureLedger(),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.safeToExpose) process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`[account-closure-ledger] ${error?.message || error}`);
    process.exitCode = 1;
  });
}
