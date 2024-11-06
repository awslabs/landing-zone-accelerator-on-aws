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

import { DiagnosticsPackStack } from '../lib/stacks/diagnostics-pack-stack';
import { snapShotTest } from './snapshot-test';
import { describe } from '@jest/globals';

const testNamePrefix = 'Construct(DiagnosticsPackStack): ';

/**
 * DiagnosticsPack Stack
 */
const getStack = () => {
  const app = new cdk.App();
  const stack = new DiagnosticsPackStack(app, 'DiagnosticsPackStack', {
    acceleratorPrefix: 'AWSAccelerator',
    ssmParamPrefix: '/accelerator',
    bucketNamePrefix: 'aws-accelerator',
    installerStackName: 'AWSAccelerator-InstallerStack',
    configRepositoryName: 'aws-accelerator-config',
    qualifier: 'aws-accelerator',
    env: {
      account: '000000000000',
      region: 'us-east-1',
    },
  });
  return stack;
};
describe('DiagnosticsPackStack', () => {
  snapShotTest(testNamePrefix, getStack);
});
