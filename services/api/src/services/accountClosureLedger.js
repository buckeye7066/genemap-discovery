import crypto from 'node:crypto';
import { AppError } from '../utils/errors.js';

const LEDGER_TIMEOUT_MS = 8_000;
const MIN_LEDGER_SECRET_LENGTH = 32;
const MAX_LEDGER_CLOCK_SKEW_MS = 5 * 60 * 1000;
const IDENTITY_KEY_ID = /^[A-Za-z0-9._-]{1,64}$/u;

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

/**
 * Parse `ACCOUNT_CLOSURE_LEDGER_IDENTITY_KEYS` as a comma-separated, ordered
 * key ring: `current-id=current-secret,retired-id=retired-secret`.
 *
 * The first entry is the sole write key. Retired entries remain read-only so a
 * deletion tombstone survives key rotation. The transport HMAC secret is kept
 * separate from this identity-key ring.
 */
function parseIdentityKeyConfig(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return { valid: false, keys: [], reason: 'missing' };
  }

  const entries = value.split(',').map((entry) => entry.trim()).filter(Boolean);
  const keys = [];
  const seen = new Set();
  for (const entry of entries) {
    const delimiter = entry.indexOf('=');
    if (delimiter <= 0) return { valid: false, keys: [], reason: 'invalid_entry' };
    const id = entry.slice(0, delimiter).trim();
    const secret = entry.slice(delimiter + 1).trim();
    if (!IDENTITY_KEY_ID.test(id) || secret.length < MIN_LEDGER_SECRET_LENGTH || seen.has(id)) {
      return { valid: false, keys: [], reason: 'invalid_entry' };
    }
    seen.add(id);
    keys.push({ id, secret });
  }

  return keys.length
    ? { valid: true, keys, reason: null }
    : { valid: false, keys: [], reason: 'missing' };
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

/** Keep the abort deadline active until the optional response consumer finishes. */
async function fetchWithTimeout(
  fetchImpl,
  url,
  options,
  { consume = null, timeoutMs = LEDGER_TIMEOUT_MS } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    if (typeof consume !== 'function') return response;
    const consumed = await consume(response);
    return { response, consumed };
  } finally {
    clearTimeout(timer);
  }
}

function ledgerConfig(env = process.env) {
  const writeUrl = safeHttpsUrl(env.ACCOUNT_CLOSURE_LEDGER_WRITE_URL);
  const readUrl = safeHttpsUrl(env.ACCOUNT_CLOSURE_LEDGER_READ_URL);
  const secret = (typeof env.ACCOUNT_CLOSURE_LEDGER_SECRET === 'string' && env.ACCOUNT_CLOSURE_LEDGER_SECRET.length >= MIN_LEDGER_SECRET_LENGTH)
    ? env.ACCOUNT_CLOSURE_LEDGER_SECRET
    : '';
  const identity = parseIdentityKeyConfig(env.ACCOUNT_CLOSURE_LEDGER_IDENTITY_KEYS);
  return {
    writeUrl,
    readUrl,
    secret,
    identityKeys: identity.keys,
    identityKeyConfigValid: identity.valid,
    configured: Boolean(
      writeUrl
      && readUrl
      && secret.length >= MIN_LEDGER_SECRET_LENGTH
      && identity.valid
    ),
  };
}

function identityCandidates(config, value) {
  const candidates = config.identityKeys.map((key) => ({
    identityKeyId: key.id,
    userIdHash: identityHash(key.secret, value),
  }));

  // Version-1 tombstones were keyed with the transport secret. Retain a
  // migration-only candidate so existing deletion receipts can still be
  // reconciled while all new writes use an explicit, rotation-safe key ID.
  if (config.secret.length >= MIN_LEDGER_SECRET_LENGTH) {
    const legacyHash = identityHash(config.secret, value);
    if (!candidates.some((candidate) => candidate.userIdHash === legacyHash)) {
      candidates.push({ identityKeyId: 'legacy-transport', userIdHash: legacyHash });
    }
  }
  return candidates;
}

function validateWriteAcknowledgement(response, rawBody, secret, receiptId) {
  try {
    verifySignedResponse(response, rawBody, secret);
  } catch {
    throw codedError(
      'Account deletion stopped because the independent deletion ledger did not authenticate its write acknowledgement. Billing changes already completed, if any, were recorded; the account remains available for a safe retry.',
      503,
      'ACCOUNT_DELETE_LEDGER_WRITE_FAILED',
    );
  }

  let acknowledgement;
  try {
    acknowledgement = JSON.parse(rawBody);
  } catch {
    throw codedError(
      'Account deletion stopped because the independent deletion ledger returned an invalid write acknowledgement. Billing changes already completed, if any, were recorded; the account remains available for a safe retry.',
      503,
      'ACCOUNT_DELETE_LEDGER_WRITE_FAILED',
    );
  }
  if (acknowledgement?.recorded !== true || acknowledgement?.receiptId !== receiptId) {
    throw codedError(
      'Account deletion stopped because the independent deletion ledger did not confirm the exact deletion receipt. Billing changes already completed, if any, were recorded; the account remains available for a safe retry.',
      503,
      'ACCOUNT_DELETE_LEDGER_WRITE_FAILED',
    );
  }
}

