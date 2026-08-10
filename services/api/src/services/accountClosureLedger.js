import crypto from 'node:crypto';
import { AppError } from '../utils/errors.js';

const LEDGER_TIMEOUT_MS = 8_000;
const MIN_LEDGER_SECRET_LENGTH = 32;
const MAX_LEDGER_CLOCK_SKEW_MS = 5 * 60 * 1000;

function codedError(message, statusCode, code) {
  const error = new AppError(message, statusCode);
  error.code = code;
  return error;
}

function safeHttpsUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function releaseSha(env = process.env) {
  return env.RAILWAY_GIT_COMMIT_SHA
    || env.VERCEL_GIT_COMMIT_SHA
    || env.GITHUB_SHA
    || env.RELEASE_SHA
    || null;
}

function signature(secret, timestamp, body) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
}


function identityHash(secret, value) {
  return crypto
    .createHmac('sha256', secret)
    .update(`account-closure-identity:${String(value)}`)
    .digest('hex');
}

function headerValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const expected = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === expected) return String(value);
  }
  return null;
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifySignedResponse(response, body, secret, now = Date.now()) {
  const timestamp = headerValue(response?.headers, 'x-genemap-ledger-timestamp');
  const supplied = headerValue(response?.headers, 'x-genemap-ledger-signature');
  const parsedTime = Date.parse(timestamp || '');
  if (!timestamp || !Number.isFinite(parsedTime) || Math.abs(now - parsedTime) > MAX_LEDGER_CLOCK_SKEW_MS) {
    throw codedError(
      'Deletion-ledger reconciliation received a missing, invalid, or stale response timestamp.',
      503,
      'ACCOUNT_DELETE_LEDGER_INVALID_SIGNATURE',
    );
  }
  const expected = `sha256=${signature(secret, timestamp, body)}`;
  if (!constantTimeEqual(supplied, expected)) {
    throw codedError(
      'Deletion-ledger reconciliation received an unauthenticated response.',
      503,
      'ACCOUNT_DELETE_LEDGER_INVALID_SIGNATURE',
    );
  }
}

