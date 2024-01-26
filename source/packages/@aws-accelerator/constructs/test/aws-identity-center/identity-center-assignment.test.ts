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

import * as cdk from 'aws-cdk-lib';
import { snapShotTest } from '../snapshot-test';
import { describe } from '@jest/globals';
import { IdentityCenterAssignments } from '../../lib/aws-identity-center/identity-center-assignments';
const testNamePrefix = 'Construct(IdentityCenterGetInstanceId): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new IdentityCenterAssignments(stack, 'IdentityCenterAssignments', {
  identityStoreId: 'd-906751796e',
  identityCenterInstanceArn: 'arn:aws:sso:::instance/ssoins-123456789210',
  principals: [
    { type: 'USER', name: 'lza-accelerator-user' },
    { type: 'GROUP', name: 'lza-accelerator-group' },
  ],
  principalType: 'GROUP',
  principalId: '',
  permissionSetArnValue: 'arn:aws:sso:::permissionSet/ssoins-1111111111111111/ps-1111111111111111',
  accountIds: ['111111111111', '222222222222'],
  kmsKey: new cdk.aws_kms.Key(stack, 'CloudWatchKey', {}),
  logRetentionInDays: 365,
});

describe('IdentityCenterAssignments', () => {
  snapShotTest(testNamePrefix, stack);
});
