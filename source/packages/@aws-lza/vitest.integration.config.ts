import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/index.test.integration.ts'],
    passWithNoTests: true,
    reporters: ['default'],
    testTimeout: 300000,
    hookTimeout: 300000,
  },
});
