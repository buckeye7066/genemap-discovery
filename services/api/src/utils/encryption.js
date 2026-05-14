/**
 * Symmetric encryption helpers for sensitive data at rest.
 *
 * Threat model:
 *  - Production must NEVER store plaintext medical/genomic data.
 *  - Without a 32-byte (64 hex char) MEDICAL_DATA_ENCRYPTION_KEY, the
 *    encryption layer fails closed in production by throwing — no graceful
 *    plaintext fallback, no silent downgrade.
 *  - In development/test, plaintext fallback is allowed but emits a clear
 *    warning so the operator notices.
 *  - Plaintext values are never logged.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM standard
const KEY_BYTE_LENGTH = 32;

let warnedMissingKey = false;

function isProd() {
  return process.env.NODE_ENV === 'production';
}

function getEncryptionKey() {
  const keyHex = process.env.MEDICAL_DATA_ENCRYPTION_KEY;
  if (!keyHex) {
    if (isProd()) {
      // Hard fail in production — caller (or env validator) must catch.
      throw new Error(
        '[encryption] MEDICAL_DATA_ENCRYPTION_KEY is required in production. ' +
        'Refusing to write or read sensitive data without a configured key.'
      );
    }
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.warn(
        '[encryption] MEDICAL_DATA_ENCRYPTION_KEY is not set; ' +
        'sensitive data is being stored as PLAINTEXT (development/test only).'
      );
    }
    return null;
  }
  if (!/^[0-9a-f]{64}$/i.test(keyHex)) {
    throw new Error(
      '[encryption] MEDICAL_DATA_ENCRYPTION_KEY must be a 64-character hex string ' +
      `(32 bytes for AES-256-GCM); got length=${keyHex.length}.`
    );
  }
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== KEY_BYTE_LENGTH) {
    throw new Error(`[encryption] decoded key must be ${KEY_BYTE_LENGTH} bytes; got ${key.length}.`);
  }
  return key;
}

/**
 * Encrypt a value (string or JSON-serializable object) for at-rest storage.
 * Returns a base64-encoded JSON envelope { iv, ct, tag }.
 *
 * In development/test without a key, returns the original value untouched
 * so callers do not need to branch — production refuses this path entirely.
 */
export function encrypt(plaintext, key) {
  const encryptionKey = key || getEncryptionKey();
  if (!encryptionKey) {
    return plaintext;
  }

  const text = typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);

  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  const envelope = {
    v: 1,
    iv: iv.toString('base64'),
    ct: encrypted,
    tag: authTag.toString('base64'),
  };
  return Buffer.from(JSON.stringify(envelope)).toString('base64');
}

function looksLikeEnvelope(value) {
  if (typeof value !== 'string') return false;
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
    return decoded && typeof decoded === 'object' && 'iv' in decoded && ('ct' in decoded || 'encryptedData' in decoded);
  } catch {
    return false;
  }
}

/**
 * Decrypt a value previously produced by `encrypt`. If the value is not an
 * encrypted envelope (legacy plaintext rows from before encryption was
 * deployed), returns it unchanged.
 */
export function decrypt(ciphertext, key) {
  // Pass-through non-string values (e.g. Prisma JSON columns) unchanged.
  if (typeof ciphertext !== 'string') return ciphertext;
  if (!looksLikeEnvelope(ciphertext)) return ciphertext;

  const encryptionKey = key || getEncryptionKey();
  if (!encryptionKey) {
    // Without a key in dev/test we cannot decrypt — return as-is.
    return ciphertext;
  }

  try {
    const envelope = JSON.parse(Buffer.from(ciphertext, 'base64').toString('utf8'));
    const iv = Buffer.from(envelope.iv, 'base64');
    const ct = envelope.ct ?? envelope.encryptedData;
    const tag = Buffer.from(envelope.tag ?? envelope.authTag, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(ct, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  } catch (error) {
    // NEVER include the ciphertext or any decoded fragment in the log.
    console.warn('[encryption] decryption failed:', error.message);
    throw new Error('[encryption] decryption failed for sensitive record');
  }
}

/** Generates a random 64-hex-char key suitable for MEDICAL_DATA_ENCRYPTION_KEY. */
export function generateKey() {
  return crypto.randomBytes(KEY_BYTE_LENGTH).toString('hex');
}
