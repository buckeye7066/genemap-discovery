import { test, expect } from '@playwright/test';

// Public/auth surface — must work for a logged-out visitor, no backend auth or
// LLM required. Runs against the deployed app (PLAYWRIGHT_BASE_URL).

test.describe('Login & registration', () => {
  test('unauthenticated visitors land on the login page with a working form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in|create account/i })).toBeVisible();
  });

  test('an unknown protected route redirects to login', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');
    await expect(page).toHaveURL(/\/login/);
  });

  test('the login screen links to Terms and Privacy', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('link', { name: /terms of service/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /privacy policy/i })).toBeVisible();
  });
});

test.describe('Legal pages (reachable logged-out)', () => {
  test('Privacy Policy renders real content', async ({ page }) => {
    await page.goto('/privacypolicy');
    await expect(page.getByRole('heading', { name: /privacy policy/i })).toBeVisible();
    await expect(page.getByText(/last updated:/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /publication-mode data boundary/i })).toBeVisible();
    await expect(page.getByText(/does not offer personal medical-record upload/i)).toBeVisible();
  });

  test('Terms of Service emphasizes "not medical advice"', async ({ page }) => {
    await page.goto('/termsofservice');
    await expect(page.getByRole('heading', { name: /terms of service/i })).toBeVisible();
    await expect(page.getByText(/not a substitute for professional medical advice/i)).toBeVisible();
  });

  test('legal pages cross-link to each other', async ({ page }) => {
    await page.goto('/privacypolicy');
    await page.getByRole('link', { name: /terms of service/i }).first().click();
    await expect(page).toHaveURL(/\/termsofservice/);
  });
});

test.describe('Security headers', () => {
  test('the web app sends the expected security headers', async ({ request, baseURL }) => {
    // These headers come from vercel.json / the deployed edge; the local Vite
    // dev server never sends them, so this check only means something against
    // a deployed URL. Skipping locally keeps the nightly local sweep honest
    // (a test that can only fail locally measures the environment, not the app).
    test.skip(/localhost|127\.0\.0\.1/.test(baseURL || ''), 'security headers are added by the deployed edge, not the dev server');
    const res = await request.get('/login');
    const headers = res.headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBeTruthy();
    // HSTS is set in vercel.json (and by Vercel's edge).
    expect(headers['strict-transport-security']).toBeTruthy();
  });
});
