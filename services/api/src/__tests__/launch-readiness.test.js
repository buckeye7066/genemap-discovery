import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

let checkHttpEndpoints;
let parseArgs;
let runLaunchVerification;
let runSelfTest;
let validateEvidence;
let validateLaunchEnv;

beforeAll(async () => {
  const launchVerifier = await import(
    new URL('../../../../scripts/verify-production-launch.mjs', import.meta.url)
  );
  ({
    checkHttpEndpoints,
    parseArgs,
    runLaunchVerification,
    runSelfTest,
    validateEvidence,
    validateLaunchEnv,
  } = launchVerifier);
});

const NOW = new Date('2026-06-27T12:00:00.000Z');

const STRONG_SECRET = 'x'.repeat(48);
const VALID_ENV = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:pass@db.example.com:5432/genemap',
  JWT_SECRET: STRONG_SECRET,
  JWT_REFRESH_SECRET: `${STRONG_SECRET}r`,
  COOKIE_SECRET: `${STRONG_SECRET}c`,
  CORS_ORIGINS: 'https://app.example.com',
  MEDICAL_DATA_ENCRYPTION_KEY: 'a'.repeat(64),
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
  OPENAI_API_KEY: 'sk-live-openai-placeholder-for-validation',
  ACCOUNT_CLOSURE_LEDGER_WRITE_URL: 'https://ledger.example.com/write',
  ACCOUNT_CLOSURE_LEDGER_READ_URL: 'https://ledger.example.com/read',
  ACCOUNT_CLOSURE_LEDGER_SECRET: 'l'.repeat(48),
  ACCOUNT_CLOSURE_LEDGER_IDENTITY_KEYS: `2026-08=${'i'.repeat(48)},2026-01=${'r'.repeat(48)}`,
};

const VALID_EVIDENCE = {
  recordedBy: 'Evidence Recorder',
  recordedAt: '2026-06-27T10:00:00.000Z',
  productionSecrets: {
    storedInSecretManager: true,
    rotatedForLaunch: true,
    manager: 'Railway, Vercel, and 1Password',
  },
  backups: {
    automaticBackupsEnabled: true,
    retentionDays: 30,
    lastSuccessfulBackupAt: '2026-06-27T09:00:00.000Z',
    restoreTestedAt: '2026-06-20T09:00:00.000Z',
    restoreRunbook: 'docs/BACKUP.md',
    externalDeletionLedgerConfigured: true,
    deletionLedgerReconciledAt: '2026-06-20T10:00:00.000Z',
  },
  monitoring: {
    errorTrackingConfigured: true,
    logAggregationConfigured: true,
    alertingConfigured: true,
    dashboardUrl: 'https://monitoring.example.com/genemap',
    pagerEscalation: '#on-call',
  },
  stripe: {
    liveMode: true,
    webhookEndpoint: 'https://api.example.com/billing/webhook',
    webhookEvents: [
      'checkout.session.completed',
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'invoice.payment_succeeded',
      'invoice.payment_failed',
    ],
    lastWebhookTestAt: '2026-06-26T09:00:00.000Z',
  },
  dataRetention: {
    policyConfigured: true,
    policyDocument: 'docs/DATA_RETENTION.md',
    deletionRequestSlaDays: 30,
    backupRetentionDays: 30,
  },
};

function failures(checks) {
  return checks.filter((check) => check.status === 'fail');
}

function mockResponse(status, body, contentType = 'application/json') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === 'content-type' ? contentType : '';
      },
    },
    async text() {
      return typeof body === 'string' ? body : JSON.stringify(body);
    },
  };
}

