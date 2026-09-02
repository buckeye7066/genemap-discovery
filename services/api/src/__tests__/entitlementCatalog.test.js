import { describe, expect, it, vi } from 'vitest';
import { FEATURES, TIERS } from '../config/entitlementCatalog.js';
import { requireFeature, resolveEntitlements, __test } from '../middleware/entitlements.js';

const NOW = new Date('2026-09-02T12:00:00Z');

function baseUser(role = 'user') {
  return { id: 'user-a', email: 'a@example.com', role };
}

describe('canonical tier resolution', () => {
  it('keeps free users out of research, health records, and profile assistants', () => {
    const result = __test.resolvedEntitlements({
      user: baseUser(),
      subscription: null,
      licenseAssignment: null,
      now: NOW,
    });
    expect(result.tier).toBe(TIERS.FREE);
    expect(result.features).not.toContain(FEATURES.RESEARCH_SEARCH);
    expect(result.features).not.toContain(FEATURES.HEALTH_RECORDS);
    expect(result.features).not.toContain(FEATURES.PROFILE_ASSISTANTS);
  });

  it('grants the complete premium feature set to an active personal subscription', () => {
    const result = __test.resolvedEntitlements({
      user: baseUser(),
      subscription: {
        status: 'active',
        planType: 'month',
        stripeCustomerId: 'cus_paid',
        stripeSubscriptionId: 'sub_paid',
        currentPeriodEnd: new Date('2026-10-01T00:00:00Z'),
      },
      licenseAssignment: null,
      now: NOW,
    });
    expect(result.tier).toBe(TIERS.PREMIUM);
    expect(result.features).toEqual(expect.arrayContaining([
      FEATURES.RESEARCH_SEARCH,
      FEATURES.RESEARCH_WORKSPACE,
      FEATURES.GENOMICS_TOOLS,
      FEATURES.HEALTH_RECORDS,
      FEATURES.PROFILE_ASSISTANTS,
    ]));
    expect(result.access).toEqual({
      source: 'subscription',
      expiresAt: '2026-10-01T00:00:00.000Z',
      canManageBilling: true,
    });
  });

  it('labels an admin-granted window as complimentary instead of paid', () => {
    const result = __test.resolvedEntitlements({
      user: baseUser(),
      subscription: {
        status: 'active',
        planType: 'admin_granted',
        currentPeriodEnd: new Date('2026-09-09T12:00:00Z'),
      },
      licenseAssignment: null,
      now: NOW,
    });

    expect(result.tier).toBe(TIERS.PREMIUM);
    expect(result.access).toEqual({
      source: 'complimentary',
      expiresAt: '2026-09-09T12:00:00.000Z',
      canManageBilling: false,
    });
  });

  it('rejects active-looking subscription rows without a finite future expiry', () => {
    const result = __test.resolvedEntitlements({
      user: baseUser(),
      subscription: {
        status: 'active',
        planType: 'month',
        stripeCustomerId: 'cus_missing_period',
        stripeSubscriptionId: 'sub_missing_period',
        currentPeriodEnd: null,
      },
      licenseAssignment: null,
      now: NOW,
    });
    expect(result.tier).toBe(TIERS.FREE);
    expect(result.features).not.toContain(FEATURES.HEALTH_RECORDS);
  });

  it('rejects unknown active plan labels even when their dates look current', () => {
    const result = __test.resolvedEntitlements({
      user: baseUser(),
      subscription: {
        status: 'active',
        planType: 'legacy_unlimited',
        stripeCustomerId: 'cus_unknown',
        stripeSubscriptionId: 'sub_unknown',
        currentPeriodEnd: new Date('2027-01-01T00:00:00Z'),
      },
      licenseAssignment: null,
      now: NOW,
    });
    expect(result.tier).toBe(TIERS.FREE);
    expect(result.features).not.toContain(FEATURES.PROFILE_ASSISTANTS);
  });

  it('does not treat an expired institutional license as active', () => {
    const licenseAssignment = {
      status: 'active',
      license: {
        status: 'active',
        endDate: new Date('2026-09-01T00:00:00Z'),
        organizationName: 'Expired University',
        licenseType: 'department',
      },
    };
    expect(__test.activeInstitutionalAccess(licenseAssignment, NOW)).toBe(false);
    expect(__test.resolvedEntitlements({
      user: baseUser(),
      subscription: null,
      licenseAssignment,
      now: NOW,
    }).tier).toBe(TIERS.FREE);
  });

  it('does not activate a future-dated institutional license early', () => {
    const futureAssignment = {
      status: 'active',
      license: {
        status: 'active',
        startDate: new Date('2026-09-03T00:00:00Z'),
        endDate: new Date('2027-09-03T00:00:00Z'),
        organizationName: 'Future University',
        licenseType: 'department',
      },
    };
    expect(__test.activeInstitutionalAccess(futureAssignment, NOW)).toBe(false);
    expect(__test.resolvedEntitlements({
      user: baseUser(),
      subscription: null,
      licenseAssignment: futureAssignment,
      now: NOW,
    }).tier).toBe(TIERS.FREE);
  });

  it('keeps assigned seats out of license management while granting it to owners and admins', () => {
    const activeSeat = {
      status: 'active',
      accessType: 'seat',
      license: {
        status: 'active',
        endDate: new Date('2027-01-01T00:00:00Z'),
        organizationName: 'Example University',
        licenseType: 'department',
      },
    };
    const seat = __test.resolvedEntitlements({
      user: baseUser(),
      subscription: null,
      licenseAssignment: activeSeat,
      now: NOW,
    });
    const managedLicense = {
      ...activeSeat.license,
      stripeCustomerId: 'cus_institution_owner',
    };
    const owner = __test.resolvedEntitlements({
      user: baseUser(),
      subscription: null,
      licenseAccess: { status: 'active', accessType: 'administrator', license: managedLicense },
      managedLicense,
      now: NOW,
    });
    const admin = __test.resolvedEntitlements({
      user: baseUser('admin'),
      subscription: null,
      licenseAssignment: null,
      now: NOW,
    });
    expect(seat.tier).toBe(TIERS.INSTITUTIONAL);
    expect(seat.features).not.toContain(FEATURES.INSTITUTION_MANAGEMENT);
    expect(owner.tier).toBe(TIERS.INSTITUTIONAL);
    expect(owner.features).toContain(FEATURES.INSTITUTION_MANAGEMENT);
    expect(owner.licenseInfo.accessType).toBe('administrator');
    expect(owner.access.canManageBilling).toBe(true);
    expect(admin.tier).toBe(TIERS.ADMIN);
    expect(admin.features).toContain(FEATURES.INSTITUTION_MANAGEMENT);
  });

  it('lets a historical license owner reach management without restoring expired seat access', () => {
    const expiredManagedLicense = {
      status: 'expired',
      endDate: new Date('2026-09-01T00:00:00Z'),
      organizationName: 'Expired University',
      licenseType: 'department',
      stripeCustomerId: 'cus_expired_owner',
    };
    const result = __test.resolvedEntitlements({
      user: baseUser(),
      subscription: null,
      licenseAccess: null,
      managedLicense: expiredManagedLicense,
      now: NOW,
    });

    expect(result.tier).toBe(TIERS.FREE);
    expect(result.isInstitutional).toBe(false);
    expect(result.features).toContain(FEATURES.INSTITUTION_MANAGEMENT);
    expect(result.access).toMatchObject({ source: 'free', canManageBilling: true });
  });

  it('uses a valid institutional assignment even when a newer row is expired', async () => {
    const prisma = {
      user: { findUnique: vi.fn(async () => ({ ...baseUser(), subscriptions: [] })) },
      licenseAssignment: {
        findMany: vi.fn(async () => [
          {
            status: 'active', createdAt: new Date('2026-09-01T00:00:00Z'),
            license: {
              status: 'active', endDate: new Date('2026-09-01T00:00:00Z'),
              organizationName: 'Expired University', licenseType: 'department',
            },
          },
          {
            status: 'active', createdAt: new Date('2026-08-01T00:00:00Z'),
            license: {
              status: 'active', endDate: new Date('2027-09-01T00:00:00Z'),
              organizationName: 'Current University', licenseType: 'department',
            },
          },
        ]),
      },
      institutionalLicense: { findFirst: vi.fn(async () => null) },
    };

    const result = await resolveEntitlements(prisma, 'user-a', { now: NOW });

    expect(result.tier).toBe(TIERS.INSTITUTIONAL);
    expect(result.licenseInfo.organizationName).toBe('Current University');
    expect(result.licenseInfo.accessType).toBe('seat');
  });

  it('prefers an active Stripe subscription over a newer complimentary row for billing state', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn(async () => ({
          ...baseUser(),
          subscriptions: [
            {
              planType: 'admin_granted',
              status: 'active',
              currentPeriodEnd: new Date('2026-09-09T00:00:00Z'),
            },
            {
              planType: 'month',
              stripeCustomerId: 'cus_paid',
              stripeSubscriptionId: 'sub_paid',
              status: 'active',
              currentPeriodEnd: new Date('2026-10-02T00:00:00Z'),
            },
          ],
        })),
      },
      licenseAssignment: { findMany: vi.fn(async () => []) },
      institutionalLicense: { findFirst: vi.fn(async () => null) },
    };

    const result = await resolveEntitlements(prisma, 'user-a', { now: NOW });

    expect(result.access).toEqual({
      source: 'subscription',
      expiresAt: '2026-10-02T00:00:00.000Z',
      canManageBilling: true,
    });
  });
});

