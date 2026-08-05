import { test, expect } from '@playwright/test';

// Regression journeys for the 2026-08-02 EVA portfolio findings. These are
// user journeys, not unit checks:
//
//  1. "Login page loads" must be CLEAN — no console errors and no failed
//     (>=400) requests. The historical failure: AuthContext fired GET
//     /auth/me for anonymous visitors, whose guaranteed 401 the browser
//     logs as a console error (twice under StrictMode's dev double-mount).
//  2. "New user can reach the registration form from login" — a prospective
//     user must be able to self-onboard. The historical failure: the July
//     login-maintenance banner (and the API-down retry screen) replaced the
//     login card, so no Register control existed on /Login.
//
// Both run logged-out against PLAYWRIGHT_BASE_URL — local dev or deployed.

// EVA's exact locator from the finding, kept verbatim so this spec fails the
// same way EVA's journey would.
const EVA_REGISTER_LOCATOR =
  "button:has-text('Register'), a:has-text('Register'), a:has-text('Sign up')";

function watchForNoise(page) {
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('response', (res) => {
    if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.url()}`);
  });
  return { consoleErrors, failedRequests };
}

test.describe('Login journeys (EVA regression set)', () => {
  test('login page loads, identifies GeneMap, with zero console errors and zero failed requests', async ({ page }) => {
    const { consoleErrors, failedRequests } = watchForNoise(page);

    await page.goto('/Login');
    await expect(page.getByText('GeneMap Discovery').first()).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();

    // Let the auth check / maintenance probe settle before judging silence.
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    expect(failedRequests, 'no request may fail (the anonymous /auth/me 401 regression)').toEqual([]);
    expect(consoleErrors, 'the login page must load console-clean').toEqual([]);
  });

  test('a new user can reach the registration form from login', async ({ page }) => {
    await page.goto('/Login');

    const register = page.locator(EVA_REGISTER_LOCATOR).first();
    await expect(register).toBeVisible();
    await register.click();

    // The register mode shows its own affordances: create-account submit +
    // password guidance.
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();
    await expect(page.getByText(/use at least 8 characters/i)).toBeVisible();
  });
});
