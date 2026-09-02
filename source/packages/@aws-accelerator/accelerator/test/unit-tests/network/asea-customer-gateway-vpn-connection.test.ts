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

import { describe, expect, test, vi } from 'vitest';
import { AseaResourceType, CfnResourceType } from '@aws-accelerator/config';
import { SsmResourceType } from '@aws-accelerator/utils';
import { CustomerGateways } from '../../../lib/asea-resources/customer-gateway';
import { VpnConnections } from '../../../lib/asea-resources/vpn-connection';

/**
 * Coverage for GitLab issue #4883 -- ASEA Customer Gateway / Site-to-Site VPN adoption.
 *
 * ASEA `firewalls[type=CGW]` create `AWS::EC2::CustomerGateway` + `AWS::EC2::VPNConnection`
 * (attached to the ASEA TGW) in the SharedNetwork Phase-1 stack. After migration these are
 * absent from `aseaResources.json` and `network-config.yaml`, so LZA cannot reference the
 * VPN attachment for TGW route-table association/propagation.
 *
 * These handlers adopt the already-CfnInclude'd resources by writing the LZA SSM parameters
 * the network-associations lookup resolves against:
 *   - Customer Gateway id -> `/network/customerGateways/<name>/id`  (SsmResourceType.CGW)
 *   - VPN attachment      -> `/network/vpnConnection/<name>/id`     (SsmResourceType.TGW_VPN)
 * and record each in the ASEA resource mapping. The SSM value must be the CFN physical id,
 * matching what the native create path writes.
 *
 * Tests drive the process method directly against a mock scope (no `super()`), mirroring the
 * existing asea-resources handler tests.
 */

// Representative ASEA Customer Gateway / Site-to-Site VPN fixtures (account and resource IDs anonymized).
const CGW_1 = { name: 'OnPremise_fw_ip0_cgw', id: 'cgw-0123456789abcdef0', logicalId: 'OnPremisefwip0cgw' };
const CGW_2 = { name: 'OnPremise_fw_2_ip0_cgw', id: 'cgw-0123456789abcdef1', logicalId: 'OnPremisefw2ip0cgw' };
const VPN_1 = { name: 'OnPremise_fw_ip0_vpn', id: 'vpn-0123456789abcdef0', logicalId: 'OnPremisefwip0vpn' };

function cfnResource(logicalId: string, physicalId: string, name?: string): CfnResourceType {
  return {
    logicalResourceId: logicalId,
    physicalResourceId: physicalId,
    resourceType: 'AWS::EC2::Resource',
    resourceMetadata: { Properties: { Tags: name ? [{ Key: 'Name', Value: name }] : [] } },
  };
}

function buildMockScope(resources: CfnResourceType[]) {
  return {
    importStackResources: {
      getResourcesByType: vi.fn().mockReturnValue(resources),
    },
    addLogs: vi.fn(),
    addSsmParameter: vi.fn(),
    addAseaResource: vi.fn(),
    // Echo the resource type + args back so we can assert the correct path template was used.
    getSsmPath: vi
      .fn()
      .mockImplementation((type: string, replacements: string[]) => `${type}:${replacements.join('/')}`),
  };
}

describe('CustomerGateways.processCustomerGateways (#4883)', () => {
  let scope: ReturnType<typeof buildMockScope>;

  function handlerWith(resources: CfnResourceType[]): CustomerGateways {
    scope = buildMockScope(resources);
    const handler = Object.create(CustomerGateways.prototype) as CustomerGateways;
    (handler as unknown as { scope: unknown }).scope = scope;
    return handler;
  }

  test('PRESENT: adopts each CGW -> SSM param (CGW path, physical id) + mapping entry', () => {
    const handler = handlerWith([
      cfnResource(CGW_1.logicalId, CGW_1.id, CGW_1.name),
      cfnResource(CGW_2.logicalId, CGW_2.id, CGW_2.name),
    ]);

    handler.processCustomerGateways();

    expect(scope.getSsmPath).toHaveBeenCalledWith(SsmResourceType.CGW, [CGW_1.name]);
    expect(scope.addSsmParameter).toHaveBeenCalledTimes(2);
    expect(scope.addSsmParameter).toHaveBeenCalledWith(expect.objectContaining({ stringValue: CGW_1.id }));
    expect(scope.addSsmParameter).toHaveBeenCalledWith(expect.objectContaining({ stringValue: CGW_2.id }));
    expect(scope.addAseaResource).toHaveBeenCalledWith(AseaResourceType.CUSTOMER_GATEWAY, CGW_1.name);
    expect(scope.addAseaResource).toHaveBeenCalledWith(AseaResourceType.CUSTOMER_GATEWAY, CGW_2.name);
  });

  test('ABSENT: no CGWs -> writes nothing', () => {
    const handler = handlerWith([]);
    handler.processCustomerGateways();
    expect(scope.addSsmParameter).not.toHaveBeenCalled();
    expect(scope.addAseaResource).not.toHaveBeenCalled();
  });

  test('NO NAME TAG: skips the resource and records nothing', () => {
    const handler = handlerWith([cfnResource(CGW_1.logicalId, CGW_1.id)]);
    handler.processCustomerGateways();
    expect(scope.addSsmParameter).not.toHaveBeenCalled();
    expect(scope.addAseaResource).not.toHaveBeenCalled();
    expect(scope.addLogs).toHaveBeenCalledTimes(1);
  });
});

describe('VpnConnections.processVpnConnections (#4883)', () => {
  let scope: ReturnType<typeof buildMockScope>;

  function handlerWith(resources: CfnResourceType[]): VpnConnections {
    scope = buildMockScope(resources);
    const handler = Object.create(VpnConnections.prototype) as VpnConnections;
    (handler as unknown as { scope: unknown }).scope = scope;
    return handler;
  }

  test('PRESENT: adopts VPN -> SSM param (TGW_VPN path, vpn physical id) + mapping entry', () => {
    const handler = handlerWith([cfnResource(VPN_1.logicalId, VPN_1.id, VPN_1.name)]);

    handler.processVpnConnections();

    // Must use the TGW_VPN template that network-associations resolves against, keyed by VPN name.
    expect(scope.getSsmPath).toHaveBeenCalledWith(SsmResourceType.TGW_VPN, [VPN_1.name]);
    expect(scope.addSsmParameter).toHaveBeenCalledTimes(1);
    // Value must be the VPN connection physical id (vpn-...), matching the native create path.
    expect(scope.addSsmParameter).toHaveBeenCalledWith(expect.objectContaining({ stringValue: VPN_1.id }));
    expect(scope.addAseaResource).toHaveBeenCalledWith(AseaResourceType.VPN_CONNECTION, VPN_1.name);
  });

  test('ABSENT: no VPNs -> writes nothing', () => {
    const handler = handlerWith([]);
    handler.processVpnConnections();
    expect(scope.addSsmParameter).not.toHaveBeenCalled();
    expect(scope.addAseaResource).not.toHaveBeenCalled();
  });

  test('NO NAME TAG: skips the resource and records nothing', () => {
    const handler = handlerWith([cfnResource(VPN_1.logicalId, VPN_1.id)]);
    handler.processVpnConnections();
    expect(scope.addSsmParameter).not.toHaveBeenCalled();
    expect(scope.addAseaResource).not.toHaveBeenCalled();
    expect(scope.addLogs).toHaveBeenCalledTimes(1);
  });
});
