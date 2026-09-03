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

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/common/logger', () => ({
  createLogger: vi.fn(function () {
    return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  }),
  createStatusLogger: vi.fn(function () {
    return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  }),
}));

vi.mock('../../../lib/transit-gateway/transit-gateway-attachment-lookup', () => ({
  TransitGatewayAttachmentLookup: {
    resolveAttachments: vi.fn(),
  },
}));

vi.mock('../../../lib/transit-gateway/tgw-route-tables', () => ({
  configureAssociationsAndPropagations: vi.fn(),
}));

vi.mock('../../../lib/transit-gateway/direct-connect-gateway-association', () => ({
  DirectConnectGatewayAssociation: {
    resolveDxGatewayAssociations: vi.fn(),
  },
}));

vi.mock('../../../lib/transit-gateway/tgw-connect', () => ({
  TransitGatewayConnect: {
    createConnectAttachments: vi.fn(),
    deleteStaleConnectAttachments: vi.fn(),
  },
}));

import { configureTgw } from '../../../lib/transit-gateway/tgw';
import { TransitGatewayAttachmentLookup } from '../../../lib/transit-gateway/transit-gateway-attachment-lookup';
import { DirectConnectGatewayAssociation } from '../../../lib/transit-gateway/direct-connect-gateway-association';
import { TransitGatewayConnect } from '../../../lib/transit-gateway/tgw-connect';
import { configureAssociationsAndPropagations } from '../../../lib/transit-gateway/tgw-route-tables';
import { ITgwModuleRequest, ITgwResolvedContext } from '../../../lib/transit-gateway/interfaces';

const baseRequest: ITgwModuleRequest = {
  invokingAccountId: '111111111111',
  region: 'us-east-1',
  partition: 'aws',
  globalRegion: 'us-east-1',
  operation: 'setup',
  moduleName: 'transit-gateway',
  solutionId: 'AwsSolution/SO0199',
  dryRun: false,
  configuration: {
    enable: true,
    accountAccessRoleName: 'AWSControlTowerExecution',
    transitGateways: [
      { name: 'main-tgw', accountId: '111111111111', region: 'us-east-1', routeTables: [{ name: 'core-rt' }] },
    ],
    attachments: [
      {
        type: 'vpc',
        name: 'shared-vpc',
        accountId: '111111111111',
        transitGateway: 'main-tgw',
        routeTableAssociations: ['core-rt'],
        routeTablePropagations: ['core-rt'],
      },
    ],
  },
};

const emptyContext: ITgwResolvedContext = {
  transitGatewayIds: new Map([['main-tgw', 'tgw-0abc']]),
  routeTableIds: new Map([['main-tgw_core-rt', 'tgw-rtb-0def']]),
  attachmentIds: new Map([['main-tgw_111111111111_shared-vpc', 'tgw-attach-0ghi']]),
};

