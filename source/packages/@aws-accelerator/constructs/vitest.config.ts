import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/*.integration.test.ts', '**/dist/*', '**/node_modules/**'],
    include: ['**/*.test.ts'],
    passWithNoTests: true,
    setupFiles: ['./vitest.setup.ts'],
    reporters: ['default'],
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
