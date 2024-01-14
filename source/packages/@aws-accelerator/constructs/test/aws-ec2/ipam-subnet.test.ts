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
import { IpamSubnet } from '../../lib/aws-ec2/ipam-subnet';
import { snapShotTest } from '../snapshot-test';
import { describe } from '@jest/globals';

const testNamePrefix = 'Construct(IpamSubnet): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new IpamSubnet(stack, 'TestIpamSubnet', {
  name: 'Test',
  availabilityZone: 'us-east-1a',
  availabilityZoneId: undefined,
  basePool: ['10.0.0.0/8'],
  ipamAllocation: {
    ipamPoolName: 'test-pool',
    netmaskLength: 24,
  },
  kmsKey: new cdk.aws_kms.Key(stack, 'Key', {}),
  logRetentionInDays: 3653,
  vpcId: 'vpc-test',
  tags: [{ key: 'key', value: 'value' }],
});

new IpamSubnet(stack, 'TestIpamSubnet2', {
  name: 'Test2',
  availabilityZone: undefined,
  availabilityZoneId: 'use1-az2',
  basePool: ['10.0.0.0/8'],
  ipamAllocation: {
    ipamPoolName: 'test-pool',
    netmaskLength: 24,
  },
  kmsKey: new cdk.aws_kms.Key(stack, 'Key2', {}),
  logRetentionInDays: 3653,
  vpcId: 'vpc-test',
  tags: [{ key: 'key', value: 'value' }],
});

IpamSubnet.fromLookup(stack, 'TestIpamSubnetFromLookup', {
  owningAccountId: '11111111111',
  ssmSubnetIdPath: '/path/to/ipam/subnet',
  roleName: 'testRole',
  region: 'us-east-1',
  kmsKey: new cdk.aws_kms.Key(stack, 'KeyForLookup', {}),
  logRetentionInDays: 3653,
});

/**
 * IPAM subnet construct test
 */
describe('IpamSubnet', () => {
  snapShotTest(testNamePrefix, stack);
});
