import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      include: ['**/*.ts'],
      exclude: ['**/*.js', '**/*.json', '**/*.d.ts', '**/node_modules/**', '**/test/**'],
      thresholds: {
        branches: 70,
        functions: 80,
        lines: 15,
        statements: 15,
      },
    },
  },
});
