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
import { OptInRegions } from '../../lib/aws-opt-in-regions/enable-opt-in-regions';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(EnableOptInRegions): ';

const app = new cdk.App();

// Create stack for native Cfn construct
const env = { account: '333333333333', region: 'us-east-1' };
const stack = new cdk.Stack(app, 'Stack', { env: env });

new OptInRegions(stack, 'OptInRegions', {
  kmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  logRetentionInDays: 3653,
  managementAccountId: '333333333333',
  accountIds: ['333333333333', '444444444444', '555555555555', '666666666666'],
  homeRegion: 'us-east-1',
  enabledRegions: ['ca-west-1', 'eu-south-2'],
  globalRegion: 'us-east-1',
});

/**
 * ConfigServiceTags construct test
 */
describe('EnableOptInRegions', () => {
  snapShotTest(testNamePrefix, stack);
});
