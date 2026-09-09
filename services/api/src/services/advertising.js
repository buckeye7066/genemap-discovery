import crypto from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { ForbiddenError, ValidationError } from '../utils/errors.js';

// Operator-pinned immutable account ID. No email, role, signup, or first-user fallback.
export function isAdvertisingOwner(user, env = process.env) {
  const id = env.ADVERTISING_OWNER_USER_ID?.trim();
  return Boolean(id && user?.userId === id && user?.role === 'super_admin');
}
export async function requireAdvertisingOwner(request) {
  if (!isAdvertisingOwner(request.user)) throw new ForbiddenError('Owner access required');
}
export const creativeInput = z.object({
  advertiser: z.string().trim().min(1).max(100),
  headline: z.string().trim().min(1).max(160),
  body: z.string().trim().max(1000),
  targetUrl: z.string().max(2048).url().refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  }, 'Use an HTTPS link without credentials'),
  seconds: z.number().int().min(5).max(300),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  paused: z.boolean(),
}).strict().refine((value) => new Date(value.endsAt) > new Date(value.startsAt), 'End must follow start');
export function creativeData(input) {
  const parsed = creativeInput.parse(input);
  return { ...parsed, startsAt: new Date(parsed.startsAt), endsAt: new Date(parsed.endsAt) };
}
export const publicFields = { id: true, advertiser: true, headline: true, body: true, targetUrl: true, seconds: true, startsAt: true, endsAt: true, paused: true, revision: true };
export const activeWhere = (now = new Date()) => ({ paused: false, deletedAt: null, startsAt: { lte: now }, endsAt: { gt: now } });
export async function rasterImage(value) {
  if (typeof value !== 'string' || value.length > 2_800_000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new ValidationError('Upload a PNG, JPEG, or WebP image under 2 MB');
  }
  const bytes = Buffer.from(value.slice(value.indexOf(',') + 1), 'base64');
  if (bytes.length > 2 * 1024 * 1024) throw new ValidationError('Image exceeds 2 MB');
  try {
    const source = sharp(bytes, { limitInputPixels: 16_777_216, animated: true, failOn: 'warning' });
    const metadata = await source.metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format) || (metadata.pages || 1) !== 1 || !metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096) throw new Error('dimensions');
    // Decode and re-encode: strips metadata, embedded markup, and trailing payloads.
    const image = await source.rotate().webp({ quality: 85 }).toBuffer();
    if (image.length > 2 * 1024 * 1024) throw new Error('size');
    return image;
  } catch {
    throw new ValidationError('Image must be a valid still raster, at most 4096 × 4096');
  }
}
export function viewerHash(viewer, secret) {
  return crypto.createHmac('sha256', secret).update(`advertising-viewer:${viewer}`).digest('hex');
}
export function signDisplay(value, secret) {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${payload}.${crypto.createHmac('sha256', secret).update(`advertising-display:${payload}`).digest('base64url')}`;
}
export function verifyDisplay(ticket, secret, now = Date.now()) {
  try {
    const [payload, signature, extra] = ticket.split('.');
    if (extra || ticket.length > 1500) return null;
    const expected = crypto.createHmac('sha256', secret).update(`advertising-display:${payload}`).digest();
    const supplied = Buffer.from(signature, 'base64url');
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
    const value = JSON.parse(Buffer.from(payload, 'base64url'));
    if (!Number.isFinite(value.at) || now < value.at + 1000 || now > value.at + 600_000) return null;
    return value;
  } catch { return null; }
}
