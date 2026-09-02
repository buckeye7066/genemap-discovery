import crypto from 'node:crypto';
import path from 'node:path';
import {
  chmod,
  link,
  mkdir,
  open,
  readFile,
  readdir,
  stat,
  unlink,
} from 'node:fs/promises';

const RECEIPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const IDENTITY_KEY_ID = /^[A-Za-z0-9._-]{1,64}$/u;
const USER_ID_HASH = /^[a-f0-9]{64}$/u;
const ACTOR_MODES = new Set(['self_service', 'admin']);
const MAX_PAGE_SIZE = 1_000;
const MAX_BILLING_COUNT = 1_000_000;
const RECORD_SUFFIX = '.json';
const STORAGE_VERSION = 1;

export class LedgerValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LedgerValidationError';
    this.statusCode = 400;
    this.code = 'LEDGER_INVALID_TOMBSTONE';
  }
}

export class LedgerConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LedgerConflictError';
    this.statusCode = 409;
    this.code = 'LEDGER_RECEIPT_CONFLICT';
  }
}

export class LedgerIntegrityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LedgerIntegrityError';
    this.statusCode = 503;
    this.code = 'LEDGER_INTEGRITY_FAILURE';
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === [...expected].sort()[index]);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function validDate(value) {
  return typeof value === 'string'
    && value.length <= 64
    && Number.isFinite(Date.parse(value));
}

function validCount(value) {
  return Number.isInteger(value) && value >= 0 && value <= MAX_BILLING_COUNT;
}

export function validateTombstone(value) {
  const required = [
    'version',
    'event',
    'receiptId',
    'userIdHash',
    'identityKeyId',
    'actorMode',
    'authorizedAt',
    'releaseSha',
    'billing',
  ];
  if (!hasExactKeys(value, required)) {
    throw new LedgerValidationError('Tombstone fields do not match the version-2 contract.');
  }
  if (value.version !== 2 || value.event !== 'account_deletion_authorized') {
    throw new LedgerValidationError('Only version-2 account deletion authorizations are accepted.');
  }
  if (!RECEIPT_ID.test(value.receiptId)) {
    throw new LedgerValidationError('receiptId must be a UUID.');
  }
  if (!USER_ID_HASH.test(value.userIdHash)) {
    throw new LedgerValidationError('userIdHash must be a lowercase SHA-256/HMAC digest.');
  }
  if (!IDENTITY_KEY_ID.test(value.identityKeyId)) {
    throw new LedgerValidationError('identityKeyId is invalid.');
  }
  if (!ACTOR_MODES.has(value.actorMode)) {
    throw new LedgerValidationError('actorMode is invalid.');
  }
  if (!validDate(value.authorizedAt)) {
    throw new LedgerValidationError('authorizedAt must be an ISO-compatible timestamp.');
  }
  if (
    value.releaseSha !== null
    && (typeof value.releaseSha !== 'string' || !value.releaseSha.trim() || value.releaseSha.length > 128)
  ) {
    throw new LedgerValidationError('releaseSha must be null or a non-empty release identifier.');
  }
  if (
    !hasExactKeys(value.billing, ['checkoutSessionsExpired', 'subscriptionsCancelled'])
    || !validCount(value.billing.checkoutSessionsExpired)
    || !validCount(value.billing.subscriptionsCancelled)
  ) {
    throw new LedgerValidationError('billing must contain bounded, non-negative integer counts.');
  }

  // Detach the stored value from the request parser and normalize object-key
  // ordering. No raw account identity is accepted by this contract.
  return JSON.parse(canonicalJson(value));
}

function recordFilename(receiptId) {
  if (!RECEIPT_ID.test(receiptId)) throw new LedgerValidationError('Invalid receipt cursor.');
  return `${receiptId.toLowerCase()}${RECORD_SUFFIX}`;
}

function envelopeFor(payload) {
  return {
    storageVersion: STORAGE_VERSION,
    payload,
    payloadSha256: sha256(canonicalJson(payload)),
  };
}

function parseEnvelope(raw, filename) {
  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    throw new LedgerIntegrityError(`Stored tombstone ${filename} is not valid JSON.`);
  }
  if (!hasExactKeys(envelope, ['storageVersion', 'payload', 'payloadSha256'])) {
    throw new LedgerIntegrityError(`Stored tombstone ${filename} has an invalid envelope.`);
  }
  let payload;
  try {
    payload = validateTombstone(envelope.payload);
  } catch {
    throw new LedgerIntegrityError(`Stored tombstone ${filename} violates the tombstone contract.`);
  }
  if (
    envelope.storageVersion !== STORAGE_VERSION
    || envelope.payloadSha256 !== sha256(canonicalJson(payload))
    || filename !== recordFilename(payload.receiptId)
  ) {
    throw new LedgerIntegrityError(`Stored tombstone ${filename} failed its integrity check.`);
  }
  return payload;
}

