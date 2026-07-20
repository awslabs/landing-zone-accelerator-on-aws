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

import { describe, test, expect } from 'vitest';
import { NetworkConfig } from '../../../lib/network-config';
import { TransitGatewayValidator } from '../../../validator/network-config-validator/transit-gateway-validator';
import { NetworkValidatorFunctions } from '../../../validator/network-config-validator/network-validator-functions';

describe('TransitGatewayValidator', () => {
  const baseTransitGateway = {
    name: 'Network-Main',
    account: 'Network',
    region: 'us-east-1',
    asn: 65521,
    dnsSupport: 'enable',
    vpnEcmpSupport: 'enable',
    defaultRouteTableAssociation: 'disable',
    defaultRouteTablePropagation: 'disable',
    autoAcceptSharingAttachments: 'enable',
    routeTables: [{ name: 'Network-Main-Core', routes: [], tags: [] }],
    tags: [],
  };

  // Minimal helpers instance; the encryption-support validations do not exercise it.
  const helpers = new NetworkValidatorFunctions({} as unknown as NetworkConfig, [], [], [], ['us-east-1']);

  /**
   * Filter to just the encryptionSupport errors so unrelated TGW validations
   * (ASN range, etc.) do not affect the assertions.
   */
  function encryptionErrors(errors: string[]): string[] {
    return errors.filter(e => e.includes('encryptionSupport'));
  }

  test('should error when encryptionSupport and securityGroupReferencingSupport are both enabled', () => {
    const errors: string[] = [];

    new TransitGatewayValidator(
      {
        transitGateways: [
          {
            ...baseTransitGateway,
            securityGroupReferencingSupport: 'enable',
            encryptionSupport: 'enable',
          },
        ],
      } as unknown as NetworkConfig,
      helpers,
      errors,
    );

    const encErrors = encryptionErrors(errors);
    expect(encErrors).toHaveLength(1);
    expect(encErrors[0]).toContain('Network-Main');
    expect(encErrors[0]).toContain('securityGroupReferencingSupport');
  });

  test('should not error when only securityGroupReferencingSupport is enabled', () => {
    const errors: string[] = [];

    new TransitGatewayValidator(
      {
        transitGateways: [
          {
            ...baseTransitGateway,
            securityGroupReferencingSupport: 'enable',
            encryptionSupport: 'disable',
          },
        ],
      } as unknown as NetworkConfig,
      helpers,
      errors,
    );

    expect(encryptionErrors(errors)).toHaveLength(0);
  });

  test('should not error when only encryptionSupport is enabled', () => {
    const errors: string[] = [];

    new TransitGatewayValidator(
      {
        transitGateways: [
          {
            ...baseTransitGateway,
            securityGroupReferencingSupport: 'disable',
            encryptionSupport: 'enable',
          },
        ],
      } as unknown as NetworkConfig,
      helpers,
      errors,
    );

    expect(encryptionErrors(errors)).toHaveLength(0);
  });

  test('should error when encryptionSupport and multicastSupport are both enabled', () => {
    const errors: string[] = [];

    new TransitGatewayValidator(
      {
        transitGateways: [
          {
            ...baseTransitGateway,
            multicastSupport: 'enable',
            encryptionSupport: 'enable',
          },
        ],
      } as unknown as NetworkConfig,
      helpers,
      errors,
    );

    const encErrors = encryptionErrors(errors);
    expect(encErrors).toHaveLength(1);
    expect(encErrors[0]).toContain('multicastSupport');
  });

  test('should error when encryptionSupport is enabled on a TGW that has a Connect attachment', () => {
    const errors: string[] = [];

    new TransitGatewayValidator(
      {
        transitGateways: [
          {
            ...baseTransitGateway,
            encryptionSupport: 'enable',
          },
        ],
        vpcs: [],
        transitGatewayConnects: [
          {
            name: 'Network-Inspection',
            region: 'us-east-1',
            transitGateway: { name: 'Network-Main', account: 'Network' },
          },
        ],
      } as unknown as NetworkConfig,
      helpers,
      errors,
    );

    const encErrors = encryptionErrors(errors);
    expect(encErrors).toHaveLength(1);
    expect(encErrors[0]).toContain('Connect attachments');
  });

  test('should error when encryptionSupport is enabled on a TGW that has a Peering attachment (as accepter)', () => {
    const errors: string[] = [];

    new TransitGatewayValidator(
      {
        transitGateways: [
          {
            ...baseTransitGateway,
            encryptionSupport: 'enable',
          },
        ],
        transitGatewayPeering: [
          {
            name: 'Network-Main-And-SharedServices-Main-Peering',
            requester: { transitGatewayName: 'SharedServices-Main', account: 'SharedServices', region: 'us-east-1' },
            accepter: { transitGatewayName: 'Network-Main', account: 'Network', region: 'us-east-1' },
          },
        ],
      } as unknown as NetworkConfig,
      helpers,
      errors,
    );

    const encErrors = encryptionErrors(errors);
    expect(encErrors).toHaveLength(1);
    expect(encErrors[0]).toContain('Peering attachments');
  });

  test('should report multiple encryptionSupport conflicts on the same TGW', () => {
    const errors: string[] = [];

    new TransitGatewayValidator(
      {
        transitGateways: [
          {
            ...baseTransitGateway,
            securityGroupReferencingSupport: 'enable',
            multicastSupport: 'enable',
            encryptionSupport: 'enable',
          },
        ],
      } as unknown as NetworkConfig,
      helpers,
      errors,
    );

    expect(encryptionErrors(errors)).toHaveLength(2);
  });
});
