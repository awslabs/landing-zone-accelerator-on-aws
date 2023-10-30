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
import { UsersGroupsMetadata } from '../../lib/aws-identitystore/users-groups-metadata';
import { snapShotTest } from '../snapshot-test';
import { describe } from '@jest/globals';
const testNamePrefix = 'Construct(IdentityCenterGetInstanceId): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new UsersGroupsMetadata(stack, 'UsersGroupsMetadata', {
  identityStoreId: 'd-906751796e',
  principals: [
    { type: 'USER', name: 'lza-accelerator-user' },
    { type: 'GROUP', name: 'lza-accelerator-group' },
  ],
  resourceUniqueIdentifier: `111111111111-Assignment1`,
  customResourceLambdaEnvironmentEncryptionKmsKey: new cdk.aws_kms.Key(stack, 'LambdaKey', {}),
  customResourceLambdaCloudWatchLogKmsKey: new cdk.aws_kms.Key(stack, 'CloudWatchKey', {}),
  customResourceLambdaLogRetentionInDays: 365,
});

/**
 * UsersGroupsMetadata construct test
 */
describe('UsersGroupsMetadata', () => {
  snapShotTest(testNamePrefix, stack);
});
