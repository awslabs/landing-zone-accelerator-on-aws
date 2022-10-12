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

import { VpnConnection } from '../../lib/aws-ec2/vpn-connection';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(VpnConnection): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new VpnConnection(stack, 'TestVpn', {
  name: 'Test-Vpn',
  customerGatewayId: 'Test-Cgw',
  staticRoutesOnly: true,
  transitGatewayId: 'Test-tgw',
  vpnTunnelOptionsSpecifications: [
    {
      preSharedKey: 'test-key-1',
      tunnelInsideCidr: '169.254.200.0/30',
    },
    {
      preSharedKey: 'test-key-1',
      tunnelInsideCidr: '169.254.100.0/30',
    },
  ],
  tags: [{ key: 'Test-Key', value: 'Test-Value' }],
});

/**
 * VpnConnection construct test
 */
describe('VpnConnection', () => {
  snapShotTest(testNamePrefix, stack);
});
