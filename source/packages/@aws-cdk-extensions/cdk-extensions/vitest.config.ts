import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: ['default', 'junit'],
    outputFile: './test-reports/test-results.xml',
    coverage: {
      thresholds: {
        branches: 65,
        functions: 92,
        lines: 85,
        statements: 85,
      },
    },
  },
});
