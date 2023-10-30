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
import { GetCloudFormationResourceType } from '../../lib/aws-cloudformation/get-resource-type';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(GetCloudFormationResourceType): ';

const app = new cdk.App();

// Create stack for native Cfn construct
const env = { account: '333333333333', region: 'us-east-1' };
const stack = new cdk.Stack(app, 'Stack', { env: env });

new GetCloudFormationResourceType(stack, 'TestGetCloudFormationResourceType', {
  stackName: 'AWSAccelerator-TestStack-us-east-1',
  logicalResourceId: 'TestResource',
  logRetentionInDays: 3653,
  cloudwatchKmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  partition: 'aws',
});

/**
 * ConfigServiceTags construct test
 */
describe('GetCloudFormationResourceType', () => {
  snapShotTest(testNamePrefix, stack);
});
