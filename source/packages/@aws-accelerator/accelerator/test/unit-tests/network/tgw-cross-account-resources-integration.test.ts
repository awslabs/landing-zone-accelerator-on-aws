/* eslint @typescript-eslint/no-explicit-any: 0 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { TgwCrossAccountResources } from '../../../lib/asea-resources/tgw-cross-account-resources';
import { AseaResource } from '../../../lib/asea-resources/resource';
import { AseaResourceType } from '@aws-accelerator/config';

/**
 * End-to-end regression test for the ghost-entry bug (GitHub issue
 * awslabs/landing-zone-accelerator-on-aws#1064) without spinning up
 * AWS or synthesizing a full CDK stack.
 *
 * Strategy:
 *   - Stub `AseaResource.loadResourcesFromFile` so base-class construction
 *     doesn't read from disk.
 *   - Stub the private mapping helpers `getTgwAttachmentId` and
 *     `getTgwRouteTableId` to return whatever the test scenario needs — this
 *     sidesteps building a realistic `ASEAMappings` fixture.
 *   - Feed a hand-crafted `propagationResources` array via the fake scope,
 *     invoke the real constructor, and assert what `addAseaResource` was
 *     called with.
 */

const addAseaResource = vi.fn<[string, string], void>();
const addLogs = vi.fn();

type CfnRes = {
  logicalResourceId: string;
  resourceType: string;
  resourceMetadata: { Properties: Record<string, unknown> };
};

const propagation = (logicalId: string, attId: unknown, rtId: string): CfnRes => ({
  logicalResourceId: logicalId,
  resourceType: 'AWS::EC2::TransitGatewayRouteTablePropagation',
  resourceMetadata: { Properties: { TransitGatewayAttachmentId: attId, TransitGatewayRouteTableId: rtId } },
});

const association = (logicalId: string, attId: unknown, rtId: string): CfnRes => ({
  logicalResourceId: logicalId,
  resourceType: 'AWS::EC2::TransitGatewayRouteTableAssociation',
  resourceMetadata: { Properties: { TransitGatewayAttachmentId: attId, TransitGatewayRouteTableId: rtId } },
});

const buildScope = (propagations: CfnRes[], vpcs: any[], associations: CfnRes[] = []) => ({
  account: '111111111111',
  region: 'ca-central-1',
  includedStack: { getResource: () => ({}) },
  stack: { getResource: () => ({}) },
  getResource: () => ({}),
  importStackResources: {
    getResourcesByType: (type: string) =>
      type === 'AWS::EC2::TransitGatewayRouteTablePropagation'
        ? propagations
        : type === 'AWS::EC2::TransitGatewayRouteTableAssociation'
          ? associations
          : [],
  },
  nestedStackResources: {},
  vpcResources: vpcs,
  getTransitGatewayAttachmentAccounts: () => [['shared-network'], []],
  addAseaResource,
  addLogs,
  stackInfo: { phase: '2', accountKey: 'shared-network', region: 'ca-central-1', stackName: 'Phase2' },
});

const buildProps = (): any => ({
  stackInfo: { phase: '2', accountKey: 'shared-network', region: 'ca-central-1', stackName: 'Phase2' },
  mapping: {},
  globalConfig: { externalLandingZoneResources: { resourceParameters: {} } },
});

const newVpc = (name: string, rtPropagations: string[]) => ({
  name,
  region: 'ca-central-1',
  transitGatewayAttachments: [
    {
      name: `${name}_Main_att`,
      transitGateway: { name: 'Main_tgw', account: 'shared-network' },
      subnets: [],
      routeTableAssociations: [],
      routeTablePropagations: rtPropagations,
    },
  ],
});

