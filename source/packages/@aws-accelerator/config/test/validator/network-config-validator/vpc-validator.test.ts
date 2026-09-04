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

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as fc from 'fast-check';

// Capture non-blocking findings logged by the network-config validator logger.
const { errorSpy } = vi.hoisted(() => ({ errorSpy: vi.fn() }));
vi.mock('@aws-accelerator/utils', async importOriginal => ({
  ...((await importOriginal()) as object),
  createLogger: () => ({
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: errorSpy,
  }),
}));

import {
  GatewayEndpointConfig,
  GatewayEndpointServiceConfig,
  InterfaceEndpointConfig,
  InterfaceEndpointServiceConfig,
  NetworkConfig,
  RouteTableConfig,
  RouteTableEntryConfig,
  VpcConfig,
  VpcTemplatesConfig,
} from '../../../lib/network-config';
import { GlobalConfig } from '../../../lib/global-config';
import { VpcValidator } from '../../../validator/network-config-validator/vpc-validator';
import { NetworkValidatorFunctions } from '../../../validator/network-config-validator/network-validator-functions';

/**
 * Build a minimal NetworkConfig fixture carrying a single VPC with one
 * interface endpoint whose `hostedZoneName` is set to the given string.
 *
 * The VPC has a static CIDR (so `validateVpcStructure` passes and the
 * downstream interface-endpoint validations — including the 1024-character
 * hostedZoneName length check — actually run). The `interfaceEndpoints`
 * `defaultPolicy` matches the single fixture policy name so we do not trip
 * the unrelated "defaultPolicy does not exist" error.
 */
function buildFixture(params: { vpcName: string; endpointService: string; hostedZoneName: string }): {
  networkConfig: NetworkConfig;
  helpers: NetworkValidatorFunctions;
} {
  const { vpcName, endpointService, hostedZoneName } = params;

  const endpoint: Partial<InterfaceEndpointServiceConfig> = {
    service: endpointService,
    hostedZoneName,
  };

  const interfaceEndpoints: Partial<InterfaceEndpointConfig> = {
    defaultPolicy: 'Default',
    endpoints: [endpoint as InterfaceEndpointServiceConfig],
    subnets: [],
  };

  const vpc: Partial<VpcConfig> = {
    name: vpcName,
    account: 'Network',
    region: 'us-east-1',
    cidrs: ['10.0.0.0/16'],
    interfaceEndpoints: interfaceEndpoints as InterfaceEndpointConfig,
  };

  const networkConfig: Partial<NetworkConfig> = {
    defaultVpc: { delete: false, excludeAccounts: [], excludeRegions: [] },
    transitGateways: [],
    endpointPolicies: [{ name: 'Default', document: 'path/to/policy.json' }],
    vpcs: [vpc as VpcConfig],
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
    ['us-east-1'],
  );

  return { networkConfig: networkConfig as NetworkConfig, helpers };
}

describe('VpcValidator - interface endpoint hostedZoneName length', () => {
  // Feature: route53-interface-endpoint-phz-override, Property 10: Schema rejects hostedZoneName longer than 1024 characters
  test('Property 10: validator rejects hostedZoneName longer than 1024 characters', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1025, maxLength: 2048 }),
        fc.constantFrom('route53', 'ec2', 's3', 'logs', 'kms'),
        fc.constantFrom('network-endpoints-vpc', 'endpoint-vpc', 'central-vpc'),
        (hostedZoneName: string, endpointService: string, vpcName: string) => {
          const errors: string[] = [];
          const { networkConfig, helpers } = buildFixture({
            vpcName,
            endpointService,
            hostedZoneName,
          });

          new VpcValidator(networkConfig, helpers, errors);

          // At least one accumulated error must cite the 1024-character limit
          // and identify the offending endpoint (VPC name or endpoint service).
          const lengthErrors = errors.filter(
            e => e.includes('1024') && (e.includes(vpcName) || e.includes(endpointService)),
          );

          if (lengthErrors.length === 0) {
            // Produce a diagnostic counterexample on failure.
            throw new Error(
              `Expected at least one error whose text contains '1024' and identifies ` +
                `the offending endpoint (VPC name '${vpcName}' or service '${endpointService}'). ` +
                `hostedZoneName.length=${hostedZoneName.length}, errors=${JSON.stringify(errors)}`,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // T16 boundary cases — Requirement 1.5. No PBT: two deterministic examples
  // pinned to the exact 1024 / 1025 transition defined by the Route 53
  // CreateHostedZone API Name limit.
  test('T16: validator accepts hostedZoneName of exactly 1024 characters (no length-related error)', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildFixture({
      vpcName: 'network-endpoints-vpc',
      endpointService: 'route53',
      hostedZoneName: 'a'.repeat(1024),
    });

    new VpcValidator(networkConfig, helpers, errors);

    // The 1024-character value sits on the accept side of the boundary — no
    // accumulated error should reference the 1024 token (other unrelated
    // errors are tolerated).
    const lengthErrors = errors.filter(e => e.includes('1024'));
    if (lengthErrors.length !== 0) {
      throw new Error(
        `Expected zero errors containing '1024' for a 1024-character hostedZoneName. ` +
          `errors=${JSON.stringify(lengthErrors)}`,
      );
    }
  });

  test('T16: validator rejects hostedZoneName of 1025 characters with an error citing the 1024 limit', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildFixture({
      vpcName: 'network-endpoints-vpc',
      endpointService: 'route53',
      hostedZoneName: 'a'.repeat(1025),
    });

    new VpcValidator(networkConfig, helpers, errors);

    // The 1025-character value sits one past the boundary — at least one
    // accumulated error must cite the 1024-character limit.
    const lengthErrors = errors.filter(e => e.includes('1024'));
    if (lengthErrors.length === 0) {
      throw new Error(
        `Expected at least one error containing '1024' for a 1025-character hostedZoneName. ` +
          `errors=${JSON.stringify(errors)}`,
      );
    }
  });
});

/**
 * Build a minimal NetworkConfig fixture with a single VPC containing one route
 * table whose only entry is a `gatewayEndpoint` route targeting `routeTarget`,
 * plus a `gatewayEndpoints` block defining `definedServices`. Static CIDR so
 * `validateVpcStructure` passes and route-table validation actually runs; the
 * `defaultPolicy` matches the fixture policy name to avoid an unrelated error.
 */
