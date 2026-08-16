export type HomeDestination = {
  id: string;
  title: string;
  plainLanguageDescription: string;
  route: string;
  primaryActionLabel: string;
  iconName: string;
  isAvailableNow: boolean;
};

export type NavigationItem = {
  label: string;
  route: string;
  ariaLabel: string;
  isPrimary: boolean;
  matchesHomeCard: boolean;
};

export type OnboardingStep = {
  stepNumber: number;
  title: string;
  plainLanguageDescription: string;
  userBenefit: string;
  safetyNote: string;
};

export type OnboardingPreference = {
  storageKey: string;
  hasSeenOnboarding: boolean;
  dismissedAt: string | null;
  dismissalMethod?: 'start_here' | 'skip' | 'close_button' | 'escape_key' | 'backdrop_click';
};

export type EmptyDataState = {
  headline: string;
  message: string;
  primaryActionLabel: string;
  primaryActionRoute: string;
  privacyReassurance: string;
};
