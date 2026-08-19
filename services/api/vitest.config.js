import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/env-setup.js', './src/__tests__/setup.js'],
    testTimeout: 15000,
    // Nearly every suite here builds a full Fastify app inside beforeAll/beforeEach
    // (buildTestApp), so the hooks — not the test bodies — carry the expensive work.
    // Vitest's hookTimeout does NOT inherit testTimeout; leaving it at the 10s default
    // made the whole publication suite load-sensitive: under full parallelism the
    // app-building hooks exceeded 10s and ~10 files failed with
    // "Hook timed out in 10000ms" while passing in isolation.
    // Keep this >= testTimeout so a slow machine cannot turn setup into a false failure.
    hookTimeout: 30000,
  },
});
