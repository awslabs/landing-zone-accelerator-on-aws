import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/dist/*', '**/node_modules/**'],
    include: ['test/*.ts'],
    passWithNoTests: true,
    reporters: ['default', 'junit'],
    outputFile: `./test-reports/${process.env['ENV_NAME']}/${process.env['AWS_DEFAULT_REGION']}/test-results.xml`,
    hookTimeout: 120000,
    testTimeout: 120000,
  },
});
