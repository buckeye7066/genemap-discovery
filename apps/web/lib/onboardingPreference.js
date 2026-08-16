export const ONBOARDING_STORAGE_KEY = 'genemap-discovery:onboarding-dismissed';

export const ONBOARDING_DISMISSAL_METHODS = Object.freeze([
  'start_here',
  'skip',
  'close_button',
  'escape_key',
  'backdrop_click',
]);

const DEFAULT_PREFERENCE = Object.freeze({
  storageKey: ONBOARDING_STORAGE_KEY,
  hasSeenOnboarding: false,
  dismissedAt: null,
  dismissalMethod: null,
});

function getStorage(storageOverride) {
  if (storageOverride) {
    return storageOverride;
  }

  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  return window.localStorage;
}

function safeParsePreference(rawValue) {
  if (!rawValue) {
    return { ...DEFAULT_PREFERENCE };
  }

  try {
    const parsed = JSON.parse(rawValue);

    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_PREFERENCE };
    }

    return {
      storageKey: ONBOARDING_STORAGE_KEY,
      hasSeenOnboarding: parsed.hasSeenOnboarding === true,
      dismissedAt: typeof parsed.dismissedAt === 'string' ? parsed.dismissedAt : null,
      dismissalMethod: ONBOARDING_DISMISSAL_METHODS.includes(parsed.dismissalMethod)
        ? parsed.dismissalMethod
        : null,
    };
  } catch {
    return { ...DEFAULT_PREFERENCE };
  }
}

export function isValidOnboardingDismissalMethod(method) {
  return ONBOARDING_DISMISSAL_METHODS.includes(method);
}

export function readOnboardingPreference(storageOverride) {
  const storage = getStorage(storageOverride);

  if (!storage) {
    return { ...DEFAULT_PREFERENCE };
  }

  try {
    return safeParsePreference(storage.getItem(ONBOARDING_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_PREFERENCE };
  }
}

export function hasSeenOnboarding(storageOverride) {
  return readOnboardingPreference(storageOverride).hasSeenOnboarding;
}

export function saveOnboardingDismissal(method = 'skip', storageOverride) {
  const dismissalMethod = isValidOnboardingDismissalMethod(method) ? method : 'skip';
  const preference = {
    storageKey: ONBOARDING_STORAGE_KEY,
    hasSeenOnboarding: true,
    dismissedAt: new Date().toISOString(),
    dismissalMethod,
  };

  const storage = getStorage(storageOverride);

  if (!storage) {
    return preference;
  }

  try {
    storage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // If localStorage is blocked or full, keep the app usable. The caller can still close the overlay for this session.
  }

  return preference;
}

export function clearOnboardingDismissal(storageOverride) {
  const storage = getStorage(storageOverride);

  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(ONBOARDING_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
