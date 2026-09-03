import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  throw new Error('Environment variables JWT_SECRET and JWT_REFRESH_SECRET must be set for JWT operations. Please ensure these are configured correctly.');
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function generateAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

export function generateRefreshToken(payload) {
  // Always include a random `jti` so two refresh tokens minted in the
  // same second are not byte-identical (rotation needs distinct tokens).
  const withJti = { ...payload, jti: crypto.randomBytes(16).toString('hex') };
  return jwt.sign(withJti, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    console.error('Access token verification failed:', error.message);
    return null;
  }
}

export function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET);
  } catch (error) {
    return null;
  }
}

export async function hashRefreshToken(token) {
  // bcrypt ignores bytes after the 72nd byte. JWT refresh tokens for the same
  // user share that prefix, so bcrypt can treat two distinct rotations as the
  // same credential. HMAC the complete token instead; the prefix makes the
  // storage format explicit.
  const digest = crypto
    .createHmac('sha256', JWT_REFRESH_SECRET)
    .update(token, 'utf8')
    .digest('hex');
  return `hmac-sha256:${digest}`;
}

export async function verifyRefreshTokenHash(token, hash) {
  if (typeof token !== 'string' || typeof hash !== 'string') return false;

  if (hash.startsWith('hmac-sha256:')) {
    const expected = await hashRefreshToken(token);
    const actualBuffer = Buffer.from(hash, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    return actualBuffer.length === expectedBuffer.length
      && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
  }

  // Legacy bcrypt refresh hashes are deliberately rejected. They cannot
  // safely distinguish tokens with a shared 72-byte prefix, so accepting them
  // would retain a replay window. Existing users reauthenticate once instead.
  return false;
}
