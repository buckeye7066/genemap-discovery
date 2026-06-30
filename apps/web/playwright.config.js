import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config for the public/auth surface. Runs against a deployed (or local)
 * URL — no LLM keys or seeded auth required — so it's safe to run in CI on every
 * deploy and locally for a quick smoke:
 *
 *   PLAYWRIGHT_BASE_URL=https://genemap-discovery.vercel.app pnpm --filter @genemap/web e2e
 *
 * Specs live in tests/e2e and cover login/registration rendering, the legal
 * pages, nav redirects, and security headers — the things that must never
 * silently break for a logged-out visitor.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'https://genemap-discovery.vercel.app';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    actionTimeout: 10_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
