/**
 * Centralized environment validation for @genemap/api.
 *
 * Goals (production-readiness pass):
 *  - Single source of truth for required env vars.
 *  - Hard fail at startup in production when required secrets are missing
 *    or below minimum entropy thresholds.
 *  - In non-production, log warnings but allow degraded operation so local
 *    dev / tests can still run without a fully-loaded environment.
 *  - No env value is logged in clear; only names/lengths.
 *
 * Usage:
 *   import { loadEnv } from './config/env.js';
 *   const env = loadEnv();          // throws in prod if required vars missing
 *   env.requireProductionEncryption(); // explicit fail-closed for medical data
 */

import { z } from 'zod';

// Minimum length for any cryptographic secret used by the app.
// 32 chars ≈ 192 bits of entropy if base64/hex; below this is unsafe.
const MIN_SECRET_LENGTH = 32;

// 32 bytes = 64 hex chars for AES-256-GCM key.
const MEDICAL_KEY_HEX_LENGTH = 64;

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  LOG_LEVEL: z.string().optional(),

  // Database
  DATABASE_URL: z.string().min(1).optional(),

  // Redis (optional) — shared rate-limit store for horizontal scaling.
  // Unset = per-instance in-memory rate limiting (fine for a single replica).
  REDIS_URL: z.string().min(1).optional(),

  // Auth secrets (length-checked further below for production)
  JWT_SECRET: z.string().min(1).optional(),
  JWT_REFRESH_SECRET: z.string().min(1).optional(),
  COOKIE_SECRET: z.string().min(1).optional(),

  // CORS
  CORS_ORIGINS: z.string().optional(),

  // Sensitive data encryption (must be 64-hex AES-256-GCM key in prod)
  MEDICAL_DATA_ENCRYPTION_KEY: z.string().optional(),

  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_MONTHLY: z.string().optional(),
  STRIPE_PRICE_YEARLY: z.string().optional(),
  // Institutional plans must be configured in production. Without these,
  // /billing/institutional-checkout would silently checkout against a
  // placeholder price ID and create a license linked to a non-existent
  // Stripe product.
  STRIPE_PRICE_TEAM_MONTHLY: z.string().optional(),
  STRIPE_PRICE_TEAM_YEARLY: z.string().optional(),
  STRIPE_PRICE_DEPT_MONTHLY: z.string().optional(),
  STRIPE_PRICE_DEPT_YEARLY: z.string().optional(),
  STRIPE_PRICE_ENT_MONTHLY: z.string().optional(),
  STRIPE_PRICE_ENT_YEARLY: z.string().optional(),

  // LLM providers
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  LLM_TEXT_PROVIDER: z.string().optional(),
  LLM_IMAGE_PROVIDER: z.string().optional(),

  // Admin allowlist (comma-separated emails)
  ADMIN_EMAILS: z.string().optional(),

  // CSRF
  CSRF_SECRET: z.string().optional(),
});

const PRODUCTION_REQUIRED = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'COOKIE_SECRET',
  'CORS_ORIGINS',
  'MEDICAL_DATA_ENCRYPTION_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_MONTHLY',
  'STRIPE_PRICE_YEARLY',
  'STRIPE_PRICE_TEAM_MONTHLY',
  'STRIPE_PRICE_TEAM_YEARLY',
  'STRIPE_PRICE_DEPT_MONTHLY',
  'STRIPE_PRICE_DEPT_YEARLY',
  'STRIPE_PRICE_ENT_MONTHLY',
  'STRIPE_PRICE_ENT_YEARLY',
];

// At least one LLM provider key must be configured in production if any
// LLM-backed routes are mounted (callers can opt-out via SKIP_LLM_KEY_CHECK=1
// for narrow internal deployments that intentionally disable LLM features).
function hasLLMProvider(env, source) {
  if (source.SKIP_LLM_KEY_CHECK === '1') return true;
  return Boolean(env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY);
}

function isWeakSecret(value) {
  if (!value) return true;
  if (value.length < MIN_SECRET_LENGTH) return true;
  // Reject obvious placeholders that often slip into prod from .env.example
  const lowered = value.toLowerCase();
  if (lowered.includes('change-in-production')) return true;
  if (lowered.includes('your-') && lowered.includes('-secret')) return true;
  if (lowered === 'test-cookie-secret') return true;
  return false;
}

function isValidMedicalKey(value) {
  if (!value) return false;
  if (value.length !== MEDICAL_KEY_HEX_LENGTH) return false;
  return /^[0-9a-f]+$/i.test(value);
}

function isValidStripePriceId(value) {
  if (!value) return false;
  if (!/^price_[A-Za-z0-9_]{6,}$/.test(value)) return false;
  return !/^price_(your|monthly|yearly|team|dept|department|ent|enterprise|id)/i.test(value);
}

function isValidStripeLiveSecret(value) {
  return typeof value === 'string' && value.startsWith('sk_live_') && value.length > 'sk_live_'.length + 8;
}

function isValidStripeWebhookSecret(value) {
  return typeof value === 'string' && value.startsWith('whsec_') && value.length > 'whsec_'.length + 8;
}

/**
 * Load + validate the runtime environment.
 *
 * @param {object} [opts]
 * @param {NodeJS.ProcessEnv} [opts.source] - override (defaults to process.env)
 * @param {(msg: string) => void} [opts.warn] - log sink for non-fatal issues
 * @returns {object} parsed env + helpers
 */
