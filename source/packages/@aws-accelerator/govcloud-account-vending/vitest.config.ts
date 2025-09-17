import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      thresholds: {
        branches: 70,
        functions: 70,
        lines: 55,
        statements: 55,
      },
    },
  },
});
