import react from '@vitejs/plugin-react';
import { defineConfig, configDefaults } from 'vitest/config';
import path from 'path';

// Mirror the production browser alias boundary: application imports resolve
// only to the bounded client. Tests that intentionally inspect the retired
// internal agent registry import its source explicitly.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@genemap/shared/client': path.resolve(__dirname, '../../packages/shared/src/client.ts'),
      '@genemap/shared/schemas': path.resolve(__dirname, '../../packages/shared/src/schemas.ts'),
      '@genemap/shared/types': path.resolve(__dirname, '../../packages/shared/src/types.ts'),
      '@genemap/shared/publicationStatus': path.resolve(__dirname, '../../packages/shared/src/publicationStatus.ts'),
      '@genemap/shared': path.resolve(__dirname, '../../packages/shared/src/client.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test-setup.js'],
    include: ['**/__tests__/**/*.{test,spec}.{js,jsx}', '**/*.{test,spec}.{js,jsx}'],
    // Playwright e2e specs (tests/e2e) use @playwright/test, not vitest.
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
  },
});
