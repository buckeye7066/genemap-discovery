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
      return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
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
