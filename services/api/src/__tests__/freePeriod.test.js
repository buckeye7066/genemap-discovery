import { describe, it, expect, beforeEach } from 'vitest';
import { createPrismaMock } from './setup.js';
import { FREE_PERIOD_DAYS, computeFreePeriodEnd, grantOrExtendFreePeriod } from '../utils/freePeriod.js';

const DAY = 24 * 60 * 60 * 1000;

describe('computeFreePeriodEnd', () => {
  it('extends from now when there is no existing window', () => {
    const now = Date.now();
    const end = computeFreePeriodEnd(null, 7, now);
    expect(end.getTime()).toBe(now + 7 * DAY);
  });

  it('extends from the existing end when it is still in the future (never shortens)', () => {
    const now = Date.now();
    const existing = new Date(now + 10 * DAY);
    const end = computeFreePeriodEnd(existing, 7, now);
    expect(end.getTime()).toBe(existing.getTime() + 7 * DAY);
  });

  it('extends from now when the existing window has already lapsed', () => {
    const now = Date.now();
    const expired = new Date(now - DAY);
    const end = computeFreePeriodEnd(expired, 7, now);
    expect(end.getTime()).toBe(now + 7 * DAY);
  });
});

describe('grantOrExtendFreePeriod', () => {
  let prisma;

  beforeEach(() => {
    prisma = createPrismaMock();
    prisma._store.user.push({ id: 'u1', email: 'u1@test.com', role: 'user', banned: false });
  });

  it('creates a fresh admin_granted subscription when none exists', async () => {
    const before = Date.now();
    const end = await grantOrExtendFreePeriod(prisma, 'u1', FREE_PERIOD_DAYS.week);

    expect(end.getTime()).toBeGreaterThan(before + 7 * DAY - 5000);
    expect(end.getTime()).toBeLessThan(before + 7 * DAY + 5000);

    const subs = prisma._store.subscription.filter((s) => s.userId === 'u1');
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ status: 'active', planType: 'admin_granted' });
  });

  it('extends (does not duplicate) an existing active admin_granted comp', async () => {
    const existingEnd = new Date(Date.now() + 3 * DAY);
    prisma._store.subscription.push({
      id: 'existing', userId: 'u1', status: 'active', planType: 'admin_granted',
      currentPeriodEnd: existingEnd, createdAt: new Date(),
    });

    const end = await grantOrExtendFreePeriod(prisma, 'u1', FREE_PERIOD_DAYS.week);

    const subs = prisma._store.subscription.filter((s) => s.userId === 'u1');
    expect(subs).toHaveLength(1);
    expect(end.getTime()).toBeGreaterThan(existingEnd.getTime() + 7 * DAY - 5000);
  });

  it('does not touch a real (non admin_granted) Stripe subscription — creates a separate comp row', async () => {
    const stripeEnd = new Date(Date.now() + 20 * DAY);
    prisma._store.subscription.push({
      id: 'stripe-sub', userId: 'u1', status: 'active', planType: 'month',
      currentPeriodEnd: stripeEnd, createdAt: new Date(),
    });

    await grantOrExtendFreePeriod(prisma, 'u1', FREE_PERIOD_DAYS.week);

    const subs = prisma._store.subscription.filter((s) => s.userId === 'u1');
    expect(subs).toHaveLength(2);
    const stripeSub = subs.find((s) => s.planType === 'month');
    expect(stripeSub.currentPeriodEnd).toBe(stripeEnd);
  });

  it('grants two different users two independent (per-user) subscription rows', async () => {
    prisma._store.user.push({ id: 'u2', email: 'u2@test.com', role: 'user', banned: false });

    await grantOrExtendFreePeriod(prisma, 'u1', FREE_PERIOD_DAYS.week);
    await grantOrExtendFreePeriod(prisma, 'u2', FREE_PERIOD_DAYS.week);

    const u1Subs = prisma._store.subscription.filter((s) => s.userId === 'u1');
    const u2Subs = prisma._store.subscription.filter((s) => s.userId === 'u2');
    expect(u1Subs).toHaveLength(1);
    expect(u2Subs).toHaveLength(1);
    expect(u1Subs[0].id).not.toBe(u2Subs[0].id);
  });
});