function buildGatewayEndpointRouteFixture(params: {
  vpcName: string;
  routeTarget: string;
  definedServices: GatewayEndpointServiceConfig['service'][];
}): { networkConfig: NetworkConfig; helpers: NetworkValidatorFunctions } {
  const { vpcName, routeTarget, definedServices } = params;

  const route: Partial<RouteTableEntryConfig> = {
    name: 'S3GatewayRoute',
    type: 'gatewayEndpoint',
    target: routeTarget,
  };

  const routeTable: Partial<RouteTableConfig> = {
    name: 'TestRouteTable',
    routes: [route as RouteTableEntryConfig],
  };

  const gatewayEndpoints: Partial<GatewayEndpointConfig> = {
    defaultPolicy: 'Default',
    endpoints: definedServices.map(service => ({ service }) as GatewayEndpointServiceConfig),
  };

  const vpc: Partial<VpcConfig> = {
    name: vpcName,
    account: 'Network',
    region: 'us-east-1',
    cidrs: ['10.0.0.0/16'],
    routeTables: [routeTable as RouteTableConfig],
    gatewayEndpoints: gatewayEndpoints as GatewayEndpointConfig,
  };

  const networkConfig: Partial<NetworkConfig> = {
    defaultVpc: { delete: false, excludeAccounts: [], excludeRegions: [] },
    transitGateways: [],
    endpointPolicies: [{ name: 'Default', document: 'path/to/policy.json' }],
    vpcs: [vpc as VpcConfig],
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
    ['us-east-1'],
  );

  return { networkConfig: networkConfig as NetworkConfig, helpers };
}

/**
 * Build a minimal NetworkConfig fixture carrying a single VPC with one ALB
 * whose listeners are provided by the caller. Static CIDR so validateVpcStructure
 * passes and the ALB listener validation runs.
 */
function buildAlbFixture(listeners: unknown[]): { networkConfig: NetworkConfig; helpers: NetworkValidatorFunctions } {
  const vpc: Partial<VpcConfig> = {
    name: 'alb-vpc',
    account: 'Network',
    region: 'us-east-1',
    cidrs: ['10.0.0.0/16'],
    loadBalancers: {
      applicationLoadBalancers: [{ name: 'test-alb', subnets: [], securityGroups: [], listeners }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };

  const networkConfig: Partial<NetworkConfig> = {
    defaultVpc: { delete: false, excludeAccounts: [], excludeRegions: [] },
    transitGateways: [],
    endpointPolicies: [],
    vpcs: [vpc as VpcConfig],
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
    ['us-east-1'],
  );

  return { networkConfig: networkConfig as NetworkConfig, helpers };
}

describe('VpcValidator - gateway endpoint route target existence (issue #1063)', () => {
  test('rejects a gatewayEndpoint route whose target service is not defined on the VPC', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildGatewayEndpointRouteFixture({
      vpcName: 'test-vpc',
      routeTarget: 's3',
      definedServices: [],
    });

    new VpcValidator(networkConfig, helpers, errors);

    const targetErrors = errors.filter(
      e => e.includes('S3GatewayRoute') && e.includes('s3') && e.includes('does not exist'),
    );
    if (targetErrors.length === 0) {
      throw new Error(
        `Expected an error that the gatewayEndpoint route target 's3' does not exist. errors=${JSON.stringify(errors)}`,
      );
    }
  });

  test('accepts a gatewayEndpoint route whose target service is defined on the VPC', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildGatewayEndpointRouteFixture({
      vpcName: 'test-vpc',
      routeTarget: 's3',
      definedServices: ['s3'],
    });

    new VpcValidator(networkConfig, helpers, errors);

    const targetErrors = errors.filter(e => e.includes('S3GatewayRoute') && e.includes('does not exist'));
    if (targetErrors.length !== 0) {
      throw new Error(
        `Expected no 'does not exist' error for a defined gatewayEndpoint service. errors=${JSON.stringify(targetErrors)}`,
      );
    }
  });
});

describe('VpcValidator - ALB listener targetGroup requirements', () => {
  test('forward listener without targetGroup produces an error', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildAlbFixture([{ name: 'fwd', port: 80, protocol: 'HTTP', type: 'forward' }]);

    new VpcValidator(networkConfig, helpers, errors);

    const albErrors = errors.filter(
      e => e.includes('test-alb') && e.includes("type 'forward'") && e.includes('targetGroup'),
    );
    if (albErrors.length === 0) {
      throw new Error(`Expected a forward-without-targetGroup error. errors=${JSON.stringify(errors)}`);
    }
  });

  test('redirect listener without targetGroup produces no targetGroup error', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildAlbFixture([
      {
        name: 'redir',
        port: 80,
        protocol: 'HTTP',
        type: 'redirect',
        redirectConfig: { statusCode: 'HTTP_301', protocol: 'HTTPS', port: 443 },
      },
    ]);

    new VpcValidator(networkConfig, helpers, errors);

    const albErrors = errors.filter(e => e.includes('test-alb') && e.includes('targetGroup'));
    if (albErrors.length !== 0) {
      throw new Error(`Expected no targetGroup error for a redirect listener. errors=${JSON.stringify(albErrors)}`);
    }
  });

  test('fixed-response listener without targetGroup produces no targetGroup error', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildAlbFixture([
      {
        name: 'fixed',
        port: 80,
        protocol: 'HTTP',
        type: 'fixed-response',
        fixedResponseConfig: { statusCode: '200', contentType: 'text/plain', messageBody: 'OK' },
      },
    ]);

    new VpcValidator(networkConfig, helpers, errors);

    const albErrors = errors.filter(e => e.includes('test-alb') && e.includes('targetGroup'));
    if (albErrors.length !== 0) {
      throw new Error(
        `Expected no targetGroup error for a fixed-response listener. errors=${JSON.stringify(albErrors)}`,
      );
    }
  });

  test('forward listener with targetGroup produces no targetGroup error', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildAlbFixture([
      { name: 'fwd', port: 80, protocol: 'HTTP', type: 'forward', targetGroup: 'tg-1' },
    ]);

    new VpcValidator(networkConfig, helpers, errors);

    const albErrors = errors.filter(e => e.includes('test-alb') && e.includes('targetGroup'));
    if (albErrors.length !== 0) {
      throw new Error(
        `Expected no targetGroup error for a forward listener with a tg. errors=${JSON.stringify(albErrors)}`,
      );
    }
  });

  test('redirect listener with targetGroup produces an error', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildAlbFixture([
      {
        name: 'redir',
        port: 80,
        protocol: 'HTTP',
        type: 'redirect',
        targetGroup: 'tg-1',
        redirectConfig: { statusCode: 'HTTP_301', protocol: 'HTTPS', port: 443 },
      },
    ]);

    new VpcValidator(networkConfig, helpers, errors);

    const albErrors = errors.filter(
      e => e.includes('test-alb') && e.includes("type 'redirect'") && e.includes('targetGroup'),
    );
    if (albErrors.length === 0) {
      throw new Error(`Expected a redirect-with-targetGroup error. errors=${JSON.stringify(errors)}`);
    }
  });

  test('fixed-response listener with targetGroup produces an error', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildAlbFixture([
      {
        name: 'fixed',
        port: 80,
        protocol: 'HTTP',
        type: 'fixed-response',
        targetGroup: 'tg-1',
        fixedResponseConfig: { statusCode: '200', contentType: 'text/plain', messageBody: 'OK' },
      },
    ]);

    new VpcValidator(networkConfig, helpers, errors);

    const albErrors = errors.filter(
      e => e.includes('test-alb') && e.includes("type 'fixed-response'") && e.includes('targetGroup'),
    );
    if (albErrors.length === 0) {
      throw new Error(`Expected a fixed-response-with-targetGroup error. errors=${JSON.stringify(errors)}`);
    }
  });
});

