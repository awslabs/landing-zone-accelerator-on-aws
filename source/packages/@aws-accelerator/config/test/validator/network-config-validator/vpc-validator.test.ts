import { describe, test, expect } from '@jest/globals';
import { NetworkConfig, VpcConfig } from '../../../lib/network-config';
import { VpcValidator } from '../../../validator/network-config-validator/vpc-validator';
import { NetworkValidatorFunctions } from '../../../validator/network-config-validator/network-validator-functions';

describe('VpcValidator', () => {
  const baseVpcConfig: VpcConfig = {
    name: 'test-vpc',
    account: 'Network',
    region: 'us-east-1',
    cidrs: ['10.0.0.0/16'],
    queryLogs: ['test-query-log'],
    defaultSecurityGroupRulesDeletion: false,
    dhcpOptions: undefined,
    dnsFirewallRuleGroups: undefined,
    egressOnlyIgw: undefined,
    internetGateway: undefined,
    enableDnsHostnames: true,
    enableDnsSupport: true,
    instanceTenancy: 'default',
    ipamAllocations: undefined,
    ipv6Cidrs: undefined,
    resolverRules: undefined,
    routeTables: undefined,
    subnets: undefined,
    natGateways: undefined,
    transitGatewayAttachments: undefined,
    outposts: undefined,
    gatewayEndpoints: undefined,
    interfaceEndpoints: undefined,
    useCentralEndpoints: false,
    securityGroups: undefined,
    networkAcls: undefined,
    tags: undefined,
    virtualPrivateGateway: undefined,
    vpcFlowLogs: undefined,
    loadBalancers: undefined,
    targetGroups: undefined,
    vpcRoute53Resolver: undefined,
  };

  const helpers = new NetworkValidatorFunctions(
    {
      centralNetworkServices: {
        delegatedAdminAccount: 'Network',
        gatewayLoadBalancers: undefined,
        ipams: undefined,
        networkFirewall: undefined,
        route53Resolver: undefined,
      },
    } as NetworkConfig,
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
    ['us-east-1'],
  );

  test('should fail validation when queryLogs specified but no Route53 resolver configured', () => {
    const errors: string[] = [];
    const networkConfig: Partial<NetworkConfig> = {
      vpcs: [baseVpcConfig],
      endpointPolicies: [],
      transitGateways: [],
      defaultVpc: { delete: false, excludeAccounts: [], excludeRegions: [] },
    };

    new VpcValidator(networkConfig as NetworkConfig, helpers, errors);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors).toContain(
      '[VPC test-vpc]: queryLogs specified but no Route53 resolver endpoints found in this VPC. Please configure either centralNetworkServices.route53Resolver endpoints in this VPC or vpcRoute53Resolver',
    );
  });

  test('should fail validation when queryLogs specified with central resolver but no endpoints for this VPC', () => {
    const errors: string[] = [];
    const networkConfig: Partial<NetworkConfig> = {
      vpcs: [baseVpcConfig],
      endpointPolicies: [],
      transitGateways: [],
      defaultVpc: { delete: false, excludeAccounts: [], excludeRegions: [] },
      centralNetworkServices: {
        delegatedAdminAccount: 'Network',
        gatewayLoadBalancers: undefined,
        ipams: undefined,
        networkFirewall: undefined,
        route53Resolver: {
          endpoints: [
            {
              name: 'other-endpoint',
              vpc: 'other-vpc',
              subnets: ['subnet-1'],
              type: 'INBOUND',
              protocols: undefined,
              allowedCidrs: undefined,
              rules: undefined,
              tags: undefined,
            },
          ],
          firewallRuleGroups: undefined,
          queryLogs: {
            name: 'test-query-log',
            destinations: ['s3'],
            shareTargets: undefined,
            excludedRegions: undefined,
          },
          rules: undefined,
        },
      },
    };

    new VpcValidator(networkConfig as NetworkConfig, helpers, errors);

    expect(errors).toContain(
      '[VPC test-vpc]: queryLogs specified but no Route53 resolver endpoints found in this VPC. Please configure either centralNetworkServices.route53Resolver endpoints in this VPC or vpcRoute53Resolver',
    );
  });

  test('should pass validation when queryLogs specified with central Route53 resolver endpoints for this VPC', () => {
    const errors: string[] = [];
    const networkConfig: Partial<NetworkConfig> = {
      vpcs: [baseVpcConfig],
      endpointPolicies: [],
      transitGateways: [],
      defaultVpc: { delete: false, excludeAccounts: [], excludeRegions: [] },
      centralNetworkServices: {
        delegatedAdminAccount: 'Network',
        gatewayLoadBalancers: undefined,
        ipams: undefined,
        networkFirewall: undefined,
        route53Resolver: {
          endpoints: [
            {
              name: 'test-endpoint',
              vpc: 'test-vpc',
              subnets: ['subnet-1'],
              type: 'INBOUND',
              protocols: undefined,
              allowedCidrs: undefined,
              rules: undefined,
              tags: undefined,
            },
          ],
          firewallRuleGroups: undefined,
          queryLogs: {
            name: 'test-query-log',
            destinations: ['s3'],
            shareTargets: {
              organizationalUnits: ['Root'],
              accounts: ['Network'],
            },
            excludedRegions: undefined,
          },
          rules: undefined,
        },
      },
    };

    new VpcValidator(networkConfig as NetworkConfig, helpers, errors);

    expect(errors).not.toContain(
      '[VPC test-vpc]: queryLogs specified but no Route53 resolver endpoints found in this VPC. Please configure either centralNetworkServices.route53Resolver endpoints in this VPC or vpcRoute53Resolver',
    );
  });

  test('should pass validation when queryLogs specified with VPC-level Route53 resolver', () => {
    const errors: string[] = [];
    const vpcWithResolver: VpcConfig = {
      ...baseVpcConfig,
      vpcRoute53Resolver: {
        endpoints: undefined,
        queryLogs: {
          name: 'test-query-log',
          destinations: ['s3'],
          shareTargets: undefined,
          excludedRegions: undefined,
        },
        firewallRuleGroups: undefined,
        rules: undefined,
      },
    };

    const networkConfig: Partial<NetworkConfig> = {
      vpcs: [vpcWithResolver],
      endpointPolicies: [],
      transitGateways: [],
      defaultVpc: { delete: false, excludeAccounts: [], excludeRegions: [] },
    };

    new VpcValidator(networkConfig as NetworkConfig, helpers, errors);

    expect(errors).not.toContain(
      '[VPC test-vpc]: queryLogs specified but no Route53 resolver endpoints found in this VPC. Please configure either centralNetworkServices.route53Resolver endpoints in this VPC or vpcRoute53Resolver',
    );
  });

  test('should pass validation when no queryLogs specified', () => {
    const errors: string[] = [];
    const vpcWithoutQueryLogs: VpcConfig = {
      ...baseVpcConfig,
      queryLogs: undefined,
    };

    const networkConfig: Partial<NetworkConfig> = {
      vpcs: [vpcWithoutQueryLogs],
      endpointPolicies: [],
      transitGateways: [],
      defaultVpc: { delete: false, excludeAccounts: [], excludeRegions: [] },
    };

    new VpcValidator(networkConfig as NetworkConfig, helpers, errors);

    expect(errors).not.toContain(
      '[VPC test-vpc]: queryLogs specified but no Route53 resolver endpoints found in this VPC. Please configure either centralNetworkServices.route53Resolver endpoints in this VPC or vpcRoute53Resolver',
    );
  });

  test('should pass validation when queryLogs specified with empty array', () => {
    const errors: string[] = [];
    const vpcWithEmptyQueryLogs: VpcConfig = {
      ...baseVpcConfig,
      queryLogs: [],
    };

    const networkConfig: Partial<NetworkConfig> = {
      vpcs: [vpcWithEmptyQueryLogs],
      endpointPolicies: [],
      transitGateways: [],
      defaultVpc: { delete: false, excludeAccounts: [], excludeRegions: [] },
    };

    new VpcValidator(networkConfig as NetworkConfig, helpers, errors);

    expect(errors).not.toContain(
      '[VPC test-vpc]: queryLogs specified but no Route53 resolver endpoints found in this VPC. Please configure either centralNetworkServices.route53Resolver endpoints in this VPC or vpcRoute53Resolver',
    );
  });

  test('should fail validation when queryLogs name does not match central resolver queryLogs name', () => {
    const errors: string[] = [];
    const vpcWithMismatchedQueryLog: VpcConfig = {
      ...baseVpcConfig,
      queryLogs: ['wrong-query-log-name'],
    };

    const networkConfig: Partial<NetworkConfig> = {
      vpcs: [vpcWithMismatchedQueryLog],
      endpointPolicies: [],
      transitGateways: [],
      defaultVpc: { delete: false, excludeAccounts: [], excludeRegions: [] },
      centralNetworkServices: {
        delegatedAdminAccount: 'Network',
        gatewayLoadBalancers: undefined,
        ipams: undefined,
        networkFirewall: undefined,
        route53Resolver: {
          endpoints: [
            {
              name: 'test-endpoint',
              vpc: 'test-vpc',
              subnets: ['subnet-1'],
              type: 'INBOUND',
              protocols: undefined,
              allowedCidrs: undefined,
              rules: undefined,
              tags: undefined,
            },
          ],
          firewallRuleGroups: undefined,
          queryLogs: {
            name: 'correct-query-log-name',
            destinations: ['s3'],
            shareTargets: undefined,
            excludedRegions: undefined,
          },
          rules: undefined,
        },
      },
    };

    new VpcValidator(networkConfig as NetworkConfig, helpers, errors);

    expect(errors).toContain('[VPC test-vpc]: DNS query logs "wrong-query-log-name" does not exist');
  });

  test('should pass validation when both central resolver endpoints and VPC resolver are configured', () => {
    const errors: string[] = [];
    const vpcWithBothResolvers: VpcConfig = {
      ...baseVpcConfig,
      vpcRoute53Resolver: {
        endpoints: undefined,
        queryLogs: {
          name: 'test-query-log',
          destinations: ['s3'],
          shareTargets: undefined,
          excludedRegions: undefined,
        },
        firewallRuleGroups: undefined,
        rules: undefined,
      },
    };

    const networkConfig: Partial<NetworkConfig> = {
      vpcs: [vpcWithBothResolvers],
      endpointPolicies: [],
      transitGateways: [],
      defaultVpc: { delete: false, excludeAccounts: [], excludeRegions: [] },
      centralNetworkServices: {
        delegatedAdminAccount: 'Network',
        gatewayLoadBalancers: undefined,
        ipams: undefined,
        networkFirewall: undefined,
        route53Resolver: {
          endpoints: [
            {
              name: 'test-endpoint',
              vpc: 'test-vpc',
              subnets: ['subnet-1'],
              type: 'INBOUND',
              protocols: undefined,
              allowedCidrs: undefined,
              rules: undefined,
              tags: undefined,
            },
          ],
          firewallRuleGroups: undefined,
          queryLogs: {
            name: 'test-query-log',
            destinations: ['s3'],
            shareTargets: {
              organizationalUnits: ['Root'],
              accounts: ['Network'],
            },
            excludedRegions: undefined,
          },
          rules: undefined,
        },
      },
    };

    new VpcValidator(networkConfig as NetworkConfig, helpers, errors);

    expect(errors).not.toContain(
      '[VPC test-vpc]: queryLogs specified but no Route53 resolver endpoints found in this VPC. Please configure either centralNetworkServices.route53Resolver endpoints in this VPC or vpcRoute53Resolver',
    );
  });
});
