import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getEncryptionKey() {
  const keyHex = process.env.MEDICAL_DATA_ENCRYPTION_KEY;
  if (!keyHex) {
    console.warn(
      '[encryption] MEDICAL_DATA_ENCRYPTION_KEY is not set. ' +
      'Medical data will be stored unencrypted. ' +
      'Set a 32-byte hex string (64 hex characters) for production use.'
    );
    return null;
  }
  return Buffer.from(keyHex, 'hex');
}

export function encrypt(plaintext, key) {
  const encryptionKey = key || getEncryptionKey();
  if (!encryptionKey) {
    // Graceful degradation: return plaintext as-is for dev environments
    return plaintext;
  }

  const text = typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);

  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  const payload = JSON.stringify({
    iv: iv.toString('base64'),
    encryptedData: encrypted,
    authTag: authTag.toString('base64'),
  });

  return Buffer.from(payload).toString('base64');
}

export function decrypt(ciphertext, key) {
  const encryptionKey = key || getEncryptionKey();
  if (!encryptionKey) {
    // Graceful degradation: return ciphertext as-is for dev environments
    return ciphertext;
  }

  try {
    const payload = JSON.parse(Buffer.from(ciphertext, 'base64').toString('utf8'));
    const { iv, encryptedData, authTag } = payload;

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      encryptionKey,
      Buffer.from(iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));

    let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    // Try to parse as JSON; if it fails, return the raw string
    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  } catch (error) {
    // If decryption fails, the data may be unencrypted (pre-encryption migration)
    console.warn('[encryption] Failed to decrypt data, returning as-is:', error.message);
    return ciphertext;
  }
}
