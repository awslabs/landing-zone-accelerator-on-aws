/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as cdk from 'aws-cdk-lib';
import { CloudWatchLogsSubscriptionFilter } from '../../lib/aws-cloudwatch-logs/cloudwatch-logs-subscription-filter';
import { snapShotTest } from '../snapshot-test';
import { describe } from '@jest/globals';

const testNamePrefix = 'Construct(CloudWatchLogsSubscriptionFilter): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new CloudWatchLogsSubscriptionFilter(stack, 'CloudWatchLogsSubscriptionFilter', {
  logsKmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  logDestinationArn: `arn:${stack.partition}:logs:${stack.region}:111111111111:destination:AWSAcceleratorCloudWatchToS3`,
  logsRetentionInDays: '731',
  subscriptionFilterRoleArn: `arn:${stack.partition}:iam::111111111111:role/AWSAccelerator-LoggingSta-SubscriptionFilterRole`,
  logArchiveAccountId: 'some-acc-id',
  replaceLogDestinationArn: `arn:${stack.partition}:logs:${stack.region}:111111111111:destination:ReplaceDestination`,
  acceleratorPrefix: 'AWSAccelerator',
  useExistingRoles: false,
});
new CloudWatchLogsSubscriptionFilter(stack, 'CloudWatchLogsSubscriptionFilterExistingIam', {
  logsKmsKey: new cdk.aws_kms.Key(stack, 'CustomKeyExistingIam', {}),
  logDestinationArn: 'LogRetentionArn',
  logsRetentionInDays: '731',
  subscriptionFilterRoleArn: 'testString',
  logArchiveAccountId: 'some-acc-id',
  acceleratorPrefix: 'AWSAccelerator',
  useExistingRoles: true,
});

/**
 * CloudWatchDestination construct test
 */
describe('CloudWatchLogsSubscriptionFilter', () => {
  snapShotTest(testNamePrefix, stack);
});
