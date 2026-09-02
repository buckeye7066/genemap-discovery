import { describe, expect, it } from 'vitest';
import { buildRenewalAlerts } from '../RenewalNotifications';

const NOW = new Date('2026-09-02T12:00:00.000Z');

function license(overrides = {}) {
  return {
    id: 'license-1',
    organizationName: 'Example Institute',
    endDate: '2026-09-09T12:00:00.000Z',
    autoRenew: false,
    canManageBilling: true,
    ...overrides,
  };
}

describe('institutional renewal state', () => {
  it('uses camel-case API fields and offers the real Stripe portal before expiry', () => {
    expect(buildRenewalAlerts([license()], NOW)).toEqual([
      expect.objectContaining({
        severity: 'critical',
        title: 'Example Institute ends in 7 days',
        action: 'portal',
      }),
    ]);
  });

  it('describes signed-webhook auto-renewal as scheduled instead of guaranteed', () => {
    const [alert] = buildRenewalAlerts([license({ autoRenew: true })], NOW);
    expect(alert.title).toBe('Example Institute renews in 7 days');
    expect(alert.detail).toMatch(/scheduled.*signed webhook/iu);
  });

  it('routes an expired license to a new institutional checkout', () => {
    const [alert] = buildRenewalAlerts([
      license({ endDate: '2026-09-01T12:00:00.000Z' }),
    ], NOW);
    expect(alert).toMatchObject({ severity: 'expired', action: 'purchase' });
  });

  it('omits licenses outside the 30-day notification window', () => {
    expect(buildRenewalAlerts([
      license({ endDate: '2026-11-01T12:00:00.000Z' }),
    ], NOW)).toEqual([]);
  });
});
