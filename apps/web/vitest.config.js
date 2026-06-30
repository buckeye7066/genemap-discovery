import react from '@vitejs/plugin-react';
import { defineConfig, configDefaults } from 'vitest/config';
import path from 'path';

// Test runner config for @genemap/web. Mirrors the Vite alias map so component
// tests can resolve `@/...` and `@genemap/shared`, and runs under jsdom so
// React Testing Library renders work out of the box.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@genemap/shared/client': path.resolve(__dirname, '../../packages/shared/src/client.ts'),
      '@genemap/shared/schemas': path.resolve(__dirname, '../../packages/shared/src/schemas.ts'),
      '@genemap/shared/types': path.resolve(__dirname, '../../packages/shared/src/types.ts'),
      '@genemap/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test-setup.js'],
    include: ['**/__tests__/**/*.{test,spec}.{js,jsx}', '**/*.{test,spec}.{js,jsx}'],
    // Playwright e2e specs (tests/e2e) use @playwright/test, not vitest — keep
    // the two runners from picking up each other's files.
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
  },
});
