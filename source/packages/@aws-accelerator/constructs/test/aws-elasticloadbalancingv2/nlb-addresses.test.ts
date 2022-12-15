import * as cdk from 'aws-cdk-lib';
import { NLBAddresses } from '../../lib/aws-elasticloadbalancingv2/nlb-addresses';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(NLBAddresses): ';

const app = new cdk.App();

// Create stack for native Cfn construct
const env = { account: '333333333333', region: 'us-east-1' };
const stack = new cdk.Stack(app, 'Stack', { env: env });

/**
 * ConfigServiceTags construct test
 */

new NLBAddresses(stack, 'NLBAddresses', {
  assumeRoleName: 'test123',
  kmsKey: new cdk.aws_kms.Key(stack, 'TableKey', {}),
  logRetentionInDays: 30,
  partition: cdk.Stack.of(stack).partition,
  targets: ['10.0.0.5', '10.0.0.6'],
});

describe('ConfigServiceTags', () => {
  snapShotTest(testNamePrefix, stack);
});
