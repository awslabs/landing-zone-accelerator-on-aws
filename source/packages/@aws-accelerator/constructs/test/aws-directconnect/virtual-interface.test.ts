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

import { VirtualInterface } from '../../lib/aws-directconnect/virtual-interface';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(VirtualInterface): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();
const key = new cdk.aws_kms.Key(stack, 'Key');

// Test virtual interface
new VirtualInterface(stack, 'TestVif', {
  connectionId: 'test-dx-conn-id',
  customerAsn: 65000,
  interfaceName: 'test-vif',
  region: 'us-east-1',
  type: 'transit',
  vlan: 300,
  directConnectGatewayId: 'test-dxgw-id',
  kmsKey: key,
  logRetentionInDays: 3653,
});

// Test virtual interface allocation
new VirtualInterface(stack, 'TestVifAllocation', {
  connectionId: 'test-dx-conn-id',
  customerAsn: 65000,
  interfaceName: 'test-vif',
  ownerAccount: '111111111',
  region: 'us-east-1',
  type: 'transit',
  vlan: 300,
  kmsKey: key,
  logRetentionInDays: 3653,
});

/**
 * VirtualInterface construct test
 */
describe('VirtualInterface', () => {
  snapShotTest(testNamePrefix, stack);
});
