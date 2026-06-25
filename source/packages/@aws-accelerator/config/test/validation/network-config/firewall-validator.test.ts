import { describe, expect, test } from 'vitest';
import { NetworkFirewallValidator } from '../../../validator/network-config-validator/network-firewall-validator';
import { NetworkConfig } from '../../../lib/network-config';
import { NetworkValidatorFunctions } from '../../../validator/network-config-validator/network-validator-functions';
import { INetworkConfig } from '../../../lib/models/network-config';
import { AccountConfig, GovCloudAccountConfig } from '../../../lib/accounts-config';

describe('NetworkFirewallValidator', () => {
  test('should pass a basic empty config', () => {
    const { errors } = validate();
    expect(errors.length).toBe(0);
  });

  describe('validating firewalls', () => {
    test('should allow setting an arn as firewall name', () => {
      const { errors } = validate({
        updateHelperProps: props => ({
          ...props,
          accounts: [
            {
              name: 'a1',
              email: '',
              description: '',
              organizationalUnit: 'ou1',
              enableGovCloud: false,
              warm: false,
              accountAlias: '',
            },
          ],
        }),
        updateNetworkConfig: (config: Writable<INetworkConfig>) => {
          config.vpcs = [
            {
              name: 'vpc-a',
              account: 'a1',
              region: 'eu-west-1',
            },
            {
              name: 'vpc-b',
              account: 'a1',
              region: 'eu-west-1',
            },
          ];
          config.centralNetworkServices = {
            delegatedAdminAccount: '',
            networkFirewall: {
              firewalls: [
                {
                  firewallPolicy:
                    'arn:aws:network-firewall:ap-southeast-2:123456789012:firewall-policy/central-egress-nfw-policy',
                  name: 'the-external-firewall-policy',
                  subnets: [],
                  vpc: 'vpc-a',
                },
                {
                  firewallPolicy: 'named-firewall-policy',
                  name: 'the-named-firewall-policy',
                  subnets: [],
                  vpc: 'vpc-b',
                },
              ],
              policies: [
                {
                  name: 'named-firewall-policy',
                  regions: ['eu-west-1'],
                  shareTargets: {
                    accounts: ['a1'],
                  },
                  firewallPolicy: {
                    statelessDefaultActions: [],
                    statelessFragmentDefaultActions: [],
                  },
                },
              ],
              rules: [],
            },
          };
          return config;
        },
      });
      expect(errors).toEqual([]);
    });

    test('should fail if a firewall policy name is used that has no respective firewall', () => {
      const { errors } = validate({
        updateHelperProps: props => ({
          ...props,
          accounts: [
            {
              name: 'a1',
              email: '',
              description: '',
              organizationalUnit: 'ou1',
              enableGovCloud: false,
              warm: false,
              accountAlias: '',
            },
          ],
        }),
        updateNetworkConfig: (config: Writable<INetworkConfig>) => {
          config.vpcs = [
            {
              name: 'vpc-b',
              account: 'a1',
              region: 'eu-west-1',
            },
          ];
          config.centralNetworkServices = {
            delegatedAdminAccount: '',
            networkFirewall: {
              firewalls: [
                {
                  firewallPolicy: 'named-firewall-policy',
                  name: 'the-named-firewall-policy',
                  subnets: [],
                  vpc: 'vpc-b',
                },
              ],
              policies: [],
              rules: [],
            },
          };
          return config;
        },
      });
      expect(errors).toEqual([
        '[Network Firewall firewall the-named-firewall-policy]: firewall policy "named-firewall-policy" does not exist',
      ]);
    });
  });
});

/**
 * Verify a Network Firewall is rejected when its VPC account is not covered by the
 * firewall policy's shareTargets (strict-OU: no child-OU cascade); the delegated admin is exempt.
 */
