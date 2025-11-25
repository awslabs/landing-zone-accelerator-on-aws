import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    exclude: ['**/*.integration.test.ts', '**/*.test.integration.ts'],
    passWithNoTests: true,
  },
});