/**
 * Shared account/OU topology for the share-target tests below.
 *
 * Strict-OU: a resource shared to OU X is consumable only by accounts directly in X.
 * Network → Infrastructure (also delegated admin); LogArchive, Audit → Security;
 * WorkloadA → Workload; WorkloadB → Workload/NestedW (child OU); Management → Root.
 */
function buildAccounts(): AccountConfig[] {
  return [
    {
      name: 'Management',
      description: '',
      email: 'mgmt@example.com',
      organizationalUnit: 'Root',
      warm: true,
      accountAlias: undefined,
    },
    {
      name: 'Network',
      description: '',
      email: 'network@example.com',
      organizationalUnit: 'Infrastructure',
      warm: true,
      accountAlias: undefined,
    },
    {
      name: 'LogArchive',
      description: '',
      email: 'log@example.com',
      organizationalUnit: 'Security',
      warm: true,
      accountAlias: undefined,
    },
    {
      name: 'Audit',
      description: '',
      email: 'audit@example.com',
      organizationalUnit: 'Security',
      warm: true,
      accountAlias: undefined,
    },
    {
      name: 'WorkloadA',
      description: '',
      email: 'wkA@example.com',
      organizationalUnit: 'Workload',
      warm: true,
      accountAlias: undefined,
    },
    {
      name: 'WorkloadB',
      description: '',
      email: 'wkB@example.com',
      organizationalUnit: 'Workload/NestedW',
      warm: true,
      accountAlias: undefined,
    },
  ];
}

const OU_NAMES = ['Root', 'Security', 'Infrastructure', 'Workload', 'Workload/NestedW'];

/**
 * Build a NetworkConfig + helpers pair for share-target tests.
 * The caller selects a direct VPC or VPC template and seeds its consumer references.
 */
function buildShareFixture(params: {
  vpcAccount: string;
  consumerType?: 'vpc' | 'vpcTemplate';
  delegatedAdminAccount?: string;
  transitGateways?: TransitGatewayConfig[];
  ipams?: IpamConfig[];
  resolver?: ResolverConfig;
  vpcConsumers?: {
    transitGatewayAttachments?: TransitGatewayAttachmentConfig[];
    ipamAllocations?: IpamAllocationConfig[];
    dnsFirewallRuleGroups?: { name: string; priority: number }[];
    queryLogs?: string[];
    resolverRules?: string[];
  };
  subnets?: VpcConfig['subnets'];
  loadBalancers?: VpcConfig['loadBalancers'];
  vpcTags?: VpcConfig['tags'];
}): { networkConfig: NetworkConfig; helpers: NetworkValidatorFunctions } {
  const {
    vpcAccount,
    consumerType = 'vpc',
    delegatedAdminAccount = 'Network',
    transitGateways = [],
    ipams,
    resolver,
    vpcConsumers = {},
    subnets,
    loadBalancers,
    vpcTags,
  } = params;

  // validateVpcStructure rejects (and short-circuits all per-VPC checks) when both `cidrs` and
  // `ipamAllocations` are set — pick exactly one for the fixture so the share-target validators
  // we are exercising actually run.
  const useIpam = (vpcConsumers.ipamAllocations?.length ?? 0) > 0;

  const vpc: Partial<VpcConfig & VpcTemplatesConfig> = {
    name: 'TestVpc',
    region: 'us-east-1',
    cidrs: useIpam ? undefined : ['10.0.0.0/16'],
    transitGatewayAttachments: vpcConsumers.transitGatewayAttachments,
    ipamAllocations: vpcConsumers.ipamAllocations,
    dnsFirewallRuleGroups: vpcConsumers.dnsFirewallRuleGroups as VpcConfig['dnsFirewallRuleGroups'],
    queryLogs: vpcConsumers.queryLogs,
    resolverRules: vpcConsumers.resolverRules,
    subnets,
    loadBalancers,
    tags: vpcTags,
    deploymentTargets: {
      accounts: consumerType === 'vpcTemplate' ? [vpcAccount] : [],
      organizationalUnits: [],
      excludedAccounts: [],
      excludedRegions: [],
    },
    ...(consumerType === 'vpc' ? { account: vpcAccount } : {}),
  };

  const centralNetworkServices: Partial<CentralNetworkServicesConfig> = {
    delegatedAdminAccount,
    ipams,
    route53Resolver: resolver,
  };

  const networkConfig: Partial<NetworkConfig> = {
    defaultVpc: { delete: false, excludeAccounts: [], excludeRegions: [] },
    transitGateways,
    endpointPolicies: [{ name: 'Default', document: 'path/to/policy.json' }],
    centralNetworkServices: centralNetworkServices as CentralNetworkServicesConfig,
    vpcs: consumerType === 'vpc' ? [vpc as VpcConfig] : [],
    vpcTemplates: consumerType === 'vpcTemplate' ? [vpc as VpcTemplatesConfig] : undefined,
  };

  const helpers = new NetworkValidatorFunctions(
    networkConfig as NetworkConfig,
    OU_NAMES,
    buildAccounts(),
    [],
    ['us-east-1'],
  );

  return { networkConfig: networkConfig as NetworkConfig, helpers };
}

/**
 * Build a TGW with the given share targets.
 */
