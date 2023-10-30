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
