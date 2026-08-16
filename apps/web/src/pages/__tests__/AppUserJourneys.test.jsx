import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "../../App.jsx";
import * as navigationModule from "../../content/navigationItems.js";

const readExport = (moduleValue, ...names) => {
  if (moduleValue.default) return moduleValue.default;
  for (const name of names) {
    if (moduleValue[name]) return moduleValue[name];
  }
  return undefined;
};

const navigationItems = readExport(navigationModule, "navigationItems", "items") ?? [];

const goTo = (path) => {
  window.history.pushState({}, "Test page", path);
};

const hideOnboardingForReturningVisitor = () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation((key) => {
    const normalizedKey = String(key).toLowerCase();
    if (normalizedKey.includes("onboarding") || normalizedKey.includes("genemap")) {
      return JSON.stringify({
        hasSeenOnboarding: true,
        dismissedAt: "2026-08-15T00:00:00.000Z",
        dismissalMethod: "test",
      });
    }
    return null;
  });
};

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("App user journeys", () => {
  it("opens on a helpful home page with one obvious start action, four choices, the empty state, and persistent navigation", () => {
    hideOnboardingForReturningVisitor();
    goTo("/");

    render(<App />);

    const startHereControls = [
      ...screen.queryAllByRole("link", { name: /start here/i }),
      ...screen.queryAllByRole("button", { name: /start here/i }),
    ];
    expect(startHereControls.length).toBeGreaterThan(0);

    expect(screen.getByText(/understand genetics, explore trusted gene information/i)).toBeTruthy();
    expect(screen.getByText(/you haven't uploaded anything yet/i)).toBeTruthy();

    for (const title of [
      "Learn genetics",
      "Explore genes & diseases",
      "Upload & interpret my data",
      "Find matching trials",
    ]) {
      expect(screen.getByText(title)).toBeTruthy();
    }

    const navigation = screen.queryByRole("navigation", { name: /main|primary|site/i }) ?? screen.getByRole("navigation");
    for (const label of ["Learn", "Explore", "Upload/Interpret", "Trials"]) {
      expect(within(navigation).getByRole("link", { name: new RegExp(label.replace("/", "\\\\/"), "i") })).toBeTruthy();
    }
  });

  it("routes every top navigation destination to a real, non-empty page", () => {
    hideOnboardingForReturningVisitor();

    const destinationRoutes = navigationItems
      .filter((item) => item.route && item.route !== "/")
      .map((item) => item.route);

    expect(destinationRoutes.length).toBeGreaterThanOrEqual(4);

    for (const route of destinationRoutes) {
      cleanup();
      goTo(route);

      render(<App />);

      expect(screen.getByRole("main")).toBeTruthy();
      const pageText = document.body.textContent ?? "";
      expect(pageText.trim().length).toBeGreaterThan(40);
      expect(pageText).not.toMatch(/cannot get|stack trace|uncaught|typeerror|referenceerror/i);
    }
  });

  it("shows onboarding on first visit, dismisses it with Escape, and saves that choice for later visits", async () => {
    goTo("/");
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockReturnValue(null);
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    render(<App />);

    const dialog = await screen.findByRole("dialog");
    const dialogText = dialog.textContent ?? "";
    expect(dialogText).toMatch(/upload/i);

    for (const stepNumber of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(dialogText).toMatch(new RegExp(`\\b${stepNumber}\\b`));
    }

    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    expect(setItemSpy).toHaveBeenCalled();
    expect(
      setItemSpy.mock.calls.some(([key]) => {
        const normalizedKey = String(key).toLowerCase();
        return normalizedKey.includes("onboarding") || normalizedKey.includes("genemap");
      })
    ).toBe(true);

    getItemSpy.mockRestore();
    cleanup();
    goTo("/");

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});
