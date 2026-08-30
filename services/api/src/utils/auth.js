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
  return bcrypt.hash(token, 10);
}

export async function verifyRefreshTokenHash(token, hash) {
  return bcrypt.compare(token, hash);
}
