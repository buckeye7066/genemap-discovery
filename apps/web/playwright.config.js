import { defineConfig, devices } from '@playwright/test';

const mobileCompatibility = /mobile Safari and Android profiles/;

/**
 * E2E config for the public/auth and publication-boundary surfaces. It can run
 * against a deployed URL or an exact-head `vite preview` artifact. No LLM keys
 * or real user session are required.
 *
 *   PLAYWRIGHT_BASE_URL=https://genemap-discovery.vercel.app pnpm --filter @genemap/web e2e
 *
 * Specs live in tests/e2e and cover login/registration rendering, the legal
 * pages, nav redirects, and security headers — the things that must never
 * silently break for a logged-out visitor.
 */
const localPreview = process.env.PLAYWRIGHT_LOCAL_PREVIEW === '1';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || (
  localPreview ? 'http://127.0.0.1:4173' : 'https://genemap-discovery.vercel.app'
);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  webServer: localPreview ? {
    command: 'pnpm exec vite preview --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/login',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  } : undefined,
  use: {
    baseURL,
    trace: 'on-first-retry',
    actionTimeout: 10_000,
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'desktop-webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-safari', grep: mobileCompatibility, use: { ...devices['iPhone 13'] } },
    { name: 'mobile-chrome', grep: mobileCompatibility, use: { ...devices['Pixel 5'] } },
  ],
});
