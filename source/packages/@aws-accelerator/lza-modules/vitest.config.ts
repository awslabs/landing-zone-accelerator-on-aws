import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
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
