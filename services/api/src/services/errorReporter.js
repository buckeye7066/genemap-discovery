// Owner error-reporting pipeline.
//
// When a NON-ADMIN user hits a server (>=500) or client-side error, we analyze
// the likely cause + fix and email the owner immediately. The owner/admins are
// NEVER emailed about their own errors. The whole pipeline is fire-and-forget:
// `reportErrorToOwner` returns synchronously and runs the work in a detached
// async IIFE that can never throw into the caller.

import { sendEmail } from './email.js';
import * as llm from './llm.js';
import { sanitizeError } from '../utils/errors.js';

// Recipient + admin exclusion ---------------------------------------------
const OWNER_EMAIL = process.env.ERROR_REPORT_EMAIL || 'dr.johnwhite@axiombiolabs.org';
const ALWAYS_ADMIN = 'buckeye7066@gmail.com';

// Throttling --------------------------------------------------------------
const SIGNATURE_WINDOW_MS = 10 * 60 * 1000; // same error: at most once / 10 min
const GLOBAL_WINDOW_MS = 60 * 60 * 1000; // rolling hour
const GLOBAL_MAX = 30; // hard cap of emails / rolling hour
const ANALYZE_TIMEOUT_MS = 15_000;

const lastSentBySignature = new Map(); // signature -> epoch ms of last send
let globalSendTimestamps = []; // epoch ms of recent sends (within the hour)

/**
 * Parse the admin allowlist directly from the environment. Mirrors the logic in
 * config/env.js#adminEmails so we stay decoupled from a constructed env object
 * (this module is imported by middleware that runs per-request).
 */
function adminEmails() {
  const raw = process.env.ADMIN_EMAILS || '';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminEmail(email) {
  if (!email) return false;
  const lowered = String(email).toLowerCase();
  return lowered === ALWAYS_ADMIN || adminEmails().includes(lowered);
}

// Non-actionable errors --------------------------------------------------
// Rate-limit / quota errors (our own limiter doing its job, or an upstream LLM
// provider returning 429) are transient and expected — not code bugs. Emailing
// the owner for each one causes alert-fatigue floods (dozens/minutes) because
// the "retry in N minutes" message varies, defeating the per-signature
// throttle. We log these but never email. Genuine 5xx / TypeError alerts are
// unaffected.
function isNonActionable(error, statusCode) {
  if (statusCode === 429) return true;
  const message = String(error?.message || '').toLowerCase();
  if (/rate ?limit|retry in|too many requests|quota/i.test(message)) return true;
  // Upstream LLM/provider 429 surfaced inside a wrapped error message
  // (e.g. "LLM provider api.openai.com failed HTTP 429").
  if (/\b429\b/.test(message) && /(http|provider|openai|anthropic|api\.)/i.test(message)) return true;
  return false;
}

function buildSignature(source, route, error) {
  const name = error?.name || 'Error';
  const message = String(error?.message || '').slice(0, 120);
  return `${source}|${route}|${name}|${message}`;
}

function pruneSignatures(now) {
  for (const [key, ts] of lastSentBySignature) {
    if (now - ts > SIGNATURE_WINDOW_MS) lastSentBySignature.delete(key);
  }
}

function globalRoomAvailable(now) {
  globalSendTimestamps = globalSendTimestamps.filter((t) => now - t < GLOBAL_WINDOW_MS);
  return globalSendTimestamps.length < GLOBAL_MAX;
}

// Analysis ----------------------------------------------------------------

function heuristicAnalysis(error, ctx) {
  const name = error?.name || '';
  const message = String(error?.message || '');
  const lower = message.toLowerCase();
  const status = ctx?.statusCode;

  if (name === 'TypeError') {
    return {
      cause: 'A value was used as the wrong type — often reading a property of `undefined`/`null` because an upstream value was missing or a shape changed.',
      fix: 'Trace the stack to the failing access, add a null/shape guard, and verify the upstream data (DB row, API payload, or function argument) is present and shaped as expected.',
      severity: 'high',
    };
  }
  if (name === 'ReferenceError') {
    return {
      cause: 'A variable or import was referenced before being defined — typically a typo, a missing import, or a renamed symbol.',
      fix: 'Check the identifier named in the message for a missing/incorrect import or a scope/typo issue.',
      severity: 'high',
    };
  }
  if (lower.includes('prisma') || lower.includes('database') || lower.includes('econnrefused') || lower.includes('relation') || lower.includes('column')) {
    return {
      cause: 'A database/Prisma operation failed — the DB may be unreachable (ECONNREFUSED), a query referenced a missing column/relation, or a migration is out of sync.',
      fix: 'Verify DATABASE_URL and DB reachability, confirm migrations are applied (prisma migrate deploy), and check the offending query against the current schema.',
      severity: 'critical',
    };
  }
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('etimedout') || name === 'AbortError') {
    return {
      cause: 'An upstream call (LLM provider, external API, or DB) exceeded its time budget.',
      fix: 'Check the upstream provider status/latency, confirm timeout settings, and consider a faster model or retry/backoff for the affected call.',
      severity: 'medium',
    };
  }
  if (name === 'ZodError' || lower.includes('validation')) {
    return {
      cause: 'Request input failed schema validation — the client sent a payload that does not match the expected shape.',
      fix: 'Compare the client request body against the route Zod schema; either relax/clarify the schema or fix the client to send the required fields.',
      severity: 'low',
    };
  }
  if (status === 401 || status === 403 || lower.includes('unauthorized') || lower.includes('forbidden') || lower.includes('csrf')) {
    return {
      cause: 'An authentication/authorization check failed — an expired session, a missing/invalid CSRF token, or insufficient role.',
      fix: 'Confirm the auth cookies and CSRF token flow for this route; verify token expiry handling and the user role gating.',
      severity: 'medium',
    };
  }
  if (status === 404 || lower.includes('not found')) {
    return {
      cause: 'A requested resource or route was not found.',
      fix: 'Verify the route/resource id exists and that the client is calling the correct path.',
      severity: 'low',
    };
  }
  return {
    cause: 'Unclassified server error. Inspect the stack trace below for the originating call site.',
    fix: 'Reproduce with the request id, follow the stack to the throwing line, and add handling/guards there.',
    severity: status && status >= 500 ? 'high' : 'medium',
  };
}