function buildTgw(params: {
  name?: string;
  account: string;
  shareOus?: string[];
  shareAccounts?: string[];
}): TransitGatewayConfig {
  const tgw: Partial<TransitGatewayConfig> = {
    name: params.name ?? 'TestTgw',
    account: params.account,
    region: 'us-east-1',
    asn: 65521,
    dnsSupport: 'enable',
    vpnEcmpSupport: 'enable',
    defaultRouteTableAssociation: 'enable',
    defaultRouteTablePropagation: 'enable',
    autoAcceptSharingAttachments: 'disable',
    routeTables: [],
    shareTargets:
      params.shareOus || params.shareAccounts
        ? ({
            organizationalUnits: params.shareOus ?? [],
            accounts: params.shareAccounts ?? [],
          } as ShareTargets)
        : undefined,
  };
  return tgw as TransitGatewayConfig;
}

/**
 * Build a TGW attachment referencing a TGW by name and owner account.
 */
function buildTgwAttachment(name: string, tgwName: string, tgwAccount: string): TransitGatewayAttachmentConfig {
  const attach: Partial<TransitGatewayAttachmentConfig> = {
    name,
    transitGateway: { name: tgwName, account: tgwAccount },
    subnets: ['SubnetA'],
    routeTableAssociations: [],
    routeTablePropagations: [],
  };
  return attach as TransitGatewayAttachmentConfig;
}

/**
 * Build an IPAM with one pool with the given share targets.
 */
function buildIpam(params: {
  poolName?: string;
  shareOus?: string[];
  shareAccounts?: string[];
  allocationResourceTags?: { key: string; value: string }[];
}): IpamConfig {
  const pool: Partial<IpamPoolConfig> = {
    name: params.poolName ?? 'TestPool',
    provisionedCidrs: ['10.20.0.0/16'],
    allocationResourceTags: params.allocationResourceTags,
    shareTargets: {
      organizationalUnits: params.shareOus ?? [],
      accounts: params.shareAccounts ?? [],
    } as ShareTargets,
  };
  const ipam: Partial<IpamConfig> = {
    name: 'TestIpam',
    region: 'us-east-1',
    operatingRegions: ['us-east-1'],
    pools: [pool as IpamPoolConfig],
  };
  return ipam as IpamConfig;
}

// TGW share-target consumer check — validateTgwShareTargets

describe('VpcValidator - TGW share targets', () => {
  test('FAIL: VPC account not in tgw.shareTargets emits "Missing accounts" error', () => {
    // TGW shared only to Security; consumer VPC in WorkloadA is not covered.
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'WorkloadA',
      transitGateways: [buildTgw({ account: 'Network', shareOus: ['Security'] })],
      vpcConsumers: {
        transitGatewayAttachments: [buildTgwAttachment('Attach1', 'TestTgw', 'Network')],
      },
    });

    new VpcValidator(networkConfig, helpers, errors);

    expect(
      errors.filter(
        e =>
          e.includes('TGW "TestTgw" is not shared to one or more VPC deployment target accounts') &&
          e.includes('Missing accounts: WorkloadA'),
      ),
    ).toHaveLength(1);
  });

  test('PASS: same-account attachment is exempt (TGW owner == VPC account)', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'Network',
      transitGateways: [buildTgw({ account: 'Network' })], // no shareTargets at all
      vpcConsumers: {
        transitGatewayAttachments: [buildTgwAttachment('Attach1', 'TestTgw', 'Network')],
      },
    });

    new VpcValidator(networkConfig, helpers, errors);

    expect(errors.filter(e => e.includes('TGW "TestTgw" is not shared'))).toHaveLength(0);
  });

  test('PASS: VPC account explicitly listed in tgw.shareTargets.accounts', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'WorkloadA',
      transitGateways: [buildTgw({ account: 'Network', shareAccounts: ['WorkloadA'] })],
      vpcConsumers: {
        transitGatewayAttachments: [buildTgwAttachment('Attach1', 'TestTgw', 'Network')],
      },
    });

    new VpcValidator(networkConfig, helpers, errors);

    expect(errors.filter(e => e.includes('TGW "TestTgw" is not shared'))).toHaveLength(0);
  });

  test('PASS: VPC account in OU listed in tgw.shareTargets.organizationalUnits', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'WorkloadA',
      transitGateways: [buildTgw({ account: 'Network', shareOus: ['Workload'] })],
      vpcConsumers: {
        transitGatewayAttachments: [buildTgwAttachment('Attach1', 'TestTgw', 'Network')],
      },
    });

    new VpcValidator(networkConfig, helpers, errors);

    expect(errors.filter(e => e.includes('TGW "TestTgw" is not shared'))).toHaveLength(0);
  });

  test('SHORT-CIRCUIT: missing TGW does not emit a duplicate share-check error', () => {
    // Referenced TGW is not declared; the share check skips so only the existence error fires.
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'WorkloadA',
      transitGateways: [], // no TGWs declared
      vpcConsumers: {
        transitGatewayAttachments: [buildTgwAttachment('Attach1', 'GhostTgw', 'Network')],
      },
    });

    new VpcValidator(networkConfig, helpers, errors);

    expect(errors.filter(e => e.includes('TGW "GhostTgw" is not shared'))).toHaveLength(0);
  });

  test('STRICT-OU: TGW shared to parent OU only is NOT consumable from child OU', () => {
    // TGW shared to Workload; consumer WorkloadB is in the child OU Workload/NestedW, so it fails.
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'WorkloadB',
      transitGateways: [buildTgw({ account: 'Network', shareOus: ['Workload'] })],
      vpcConsumers: {
        transitGatewayAttachments: [buildTgwAttachment('Attach1', 'TestTgw', 'Network')],
      },
    });

    new VpcValidator(networkConfig, helpers, errors);

    expect(
      errors.filter(
        e =>
          e.includes('TGW "TestTgw" is not shared to one or more VPC deployment target accounts') &&
          e.includes('Missing accounts: WorkloadB'),
      ),
    ).toHaveLength(1);
  });
});

// IPAM pool share-target consumer check — validateIpamPoolShareTargets

