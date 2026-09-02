import { describe, expect, it } from 'vitest';
import { upgradeUrl, userHasFeature } from '../tierAccess.js';

describe('tier-aware page access', () => {
  it('uses only server-issued feature keys for ordinary users', () => {
    const freeUser = {
      role: 'user',
      entitlements: { tier: 'free', features: ['education.catalog'] },
    };
    const premiumUser = {
      role: 'user',
      entitlements: { tier: 'premium', features: ['education.catalog', 'health.records'] },
    };
    expect(userHasFeature(freeUser, 'health.records')).toBe(false);
    expect(userHasFeature(premiumUser, 'health.records')).toBe(true);
  });

  it('does not infer paid access from a client-only boolean', () => {
    expect(userHasFeature({ role: 'user', isPremium: true }, 'research.search')).toBe(false);
  });

  it('keeps role-authorized administrators available during profile hydration', () => {
    expect(userHasFeature({ role: 'admin' }, 'institution.manage')).toBe(true);
    expect(userHasFeature({ role: 'super_admin' }, 'health.records')).toBe(true);
  });

  it('creates a feature-specific upgrade destination', () => {
    expect(upgradeUrl('assistants.profile_context')).toBe('/premium?feature=assistants.profile_context');
  });
});
