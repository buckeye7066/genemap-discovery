import { describe, expect, it } from 'vitest';
import {
  annualSavingsPercent,
  formatBillingPrice,
  lowestInstitutionalMonthlyPrice,
} from '../billingCatalog.js';

describe('verified billing catalog display', () => {
  it('formats Stripe minor units without inventing a fallback price', () => {
    expect(formatBillingPrice({ currency: 'usd', amountMinor: 999 })).toMatch(/9\.99/u);
    expect(formatBillingPrice({ currency: '', amountMinor: 999 })).toBeNull();
    expect(formatBillingPrice(null)).toBeNull();
  });

  it('derives savings only from compatible verified prices', () => {
    expect(annualSavingsPercent(
      { currency: 'usd', amountMinor: 999 },
      { currency: 'usd', amountMinor: 9999 },
    )).toBe(17);
    expect(annualSavingsPercent(
      { currency: 'usd', amountMinor: 999 },
      { currency: 'eur', amountMinor: 9999 },
    )).toBeNull();
  });

  it('finds the actual lowest institutional monthly unit price', () => {
    expect(lowestInstitutionalMonthlyPrice({
      institutional: {
        team: { monthly: { currency: 'usd', amountMinor: 799 } },
        enterprise: { monthly: { currency: 'usd', amountMinor: 599 } },
      },
    })).toEqual({ currency: 'usd', amountMinor: 599 });
  });
});
