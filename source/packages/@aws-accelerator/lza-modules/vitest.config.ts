import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    reporters: ['default', 'junit'],
    outputFile: './test-reports/test-results.xml',
    coverage: {
      thresholds: {
        branches: 70,
        functions: 70,
        lines: 35,
        statements: 35,
      },
    },
  },
});
