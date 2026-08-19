/**
 * GeneMap restore-independent account-deletion ledger.
 *
 * This is the counterparty for `services/api/src/services/accountClosureLedger.js`.
 * It is deliberately a SEPARATE deployable with its OWN persistent storage: a
 * tombstone table inside the application's own Postgres would be resurrected by
 * the same restore that resurrects the deleted accounts, which is exactly the
 * failure this ledger exists to prevent.
 *
 * Protocol (must match the API client exactly):
 *
 *   POST <write path>
 *     headers: content-type: application/json
 *              idempotency-key: <receiptId>
 *              x-genemap-ledger-timestamp: <ISO-8601>
 *              x-genemap-ledger-signature: sha256=HMAC_SHA256(secret, `${timestamp}.${rawBody}`)
 *     body:    the versioned tombstone
 *     200:     HMAC-signed `{"recorded":true,"receiptId":"<same>"}`
 *
 *   GET <read path>
 *     headers: x-genemap-ledger-timestamp + x-genemap-ledger-signature over an
 *              EMPTY body (`${timestamp}.`)
 *     200:     HMAC-signed `{"tombstones":[...]}`
 *
 * Every response this server returns on those two paths carries
 * `x-genemap-ledger-timestamp` and `x-genemap-ledger-signature` computed over
 * `${responseTimestamp}.${responseBody}`; the client rejects any response that
 * is unsigned, mis-signed, or more than 5 minutes skewed.
 *
 * Storage is an append-only JSONL log with a per-record hash chain. Records are
 * never rewritten or deleted by this process — a conflicting re-write of an
 * existing receiptId is refused with 409 rather than mutating history.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const MIN_SECRET_LENGTH = 32;
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_BODY_BYTES = 64 * 1024;
const IDENTITY_KEY_ID = /^[A-Za-z0-9._-]{1,64}$/u;
const HEX64 = /^[a-f0-9]{64}$/u;
const GENESIS_HASH = '0'.repeat(64);

function hmacHex(secret, value) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Canonical JSON with sorted keys, so idempotency comparison of two writes of
 * the same receipt does not depend on key order.
 */
export function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

/** Reject anything that is not a well-formed v1/v2 deletion tombstone. */
export function validateTombstone(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'not_an_object';
  if (payload.event !== 'account_deletion_authorized') return 'unknown_event';
  if (payload.version !== 1 && payload.version !== 2) return 'unsupported_version';
  if (typeof payload.receiptId !== 'string' || !payload.receiptId.trim()) return 'missing_receipt_id';
  if (typeof payload.userIdHash !== 'string' || !HEX64.test(payload.userIdHash)) return 'invalid_user_id_hash';
  if (payload.version === 2
    && (typeof payload.identityKeyId !== 'string' || !IDENTITY_KEY_ID.test(payload.identityKeyId))) {
    return 'invalid_identity_key_id';
  }
  return null;
}

/**
 * Append-only, hash-chained tombstone log.
 *
 * `append` fsyncs before returning so an acknowledged write has actually
 * reached the volume — the client treats the acknowledgement as the point of no
 * return for the account deletion.
 */
