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
import { CloudWatchDestination } from '../../lib/aws-cloudwatch-logs/cloudwatch-destination';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(CloudWatchDestination): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();
const cnStack = new cdk.Stack();

new CloudWatchDestination(stack, 'CloudWatchDestination', {
  kinesisKmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  kinesisStream: new cdk.aws_kinesis.Stream(stack, 'CustomStream', {}),
  organizationId: 'o-some-org-id',
  partition: 'aws',
  destinationName: 'AWSAcceleratorCloudWatchToS3',
});

new CloudWatchDestination(cnStack, 'CloudWatchDestination', {
  kinesisKmsKey: new cdk.aws_kms.Key(cnStack, 'CustomKey', {}),
  kinesisStream: new cdk.aws_kinesis.Stream(cnStack, 'CustomStream', {}),
  organizationId: 'o-some-org-id',
  accountIds: ['111111111111', '222222222222'],
  partition: 'aws-cn',
  destinationName: 'AWSAcceleratorCloudWatchToS3',
});

/**
 * CloudWatchDestination construct test
 */
describe('CloudWatchDestination', () => {
  snapShotTest(testNamePrefix, stack);
  snapShotTest(testNamePrefix, cnStack);
});