describe('TgwCrossAccountResources — ghost-entry regression', () => {
  beforeEach(() => {
    addAseaResource.mockClear();
    addLogs.mockClear();
    vi.spyOn(AseaResource.prototype as any, 'loadResourcesFromFile').mockReturnValue([]);
    vi.spyOn(TgwCrossAccountResources.prototype as any, 'getTgwRouteTableId').mockImplementation(((rt: string) =>
      rt === 'Main_tgw_core_rt' ? 'tgw-rtb-core-asea' : undefined) as any);
  });

  afterEach(() => vi.restoreAllMocks());

  test('new VPC (not in ASEA) does NOT register a ghost propagation against a cross-account ASEA propagation', () => {
    // getTgwAttachmentId returns undefined for the new VPC: it does not exist in any ASEA Phase-1 stack.
    vi.spyOn(TgwCrossAccountResources.prototype as any, 'getTgwAttachmentId').mockReturnValue(undefined);

    // ASEA cross-account propagation: TransitGatewayAttachmentId is a resolved physical id string,
    // pointing at an existing Perimeter VPC's attachment. This is the exact shape that triggered
    // the `undefined === undefined` false match in 1.14.3.
    const ghost = propagation('PerimeterMainPropCore', 'tgw-attach-0existingperimeter', 'tgw-rtb-core-asea');
    const scope = buildScope([ghost], [newVpc('DevWorkspaces_vpc', ['Main_tgw_core_rt'])]);

    new TgwCrossAccountResources(scope as any, buildProps());

    expect(addAseaResource).not.toHaveBeenCalledWith(
      AseaResourceType.TRANSIT_GATEWAY_PROPAGATION,
      'shared-network/Main_tgw/DevWorkspaces_vpc_Main_att/Main_tgw_core_rt',
    );
  });

  test('existing ASEA VPC with cross-account propagation IS registered as ASEA-managed (happy path)', () => {
    // getTgwAttachmentId returns the real physical id for the ASEA-created VPC.
    vi.spyOn(TgwCrossAccountResources.prototype as any, 'getTgwAttachmentId').mockReturnValue(
      'tgw-attach-0existingperimeter',
    );

    const real = propagation('PerimeterMainPropCore', 'tgw-attach-0existingperimeter', 'tgw-rtb-core-asea');
    const scope = buildScope([real], [newVpc('Perimeter_vpc', ['Main_tgw_core_rt'])]);

    new TgwCrossAccountResources(scope as any, buildProps());

    expect(addAseaResource).toHaveBeenCalledWith(
      AseaResourceType.TRANSIT_GATEWAY_PROPAGATION,
      'shared-network/Main_tgw/Perimeter_vpc_Main_att/Main_tgw_core_rt',
    );
  });

  test('new VPC propagation into an LZA-created route table is NOT registered as ASEA-managed', () => {
    // getTgwAttachmentId: undefined (new VPC). getTgwRouteTableId already returns undefined for
    // 'Main_tgw_dev_rt' (via the default beforeEach stub that only recognizes core_rt).
    vi.spyOn(TgwCrossAccountResources.prototype as any, 'getTgwAttachmentId').mockReturnValue(undefined);

    const scope = buildScope([], [newVpc('DevWorkspaces_vpc', ['Main_tgw_dev_rt'])]);

    new TgwCrossAccountResources(scope as any, buildProps());

    expect(addAseaResource).not.toHaveBeenCalled();
  });

  test('proof: if matchesAttachmentId is stubbed to always return true (pre-1.14.3 bug), the ghost entry DOES appear', () => {
    // This test exists to prove the first test above is meaningful — i.e. that the bug path is
    // actually reached in the scenario. If the `if (!attachmentId) continue;` guard is removed
    // OR `matchesAttachmentId` incorrectly returns true for the `undefined` attachmentId case,
    // the ghost entry will be written. We simulate that regression here.
    vi.spyOn(TgwCrossAccountResources.prototype as any, 'getTgwAttachmentId').mockReturnValue(undefined);
    vi.spyOn(TgwCrossAccountResources.prototype as any, 'matchesAttachmentId').mockReturnValue(true);

    const ghost = propagation('PerimeterMainPropCore', 'tgw-attach-0existingperimeter', 'tgw-rtb-core-asea');
    const scope = buildScope([ghost], [newVpc('DevWorkspaces_vpc', ['Main_tgw_core_rt'])]);

    // To actually write the ghost we also need to bypass the `if (!attachmentId) continue;`
    // guard at the top of createTgwPropagations. Patch the guard by making attachmentId
    // truthy via getTgwAttachmentId returning a bogus string. That + the forced matchesAttachmentId
    // reproduces the exact 1.14.3 behavior.
    vi.spyOn(TgwCrossAccountResources.prototype as any, 'getTgwAttachmentId').mockReturnValue(
      'tgw-attach-bogus-not-actually-in-asea',
    );

    new TgwCrossAccountResources(scope as any, buildProps());

    // If the regression re-appeared, this ghost entry would be written.
    expect(addAseaResource).toHaveBeenCalledWith(
      AseaResourceType.TRANSIT_GATEWAY_PROPAGATION,
      'shared-network/Main_tgw/DevWorkspaces_vpc_Main_att/Main_tgw_core_rt',
    );
  });
});

