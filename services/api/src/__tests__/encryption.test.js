import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encrypt, decrypt, generateKey } from '../utils/encryption.js';

const TEST_KEY = 'b'.repeat(64);
const SAMPLE_PHI = { mrn: '1234567', diagnosis: 'BRCA1+', notes: 'sensitive plain text' };

describe('encryption (with valid key)', () => {
  beforeEach(() => {
    process.env.MEDICAL_DATA_ENCRYPTION_KEY = TEST_KEY;
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    delete process.env.MEDICAL_DATA_ENCRYPTION_KEY;
  });

  it('encrypts then decrypts an object roundtrip', () => {
    const ct = encrypt(SAMPLE_PHI);
    expect(ct).toBeTypeOf('string');
    expect(ct).not.toContain('1234567');
    expect(ct).not.toContain('BRCA1+');
    const pt = decrypt(ct);
    expect(pt).toEqual(SAMPLE_PHI);
  });

  it('produces different ciphertext for the same plaintext (random IV)', () => {
    const a = encrypt('the same input');
    const b = encrypt('the same input');
    expect(a).not.toEqual(b);
  });

  it('throws if ciphertext has been tampered with', () => {
    const ct = encrypt('hello world');
    // Decode the envelope, flip a bit in the ciphertext, re-encode.
    const envelope = JSON.parse(Buffer.from(ct, 'base64').toString('utf8'));
    const ctBuf = Buffer.from(envelope.ct, 'base64');
    ctBuf[0] = ctBuf[0] ^ 0x01;
    envelope.ct = ctBuf.toString('base64');
    const tampered = Buffer.from(JSON.stringify(envelope)).toString('base64');
    expect(() => decrypt(tampered)).toThrowError(/decryption failed/);
  });

  it('passes through non-envelope strings unchanged (legacy plaintext)', () => {
    expect(decrypt('plain legacy value')).toBe('plain legacy value');
  });

  it('rejects an invalid key length', () => {
    process.env.MEDICAL_DATA_ENCRYPTION_KEY = 'deadbeef';
    expect(() => encrypt('x')).toThrowError(/64-character hex/);
  });
});

describe('encryption fail-closed in production', () => {
  beforeEach(() => {
    delete process.env.MEDICAL_DATA_ENCRYPTION_KEY;
    process.env.NODE_ENV = 'production';
  });

  afterEach(() => {
    process.env.NODE_ENV = 'test';
  });

  it('throws when encrypting in production without a key', () => {
    expect(() => encrypt('phi')).toThrowError(/required in production/);
  });

  it('throws when decrypting an envelope in production without a key', () => {
    process.env.NODE_ENV = 'test';
    process.env.MEDICAL_DATA_ENCRYPTION_KEY = TEST_KEY;
    const ct = encrypt('phi');
    delete process.env.MEDICAL_DATA_ENCRYPTION_KEY;
    process.env.NODE_ENV = 'production';
    expect(() => decrypt(ct)).toThrowError(/required in production/);
  });
});

describe('encryption permissive in development', () => {
  beforeEach(() => {
    delete process.env.MEDICAL_DATA_ENCRYPTION_KEY;
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    process.env.NODE_ENV = 'test';
  });

  it('returns plaintext when no key is configured (with warning)', () => {
    const result = encrypt('not secret in dev');
    expect(result).toBe('not secret in dev');
  });
});

describe('generateKey', () => {
  it('returns 64 hex chars', () => {
    const k = generateKey();
    expect(k).toMatch(/^[0-9a-f]{64}$/);
  });
});