export function loadEnv(opts = {}) {
  const source = opts.source || process.env;
  const warn = opts.warn || ((msg) => console.warn(`[env] ${msg}`));

  const parsed = baseSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new Error(`[env] invalid environment: ${issues}`);
  }
  const env = parsed.data;
  const isProd = env.NODE_ENV === 'production';

  const missing = [];
  const weak = [];

  if (isProd) {
    for (const key of PRODUCTION_REQUIRED) {
      if (!env[key]) missing.push(key);
    }
    for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'COOKIE_SECRET']) {
      if (env[key] && isWeakSecret(env[key])) weak.push(key);
    }
    if (env.MEDICAL_DATA_ENCRYPTION_KEY && !isValidMedicalKey(env.MEDICAL_DATA_ENCRYPTION_KEY)) {
      weak.push('MEDICAL_DATA_ENCRYPTION_KEY (must be 64 hex characters / 32 bytes)');
    }
    if (env.STRIPE_SECRET_KEY && !isValidStripeLiveSecret(env.STRIPE_SECRET_KEY)) {
      weak.push('STRIPE_SECRET_KEY (must be a live-mode sk_live_ key for production)');
    }
    if (env.STRIPE_WEBHOOK_SECRET && !isValidStripeWebhookSecret(env.STRIPE_WEBHOOK_SECRET)) {
      weak.push('STRIPE_WEBHOOK_SECRET (must be a Stripe whsec_ signing secret)');
    }
    for (const key of [
      'STRIPE_PRICE_MONTHLY',
      'STRIPE_PRICE_YEARLY',
      'STRIPE_PRICE_TEAM_MONTHLY',
      'STRIPE_PRICE_TEAM_YEARLY',
      'STRIPE_PRICE_DEPT_MONTHLY',
      'STRIPE_PRICE_DEPT_YEARLY',
      'STRIPE_PRICE_ENT_MONTHLY',
      'STRIPE_PRICE_ENT_YEARLY',
    ]) {
      if (env[key] && !isValidStripePriceId(env[key])) {
        weak.push(`${key} (must be a real Stripe price_ id, not a placeholder)`);
      }
    }
    if (!hasLLMProvider(env, source)) {
      missing.push('OPENAI_API_KEY or ANTHROPIC_API_KEY (set SKIP_LLM_KEY_CHECK=1 to bypass)');
    }
  } else {
    // dev/test: warn but do not throw
    for (const key of PRODUCTION_REQUIRED) {
      if (!env[key]) warn(`${key} is not set (allowed in ${env.NODE_ENV}, REQUIRED in production)`);
    }
    if (env.MEDICAL_DATA_ENCRYPTION_KEY && !isValidMedicalKey(env.MEDICAL_DATA_ENCRYPTION_KEY)) {
      warn('MEDICAL_DATA_ENCRYPTION_KEY is set but is not 64 hex characters; will be rejected in production');
    }
    if (env.STRIPE_SECRET_KEY && env.STRIPE_SECRET_KEY.startsWith('sk_live_') === false) {
      warn('STRIPE_SECRET_KEY is not a live-mode key; this is allowed outside production only');
    }
  }

  if (missing.length > 0 || weak.length > 0) {
    const parts = [];
    if (missing.length > 0) parts.push(`missing required vars: ${missing.join(', ')}`);
    if (weak.length > 0) {
      parts.push(`secrets too short or placeholders (need >= ${MIN_SECRET_LENGTH} chars): ${weak.join(', ')}`);
    }
    const message = `[env] production environment is unsafe — ${parts.join('; ')}`;
    if (isProd) {
      throw new Error(message);
    }
  }

  return {
    ...env,
    isProduction: isProd,
    isDevelopment: env.NODE_ENV === 'development',
    isTest: env.NODE_ENV === 'test',

    /**
     * Throws in production if MEDICAL_DATA_ENCRYPTION_KEY is missing.
     * Use at the boundary of any sensitive-data write path.
     */
    requireProductionEncryption() {
      if (isProd && !isValidMedicalKey(env.MEDICAL_DATA_ENCRYPTION_KEY)) {
        throw new Error(
          '[env] MEDICAL_DATA_ENCRYPTION_KEY is required in production for medical/genomic data writes; ' +
          'production must never store plaintext medical data.'
        );
      }
    },

    hasMedicalEncryption() {
      return isValidMedicalKey(env.MEDICAL_DATA_ENCRYPTION_KEY);
    },

    corsAllowList() {
      const raw = env.CORS_ORIGINS || (isProd ? '' : 'http://localhost:5173');
      const list = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      // Capacitor mobile app (com.genemap.discovery) origins — always
      // allowed, in code so a CORS_ORIGINS env edit can't silently break
      // mobile login. Cookies already honor CROSS_ORIGIN_COOKIES
      // (SameSite=None; Secure) and CSRF is token-based (HMAC double-submit),
      // so no new CSRF surface is opened by trusting these origins.
      for (const o of ['https://localhost', 'capacitor://localhost']) {
        if (!list.includes(o)) list.push(o);
      }
      return list;
    },

    adminEmails() {
      const raw = env.ADMIN_EMAILS || '';
      return raw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    },
  };
}

// Constants exported for tests.
export const ENV_CONSTANTS = {
  MIN_SECRET_LENGTH,
  MEDICAL_KEY_HEX_LENGTH,
  PRODUCTION_REQUIRED,
};
