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
import { AutoscalingGroup } from '../../lib/aws-autoscaling/create-autoscaling-group';
import { snapShotTest } from '../snapshot-test';
import { describe } from '@jest/globals';

const testNamePrefix = 'Construct(AutoscalingGroup): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new AutoscalingGroup(stack, 'Test', {
  name: 'string',
  minSize: 1,
  maxSize: 4,
  desiredSize: 2,
  launchTemplateId: 'string',
  launchTemplateVersion: 'string',
  healthCheckGracePeriod: 300,
  healthCheckType: 'ELB',
  targetGroups: ['string'],
  subnets: ['string'],
  lambdaKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  cloudWatchLogKmsKey: new cdk.aws_kms.Key(stack, 'CustomKeyCloudWatch', {}),
  cloudWatchLogRetentionInDays: 3653,
  tags: [{ key: 'key', value: 'value' }],
});

/**
 * GWLB construct test
 */
describe('AutoscalingGroup', () => {
  snapShotTest(testNamePrefix, stack);
});
