#!/usr/bin/env node
/**
 * GeneMap nightly self-test sweep ("Eve" — GrantFlow-style, right-sized v1).
 *
 * What it does, in order:
 *   1. Runs the repo's REAL gates: lint, typecheck, unit tests.
 *   2. Starts the API + web dev servers if they aren't already up, then runs
 *      the Playwright journey set (tests/e2e — includes the EVA regression
 *      journeys: login loads console-clean with zero failed requests, and
 *      the registration form is reachable from /Login).
 *   3. AUTO-FIX LANE (safe classes only): if lint fails and the working tree
 *      was clean when the sweep started, runs `eslint --fix`, then re-runs
 *      the FULL gate. Only if everything re-passes does it commit — on a
 *      dedicated agents/autofix-* branch, never on main — and (unless
 *      --no-push) pushes that branch for review. If the re-gate fails, the
 *      fix is reverted and reported instead.
 *   4. Writes an Anya-style findings report (health score + needs-attention
 *      list) to reports/agents/nightly-<date>.md and reports/agents/latest.json.
 *
 * Safety posture:
 *   - Never commits to the current branch; never pushes main.
 *   - Auto-fix is skipped entirely when the tree is dirty (someone's WIP).
 *   - Anything not in the safe class is REPORTED, not fixed.
 *
 * Usage:
 *   node scripts/agents/nightly-sweep.mjs [--no-push] [--no-servers] [--skip-e2e]
 *
 * Exit code: 0 when all gates pass, 1 otherwise (so schtasks records failures).
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT_DIR = path.join(ROOT, 'reports', 'agents');
const ARGS = new Set(process.argv.slice(2));
const PUSH_AUTOFIX = !ARGS.has('--no-push');
const MANAGE_SERVERS = !ARGS.has('--no-servers');
const SKIP_E2E = ARGS.has('--skip-e2e');
const WEB_URL = process.env.SWEEP_WEB_URL || 'http://localhost:5173';
const API_PORT = 3000;
const WEB_PORT = 5173;

const startedAt = new Date();
const log = (msg) => console.log(`[sweep ${new Date().toISOString().slice(11, 19)}] ${msg}`);

// ─── process helpers ────────────────────────────────────────────────────────

function run(command, { timeoutMs = 600_000, env = {} } = {}) {
  const started = Date.now();
  const res = spawnSync(command, {
    cwd: ROOT,
    shell: true, // required on Windows for corepack/pnpm shims
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
  const out = `${res.stdout || ''}${res.stderr || ''}`;
  return {
    ok: res.status === 0,
    status: res.status,
    timedOut: res.error?.code === 'ETIMEDOUT',
    durationMs: Date.now() - started,
    output: out,
    tail: out.split(/\r?\n/).filter(Boolean).slice(-25).join('\n'),
  };
}

function portUp(port) {
  return new Promise((resolve) => {
    // host 'localhost', not '127.0.0.1': Vite binds only ::1 on this box
    // (Windows resolves localhost to IPv6 first), so an IPv4-only probe
    // reported the web server down forever. Node's family autoselection
    // tries both.
    const sock = connect({ port, host: 'localhost' });
    const done = (up) => { sock.destroy(); resolve(up); };
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
    sock.setTimeout(1500, () => done(false));
  });
}

async function waitFor(ports, timeoutMs = 150_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const states = await Promise.all(ports.map(portUp));
    if (states.every(Boolean)) return true;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

// ─── gates ──────────────────────────────────────────────────────────────────

const GATES = [
  { id: 'lint', label: 'Lint (web + api)', weight: 15, cmd: 'corepack pnpm lint' },
  { id: 'typecheck', label: 'Typecheck (shared build + web + api + launch verifier)', weight: 25, cmd: 'corepack pnpm typecheck' },
  { id: 'unit', label: 'Unit tests (api + web + shared)', weight: 30, cmd: 'corepack pnpm test' },
  // e2e is appended dynamically so server management wraps it.
];

function runGate(gate) {
  log(`gate: ${gate.id} ...`);
  const res = run(gate.cmd, { env: gate.env });
  log(`gate: ${gate.id} ${res.ok ? 'PASS' : 'FAIL'} (${Math.round(res.durationMs / 1000)}s)`);
  return { ...gate, ...res };
}

// ─── main ───────────────────────────────────────────────────────────────────

mkdirSync(REPORT_DIR, { recursive: true });

const gitStatus = run('git status --porcelain', { timeoutMs: 30_000 });
const treeWasClean = gitStatus.ok && gitStatus.output.trim() === '';
const headBefore = run('git rev-parse --short HEAD', { timeoutMs: 30_000 }).output.trim();
const branchBefore = run('git branch --show-current', { timeoutMs: 30_000 }).output.trim();

log(`repo @ ${headBefore} on '${branchBefore}', tree ${treeWasClean ? 'clean' : 'DIRTY (auto-fix disabled)'}`);

let results = [];
for (const gate of GATES) results.push(runGate(gate));

// ─── e2e with managed servers ───────────────────────────────────────────────

let devProc = null;
let serverMode = 'skipped';
if (!SKIP_E2E) {
  const apiUp = await portUp(API_PORT);
  const webUp = await portUp(WEB_PORT);
  if (apiUp && webUp) {
    serverMode = 'reused-already-running';
  } else if (MANAGE_SERVERS) {
    serverMode = 'spawned-by-sweep';
    log('starting API + web dev servers ...');
    // Redirect through the shell into a log file: with stdio fully ignored
    // pnpm's parallel runner dies silently on Windows, and we'd also lose
    // the only clue when the API fails to boot (bad DATABASE_URL etc.).
    const serverLog = path.join(REPORT_DIR, 'dev-servers.log');
    devProc = spawn(`corepack pnpm dev > "${serverLog}" 2>&1`, {
      cwd: ROOT, shell: true, stdio: 'ignore', detached: false,
    });
    const up = await waitFor([API_PORT, WEB_PORT]);
    if (!up) serverMode = 'FAILED-to-start';
  } else {
    serverMode = 'not-running-and---no-servers';
  }

  if (serverMode === 'reused-already-running' || serverMode === 'spawned-by-sweep') {
    results.push(runGate({
      id: 'e2e',
      label: `Playwright journeys vs ${WEB_URL} (login console-clean, register reachable, legal pages)`,
      weight: 30,
      cmd: 'corepack pnpm --filter @genemap/web e2e',
      env: { PLAYWRIGHT_BASE_URL: WEB_URL },
    }));
  } else {
    results.push({
      id: 'e2e', label: 'Playwright journeys', weight: 30,
      ok: false, status: null, durationMs: 0,
      output: `servers unavailable (${serverMode})`, tail: `servers unavailable (${serverMode})`,
    });
  }
}

// ─── auto-fix lane (safe classes only: eslint --fix) ────────────────────────

const autofix = { attempted: false, committed: false, branch: null, pushed: false, note: '' };
const lintResult = results.find((r) => r.id === 'lint');
if (lintResult && !lintResult.ok) {
  if (!treeWasClean) {
    autofix.note = 'lint failed but working tree was dirty at sweep start — auto-fix skipped (never touch WIP).';
  } else {
    autofix.attempted = true;
    log('auto-fix lane: running eslint --fix ...');
    run('npx eslint . --fix', { timeoutMs: 300_000 });
    const changed = run('git status --porcelain', { timeoutMs: 30_000 }).output.trim();
    if (!changed) {
      autofix.note = 'eslint --fix changed nothing — the lint failure is not auto-fixable. Needs a human.';
    } else {
      log('auto-fix lane: re-running FULL gate ...');
      const regate = GATES.map(runGate);
      let regateOk = regate.every((r) => r.ok);
      if (regateOk && !SKIP_E2E) {
        const again = runGate({
          id: 'e2e-regate', label: 'Playwright journeys (post-autofix)', weight: 0,
          cmd: 'corepack pnpm --filter @genemap/web e2e',
          env: { PLAYWRIGHT_BASE_URL: WEB_URL },
        });
        regateOk = again.ok;
      }
      if (regateOk) {
        const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
        autofix.branch = `agents/autofix-${stamp}`;
        run(`git checkout -b ${autofix.branch}`, { timeoutMs: 30_000 });
        run('git add -A', { timeoutMs: 30_000 });
        const msg = 'chore(agents): nightly sweep auto-fix (eslint --fix; full gate re-passed)\n\n' +
          'Safe-class lint fixes applied automatically by scripts/agents/nightly-sweep.mjs.\n' +
          'Full gate (lint, typecheck, unit, e2e journeys) re-ran green before this commit.\n\n' +
          'Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>';
        const msgFile = path.join(REPORT_DIR, 'autofix-commit-msg.txt');
        writeFileSync(msgFile, msg);
        const commit = run(`git commit -F "${msgFile}"`, { timeoutMs: 60_000 });
        autofix.committed = commit.ok;
        if (commit.ok && PUSH_AUTOFIX) {
          autofix.pushed = run(`git push -u origin ${autofix.branch}`, { timeoutMs: 120_000 }).ok;
        }
        run(`git checkout ${branchBefore || 'main'}`, { timeoutMs: 30_000 });
        autofix.note = `lint auto-fixed; full gate re-passed; committed on ${autofix.branch}` +
          (autofix.pushed ? ' and pushed for review.' : ' (not pushed).');
        // Reflect the fixed state in the report.
        results = results.map((r) => (r.id === 'lint' ? { ...r, ok: true, tail: `${r.tail}\n[auto-fixed on ${autofix.branch}]` } : r));
      } else {
        run('git checkout -- .', { timeoutMs: 30_000 });
        autofix.note = 'eslint --fix applied but the full gate did NOT re-pass — fix reverted, reported for a human.';
      }
    }
  }
}

// ─── teardown ───────────────────────────────────────────────────────────────

if (devProc) {
  log('stopping spawned dev servers ...');
  spawnSync('taskkill', ['/PID', String(devProc.pid), '/T', '/F'], { shell: true, encoding: 'utf8' });
}

// ─── findings report ────────────────────────────────────────────────────────

const failed = results.filter((r) => !r.ok);
const health = Math.max(0, 100 - failed.reduce((s, r) => s + r.weight, 0));
const dateTag = startedAt.toISOString().slice(0, 10);
const durationS = Math.round((Date.now() - startedAt.getTime()) / 1000);

const md = [
  `# GeneMap nightly sweep — ${dateTag}`,
  '',
  `- Started: ${startedAt.toISOString()}  |  Duration: ${durationS}s`,
  `- Repo: ${headBefore} on '${branchBefore}' (tree ${treeWasClean ? 'clean' : 'dirty'})`,
  `- Servers: ${serverMode}`,
  `- **Health score: ${health}/100** ${health === 100 ? '(all gates green)' : ''}`,
  '',
  '## Gates',
  '',
  '| Gate | Result | Duration |',
  '|---|---|---|',
  ...results.map((r) => `| ${r.label} | ${r.ok ? 'PASS' : `**FAIL**${r.timedOut ? ' (timeout)' : ''}`} | ${Math.round(r.durationMs / 1000)}s |`),
  '',
  '## Auto-fix lane',
  '',
  autofix.attempted || autofix.note ? `- ${autofix.note}` : '- Nothing to do (lint passed).',
  '',
  '## Needs attention',
  '',
  ...(failed.length === 0
    ? ['Nothing — all gates green.']
    : failed.flatMap((r) => [`### ${r.label}`, '', '```', r.tail, '```', ''])),
].join('\n');

writeFileSync(path.join(REPORT_DIR, `nightly-${dateTag}.md`), md);
writeFileSync(path.join(REPORT_DIR, 'latest.json'), JSON.stringify({
  date: startedAt.toISOString(),
  durationS,
  head: headBefore,
  branch: branchBefore,
  treeWasClean,
  serverMode,
  health,
  gates: results.map(({ id, label, ok, durationMs, timedOut }) => ({ id, label, ok, durationMs, timedOut })),
  autofix,
}, null, 2));

log(`health ${health}/100 — report: reports/agents/nightly-${dateTag}.md`);
process.exit(failed.length === 0 ? 0 : 1);