describe('VpcValidator - IPAM pool share targets', () => {
  test('FAIL: VPC account not in pool.shareTargets and not delegatedAdmin emits error', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'WorkloadA',
      delegatedAdminAccount: 'Network',
      ipams: [buildIpam({ shareOus: ['Security'] })],
      vpcConsumers: {
        ipamAllocations: [{ ipamPoolName: 'TestPool', netmaskLength: 24 } as IpamAllocationConfig],
      },
    });

    new VpcValidator(networkConfig, helpers, errors);

    expect(
      errors.filter(
        e =>
          e.includes('IPAM pool "TestPool" is not shared to one or more VPC deployment target accounts') &&
          e.includes('Missing accounts: WorkloadA'),
      ),
    ).toHaveLength(1);
  });

  test('PASS: VPC in delegatedAdminAccount is implicitly allowed', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'Network',
      delegatedAdminAccount: 'Network',
      ipams: [buildIpam({})], // no shareTargets at all
      vpcConsumers: {
        ipamAllocations: [{ ipamPoolName: 'TestPool', netmaskLength: 24 } as IpamAllocationConfig],
      },
    });

    new VpcValidator(networkConfig, helpers, errors);

    expect(errors.filter(e => e.includes('IPAM pool "TestPool" is not shared'))).toHaveLength(0);
  });

  test('PASS: VPC account explicitly listed in pool.shareTargets.accounts', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'WorkloadA',
      ipams: [buildIpam({ shareAccounts: ['WorkloadA'] })],
      vpcConsumers: {
        ipamAllocations: [{ ipamPoolName: 'TestPool', netmaskLength: 24 } as IpamAllocationConfig],
      },
    });

    new VpcValidator(networkConfig, helpers, errors);

    expect(errors.filter(e => e.includes('IPAM pool "TestPool" is not shared'))).toHaveLength(0);
  });

  test('PASS: VPC account in OU listed in pool.shareTargets.organizationalUnits', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'WorkloadA',
      ipams: [buildIpam({ shareOus: ['Workload'] })],
      vpcConsumers: {
        ipamAllocations: [{ ipamPoolName: 'TestPool', netmaskLength: 24 } as IpamAllocationConfig],
      },
    });

    new VpcValidator(networkConfig, helpers, errors);

    expect(errors.filter(e => e.includes('IPAM pool "TestPool" is not shared'))).toHaveLength(0);
  });

  test('SHORT-CIRCUIT: missing pool does not emit a duplicate share-check error', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'WorkloadA',
      ipams: [], // no IPAMs declared
      vpcConsumers: {
        ipamAllocations: [{ ipamPoolName: 'GhostPool', netmaskLength: 24 } as IpamAllocationConfig],
      },
    });

    new VpcValidator(networkConfig, helpers, errors);

    expect(errors.filter(e => e.includes('IPAM pool "GhostPool" is not shared'))).toHaveLength(0);
  });

  test('STRICT-OU: pool shared to parent OU only is NOT consumable from child OU', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'WorkloadB',
      ipams: [buildIpam({ shareOus: ['Workload'] })],
      vpcConsumers: {
        ipamAllocations: [{ ipamPoolName: 'TestPool', netmaskLength: 24 } as IpamAllocationConfig],
      },
    });

    new VpcValidator(networkConfig, helpers, errors);

    expect(
      errors.filter(
        e =>
          e.includes('IPAM pool "TestPool" is not shared to one or more VPC deployment target accounts') &&
          e.includes('Missing accounts: WorkloadB'),
      ),
    ).toHaveLength(1);
  });
});

// IPAM pool allocationResourceTags requirement check — validateIpamAllocationResourceTags (issue #955)