describe('production launch verification', () => {
  it('ignores the literal pnpm argument separator', () => {
    const opts = parseArgs([
      '--',
      '--skip-http',
      '--api-url=https://api.example.com',
      '--web-url=https://app.example.com',
    ]);

    expect(opts.skipHttp).toBe(true);
    expect(opts.apiUrl).toBe('https://api.example.com');
    expect(opts.webUrl).toBe('https://app.example.com');
  });

  it('accepts a hardened production environment', () => {
    const { checks } = validateLaunchEnv(VALID_ENV);
    expect(failures(checks)).toEqual([]);
  });

  it('rejects a production launch without the restore-independent deletion ledger', () => {
    const source = { ...VALID_ENV };
    delete source.ACCOUNT_CLOSURE_LEDGER_WRITE_URL;
    delete source.ACCOUNT_CLOSURE_LEDGER_READ_URL;
    delete source.ACCOUNT_CLOSURE_LEDGER_SECRET;
    delete source.ACCOUNT_CLOSURE_LEDGER_IDENTITY_KEYS;
    const { checks } = validateLaunchEnv(source);
    expect(failures(checks).map((check) => check.id)).toContain('accountClosure.ledger');
  });

  it('rejects a deletion ledger without a rotation-safe identity key ring', () => {
    const { checks } = validateLaunchEnv({
      ...VALID_ENV,
      ACCOUNT_CLOSURE_LEDGER_IDENTITY_KEYS: '',
    });
    expect(failures(checks).map((check) => check.id)).toContain('accountClosure.ledger');
  });

  it('rejects test-mode Stripe keys in production', () => {
    const { checks } = validateLaunchEnv({
      ...VALID_ENV,
      STRIPE_SECRET_KEY: 'sk_test_123456789',
    });
    expect(failures(checks).map((check) => check.id)).toContain('env.loadEnv');
    expect(failures(checks)[0].message).toMatch(/STRIPE_SECRET_KEY/);
  });

  it('accepts complete operational launch evidence', () => {
    const checks = validateEvidence(VALID_EVIDENCE, { now: NOW });
    expect(failures(checks)).toEqual([]);
  });

  it('keeps external legal decisions outside automated evidence checks', () => {
    const checks = validateEvidence({
      ...VALID_EVIDENCE,
      legalCompliance: { legalReviewCompleted: false },
    }, { now: NOW });

    expect(checks.some((check) => check.id.startsWith('legal.'))).toBe(false);
    expect(failures(checks)).toEqual([]);
  });

  it('rejects missing backup restore evidence', () => {
    const checks = validateEvidence({
      ...VALID_EVIDENCE,
      backups: {
        ...VALID_EVIDENCE.backups,
        restoreTestedAt: '',
      },
    }, { now: NOW });
    expect(failures(checks).map((check) => check.id)).toContain('backups.restoreTestedAt');
  });

  it('checks deployed API and web health endpoints', async () => {
    const fetchImpl = async (url) => {
      if (url.endsWith('/healthz')) return mockResponse(200, { status: 'ok' });
      if (url.endsWith('/readyz')) {
        return mockResponse(200, { status: 'ready', medicalEncryption: true });
      }
      return mockResponse(200, '<!doctype html><html></html>', 'text/html; charset=utf-8');
    };

    const checks = await checkHttpEndpoints({
      apiUrl: 'https://api.example.com',
      webUrl: 'https://app.example.com',
      fetchImpl,
      timeoutMs: 1000,
    });

    expect(failures(checks)).toEqual([]);
  });

  it('self-test executes the verifier end-to-end and confirms fail-closed behaviour', () => {
    // This is what the release gate runs instead of `node --check`: it actually
    // imports env.js and exercises the env + evidence validators against a
    // synthetic hardened fixture, then confirms the verifier still rejects a
    // non-live Stripe key. A green self-test proves the script runs, not merely
    // that it parses.
    const result = runSelfTest(NOW);
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('does not allow skipped HTTP checks to pass launch verification', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'genemap-launch-'));
    const evidenceFile = join(dir, 'evidence.json');
    writeFileSync(evidenceFile, JSON.stringify(VALID_EVIDENCE), 'utf8');

    const result = await runLaunchVerification({
      source: VALID_ENV,
      evidenceFile,
      skipHttp: true,
      now: NOW,
    });

    expect(result.ok).toBe(false);
    expect(failures(result.checks).map((check) => check.id)).toContain('http.skipped');
  });
});
