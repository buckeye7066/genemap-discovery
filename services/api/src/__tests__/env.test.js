import { describe, it, expect } from 'vitest';
import { loadEnv, ENV_CONSTANTS } from '../config/env.js';

const VALID_KEY = 'a'.repeat(64); // 64 hex chars
const STRONG_SECRET = 'x'.repeat(40);
const LEDGER_IDENTITY_KEYS = `2026-08=${'i'.repeat(40)},2026-01=${'r'.repeat(40)}`;

function prodEnv(overrides = {}) {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://u:p@db:5432/x',
    JWT_SECRET: STRONG_SECRET,
    JWT_REFRESH_SECRET: STRONG_SECRET + 'r',
    COOKIE_SECRET: STRONG_SECRET + 'c',
    CORS_ORIGINS: 'https://app.example.com',
    MEDICAL_DATA_ENCRYPTION_KEY: VALID_KEY,
    STRIPE_SECRET_KEY: 'sk_live_123456789abcdef',
    STRIPE_WEBHOOK_SECRET: 'whsec_123456789abcdef',
    STRIPE_PRICE_MONTHLY: 'price_123456monthly',
    STRIPE_PRICE_YEARLY: 'price_123456yearly',
    STRIPE_PRICE_TEAM_MONTHLY: 'price_123456teamMonthly',
    STRIPE_PRICE_TEAM_YEARLY: 'price_123456teamYearly',
    STRIPE_PRICE_DEPT_MONTHLY: 'price_123456deptMonthly',
    STRIPE_PRICE_DEPT_YEARLY: 'price_123456deptYearly',
    STRIPE_PRICE_ENT_MONTHLY: 'price_123456entMonthly',
    STRIPE_PRICE_ENT_YEARLY: 'price_123456entYearly',
    OPENAI_API_KEY: 'sk-proj-test-fixture-012345678901234567890',
    LLM_TEXT_MODEL: 'gpt-4o-mini',
    ACCOUNT_CLOSURE_LEDGER_WRITE_URL: 'https://ledger.example.invalid/write',
    ACCOUNT_CLOSURE_LEDGER_READ_URL: 'https://ledger.example.invalid/read',
    ACCOUNT_CLOSURE_LEDGER_SECRET: 'l'.repeat(40),
    ACCOUNT_CLOSURE_LEDGER_IDENTITY_KEYS: LEDGER_IDENTITY_KEYS,
    ...overrides,
  };
}

