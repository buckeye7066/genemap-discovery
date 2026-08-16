import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, beforeEach } from "vitest";
import Home from "../Home.jsx";
import { ONBOARDING_STORAGE_KEY } from "../../content/onboardingSteps.js";

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>
  );
}

function expectNoObviousAccessibilityFailures(container) {
  const h1s = container.querySelectorAll("h1");
  expect(h1s).toHaveLength(1);

  const interactiveElements = container.querySelectorAll("a, button");
  expect(interactiveElements.length).toBeGreaterThan(0);

  interactiveElements.forEach((element) => {
    const accessibleName =
      element.getAttribute("aria-label") || element.textContent || "";
    expect(accessibleName.trim().length).toBeGreaterThan(0);

    const className = element.getAttribute("class") || "";
    expect(className).toContain("focus-visible:outline");
  });

  container.querySelectorAll("img").forEach((image) => {
    expect(image).toHaveAttribute("alt");
  });

  container.querySelectorAll('[role="dialog"]').forEach((dialog) => {
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby");
    expect(dialog).toHaveAttribute("aria-describedby");
  });
}

describe("Home accessibility", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders the home page with accessible labels, focus styles, cards, and the no-data state", () => {
    window.localStorage.setItem(
      ONBOARDING_STORAGE_KEY,
      JSON.stringify({ hasSeenOnboarding: true })
    );

    const { container } = renderHome();

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /understand genetics before you share anything/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /GeneMap Discovery helps you learn genetics, explore trusted gene and disease information, and prepare to review your data safely/i
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /start here by seeing the upload steps/i })
    ).toHaveAttribute("href", "/upload");

    [
      "Learn genetics",
      "Explore genes & diseases",
      "Upload & interpret my data",
      "Find matching trials",
    ].forEach((cardTitle) => {
      expect(screen.getByRole("link", { name: new RegExp(cardTitle, "i") })).toBeInTheDocument();
    });

    expect(
      screen.getByText("You haven't uploaded anything yet — here's how to begin.")
    ).toBeInTheDocument();

    expectNoObviousAccessibilityFailures(container);
  });

  it("shows the onboarding dialog on first visit and saves dismissal when skipped", async () => {
    const { container } = renderHome();

    const dialog = await screen.findByRole("dialog", {
      name: /see the upload journey before you choose a file/i,
    });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(8);

    expectNoObviousAccessibilityFailures(container);

    fireEvent.click(within(dialog).getByRole("button", { name: /skip for now/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    const savedPreference = JSON.parse(
      window.localStorage.getItem(ONBOARDING_STORAGE_KEY)
    );
    expect(savedPreference.hasSeenOnboarding).toBe(true);
    expect(savedPreference.dismissalMethod).toBe("skip");
  });

  it("dismisses the onboarding dialog with the Escape key and saves that choice", async () => {
    renderHome();

    expect(
      await screen.findByRole("dialog", {
        name: /see the upload journey before you choose a file/i,
      })
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    const savedPreference = JSON.parse(
      window.localStorage.getItem(ONBOARDING_STORAGE_KEY)
    );
    expect(savedPreference.hasSeenOnboarding).toBe(true);
    expect(savedPreference.dismissalMethod).toBe("escape_key");
  });

  it("does not show onboarding again after a saved dismissal", () => {
    window.localStorage.setItem(
      ONBOARDING_STORAGE_KEY,
      JSON.stringify({
        hasSeenOnboarding: true,
        dismissedAt: "2026-08-15T00:00:00.000Z",
        dismissalMethod: "skip",
      })
    );

    renderHome();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
