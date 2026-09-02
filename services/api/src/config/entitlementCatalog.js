/**
 * Canonical product access policy.
 *
 * This module intentionally contains no UI logic and no database access. The
 * API resolves one tier for the authenticated user, expands that tier through
 * this catalog, and enforces the resulting feature set before handlers run.
 * The browser receives the same resolved feature keys for navigation only;
 * it is never the authorization boundary.
 */

export const TIERS = Object.freeze({
  FREE: 'free',
  PREMIUM: 'premium',
  INSTITUTIONAL: 'institutional',
  ADMIN: 'admin',
});

export const FEATURES = Object.freeze({
  EDUCATION_CATALOG: 'education.catalog',
  EDUCATION_AI: 'education.ai',
  PROFILE_BASIC: 'profile.basic',
  ACCOUNT_PRIVACY: 'account.privacy',
  BILLING: 'billing.manage',
  SUPPORT: 'support.contact',
  RESEARCH_SEARCH: 'research.search',
  RESEARCH_WORKSPACE: 'research.workspace',
  RESEARCH_AI: 'research.ai',
  GENOMICS_TOOLS: 'genomics.tools',
  HEALTH_RECORDS: 'health.records',
  PROFILE_ASSISTANTS: 'assistants.profile_context',
  PROJECT_COLLABORATION: 'research.collaboration',
  INSTITUTION_MANAGEMENT: 'institution.manage',
});

export const FREE_TIER_LIMITS = Object.freeze({
  explanations_per_day: 5,
  quizzes_per_day: 3,
  chat_messages_per_day: 10,
});

const FREE_FEATURES = Object.freeze([
  FEATURES.EDUCATION_CATALOG,
  FEATURES.EDUCATION_AI,
  FEATURES.PROFILE_BASIC,
  FEATURES.ACCOUNT_PRIVACY,
  FEATURES.BILLING,
  FEATURES.SUPPORT,
]);

const PREMIUM_FEATURES = Object.freeze([
  ...FREE_FEATURES,
  FEATURES.RESEARCH_SEARCH,
  FEATURES.RESEARCH_WORKSPACE,
  FEATURES.RESEARCH_AI,
  FEATURES.GENOMICS_TOOLS,
  FEATURES.HEALTH_RECORDS,
  FEATURES.PROFILE_ASSISTANTS,
  FEATURES.PROJECT_COLLABORATION,
]);

const INSTITUTIONAL_FEATURES = Object.freeze([
  ...PREMIUM_FEATURES,
]);

const ADMIN_FEATURES = Object.freeze([
  ...INSTITUTIONAL_FEATURES,
  FEATURES.INSTITUTION_MANAGEMENT,
]);

export const TIER_FEATURES = Object.freeze({
  [TIERS.FREE]: FREE_FEATURES,
  [TIERS.PREMIUM]: PREMIUM_FEATURES,
  [TIERS.INSTITUTIONAL]: INSTITUTIONAL_FEATURES,
  [TIERS.ADMIN]: ADMIN_FEATURES,
});

export function featuresForTier(tier) {
  return [...(TIER_FEATURES[tier] || FREE_FEATURES)];
}

export function tierHasFeature(tier, feature) {
  return (TIER_FEATURES[tier] || FREE_FEATURES).includes(feature);
}

export function minimumTierForFeature(feature) {
  if (FREE_FEATURES.includes(feature)) return TIERS.FREE;
  if (PREMIUM_FEATURES.includes(feature)) return TIERS.PREMIUM;
  if (INSTITUTIONAL_FEATURES.includes(feature)) return TIERS.INSTITUTIONAL;
  // Institution management is owner-scoped inside the institutional tier;
  // ordinary assigned seats intentionally do not receive it.
  if (ADMIN_FEATURES.includes(feature)) return TIERS.INSTITUTIONAL;
  return null;
}
