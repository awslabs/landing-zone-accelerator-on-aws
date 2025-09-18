import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/dist/*', '**/node_modules/**'],
    include: ['test/*.ts'],
    passWithNoTests: true,
    reporters: ['default'],
    hookTimeout: 120000,
    testTimeout: 120000,
  },
});
