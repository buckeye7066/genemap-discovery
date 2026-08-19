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
 *
 * RETENTION. See `docs/DATA_RETENTION.md`. A deletion ledger exists to PROVE a
 * deletion happened, so "expiry" here can never mean erasing the proof: a
 * tombstone must outlive every backup that could resurrect the account it
 * describes, and outlive the window in which the deletion may have to be
 * evidenced. Expiry therefore RETIRES a tombstone from the reconciliation
 * projection by APPENDING a retention marker to the same hash chain; the
 * original chain-bearing line is never rewritten or removed, so the chain still
 * verifies end to end and the proof survives. `LEDGER_RETENTION_DAYS` can only
 * LENGTHEN retention — a value below `RETENTION_FLOOR_DAYS` refuses to boot.
 *
 * IMMUTABILITY. The chain is tamper-EVIDENT, not tamper-PROOF: whoever controls
 * the volume can rewrite the whole log and re-chain it. `<anchorPath>` exposes
 * the chain head so `anchor.mjs` can publish it OFF this host (the GitHub repo),
 * which makes such a rewrite externally DETECTABLE by comparison. It does not
 * make it impossible.
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
const CHAIN_KEY = 'genemap-closure-ledger-chain';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Retention floor: six years, the evidence period `docs/DATA_RETENTION.md`
 * already contemplates for a post-deletion evidence record ("a claimed six-year
 * evidence record after account deletion"). It is also, deliberately, longer
 * than any backup class this project retains — backup expiry is NOT yet
 * evidenced (docs/DATA_RETENTION.md, "Not yet enforced"), and a tombstone that
 * expired before the last restorable backup would let a restore silently
 * resurrect a deleted account with no tombstone left to reconcile it against.
 * Because that window is unknown, the floor is set high and can only move up.
 */
export const RETENTION_FLOOR_DAYS = 2192; // 6 years (6 × 365.25, rounded up)
export const RETENTION_MARKER_EVENT = 'tombstone_retention_expired';

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
 * `LEDGER_RETENTION_DAYS` may only LENGTHEN retention past the policy floor.
 * Anything shorter, or unparseable, is a configuration error the process must
 * refuse rather than silently expire proofs early.
 */
export function parseRetentionDays(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { valid: true, days: RETENTION_FLOOR_DAYS, reason: null };
  }
  const days = Number(String(value).trim());
  if (!Number.isFinite(days) || !Number.isInteger(days) || days <= 0) {
    return { valid: false, days: null, reason: 'not_a_positive_integer' };
  }
  if (days < RETENTION_FLOOR_DAYS) {
    return { valid: false, days: null, reason: 'below_retention_floor' };
  }
  return { valid: true, days, reason: null };
}

/** The chain covers the record's single payload, whichever kind it carries. */
function entryPayload(record) {
  return record.tombstone !== undefined ? record.tombstone : record.retention;
}

/**
 * Append-only, hash-chained tombstone log.
 *
 * `append` fsyncs before returning so an acknowledged write has actually
 * reached the volume — the client treats the acknowledgement as the point of no
 * return for the account deletion.
 *
 * Two record kinds share one chain: `{ ..., tombstone }` deletion authorizations
 * and `{ ..., retention }` expiry markers. Nothing is ever rewritten in place.
 */
