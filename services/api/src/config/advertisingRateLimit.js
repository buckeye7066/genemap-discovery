// Periodic ad delivery must not consume the education/account request budget.
// This is a separate bounded bucket, not a rate-limit exemption.
export const ADVERTISING_RATE_LIMIT_MAX = 1200;
export const advertisingRateConfig = {
  advertisingTraffic: true,
  rateLimit: {
    max: ADVERTISING_RATE_LIMIT_MAX,
    timeWindow: 15 * 60 * 1000,
    keyGenerator: (request) => `advertising:${request.ip}`,
  },
};
export const isAdvertisingTraffic = (request) => request?.routeOptions?.config?.advertisingTraffic === true;