async function fetchWithTimeout(fetchImpl, url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LEDGER_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function ledgerConfig(env = process.env) {
  const writeUrl = safeHttpsUrl(env.ACCOUNT_CLOSURE_LEDGER_WRITE_URL);
  const readUrl = safeHttpsUrl(env.ACCOUNT_CLOSURE_LEDGER_READ_URL);
  const secret = typeof env.ACCOUNT_CLOSURE_LEDGER_SECRET === 'string'
    ? env.ACCOUNT_CLOSURE_LEDGER_SECRET
    : '';
  return {
    writeUrl,
    readUrl,
    secret,
    configured: Boolean(
      writeUrl
      && readUrl
      && secret.length >= MIN_LEDGER_SECRET_LENGTH
    ),
  };
}

/**
 * Create the restore-independent deletion ledger client.
 *
 * Protocol contract:
 * - POST `ACCOUNT_CLOSURE_LEDGER_WRITE_URL` with an HMAC-signed JSON tombstone.
 * - GET `ACCOUNT_CLOSURE_LEDGER_READ_URL` returns an HMAC-signed JSON body,
 *   either an array or `{ tombstones: [...] }`, for quarantined restore
 *   reconciliation. The response signs `timestamp.rawBody`.
 * - Writes are idempotent by `receiptId` and `Idempotency-Key`.
 *
 * The payload contains only a secret-keyed user identifier hash, the deletion receipt, the
 * authorization timestamp, release identity, and completed billing counts. It
 * never sends the user's raw email, name, profile, search, or research data.
 */
export function createAccountClosureLedger({
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const config = ledgerConfig(env);
  const production = env.NODE_ENV === 'production';

  async function authorize(tombstone) {
    if (!config.configured || typeof fetchImpl !== 'function') {
      if (production) {
        throw codedError(
          'Account deletion is temporarily unavailable because the independent deletion ledger is not configured. Billing changes already completed, if any, were recorded; the account remains available for a safe retry.',
          503,
          'ACCOUNT_DELETE_LEDGER_UNAVAILABLE',
        );
      }
      return { mode: 'non_production_noop', recorded: false };
    }

    const userIdHash = tombstone.userIdHash || (tombstone.userId != null
      ? identityHash(config.secret, tombstone.userId)
      : null);
    if (typeof tombstone.receiptId !== 'string' || !tombstone.receiptId.trim()
      || typeof userIdHash !== 'string' || !/^[a-f0-9]{64}$/u.test(userIdHash)) {
      throw codedError(
        'Account deletion stopped because the independent deletion authorization was incomplete.',
        500,
        'ACCOUNT_DELETE_LEDGER_INVALID_TOMBSTONE',
      );
    }

    const payload = {
      version: 1,
      event: 'account_deletion_authorized',
      receiptId: tombstone.receiptId.trim(),
      userIdHash,
      actorMode: tombstone.actorMode,
      authorizedAt: tombstone.authorizedAt,
      releaseSha: tombstone.releaseSha || releaseSha(env),
      billing: {
        checkoutSessionsExpired: Number(tombstone.billing?.checkoutSessionsExpired || 0),
        subscriptionsCancelled: Number(tombstone.billing?.subscriptionsCancelled || 0),
      },
    };
    const body = JSON.stringify(payload);
    const timestamp = new Date().toISOString();
    let response;
    try {
      response = await fetchWithTimeout(fetchImpl, config.writeUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': payload.receiptId,
          'x-genemap-ledger-timestamp': timestamp,
          'x-genemap-ledger-signature': `sha256=${signature(config.secret, timestamp, body)}`,
        },
        body,
      });
    } catch (error) {
      throw codedError(
        'Account deletion stopped because the independent deletion ledger could not be reached. Billing changes already completed, if any, were recorded; the account remains available for a safe retry.',
        503,
        'ACCOUNT_DELETE_LEDGER_WRITE_FAILED',
      );
    }

    if (!response?.ok) {
      throw codedError(
        `Account deletion stopped because the independent deletion ledger returned HTTP ${response?.status || 'unknown'}. Billing changes already completed, if any, were recorded; the account remains available for a safe retry.`,
        503,
        'ACCOUNT_DELETE_LEDGER_WRITE_FAILED',
      );
    }
    return { mode: 'external', recorded: true, receiptId: payload.receiptId };
  }

  async function listTombstones() {
    if (!config.configured || typeof fetchImpl !== 'function') {
      throw codedError(
        'Deletion-ledger reconciliation cannot run because the external ledger is not configured.',
        503,
        'ACCOUNT_DELETE_LEDGER_UNAVAILABLE',
      );
    }
    const timestamp = new Date().toISOString();
    const body = '';
    let response;
    try {
      response = await fetchWithTimeout(fetchImpl, config.readUrl, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'x-genemap-ledger-timestamp': timestamp,
          'x-genemap-ledger-signature': `sha256=${signature(config.secret, timestamp, body)}`,
        },
      });
    } catch {
      throw codedError(
        'Deletion-ledger reconciliation could not reach the external ledger.',
        503,
        'ACCOUNT_DELETE_LEDGER_READ_FAILED',
      );
    }
    if (!response?.ok) {
      throw codedError(
        `Deletion-ledger reconciliation received HTTP ${response?.status || 'unknown'} from the external ledger.`,
        503,
        'ACCOUNT_DELETE_LEDGER_READ_FAILED',
      );
    }
    let rawBody;
    try {
      rawBody = await response.text();
    } catch {
      throw codedError(
        'Deletion-ledger reconciliation could not read the external ledger response.',
        503,
        'ACCOUNT_DELETE_LEDGER_INVALID_RESPONSE',
      );
    }
    verifySignedResponse(response, rawBody, config.secret);
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw codedError(
        'Deletion-ledger reconciliation received invalid JSON.',
        503,
        'ACCOUNT_DELETE_LEDGER_INVALID_RESPONSE',
      );
    }
    const tombstones = Array.isArray(payload) ? payload : payload?.tombstones;
    if (!Array.isArray(tombstones)) {
      throw codedError(
        'Deletion-ledger reconciliation received an invalid response contract.',
        503,
        'ACCOUNT_DELETE_LEDGER_INVALID_RESPONSE',
      );
    }
    return tombstones.filter((item) => (
      item
      && item.version === 1
      && item.event === 'account_deletion_authorized'
      && typeof item.receiptId === 'string'
      && typeof item.userIdHash === 'string'
    ));
  }

  return {
    configured: config.configured,
    writeUrl: config.writeUrl,
    readUrl: config.readUrl,
    authorize,
    listTombstones,
    hashIdentity: (value) => identityHash(config.secret, value),
  };
}

export function accountClosureLedgerStatus(env = process.env) {
  const config = ledgerConfig(env);
  return {
    configured: config.configured,
    writeUrlConfigured: Boolean(config.writeUrl),
    readUrlConfigured: Boolean(config.readUrl),
    secretConfigured: config.secret.length >= MIN_LEDGER_SECRET_LENGTH,
  };
}

export const __test = {
  constantTimeEqual,
  headerValue,
  identityHash,
  ledgerConfig,
  releaseSha,
  safeHttpsUrl,
  signature,
  verifySignedResponse,
};
