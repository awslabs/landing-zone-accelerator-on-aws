import * as cdk from 'aws-cdk-lib';
// import { Template } from 'aws-cdk-lib/assertions';
import { GovCloudAccountVendingStack } from '../lib/govcloud-avm-stack';
import { snapShotTest } from './snapshot-test';
// Test prefix
const testNamePrefix = 'Stack(GovCloudAccountVendingStack): ';
const stack = new GovCloudAccountVendingStack(new cdk.App(), 'AWSAccelerator-Test-GovCloudAccountVendingStack', {
  synthesizer: new cdk.DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
});
/**
 * GovCloudAccountVendingStack construct test
 */
describe('GovCloudAccountVendingStack', () => {
  snapShotTest(testNamePrefix, stack);
});
