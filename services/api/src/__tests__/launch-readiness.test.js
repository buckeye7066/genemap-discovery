import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { extractWebReleaseSha } from '../../../../scripts/lib/release-identity.mjs';

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
};

const VALID_EVIDENCE = {
  reviewedBy: 'Launch Reviewer',
  reviewedAt: '2026-06-27T10:00:00.000Z',
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
    policyApproved: true,
    policyDocument: 'docs/DATA_RETENTION.md',
    deletionRequestSlaDays: 30,
    backupRetentionDays: 30,
    privacyMaintenanceScheduled: true,
    privacyMaintenanceEvidence: 'ops://privacy-maintenance/schedule/run-123',
    externalDeletionReconciliation: true,
    externalDeletionReconciliationEvidence: 'ops://restore/reconciliation/run-123',
  },
  release: {
    approvedSha: 'a'.repeat(40),
    webSha: 'a'.repeat(40),
    apiSha: 'a'.repeat(40),
    boundaryPreservingRollbackTested: true,
    rollbackEvidence: 'ops://rollback/run-123',
  },
  legalCompliance: {
    legalReviewCompleted: true,
    complianceReviewCompleted: true,
    reviewer: 'Counsel / Compliance Owner',
    reviewedAt: '2026-06-15T09:00:00.000Z',
    medicalDisclaimerApproved: true,
    baaStatus: 'not_required',
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

  it('rejects missing privacy schedule and restore reconciliation evidence', () => {
    const checks = validateEvidence({
      ...VALID_EVIDENCE,
      dataRetention: {
        ...VALID_EVIDENCE.dataRetention,
        privacyMaintenanceScheduled: false,
        privacyMaintenanceEvidence: 'REPLACE_WITH_SCHEDULE',
        externalDeletionReconciliation: false,
        externalDeletionReconciliationEvidence: 'TODO',
      },
    }, { now: NOW });

    const ids = failures(checks).map((check) => check.id);
    expect(ids).toEqual(expect.arrayContaining([
      'retention.privacyMaintenanceScheduled',
      'retention.privacyMaintenanceEvidence',
      'retention.externalDeletionReconciliation',
      'retention.externalDeletionReconciliationEvidence',
    ]));
  });

  it('rejects mismatched release identities and untested rollback', () => {
    const checks = validateEvidence({
      ...VALID_EVIDENCE,
      release: {
        approvedSha: 'a'.repeat(40),
        webSha: 'b'.repeat(40),
        apiSha: 'a'.repeat(40),
        boundaryPreservingRollbackTested: false,
        rollbackEvidence: 'REPLACE_WITH_ROLLBACK',
      },
    }, { now: NOW });

    const ids = failures(checks).map((check) => check.id);
    expect(ids).toEqual(expect.arrayContaining([
      'release.alignment',
      'release.boundaryPreservingRollbackTested',
      'release.rollbackEvidence',
    ]));
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

  it('checks deployed health and binds both live surfaces to the approved SHA', async () => {
    const approvedSha = 'a'.repeat(40);
    const fetchImpl = async (url) => {
      if (url.endsWith('/healthz')) return mockResponse(200, { status: 'ok' });
      if (url.endsWith('/readyz')) {
        return mockResponse(200, {
          status: 'ready',
          publicationMode: 'education_research',
          medicalEncryption: true,
          releaseSha: approvedSha,
        });
      }
      return mockResponse(
        200,
        `<!doctype html><html><head><meta name="genemap-release-sha" content="${approvedSha}"></head></html>`,
        'text/html; charset=utf-8'
      );
    };

    const checks = await checkHttpEndpoints({
      apiUrl: 'https://api.example.com',
      webUrl: 'https://app.example.com',
      approvedSha,
      fetchImpl,
      timeoutMs: 1000,
    });

    expect(failures(checks)).toEqual([]);
  });

  it('reads one real head marker regardless of attribute order and ignores inert text', () => {
    const approvedSha = 'a'.repeat(40);
    const liveSha = 'b'.repeat(40);
    const html = `<!doctype html>
      <!-- <head><meta name="genemap-release-sha" content="${approvedSha}"></head> -->
      <html>
        <head>
          <script>const marker = '<meta name="genemap-release-sha" content="${approvedSha}">'</script>
          <meta content="${liveSha}" data-purpose="release" name="genemap-release-sha">
        </head>
        <body><meta name="genemap-release-sha" content="${approvedSha}"></body>
      </html>`;

    expect(extractWebReleaseSha(html)).toBe(liveSha);
    expect(extractWebReleaseSha(`<html><head>
      <meta name="genemap-release-sha" content="${liveSha}">
      <meta content="${liveSha}" name="genemap-release-sha">
    </head><body></body></html>`)).toBeNull();
    expect(extractWebReleaseSha(`<html><head>
      <title><meta name="genemap-release-sha" content="${approvedSha}"></title>
    </head><body></body></html>`)).toBeNull();
    expect(extractWebReleaseSha(`<html><head>
      <link data-decoy='<meta name="genemap-release-sha" content="${approvedSha}">'>
      <meta content="${liveSha}" name="genemap-release-sha">
    </head><body></body></html>`)).toBe(liveSha);
    expect(extractWebReleaseSha(`<html><head>
      <meta name="genemap-release-sha" content="${liveSha}" content="${approvedSha}">
    </head><body></body></html>`)).toBeNull();
    expect(extractWebReleaseSha(`<!doctype html><html><body><script>
      const decoy = '<head><meta name="genemap-release-sha" content="${approvedSha}"></head>';
    </script></body></html>`)).toBeNull();
    expect(extractWebReleaseSha(`<html><body><head>
      <meta name="genemap-release-sha" content="${approvedSha}">
    </head></body></html>`)).toBeNull();
  });

  it('rejects redirects and the wrong publication mode', async () => {
    const approvedSha = 'a'.repeat(40);
    const redirectingFetch = async (url) => {
      if (url.endsWith('/healthz')) return mockResponse(200, { status: 'ok' });
      if (url.endsWith('/readyz')) {
        return mockResponse(200, {
          status: 'ready',
          publicationMode: 'clinical',
          medicalEncryption: true,
          releaseSha: approvedSha,
        });
      }
      return mockResponse(302, '', 'text/html; charset=utf-8');
    };

    const checks = await checkHttpEndpoints({
      apiUrl: 'https://api.example.com',
      webUrl: 'https://app.example.com',
      approvedSha,
      fetchImpl: redirectingFetch,
      timeoutMs: 1000,
    });

    expect(failures(checks).map((check) => check.id)).toEqual(expect.arrayContaining([
      'http.readyz',
      'http.web',
      'http.webReleaseSha',
    ]));
  });

  it('rejects healthy deployments that report a different release SHA', async () => {
    const approvedSha = 'a'.repeat(40);
    const fetchImpl = async (url) => {
      if (url.endsWith('/healthz')) return mockResponse(200, { status: 'ok' });
      if (url.endsWith('/readyz')) {
        return mockResponse(200, {
          status: 'ready',
          publicationMode: 'education_research',
          medicalEncryption: true,
          releaseSha: 'b'.repeat(40),
        });
      }
      return mockResponse(
        200,
        `<!doctype html><html><head><meta name="genemap-release-sha" content="${'c'.repeat(40)}"></head></html>`,
        'text/html; charset=utf-8'
      );
    };

    const checks = await checkHttpEndpoints({
      apiUrl: 'https://api.example.com',
      webUrl: 'https://app.example.com',
      approvedSha,
      fetchImpl,
      timeoutMs: 1000,
    });

    expect(failures(checks).map((check) => check.id)).toEqual(expect.arrayContaining([
      'http.apiReleaseSha',
      'http.webReleaseSha',
    ]));
  });

  it('keeps production smoke on the tested head parser and rejects redirects', () => {
    const workflow = readFileSync(
      new URL('../../../../.github/workflows/production-smoke.yml', import.meta.url),
      'utf8'
    );
    expect(workflow).toContain('extractWebReleaseSha');
    expect(workflow).toContain("redirect: 'error'");
    expect(workflow).toMatch(/response\.status !== 200/u);
    expect(workflow).not.toContain('--location');
  });

  it('self-test executes env, evidence, and live release checks end-to-end', async () => {
    // This is what the release gate runs instead of `node --check`: it imports
    // env.js and exercises env, evidence, HTTP publication-mode, and deployed
    // SHA validation with synthetic responses, then confirms a non-live Stripe
    // key is still rejected.
    const result = await runSelfTest(NOW);
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
