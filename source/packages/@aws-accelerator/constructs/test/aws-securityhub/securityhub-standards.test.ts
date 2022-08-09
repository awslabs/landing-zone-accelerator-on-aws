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
import { SecurityHubStandards } from '../../index';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(SecurityHubStandards): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new SecurityHubStandards(stack, 'SecurityHubStandards', {
  standards: [
    {
      name: 'AWS Foundational Security Best Practices v1.0.0',
      enable: true,
      controlsToDisable: ['IAM.1', 'EC2.10', 'Lambda.4'],
    },
    {
      name: 'PCI DSS v3.2.1',
      enable: true,
      controlsToDisable: ['IAM.1', 'EC2.10', 'Lambda.4'],
    },
  ],
  kmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  logRetentionInDays: 3653,
});

/**
 * SecurityHubStandards construct test
 */
describe('SecurityHubStandards', () => {
  snapShotTest(testNamePrefix, stack);
});