/**
 * Regression test for LZA-1553 / D487044572: getTgwAttachmentId must traverse
 * nested stacks in mapping.json. ASEA places VPCs and TGW attachments in nested
 * CloudFormation stacks — only parent stacks appear as top-level keys in
 * mapping.json. The v1.15.0 refactoring (commit 363b53db2) broke this by
 * iterating `Object.keys(mapping)` without descending into `nestedStacks`.
 */
describe('TgwCrossAccountResources — nested stack traversal (LZA-1553)', () => {
  beforeEach(() => {
    addAseaResource.mockClear();
    addLogs.mockClear();
  });

  afterEach(() => vi.restoreAllMocks());

  test('getTgwAttachmentId finds attachment in nested stack', () => {
    const ATTACH_PHYSICAL_ID = 'tgw-attach-0nestedstack123';
    const VPC_NAME = 'Production_vpc';
    const TGW_ATTACH_NAME = 'Production_Main_att';
    const ACCOUNT_KEY = 'workload-prod';
    const REGION = 'ca-central-1';

    const nestedStackResources = [
      {
        resourceType: 'AWS::EC2::VPC',
        logicalResourceId: 'VpcProduction',
        physicalResourceId: 'vpc-0nested123',
        resourceMetadata: { Properties: { Tags: [{ Key: 'Name', Value: VPC_NAME }] } },
      },
      {
        resourceType: 'AWS::EC2::TransitGatewayAttachment',
        logicalResourceId: 'TgwAttachProduction',
        physicalResourceId: ATTACH_PHYSICAL_ID,
        resourceMetadata: { Properties: { Tags: [{ Key: 'Name', Value: TGW_ATTACH_NAME }] } },
      },
    ];

    const parentStackResources: any[] = [];

    const mapping = {
      'PALZ-WorkloadProd-Phase1': {
        accountKey: ACCOUNT_KEY,
        phase: '1',
        region: REGION,
        cfnResources: parentStackResources,
        nestedStacks: {
          'PALZ-WorkloadProd-Phase1-VpcNested': {
            accountKey: ACCOUNT_KEY,
            phase: '1',
            region: REGION,
            cfnResources: nestedStackResources,
          },
        },
      },
    };

    vi.spyOn(AseaResource.prototype as any, 'loadResourcesFromFile').mockImplementation((stack: any) => {
      return stack.cfnResources ?? [];
    });

    const getTgwAttachmentId = (TgwCrossAccountResources.prototype as any).getTgwAttachmentId;
    const boundFn = getTgwAttachmentId.bind({
      scope: { addLogs },
      loadResourcesFromFile: (stack: any) => stack.cfnResources ?? [],
      findResourceByTypeAndTag: (resources: any[], type: string, name: string) =>
        resources.find(
          (r: any) =>
            r.resourceType === type &&
            r.resourceMetadata.Properties.Tags?.some((t: any) => t.Key === 'Name' && t.Value === name),
        ),
      filterResourcesByType: (resources: any[], type: string) => resources.filter((r: any) => r.resourceType === type),
    });

    const result = boundFn(VPC_NAME, TGW_ATTACH_NAME, mapping, ACCOUNT_KEY, REGION);
    expect(result).toBe(ATTACH_PHYSICAL_ID);
  });

  test('getTgwAttachmentId returns undefined when VPC is not in any nested stack', () => {
    const mapping = {
      'PALZ-WorkloadProd-Phase1': {
        accountKey: 'workload-prod',
        phase: '1',
        region: 'ca-central-1',
        cfnResources: [],
        nestedStacks: {
          'PALZ-WorkloadProd-Phase1-VpcNested': {
            accountKey: 'workload-prod',
            phase: '1',
            region: 'ca-central-1',
            cfnResources: [
              {
                resourceType: 'AWS::EC2::VPC',
                logicalResourceId: 'VpcOther',
                physicalResourceId: 'vpc-other',
                resourceMetadata: { Properties: { Tags: [{ Key: 'Name', Value: 'Other_vpc' }] } },
              },
            ],
          },
        },
      },
    };

    vi.spyOn(AseaResource.prototype as any, 'loadResourcesFromFile').mockImplementation((stack: any) => {
      return stack.cfnResources ?? [];
    });

    const getTgwAttachmentId = (TgwCrossAccountResources.prototype as any).getTgwAttachmentId;
    const logFn = vi.fn();
    const boundFn = getTgwAttachmentId.bind({
      scope: { addLogs: logFn },
      loadResourcesFromFile: (stack: any) => stack.cfnResources ?? [],
      findResourceByTypeAndTag: (resources: any[], type: string, name: string) =>
        resources.find(
          (r: any) =>
            r.resourceType === type &&
            r.resourceMetadata.Properties.Tags?.some((t: any) => t.Key === 'Name' && t.Value === name),
        ),
      filterResourcesByType: (resources: any[], type: string) => resources.filter((r: any) => r.resourceType === type),
    });

    const result = boundFn('Production_vpc', 'Production_Main_att', mapping, 'workload-prod', 'ca-central-1');
    expect(result).toBeUndefined();
    expect(logFn).toHaveBeenCalled();
  });

  test('getTgwAttachmentId finds attachment in root stack when no nested stacks exist', () => {
    const ATTACH_PHYSICAL_ID = 'tgw-attach-0rootstack456';

    const mapping = {
      'PALZ-WorkloadProd-Phase1': {
        accountKey: 'workload-prod',
        phase: '1',
        region: 'ca-central-1',
        cfnResources: [
          {
            resourceType: 'AWS::EC2::VPC',
            logicalResourceId: 'VpcProd',
            physicalResourceId: 'vpc-root',
            resourceMetadata: { Properties: { Tags: [{ Key: 'Name', Value: 'Production_vpc' }] } },
          },
          {
            resourceType: 'AWS::EC2::TransitGatewayAttachment',
            logicalResourceId: 'TgwAttach',
            physicalResourceId: ATTACH_PHYSICAL_ID,
            resourceMetadata: { Properties: { Tags: [{ Key: 'Name', Value: 'Production_Main_att' }] } },
          },
        ],
      },
    };

    vi.spyOn(AseaResource.prototype as any, 'loadResourcesFromFile').mockImplementation((stack: any) => {
      return stack.cfnResources ?? [];
    });

    const getTgwAttachmentId = (TgwCrossAccountResources.prototype as any).getTgwAttachmentId;
    const boundFn = getTgwAttachmentId.bind({
      scope: { addLogs },
      loadResourcesFromFile: (stack: any) => stack.cfnResources ?? [],
      findResourceByTypeAndTag: (resources: any[], type: string, name: string) =>
        resources.find(
          (r: any) =>
            r.resourceType === type &&
            r.resourceMetadata.Properties.Tags?.some((t: any) => t.Key === 'Name' && t.Value === name),
        ),
      filterResourcesByType: (resources: any[], type: string) => resources.filter((r: any) => r.resourceType === type),
    });

    const result = boundFn('Production_vpc', 'Production_Main_att', mapping, 'workload-prod', 'ca-central-1');
    expect(result).toBe(ATTACH_PHYSICAL_ID);
  });
});

