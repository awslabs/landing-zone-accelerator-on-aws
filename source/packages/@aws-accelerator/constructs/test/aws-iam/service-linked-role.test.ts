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
import { ServiceLinkedRole } from '@aws-accelerator/constructs';
import { snapShotTest } from '../snapshot-test';
import { describe } from '@jest/globals';

const testNamePrefix = 'Construct(CreateServiceLinkedRole): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new ServiceLinkedRole(stack, 'ServiceLinkedRole', {
  environmentEncryptionKmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  cloudWatchLogKmsKey: new cdk.aws_kms.Key(stack, 'CustomKeyCloudWatch', {}),
  cloudWatchLogRetentionInDays: 3653,
  awsServiceName: 'awesomeService.amazonaws.com',
  description: 'some description',
  roleName: 'AWSServiceRoleForAwesomeService',
});

/**
 * ServiceLinkedRole construct test
 */
describe('ServiceLinkedRole', () => {
  snapShotTest(testNamePrefix, stack);
});