describe('NetworkFirewallValidator - firewall policy share targets', () => {
  // Network = delegated admin (OU=Infrastructure); WorkloadA = OU=Workload; WorkloadB = OU=Workload/NestedW (child).
  const accounts: AccountConfig[] = [
    {
      name: 'Network',
      email: 'net@example.com',
      description: '',
      organizationalUnit: 'Infrastructure',
      warm: false,
      accountAlias: undefined,
    },
    {
      name: 'WorkloadA',
      email: 'wkA@example.com',
      description: '',
      organizationalUnit: 'Workload',
      warm: false,
      accountAlias: undefined,
    },
    {
      name: 'WorkloadB',
      email: 'wkB@example.com',
      description: '',
      organizationalUnit: 'Workload/NestedW',
      warm: false,
      accountAlias: undefined,
    },
  ];
  const ouIdNames = ['Root', 'Security', 'Infrastructure', 'Workload', 'Workload/NestedW'];

  function buildFirewallConfig(
    vpcAccount: string,
    policyShareTargets: { organizationalUnits?: string[]; accounts?: string[] },
  ) {
    return (config: Writable<INetworkConfig>): INetworkConfig => {
      config.vpcs = [{ name: 'vpc-a', account: vpcAccount, region: 'us-east-1' }];
      config.centralNetworkServices = {
        delegatedAdminAccount: 'Network',
        networkFirewall: {
          firewalls: [{ firewallPolicy: 'pol-a', name: 'fw-a', subnets: [], vpc: 'vpc-a' }],
          policies: [
            {
              name: 'pol-a',
              regions: ['us-east-1'],
              shareTargets: policyShareTargets,
              firewallPolicy: { statelessDefaultActions: [], statelessFragmentDefaultActions: [] },
            },
          ],
          rules: [],
        },
      };
      return config;
    };
  }

  test('PASS: VPC account explicitly listed in policy.shareTargets.accounts', () => {
    const { errors } = validate({
      updateHelperProps: props => ({ ...props, accounts, ouIdNames }),
      updateNetworkConfig: buildFirewallConfig('WorkloadA', { accounts: ['WorkloadA'] }),
    });
    expect(errors.filter(e => e.includes('firewall policy "pol-a" is not shared'))).toHaveLength(0);
  });

  test('FAIL: VPC account whose OU is not in shareTargets emits "Missing accounts"', () => {
    const { errors } = validate({
      updateHelperProps: props => ({ ...props, accounts, ouIdNames }),
      updateNetworkConfig: buildFirewallConfig('WorkloadA', { organizationalUnits: ['Security'] }),
    });
    expect(
      errors.filter(
        e =>
          e.includes(
            'firewall policy "pol-a" is not shared with one or more target OU(s)/account(s) for VPC "vpc-a."',
          ) && e.includes('Missing accounts: WorkloadA'),
      ),
    ).toHaveLength(1);
  });

  test('STRICT-OU: policy shared to parent OU only is NOT consumable from child OU', () => {
    // Policy shared to Workload; firewall VPC owned by WorkloadB in child OU Workload/NestedW, so it fails.
    const { errors } = validate({
      updateHelperProps: props => ({ ...props, accounts, ouIdNames }),
      updateNetworkConfig: buildFirewallConfig('WorkloadB', { organizationalUnits: ['Workload'] }),
    });
    expect(
      errors.filter(
        e => e.includes('firewall policy "pol-a" is not shared') && e.includes('Missing accounts: WorkloadB'),
      ),
    ).toHaveLength(1);
  });
});

type HelperProps = {
  //values
  config: NetworkConfig;
  //ouIdNames
  ouIdNames: string[];
  // Accounts
  accounts: (AccountConfig | GovCloudAccountConfig)[];
  snsTopicNames: string[];
  enabledRegions: string[];
};

type ValidateProps = {
  updateNetworkConfig?: (props: Writable<INetworkConfig>) => INetworkConfig;
  updateHelperProps?: (props: HelperProps) => HelperProps;
};

function validate({ updateNetworkConfig = identity, updateHelperProps = identity }: ValidateProps = {}) {
  const config = new NetworkConfig(
    updateNetworkConfig({
      accountVpcEndpointIds: {},
      centralNetworkServices: undefined,
      accountVpcIds: {},
      certificates: [],
      customerGateways: [],
      defaultVpc: {
        delete: false,
        excludeAccounts: [],
        excludeRegions: [],
      },
      dhcpOptions: [],
      directConnectGateways: [],
      elbAccountIds: [],
      endpointPolicies: [],
      transitGateways: [],
      transitGatewayConnects: [],
      transitGatewayPeering: [],
      vpcs: [],
      vpcFlowLogs: undefined,
      vpcPeering: undefined,
      vpcTemplates: undefined,
      prefixLists: undefined,
      firewallManagerService: undefined,
    }),
  );
  const helperProps = updateHelperProps({
    config,
    ouIdNames: [],
    accounts: [],
    snsTopicNames: [],
    enabledRegions: [],
  });

  const helpers = new NetworkValidatorFunctions(
    helperProps.config,
    helperProps.ouIdNames,
    helperProps.accounts,
    helperProps.snsTopicNames,
    helperProps.enabledRegions,
  );

  const errors: string[] = [];
  const validator = new NetworkFirewallValidator(config, '', helpers, errors);
  return { errors, validator };
}

function identity<T>(v: T): T {
  return v;
}

type Writable<T> = {
  -readonly [P in keyof T]: T[P];
};