describe('server feature guard', () => {
  it('denies a direct free-tier API request with machine-readable tier details', async () => {
    const request = {
      user: { userId: 'user-a' },
      server: {
        prisma: {
          user: { findUnique: vi.fn(async () => ({ ...baseUser(), subscriptions: [] })) },
          licenseAssignment: { findFirst: vi.fn(async () => null) },
        },
      },
    };
    const guard = requireFeature(FEATURES.HEALTH_RECORDS);
    await expect(guard(request)).rejects.toMatchObject({
      statusCode: 403,
      code: 'ENTITLEMENT_REQUIRED',
      entitlement: {
        feature: FEATURES.HEALTH_RECORDS,
        requiredTier: TIERS.PREMIUM,
        currentTier: TIERS.FREE,
      },
    });
  });

  it('allows the same API guard for a premium user', async () => {
    const request = {
      user: { userId: 'user-a' },
      server: {
        prisma: {
          user: {
            findUnique: vi.fn(async () => ({
              ...baseUser(),
              subscriptions: [{
                status: 'active',
                planType: 'month',
                stripeCustomerId: 'cus_paid',
                stripeSubscriptionId: 'sub_paid',
                currentPeriodEnd: new Date('2026-10-01T00:00:00Z'),
              }],
            })),
          },
          licenseAssignment: { findFirst: vi.fn(async () => null) },
        },
      },
    };
    await expect(requireFeature(FEATURES.HEALTH_RECORDS)(request)).resolves.toBeUndefined();
    expect(request.entitlements.tier).toBe(TIERS.PREMIUM);
  });
});
