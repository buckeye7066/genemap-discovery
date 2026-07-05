/**
 * signupTrial.js — the always-on NEW-USER free trial.
 *
 * Every newly-registered user gets their own free period starting at signup
 * (the timer runs from account creation, self-expiring via the same
 * `admin_granted` Subscription row the admin "grant free period" feature uses
 * — see utils/freePeriod.js). ON by default: only an explicit falsey value
 * turns it off, so a fresh deploy gives every new user 7 free days with no env
 * configuration required.
 *
 *   SIGNUP_TRIAL_ENABLED = 'true' (default) | 'false'/'off'/'0'/'no'/'none' to disable
 *   SIGNUP_TRIAL_PERIOD  = 'week' (default, 7 days) | 'month' (30 days) | 'none'/off to disable
 *
 * Deliberately independent of any global promotional toggle (e.g. a
 * time-boxed "give the app away" promo some sibling apps have) — this trial
 * always runs regardless of whether such a promo exists or is armed.
 *
 * Pure + dependency-free: never reads process.env itself — the caller passes
 * an env-like object — so this is trivially unit-testable.
 */

const SIGNUP_TRIAL_DAYS = Object.freeze({ week: 7, month: 30 });
const DISABLE_VALUES = new Set(['false', 'off', '0', 'no', 'none']);

function isDisabled(value) {
  return DISABLE_VALUES.has(String(value ?? '').trim().toLowerCase());
}

/**
 * Resolve the signup trial grant from an env-like object.
 *
 * @param {Record<string, string|undefined>} env
 * @param {number} now epoch millis (injectable for tests)
 * @returns {{period: 'week'|'month', days: number, until: string}|null}
 */
export function signupTrialGrant(env = {}, now = Date.now()) {
  if (isDisabled(env.SIGNUP_TRIAL_ENABLED ?? 'true')) return null;

  const raw = String(env.SIGNUP_TRIAL_PERIOD ?? 'week').trim().toLowerCase();
  if (isDisabled(raw)) return null;

  const period = SIGNUP_TRIAL_DAYS[raw] ? raw : 'week';
  const days = SIGNUP_TRIAL_DAYS[period];
  return { period, days, until: new Date(now + days * 86400000).toISOString() };
}
