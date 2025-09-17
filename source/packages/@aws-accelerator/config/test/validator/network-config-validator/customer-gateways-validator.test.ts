import { describe, test, expect } from 'vitest';
import { NetworkConfig, VpnConnectionConfig, VpnTunnelOptionsSpecificationsConfig } from '../../../lib/network-config';
import { CustomerGatewaysValidator } from '../../../validator/network-config-validator/customer-gateways-validator';
import { NetworkValidatorFunctions } from '../../../validator/network-config-validator/network-validator-functions';

describe('CustomerGatewaysValidator', () => {
  const vpnConfig: Partial<VpnConnectionConfig> = {
    name: 'vpn-connection-1',
    transitGateway: 'Network-Main',
    staticRoutesOnly: false,
    routeTableAssociations: ['Network-Main-Core'],
    routeTablePropagations: ['Network-Main-Core'],
    tunnelSpecifications: [
      {
        tunnelInsideCidr: '169.254.200.0/30',
      },
      {
        tunnelInsideCidr: '169.254.200.100/30',
      },
    ] as VpnTunnelOptionsSpecificationsConfig[],
    tags: [],
  };

  const customerGatewayConfig = {
    name: 'accelerator-cgw',
    account: 'Network',
    region: 'us-east-1' as const,
    ipAddress: '1.1.1.1',
    asn: 65500,
    vpnConnections: [vpnConfig as VpnConnectionConfig],
    tags: [],
  };

  const networkConfig: Partial<NetworkConfig> = {
    transitGateways: [
      {
        name: 'Network-Main',
        account: 'Network',
        region: 'us-east-1',
        asn: 65521,
        dnsSupport: 'enable',
        vpnEcmpSupport: 'enable',
        defaultRouteTableAssociation: 'disable',
        defaultRouteTablePropagation: 'disable',
        autoAcceptSharingAttachments: 'enable',
        routeTables: [
          {
            name: 'Network-Main-Core',
            routes: [],
            tags: [],
          },
        ],
        tags: [],
        transitGatewayCidrBlocks: ['10.0.0.0/20'],
        transitGatewayIpv6CidrBlocks: ['2001:db8::/64'],
        shareTargets: { organizationalUnits: ['Infrastructure'], accounts: [] },
      },
    ],
    customerGateways: [customerGatewayConfig],
  };

  const helpers = new NetworkValidatorFunctions(
    networkConfig as NetworkConfig,
    ['Root'],
    [
      {
        name: 'Network',
        description: '',
        email: 'network@example.com',
        organizationalUnit: 'Infrastructure',
        warm: true,
        accountAlias: undefined,
      },
    ],
    [],
    ['eu-central-1'],
  );

  test('duplicated vpn connection name', () => {
    const errors: string[] = [];

    new CustomerGatewaysValidator(
      {
        ...networkConfig,
        customerGateways: [
          {
            ...customerGatewayConfig,
            vpnConnections: [vpnConfig, vpnConfig],
          },
        ],
      } as NetworkConfig,
      helpers,
      errors,
    );

    expect(errors.length).toBe(1);
    expect(errors).toContain('[Customer Gateway accelerator-cgw]: Vpn Connection names contain duplication.');
  });

  test('duplicated vpn connection name cross customer gateway', () => {
    const errors: string[] = [];

    new CustomerGatewaysValidator(
      {
        ...networkConfig,
        customerGateways: [
          {
            ...customerGatewayConfig,
            vpnConnections: [vpnConfig],
          },
          {
            ...customerGatewayConfig,
            vpnConnections: [vpnConfig],
          },
        ],
      } as NetworkConfig,
      helpers,
      errors,
    );

    expect(errors.length).toBe(0);
  });
});