export class TombstoneStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'tombstones.jsonl');
    this.records = [];
    this.byReceipt = new Map();
    this.lastHash = GENESIS_HASH;
    this.load();
  }

  load() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    if (!fs.existsSync(this.file)) return;
    const lines = fs.readFileSync(this.file, 'utf8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        // A torn trailing line can only be the last one; anything else means
        // the log was corrupted and must not be silently ignored.
        throw new Error(`closure-ledger: unparseable record in ${this.file}`);
      }
      this.records.push(record);
      this.byReceipt.set(record.tombstone.receiptId, record);
      this.lastHash = record.hash;
    }
  }

  get(receiptId) {
    return this.byReceipt.get(receiptId) || null;
  }

  append(tombstone) {
    const recordedAt = new Date().toISOString();
    const prevHash = this.lastHash;
    const seq = this.records.length + 1;
    const hash = hmacHex('genemap-closure-ledger-chain', `${prevHash}.${seq}.${recordedAt}.${canonicalize(tombstone)}`);
    const record = { seq, recordedAt, prevHash, hash, tombstone };
    const fd = fs.openSync(this.file, 'a');
    try {
      fs.writeSync(fd, `${JSON.stringify(record)}\n`);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    this.records.push(record);
    this.byReceipt.set(tombstone.receiptId, record);
    this.lastHash = hash;
    return record;
  }

  /** Verify the stored hash chain end to end. */
  verifyChain() {
    let prevHash = GENESIS_HASH;
    for (const record of this.records) {
      const expected = hmacHex(
        'genemap-closure-ledger-chain',
        `${prevHash}.${record.seq}.${record.recordedAt}.${canonicalize(record.tombstone)}`,
      );
      if (record.prevHash !== prevHash || record.hash !== expected) {
        return { valid: false, brokenAt: record.seq };
      }
      prevHash = record.hash;
    }
    return { valid: true, brokenAt: null };
  }

  list() {
    return this.records.map((record) => record.tombstone);
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Verify the caller's HMAC over `${timestamp}.${rawBody}` and reject stale or
 * missing timestamps. Returns null on success, a reason string on failure.
 */
export function verifyRequestSignature(headers, rawBody, secret, now = Date.now()) {
  const timestamp = headers['x-genemap-ledger-timestamp'];
  const supplied = headers['x-genemap-ledger-signature'];
  const parsed = Date.parse(timestamp || '');
  if (!timestamp || !Number.isFinite(parsed)) return 'missing_or_invalid_timestamp';
  if (Math.abs(now - parsed) > MAX_CLOCK_SKEW_MS) return 'stale_timestamp';
  const expected = `sha256=${hmacHex(secret, `${timestamp}.${rawBody}`)}`;
  if (!constantTimeEqual(supplied, expected)) return 'invalid_signature';
  return null;
}

export function createServer({
  secret,
  store,
  writePath = '/tombstones/write',
  readPath = '/tombstones/read',
  log = console,
} = {}) {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`closure-ledger: ACCOUNT_CLOSURE_LEDGER_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  }

  function sendSigned(res, status, payload) {
    const body = JSON.stringify(payload);
    const timestamp = new Date().toISOString();
    res.writeHead(status, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-genemap-ledger-timestamp': timestamp,
      'x-genemap-ledger-signature': `sha256=${hmacHex(secret, `${timestamp}.${body}`)}`,
    });
    res.end(body);
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://ledger.local');
    const route = url.pathname;

    // Unauthenticated liveness only — no ledger content, no signature needed,
    // so a platform healthcheck never has to hold the transport secret.
    if (req.method === 'GET' && (route === '/healthz' || route === '/')) {
      const chain = store.verifyChain();
      const body = JSON.stringify({
        status: chain.valid ? 'ok' : 'chain_broken',
        records: store.records.length,
      });
      res.writeHead(chain.valid ? 200 : 500, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(body);
      return;
    }

    if (route !== writePath && route !== readPath) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
      return;
    }

    let rawBody;
    try {
      rawBody = await readBody(req);
    } catch {
      sendSigned(res, 413, { recorded: false, error: 'body_too_large' });
      return;
    }

    const signatureFailure = verifyRequestSignature(req.headers, rawBody, secret);
    if (signatureFailure) {
      log.warn?.(`closure-ledger: rejected ${req.method} ${route}: ${signatureFailure}`);
      sendSigned(res, 401, { recorded: false, error: signatureFailure });
      return;
    }

    if (route === readPath) {
      if (req.method !== 'GET') {
        sendSigned(res, 405, { error: 'method_not_allowed' });
        return;
      }
      sendSigned(res, 200, { tombstones: store.list() });
      return;
    }

    if (req.method !== 'POST') {
      sendSigned(res, 405, { recorded: false, error: 'method_not_allowed' });
      return;
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      sendSigned(res, 400, { recorded: false, error: 'invalid_json' });
      return;
    }

    const invalid = validateTombstone(payload);
    if (invalid) {
      sendSigned(res, 400, { recorded: false, error: invalid });
      return;
    }

    const receiptId = payload.receiptId.trim();
    const existing = store.get(receiptId);
    if (existing) {
      // Idempotent replay of the identical receipt is a success; a DIFFERENT
      // payload under the same receipt is a conflict, never an overwrite.
      if (canonicalize(existing.tombstone) === canonicalize(payload)) {
        sendSigned(res, 200, { recorded: true, receiptId, duplicate: true });
        return;
      }
      log.warn?.(`closure-ledger: receipt conflict for ${receiptId}`);
      sendSigned(res, 409, { recorded: false, error: 'receipt_conflict' });
      return;
    }

    try {
      store.append(payload);
    } catch (error) {
      log.error?.(`closure-ledger: append failed: ${error?.message}`);
      sendSigned(res, 503, { recorded: false, error: 'append_failed' });
      return;
    }

    log.info?.(`closure-ledger: recorded receipt ${receiptId}`);
    sendSigned(res, 200, { recorded: true, receiptId });
  });
}

export function main(env = process.env) {
  const secret = env.ACCOUNT_CLOSURE_LEDGER_SECRET || '';
  if (secret.length < MIN_SECRET_LENGTH) {
    console.error(
      `closure-ledger: refusing to start — ACCOUNT_CLOSURE_LEDGER_SECRET must be at least ${MIN_SECRET_LENGTH} characters`,
    );
    process.exit(1);
  }
  const dataDir = env.LEDGER_DATA_DIR || '/data';
  const store = new TombstoneStore(dataDir);
  const chain = store.verifyChain();
  if (!chain.valid) {
    console.error(`closure-ledger: refusing to start — hash chain broken at record ${chain.brokenAt}`);
    process.exit(1);
  }
  const port = Number(env.PORT || 8080);
  const host = env.HOST || '0.0.0.0';
  const server = createServer({
    secret,
    store,
    writePath: env.LEDGER_WRITE_PATH || '/tombstones/write',
    readPath: env.LEDGER_READ_PATH || '/tombstones/read',
  });
  server.listen(port, host, () => {
    console.log(`closure-ledger: listening on ${host}:${port}, ${store.records.length} record(s) in ${dataDir}`);
  });
  return server;
}

// Only start when this file IS the entrypoint (never when a test imports it).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
