import * as cdk from 'aws-cdk-lib';
import * as path from 'path';
import { test, expect } from '@jest/globals';

import { getContext, setAcceleratorEnvironment, setResourcePrefixes } from '../utils/app-utils';

function testAppUtils() {
  const app = new cdk.App({
    context: { 'config-dir': path.join(__dirname, `configs/snapshot-only`), partition: 'aws' },
  });
  // Read in context inputs
  const context = getContext(app);

  // Set various resource name prefixes used in code base
  const resourcePrefixes = setResourcePrefixes(process.env['ACCELERATOR_PREFIX'] ?? 'AWSAccelerator');

  // Set accelerator environment variables
  const acceleratorEnv = setAcceleratorEnvironment(process.env, resourcePrefixes, context.stage);
  return acceleratorEnv;
}

test('AppUtilTest', () => {
  const testAcceleratorEnv = testAppUtils();
  expect(testAcceleratorEnv).toHaveProperty('auditAccountEmail');
});