/**
 * Ask the LLM for a {cause, fix, severity}. Falls back to a heuristic on any
 * failure (no key, timeout, malformed JSON). Never throws.
 */
async function analyzeError(error, ctx) {
  try {
    const prompt = [
      'You are a senior engineer triaging a production error in "GeneMap", a Fastify + Prisma + PostgreSQL backend with a React frontend.',
      `Source: ${ctx?.source}`,
      `Route: ${ctx?.method || ''} ${ctx?.route || ''}`.trim(),
      `HTTP status: ${ctx?.statusCode ?? 'n/a'}`,
      `Error name: ${error?.name || 'Error'}`,
      `Error message: ${String(error?.message || '').slice(0, 500)}`,
      'Stack (truncated):',
      String(error?.stack || '').slice(0, 1500),
      '',
      'Respond with ONLY strict minified JSON, no prose and no code fences, of exactly this shape:',
      '{"cause":"<1-2 sentences: most likely root cause>","fix":"<1-2 sentences: concrete suggested fix>","severity":"<one of: low, medium, high, critical>"}',
    ].join('\n');

    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('analyze timeout')), ANALYZE_TIMEOUT_MS);
    });
    let raw;
    try {
      raw = await Promise.race([
        llm.generateExplanation(prompt, { maxTokens: 400, temperature: 0.2, timeoutMs: ANALYZE_TIMEOUT_MS }),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
    }

    const parsed = llm.parseJsonFromLLM(raw, {
      validate: (v) => Boolean(v && typeof v === 'object' && typeof v.cause === 'string' && typeof v.fix === 'string'),
    });
    if (parsed) {
      return {
        cause: String(parsed.cause),
        fix: String(parsed.fix),
        severity: String(parsed.severity || 'medium'),
      };
    }
  } catch (e) {
    console.error('[errorReporter] analyze failed', e?.message || e);
  }
  return heuristicAnalysis(error, ctx);
}

