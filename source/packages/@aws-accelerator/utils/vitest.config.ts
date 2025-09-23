import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: ['default', 'junit'],
    outputFile: './test-reports/test-results.xml',
    silent: true,
    coverage: {
      thresholds: {
        branches: 70,
        functions: 70,
        lines: 40,
        statements: 40,
      },
    },
  },
});
