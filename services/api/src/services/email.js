// Transactional email sender (Resend).
//
// Intentionally defensive: a failure to send an email must NEVER bubble up and
// break the request it was triggered from. Every path returns a small result
// object and swallows errors. When RESEND_API_KEY is absent (local dev/tests)
// we return an explicit skipped result so callers and logs can distinguish a
// deliberately unconfigured sender from a successful delivery.

import { Resend } from 'resend';

let client = null;

function getClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!client) {
    client = new Resend(apiKey);
  }
  return client;
}

/**
 * Send a transactional email. Never throws.
 *
 * @param {object} params
 * @param {string|string[]} params.to   recipient(s)
 * @param {string} params.subject       subject line
 * @param {string} [params.html]        HTML body
 * @param {string} [params.text]        plain-text body
 * @returns {Promise<{ok: boolean, skipped?: boolean, reason?: string, id?: string, error?: unknown}>}
 */
export async function sendEmail({ to, subject, html, text } = {}) {
  try {
    const resend = getClient();
    if (!resend) {
      console.warn('[email] RESEND_API_KEY not set — skipping send', { to, subject });
      return { ok: false, skipped: true, reason: 'no_api_key' };
    }
    const from = process.env.EMAIL_FROM || 'GeneMap <noreply@genemap.app>';
    const result = await resend.emails.send({ from, to, subject, html, text });
    if (result && result.error) {
      console.error('[email] send failed', result.error);
      return { ok: false, error: result.error };
    }
    return { ok: true, id: result?.data?.id };
  } catch (err) {
    console.error('[email] send threw', err);
    return { ok: false, error: String(err?.message || err) };
  }
}
