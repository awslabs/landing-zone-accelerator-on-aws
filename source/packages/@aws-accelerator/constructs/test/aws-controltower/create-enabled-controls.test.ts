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
import {
  CreateControlTowerEnabledControls,
  EnabledControlProps,
} from '../../lib/aws-controltower/create-enabled-controls';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(TestCreateCTControls): ';

const app = new cdk.App();

// Create stack for native Cfn construct
const env = { account: '333333333333', region: 'us-east-1' };
const stack = new cdk.Stack(app, 'Stack', { env: env });
const controls: EnabledControlProps[] = [
  {
    enabledControlIdentifier: 'AWS-GR_CT_AUDIT_BUCKET_POLICY_CHANGES_PROHIBITED',
    ouArn: 'arn:aws:organizations::123456789012:ou/o-a1b2c3d4e5/ou-ab12-c3d4e5f6',
    ouName: 'ExampleOU',
  },
  {
    enabledControlIdentifier: 'AWS-GR_SNS_CHANGE_PROHIBITED',
    ouArn: 'arn:aws:organizations::123456789012:ou/o-a1b2c3d4e5/ou-ab12-c3d4e5f6',
    ouName: 'ExampleOU',
  },
  {
    enabledControlIdentifier: 'AWS-GR_AUDIT_BUCKET_POLICY_CHANGES_PROHIBITED',
    ouArn: 'arn:aws:organizations::123456789012:ou/o-a1b2c3d4e5/ou-ab12-c3d4e5f6',
    ouName: 'ExampleOU',
  },
  {
    enabledControlIdentifier: 'AWS-GR_LAMBDA_CHANGE_PROHIBITED',
    ouArn: 'arn:aws:organizations::123456789012:ou/o-a1b2c3d4e5/ou-ab12-c3d4e5f6',
    ouName: 'ExampleOU',
  },
  {
    enabledControlIdentifier: 'AWS-GR_DISALLOW_CROSS_REGION_NETWORKING',
    ouArn: 'arn:aws:organizations::123456789012:ou/o-a1b2c3d4e5/ou-ab12-c3d4e5f6',
    ouName: 'ExampleOU',
  },
  {
    enabledControlIdentifier: 'AWS-GR_CLOUDTRAIL_VALIDATION_ENABLED',
    ouArn: 'arn:aws:organizations::123456789012:ou/o-a1b2c3d4e5/ou-ab12-c3d4e5f6',
    ouName: 'ExampleOU',
  },
];
new CreateControlTowerEnabledControls(stack, 'TestCreateCTControls', {
  dependencyFrequency: 2,
  controls,
});

describe('TestCreateCTControls', () => {
  snapShotTest(testNamePrefix, stack);
});
