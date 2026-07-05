/**
 * freePeriod.js — shared logic for granting a complimentary ("admin_granted")
 * premium window to a single user.
 *
 * This is the ONE place that knows how to extend/create the `admin_granted`
 * Subscription row for a user. Both the admin "grant free period" endpoint
 * (routes/admin.js) and the always-on new-signup trial (routes/auth.js, via
 * utils/signupTrial.js) call `grantOrExtendFreePeriod` so a user can never end
 * up with two competing comp rows, and a second grant EXTENDS the window
 * rather than stacking a duplicate subscription on top of it.
 */

// Complimentary access windows that can be granted. Kept as whole days so the
// expiry is unambiguous regardless of the hour the grant is issued.
export const FREE_PERIOD_DAYS = { week: 7, month: 30 };

/**
 * Compute the new expiry for a complimentary access window.
 *
 * Never shortens an existing window: if the user already has access that runs
 * past what this grant would give, we keep the later date. Otherwise we extend
 * from whichever is later — "now" or the current end — so repeated grants stack
 * cleanly instead of overlapping.
 */
export function computeFreePeriodEnd(currentEnd, days, now = Date.now()) {
  const base = currentEnd && currentEnd.getTime() > now ? currentEnd.getTime() : now;
  return new Date(base + days * 24 * 60 * 60 * 1000);
}

/**
 * Grant (or extend) a single user's complimentary `admin_granted` Subscription
 * row by `days`. Reuses an existing active admin-granted comp so repeat grants
 * stack onto ONE row instead of spawning a new subscription each time — the
 * same semantics whether the grant came from an admin action or the automatic
 * new-signup trial. Real Stripe-owned subscriptions (planType month/year/
 * team_*) are never touched.
 *
 * @returns {Promise<Date>} the resulting currentPeriodEnd
 */
export async function grantOrExtendFreePeriod(prisma, userId, days, now = Date.now()) {
  const existingComp = await prisma.subscription.findFirst({
    where: { userId, status: 'active', planType: 'admin_granted' },
    orderBy: { createdAt: 'desc' },
  });

  const newEnd = computeFreePeriodEnd(existingComp?.currentPeriodEnd ?? null, days, now);

  if (existingComp) {
    await prisma.subscription.update({
      where: { id: existingComp.id },
      data: { currentPeriodEnd: newEnd },
    });
  } else {
    await prisma.subscription.create({
      data: {
        userId,
        status: 'active',
        planType: 'admin_granted',
        currentPeriodEnd: newEnd,
      },
    });
  }

  return newEnd;
}
