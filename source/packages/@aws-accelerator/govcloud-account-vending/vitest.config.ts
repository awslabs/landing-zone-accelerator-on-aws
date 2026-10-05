import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: ['default', 'junit'],
    outputFile: './test-reports/test-results.xml',
    coverage: {
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage',
      exclude: ['**/*.d.ts', '**/dist/**', '**/node_modules/**'],
      thresholds: {
        branches: 70,
        functions: 70,
        lines: 55,
        statements: 55,
      },
    },
  },
});
