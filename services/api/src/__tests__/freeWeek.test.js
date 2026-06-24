import { describe, it, expect } from 'vitest';
import { computeFreeWeekStatus, isFreeWeekActive } from '../utils/freeWeek.js';

const T0 = Date.parse('2026-06-24T12:00:00Z');

describe('freeWeek promotion', () => {
  it('is off by default', () => {
    expect(isFreeWeekActive({}, T0)).toBe(false);
    expect(computeFreeWeekStatus({}, T0)).toMatchObject({ active: false, enabled: false });
  });

  it('is off unless explicitly enabled', () => {
    expect(isFreeWeekActive({ FREE_WEEK_ENABLED: 'no' }, T0)).toBe(false);
  });

  it('activates immediately when enabled with no dates', () => {
    expect(isFreeWeekActive({ FREE_WEEK_ENABLED: 'true' }, T0)).toBe(true);
  });

  it('defaults to a 7-day window and self-expires', () => {
    const env = { FREE_WEEK_ENABLED: 'true', FREE_WEEK_START: '2026-06-24T00:00:00Z' };
    const DAY = 24 * 60 * 60 * 1000;
    expect(isFreeWeekActive(env, Date.parse('2026-06-27T00:00:00Z'))).toBe(true);
    expect(isFreeWeekActive(env, Date.parse('2026-06-24T00:00:00Z') + 7 * DAY + 1)).toBe(false);
  });

  it('honors explicit start/end bounds', () => {
    const env = {
      FREE_WEEK_ENABLED: 'true',
      FREE_WEEK_START: '2026-06-25T00:00:00Z',
      FREE_WEEK_END: '2026-07-02T00:00:00Z',
    };
    expect(isFreeWeekActive(env, Date.parse('2026-06-24T12:00:00Z'))).toBe(false);
    expect(isFreeWeekActive(env, Date.parse('2026-06-28T12:00:00Z'))).toBe(true);
    expect(isFreeWeekActive(env, Date.parse('2026-07-02T00:00:01Z'))).toBe(false);
  });
});
