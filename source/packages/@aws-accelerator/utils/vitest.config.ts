import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: ['default'],
    outputFile: undefined,
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
