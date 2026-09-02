export function formatBillingPrice(price, locale) {
  if (
    !price
    || !Number.isInteger(price.amountMinor)
    || price.amountMinor < 0
    || typeof price.currency !== 'string'
    || !price.currency.trim()
  ) return null;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: price.currency.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price.amountMinor / 100);
  } catch {
    return null;
  }
}

export function annualSavingsPercent(monthly, yearly) {
  if (
    !monthly
    || !yearly
    || monthly.currency !== yearly.currency
    || !Number.isInteger(monthly.amountMinor)
    || !Number.isInteger(yearly.amountMinor)
    || monthly.amountMinor <= 0
    || yearly.amountMinor < 0
  ) return null;
  const percent = Math.round((1 - (yearly.amountMinor / (monthly.amountMinor * 12))) * 100);
  return percent > 0 ? percent : null;
}

export function lowestInstitutionalMonthlyPrice(catalog) {
  const prices = Object.values(catalog?.institutional || {})
    .map((plan) => plan?.monthly)
    .filter((price) => Number.isInteger(price?.amountMinor) && price.amountMinor >= 0);
  if (!prices.length) return null;
  return prices.reduce((lowest, price) => (
    price.amountMinor < lowest.amountMinor ? price : lowest
  ));
}
