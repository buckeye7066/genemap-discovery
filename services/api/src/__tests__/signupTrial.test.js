import { describe, it, expect } from 'vitest';
import { signupTrialGrant } from '../utils/signupTrial.js';

const T0 = Date.parse('2026-07-05T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

describe('signupTrialGrant (always-on new-signup trial)', () => {
  it('is ON by default with no env configuration', () => {
    const g = signupTrialGrant({}, T0);
    expect(g).toMatchObject({ period: 'week', days: 7 });
    expect(Date.parse(g.until)).toBe(T0 + 7 * DAY);
  });

  it('grants a full week from now regardless of any other promo flag', () => {
    // A sibling/global promo toggle (e.g. FREE_WEEK_ENABLED) must have zero
    // effect on this — it is independent of any such flag.
    const g = signupTrialGrant({ FREE_WEEK_ENABLED: 'false' }, T0);
    expect(g).toMatchObject({ period: 'week', days: 7 });
  });

  it('is disabled by SIGNUP_TRIAL_ENABLED=false/off/0/no/none', () => {
    for (const value of ['false', 'off', '0', 'no', 'none', 'FALSE', ' Off ']) {
      expect(signupTrialGrant({ SIGNUP_TRIAL_ENABLED: value }, T0)).toBe(null);
    }
  });

  it('stays enabled for any truthy/unrecognized SIGNUP_TRIAL_ENABLED value', () => {
    expect(signupTrialGrant({ SIGNUP_TRIAL_ENABLED: 'true' }, T0)).not.toBe(null);
    expect(signupTrialGrant({ SIGNUP_TRIAL_ENABLED: 'yes' }, T0)).not.toBe(null);
  });

  it('honors SIGNUP_TRIAL_PERIOD=month', () => {
    const g = signupTrialGrant({ SIGNUP_TRIAL_PERIOD: 'month' }, T0);
    expect(g).toMatchObject({ period: 'month', days: 30 });
    expect(Date.parse(g.until)).toBe(T0 + 30 * DAY);
  });

  it('SIGNUP_TRIAL_PERIOD=none disables the grant even though SIGNUP_TRIAL_ENABLED is on', () => {
    expect(signupTrialGrant({ SIGNUP_TRIAL_PERIOD: 'none' }, T0)).toBe(null);
  });

  it('falls back to "week" for an unrecognized period value', () => {
    const g = signupTrialGrant({ SIGNUP_TRIAL_PERIOD: 'decade' }, T0);
    expect(g).toMatchObject({ period: 'week', days: 7 });
  });

  it('is case/whitespace tolerant', () => {
    expect(signupTrialGrant({ SIGNUP_TRIAL_PERIOD: '  MONTH  ' }, T0)).toMatchObject({ period: 'month' });
  });
});
