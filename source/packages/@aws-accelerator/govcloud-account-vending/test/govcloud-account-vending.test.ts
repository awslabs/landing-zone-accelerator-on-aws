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
// import { Template } from 'aws-cdk-lib/assertions';
import { GovCloudAccountVendingStack } from '../lib/govcloud-avm-stack';
import { snapShotTest } from './snapshot-test';
// Test prefix
const testNamePrefix = 'Stack(GovCloudAccountVendingStack): ';
const stack = new GovCloudAccountVendingStack(new cdk.App(), 'AWSAccelerator-Test-GovCloudAccountVendingStack', {
  synthesizer: new cdk.DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
  acceleratorPrefix: 'AWSAccelerator',
});
/**
 * GovCloudAccountVendingStack construct test
 */
describe('GovCloudAccountVendingStack', () => {
  snapShotTest(testNamePrefix, stack);
});
