import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**'],
    testTimeout: 300000,
    teardownTimeout: 60000,
    hookTimeout: 60000,
    // No setupFiles for this package
    reporters: ['default', 'junit'],
    outputFile: './test-reports/test-results.xml',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
});
