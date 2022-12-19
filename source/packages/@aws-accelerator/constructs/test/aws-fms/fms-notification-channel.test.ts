import * as cdk from 'aws-cdk-lib';
import { FMSNotificationChannel } from '../../lib/aws-fms/fms-notification-channel';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(FMSNotificationChannel): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

const snsTopicArn = `arn:${stack.partition}:sns:${stack.region}:111111111111:aws-accelerator-Security`;
const snsRoleArn = `"arn:${stack.partition}:iam::111111111111:role/AWSAccelerator-SNSRole"`;
new FMSNotificationChannel(stack, 'FMSNotificationChannel', {
  snsRoleArn,
  snsTopicArn,
});
/**
 * FMSNotificationChannel construct test
 */
describe('FMSNotificationChannel', () => {
  snapShotTest(testNamePrefix, stack);
});