describe('VpcValidator - IPAM pool allocationResourceTags requirement', () => {
  const REQUIRED_TAGS_MESSAGE = 'allocationResourceTags not satisfied';

  beforeEach(() => {
    errorSpy.mockClear();
    vi.stubEnv('PARTITION', 'aws');
    vi.stubEnv('ACCELERATOR_ENABLE_TAG', 'false');
    vi.stubEnv('ACCELERATOR_PREFIX', 'AWSAccelerator');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function buildGlobalConfig(tags: { key: string; value: string }[] = [], useV2Stacks = false): GlobalConfig {
    return { tags, useV2Stacks } as unknown as GlobalConfig;
  }

  /**
   * Collect the allocationResourceTags findings logged through the validator logger.
   */
  function loggedFindings(): string[] {
    return errorSpy.mock.calls.map(call => String(call[0])).filter(message => message.includes(REQUIRED_TAGS_MESSAGE));
  }

  test('REPORT: VPC allocating from a pool with allocationResourceTags but carrying no tags is logged', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'Network',
      ipams: [buildIpam({ allocationResourceTags: [{ key: 'env', value: 'prod' }] })],
      vpcConsumers: {
        ipamAllocations: [{ ipamPoolName: 'TestPool', netmaskLength: 24 } as IpamAllocationConfig],
      },
      // No vpcTags supplied — the required env=prod tag is missing.
    });

    new VpcValidator(networkConfig, helpers, errors);

    const findings = loggedFindings().filter(message => message.includes('IPAM pool "TestPool"'));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('Missing: env=prod.');
    // The finding must not block network validation.
    expect(errors.filter(e => e.includes(REQUIRED_TAGS_MESSAGE))).toHaveLength(0);
  });

  test('REPORT: VPC missing one of several required allocationResourceTags is flagged with only the missing tag', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'Network',
      ipams: [
        buildIpam({
          allocationResourceTags: [
            { key: 'env', value: 'prod' },
            { key: 'team', value: 'network' },
          ],
        }),
      ],
      vpcConsumers: {
        ipamAllocations: [{ ipamPoolName: 'TestPool', netmaskLength: 24 } as IpamAllocationConfig],
      },
      vpcTags: [{ key: 'env', value: 'prod' }],
    });

    new VpcValidator(networkConfig, helpers, errors);

    const findings = loggedFindings().filter(message => message.includes('IPAM pool "TestPool"'));
    expect(findings).toHaveLength(1);
    // Only the missing tag is reported; the satisfied env=prod tag is not.
    expect(findings[0]).toContain('Missing: team=network.');
    expect(findings[0]).not.toContain('env=prod');
  });

  test('REPORT: value mismatch reports the required and actual values', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'Network',
      ipams: [buildIpam({ allocationResourceTags: [{ key: 'env', value: 'prod' }] })],
      vpcConsumers: {
        ipamAllocations: [{ ipamPoolName: 'TestPool', netmaskLength: 24 } as IpamAllocationConfig],
      },
      vpcTags: [{ key: 'env', value: 'dev' }],
    });

    new VpcValidator(networkConfig, helpers, errors);

    const findings = loggedFindings().filter(message => message.includes('IPAM pool "TestPool"'));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('Mismatched: env (required prod, actual dev).');
    expect(findings[0]).not.toContain('Missing:');
  });

  test('PASS: VPC carrying all required allocationResourceTags logs no finding', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'Network',
      ipams: [buildIpam({ allocationResourceTags: [{ key: 'env', value: 'prod' }] })],
      vpcConsumers: {
        ipamAllocations: [{ ipamPoolName: 'TestPool', netmaskLength: 24 } as IpamAllocationConfig],
      },
      vpcTags: [{ key: 'env', value: 'prod' }],
    });

    new VpcValidator(networkConfig, helpers, errors);

    expect(loggedFindings()).toHaveLength(0);
  });

  test.each([undefined, []])(
    'PASS: undefined or empty pool allocationResourceTags do not require VPC tags',
    allocationResourceTags => {
      const errors: string[] = [];
      const { networkConfig, helpers } = buildShareFixture({
        vpcAccount: 'Network',
        ipams: [buildIpam({ allocationResourceTags })],
        vpcConsumers: {
          ipamAllocations: [{ ipamPoolName: 'TestPool', netmaskLength: 24 } as IpamAllocationConfig],
        },
      });

      new VpcValidator(networkConfig, helpers, errors);

      expect(loggedFindings()).toHaveLength(0);
    },
  );

  test('PASS: required tag supplied only by global config tags satisfies the pool requirement', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'Network',
      ipams: [buildIpam({ allocationResourceTags: [{ key: 'env', value: 'prod' }] })],
      vpcConsumers: {
        ipamAllocations: [{ ipamPoolName: 'TestPool', netmaskLength: 24 } as IpamAllocationConfig],
      },
    });

    new VpcValidator(networkConfig, helpers, errors, undefined, buildGlobalConfig([{ key: 'env', value: 'prod' }]));

    expect(loggedFindings()).toHaveLength(0);
  });

  test('PASS: a satisfying VPC-local tag is not overridden by a same-key global config tag', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'Network',
      ipams: [buildIpam({ allocationResourceTags: [{ key: 'env', value: 'prod' }] })],
      vpcConsumers: {
        ipamAllocations: [{ ipamPoolName: 'TestPool', netmaskLength: 24 } as IpamAllocationConfig],
      },
      vpcTags: [{ key: 'env', value: 'prod' }],
    });

    new VpcValidator(networkConfig, helpers, errors, undefined, buildGlobalConfig([{ key: 'env', value: 'dev' }]));

    // Global config tags are overridable defaults, so the VPC deploys with its own env=prod and
    // satisfies the pool requirement. This assertion previously expected the opposite (a finding
    // for "env (required prod, actual dev)"), which encoded the precedence defect this change fixes.
    expect(loggedFindings()).toHaveLength(0);
  });

  test('REPORT: a global config tag no longer satisfies a requirement the VPC overrides with its own value', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'Network',
      ipams: [buildIpam({ allocationResourceTags: [{ key: 'env', value: 'dev' }] })],
      vpcConsumers: {
        ipamAllocations: [{ ipamPoolName: 'TestPool', netmaskLength: 24 } as IpamAllocationConfig],
      },
      vpcTags: [{ key: 'env', value: 'prod' }],
    });

    new VpcValidator(networkConfig, helpers, errors, undefined, buildGlobalConfig([{ key: 'env', value: 'dev' }]));

    // Mirror of the case above: the pool requires the global value, but the resource-level tag now
    // wins, so the allocation requirement is reported as unsatisfied.
    const findings = loggedFindings().filter(message => message.includes('IPAM pool "TestPool"'));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('Mismatched: env (required dev, actual prod).');
  });

  test('PASS: duplicate VPC tag keys use the last configured value', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'Network',
      ipams: [buildIpam({ allocationResourceTags: [{ key: 'env', value: 'prod' }] })],
      vpcConsumers: {
        ipamAllocations: [{ ipamPoolName: 'TestPool', netmaskLength: 24 } as IpamAllocationConfig],
      },
      vpcTags: [
        { key: 'env', value: 'dev' },
        { key: 'env', value: 'prod' },
      ],
    });

    new VpcValidator(networkConfig, helpers, errors);

    expect(loggedFindings()).toHaveLength(0);
  });

  test('PASS: duplicate pool requirement keys use the last configured value', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'Network',
      ipams: [
        buildIpam({
          allocationResourceTags: [
            { key: 'env', value: 'dev' },
            { key: 'env', value: 'prod' },
          ],
        }),
      ],
      vpcConsumers: {
        ipamAllocations: [{ ipamPoolName: 'TestPool', netmaskLength: 24 } as IpamAllocationConfig],
      },
      vpcTags: [{ key: 'env', value: 'prod' }],
    });

    new VpcValidator(networkConfig, helpers, errors);

    expect(loggedFindings()).toHaveLength(0);
  });

  test('PASS: V1 generated Name overrides VPC-local and global Name tags', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'Network',
      ipams: [buildIpam({ allocationResourceTags: [{ key: 'Name', value: 'TestVpc' }] })],
      vpcConsumers: {
        ipamAllocations: [{ ipamPoolName: 'TestPool', netmaskLength: 24 } as IpamAllocationConfig],
      },
      vpcTags: [{ key: 'Name', value: 'local-name' }],
    });

    new VpcValidator(
      networkConfig,
      helpers,
      errors,
      undefined,
      buildGlobalConfig([{ key: 'Name', value: 'global-name' }]),
    );

    expect(loggedFindings()).toHaveLength(0);
  });

  test('REPORT: generated VPC Name takes precedence for validation when V2 stacks are enabled', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'Network',
      ipams: [buildIpam({ allocationResourceTags: [{ key: 'Name', value: 'global-name' }] })],
      vpcConsumers: {
        ipamAllocations: [{ ipamPoolName: 'TestPool', netmaskLength: 24 } as IpamAllocationConfig],
      },
      vpcTags: [{ key: 'Name', value: 'local-name' }],
    });

    new VpcValidator(
      networkConfig,
      helpers,
      errors,
      undefined,
      buildGlobalConfig([{ key: 'Name', value: 'global-name' }], true),
    );

    const findings = loggedFindings();
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('Name (required global-name, actual TestVpc)');
  });

  test('PASS: enabling V2 stacks accepts a Name tag when V1 and V2 values agree', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'Network',
      ipams: [buildIpam({ allocationResourceTags: [{ key: 'Name', value: 'TestVpc' }] })],
      vpcConsumers: {
        ipamAllocations: [{ ipamPoolName: 'TestPool', netmaskLength: 24 } as IpamAllocationConfig],
      },
      vpcTags: [{ key: 'Name', value: 'local-name' }],
    });

    new VpcValidator(
      networkConfig,
      helpers,
      errors,
      undefined,
      buildGlobalConfig([{ key: 'Name', value: 'TestVpc' }], true),
    );

    expect(loggedFindings()).toHaveLength(0);
  });

  test('PASS: generated Accelerator tag uses the configured accelerator prefix', () => {
    vi.stubEnv('ACCELERATOR_PREFIX', 'CustomAccelerator');
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'Network',
      ipams: [buildIpam({ allocationResourceTags: [{ key: 'Accelerator', value: 'CustomAccelerator' }] })],
      vpcConsumers: {
        ipamAllocations: [{ ipamPoolName: 'TestPool', netmaskLength: 24 } as IpamAllocationConfig],
      },
    });

    new VpcValidator(networkConfig, helpers, errors);

    expect(loggedFindings()).toHaveLength(0);
  });

  test('REPORT: ISO partitions do not inherit generated or global tags when accelerator tagging is disabled', () => {
    vi.stubEnv('PARTITION', 'aws-iso');
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'Network',
      ipams: [buildIpam({ allocationResourceTags: [{ key: 'env', value: 'prod' }] })],
      vpcConsumers: {
        ipamAllocations: [{ ipamPoolName: 'TestPool', netmaskLength: 24 } as IpamAllocationConfig],
      },
    });

    new VpcValidator(networkConfig, helpers, errors, undefined, buildGlobalConfig([{ key: 'env', value: 'prod' }]));

    const findings = loggedFindings();
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('Missing: env=prod.');
  });

  test('PASS: ISO partitions inherit global tags when ACCELERATOR_ENABLE_TAG overrides the partition gate', () => {
    vi.stubEnv('PARTITION', 'aws-iso');
    vi.stubEnv('ACCELERATOR_ENABLE_TAG', 'true');
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'Network',
      ipams: [buildIpam({ allocationResourceTags: [{ key: 'env', value: 'prod' }] })],
      vpcConsumers: {
        ipamAllocations: [{ ipamPoolName: 'TestPool', netmaskLength: 24 } as IpamAllocationConfig],
      },
      // The required tag is supplied only through global config, so it is applied
      // solely because the flag force-enables tagging on this restricted partition.
    });

    new VpcValidator(networkConfig, helpers, errors, undefined, buildGlobalConfig([{ key: 'env', value: 'prod' }]));

    expect(loggedFindings()).toHaveLength(0);
  });

  test('REPORT: VPC template consuming a restricted pool is validated', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'Network',
      consumerType: 'vpcTemplate',
      ipams: [buildIpam({ allocationResourceTags: [{ key: 'env', value: 'prod' }] })],
      vpcConsumers: {
        ipamAllocations: [{ ipamPoolName: 'TestPool', netmaskLength: 24 } as IpamAllocationConfig],
      },
    });

    new VpcValidator(networkConfig, helpers, errors);

    expect(loggedFindings()).toHaveLength(1);
  });

  test('REPORT: repeated allocations from one pool log one required-tags finding', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'Network',
      ipams: [buildIpam({ allocationResourceTags: [{ key: 'env', value: 'prod' }] })],
      vpcConsumers: {
        ipamAllocations: [
          { ipamPoolName: 'TestPool', netmaskLength: 24 } as IpamAllocationConfig,
          { ipamPoolName: 'TestPool', netmaskLength: 25 } as IpamAllocationConfig,
        ],
      },
    });

    new VpcValidator(networkConfig, helpers, errors);

    expect(loggedFindings()).toHaveLength(1);
  });

  test('SHORT-CIRCUIT: missing pool logs no required-tags finding', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'Network',
      ipams: [], // no IPAMs declared
      vpcConsumers: {
        ipamAllocations: [{ ipamPoolName: 'GhostPool', netmaskLength: 24 } as IpamAllocationConfig],
      },
    });

    new VpcValidator(networkConfig, helpers, errors);

    expect(loggedFindings()).toHaveLength(0);
  });
});

