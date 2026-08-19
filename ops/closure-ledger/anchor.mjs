/**
 * Off-platform immutability anchor for the account-deletion ledger.
 *
 * WHAT THIS DOES AND DOES NOT CLAIM
 *
 * The ledger's hash chain is tamper-EVIDENT but not tamper-PROOF: anyone who
 * controls the `/data` volume can delete a tombstone, re-chain every following
 * record, and hand back a log that verifies perfectly against itself. Nothing
 * that lives only on the ledger host can close that hole.
 *
 * This tool closes it by ANCHORING: it periodically records `(headSeq,
 * headHash)` into `anchors/chain-anchors.jsonl`, which is committed to the
 * GitHub repository — a store the ledger host has no write access to. A later
 * `verify` asks the live ledger for the hash it now reports at each previously
 * anchored sequence number. Because every hash commits to its predecessor, a
 * rewrite of ANY record at or before that sequence changes that hash, so the
 * comparison fails.
 *
 * So: a rewrite becomes externally DETECTABLE by an observer who trusts the
 * anchor store rather than the ledger host. It does NOT become impossible, and
 * this file must never be described as making the ledger immutable.
 *
 *   node ops/closure-ledger/anchor.mjs capture
 *   node ops/closure-ledger/anchor.mjs verify
 *
 * Env: LEDGER_ANCHOR_URL (https), ACCOUNT_CLOSURE_LEDGER_SECRET (transport HMAC).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ANCHOR_FILE = path.join(HERE, 'anchors', 'chain-anchors.jsonl');
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

function hmacHex(secret, value) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Signed GET against the ledger, verifying the response signature the same way
 * the API client does. An unsigned or stale answer is never usable as evidence.
 */
export async function signedGet(url, secret, { fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const timestamp = new Date(now).toISOString();
  // An explicit controller, cleared in `finally`, rather than
  // `AbortSignal.timeout`: that leaves a live libuv handle behind, and a later
  // `process.exit` while it is closing aborts the process with an assertion
  // (observed on Windows: exit 127 after a SUCCESSFUL capture).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let response;
  let rawBody;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'x-genemap-ledger-timestamp': timestamp,
        'x-genemap-ledger-signature': `sha256=${hmacHex(secret, `${timestamp}.`)}`,
      },
      signal: controller.signal,
    });
    rawBody = await response.text();
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new Error(`ledger anchor endpoint returned HTTP ${response.status}: ${rawBody.slice(0, 200)}`);

  const responseTimestamp = response.headers.get('x-genemap-ledger-timestamp');
  const suppliedSignature = response.headers.get('x-genemap-ledger-signature');
  const parsed = Date.parse(responseTimestamp || '');
  if (!Number.isFinite(parsed) || Math.abs(Date.now() - parsed) > MAX_CLOCK_SKEW_MS) {
    throw new Error('ledger anchor response carried a missing, invalid, or stale timestamp');
  }
  if (!constantTimeEqual(suppliedSignature, `sha256=${hmacHex(secret, `${responseTimestamp}.${rawBody}`)}`)) {
    throw new Error('ledger anchor response was not authenticated by the transport secret');
  }
  return JSON.parse(rawBody);
}

export function readAnchors(file = DEFAULT_ANCHOR_FILE) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

/** Capture the current chain head and append it to the off-platform anchor log. */
export async function captureAnchor({ url, secret, file = DEFAULT_ANCHOR_FILE, fetchImpl } = {}) {
  const head = await signedGet(url, secret, { fetchImpl });
  if (!Number.isInteger(head.headSeq) || typeof head.headHash !== 'string' || !head.headHash) {
    throw new Error(`ledger anchor endpoint returned an unusable head: ${JSON.stringify(head)}`);
  }
  if (head.chainValid !== true) {
    throw new Error(`ledger reports its own chain INVALID — refusing to anchor: ${JSON.stringify(head)}`);
  }
  const anchor = {
    capturedAt: new Date().toISOString(),
    headSeq: head.headSeq,
    headHash: head.headHash,
    records: head.records,
    tombstones: head.tombstones,
    expired: head.expired,
    retentionDays: head.retentionDays,
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(anchor)}\n`);
  return anchor;
}

/**
 * Check the live ledger against every anchor already published off-platform.
 *
 * Two independent failures are caught:
 *  - a hash at a previously anchored sequence that no longer matches (history
 *    was rewritten, or a record was removed and the chain re-computed);
 *  - a head sequence that went BACKWARDS (the log was truncated or replaced).
 */
export async function verifyAnchors({ url, secret, file = DEFAULT_ANCHOR_FILE, fetchImpl } = {}) {
  const anchors = readAnchors(file);
  const head = await signedGet(url, secret, { fetchImpl });
  const problems = [];

  if (anchors.length) {
    const highest = anchors.reduce((max, a) => (a.headSeq > max.headSeq ? a : max), anchors[0]);
    if (head.headSeq < highest.headSeq) {
      problems.push(
        `live head sequence ${head.headSeq} is BELOW anchored sequence ${highest.headSeq} `
        + `(anchored ${highest.capturedAt}) — the log was truncated or replaced`,
      );
    }
  }

  for (const anchor of anchors) {
    if (anchor.headSeq === 0) continue;
    const at = await signedGet(`${url}${url.includes('?') ? '&' : '?'}seq=${anchor.headSeq}`, secret, { fetchImpl });
    if (at.hash !== anchor.headHash) {
      problems.push(
        `record ${anchor.headSeq} hashes to ${at.hash || 'MISSING'} but was anchored as `
        + `${anchor.headHash} on ${anchor.capturedAt} — history at or before that record was rewritten`,
      );
    }
  }

  return { ok: problems.length === 0, checked: anchors.length, head, problems };
}

async function cli(argv) {
  const command = argv[2];
  const url = process.env.LEDGER_ANCHOR_URL;
  const secret = process.env.ACCOUNT_CLOSURE_LEDGER_SECRET;
  if (!url || !secret) {
    console.error('anchor: LEDGER_ANCHOR_URL and ACCOUNT_CLOSURE_LEDGER_SECRET are both required');
    return 2;
  }

  if (command === 'capture') {
    const anchor = await captureAnchor({ url, secret });
    console.log(`anchor: captured seq ${anchor.headSeq} head ${anchor.headHash} at ${anchor.capturedAt}`);
    return 0;
  }

  if (command === 'verify') {
    const result = await verifyAnchors({ url, secret });
    if (result.ok) {
      console.log(`anchor: OK — ${result.checked} anchor(s) still match; live head seq ${result.head.headSeq}`);
      return 0;
    }
    console.error('anchor: TAMPER DETECTED against the off-platform anchor log');
    for (const problem of result.problems) console.error(`  - ${problem}`);
    return 1;
  }

  console.error('anchor: usage — node ops/closure-ledger/anchor.mjs <capture|verify>');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Set exitCode and let the loop drain, rather than process.exit(): a forced
  // exit while a socket or timer handle is still closing can abort the process
  // with a non-zero code even on a fully successful run.
  cli(process.argv).then(
    (code) => { process.exitCode = code; },
    (error) => {
      console.error(`anchor: ${error?.message || error}`);
      process.exitCode = 1;
    },
  );
}
