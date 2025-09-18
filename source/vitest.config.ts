import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**'],
    silent: true,
    testTimeout: 90000,
    setupFiles: ['./vitest.setup.ts'],
    projects: [
      'packages/@aws-accelerator/accelerator',
      'packages/@aws-accelerator/config',
      'packages/@aws-accelerator/constructs',
      'packages/@aws-accelerator/govcloud-account-vending',
      'packages/@aws-accelerator/installer',
      'packages/@aws-accelerator/lza-modules',
      'packages/@aws-accelerator/modules',
      'packages/@aws-accelerator/tools',
      'packages/@aws-accelerator/utils',
      'packages/@aws-cdk-extensions/cdk-extensions',
      'packages/@aws-lza',
    ],
  },
});
