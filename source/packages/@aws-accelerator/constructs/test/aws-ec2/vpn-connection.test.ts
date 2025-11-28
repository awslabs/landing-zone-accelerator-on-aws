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
import { describe } from 'vitest';

import { VpnConnection } from '../../lib/aws-ec2/vpn-connection';
import { snapShotTest } from '../snapshot-test';
import { OutsideIpAddressType } from '../../lib/aws-ec2/vpn-connection';

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

new VpnConnection(stack, 'TestIpv6Vpn', {
  name: 'Test-Ipv6-Vpn',
  customerGatewayId: 'Test-Ipv6-Cgw',
  staticRoutesOnly: true,
  transitGatewayId: 'Test-tgw',
  amazonIpv6NetworkCidr: '::/128',
  customerIpv6NetworkCidr: '::/128',
  outsideIpAddressType: OutsideIpAddressType.Ipv6,
  vpnTunnelOptionsSpecifications: [
    {
      preSharedKey: 'test-key-2',
      tunnelInsideIpv6Cidr: 'fd12:3456:789a:1::/126',
    },
    {
      preSharedKey: 'test-key-2',
      tunnelInsideIpv6Cidr: 'fd98:abcd:4321:7::/126',
    },
  ],
  tags: [{ key: 'Test-Key', value: 'Test-Value' }],
});

new VpnConnection(stack, 'AdvancedVpn', {
  name: 'Advanced-Vpn',
  amazonIpv4NetworkCidr: '10.0.0.0/16',
  customerIpv4NetworkCidr: '192.168.0.0/16',
  customResourceHandler: cdk.aws_lambda.Function.fromFunctionName(stack, 'TestFunction', 'TestFunction'),
  enableVpnAcceleration: true,
  customerGatewayId: 'Test-Cgw',
  staticRoutesOnly: true,
  transitGatewayId: 'Test-tgw',
  vpnTunnelOptionsSpecifications: [
    {
      dpdTimeoutAction: 'restart',
      dpdTimeoutSeconds: 60,
      ikeVersions: [2],
      logging: {
        enable: true,
      },
      phase1: {
        dhGroups: [14, 20],
        encryptionAlgorithms: ['AES256'],
        integrityAlgorithms: ['SHA2-256'],
      },
      phase2: {
        dhGroups: [14, 20],
        encryptionAlgorithms: ['AES256'],
        integrityAlgorithms: ['SHA2-256'],
      },
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
