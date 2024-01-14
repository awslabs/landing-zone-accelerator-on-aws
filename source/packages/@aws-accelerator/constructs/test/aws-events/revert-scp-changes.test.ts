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
import { RevertScpChanges } from '../../lib/aws-events/revert-scp-changes';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(RevertScpChanges): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();
const configDirPath = `${__dirname}/../../../accelerator/test/configs/all-enabled`;

new RevertScpChanges(stack, 'RevertScpChanges', {
  acceleratorPrefix: 'AWSAccelerator',
  configDirPath: `${__dirname}/../../../accelerator/test/configs/snapshot-only`,
  homeRegion: 'us-west-2',
  kmsKeyCloudWatch: new cdk.aws_kms.Key(stack, 'CustomCloudWatchKey', {}),
  kmsKeyLambda: new cdk.aws_kms.Key(stack, 'CustomLambdaKey', {}),
  logRetentionInDays: 365,
  acceleratorTopicNamePrefix: 'aws-accelerator',
  snsTopicName: 'Security',
  scpFilePaths: [
    {
      name: 'AcceleratorGuardrails1',
      path: 'service-control-policies/guardrails-1.json',
      tempPath: `${configDirPath}/service-control-policies/guardrails-1.json`,
    },
    {
      name: 'AcceleratorGuardrails2',
      path: 'service-control-policies/guardrails-2.json',
      tempPath: `${configDirPath}/service-control-policies/guardrails-2.json`,
    },
  ],
  singleAccountMode: true,
  organizationEnabled: true,
});

new RevertScpChanges(stack, 'RevertScpChanges2', {
  acceleratorPrefix: 'AWSAccelerator',
  configDirPath: `${__dirname}/../../../accelerator/test/configs/snapshot-only`,
  homeRegion: 'us-west-2',
  kmsKeyCloudWatch: new cdk.aws_kms.Key(stack, 'CustomCloudWatchKey2', {}),
  kmsKeyLambda: new cdk.aws_kms.Key(stack, 'CustomLambdaKey2', {}),
  logRetentionInDays: 365,
  acceleratorTopicNamePrefix: 'aws-accelerator',
  snsTopicName: 'Security',
  scpFilePaths: [
    {
      name: 'AcceleratorGuardrails1',
      path: 'service-control-policies/guardrails-1.json',
      tempPath: `${configDirPath}/service-control-policies/guardrails-1.json`,
    },
    {
      name: 'AcceleratorGuardrails2',
      path: 'service-control-policies/guardrails-2.json',
      tempPath: `${configDirPath}/service-control-policies/guardrails-2.json`,
    },
  ],
  singleAccountMode: false,
  organizationEnabled: false,
});
/**
 * RevertScpChanges construct test
 */
describe('RevertScpChanges', () => {
  snapShotTest(testNamePrefix, stack);
});