// The checks below confirm each shared resource rejects a consuming VPC account
// that falls outside its shareTargets (strict-OU: no child-OU cascade).

describe('VpcValidator - DNS firewall rule group share targets', () => {
  /**
   * Build a DNS firewall rule group with the given share targets.
   */
  function buildRuleGroup(shareOus?: string[]): DnsFirewallRuleGroupConfig {
    return {
      name: 'TestRuleGroup',
      regions: ['us-east-1'],
      rules: [],
      shareTargets: shareOus ? ({ organizationalUnits: shareOus, accounts: [] } as ShareTargets) : undefined,
      tags: undefined,
    } as DnsFirewallRuleGroupConfig;
  }

  test('PASS: VPC in delegatedAdminAccount allowed regardless of shareTargets', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'Network',
      delegatedAdminAccount: 'Network',
      resolver: { firewallRuleGroups: [buildRuleGroup()] } as ResolverConfig,
      vpcConsumers: { dnsFirewallRuleGroups: [{ name: 'TestRuleGroup', priority: 100 }] },
    });

    new VpcValidator(networkConfig, helpers, errors);

    expect(errors.filter(e => e.includes('DNS firewall rule group "TestRuleGroup" is not shared'))).toHaveLength(0);
  });

  test('FAIL: VPC in OU not in shareTargets emits "Missing accounts"', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'WorkloadA',
      resolver: { firewallRuleGroups: [buildRuleGroup(['Security'])] } as ResolverConfig,
      vpcConsumers: { dnsFirewallRuleGroups: [{ name: 'TestRuleGroup', priority: 100 }] },
    });

    new VpcValidator(networkConfig, helpers, errors);

    expect(
      errors.filter(
        e =>
          e.includes('DNS firewall rule group "TestRuleGroup" is not shared') &&
          e.includes('Missing accounts: WorkloadA'),
      ),
    ).toHaveLength(1);
  });

  test('STRICT-OU: parent-OU share is not consumable from child OU', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'WorkloadB',
      resolver: { firewallRuleGroups: [buildRuleGroup(['Workload'])] } as ResolverConfig,
      vpcConsumers: { dnsFirewallRuleGroups: [{ name: 'TestRuleGroup', priority: 100 }] },
    });

    new VpcValidator(networkConfig, helpers, errors);

    expect(
      errors.filter(
        e =>
          e.includes('DNS firewall rule group "TestRuleGroup" is not shared') &&
          e.includes('Missing accounts: WorkloadB'),
      ),
    ).toHaveLength(1);
  });
});