describe('configureTgw', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(TransitGatewayAttachmentLookup.resolveAttachments).mockResolvedValue(emptyContext);
    vi.mocked(DirectConnectGatewayAssociation.resolveDxGatewayAssociations).mockResolvedValue({
      dxResponses: [],
      dxAttachments: [],
    });
    vi.mocked(TransitGatewayConnect.createConnectAttachments).mockResolvedValue([]);
    vi.mocked(TransitGatewayConnect.deleteStaleConnectAttachments).mockResolvedValue([]);
    vi.mocked(configureAssociationsAndPropagations).mockResolvedValue({ associations: [], propagations: [] });
  });

  it('should return COMPLETED when module disabled', async () => {
    const request = { ...baseRequest, configuration: { ...baseRequest.configuration, enable: false } };
    const result = await configureTgw(request);

    expect(result.status).toBe('completed');
    expect(result.summary).toContain('disabled');
    expect(TransitGatewayAttachmentLookup.resolveAttachments).not.toHaveBeenCalled();
  });

  it('should execute phases in order: resolve → DX → associations', async () => {
    const callOrder: string[] = [];
    vi.mocked(TransitGatewayAttachmentLookup.resolveAttachments).mockImplementation(async () => {
      callOrder.push('resolve');
      return emptyContext;
    });
    vi.mocked(DirectConnectGatewayAssociation.resolveDxGatewayAssociations).mockImplementation(async () => {
      callOrder.push('dx');
      return { dxResponses: [], dxAttachments: [] };
    });
    vi.mocked(configureAssociationsAndPropagations).mockImplementation(async () => {
      callOrder.push('associations');
      return { associations: [], propagations: [] };
    });

    await configureTgw(baseRequest);

    expect(callOrder).toEqual(['resolve', 'dx', 'associations']);
  });

  it('should return COMPLETED with summary on success', async () => {
    vi.mocked(configureAssociationsAndPropagations).mockResolvedValue({
      associations: [
        {
          operation: 'created',
          region: 'us-east-1',
          tgwName: 'main-tgw',
          routeTableName: 'core-rt',
          attachmentType: 'vpc',
          attachmentName: 'shared-vpc',
        },
      ],
      propagations: [
        {
          operation: 'exists',
          region: 'us-east-1',
          tgwName: 'main-tgw',
          routeTableName: 'core-rt',
          attachmentType: 'vpc',
          attachmentName: 'shared-vpc',
        },
      ],
    });

    const result = await configureTgw(baseRequest);

    expect(result.status).toBe('completed');
    expect(result.summary).toContain('+1');
    expect(result.response?.associations).toHaveLength(1);
    expect(result.response?.propagations).toHaveLength(1);
    expect(result.response?.dxAssociations).toHaveLength(0);
  });

  it('should pass through ownedResources from phase2 results in response', async () => {
    const mockOwnedResources = ['assoc:tgw-rtb-core:tgw-attach-aaa', 'prop:tgw-rtb-core:tgw-attach-bbb'];
    vi.mocked(configureAssociationsAndPropagations).mockResolvedValue({
      associations: [],
      propagations: [],
      ownedResources: mockOwnedResources,
    });

    const result = await configureTgw(baseRequest);

    expect(result.status).toBe('completed');
    expect(result.response?.ownedResources).toEqual(mockOwnedResources);
  });

  it('should merge route-table and DX Gateway owned resources into response ownedResources', async () => {
    vi.mocked(configureAssociationsAndPropagations).mockResolvedValue({
      associations: [],
      propagations: [],
      ownedResources: ['assoc:tgw-rtb-core:tgw-attach-aaa'],
    });
    vi.mocked(DirectConnectGatewayAssociation.resolveDxGatewayAssociations).mockResolvedValue({
      dxResponses: [],
      dxAttachments: [],
      ownedResources: ['dxassoc:dxgw-111:tgw-0abc'],
    });

    const result = await configureTgw(baseRequest);

    expect(result.status).toBe('completed');
    // Both the route-table owned ID and the DX Gateway association owned ID must be persisted.
    expect(result.response?.ownedResources).toEqual(
      expect.arrayContaining(['assoc:tgw-rtb-core:tgw-attach-aaa', 'dxassoc:dxgw-111:tgw-0abc']),
    );
    expect(result.response?.ownedResources).toHaveLength(2);
  });

  it('should merge DX attachments into Phase 2 request', async () => {
    vi.mocked(DirectConnectGatewayAssociation.resolveDxGatewayAssociations).mockResolvedValue({
      dxResponses: [
        {
          operation: 'created',
          region: 'us-east-1',
          tgwName: 'main-tgw',
          dxGatewayName: 'dxgw-1',
          associationType: 'direct',
        },
      ],
      dxAttachments: [
        {
          type: 'dxGateway',
          name: 'dxgw-dxgw-1',
          accountId: '111111111111',
          transitGateway: 'main-tgw',
          routeTableAssociations: ['core-rt'],
          routeTablePropagations: ['core-rt'],
        },
      ],
    });

    await configureTgw(baseRequest);

    const phase2Call = vi.mocked(configureAssociationsAndPropagations).mock.calls[0];
    const phase2Request = phase2Call[0];
    expect(phase2Request.configuration.attachments).toHaveLength(2); // original + DX
    expect(phase2Request.configuration.attachments[1].type).toBe('dxGateway');
  });

  it('should not merge when no DX attachments', async () => {
    await configureTgw(baseRequest);

    const phase2Call = vi.mocked(configureAssociationsAndPropagations).mock.calls[0];
    const phase2Request = phase2Call[0];
    expect(phase2Request.configuration.attachments).toHaveLength(1); // original only
  });

  it('should merge Connect attachments with RT config into Phase 2 request', async () => {
    const requestWithConnect = {
      ...baseRequest,
      configuration: {
        ...baseRequest.configuration,
        connectAttachments: [
          {
            name: 'my-connect',
            transitGateway: 'main-tgw',
            transportAttachmentType: 'vpc' as const,
            transportName: 'shared-vpc',
            transportAccountId: '111111111111',
            options: { protocol: 'gre' as const },
            routeTableAssociations: ['core-rt'],
            routeTablePropagations: ['core-rt'],
          },
        ],
      },
    };

    vi.mocked(TransitGatewayConnect.createConnectAttachments).mockResolvedValue([
      {
        operation: 'created',
        region: 'us-east-1',
        tgwName: 'main-tgw',
        connectName: 'my-connect',
        connectAttachmentId: 'tgw-attach-connect-123',
      },
    ]);

    await configureTgw(requestWithConnect);

    const phase2Call = vi.mocked(configureAssociationsAndPropagations).mock.calls[0];
    const phase2Request = phase2Call[0];
    // original VPC + Connect
    expect(phase2Request.configuration.attachments).toHaveLength(2);
    expect(phase2Request.configuration.attachments[1].type).toBe('connect');
    expect(phase2Request.configuration.attachments[1].name).toBe('connect-my-connect');
    expect(phase2Request.configuration.attachments[1].routeTableAssociations).toEqual(['core-rt']);
    expect(phase2Request.configuration.attachments[1].routeTablePropagations).toEqual(['core-rt']);
  });

  it('should not merge Connect into Phase 2 when no RT config', async () => {
    const requestWithConnect = {
      ...baseRequest,
      configuration: {
        ...baseRequest.configuration,
        connectAttachments: [
          {
            name: 'my-connect',
            transitGateway: 'main-tgw',
            transportAttachmentType: 'vpc' as const,
            transportName: 'shared-vpc',
            transportAccountId: '111111111111',
            options: { protocol: 'gre' as const },
            // No routeTableAssociations or routeTablePropagations
          },
        ],
      },
    };

    vi.mocked(TransitGatewayConnect.createConnectAttachments).mockResolvedValue([
      {
        operation: 'exists',
        region: 'us-east-1',
        tgwName: 'main-tgw',
        connectName: 'my-connect',
        connectAttachmentId: 'tgw-attach-connect-123',
      },
    ]);

    await configureTgw(requestWithConnect);

    const phase2Call = vi.mocked(configureAssociationsAndPropagations).mock.calls[0];
    const phase2Request = phase2Call[0];
    expect(phase2Request.configuration.attachments).toHaveLength(1); // original only, no Connect
  });

  it('should not merge Connect into Phase 2 when dry run (skipped)', async () => {
    const requestWithConnect = {
      ...baseRequest,
      dryRun: true,
      configuration: {
        ...baseRequest.configuration,
        connectAttachments: [
          {
            name: 'my-connect',
            transitGateway: 'main-tgw',
            transportAttachmentType: 'vpc' as const,
            transportName: 'shared-vpc',
            transportAccountId: '111111111111',
            options: { protocol: 'gre' as const },
            routeTableAssociations: ['core-rt'],
            routeTablePropagations: ['core-rt'],
          },
        ],
      },
    };

    vi.mocked(TransitGatewayConnect.createConnectAttachments).mockResolvedValue([
      {
        operation: 'skipped',
        region: 'us-east-1',
        tgwName: 'main-tgw',
        connectName: 'my-connect',
        connectAttachmentId: '',
      },
    ]);

    await configureTgw(requestWithConnect);

    const phase2Call = vi.mocked(configureAssociationsAndPropagations).mock.calls[0];
    const phase2Request = phase2Call[0];
    expect(phase2Request.configuration.attachments).toHaveLength(1); // original only
  });

  it('should add Connect attachment ID to resolvedContext', async () => {
    const requestWithConnect = {
      ...baseRequest,
      configuration: {
        ...baseRequest.configuration,
        connectAttachments: [
          {
            name: 'my-connect',
            transitGateway: 'main-tgw',
            transportAttachmentType: 'vpc' as const,
            transportName: 'shared-vpc',
            transportAccountId: '111111111111',
            options: { protocol: 'gre' as const },
            routeTableAssociations: ['core-rt'],
            routeTablePropagations: [],
          },
        ],
      },
    };

    vi.mocked(TransitGatewayConnect.createConnectAttachments).mockResolvedValue([
      {
        operation: 'created',
        region: 'us-east-1',
        tgwName: 'main-tgw',
        connectName: 'my-connect',
        connectAttachmentId: 'tgw-attach-connect-456',
      },
    ]);

    await configureTgw(requestWithConnect);

    const phase2Call = vi.mocked(configureAssociationsAndPropagations).mock.calls[0];
    const phase2Context = phase2Call[1] as ITgwResolvedContext;
    expect(phase2Context.attachmentIds.get('main-tgw_111111111111_connect-my-connect')).toBe('tgw-attach-connect-456');
  });

  it('should NOT merge deleted Connect into Phase 2 (B3 — deleted attachments must not receive RT assoc/prop)', async () => {
    const requestWithConnect = {
      ...baseRequest,
      configuration: {
        ...baseRequest.configuration,
        connectAttachments: [
          {
            name: 'keep-me',
            transitGateway: 'main-tgw',
            transportAttachmentType: 'vpc' as const,
            transportName: 'shared-vpc',
            transportAccountId: '111111111111',
            options: { protocol: 'gre' as const },
            routeTableAssociations: ['core-rt'],
            routeTablePropagations: [],
          },
        ],
      },
    };

    // createConnectAttachments returns a 'created' response for keep-me
    vi.mocked(TransitGatewayConnect.createConnectAttachments).mockResolvedValue([
      {
        operation: 'created',
        region: 'us-east-1',
        tgwName: 'main-tgw',
        connectName: 'keep-me',
        connectAttachmentId: 'tgw-attach-keep',
      },
    ]);
    // deleteStaleConnectAttachments returns a 'deleted' response for a stale Connect
    // (simulating that a previously-managed Connect was removed from config and cleaned up)
    vi.mocked(TransitGatewayConnect.deleteStaleConnectAttachments).mockResolvedValue([
      {
        operation: 'deleted',
        region: 'us-east-1',
        tgwName: 'main-tgw',
        connectName: 'stale-connect',
        connectAttachmentId: 'tgw-attach-stale',
      },
    ]);

    await configureTgw(requestWithConnect);

    const phase2Call = vi.mocked(configureAssociationsAndPropagations).mock.calls[0];
    const phase2Request = phase2Call[0];
    // Only the 'keep-me' Connect should be merged into Phase 2 — the deleted one must be excluded
    const connectAttachments = phase2Request.configuration.attachments.filter(a => a.type === 'connect');
    expect(connectAttachments).toHaveLength(1);
    expect(connectAttachments[0].name).toBe('connect-keep-me');
  });

  it('should include connects segment in summary text (I5b)', async () => {
    const requestWithConnect = {
      ...baseRequest,
      configuration: {
        ...baseRequest.configuration,
        connectAttachments: [
          {
            name: 'my-connect',
            transitGateway: 'main-tgw',
            transportAttachmentType: 'vpc' as const,
            transportName: 'shared-vpc',
            transportAccountId: '111111111111',
            options: { protocol: 'gre' as const },
          },
        ],
      },
    };

    vi.mocked(TransitGatewayConnect.createConnectAttachments).mockResolvedValue([
      {
        operation: 'created',
        region: 'us-east-1',
        tgwName: 'main-tgw',
        connectName: 'my-connect',
        connectAttachmentId: 'tgw-attach-new',
      },
    ]);
    vi.mocked(TransitGatewayConnect.deleteStaleConnectAttachments).mockResolvedValue([
      {
        operation: 'deleted',
        region: 'us-east-1',
        tgwName: 'main-tgw',
        connectName: 'stale',
        connectAttachmentId: 'tgw-attach-stale',
      },
    ]);

    const result = await configureTgw(requestWithConnect);

    // B4 + I5b: summary text must include the connects segment with both created and deleted counts
    expect(result.summary).toMatch(/connects\(\+1 -1 =0\)/);
  });

  it('should resolve Connect config by (tgwName, connectName) not name alone — collision across TGWs (Wenjie H review)', async () => {
    // Two TGWs, each with a Connect named 'edge-connect', but different RT config + transport account.
    // If the lookup used name alone, both responses would resolve to configA and Phase 2 would get the
    // wrong RT lists and the wrong transportAccountId for the second TGW's attachment key.
    const requestWithCollidingNames = {
      ...baseRequest,
      configuration: {
        ...baseRequest.configuration,
        transitGateways: [
          { name: 'tgw-a', accountId: '111111111111', region: 'us-east-1', routeTables: [{ name: 'rt-a' }] },
          { name: 'tgw-b', accountId: '222222222222', region: 'us-east-1', routeTables: [{ name: 'rt-b' }] },
        ],
        connectAttachments: [
          {
            name: 'edge-connect',
            transitGateway: 'tgw-a',
            transportAttachmentType: 'vpc' as const,
            transportName: 'vpc-a',
            transportAccountId: '111111111111',
            options: { protocol: 'gre' as const },
            routeTableAssociations: ['rt-a'],
            routeTablePropagations: [],
          },
          {
            name: 'edge-connect',
            transitGateway: 'tgw-b',
            transportAttachmentType: 'vpc' as const,
            transportName: 'vpc-b',
            transportAccountId: '222222222222',
            options: { protocol: 'gre' as const },
            routeTableAssociations: ['rt-b'],
            routeTablePropagations: [],
          },
        ],
      },
    };

    vi.mocked(TransitGatewayConnect.createConnectAttachments).mockResolvedValue([
      {
        operation: 'created',
        region: 'us-east-1',
        tgwName: 'tgw-a',
        connectName: 'edge-connect',
        connectAttachmentId: 'tgw-attach-on-tgw-a',
      },
      {
        operation: 'created',
        region: 'us-east-1',
        tgwName: 'tgw-b',
        connectName: 'edge-connect',
        connectAttachmentId: 'tgw-attach-on-tgw-b',
      },
    ]);

    await configureTgw(requestWithCollidingNames);

    const phase2Call = vi.mocked(configureAssociationsAndPropagations).mock.calls[0];
    const phase2Request = phase2Call[0];
    const phase2Context = phase2Call[1] as ITgwResolvedContext;

    // Both Connects should appear in Phase 2 with their OWN RT config and transportAccountId
    const connects = phase2Request.configuration.attachments.filter(a => a.type === 'connect');
    expect(connects).toHaveLength(2);

    const tgwAConnect = connects.find(c => c.transitGateway === 'tgw-a');
    const tgwBConnect = connects.find(c => c.transitGateway === 'tgw-b');

    expect(tgwAConnect).toBeDefined();
    expect(tgwAConnect?.routeTableAssociations).toEqual(['rt-a']);
    expect(tgwAConnect?.accountId).toBe('111111111111'); // tgw-a's transportAccountId

    expect(tgwBConnect).toBeDefined();
    expect(tgwBConnect?.routeTableAssociations).toEqual(['rt-b']);
    expect(tgwBConnect?.accountId).toBe('222222222222'); // tgw-b's transportAccountId — would be WRONG if bug regressed

    // Attachment keys should also be namespaced correctly — critical for Phase 2 lookup
    expect(phase2Context.attachmentIds.get('tgw-a_111111111111_connect-edge-connect')).toBe('tgw-attach-on-tgw-a');
    expect(phase2Context.attachmentIds.get('tgw-b_222222222222_connect-edge-connect')).toBe('tgw-attach-on-tgw-b');
  });

  it('should return FAILED on Connect error', async () => {
    vi.mocked(TransitGatewayConnect.createConnectAttachments).mockRejectedValue(
      new Error('Transport attachment not found'),
    );

    const result = await configureTgw(baseRequest);
    expect(result.status).toBe('failed');
    expect(result.summary).toContain('Transport attachment not found');
  });

  it('should return FAILED on resolver error', async () => {
    vi.mocked(TransitGatewayAttachmentLookup.resolveAttachments).mockRejectedValue(
      new Error('SSM parameter not found'),
    );

    const result = await configureTgw(baseRequest);

    expect(result.status).toBe('failed');
    expect(result.summary).toContain('SSM parameter not found');
    expect(result.error?.message).toBe('SSM parameter not found');
  });

  it('should return FAILED on associations error without ownedResources in error response', async () => {
    vi.mocked(configureAssociationsAndPropagations).mockRejectedValue(new Error('Route table ID not resolved'));

    const result = await configureTgw(baseRequest);

    expect(result.status).toBe('failed');
    expect(result.error?.message).toBe('Route table ID not resolved');
    expect(result.response).toBeUndefined();
  });

  it('should return FAILED with partial response when an association item fails', async () => {
    vi.mocked(configureAssociationsAndPropagations).mockResolvedValue({
      associations: [
        {
          operation: 'deleted',
          region: 'us-east-1',
          tgwName: 'main-tgw',
          routeTableName: 'old-rt',
          attachmentType: 'vpc',
          attachmentName: 'shared-vpc',
        },
        {
          operation: 'failed',
          region: 'us-east-1',
          tgwName: 'main-tgw',
          routeTableName: 'core-rt',
          attachmentType: 'vpc',
          attachmentName: 'shared-vpc',
          errorMessage: 'Attachment did not associate to core-rt',
        },
      ],
      propagations: [],
    });

    const result = await configureTgw(baseRequest);

    expect(result.status).toBe('failed');
    expect(result.response?.associations).toHaveLength(2);
    expect(result.error?.message).toContain('1 TGW route table association operation(s) failed');
  });

  it('should pass dryRun through to response', async () => {
    const request = { ...baseRequest, dryRun: true };
    const result = await configureTgw(request);

    expect(result.dryRun).toBe(true);
    expect(result.summary).toContain('Dry run');
  });

  it('should use moduleName from request', async () => {
    const request = { ...baseRequest, moduleName: 'custom-tgw' };
    const result = await configureTgw(request);

    expect(result.moduleName).toBe('custom-tgw');
  });

  it('should default moduleName to transit-gateway', async () => {
    const request = { ...baseRequest, moduleName: undefined } as unknown as ITgwModuleRequest;
    const result = await configureTgw(request);

    expect(result.moduleName).toBe('transit-gateway');
  });

  describe('region boundary validation', () => {
    it('should fail when TGW region is not in boundary regions', async () => {
      const request: ITgwModuleRequest = {
        ...baseRequest,
        configuration: {
          ...baseRequest.configuration,
          boundary: { regions: ['us-east-1', 'us-west-2'] },
          transitGateways: [
            { name: 'bad-tgw', accountId: '111111111111', region: 'ap-southeast-3', routeTables: [{ name: 'rt' }] },
          ],
        },
      };

      const result = await configureTgw(request);

      expect(result.status).toBe('failed');
      expect(result.error?.message).toContain('ap-southeast-3');
      expect(result.error?.message).toContain('not in enabled regions');
      expect(TransitGatewayAttachmentLookup.resolveAttachments).not.toHaveBeenCalled();
    });

    it('should pass when TGW region is in boundary regions', async () => {
      const request: ITgwModuleRequest = {
        ...baseRequest,
        configuration: {
          ...baseRequest.configuration,
          boundary: { regions: ['us-east-1', 'us-west-2'] },
        },
      };

      const result = await configureTgw(request);

      expect(result.status).toBe('completed');
    });

    it('should skip validation when no boundary regions provided', async () => {
      const request: ITgwModuleRequest = {
        ...baseRequest,
        configuration: {
          ...baseRequest.configuration,
          boundary: undefined,
        },
      };

      const result = await configureTgw(request);

      expect(result.status).toBe('completed');
    });

    it('should skip validation when boundary regions is empty', async () => {
      const request: ITgwModuleRequest = {
        ...baseRequest,
        configuration: {
          ...baseRequest.configuration,
          boundary: { regions: [] },
        },
      };

      const result = await configureTgw(request);

      expect(result.status).toBe('completed');
    });

    it('should report all invalid TGWs in error message', async () => {
      const request: ITgwModuleRequest = {
        ...baseRequest,
        configuration: {
          ...baseRequest.configuration,
          boundary: { regions: ['us-east-1'] },
          transitGateways: [
            { name: 'tgw-bad-1', accountId: '111111111111', region: 'eu-west-1', routeTables: [{ name: 'rt' }] },
            { name: 'tgw-bad-2', accountId: '111111111111', region: 'ap-southeast-3', routeTables: [{ name: 'rt' }] },
          ],
        },
      };

      const result = await configureTgw(request);

      expect(result.status).toBe('failed');
      expect(result.error?.message).toContain('tgw-bad-1');
      expect(result.error?.message).toContain('tgw-bad-2');
    });
  });

  it('should log deleted associations, created/deleted propagations, deleted DX associations, and applied changes (non-dry-run)', async () => {
    vi.mocked(configureAssociationsAndPropagations).mockResolvedValue({
      associations: [
        {
          operation: 'created',
          region: 'us-east-1',
          tgwName: 'main-tgw',
          routeTableName: 'core-rt',
          attachmentType: 'vpc',
          attachmentName: 'vpc-1',
        },
        {
          operation: 'deleted',
          region: 'us-east-1',
          tgwName: 'main-tgw',
          routeTableName: 'core-rt',
          attachmentType: 'vpc',
          attachmentName: 'vpc-2',
        },
      ],
      propagations: [
        {
          operation: 'created',
          region: 'us-east-1',
          tgwName: 'main-tgw',
          routeTableName: 'core-rt',
          attachmentType: 'vpc',
          attachmentName: 'vpc-1',
        },
        {
          operation: 'deleted',
          region: 'us-east-1',
          tgwName: 'main-tgw',
          routeTableName: 'core-rt',
          attachmentType: 'vpc',
          attachmentName: 'vpc-2',
        },
      ],
    });
    vi.mocked(DirectConnectGatewayAssociation.resolveDxGatewayAssociations).mockResolvedValue({
      dxResponses: [
        {
          operation: 'deleted',
          region: 'us-east-1',
          tgwName: 'main-tgw',
          dxGatewayName: 'dxgw-1',
          associationType: 'direct',
        },
      ],
      dxAttachments: [],
    });

    const result = await configureTgw({ ...baseRequest, dryRun: false });

    expect(result.status).toBe('completed');
    expect(result.summary).toContain('+1');
    expect(result.summary).toContain('-1');
    expect(result.response?.dxAssociations).toHaveLength(1);
  });

  it('should include updated DX associations in summary', async () => {
    vi.mocked(configureAssociationsAndPropagations).mockResolvedValue({
      associations: [],
      propagations: [],
    });
    vi.mocked(DirectConnectGatewayAssociation.resolveDxGatewayAssociations).mockResolvedValue({
      dxResponses: [
        {
          operation: 'updated',
          region: 'us-east-1',
          tgwName: 'main-tgw',
          dxGatewayName: 'dxgw-1',
          associationType: 'direct',
        },
      ],
      dxAttachments: [],
    });

    const result = await configureTgw({ ...baseRequest, dryRun: false });

    expect(result.status).toBe('completed');
    expect(result.summary).toContain('~1');
    expect(result.response?.dxAssociations).toHaveLength(1);
  });

  it('should log would-be changes in dry-run mode', async () => {
    vi.mocked(configureAssociationsAndPropagations).mockResolvedValue({
      associations: [
        {
          operation: 'created',
          region: 'us-east-1',
          tgwName: 'main-tgw',
          routeTableName: 'core-rt',
          attachmentType: 'vpc',
          attachmentName: 'vpc-1',
        },
      ],
      propagations: [],
    });
    vi.mocked(DirectConnectGatewayAssociation.resolveDxGatewayAssociations).mockResolvedValue({
      dxResponses: [],
      dxAttachments: [],
    });

    const result = await configureTgw({ ...baseRequest, dryRun: true });

    expect(result.status).toBe('completed');
    expect(result.dryRun).toBe(true);
    expect(result.summary).toContain('Dry run');
  });

  it('should return FAILED on DX Gateway error', async () => {
    vi.mocked(DirectConnectGatewayAssociation.resolveDxGatewayAssociations).mockRejectedValue(
      new Error('DX Gateway resolution requires homeRegion in configuration'),
    );

    const result = await configureTgw(baseRequest);

    expect(result.status).toBe('failed');
    expect(result.error?.message).toBe('DX Gateway resolution requires homeRegion in configuration');
  });
});
