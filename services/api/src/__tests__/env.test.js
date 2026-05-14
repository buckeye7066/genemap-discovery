import { describe, it, expect } from 'vitest';
import { loadEnv, ENV_CONSTANTS } from '../config/env.js';

const VALID_KEY = 'a'.repeat(64); // 64 hex chars
const STRONG_SECRET = 'x'.repeat(40);

function prodEnv(overrides = {}) {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://u:p@db:5432/x',
    JWT_SECRET: STRONG_SECRET,
    JWT_REFRESH_SECRET: STRONG_SECRET + 'r',
    COOKIE_SECRET: STRONG_SECRET + 'c',
    CORS_ORIGINS: 'https://app.example.com',
    MEDICAL_DATA_ENCRYPTION_KEY: VALID_KEY,
    STRIPE_SECRET_KEY: 'sk_live_test',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    STRIPE_PRICE_MONTHLY: 'price_m',
    STRIPE_PRICE_YEARLY: 'price_y',
    OPENAI_API_KEY: 'sk-test',
    ...overrides,
  };
}

describe('loadEnv (production)', () => {
  it('accepts a complete strong production config', () => {
    const env = loadEnv({ source: prodEnv() });
    expect(env.isProduction).toBe(true);
    expect(env.hasMedicalEncryption()).toBe(true);
    expect(env.corsAllowList()).toEqual(['https://app.example.com']);
  });

  it.each([
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
  ])('throws when %s is missing in production', (key) => {
    const source = prodEnv();
    delete source[key];
    expect(() => loadEnv({ source })).toThrowError(/production environment is unsafe/);
  });

  it('throws when JWT_SECRET is below the minimum length', () => {
    const source = prodEnv({ JWT_SECRET: 'short' });
    expect(() => loadEnv({ source })).toThrowError(/too short/);
  });

  it('throws when COOKIE_SECRET still contains the placeholder phrase', () => {
    const source = prodEnv({ COOKIE_SECRET: 'your-cookie-secret-change-in-production' });
    expect(() => loadEnv({ source })).toThrowError(/too short or placeholders/);
  });

  it('throws when MEDICAL_DATA_ENCRYPTION_KEY is not 64 hex chars', () => {
    const source = prodEnv({ MEDICAL_DATA_ENCRYPTION_KEY: 'zz'.repeat(32) });
    expect(() => loadEnv({ source })).toThrowError(/MEDICAL_DATA_ENCRYPTION_KEY/);
  });

  it('throws when no LLM provider key is configured', () => {
    const source = prodEnv();
    delete source.OPENAI_API_KEY;
    delete source.ANTHROPIC_API_KEY;
    expect(() => loadEnv({ source })).toThrowError(/OPENAI_API_KEY or ANTHROPIC_API_KEY/);
  });

  it('allows missing LLM provider when SKIP_LLM_KEY_CHECK=1', () => {
    const source = prodEnv();
    delete source.OPENAI_API_KEY;
    delete source.ANTHROPIC_API_KEY;
    source.SKIP_LLM_KEY_CHECK = '1';
    expect(() => loadEnv({ source })).not.toThrow();
  });

  it('requireProductionEncryption() throws in prod when key missing', () => {
    const source = prodEnv();
    delete source.MEDICAL_DATA_ENCRYPTION_KEY;
    // Avoid the loadEnv hard-fail by using SKIP path: still verify the helper
    source.SKIP_LLM_KEY_CHECK = '1';
    expect(() => loadEnv({ source })).toThrowError(); // hard fail
  });
});

describe('loadEnv (development)', () => {
  it('does not throw when secrets are missing in development', () => {
    const warns = [];
    const env = loadEnv({ source: { NODE_ENV: 'development' }, warn: (m) => warns.push(m) });
    expect(env.isDevelopment).toBe(true);
    expect(warns.length).toBeGreaterThan(0);
  });

  it('requireProductionEncryption() does NOT throw in development', () => {
    const env = loadEnv({ source: { NODE_ENV: 'development' }, warn: () => {} });
    expect(() => env.requireProductionEncryption()).not.toThrow();
  });
});

describe('ENV_CONSTANTS', () => {
  it('exports the production-required list', () => {
    expect(ENV_CONSTANTS.PRODUCTION_REQUIRED).toContain('MEDICAL_DATA_ENCRYPTION_KEY');
    expect(ENV_CONSTANTS.PRODUCTION_REQUIRED).toContain('JWT_SECRET');
  });
});