describe('VpcValidator - DNS query log share targets', () => {
  /**
   * Build a DNS query logging config with the given share targets.
   */
  function buildQueryLogs(shareOus?: string[]): DnsQueryLogsConfig {
    return {
      name: 'TestQueryLog',
      destinations: ['s3'],
      shareTargets: shareOus ? ({ organizationalUnits: shareOus, accounts: [] } as ShareTargets) : undefined,
      excludedRegions: undefined,
    } as DnsQueryLogsConfig;
  }

  test('PASS: VPC in delegatedAdminAccount allowed', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'Network',
      delegatedAdminAccount: 'Network',
      resolver: { queryLogs: buildQueryLogs() } as ResolverConfig,
      vpcConsumers: { queryLogs: ['TestQueryLog'] },
    });

    new VpcValidator(networkConfig, helpers, errors);

    expect(errors.filter(e => e.includes('DNS query logging configuration "TestQueryLog" is not shared'))).toHaveLength(
      0,
    );
  });

  test('FAIL: VPC in OU not in shareTargets emits "Missing accounts"', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'WorkloadA',
      resolver: { queryLogs: buildQueryLogs(['Security']) } as ResolverConfig,
      vpcConsumers: { queryLogs: ['TestQueryLog'] },
    });

    new VpcValidator(networkConfig, helpers, errors);

    expect(
      errors.filter(
        e =>
          e.includes('DNS query logging configuration "TestQueryLog" is not shared') &&
          e.includes('Missing accounts: WorkloadA'),
      ),
    ).toHaveLength(1);
  });

  test('STRICT-OU: parent-OU share is not consumable from child OU', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'WorkloadB',
      resolver: { queryLogs: buildQueryLogs(['Workload']) } as ResolverConfig,
      vpcConsumers: { queryLogs: ['TestQueryLog'] },
    });

    new VpcValidator(networkConfig, helpers, errors);

    expect(
      errors.filter(
        e =>
          e.includes('DNS query logging configuration "TestQueryLog" is not shared') &&
          e.includes('Missing accounts: WorkloadB'),
      ),
    ).toHaveLength(1);
  });
});

describe('VpcValidator - resolver rule share targets', () => {
  /**
   * Build a resolver rule with the given share targets.
   */
  function buildResolverRule(shareOus?: string[]): ResolverRuleConfig {
    return {
      name: 'TestResolverRule',
      domainName: 'example.com',
      excludedRegions: undefined,
      ruleType: 'SYSTEM',
      shareTargets: shareOus ? ({ organizationalUnits: shareOus, accounts: [] } as ShareTargets) : undefined,
      tags: undefined,
      targetIps: undefined,
      inboundEndpointTarget: undefined,
    } as ResolverRuleConfig;
  }

  test('PASS: VPC in delegatedAdminAccount allowed', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'Network',
      delegatedAdminAccount: 'Network',
      resolver: { rules: [buildResolverRule()] } as ResolverConfig,
      vpcConsumers: { resolverRules: ['TestResolverRule'] },
    });

    new VpcValidator(networkConfig, helpers, errors);

    expect(errors.filter(e => e.includes('Resolver rule "TestResolverRule" is not shared'))).toHaveLength(0);
  });

  test('FAIL: VPC in OU not in shareTargets emits "Missing accounts"', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'WorkloadA',
      resolver: { rules: [buildResolverRule(['Security'])] } as ResolverConfig,
      vpcConsumers: { resolverRules: ['TestResolverRule'] },
    });

    new VpcValidator(networkConfig, helpers, errors);

    expect(
      errors.filter(
        e => e.includes('Resolver rule "TestResolverRule" is not shared') && e.includes('Missing accounts: WorkloadA'),
      ),
    ).toHaveLength(1);
  });

  test('STRICT-OU: parent-OU share is not consumable from child OU', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildShareFixture({
      vpcAccount: 'WorkloadB',
      resolver: { rules: [buildResolverRule(['Workload'])] } as ResolverConfig,
      vpcConsumers: { resolverRules: ['TestResolverRule'] },
    });

    new VpcValidator(networkConfig, helpers, errors);

    expect(
      errors.filter(
        e => e.includes('Resolver rule "TestResolverRule" is not shared') && e.includes('Missing accounts: WorkloadB'),
      ),
    ).toHaveLength(1);
  });
});

// subnet → ALB share-target consistency — validateSubnetSharesToAlbShares
// A shared ALB's target accounts must be a subset of each of its subnets' share targets.
describe('VpcValidator - subnet to ALB share targets', () => {
  /**
   * Build a fixture with one subnet and one shared ALB referencing it.
   */
  function buildAlbFixture(albShareOus: string[], subnetShareOus: string[]) {
    const subnets = [
      {
        name: 'SubnetA',
        availabilityZone: 'a',
        ipv4CidrBlock: '10.0.1.0/24',
        shareTargets: { organizationalUnits: subnetShareOus, accounts: [] } as ShareTargets,
      },
    ] as unknown as VpcConfig['subnets'];

    const loadBalancers = {
      applicationLoadBalancers: [
        {
          name: 'AlbA',
          subnets: ['SubnetA'],
          shareTargets: { organizationalUnits: albShareOus, accounts: [] } as ShareTargets,
        },
      ],
    } as unknown as VpcConfig['loadBalancers'];

    return buildShareFixture({ vpcAccount: 'Network', subnets, loadBalancers });
  }

  const ALB_SHARE_ERROR = "is deployed to multiple accounts and using subnets that aren't available";

  test('PASS: ALB share targets are a subset of the subnet share targets', () => {
    const errors: string[] = [];
    const { networkConfig, helpers } = buildAlbFixture(['Workload'], ['Workload']);

    new VpcValidator(networkConfig, helpers, errors);

    expect(
      errors.filter(e => e.includes('Application Load Balancer AlbA') && e.includes(ALB_SHARE_ERROR)),
    ).toHaveLength(0);
  });

  test('FAIL: ALB shared to an account the subnet is not shared to', () => {
    // ALB -> Workload (WorkloadA); subnet -> Security (LogArchive, Audit). WorkloadA missing.
    const errors: string[] = [];
    const { networkConfig, helpers } = buildAlbFixture(['Workload'], ['Security']);

    new VpcValidator(networkConfig, helpers, errors);

    expect(
      errors.filter(e => e.includes('Application Load Balancer AlbA') && e.includes(ALB_SHARE_ERROR)),
    ).toHaveLength(1);
  });

  test('STRICT-OU: ALB targeting child OU is NOT covered by subnet shared to parent OU', () => {
    // ALB -> Workload/NestedW (WorkloadB); subnet -> Workload (WorkloadA). WorkloadB missing.
    const errors: string[] = [];
    const { networkConfig, helpers } = buildAlbFixture(['Workload/NestedW'], ['Workload']);

    new VpcValidator(networkConfig, helpers, errors);

    expect(
      errors.filter(e => e.includes('Application Load Balancer AlbA') && e.includes(ALB_SHARE_ERROR)),
    ).toHaveLength(1);
  });
});
