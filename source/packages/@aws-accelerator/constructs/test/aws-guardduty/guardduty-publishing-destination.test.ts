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
import { GuardDutyPublishingDestination } from '../../lib/aws-guardduty/guardduty-publishing-destination';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(GuardDutyPublishingDestination): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new GuardDutyPublishingDestination(stack, 'GuardDutyPublishingDestination', {
  destinationArn: `arn:${stack.partition}:s3:::aws-accelerator-guardduty-${stack.account}-${stack.region}`,
  exportDestinationType: 'S3',
  exportDestinationOverride: true,
  destinationKmsKey: new cdk.aws_kms.Key(stack, 'DestinationKey', {}),
  logKmsKey: new cdk.aws_kms.Key(stack, 'LogKey', {}),
  logRetentionInDays: 3653,
});

/**
 * GuardDutyPublishingDestination construct test
 */
describe('GuardDutyPublishingDestination', () => {
  snapShotTest(testNamePrefix, stack);
});