/**
 * Create the restore-independent deletion ledger client.
 *
 * Protocol contract:
 * - POST `ACCOUNT_CLOSURE_LEDGER_WRITE_URL` with an HMAC-signed JSON tombstone.
 * - A successful write returns an HMAC-signed JSON acknowledgement containing
 *   `{ "recorded": true, "receiptId": "..." }` for the exact receipt.
 * - GET `ACCOUNT_CLOSURE_LEDGER_READ_URL` returns an HMAC-signed JSON body,
 *   either an array or `{ tombstones: [...] }`, for quarantined restore
 *   reconciliation. The response signs `timestamp.rawBody`.
 * - Writes are idempotent by `receiptId` and `Idempotency-Key`.
 *
 * The payload contains only a rotation-safe, secret-keyed user identifier hash,
 * its key ID, the deletion receipt, authorization timestamp, release identity,
 * and completed billing counts. It never sends raw email, name, profile,
 * search, research, medical, or genomic content.
 */
export function createAccountClosureLedger({
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const config = ledgerConfig(env);
  const production = env.NODE_ENV === 'production';
  const currentIdentityKey = config.identityKeys[0] || null;

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

    const identityKeyId = tombstone.identityKeyId || currentIdentityKey.id;
    const userIdHash = tombstone.userIdHash || (tombstone.userId != null
      ? identityHash(currentIdentityKey.secret, tombstone.userId)
      : null);
    if (
      identityKeyId !== currentIdentityKey.id
      || typeof tombstone.receiptId !== 'string'
      || !tombstone.receiptId.trim()
      || typeof userIdHash !== 'string'
      || !/^[a-f0-9]{64}$/u.test(userIdHash)
    ) {
      throw codedError(
        'Account deletion stopped because the independent deletion authorization was incomplete.',
        500,
        'ACCOUNT_DELETE_LEDGER_INVALID_TOMBSTONE',
      );
    }

    const payload = {
      version: 2,
      event: 'account_deletion_authorized',
      receiptId: tombstone.receiptId.trim(),
      userIdHash,
      identityKeyId,
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
    let rawBody;
    try {
      ({ response, consumed: rawBody } = await fetchWithTimeout(
        fetchImpl,
        config.writeUrl,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': payload.receiptId,
            'x-genemap-ledger-timestamp': timestamp,
            'x-genemap-ledger-signature': `sha256=${signature(config.secret, timestamp, body)}`,
          },
          body,
        },
        { consume: (result) => (result?.ok ? result.text() : Promise.resolve('')) },
      ));
    } catch {
      throw codedError(
        'Account deletion stopped because the independent deletion ledger could not be reached or did not complete its response. Billing changes already completed, if any, were recorded; the account remains available for a safe retry.',
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
    validateWriteAcknowledgement(response, rawBody, config.secret, payload.receiptId);
    return {
      mode: 'external',
      recorded: true,
      receiptId: payload.receiptId,
      identityKeyId,
    };
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
    let rawBody;
    try {
      ({ response, consumed: rawBody } = await fetchWithTimeout(
        fetchImpl,
        config.readUrl,
        {
          method: 'GET',
          headers: {
            accept: 'application/json',
            'x-genemap-ledger-timestamp': timestamp,
            'x-genemap-ledger-signature': `sha256=${signature(config.secret, timestamp, body)}`,
          },
        },
        { consume: (result) => (result?.ok ? result.text() : Promise.resolve('')) },
      ));
    } catch {
      throw codedError(
        'Deletion-ledger reconciliation could not reach or finish reading the external ledger.',
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
    return tombstones.filter((item) => {
      if (!item || item.event !== 'account_deletion_authorized') return false;
      if (item.version !== 1 && item.version !== 2) return false;
      if (typeof item.receiptId !== 'string' || typeof item.userIdHash !== 'string') return false;
      if (!/^[a-f0-9]{64}$/u.test(item.userIdHash)) return false;
      return item.version === 1
        || (typeof item.identityKeyId === 'string' && IDENTITY_KEY_ID.test(item.identityKeyId));
    });
  }

  return {
    configured: config.configured,
    writeUrl: config.writeUrl,
    readUrl: config.readUrl,
    currentIdentityKeyId: currentIdentityKey?.id || null,
    identityKeyIds: config.identityKeys.map((key) => key.id),
    authorize,
    listTombstones,
    hashIdentity: (value) => currentIdentityKey
      ? identityHash(currentIdentityKey.secret, value)
      : null,
    hashIdentityCandidates: (value) => identityCandidates(config, value),
  };
}

export function accountClosureLedgerStatus(env = process.env) {
  const config = ledgerConfig(env);
  return {
    configured: config.configured,
    writeUrlConfigured: Boolean(config.writeUrl),
    readUrlConfigured: Boolean(config.readUrl),
    secretConfigured: config.secret.length >= MIN_LEDGER_SECRET_LENGTH,
    identityKeysConfigured: config.identityKeyConfigValid,
    currentIdentityKeyId: config.identityKeys[0]?.id || null,
    retiredIdentityKeyCount: Math.max(0, config.identityKeys.length - 1),
  };
}

export const __test = {
  constantTimeEqual,
  fetchWithTimeout,
  headerValue,
  identityCandidates,
  identityHash,
  ledgerConfig,
  parseIdentityKeyConfig,
  releaseSha,
  safeHttpsUrl,
  signature,
  validateWriteAcknowledgement,
  verifySignedResponse,
};
