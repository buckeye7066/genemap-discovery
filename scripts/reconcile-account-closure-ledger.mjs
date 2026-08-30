// Run as `node scripts/reconcile-account-closure-ledger.mjs` (no shebang: this
// module is also `import`ed directly by src/__tests__/accountClosureRestore.test.js,
// and a leading shebang line breaks vitest's esbuild-based transform on import).
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { createAccountClosureLedger } from '../services/api/src/services/accountClosureLedger.js';
import { finalizeAuthorizedDatabaseDeletion } from '../services/api/src/services/accountClosure.js';

const REQUIRED_ACK = 'I CONFIRM THIS RESTORED DATABASE IS QUARANTINED';

function hashCandidates(userId, ledgerOrHashIdentity) {
  if (typeof ledgerOrHashIdentity === 'function') {
    return [{ identityKeyId: null, userIdHash: ledgerOrHashIdentity(userId) }];
  }
  if (typeof ledgerOrHashIdentity?.hashIdentityCandidates === 'function') {
    return ledgerOrHashIdentity.hashIdentityCandidates(userId);
  }
  throw new TypeError('ledger.hashIdentityCandidates or hashIdentity is required for restore reconciliation');
}

export function matchingTombstone(user, tombstones, ledgerOrHashIdentity) {
  const candidates = hashCandidates(user.id, ledgerOrHashIdentity);
  return tombstones.find((tombstone) => {
    if (typeof tombstone.identityKeyId === 'string') {
      return candidates.some((candidate) => (
        candidate.identityKeyId === tombstone.identityKeyId
        && candidate.userIdHash === tombstone.userIdHash
      ));
    }
    // Legacy version-1 tombstones have no key ID. Match against every retained
    // historical candidate, including the migration-only transport-secret hash.
    return candidates.some((candidate) => candidate.userIdHash === tombstone.userIdHash);
  }) || null;
}

export function unknownIdentityKeyIds(tombstones, ledger) {
  const known = new Set(Array.isArray(ledger?.identityKeyIds) ? ledger.identityKeyIds : []);
  return [...new Set((tombstones || [])
    .filter((tombstone) => tombstone?.version === 2 && typeof tombstone.identityKeyId === 'string')
    .map((tombstone) => tombstone.identityKeyId)
    .filter((identityKeyId) => !known.has(identityKeyId)))];
}

export async function reconcileRestoredDatabase({
  prisma,
  ledger,
  pageSize = 250,
}) {
  const tombstones = await ledger.listTombstones();
  let scanned = 0;
  let deleted = 0;
  const blockers = unknownIdentityKeyIds(tombstones, ledger).map((identityKeyId) => ({
    identityKeyId,
    code: 'ACCOUNT_DELETE_LEDGER_IDENTITY_KEY_UNKNOWN',
    message: `The restored service cannot be exposed because deletion tombstones use unavailable identity key ${identityKeyId}. Restore that retired key and rerun reconciliation.`,
  }));

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
      const tombstone = matchingTombstone(user, tombstones, ledger);
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
        const currentHash = typeof ledger.hashIdentity === 'function'
          ? ledger.hashIdentity(user.id)
          : hashCandidates(user.id, ledger)[0]?.userIdHash;
        blockers.push({
          userIdHash: currentHash || null,
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

export function isEntrypoint(metaUrl, argvPath) {
  if (!argvPath) return false;
  try {
    return realpathSync(fileURLToPath(metaUrl)) === realpathSync(path.resolve(argvPath));
  } catch {
    return false;
  }
}

async function main() {
  if (process.env.RESTORE_RECONCILIATION_ACK !== REQUIRED_ACK) {
    throw new Error(
      `Refusing to reconcile: Set the environment variable RESTORE_RECONCILIATION_ACK to "${REQUIRED_ACK}". This should only be done in an isolated restored environment where all outbound application traffic is disabled to prevent any unauthorized data exposure.`,
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required and must point to the isolated restored database. Ensure this variable is set in your environment variables with the correct database connection string format: "postgresql://user:password@localhost:5432/database" or similar depending on your database configuration.');
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

if (isEntrypoint(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(`[account-closure-ledger] ${error?.message || error}`);
    process.exitCode = 1;
  });
}
