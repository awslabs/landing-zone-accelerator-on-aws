import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/*.integration.test.ts', '**/*.test.integration.ts', '**/node_modules/**'],
    setupFiles: ['./vitest.setup.ts'],
    reporter: ['default'],
    coverage: {
      include: ['**/*.ts'],
      thresholds: {
        branches: 70,
        functions: 92,
        lines: 15,
        statements: 15,
      },
    },
  },
});
