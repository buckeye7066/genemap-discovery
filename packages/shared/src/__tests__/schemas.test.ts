import { describe, expect, it } from 'vitest';
import { institutionalCheckoutSchema, userSchema } from '../schemas.js';

const entitlement = {
  tier: 'institutional' as const,
  isPremium: true,
  isInstitutional: true,
  isAdmin: false,
  features: ['education.ai', 'health.records'],
  limits: null,
  access: {
    source: 'institutional' as const,
    expiresAt: '2027-01-01T00:00:00.000Z',
    canManageBilling: false,
  },
  licenseInfo: {
    organizationName: 'Example Institute',
    licenseType: 'department',
    accessType: 'seat' as const,
  },
};

describe('shared request and response schemas', () => {
  it('validates the complete entitlement object returned by auth', () => {
    const result = userSchema.parse({
      id: 'f1745cbf-3291-4f0f-95d8-f4bd0f8bf047',
      email: 'member@example.com',
      role: 'user',
      entitlements: entitlement,
    });

    expect(result.entitlements).toEqual(entitlement);
  });

  it('does not silently accept a partial entitlement response', () => {
    expect(() => userSchema.parse({
      id: 'f1745cbf-3291-4f0f-95d8-f4bd0f8bf047',
      email: 'member@example.com',
      role: 'user',
      entitlements: { isPremium: true },
    })).toThrow();
  });

  it('normalizes institutional billing identity at the shared boundary', () => {
    const result = institutionalCheckoutSchema.parse({
      organizationName: '  Example Institute  ',
      contactEmail: '  BILLING@EXAMPLE.COM  ',
      licenseType: 'team',
      billing: 'monthly',
      seats: 5,
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    });

    expect(result.organizationName).toBe('Example Institute');
    expect(result.contactEmail).toBe('billing@example.com');
  });
});
