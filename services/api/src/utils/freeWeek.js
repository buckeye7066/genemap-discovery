/**
 * freeWeek.js — global "Free Week" promotional access window.
 *
 * When the window is ACTIVE, every authenticated user is treated as Premium
 * (unlimited usage, all gated education features), regardless of whether they
 * hold a paid subscription. This is the owner's "give the app away for a week"
 * switch.
 *
 * Controlled entirely by environment variables so it can be flipped on and off
 * in the hosting dashboard (Railway) with no code deploy, and it SELF-EXPIRES —
 * there is no scheduler or cleanup job to remember.
 *
 *   FREE_WEEK_ENABLED   "true" to arm the promotion (default: off)
 *   FREE_WEEK_START     ISO date/time the window opens (optional; if omitted,
 *                       the window is open as soon as it is enabled)
 *   FREE_WEEK_END       ISO date/time the window closes (optional; if omitted,
 *                       defaults to 7 days after START)
 *   FREE_WEEK_LABEL     Optional banner text shown to users while active.
 *
 * Pure + dependency-free. Never reads process.env itself — the caller passes an
 * env-like object — so the same function works in Node and in unit tests.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DURATION_MS = 7 * DAY_MS;
const TRUE_VALUES = new Set(['1', 'true', 'yes', 'y', 'on']);

function isTruthy(value) {
  return TRUE_VALUES.has(String(value ?? '').trim().toLowerCase());
}

function parseTimestamp(value) {
  if (!value) return null;
  const t = Date.parse(String(value));
  return Number.isNaN(t) ? null : t;
}

export function computeFreeWeekStatus(env = {}, now = Date.now()) {
  const enabled = isTruthy(env.FREE_WEEK_ENABLED);
  if (!enabled) {
    return { active: false, enabled: false, start: null, end: null, label: null };
  }

  const start = parseTimestamp(env.FREE_WEEK_START) ?? now;
  const end = parseTimestamp(env.FREE_WEEK_END) ?? start + DEFAULT_DURATION_MS;
  const active = now >= start && now < end;
  const label =
    (env.FREE_WEEK_LABEL && String(env.FREE_WEEK_LABEL).trim()) ||
    'Free Week — every Premium feature is unlocked, on the house. 🎉';

  return {
    active,
    enabled: true,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    label: active ? label : null,
  };
}

export function isFreeWeekActive(env = {}, now = Date.now()) {
  return computeFreeWeekStatus(env, now).active;
}

const SIGNUP_GRANT_DAYS = { week: 7, month: 30 };

/**
 * The per-signup grant. When the Free Week window is active, a user who signs
 * up should get their OWN full free period starting now — so someone who joins
 * on the last day of the promo still gets a complete trial instead of a few
 * hours. Returns { period, days, until } or null when the promo is off or
 * signup grants are disabled.
 *
 *   FREE_WEEK_SIGNUP_PERIOD = 'week' (default) | 'month' | 'none'
 */
export function freeWeekSignupGrant(env = {}, now = Date.now()) {
  if (!isFreeWeekActive(env, now)) return null;
  const raw = String(env.FREE_WEEK_SIGNUP_PERIOD ?? 'week').trim().toLowerCase();
  if (['none', 'off', 'false', '0', 'no'].includes(raw)) return null;
  const period = SIGNUP_GRANT_DAYS[raw] ? raw : 'week';
  const days = SIGNUP_GRANT_DAYS[period];
  return { period, days, until: new Date(now + days * 86400000).toISOString() };
}
