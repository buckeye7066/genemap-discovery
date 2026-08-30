/**
 * Operator alerting for failures that MUST reach a human.
 *
 * Deliberately built on the channel this repository already has rather than a
 * new vendor: `services/email.js` (Resend) addressed to `ADMIN_EMAILS`. Note
 * that `config/sentry.js` is an intentional NO-OP in the education/research
 * publication build — routing alerts there would silently drop them, which is
 * exactly the failure mode this module exists to prevent.
 *
 * Two properties matter more than delivery guarantees:
 *
 *  1. It NEVER throws. An alert is a side effect of an already-failing
 *     operation; it must not convert one failure into two, and must not change
 *     the error the caller reports to the user.
 *  2. It ALWAYS emits a structured single-line `[operator-alert]` record to
 *     stderr, whether or not email is configured. That line is the platform-log
 *     trail, and it means an unconfigured mailbox degrades the alert to
 *     "visible in logs" instead of losing it entirely.
 *
 * Callers must pass only non-identifying details — receipt ids, error codes,
 * stage names, release SHAs. Never an email address, name, or user content.
 * That rule is ENFORCED here by `redactDetails`, not left to caller discipline:
 * this path hands data to an EXTERNAL PROCESSOR (Resend), the alerts most
 * likely to be written next are about account deletion, and a convention that
 * lives in a comment is exactly the shape this repository's INVARIANTS
 * doctrine says to move to a choke point.
 */
import { sendEmail as defaultSendEmail } from './email.js';
import { releaseSha } from '../config/releaseIdentity.js';

export const LEDGER_WRITE_FAILURE = 'account_closure_ledger_write_failed';

/** Keys whose VALUE is identifying by name, whatever it happens to contain. */
const IDENTIFYING_KEY = /(^|[._-])(email|e_?mail|name|phone|address|ssn|dob|birth|subject|patient|username|user|user_?id|userid|account_?id)([._-]|$)/i;
/** An email address anywhere inside a value, whatever the key is called. */
const EMAIL_IN_VALUE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
export const REDACTED = '[redacted]';

/**
 * Strip identifying material from an alert's details before it leaves the
 * platform. Conservative and SHALLOW-RECURSIVE: it redacts by key name and by
 * value shape, keeps operational fields (receiptId, code, counts, stage names)
 * untouched, and never throws — an alert must not become a second failure.
 *
 * Deliberately a DENY rule, not an allow-list: an allow-list silently drops the
 * operational detail a new alert adds, which would make future alerts less
 * useful and push authors back toward passing raw objects.
 */
export function redactDetails(value, depth = 0) {
  if (depth > 4) return REDACTED;
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redactDetails(v, depth + 1));
  if (typeof value === 'string') return EMAIL_IN_VALUE.test(value) ? REDACTED : value;
  if (typeof value !== 'object') return value;
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    out[key] = IDENTIFYING_KEY.test(key) ? REDACTED : redactDetails(raw, depth + 1);
  }
  return out;
}

export function operatorAlertRecipients(env = process.env) {
  return String(env.ADMIN_EMAILS || '')
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);
}

export function operatorAlertStatus(env = process.env) {
  const recipients = operatorAlertRecipients(env);
  return {
    channel: 'email',
    recipientsConfigured: recipients.length,
    senderConfigured: Boolean(env.RESEND_API_KEY),
    // Unconfigured does NOT mean unreported: the stderr record is always
    // written. It means no one is paged.
    configured: recipients.length > 0 && Boolean(env.RESEND_API_KEY),
  };
}

/**
 * Emit an operator alert. Resolves to a result object; never rejects.
 *
 * @returns {Promise<{kind: string, logged: true, emailed: boolean, reason: string|null}>}
 */
export async function emitOperatorAlert(
  { kind, severity = 'critical', summary, details = {} } = {},
  { env = process.env, sendEmail = defaultSendEmail, logger = console } = {},
) {
  const at = new Date().toISOString();
  // Redact ONCE, here, so the stderr record and the outbound email can never
  // disagree about what left the platform.
  let safeDetails;
  try {
    safeDetails = redactDetails(details);
  } catch {
    // A details object that cannot be walked is not worth losing the alert
    // over, but it must not be forwarded unexamined either.
    safeDetails = { redaction: 'failed', note: 'details omitted', original: details };
  }
  const record = {
    kind: kind || 'unspecified',
    severity,
    // Free text on the same wire — held to the same value rule.
    summary: typeof summary === 'string' ? redactDetails(summary) : (summary || ''),
    releaseSha: releaseSha(env),
    at,
    details: safeDetails,
  };

  try {
    logger.error?.(`[operator-alert] ${JSON.stringify(record)}`);
  } catch {
    // A logger that throws must not take the alert path down with it.
  }

  const recipients = operatorAlertRecipients(env);
  if (!recipients.length) {
    return { kind: record.kind, logged: true, emailed: false, reason: 'no_recipients' };
  }

  try {
    const lines = [
      `Severity: ${severity}`,
      `Kind: ${record.kind}`,
      `Release: ${record.releaseSha}`,
      `At: ${at}`,
      '',
      record.summary,
      '',
      // record.details is the REDACTED copy. Reading `details` here would
      // redact the log line and still mail the raw object to the processor —
      // a correction nothing consumes.
      ...Object.entries(record.details || {}).map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
    ];
    const result = await sendEmail({
      to: recipients,
      subject: `[GeneMap ${severity}] ${record.kind}`,
      text: lines.join('\n'),
    });
    return {
      kind: record.kind,
      logged: true,
      emailed: result?.ok === true,
      reason: result?.ok === true ? null : (result?.reason || 'Email failed to send'),
    };
  } catch (error) {
    // sendEmail is documented never to throw; if it ever does, the stderr
    // record above is still the trail, and the caller's error is unchanged.
    try {
      logger.error?.(`[operator-alert] delivery threw: ${error?.message || error}`);
    } catch {
      logger.error?.('Logger failure detected');
    }
    return { kind: record.kind, logged: true, emailed: false, reason: 'send_threw' };
  }
}
