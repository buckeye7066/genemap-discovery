import { describe, expect, it } from "vitest";
import * as destinationsModule from "../homeDestinations.js";
import * as navigationModule from "../navigationItems.js";
import * as emptyStateModule from "../emptyDataState.js";
import * as onboardingModule from "../onboardingSteps.js";

const readExport = (moduleValue, ...names) => {
  if (moduleValue.default) return moduleValue.default;
  for (const name of names) {
    if (moduleValue[name]) return moduleValue[name];
  }
  return undefined;
};

const homeDestinations = readExport(destinationsModule, "homeDestinations", "destinations") ?? [];
const navigationItems = readExport(navigationModule, "navigationItems", "items") ?? [];
const emptyDataState = readExport(emptyStateModule, "emptyDataState") ?? {};
const onboardingSteps = readExport(onboardingModule, "onboardingSteps", "steps") ?? [];

const normalize = (value) => String(value).replace(/[’]/g, "'").trim();

const collectStrings = (value) => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(collectStrings);
  return [];
};

describe("GeneMap Discovery content contract", () => {
  it("keeps the four home destinations matched to the persistent navigation", () => {
    const requiredCardTitles = [
      "Learn genetics",
      "Explore genes & diseases",
      "Upload & interpret my data",
      "Find matching trials",
    ];

    const cardTitles = homeDestinations.map((destination) => destination.title);
    expect(cardTitles).toEqual(expect.arrayContaining(requiredCardTitles));

    for (const destination of homeDestinations) {
      expect(destination.route, `${destination.title} needs a route`).toMatch(/^\//);
      expect(destination.primaryActionLabel, `${destination.title} needs a clear action`).toEqual(expect.any(String));
      expect(destination.plainLanguageDescription, `${destination.title} needs plain-language help text`).toEqual(expect.any(String));
    }

    const navLabels = navigationItems.map((item) => item.label);
    expect(navLabels).toEqual(expect.arrayContaining(["Learn", "Explore", "Upload/Interpret", "Trials"]));

    const cardRoutes = new Set(homeDestinations.map((destination) => destination.route));
    for (const item of navigationItems.filter((navItem) => navItem.matchesHomeCard)) {
      expect(cardRoutes.has(item.route), `${item.label} should route to the same place as a home card`).toBe(true);
      expect(item.ariaLabel, `${item.label} needs a useful screen reader label`).toEqual(expect.any(String));
    }
  });

  it("shows the truthful no-upload empty state with a direct next step", () => {
    expect(normalize(emptyDataState.headline)).toMatch(/^You haven't uploaded anything yet — here's how to begin\.?$/);
    expect(emptyDataState.primaryActionLabel).toEqual(expect.any(String));
    expect(emptyDataState.primaryActionRoute).toMatch(/^\//);
    expect(emptyDataState.privacyReassurance).toMatch(/privacy|private|stored|upload/i);
  });

  it("keeps onboarding to exactly eight clear upload steps", () => {
    expect(onboardingSteps).toHaveLength(8);

    onboardingSteps.forEach((step, index) => {
      expect(step.stepNumber).toBe(index + 1);
      expect(step.title, `Step ${index + 1} needs a title`).toEqual(expect.any(String));
      expect(step.plainLanguageDescription, `Step ${index + 1} needs a plain-language description`).toEqual(expect.any(String));
      expect(step.userBenefit, `Step ${index + 1} needs a user benefit`).toEqual(expect.any(String));
      expect(step.safetyNote, `Step ${index + 1} needs a safety note`).toEqual(expect.any(String));
    });
  });

  it("avoids diagnosis, treatment, risk prediction, dosing, screening, or medical guidance claims", () => {
    const visibleCopy = collectStrings({ homeDestinations, navigationItems, emptyDataState, onboardingSteps }).join("\n");

    const disallowedClaims = [
      /\bdiagnos(e|es|is|tic)\b/i,
      /\byour risk\b/i,
      /\bpersonal risk\b/i,
      /\brisk (score|prediction|level|result|assessment)\b/i,
      /\btreatment recommendation\b/i,
      /\bdrug avoidance\b/i,
      /\bavoid (this|that|a|the)?\s*drug\b/i,
      /\bdos(e|ing)\b/i,
      /\bpharmacogenomics?\b/i,
      /\bscreening recommendation\b/i,
      /\burgent(ly)?\b/i,
      /\bclinical trial match(es|ing)? for you\b/i,
    ];

    for (const pattern of disallowedClaims) {
      expect(visibleCopy).not.toMatch(pattern);
    }
  });
});
