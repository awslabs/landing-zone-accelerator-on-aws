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
import { AssociateHostedZones } from '../../lib/aws-route-53/associate-hosted-zones';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(AssociateHostedZones): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new AssociateHostedZones(stack, 'AssociateHostedZones', {
  accountIds: [],
  hostedZoneIds: [],
  hostedZoneAccountId: '111111111111',
  roleName: `AWSAccelerator-EnableCentralEndpointsRole-us-east-1`,
  tagFilters: [
    {
      key: 'accelerator:use-central-endpoints',
      value: 'true',
    },
    {
      key: 'accelerator:central-endpoints-account-id',
      value: '222222222222',
    },
  ],
  logRetentionInDays: 3653,
  kmsKey: new cdk.aws_kms.Key(stack, 'Key', {}),
});

/**
 * AssociateHostedZones construct test
 */
describe('AssociateHostedZones', () => {
  snapShotTest(testNamePrefix, stack);
});
