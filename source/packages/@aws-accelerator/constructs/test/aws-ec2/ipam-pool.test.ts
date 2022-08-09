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
import { IpamPool } from '../../lib/aws-ec2/ipam-pool';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(IpamPool): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new IpamPool(stack, 'TestIpamPool', {
  name: 'Test',
  description: 'Test IPAM pool',
  addressFamily: 'ipv4',
  ipamScopeId: 'test-scope',
  locale: 'us-east-1',
  provisionedCidrs: ['10.0.0.0/8', '192.168.0.0/16'],
});

/**
 * IPAM pool construct test
 */
describe('IpamPool', () => {
  snapShotTest(testNamePrefix, stack);
});
