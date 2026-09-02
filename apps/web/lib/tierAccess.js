import { isAdminUser } from './roles';

export function userHasFeature(user, feature) {
  if (!feature) return true;
  if (isAdminUser(user)) return true;
  return Array.isArray(user?.entitlements?.features)
    && user.entitlements.features.includes(feature);
}

export function upgradeUrl(feature) {
  return `/premium?feature=${encodeURIComponent(feature)}`;
}