// Email body --------------------------------------------------------------

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEmailBody({ err, userEmail, route, method, requestId, statusCode, source, analysis, extra }) {
  const timestamp = new Date().toISOString();
  const name = err?.name || 'Error';
  const message = err?.message || '';
  const stack = err?.stack || '';

  const text = [
    `GeneMap error report`,
    `Time: ${timestamp}`,
    `Source: ${source}`,
    `User: ${userEmail || 'anonymous'}`,
    `Route: ${method || ''} ${route || ''}`.trim(),
    `Request ID: ${requestId || 'n/a'}`,
    `Status: ${statusCode ?? 'n/a'}`,
    `Error: ${name}: ${message}`,
    '',
    `Likely cause: ${analysis.cause}`,
    `Suggested fix: ${analysis.fix}`,
    `Severity: ${analysis.severity}`,
    extra ? `\nExtra: ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : '',
    '',
    'Stack trace:',
    stack,
  ].join('\n');

  const row = (label, value) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:4px 0;color:#0f172a;">${escapeHtml(value)}</td></tr>`;

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;max-width:680px;">
    <h2 style="margin:0 0 4px;">GeneMap error report</h2>
    <p style="margin:0 0 16px;color:#64748b;">A user encountered an error. Details and suggested remediation below.</p>
    <table style="border-collapse:collapse;font-size:14px;margin-bottom:16px;">
      ${row('Time', timestamp)}
      ${row('Source', source)}
      ${row('User', userEmail || 'anonymous')}
      ${row('Route', `${method || ''} ${route || ''}`.trim())}
      ${row('Request ID', requestId || 'n/a')}
      ${row('Status', statusCode ?? 'n/a')}
      ${row('Error', `${name}: ${message}`)}
    </table>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
      <p style="margin:0 0 8px;"><strong>Likely cause</strong><br>${escapeHtml(analysis.cause)}</p>
      <p style="margin:0 0 8px;"><strong>Suggested fix</strong><br>${escapeHtml(analysis.fix)}</p>
      <p style="margin:0;"><strong>Severity</strong>: ${escapeHtml(analysis.severity)}</p>
    </div>
    ${extra ? `<p style="font-size:13px;color:#475569;"><strong>Extra:</strong> ${escapeHtml(typeof extra === 'string' ? extra : JSON.stringify(extra))}</p>` : ''}
    <p style="margin:0 0 4px;color:#64748b;font-size:13px;">Stack trace</p>
    <pre style="background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;overflow:auto;font-size:12px;white-space:pre-wrap;word-break:break-word;">${escapeHtml(stack)}</pre>
  </div>`;

  return { html, text };
}

// Public entry point ------------------------------------------------------

/**
 * Fire-and-forget: analyze an error and email the owner unless the current user
 * is an admin/owner. Returns synchronously; never throws.
 *
 * @param {object} params
 * @param {Error} params.error
 * @param {'backend'|'frontend'} params.source
 * @param {{userId?: string, email?: string|null, role?: string}|null} [params.user]
 * @param {string} [params.route]
 * @param {string} [params.method]
 * @param {string} [params.requestId]
 * @param {number} [params.statusCode]
 * @param {*} [params.extra]
 */
export function reportErrorToOwner({ error, source, user, route, method, requestId, statusCode, extra } = {}) {
  // Detached async work; the caller never awaits and never sees a throw.
  (async () => {
    try {
      const userEmail = user?.email || null;
      // NEVER email when the admin/owner is the logged-in user.
      if (userEmail && isAdminEmail(userEmail)) return;

      const rawErr = error || new Error('Unknown error');
      // Mask secret-bearing tokens in the message BEFORE it flows anywhere
      // external (the LLM triage prompt and the owner email via Resend). The
      // stack is kept for debugging — it carries code paths, not user PII, and
      // the message (the usual secret/PII carrier) is now sanitized.
      const err = {
        name: rawErr.name || 'Error',
        message: sanitizeError(rawErr),
        stack: rawErr.stack,
      };
      // Skip (log-only) transient rate-limit / upstream-429 errors — these are
      // non-actionable and cause alert-fatigue floods.
      if (isNonActionable(err, statusCode)) {
        console.warn(`[errorReporter] non-actionable error suppressed (no email): ${err.name}: ${String(err.message || '').slice(0, 120)}`);
        return;
      }

      const now = Date.now();
      const signature = buildSignature(source, route, err);

      pruneSignatures(now);
      const last = lastSentBySignature.get(signature);
      if (last && now - last < SIGNATURE_WINDOW_MS) return;

      if (!globalRoomAvailable(now)) {
        console.warn('[errorReporter] global hourly email cap reached — skipping report');
        return;
      }

      // Reserve the throttle slots BEFORE the (slow) analysis so a burst of the
      // same error cannot stampede into multiple concurrent emails.
      lastSentBySignature.set(signature, now);
      globalSendTimestamps.push(now);

      const analysis = await analyzeError(err, { source, route, method, statusCode });

      const subject = `[GeneMap] Error for ${userEmail || 'anonymous'}: ${err.name || 'Error'}: ${String(err.message || '').slice(0, 100)}`;
      const { html, text } = buildEmailBody({
        err,
        userEmail,
        route,
        method,
        requestId,
        statusCode,
        source,
        analysis,
        extra,
      });

      await sendEmail({ to: OWNER_EMAIL, subject, html, text });
    } catch (e) {
      console.error('[errorReporter]', e);
    }
  })();
}
