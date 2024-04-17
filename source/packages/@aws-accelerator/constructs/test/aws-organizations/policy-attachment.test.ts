/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { Stack } from 'aws-cdk-lib';
import { Key } from 'aws-cdk-lib/aws-kms';
import { PolicyAttachment } from '../../lib/aws-organizations/policy-attachment';
import { PolicyType } from '../../lib/aws-organizations/policy';
import { snapShotTest } from '../snapshot-test';
import { describe } from '@jest/globals';

const testNamePrefix = 'Construct(PolicyAttachment): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new Stack();

new PolicyAttachment(stack, 'PolicyAttachment', {
  policyId: 'policyId',
  targetId: 'targetId',
  type: PolicyType.SERVICE_CONTROL_POLICY,
  strategy: 'deny-list',
  configPolicyNames: ['AcceleratorGuardrails1', 'AcceleratorGuardrails2'],
  acceleratorPrefix: 'AWSAccelerator',
  kmsKey: new Key(stack, 'CustomKey', {}),
  logRetentionInDays: 3653,
});

/**
 * PolicyAttachment construct test
 */
describe('PolicyAttachment', () => {
  snapShotTest(testNamePrefix, stack);
});
