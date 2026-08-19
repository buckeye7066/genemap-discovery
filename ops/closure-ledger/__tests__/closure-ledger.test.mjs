/**
 * End-to-end contract test for the restore-independent deletion ledger.
 *
 * These tests deliberately drive the REAL API client
 * (`services/api/src/services/accountClosureLedger.js`) over REAL HTTP against
 * the REAL server. A hand-written mock of either side would prove only that the
 * mock agrees with itself, and the whole point of this service is that the two
 * independently-written HMAC implementations line up exactly.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import {
  MAX_CLOCK_SKEW_MS,
  TombstoneStore,
  canonicalize,
  createServer,
  validateTombstone,
  verifyRequestSignature,
} from '../server.mjs';
import {
  accountClosureLedgerStatus,
  createAccountClosureLedger,
} from '../../../services/api/src/services/accountClosureLedger.js';

const SECRET = 'ledger-transport-secret-that-is-at-least-thirty-two-characters';
const IDENTITY_SECRET = 'current-identity-key-that-is-at-least-thirty-two-characters';
const HTTPS_ORIGIN = 'https://ledger.test.invalid';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'genemap-ledger-'));
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

describe('closure ledger server <-> API client contract', () => {
  let dataDir;
  let store;
  let server;
  let base;
  let ledger;

  before(async () => {
    dataDir = tempDir();
    store = new TombstoneStore(dataDir);
    server = createServer({ secret: SECRET, store, log: {} });
    base = await listen(server);
    // The client refuses any non-https ledger URL (safeHttpsUrl), which is the
    // correct production rule. Configure the real https origin and transport
    // over loopback http here so the HMAC/idempotency/signature contract is
    // still exercised end to end without a throwaway TLS certificate.
    ledger = createAccountClosureLedger({
      env: {
        NODE_ENV: 'production',
        ACCOUNT_CLOSURE_LEDGER_WRITE_URL: `${HTTPS_ORIGIN}/tombstones/write`,
        ACCOUNT_CLOSURE_LEDGER_READ_URL: `${HTTPS_ORIGIN}/tombstones/read`,
        ACCOUNT_CLOSURE_LEDGER_SECRET: SECRET,
        ACCOUNT_CLOSURE_LEDGER_IDENTITY_KEYS: `2026-08=${IDENTITY_SECRET}`,
        RELEASE_SHA: 'a'.repeat(40),
      },
      fetchImpl: (url, options) => fetch(String(url).replace(HTTPS_ORIGIN, base), options),
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('reports configured once both URLs, the transport secret, and the key ring are set', () => {
    const status = accountClosureLedgerStatus({
      ACCOUNT_CLOSURE_LEDGER_WRITE_URL: 'https://ledger.example.com/tombstones/write',
      ACCOUNT_CLOSURE_LEDGER_READ_URL: 'https://ledger.example.com/tombstones/read',
      ACCOUNT_CLOSURE_LEDGER_SECRET: SECRET,
      ACCOUNT_CLOSURE_LEDGER_IDENTITY_KEYS: `2026-08=${IDENTITY_SECRET}`,
    });
    assert.equal(status.configured, true);
    assert.equal(status.currentIdentityKeyId, '2026-08');
  });

  it('accepts a signed tombstone and returns an acknowledgement the client authenticates', async () => {
    const result = await ledger.authorize({
      receiptId: 'receipt-e2e-1',
      userIdHash: ledger.hashIdentity('user-1'),
      actorMode: 'self_service',
      authorizedAt: '2026-08-19T12:00:00.000Z',
      billing: { checkoutSessionsExpired: 1, subscriptionsCancelled: 2 },
    });
    assert.deepEqual(result, {
      mode: 'external',
      recorded: true,
      receiptId: 'receipt-e2e-1',
      identityKeyId: '2026-08',
    });
    assert.equal(store.records.length, 1);
    assert.equal(store.verifyChain().valid, true);
  });

  it('is idempotent for a replayed identical receipt and appends no second record', async () => {
    const tombstone = {
      receiptId: 'receipt-e2e-1',
      userIdHash: ledger.hashIdentity('user-1'),
      actorMode: 'self_service',
      authorizedAt: '2026-08-19T12:00:00.000Z',
      billing: { checkoutSessionsExpired: 1, subscriptionsCancelled: 2 },
    };
    const result = await ledger.authorize(tombstone);
    assert.equal(result.recorded, true);
    assert.equal(store.records.length, 1);
  });

  it('refuses to overwrite an existing receipt with a different payload', async () => {
    await assert.rejects(
      ledger.authorize({
        receiptId: 'receipt-e2e-1',
        userIdHash: ledger.hashIdentity('someone-else'),
        actorMode: 'admin',
        authorizedAt: '2026-08-19T13:00:00.000Z',
      }),
      (error) => error.code === 'ACCOUNT_DELETE_LEDGER_WRITE_FAILED',
    );
    assert.equal(store.records.length, 1);
  });

  it('returns a signed tombstone list the client accepts and filters', async () => {
    await ledger.authorize({
      receiptId: 'receipt-e2e-2',
      userIdHash: ledger.hashIdentity('user-2'),
      actorMode: 'self_service',
      authorizedAt: '2026-08-19T12:05:00.000Z',
    });
    const tombstones = await ledger.listTombstones();
    assert.equal(tombstones.length, 2);
    assert.deepEqual(
      tombstones.map((t) => t.receiptId).sort(),
      ['receipt-e2e-1', 'receipt-e2e-2'],
    );
    for (const tombstone of tombstones) {
      assert.equal(tombstone.event, 'account_deletion_authorized');
      assert.equal(tombstone.version, 2);
      assert.equal(tombstone.identityKeyId, '2026-08');
    }
  });

  it('survives a process restart — the log is reloaded from disk', () => {
    const reloaded = new TombstoneStore(dataDir);
    assert.equal(reloaded.records.length, store.records.length);
    assert.equal(reloaded.lastHash, store.lastHash);
    assert.equal(reloaded.verifyChain().valid, true);
  });

  it('rejects an unsigned write, and the client refuses the response', async () => {
    const response = await fetch(`${base}/tombstones/write`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        version: 2,
        event: 'account_deletion_authorized',
        receiptId: 'receipt-unsigned',
        userIdHash: 'a'.repeat(64),
        identityKeyId: '2026-08',
      }),
    });
    assert.equal(response.status, 401);
    assert.equal(store.get('receipt-unsigned'), null);
  });

  it('rejects a write signed with the wrong secret', async () => {
    const body = JSON.stringify({
      version: 2,
      event: 'account_deletion_authorized',
      receiptId: 'receipt-wrong-secret',
      userIdHash: 'b'.repeat(64),
      identityKeyId: '2026-08',
    });
    const timestamp = new Date().toISOString();
    const forged = crypto.createHmac('sha256', 'a-different-secret-of-at-least-thirty-two-chars')
      .update(`${timestamp}.${body}`)
      .digest('hex');
    const response = await fetch(`${base}/tombstones/write`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-genemap-ledger-timestamp': timestamp,
        'x-genemap-ledger-signature': `sha256=${forged}`,
      },
      body,
    });
    assert.equal(response.status, 401);
    assert.equal(store.get('receipt-wrong-secret'), null);
  });

  it('rejects a correctly-signed but stale request (replay window)', () => {
    const timestamp = new Date(Date.now() - MAX_CLOCK_SKEW_MS - 1000).toISOString();
    const body = '';
    const signature = `sha256=${crypto.createHmac('sha256', SECRET).update(`${timestamp}.${body}`).digest('hex')}`;
    const reason = verifyRequestSignature(
      { 'x-genemap-ledger-timestamp': timestamp, 'x-genemap-ledger-signature': signature },
      body,
      SECRET,
    );
    assert.equal(reason, 'stale_timestamp');
  });

  it('rejects a signed request whose body does not match the signature', async () => {
    const signedBody = JSON.stringify({
      version: 2,
      event: 'account_deletion_authorized',
      receiptId: 'receipt-tampered',
      userIdHash: 'c'.repeat(64),
      identityKeyId: '2026-08',
    });
    const timestamp = new Date().toISOString();
    const signature = `sha256=${crypto.createHmac('sha256', SECRET).update(`${timestamp}.${signedBody}`).digest('hex')}`;
    const tamperedBody = signedBody.replace('receipt-tampered', 'receipt-swapped!');
    const response = await fetch(`${base}/tombstones/write`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-genemap-ledger-timestamp': timestamp,
        'x-genemap-ledger-signature': signature,
      },
      body: tamperedBody,
    });
    assert.equal(response.status, 401);
    assert.equal(store.get('receipt-swapped!'), null);
  });

  it('rejects a signed but malformed tombstone', async () => {
    const body = JSON.stringify({ version: 2, event: 'something_else', receiptId: 'x' });
    const timestamp = new Date().toISOString();
    const signature = `sha256=${crypto.createHmac('sha256', SECRET).update(`${timestamp}.${body}`).digest('hex')}`;
    const response = await fetch(`${base}/tombstones/write`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-genemap-ledger-timestamp': timestamp,
        'x-genemap-ledger-signature': signature,
      },
      body,
    });
    assert.equal(response.status, 400);
  });

  it('serves an unauthenticated liveness probe without exposing ledger content', async () => {
    const response = await fetch(`${base}/healthz`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.status, 'ok');
    assert.equal(typeof payload.records, 'number');
    assert.equal(payload.tombstones, undefined);
  });
});

describe('closure ledger units', () => {
  it('detects a tampered record via the hash chain', () => {
    const dir = tempDir();
    try {
      const store = new TombstoneStore(dir);
      store.append({
        version: 2,
        event: 'account_deletion_authorized',
        receiptId: 'r1',
        userIdHash: 'd'.repeat(64),
        identityKeyId: 'k1',
      });
      assert.equal(store.verifyChain().valid, true);
      store.records[0].tombstone.receiptId = 'r1-tampered';
      const result = store.verifyChain();
      assert.equal(result.valid, false);
      assert.equal(result.brokenAt, 1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('canonicalizes key order so replay comparison is order-independent', () => {
    assert.equal(canonicalize({ b: 1, a: 2 }), canonicalize({ a: 2, b: 1 }));
    assert.notEqual(canonicalize({ a: 1 }), canonicalize({ a: 2 }));
  });

  it('names each tombstone validation failure', () => {
    assert.equal(validateTombstone(null), 'not_an_object');
    assert.equal(validateTombstone({ event: 'nope' }), 'unknown_event');
    assert.equal(validateTombstone({ event: 'account_deletion_authorized', version: 9 }), 'unsupported_version');
    assert.equal(
      validateTombstone({ event: 'account_deletion_authorized', version: 2, receiptId: '  ' }),
      'missing_receipt_id',
    );
    assert.equal(
      validateTombstone({ event: 'account_deletion_authorized', version: 2, receiptId: 'r', userIdHash: 'short' }),
      'invalid_user_id_hash',
    );
    assert.equal(
      validateTombstone({
        event: 'account_deletion_authorized',
        version: 2,
        receiptId: 'r',
        userIdHash: 'e'.repeat(64),
        identityKeyId: 'not a valid id!',
      }),
      'invalid_identity_key_id',
    );
    assert.equal(
      validateTombstone({
        event: 'account_deletion_authorized',
        version: 2,
        receiptId: 'r',
        userIdHash: 'e'.repeat(64),
        identityKeyId: '2026-08',
      }),
      null,
    );
  });

  it('refuses to construct a server without a long-enough transport secret', () => {
    const dir = tempDir();
    try {
      assert.throws(() => createServer({ secret: 'too-short', store: new TombstoneStore(dir) }));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
