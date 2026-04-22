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

const buildScope = (propagations: CfnRes[], vpcs: any[]) => ({
  account: '111111111111',
  region: 'ca-central-1',
  includedStack: { getResource: () => ({}) },
  stack: { getResource: () => ({}) },
  getResource: () => ({}),
  importStackResources: {
    getResourcesByType: (type: string) =>
      type === 'AWS::EC2::TransitGatewayRouteTablePropagation' ? propagations : [],
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
