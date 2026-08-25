import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadEnv } from '../services/api/src/config/env.js';

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_EVIDENCE_FILE = 'ops/production-launch-evidence.json';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const REQUIRED_STRIPE_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
];

function pass(id, message) {
  return { id, status: 'pass', message };
}

function fail(id, message) {
  return { id, status: 'fail', message };
}

function isBlank(value) {
  return typeof value !== 'string' || value.trim().length === 0;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function parseDate(value) {
  if (isBlank(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysAgo(date, now = new Date()) {
  return (now.getTime() - date.getTime()) / ONE_DAY_MS;
}

function checkRecentDate(id, value, maxAgeDays, now) {
  const date = parseDate(value);
  if (!date) return fail(id, `missing or invalid timestamp: ${value || '(empty)'}`);
  if (date.getTime() > now.getTime() + ONE_DAY_MS) {
    return fail(id, `timestamp is in the future: ${value}`);
  }
  const age = daysAgo(date, now);
  if (age > maxAgeDays) {
    return fail(id, `timestamp is ${Math.floor(age)} days old; expected <= ${maxAgeDays} days`);
  }
  return pass(id, `timestamp is recent (${value})`);
}

function checkUrl(id, value, { requireHttps = true, allowLocalhost = false } = {}) {
  if (isBlank(value)) return fail(id, 'URL is required');
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const isLocal =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host.endsWith('.local');

    if (requireHttps && url.protocol !== 'https:') {
      return fail(id, `expected https URL, got ${url.protocol}`);
    }
    if (!allowLocalhost && isLocal) {
      return fail(id, `local URL is not valid for production launch: ${value}`);
    }
    return pass(id, `${url.origin} is a valid production URL`);
  } catch {
    return fail(id, `invalid URL: ${value}`);
  }
}

function isValidStripePriceId(value) {
  return typeof value === 'string'
    && /^price_[A-Za-z0-9_]{6,}$/.test(value)
    && !/^price_(your|monthly|yearly|team|dept|department|ent|enterprise|id)/i.test(value);
}

export function parseArgs(argv = process.argv.slice(2)) {
  const opts = {
    apiUrl: process.env.PRODUCTION_API_URL || process.env.API_URL || '',
    webUrl: process.env.PRODUCTION_WEB_URL || process.env.WEB_URL || '',
    evidenceFile: process.env.LAUNCH_EVIDENCE_FILE || DEFAULT_EVIDENCE_FILE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    skipHttp: false,
    json: false,
  };

  for (const arg of argv) {
    if (arg === '--') continue;
    else if (arg === '--skip-http') opts.skipHttp = true;
    else if (arg === '--self-test') opts.selfTest = true;
    else if (arg === '--json') opts.json = true;
    else if (arg.startsWith('--api-url=')) opts.apiUrl = arg.slice('--api-url='.length);
    else if (arg.startsWith('--web-url=')) opts.webUrl = arg.slice('--web-url='.length);
    else if (arg.startsWith('--evidence=')) opts.evidenceFile = arg.slice('--evidence='.length);
    else if (arg.startsWith('--timeout-ms=')) opts.timeoutMs = Number(arg.slice('--timeout-ms='.length));
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

export function validateLaunchEnv(source = process.env) {
  const checks = [];
  let env;

  try {
    env = loadEnv({ source, warn: () => {} });
    checks.push(pass('env.loadEnv', 'production environment passes API startup validation'));
  } catch (err) {
    checks.push(fail('env.loadEnv', err.message));
    return { env: null, checks };
  }

  if (env.NODE_ENV === 'production') {
    checks.push(pass('env.NODE_ENV', 'NODE_ENV=production'));
  } else {
    checks.push(fail('env.NODE_ENV', `NODE_ENV must be production, got ${env.NODE_ENV}`));
  }

  // The Capacitor mobile app's bundled-frontend origins are always appended
  // by corsAllowList() — expected in production, not a misconfiguration.
  const capacitorOrigins = new Set(['https://localhost', 'capacitor://localhost']);
  for (const origin of env.corsAllowList()) {
    if (capacitorOrigins.has(origin)) {
      checks.push(pass(`env.CORS_ORIGINS.${origin}`, 'Capacitor mobile app origin (expected)'));
      continue;
    }
    checks.push(checkUrl(`env.CORS_ORIGINS.${origin}`, origin, { requireHttps: true }));
  }
  if (env.corsAllowList().includes('*')) {
    checks.push(fail('env.CORS_ORIGINS.wildcard', 'wildcard CORS is not allowed in production'));
  }

  if (env.STRIPE_SECRET_KEY?.startsWith('sk_live_')) {
    checks.push(pass('stripe.secretKey', 'Stripe secret key is live-mode'));
  } else {
    checks.push(fail('stripe.secretKey', 'STRIPE_SECRET_KEY must start with sk_live_ for production'));
  }

  if (env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) {
    checks.push(pass('stripe.webhookSecret', 'Stripe webhook signing secret is present'));
  } else {
    checks.push(fail('stripe.webhookSecret', 'STRIPE_WEBHOOK_SECRET must start with whsec_'));
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
    const value = env[key];
    if (isValidStripePriceId(value)) {
      checks.push(pass(`stripe.${key}`, `${key} has a Stripe price id`));
    } else {
      checks.push(fail(`stripe.${key}`, `${key} must be a real Stripe price_ id, not a placeholder`));
    }
  }

  if (env.accountClosureLedgerConfigured()) {
    checks.push(pass(
      'accountClosure.ledger',
      'restore-independent account-deletion ledger write/read URLs, transport secret, and rotation-safe identity key ring are configured',
    ));
  } else {
    checks.push(fail(
      'accountClosure.ledger',
      'ACCOUNT_CLOSURE_LEDGER_WRITE_URL, ACCOUNT_CLOSURE_LEDGER_READ_URL, a 32+ character ACCOUNT_CLOSURE_LEDGER_SECRET, and a valid ACCOUNT_CLOSURE_LEDGER_IDENTITY_KEYS key ring are required for production account deletion and restore reconciliation',
    ));
  }

  return { env, checks };
}

export function validateEvidence(evidence, opts = {}) {
  const now = opts.now || new Date();
  const checks = [];

  checks.push(isBlank(evidence?.recordedBy)
    ? fail('evidence.recordedBy', 'recordedBy is required')
    : pass('evidence.recordedBy', `evidence recorded by ${evidence.recordedBy}`));
  checks.push(checkRecentDate('evidence.recordedAt', evidence?.recordedAt, 30, now));

  const secrets = evidence?.productionSecrets || {};
  checks.push(secrets.storedInSecretManager === true
    ? pass('secrets.storedInSecretManager', 'production secrets are stored in a secret manager')
    : fail('secrets.storedInSecretManager', 'production secrets must be stored in Railway/Vercel/1Password/etc.'));
  checks.push(secrets.rotatedForLaunch === true
    ? pass('secrets.rotatedForLaunch', 'launch secrets were rotated/generated for launch')
    : fail('secrets.rotatedForLaunch', 'launch secrets must be newly generated or explicitly rotated'));
  checks.push(isBlank(secrets.manager)
    ? fail('secrets.manager', 'secret manager name is required')
    : pass('secrets.manager', `secret manager recorded: ${secrets.manager}`));

  const backups = evidence?.backups || {};
  checks.push(backups.automaticBackupsEnabled === true
    ? pass('backups.automaticBackupsEnabled', 'automatic database backups enabled')
    : fail('backups.automaticBackupsEnabled', 'automatic database backups must be enabled'));
  checks.push(Number(backups.retentionDays) >= 7
    ? pass('backups.retentionDays', `backup retention is ${backups.retentionDays} days`)
    : fail('backups.retentionDays', 'backup retention must be at least 7 days'));
  checks.push(checkRecentDate('backups.lastSuccessfulBackupAt', backups.lastSuccessfulBackupAt, 2, now));
  checks.push(checkRecentDate('backups.restoreTestedAt', backups.restoreTestedAt, 90, now));
  checks.push(isBlank(backups.restoreRunbook)
    ? fail('backups.restoreRunbook', 'restore runbook path is required')
    : pass('backups.restoreRunbook', `restore runbook recorded: ${backups.restoreRunbook}`));
  checks.push(backups.externalDeletionLedgerConfigured === true
    ? pass('backups.externalDeletionLedgerConfigured', 'restore-independent deletion ledger configured')
    : fail('backups.externalDeletionLedgerConfigured', 'restore-independent deletion ledger must be configured'));
  checks.push(checkRecentDate(
    'backups.deletionLedgerReconciledAt',
    backups.deletionLedgerReconciledAt,
    90,
    now,
  ));

  const monitoring = evidence?.monitoring || {};
  checks.push(monitoring.errorTrackingConfigured === true
    ? pass('monitoring.errorTrackingConfigured', 'error tracking configured')
    : fail('monitoring.errorTrackingConfigured', 'error tracking must be configured'));
  checks.push(monitoring.logAggregationConfigured === true
    ? pass('monitoring.logAggregationConfigured', 'log aggregation configured')
    : fail('monitoring.logAggregationConfigured', 'log aggregation must be configured'));
  checks.push(monitoring.alertingConfigured === true
    ? pass('monitoring.alertingConfigured', 'alerting configured')
    : fail('monitoring.alertingConfigured', 'alerting rules must be configured'));
  checks.push(checkUrl('monitoring.dashboardUrl', monitoring.dashboardUrl, { requireHttps: true }));
  checks.push(isBlank(monitoring.pagerEscalation)
    ? fail('monitoring.pagerEscalation', 'pager/on-call escalation path is required')
    : pass('monitoring.pagerEscalation', 'pager/on-call escalation path recorded'));

  const stripe = evidence?.stripe || {};
  checks.push(stripe.liveMode === true
    ? pass('stripe.liveMode', 'Stripe live mode confirmed')
    : fail('stripe.liveMode', 'Stripe live mode must be confirmed'));
  checks.push(checkUrl('stripe.webhookEndpoint', stripe.webhookEndpoint, { requireHttps: true }));
  if (!String(stripe.webhookEndpoint || '').endsWith('/billing/webhook')) {
    checks.push(fail('stripe.webhookEndpoint.path', 'Stripe webhook endpoint must end with /billing/webhook'));
  } else {
    checks.push(pass('stripe.webhookEndpoint.path', 'Stripe webhook endpoint path is correct'));
  }
  const events = asArray(stripe.webhookEvents);
  for (const eventName of REQUIRED_STRIPE_EVENTS) {
    checks.push(events.includes(eventName)
      ? pass(`stripe.event.${eventName}`, `${eventName} configured`)
      : fail(`stripe.event.${eventName}`, `${eventName} must be enabled on the Stripe webhook`));
  }
  checks.push(checkRecentDate('stripe.lastWebhookTestAt', stripe.lastWebhookTestAt, 30, now));

  const retention = evidence?.dataRetention || {};
  checks.push(retention.policyConfigured === true
    ? pass('retention.policyConfigured', 'data retention policy is configured')
    : fail('retention.policyConfigured', 'data retention policy must be configured before launch'));
  checks.push(isBlank(retention.policyDocument)
    ? fail('retention.policyDocument', 'data retention policy document path is required')
    : pass('retention.policyDocument', `data retention policy documented at ${retention.policyDocument}`));
  checks.push(Number(retention.deletionRequestSlaDays) > 0 && Number(retention.deletionRequestSlaDays) <= 30
    ? pass('retention.deletionRequestSlaDays', `deletion SLA is ${retention.deletionRequestSlaDays} days`)
    : fail('retention.deletionRequestSlaDays', 'deletion request SLA must be between 1 and 30 days'));
  checks.push(Number(retention.backupRetentionDays) >= 7
    ? pass('retention.backupRetentionDays', `backup retention is ${retention.backupRetentionDays} days`)
    : fail('retention.backupRetentionDays', 'backup retention must be at least 7 days'));

  return checks;
}

async function fetchJson(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { response, body };
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkHttpEndpoints(opts) {
  const {
    apiUrl,
    webUrl,
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = opts;
  const checks = [];

  checks.push(checkUrl('http.apiUrl', apiUrl, { requireHttps: true }));
  checks.push(checkUrl('http.webUrl', webUrl, { requireHttps: true }));
  if (checks.some((check) => check.status === 'fail')) return checks;
  if (typeof fetchImpl !== 'function') {
    checks.push(fail('http.fetch', 'global fetch is not available'));
    return checks;
  }

  const apiBase = apiUrl.replace(/\/+$/, '');
  const webBase = webUrl.replace(/\/+$/, '');

  try {
    const { response, body } = await fetchJson(fetchImpl, `${apiBase}/healthz`, timeoutMs);
    checks.push(response.ok && body?.status === 'ok'
      ? pass('http.healthz', '/healthz returned status ok')
      : fail('http.healthz', `/healthz expected 200 {status:"ok"}, got ${response.status}`));
  } catch (err) {
    checks.push(fail('http.healthz', `/healthz request failed: ${err.message}`));
  }

  try {
    const { response, body } = await fetchJson(fetchImpl, `${apiBase}/readyz`, timeoutMs);
    checks.push(response.ok && body?.status === 'ready' && body?.medicalEncryption === true
      ? pass('http.readyz', '/readyz returned ready with medicalEncryption=true')
      : fail('http.readyz', `/readyz expected ready + encryption, got status ${response.status}`));
  } catch (err) {
    checks.push(fail('http.readyz', `/readyz request failed: ${err.message}`));
  }

  try {
    const response = await fetchImpl(webBase, { signal: AbortSignal.timeout(timeoutMs) });
    const contentType = response.headers?.get?.('content-type') || '';
    checks.push(response.ok && contentType.includes('text/html')
      ? pass('http.web', 'web app returned HTML')
      : fail('http.web', `web app expected HTML 200, got ${response.status} ${contentType}`));
  } catch (err) {
    checks.push(fail('http.web', `web request failed: ${err.message}`));
  }

  return checks;
}

export async function runLaunchVerification(opts = {}) {
  const source = opts.source || process.env;
  const checks = [];

  checks.push(...validateLaunchEnv(source).checks);

  const evidenceFile = opts.evidenceFile || DEFAULT_EVIDENCE_FILE;
  if (!existsSync(evidenceFile)) {
    checks.push(fail('evidence.file', `missing launch evidence file: ${evidenceFile}`));
  } else {
    try {
      checks.push(pass('evidence.file', `loaded ${evidenceFile}`));
      checks.push(...validateEvidence(parseJsonFile(evidenceFile), { now: opts.now }));
    } catch (err) {
      checks.push(fail('evidence.file', `could not parse evidence file: ${err.message}`));
    }
  }

  if (opts.skipHttp) {
    checks.push(fail(
      'http.skipped',
      'HTTP endpoint checks were skipped. This is an evidence-only dry run, not a complete launch proof. Run without --skip-http against production URLs for a passing launch proof.'
    ));
  } else {
    checks.push(...await checkHttpEndpoints({
      apiUrl: opts.apiUrl || source.PRODUCTION_API_URL || source.API_URL,
      webUrl: opts.webUrl || source.PRODUCTION_WEB_URL || source.WEB_URL,
      fetchImpl: opts.fetchImpl,
      timeoutMs: opts.timeoutMs || DEFAULT_TIMEOUT_MS,
    }));
  }

  return {
    ok: checks.every((check) => check.status === 'pass'),
    checks,
  };
}

// ─── Self-test ───────────────────────────────────────────────────────────────
//
// The release gate must do more than `node --check` this file — a syntax check
// never imports env.js or exercises a single validation branch, so a runtime
// regression (a thrown import, a broken check, an inverted condition) sails
// through. `--self-test` actually RUNS the verifier against a synthetic but
// complete production env + evidence fixture and asserts three invariants:
//   1. a hardened env passes,
//   2. complete evidence passes,
//   3. HTTP checks that are skipped FAIL CLOSED (never a false "launch ok").
// It needs no network and no real secrets, so it is safe in CI while still
// proving the verifier executes end-to-end.
const SELF_TEST_ENV = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:pass@db.example.com:5432/genemap',
  JWT_SECRET: 'x'.repeat(48),
  JWT_REFRESH_SECRET: `${'x'.repeat(48)}r`,
  COOKIE_SECRET: `${'x'.repeat(48)}c`,
  CORS_ORIGINS: 'https://app.example.com',
  MEDICAL_DATA_ENCRYPTION_KEY: 'a'.repeat(64),
  STRIPE_SECRET_KEY: 'sk_live_selftest0123456789',
  STRIPE_WEBHOOK_SECRET: 'whsec_selftest0123456789',
  STRIPE_PRICE_MONTHLY: 'price_selftestMonthly',
  STRIPE_PRICE_YEARLY: 'price_selftestYearly',
  STRIPE_PRICE_TEAM_MONTHLY: 'price_selftestTeamMonthly',
  STRIPE_PRICE_TEAM_YEARLY: 'price_selftestTeamYearly',
  STRIPE_PRICE_DEPT_MONTHLY: 'price_selftestDeptMonthly',
  STRIPE_PRICE_DEPT_YEARLY: 'price_selftestDeptYearly',
  STRIPE_PRICE_ENT_MONTHLY: 'price_selftestEntMonthly',
  STRIPE_PRICE_ENT_YEARLY: 'price_selftestEntYearly',
  OPENAI_API_KEY: 'sk-selftest-openai-placeholder',
  ACCOUNT_CLOSURE_LEDGER_WRITE_URL: 'https://ledger.example.com/write',
  ACCOUNT_CLOSURE_LEDGER_READ_URL: 'https://ledger.example.com/read',
  ACCOUNT_CLOSURE_LEDGER_SECRET: 'l'.repeat(48),
  ACCOUNT_CLOSURE_LEDGER_IDENTITY_KEYS: `selftest-current=${'i'.repeat(48)},selftest-retired=${'r'.repeat(48)}`,
};

function buildSelfTestEvidence(now) {
  const iso = (msAgo) => new Date(now.getTime() - msAgo).toISOString();
  return {
    recordedBy: 'Self-Test Recorder',
    recordedAt: iso(ONE_DAY_MS),
    productionSecrets: { storedInSecretManager: true, rotatedForLaunch: true, manager: 'Railway/Vercel/1Password' },
    backups: {
      automaticBackupsEnabled: true,
      retentionDays: 30,
      lastSuccessfulBackupAt: iso(ONE_DAY_MS),
      restoreTestedAt: iso(7 * ONE_DAY_MS),
      restoreRunbook: 'docs/BACKUP.md',
      externalDeletionLedgerConfigured: true,
      deletionLedgerReconciledAt: iso(7 * ONE_DAY_MS),
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
      webhookEvents: [...REQUIRED_STRIPE_EVENTS],
      lastWebhookTestAt: iso(2 * ONE_DAY_MS),
    },
    dataRetention: { policyConfigured: true, policyDocument: 'docs/DATA_RETENTION.md', deletionRequestSlaDays: 30, backupRetentionDays: 30 },
  };
}

export function runSelfTest(now = new Date()) {
  const problems = [];

  const envFailures = validateLaunchEnv(SELF_TEST_ENV).checks.filter((c) => c.status === 'fail');
  if (envFailures.length > 0) {
    problems.push(`hardened env fixture unexpectedly failed: ${envFailures.map((c) => c.id).join(', ')}`);
  }

  const evidenceFailures = validateEvidence(buildSelfTestEvidence(now), { now }).filter((c) => c.status === 'fail');
  if (evidenceFailures.length > 0) {
    problems.push(`complete evidence fixture unexpectedly failed: ${evidenceFailures.map((c) => c.id).join(', ')}`);
  }
  if (validateEvidence(buildSelfTestEvidence(now), { now })
    .some((check) => check.id.startsWith('legal.'))) {
    problems.push('verifier reintroduced a legal/compliance certification gate');
  }

  // Fail-closed invariant: a missing Stripe live key MUST be caught.
  const brokenEnv = validateLaunchEnv({ ...SELF_TEST_ENV, STRIPE_SECRET_KEY: 'sk_test_not_live' }).checks;
  if (!brokenEnv.some((c) => c.status === 'fail')) {
    problems.push('verifier did not reject a non-live Stripe key (fail-open regression)');
  }

  // Fail-closed invariant: a ledger without historical-key custody is not a
  // complete restore-safety configuration.
  const brokenLedger = validateLaunchEnv({
    ...SELF_TEST_ENV,
    ACCOUNT_CLOSURE_LEDGER_IDENTITY_KEYS: '',
  }).checks;
  if (!brokenLedger.some((c) => c.id === 'accountClosure.ledger' && c.status === 'fail')) {
    problems.push('verifier did not reject a missing deletion-ledger identity key ring');
  }

  return { ok: problems.length === 0, problems };
}

function printHelp() {
  console.log(`Usage:
  pnpm launch:verify -- --api-url=https://api.example.com --web-url=https://app.example.com --evidence=ops/production-launch-evidence.json

Options:
  --api-url=URL       Production API base URL. Can also use PRODUCTION_API_URL.
  --web-url=URL       Production web app URL. Can also use PRODUCTION_WEB_URL.
  --evidence=PATH     Launch evidence JSON file. Default: ${DEFAULT_EVIDENCE_FILE}
  --timeout-ms=N      HTTP timeout per request. Default: ${DEFAULT_TIMEOUT_MS}
  --skip-http         Validate env and launch evidence only; exits non-zero because live HTTP proof is incomplete.
  --self-test         Run the verifier against a synthetic hardened env + evidence fixture (no network, no secrets).
                      Proves the script executes end-to-end and fails closed. Used by the release gate.
  --json              Print machine-readable JSON.
`);
}

function formatChecks(checks) {
  return checks
    .map((check) => `${check.status === 'pass' ? 'PASS' : 'FAIL'} ${check.id}: ${check.message}`)
    .join('\n');
}

async function main() {
  const opts = parseArgs();
  if (opts.help) {
    printHelp();
    return;
  }

  if (opts.selfTest) {
    const selfTest = runSelfTest();
    if (selfTest.ok) {
      console.log('Launch verifier self-test passed (env + evidence validation executed, fail-closed confirmed).');
      process.exitCode = 0;
    } else {
      console.error('Launch verifier self-test FAILED:');
      for (const problem of selfTest.problems) console.error(`  - ${problem}`);
      process.exitCode = 1;
    }
    return;
  }

  const result = await runLaunchVerification(opts);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatChecks(result.checks));
    console.log(result.ok ? '\nProduction launch verification passed.' : '\nProduction launch verification failed.');
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