describe('loadEnv (production)', () => {
  it('accepts a complete strong production config', () => {
    const env = loadEnv({ source: prodEnv() });
    expect(env.isProduction).toBe(true);
    expect(env.hasMedicalEncryption()).toBe(true);
    expect(env.accountClosureLedgerConfigured()).toBe(true);
    // Capacitor mobile origins are always appended (see corsAllowList).
    expect(env.corsAllowList()).toEqual(['https://app.example.com', 'https://localhost', 'capacitor://localhost']);
  });

  it('recognizes a complete HTTPS deletion-ledger configuration', () => {
    const env = loadEnv({ source: prodEnv({
      ACCOUNT_CLOSURE_LEDGER_WRITE_URL: 'https://ledger.example.invalid/write',
      ACCOUNT_CLOSURE_LEDGER_READ_URL: 'https://ledger.example.invalid/read',
      ACCOUNT_CLOSURE_LEDGER_SECRET: 'l'.repeat(40),
      ACCOUNT_CLOSURE_LEDGER_IDENTITY_KEYS: LEDGER_IDENTITY_KEYS,
    }) });
    expect(env.accountClosureLedgerConfigured()).toBe(true);
  });

  it.each([
    'ACCOUNT_CLOSURE_LEDGER_WRITE_URL',
    'ACCOUNT_CLOSURE_LEDGER_READ_URL',
    'ACCOUNT_CLOSURE_LEDGER_SECRET',
    'ACCOUNT_CLOSURE_LEDGER_IDENTITY_KEYS',
  ])('throws when %s is missing in production', (key) => {
    const source = prodEnv();
    delete source[key];
    expect(() => loadEnv({ source })).toThrowError(new RegExp(key));
  });

  it('rejects HTTP deletion-ledger endpoints in production', () => {
    expect(() => loadEnv({ source: prodEnv({
      ACCOUNT_CLOSURE_LEDGER_WRITE_URL: 'http://ledger.example.invalid/write',
    }) })).toThrowError(/ACCOUNT_CLOSURE_LEDGER_WRITE_URL/);
  });

  it('rejects example deletion-ledger secrets in production', () => {
    expect(() => loadEnv({ source: prodEnv({
      ACCOUNT_CLOSURE_LEDGER_SECRET: 'REPLACE_WITH_32_PLUS_CHAR_RANDOM_TRANSPORT_SECRET',
    }) })).toThrowError(/ACCOUNT_CLOSURE_LEDGER_SECRET/);
    expect(() => loadEnv({ source: prodEnv({
      ACCOUNT_CLOSURE_LEDGER_IDENTITY_KEYS: `current=${'REPLACE_WITH_32_PLUS_CHAR_IDENTITY_KEY'}`,
    }) })).toThrowError(/ACCOUNT_CLOSURE_LEDGER_IDENTITY_KEYS/);
  });

  it.each([
    '',
    `bad id=${'i'.repeat(40)}`,
    `duplicate=${'i'.repeat(40)},duplicate=${'r'.repeat(40)}`,
    'current=short',
  ])('rejects an invalid deletion-ledger identity key ring at production startup: %s', (keyRing) => {
    expect(() => loadEnv({ source: prodEnv({
      ACCOUNT_CLOSURE_LEDGER_WRITE_URL: 'https://ledger.example.invalid/write',
      ACCOUNT_CLOSURE_LEDGER_READ_URL: 'https://ledger.example.invalid/read',
      ACCOUNT_CLOSURE_LEDGER_SECRET: 'l'.repeat(40),
      ACCOUNT_CLOSURE_LEDGER_IDENTITY_KEYS: keyRing,
    }) })).toThrowError(/ACCOUNT_CLOSURE_LEDGER_IDENTITY_KEYS/);
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

  it('throws when production Stripe uses test-mode credentials', () => {
    const source = prodEnv({ STRIPE_SECRET_KEY: 'sk_test_123456789abcdef' });
    expect(() => loadEnv({ source })).toThrowError(/STRIPE_SECRET_KEY/);
  });

  it('throws when production Stripe price ids are placeholders', () => {
    const source = prodEnv({ STRIPE_PRICE_MONTHLY: 'price_monthly' });
    expect(() => loadEnv({ source })).toThrowError(/STRIPE_PRICE_MONTHLY/);
  });

  it('throws when no LLM provider key is configured', () => {
    const source = prodEnv();
    delete source.OPENAI_API_KEY;
    delete source.ANTHROPIC_API_KEY;
    expect(() => loadEnv({ source })).toThrowError(/OPENAI_API_KEY for LLM_TEXT_PROVIDER=openai/);
  });

  it('requires the key for the selected model provider', () => {
    expect(() => loadEnv({ source: prodEnv({
      LLM_TEXT_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: undefined,
    }) })).toThrowError(/ANTHROPIC_API_KEY for LLM_TEXT_PROVIDER=anthropic/);

    const env = loadEnv({ source: prodEnv({
      LLM_TEXT_PROVIDER: 'anthropic',
      OPENAI_API_KEY: undefined,
      ANTHROPIC_API_KEY: 'sk-ant-api03-test-fixture-012345678901234567890',
      LLM_TEXT_MODEL: 'claude-sonnet-5',
    }) });
    expect(env.LLM_TEXT_PROVIDER).toBe('anthropic');
  });

  it('requires an explicit model compatible with the selected provider', () => {
    const missingModel = prodEnv();
    delete missingModel.LLM_TEXT_MODEL;
    expect(() => loadEnv({ source: missingModel })).toThrowError(/LLM_TEXT_MODEL/);

    expect(() => loadEnv({ source: prodEnv({
      LLM_TEXT_PROVIDER: 'anthropic',
      OPENAI_API_KEY: undefined,
      ANTHROPIC_API_KEY: 'sk-ant-api03-test-fixture-012345678901234567890',
      LLM_TEXT_MODEL: 'gpt-4o-mini',
    }) })).toThrowError(/not compatible with LLM_TEXT_PROVIDER=anthropic/);

    expect(() => loadEnv({ source: prodEnv({
      LLM_TEXT_PROVIDER: 'openai',
      LLM_TEXT_MODEL: 'claude-sonnet-5',
    }) })).toThrowError(/not compatible with LLM_TEXT_PROVIDER=openai/);
  });

  it('rejects model-provider placeholder credentials', () => {
    expect(() => loadEnv({ source: prodEnv({
      OPENAI_API_KEY: 'sk-your-openai-api-key-placeholder-value',
    }) })).toThrowError(/OPENAI_API_KEY/);
  });

  it('requireProductionEncryption() throws in prod when key missing', () => {
    const source = prodEnv();
    delete source.MEDICAL_DATA_ENCRYPTION_KEY;
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
  it('exports the production-required list and ledger key validator', () => {
    expect(ENV_CONSTANTS.PRODUCTION_REQUIRED).toContain('MEDICAL_DATA_ENCRYPTION_KEY');
    expect(ENV_CONSTANTS.PRODUCTION_REQUIRED).toContain('JWT_SECRET');
    expect(ENV_CONSTANTS.PRODUCTION_REQUIRED).toContain('LLM_TEXT_MODEL');
    expect(ENV_CONSTANTS.isValidLedgerIdentityKeyConfig(LEDGER_IDENTITY_KEYS)).toBe(true);
  });
});
