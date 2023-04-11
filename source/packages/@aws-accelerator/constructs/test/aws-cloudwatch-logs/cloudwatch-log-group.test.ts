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
import { CloudWatchLogGroups } from '../../lib/aws-cloudwatch-logs/cloudwatch-log-group';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(CloudWatchLogGroups): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new CloudWatchLogGroups(stack, 'CloudWatchLogGroups', {
  logGroupName: '/App/Test1',
  logRetentionInDays: 30,
  keyArn: 'arn:aws:kms:us-east-1:111111111111:key/121ac3b6-8d53-4d8a-a05c-7a0012249950',
  customLambdaLogKmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  customLambdaLogRetention: 30,
});

new CloudWatchLogGroups(stack, 'CloudWatchLogGroupsNoKey', {
  logGroupName: '/App/Test2',
  logRetentionInDays: 180,
  customLambdaLogKmsKey: new cdk.aws_kms.Key(stack, 'CloudWatchKey', {}),
  customLambdaLogRetention: 30,
});

/**
 * CloudWatchLogGroups construct test
 */
describe('CloudWatchLogGroups', () => {
  snapShotTest(testNamePrefix, stack);
});
