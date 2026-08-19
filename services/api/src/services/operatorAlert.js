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
 */
import { sendEmail as defaultSendEmail } from './email.js';
import { releaseSha } from '../config/releaseIdentity.js';

export const LEDGER_WRITE_FAILURE = 'account_closure_ledger_write_failed';

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
  const record = {
    kind: kind || 'unspecified',
    severity,
    summary: summary || '',
    releaseSha: releaseSha(env),
    at,
    details,
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
      summary || '',
      '',
      ...Object.entries(details).map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
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
      reason: result?.ok === true ? null : (result?.reason || 'send_failed'),
    };
  } catch (error) {
    // sendEmail is documented never to throw; if it ever does, the stderr
    // record above is still the trail, and the caller's error is unchanged.
    try {
      logger.error?.(`[operator-alert] delivery threw: ${error?.message || error}`);
    } catch { /* ignore */ }
    return { kind: record.kind, logged: true, emailed: false, reason: 'send_threw' };
  }
}