async function syncDirectory(directory) {
  const handle = await open(directory, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function readStoredPayload(directory, filename) {
  let raw;
  try {
    raw = await readFile(path.join(directory, filename), 'utf8');
  } catch (error) {
    throw new LedgerIntegrityError(`Stored tombstone ${filename} could not be read (${error.code || 'unknown'}).`);
  }
  return parseEnvelope(raw, filename);
}

async function recordFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.pending-')) continue;
    if (!entry.isFile() || !entry.name.endsWith(RECORD_SUFFIX)) {
      throw new LedgerIntegrityError(`Unexpected entry in the dedicated ledger directory: ${entry.name}`);
    }
    const receiptId = entry.name.slice(0, -RECORD_SUFFIX.length);
    if (!RECEIPT_ID.test(receiptId)) {
      throw new LedgerIntegrityError(`Ledger record has an invalid filename: ${entry.name}`);
    }
    files.push(entry.name);
  }
  return files.sort();
}

export function createLedgerStore({ directory }) {
  if (!path.isAbsolute(directory)) {
    throw new TypeError('Ledger directory must be an absolute path.');
  }
  let initialized = false;
  let writeQueue = Promise.resolve();

  async function verifyAll() {
    const files = await recordFiles(directory);
    for (const filename of files) await readStoredPayload(directory, filename);
    return files.length;
  }

  async function initialize() {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    const info = await stat(directory);
    if (!info.isDirectory()) throw new LedgerIntegrityError('Ledger storage path is not a directory.');
    await verifyAll();
    initialized = true;
  }

  async function writeOnce(input) {
    if (!initialized) throw new LedgerIntegrityError('Ledger storage has not been initialized.');
    const payload = validateTombstone(input);
    const filename = recordFilename(payload.receiptId);
    const finalPath = path.join(directory, filename);

    try {
      const existing = await readFile(finalPath, 'utf8');
      const existingPayload = parseEnvelope(existing, filename);
      if (canonicalJson(existingPayload) !== canonicalJson(payload)) {
        throw new LedgerConflictError('receiptId already exists with different deletion data.');
      }
      return { created: false, payload: existingPayload };
    } catch (error) {
      if (error instanceof LedgerConflictError || error instanceof LedgerIntegrityError) throw error;
      if (error.code !== 'ENOENT') throw error;
    }

    const pendingPath = path.join(directory, `.pending-${payload.receiptId}-${crypto.randomUUID()}`);
    const serialized = `${JSON.stringify(envelopeFor(payload))}\n`;
    const handle = await open(pendingPath, 'wx', 0o600);
    try {
      await handle.writeFile(serialized, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }

    try {
      await link(pendingPath, finalPath);
      await syncDirectory(directory);
      return { created: true, payload };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existingPayload = await readStoredPayload(directory, filename);
      if (canonicalJson(existingPayload) !== canonicalJson(payload)) {
        throw new LedgerConflictError('receiptId already exists with different deletion data.');
      }
      return { created: false, payload: existingPayload };
    } finally {
      await unlink(pendingPath).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  }

  function write(input) {
    const operation = writeQueue.then(() => writeOnce(input));
    writeQueue = operation.catch(() => undefined);
    return operation;
  }

  async function list({ cursor = null, limit = MAX_PAGE_SIZE } = {}) {
    if (!initialized) throw new LedgerIntegrityError('Ledger storage has not been initialized.');
    const boundedLimit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(limit) || MAX_PAGE_SIZE));
    const files = await recordFiles(directory);
    const cursorFilename = cursor ? recordFilename(cursor) : null;
    const start = cursorFilename
      ? files.findIndex((filename) => filename > cursorFilename)
      : 0;
    const offset = start === -1 ? files.length : start;
    const pageFiles = files.slice(offset, offset + boundedLimit);
    const tombstones = [];
    for (const filename of pageFiles) {
      tombstones.push(await readStoredPayload(directory, filename));
    }
    const hasMore = offset + pageFiles.length < files.length;
    return {
      tombstones,
      nextCursor: hasMore && pageFiles.length
        ? pageFiles.at(-1).slice(0, -RECORD_SUFFIX.length)
        : null,
    };
  }

  return {
    initialize,
    list,
    verifyAll,
    write,
    get initialized() {
      return initialized;
    },
  };
}

export const __test = {
  ACTOR_MODES,
  MAX_PAGE_SIZE,
  RECEIPT_ID,
  canonicalJson,
  envelopeFor,
  parseEnvelope,
  recordFilename,
  validateTombstone,
};