/**
 * Tests for the Phase-2 fallback (P400420849 fix): inferCrossAccountAttachmentIdFromPhase2.
 * Validates that cross-account TGW propagations/associations are registered when the
 * primary Phase-1 lookup fails but Phase-2 resources contain the attachment.
 */
describe('TgwCrossAccountResources — Phase-2 cross-account fallback (P400420849)', () => {
  beforeEach(() => {
    addAseaResource.mockClear();
    addLogs.mockClear();
    vi.spyOn(AseaResource.prototype as any, 'loadResourcesFromFile').mockReturnValue([]);
  });

  afterEach(() => vi.restoreAllMocks());

  const RT_CORE = 'tgw-rtb-core-FAKE';
  const RT_SEGREGATED = 'tgw-rtb-segregated-FAKE';
  const RT_SHARED = 'tgw-rtb-shared-FAKE';
  const RT_STANDALONE = 'tgw-rtb-standalone-FAKE';
  const FAKE_ATTACH = 'tgw-attach-FAKEperimeter';

  const rtMap: Record<string, string> = {
    Main_tgw_core_rt: RT_CORE,
    Main_tgw_segregated_rt: RT_SEGREGATED,
    Main_tgw_shared_rt: RT_SHARED,
    Main_tgw_standalone_rt: RT_STANDALONE,
  };

  const perimeterVpc = {
    name: 'Perimeter_vpc',
    account: 'perimeter',
    region: 'ca-central-1',
    transitGatewayAttachments: [
      {
        name: 'Perimeter_Main_att',
        transitGateway: { name: 'Main_tgw', account: 'shared-network' },
        subnets: [],
        routeTableAssociations: ['Main_tgw_core_rt'],
        routeTablePropagations: [
          'Main_tgw_core_rt',
          'Main_tgw_segregated_rt',
          'Main_tgw_shared_rt',
          'Main_tgw_standalone_rt',
        ],
      },
    ],
  };

  const buildPropsWithGate = (hasVpcInResourceList: boolean): any => ({
    stackInfo: { phase: '2', accountKey: 'shared-network', region: 'ca-central-1', stackName: 'Phase2' },
    mapping: {},
    globalConfig: {
      externalLandingZoneResources: {
        resourceParameters: {},
        resourceList: hasVpcInResourceList
          ? [
              {
                accountId: '222222222222',
                region: 'ca-central-1',
                resourceType: 'EC2_VPC',
                resourceIdentifier: 'Perimeter_vpc',
              },
            ]
          : [],
      },
    },
  });

  const fakePropagations = (): CfnRes[] => [
    propagation('FakeCoreProp', FAKE_ATTACH, RT_CORE),
    propagation('FakeSegregatedProp', FAKE_ATTACH, RT_SEGREGATED),
    propagation('FakeSharedProp', FAKE_ATTACH, RT_SHARED),
    propagation('FakeStandaloneProp', FAKE_ATTACH, RT_STANDALONE),
  ];

  const fakeAssociations = (): CfnRes[] => [association('FakeCoreAssoc', FAKE_ATTACH, RT_CORE)];

  test('fallback registers propagations/associations when Phase-1 lookup fails but Phase-2 resources match', () => {
    vi.spyOn(TgwCrossAccountResources.prototype as any, 'getTgwAttachmentId').mockReturnValue(undefined);
    vi.spyOn(TgwCrossAccountResources.prototype as any, 'getTgwRouteTableId').mockImplementation(
      ((rt: string) => rtMap[rt]) as any,
    );

    const scope = buildScope(fakePropagations(), [perimeterVpc], fakeAssociations());
    new TgwCrossAccountResources(scope as any, buildPropsWithGate(true));

    expect(addAseaResource).toHaveBeenCalledWith(
      AseaResourceType.TRANSIT_GATEWAY_ASSOCIATION,
      'shared-network/Main_tgw/Perimeter_Main_att/Main_tgw_core_rt',
    );
    expect(addAseaResource).toHaveBeenCalledWith(
      AseaResourceType.TRANSIT_GATEWAY_PROPAGATION,
      'shared-network/Main_tgw/Perimeter_Main_att/Main_tgw_core_rt',
    );
    expect(addAseaResource).toHaveBeenCalledWith(
      AseaResourceType.TRANSIT_GATEWAY_PROPAGATION,
      'shared-network/Main_tgw/Perimeter_Main_att/Main_tgw_segregated_rt',
    );
    expect(addAseaResource).toHaveBeenCalledWith(
      AseaResourceType.TRANSIT_GATEWAY_PROPAGATION,
      'shared-network/Main_tgw/Perimeter_Main_att/Main_tgw_shared_rt',
    );
    expect(addAseaResource).toHaveBeenCalledWith(
      AseaResourceType.TRANSIT_GATEWAY_PROPAGATION,
      'shared-network/Main_tgw/Perimeter_Main_att/Main_tgw_standalone_rt',
    );
  });

  test('fallback does NOT fire when VPC is not in aseaResources.json (gate fails)', () => {
    vi.spyOn(TgwCrossAccountResources.prototype as any, 'getTgwAttachmentId').mockReturnValue(undefined);
    vi.spyOn(TgwCrossAccountResources.prototype as any, 'getTgwRouteTableId').mockImplementation(
      ((rt: string) => rtMap[rt]) as any,
    );

    const scope = buildScope(fakePropagations(), [perimeterVpc], fakeAssociations());
    new TgwCrossAccountResources(scope as any, buildPropsWithGate(false));

    // No propagation/association should be registered for Perimeter
    const perimeterCalls = addAseaResource.mock.calls.filter(([, id]: [string, string]) =>
      id.includes('Perimeter_Main_att'),
    );
    expect(perimeterCalls).toHaveLength(0);
  });

  test('fallback does NOT fire when primary Phase-1 lookup succeeds', () => {
    vi.spyOn(TgwCrossAccountResources.prototype as any, 'getTgwAttachmentId').mockReturnValue('tgw-attach-real-phase1');
    vi.spyOn(TgwCrossAccountResources.prototype as any, 'getTgwRouteTableId').mockImplementation(
      ((rt: string) => rtMap[rt]) as any,
    );

    // Propagation resources use the REAL Phase-1 attachment id so matchesAttachmentId succeeds
    const realProps = [
      propagation('RealCoreProp', 'tgw-attach-real-phase1', RT_CORE),
      propagation('RealSegProp', 'tgw-attach-real-phase1', RT_SEGREGATED),
      propagation('RealSharedProp', 'tgw-attach-real-phase1', RT_SHARED),
      propagation('RealStandaloneProp', 'tgw-attach-real-phase1', RT_STANDALONE),
    ];
    const realAssocs = [association('RealCoreAssoc', 'tgw-attach-real-phase1', RT_CORE)];

    const scope = buildScope(realProps, [perimeterVpc], realAssocs);
    new TgwCrossAccountResources(scope as any, buildPropsWithGate(true));

    // Should register via the primary path (Phase-1 attachment id resolved)
    const calls = addAseaResource.mock.calls.filter(([, id]: [string, string]) => id.includes('Perimeter_Main_att'));
    expect(calls.length).toBeGreaterThan(0);
  });

  test('fallback returns undefined when multiple attachments match (ambiguity guard)', () => {
    vi.spyOn(TgwCrossAccountResources.prototype as any, 'getTgwAttachmentId').mockReturnValue(undefined);
    vi.spyOn(TgwCrossAccountResources.prototype as any, 'getTgwRouteTableId').mockImplementation(
      ((rt: string) => rtMap[rt]) as any,
    );

    // Two different attachment IDs both have RTs that are subsets of configRtIds
    const ambiguousProps = [
      propagation('Attach1Core', 'tgw-attach-AAA', RT_CORE),
      propagation('Attach2Core', 'tgw-attach-BBB', RT_CORE),
    ];

    const vpcWithOneRt = {
      ...perimeterVpc,
      transitGatewayAttachments: [
        {
          ...perimeterVpc.transitGatewayAttachments[0],
          routeTableAssociations: ['Main_tgw_core_rt'],
          routeTablePropagations: ['Main_tgw_core_rt'],
        },
      ],
    };

    const scope = buildScope(ambiguousProps, [vpcWithOneRt]);
    new TgwCrossAccountResources(scope as any, buildPropsWithGate(true));

    const perimeterCalls = addAseaResource.mock.calls.filter(([, id]: [string, string]) =>
      id.includes('Perimeter_Main_att'),
    );
    expect(perimeterCalls).toHaveLength(0);
  });

  test('fallback ignores resources with Ref-style attachment ids (same-account resources)', () => {
    vi.spyOn(TgwCrossAccountResources.prototype as any, 'getTgwAttachmentId').mockReturnValue(undefined);
    vi.spyOn(TgwCrossAccountResources.prototype as any, 'getTgwRouteTableId').mockImplementation(
      ((rt: string) => rtMap[rt]) as any,
    );

    // Same-account resources use { Ref: "LogicalId" } not a string
    const refStyleResources: CfnRes[] = [
      {
        logicalResourceId: 'SameAccountProp',
        resourceType: 'AWS::EC2::TransitGatewayRouteTablePropagation',
        resourceMetadata: {
          Properties: { TransitGatewayAttachmentId: { Ref: 'SomeLogicalId' }, TransitGatewayRouteTableId: RT_CORE },
        },
      } as any,
    ];

    const scope = buildScope(refStyleResources, [perimeterVpc]);
    new TgwCrossAccountResources(scope as any, buildPropsWithGate(true));

    const perimeterCalls = addAseaResource.mock.calls.filter(([, id]: [string, string]) =>
      id.includes('Perimeter_Main_att'),
    );
    expect(perimeterCalls).toHaveLength(0);
  });
});