export class TombstoneStore {
  constructor(dataDir, { retentionDays = RETENTION_FLOOR_DAYS } = {}) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'tombstones.jsonl');
    this.retentionDays = retentionDays;
    this.records = [];
    this.byReceipt = new Map();
    this.expired = new Set();
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
      if (record.tombstone !== undefined) {
        this.byReceipt.set(record.tombstone.receiptId, record);
      } else if (record.retention !== undefined) {
        this.expired.add(record.retention.receiptId);
      } else {
        throw new Error(`closure-ledger: record ${record.seq} carries no payload`);
      }
      this.lastHash = record.hash;
    }
  }

  get(receiptId) {
    return this.byReceipt.get(receiptId) || null;
  }

  isExpired(receiptId) {
    return this.expired.has(receiptId);
  }

  #appendEntry(kind, payload) {
    const recordedAt = new Date().toISOString();
    const prevHash = this.lastHash;
    const seq = this.records.length + 1;
    const hash = hmacHex(CHAIN_KEY, `${prevHash}.${seq}.${recordedAt}.${canonicalize(payload)}`);
    const record = { seq, recordedAt, prevHash, hash, [kind]: payload };
    const fd = fs.openSync(this.file, 'a');
    try {
      fs.writeSync(fd, `${JSON.stringify(record)}\n`);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    this.records.push(record);
    this.lastHash = hash;
    return record;
  }

  append(tombstone) {
    const record = this.#appendEntry('tombstone', tombstone);
    this.byReceipt.set(tombstone.receiptId, record);
    return record;
  }

  /**
   * Retire every tombstone whose retention period has elapsed.
   *
   * This appends a marker; it never rewrites or removes the original record, so
   * the chain still verifies and the deletion remains provable afterwards. The
   * marker only takes the tombstone out of the reconciliation projection.
   */
  expireDue(now = Date.now()) {
    const cutoff = now - this.retentionDays * MS_PER_DAY;
    const expiredNow = [];
    for (const record of [...this.records]) {
      if (record.tombstone === undefined) continue;
      const receiptId = record.tombstone.receiptId;
      if (this.expired.has(receiptId)) continue;
      const recordedAt = Date.parse(record.recordedAt);
      if (!Number.isFinite(recordedAt) || recordedAt > cutoff) continue;
      this.#appendEntry('retention', {
        event: RETENTION_MARKER_EVENT,
        receiptId,
        tombstoneSeq: record.seq,
        tombstoneRecordedAt: record.recordedAt,
        retentionDays: this.retentionDays,
        expiredAt: new Date(now).toISOString(),
      });
      this.expired.add(receiptId);
      expiredNow.push(receiptId);
    }
    return expiredNow;
  }

  /** Verify the stored hash chain end to end. */
  verifyChain() {
    let prevHash = GENESIS_HASH;
    for (const record of this.records) {
      const expected = hmacHex(
        CHAIN_KEY,
        `${prevHash}.${record.seq}.${record.recordedAt}.${canonicalize(entryPayload(record))}`,
      );
      if (record.prevHash !== prevHash || record.hash !== expected) {
        return { valid: false, brokenAt: record.seq };
      }
      prevHash = record.hash;
    }
    return { valid: true, brokenAt: null };
  }

  /** Chain head, and the hash at any sequence number, for external anchoring. */
  head() {
    return {
      headSeq: this.records.length,
      headHash: this.lastHash,
      records: this.records.length,
      tombstones: this.byReceipt.size,
      expired: this.expired.size,
      retentionDays: this.retentionDays,
    };
  }

  hashAt(seq) {
    const record = this.records[seq - 1];
    return record && record.seq === seq ? record.hash : null;
  }

  list({ includeExpired = false } = {}) {
    return this.records
      .filter((record) => record.tombstone !== undefined)
      .filter((record) => includeExpired || !this.expired.has(record.tombstone.receiptId))
      .map((record) => record.tombstone);
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
  anchorPath = '/tombstones/anchor',
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
      const head = store.head();
      const body = JSON.stringify({
        status: chain.valid ? 'ok' : 'chain_broken',
        records: head.records,
        // Counts only. `tombstones` stays undefined here so the liveness probe
        // can never be mistaken for, or drift into, a content endpoint.
        tombstoneCount: head.tombstones,
        expired: head.expired,
        retentionDays: head.retentionDays,
      });
      res.writeHead(chain.valid ? 200 : 500, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(body);
      return;
    }

    if (route !== writePath && route !== readPath && route !== anchorPath) {
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

    // Retention is enforced lazily on every authenticated touch: no cron, no
    // second moving part that can silently stop running. Each sweep only
    // APPENDS markers, so it cannot damage the chain.
    const expiredNow = store.expireDue();
    if (expiredNow.length) {
      log.info?.(`closure-ledger: retired ${expiredNow.length} tombstone(s) past ${store.retentionDays}-day retention`);
    }

    if (route === anchorPath) {
      if (req.method !== 'GET') {
        sendSigned(res, 405, { error: 'method_not_allowed' });
        return;
      }
      const requestedSeq = url.searchParams.get('seq');
      if (requestedSeq !== null) {
        const seq = Number(requestedSeq);
        if (!Number.isInteger(seq) || seq < 1) {
          sendSigned(res, 400, { error: 'invalid_seq' });
          return;
        }
        sendSigned(res, 200, { seq, hash: store.hashAt(seq) });
        return;
      }
      // Chain head only — no tombstone content, so the anchor can be published
      // off-platform (a public GitHub commit) without disclosing anything.
      sendSigned(res, 200, { ...store.head(), chainValid: store.verifyChain().valid });
      return;
    }

    if (route === readPath) {
      if (req.method !== 'GET') {
        sendSigned(res, 405, { error: 'method_not_allowed' });
        return;
      }
      const includeExpired = url.searchParams.get('includeExpired') === '1';
      sendSigned(res, 200, { tombstones: store.list({ includeExpired }) });
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
  const retention = parseRetentionDays(env.LEDGER_RETENTION_DAYS);
  if (!retention.valid) {
    console.error(
      `closure-ledger: refusing to start — LEDGER_RETENTION_DAYS is ${retention.reason}; `
      + `retention may only be LENGTHENED past the ${RETENTION_FLOOR_DAYS}-day policy floor, never shortened`,
    );
    process.exit(1);
  }
  const dataDir = env.LEDGER_DATA_DIR || '/data';
  const store = new TombstoneStore(dataDir, { retentionDays: retention.days });
  const chain = store.verifyChain();
  if (!chain.valid) {
    console.error(`closure-ledger: refusing to start — hash chain broken at record ${chain.brokenAt}`);
    process.exit(1);
  }
  store.expireDue();
  const port = Number(env.PORT || 8080);
  const host = env.HOST || '0.0.0.0';
  const server = createServer({
    secret,
    store,
    writePath: env.LEDGER_WRITE_PATH || '/tombstones/write',
    readPath: env.LEDGER_READ_PATH || '/tombstones/read',
    anchorPath: env.LEDGER_ANCHOR_PATH || '/tombstones/anchor',
  });
  server.listen(port, host, () => {
    console.log(
      `closure-ledger: listening on ${host}:${port}, ${store.records.length} record(s) in ${dataDir}, `
      + `retention ${retention.days}d, head ${store.lastHash.slice(0, 12)}`,
    );
  });
  return server;
}

// Only start when this file IS the entrypoint (never when a test imports it).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
