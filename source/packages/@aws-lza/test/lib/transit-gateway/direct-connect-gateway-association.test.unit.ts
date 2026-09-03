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

const mockDxSend = vi.fn();
const mockEc2Send = vi.fn();

const mockLogger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('../../../lib/common/logger', () => ({
  createLogger: vi.fn(() => mockLogger),
}));

vi.mock('../../../lib/common/utility', () => ({
  executeApi: vi.fn((_name: string, _params: unknown, fn: () => Promise<unknown>) => fn()),
  setRetryStrategy: vi.fn(),
}));

vi.mock('../../../lib/common/sts-functions', () => ({
  getCredentials: vi.fn().mockResolvedValue({ accessKeyId: 'mock', secretAccessKey: 'mock', sessionToken: 'mock' }),
}));

const mockSsmHandler = vi.fn();
vi.mock('../../../lib/aws-ssm/get-parameters', () => ({
  GetSsmParametersValueModule: vi.fn(function () {
    return { handler: mockSsmHandler };
  }),
}));

vi.mock('@aws-sdk/client-direct-connect', () => ({
  DirectConnectClient: vi.fn(function () {
    return { send: mockDxSend };
  }),
  CreateDirectConnectGatewayAssociationCommand: vi.fn(),
  CreateDirectConnectGatewayAssociationProposalCommand: vi.fn(),
  DeleteDirectConnectGatewayAssociationCommand: vi.fn(),
  DescribeDirectConnectGatewayAssociationsCommand: vi.fn(),
  UpdateDirectConnectGatewayAssociationCommand: vi.fn(),
}));

vi.mock('@aws-sdk/client-ec2', () => ({
  EC2Client: vi.fn(function () {
    return { send: mockEc2Send };
  }),
  DescribeTransitGatewayAttachmentsCommand: vi.fn(),
}));

import { DirectConnectGatewayAssociation } from '../../../lib/transit-gateway/direct-connect-gateway-association';
import {
  DxAssociationState,
  ITgwModuleRequest,
  ITgwResolvedContext,
  TgwAttachmentState,
} from '../../../lib/transit-gateway/interfaces';

const MAX_POLL_RETRIES = 13;

function makeRequest(overrides: Partial<ITgwModuleRequest['configuration']> = {}): ITgwModuleRequest {
  return {
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
      homeRegion: 'us-east-1',
      transitGateways: [
        { name: 'main-tgw', accountId: '111111111111', region: 'us-east-1', routeTables: [{ name: 'core-rt' }] },
      ],
      attachments: [],
      directConnectGateways: [
        {
          name: 'dxgw-1',
          accountId: '111111111111',
          transitGatewayAssociations: [
            {
              name: 'main-tgw',
              accountId: '111111111111',
              allowedPrefixes: ['10.0.0.0/8'],
              routeTableAssociations: ['core-rt'],
              routeTablePropagations: ['core-rt'],
            },
          ],
        },
      ],
      dataSources: { ssmParameterPrefix: '/accelerator' },
      ...overrides,
    },
  };
}

function makeContext(): ITgwResolvedContext {
  return {
    transitGatewayIds: new Map([['main-tgw', 'tgw-0abc']]),
    routeTableIds: new Map([['main-tgw_core-rt', 'tgw-rtb-0def']]),
    attachmentIds: new Map(),
  };
}

function mockSsmResolveDxGatewayId(dxgwId = 'dxgw-111') {
  mockSsmHandler.mockResolvedValueOnce([
    { name: '/accelerator/network/directConnectGateways/dxgw-1/id', value: dxgwId, exists: true },
  ]);
}

/**
 * Mock the deletion phase's DescribeDirectConnectGatewayAssociations call.
 * The deletion phase runs once per DX gateway AFTER all creation work items.
 * Returns empty associations (nothing to delete) for tests focused on creation/exists flows.
 */
function mockDeletionPhaseDescribe(count = 1) {
  for (let i = 0; i < count; i++) {
    mockDxSend.mockResolvedValueOnce({ directConnectGatewayAssociations: [] });
  }
}

/**
 * Mock call sequence for same-account create flow:
 *   1. DX: findExistingAssociation (DescribeDirectConnectGatewayAssociations)
 *   2. DX: CreateDirectConnectGatewayAssociation
 *   3. DX: pollAssociationState (DescribeDirectConnectGatewayAssociations)
 *   4. EC2: getDxAttachmentId (DescribeTransitGatewayAttachments)
 *   5. DX: deletion phase DescribeDirectConnectGatewayAssociations (empty)
 */
function mockSameAccountCreateFlow(attachmentId = 'tgw-attach-dx1') {
  mockDxSend.mockResolvedValueOnce({ directConnectGatewayAssociations: [] });
  mockDxSend.mockResolvedValueOnce({
    directConnectGatewayAssociation: { associationId: 'assoc-new' },
  });
  mockDxSend.mockResolvedValueOnce({
    directConnectGatewayAssociations: [{ associationState: DxAssociationState.ASSOCIATED }],
  });
  mockEc2Send.mockResolvedValueOnce({
    TransitGatewayAttachments: [{ TransitGatewayAttachmentId: attachmentId, State: TgwAttachmentState.AVAILABLE }],
  });
  mockDeletionPhaseDescribe();
}

/**
 * Mock call sequence for same-account existing (associated) flow:
 *   1. DX: findExistingAssociation → associated
 *   2. EC2: getDxAttachmentId
 *   3. DX: deletion phase DescribeDirectConnectGatewayAssociations (empty)
 */
function mockSameAccountExistsFlow(attachmentId = 'tgw-attach-existing', allowedPrefixes = ['10.0.0.0/8']) {
  mockDxSend.mockResolvedValueOnce({
    directConnectGatewayAssociations: [
      {
        associatedGateway: { id: 'tgw-0abc' },
        associationId: 'assoc-123',
        associationState: DxAssociationState.ASSOCIATED,
        allowedPrefixesToDirectConnectGateway: allowedPrefixes.map(cidr => ({ cidr })),
      },
    ],
  });
  mockEc2Send.mockResolvedValueOnce({
    TransitGatewayAttachments: [{ TransitGatewayAttachmentId: attachmentId, State: TgwAttachmentState.AVAILABLE }],
  });
  mockDeletionPhaseDescribe();
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('DirectConnectGatewayAssociation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDxSend.mockReset();
    mockEc2Send.mockReset();
    mockSsmHandler.mockReset();
  });

  describe('early exits', () => {
    it('should return empty when no DX gateways configured', async () => {
      const request = makeRequest({ directConnectGateways: [] });
      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(request, makeContext(), 'test');

      expect(result.dxResponses).toHaveLength(0);
      expect(result.dxAttachments).toHaveLength(0);
    });

    it('should return empty when directConnectGateways is undefined', async () => {
      const request = makeRequest({ directConnectGateways: undefined });
      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(request, makeContext(), 'test');

      expect(result.dxResponses).toHaveLength(0);
      expect(result.dxAttachments).toHaveLength(0);
    });

    it('should throw when ssmParameterPrefix is missing', async () => {
      const request = makeRequest({ dataSources: {} });
      await expect(
        DirectConnectGatewayAssociation.resolveDxGatewayAssociations(request, makeContext(), 'test'),
      ).rejects.toThrow('DX Gateway resolution requires dataSources.ssmParameterPrefix');
    });

    it('should throw when homeRegion is missing', async () => {
      const request = makeRequest({ homeRegion: undefined });
      await expect(
        DirectConnectGatewayAssociation.resolveDxGatewayAssociations(request, makeContext(), 'test'),
      ).rejects.toThrow('DX Gateway resolution requires homeRegion in configuration');
    });
  });

  describe('SSM resolution', () => {
    it('should resolve DX Gateway IDs from SSM in local account', async () => {
      mockSsmResolveDxGatewayId();
      mockSameAccountCreateFlow();

      await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(makeRequest(), makeContext(), 'test');

      expect(mockSsmHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'get-parameters',
          partition: 'aws',
          region: 'us-east-1',
          solutionId: 'AwsSolution/SO0199',
          configuration: expect.arrayContaining([
            expect.objectContaining({
              name: '/accelerator/network/directConnectGateways/dxgw-1/id',
              region: 'us-east-1',
              assumeRoleArn: undefined,
            }),
          ]),
        }),
      );
    });

    it('should throw when SSM parameter not found', async () => {
      mockSsmHandler.mockResolvedValueOnce([
        { name: '/accelerator/network/directConnectGateways/dxgw-1/id', exists: false },
      ]);

      await expect(
        DirectConnectGatewayAssociation.resolveDxGatewayAssociations(makeRequest(), makeContext(), 'test'),
      ).rejects.toThrow('SSM parameter not found');
    });

    it('should use cross-account credentials for DX GW in different account', async () => {
      const request = makeRequest({
        directConnectGateways: [
          {
            name: 'dxgw-1',
            accountId: '999999999999',
            transitGatewayAssociations: [
              { name: 'main-tgw', accountId: '999999999999', allowedPrefixes: ['10.0.0.0/8'] },
            ],
          },
        ],
      });

      mockSsmHandler.mockResolvedValueOnce([
        { name: '/accelerator/network/directConnectGateways/dxgw-1/id', value: 'dxgw-cross', exists: true },
      ]);
      mockSameAccountCreateFlow();

      await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(request, makeContext(), 'test');

      expect(mockSsmHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.arrayContaining([
            expect.objectContaining({
              assumeRoleArn: 'arn:aws:iam::999999999999:role/AWSControlTowerExecution',
            }),
          ]),
        }),
      );
    });
  });

  describe('same-account - create new association', () => {
    it('should create association, poll, and return attachment ID', async () => {
      mockSsmResolveDxGatewayId();
      mockSameAccountCreateFlow('tgw-attach-dx1');

      const context = makeContext();
      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(makeRequest(), context, 'test');

      expect(result.dxResponses).toHaveLength(1);
      expect(result.dxResponses[0]).toEqual({
        operation: 'created',
        region: 'us-east-1',
        tgwName: 'main-tgw',
        dxGatewayName: 'dxgw-1',
        associationType: 'direct',
      });
      expect(result.dxAttachments).toHaveLength(1);
      expect(result.dxAttachments[0]).toEqual(
        expect.objectContaining({
          type: 'dxGateway',
          name: 'dxgw-dxgw-1',
          transitGateway: 'main-tgw',
          routeTableAssociations: ['core-rt'],
          routeTablePropagations: ['core-rt'],
        }),
      );
      expect(context.attachmentIds.get('main-tgw_111111111111_dxgw-dxgw-1')).toBe('tgw-attach-dx1');
    });

    it('should throw when create returns no associationId', async () => {
      mockSsmResolveDxGatewayId();

      mockDxSend.mockResolvedValueOnce({ directConnectGatewayAssociations: [] });
      mockDxSend.mockResolvedValueOnce({ directConnectGatewayAssociation: {} });

      await expect(
        DirectConnectGatewayAssociation.resolveDxGatewayAssociations(makeRequest(), makeContext(), 'test'),
      ).rejects.toThrow('Failed to create DX Gateway association');
    });

    it('should throw when poll times out', async () => {
      const sleepSpy = vi.spyOn(DirectConnectGatewayAssociation as never, 'sleep').mockResolvedValue(undefined);

      mockSsmResolveDxGatewayId();
      mockDxSend.mockResolvedValueOnce({ directConnectGatewayAssociations: [] });
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociation: { associationId: 'assoc-slow' },
      });

      for (let i = 0; i < MAX_POLL_RETRIES; i++) {
        mockDxSend.mockResolvedValueOnce({
          directConnectGatewayAssociations: [{ associationState: DxAssociationState.ASSOCIATING }],
        });
      }

      await expect(
        DirectConnectGatewayAssociation.resolveDxGatewayAssociations(makeRequest(), makeContext(), 'test'),
      ).rejects.toThrow('did not reach associated state within timeout');

      sleepSpy.mockRestore();
    });

    it('should throw when poll detects terminal failure state', async () => {
      const sleepSpy = vi.spyOn(DirectConnectGatewayAssociation as never, 'sleep').mockResolvedValue(undefined);

      mockSsmResolveDxGatewayId();

      // findExisting → no existing
      mockDxSend.mockResolvedValueOnce({ directConnectGatewayAssociations: [] });

      // create → new association
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociation: { associationId: 'assoc-new' },
      });

      // poll → terminal failure state (disassociated instead of associated)
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [{ associationState: DxAssociationState.DISASSOCIATED }],
      });

      await expect(
        DirectConnectGatewayAssociation.resolveDxGatewayAssociations(makeRequest(), makeContext(), 'test'),
      ).rejects.toThrow('entered terminal state: disassociated');

      sleepSpy.mockRestore();
    });

    it('should throw when DX attachment not found after association', async () => {
      mockSsmResolveDxGatewayId();

      mockDxSend.mockResolvedValueOnce({ directConnectGatewayAssociations: [] });
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociation: { associationId: 'assoc-new' },
      });
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [{ associationState: DxAssociationState.ASSOCIATED }],
      });
      mockEc2Send.mockResolvedValueOnce({ TransitGatewayAttachments: [] });

      await expect(
        DirectConnectGatewayAssociation.resolveDxGatewayAssociations(makeRequest(), makeContext(), 'test'),
      ).rejects.toThrow('TGW attachment not found for DX Gateway');
    });
  });

  describe('same-account - existing association', () => {
    it('should return exists with attachment ID when already associated', async () => {
      mockSsmResolveDxGatewayId();
      mockSameAccountExistsFlow('tgw-attach-existing');

      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(
        makeRequest(),
        makeContext(),
        'test',
      );

      expect(result.dxResponses[0]).toEqual(
        expect.objectContaining({ operation: 'exists', associationType: 'direct' }),
      );
      expect(result.dxAttachments).toHaveLength(1);
    });

    it('should poll and return when in associating state', async () => {
      const sleepSpy = vi.spyOn(DirectConnectGatewayAssociation as never, 'sleep').mockResolvedValue(undefined);

      mockSsmResolveDxGatewayId();

      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [
          {
            associatedGateway: { id: 'tgw-0abc' },
            associationId: 'assoc-inprogress',
            associationState: DxAssociationState.ASSOCIATING,
          },
        ],
      });

      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [{ associationState: DxAssociationState.ASSOCIATED }],
      });

      mockEc2Send.mockResolvedValueOnce({
        TransitGatewayAttachments: [
          { TransitGatewayAttachmentId: 'tgw-attach-polled', State: TgwAttachmentState.AVAILABLE },
        ],
      });
      mockDeletionPhaseDescribe();

      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(
        makeRequest(),
        makeContext(),
        'test',
      );

      expect(result.dxResponses[0]).toEqual(
        expect.objectContaining({ operation: 'exists', associationType: 'direct' }),
      );
      expect(result.dxAttachments).toHaveLength(1);

      sleepSpy.mockRestore();
    });

    it('should poll and return when in updating state', async () => {
      const sleepSpy = vi.spyOn(DirectConnectGatewayAssociation as never, 'sleep').mockResolvedValue(undefined);

      mockSsmResolveDxGatewayId();

      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [
          {
            associatedGateway: { id: 'tgw-0abc' },
            associationId: 'assoc-updating',
            associationState: DxAssociationState.UPDATING,
          },
        ],
      });

      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [{ associationState: DxAssociationState.ASSOCIATED }],
      });

      mockEc2Send.mockResolvedValueOnce({
        TransitGatewayAttachments: [
          { TransitGatewayAttachmentId: 'tgw-attach-updated', State: TgwAttachmentState.AVAILABLE },
        ],
      });
      mockDeletionPhaseDescribe();

      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(
        makeRequest(),
        makeContext(),
        'test',
      );

      expect(result.dxResponses[0]).toEqual(
        expect.objectContaining({ operation: 'exists', associationType: 'direct' }),
      );
      expect(result.dxAttachments).toHaveLength(1);

      sleepSpy.mockRestore();
    });

    it('should invoke real sleep during poll retry loop', async () => {
      vi.useFakeTimers();

      mockSsmResolveDxGatewayId();
      // findExistingAssociation returns 'associating'
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [
          { associatedGateway: { id: 'tgw-0abc' }, associationId: 'assoc-poll', associationState: 'associating' },
        ],
      });
      // First poll: still associating → triggers sleep
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [{ associationState: 'associating' }],
      });
      // Second poll: associated
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [{ associationState: 'associated' }],
      });
      // getDxAttachmentId
      mockEc2Send.mockResolvedValueOnce({
        TransitGatewayAttachments: [{ TransitGatewayAttachmentId: 'tgw-attach-poll', State: 'available' }],
      });
      mockDeletionPhaseDescribe();

      const promise = DirectConnectGatewayAssociation.resolveDxGatewayAssociations(
        makeRequest(),
        makeContext(),
        'test',
      );
      // Advance past the 60s sleep to unblock the poll loop
      await vi.advanceTimersByTimeAsync(60_000);
      const result = await promise;

      expect(result.dxResponses[0]).toEqual(
        expect.objectContaining({ operation: 'exists', associationType: 'direct' }),
      );
      expect(result.dxAttachments).toHaveLength(1);

      vi.useRealTimers();
    });
  });

  describe('same-account - prefix update on existing association', () => {
    it('should update allowed prefixes when they differ from desired', async () => {
      mockSsmResolveDxGatewayId();
      // findExistingAssociation returns associated with old prefixes
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [
          {
            associatedGateway: { id: 'tgw-0abc' },
            associationId: 'assoc-123',
            associationState: 'associated',
            allowedPrefixesToDirectConnectGateway: [{ cidr: '192.168.0.0/16' }],
          },
        ],
      });
      // UpdateDirectConnectGatewayAssociationCommand
      mockDxSend.mockResolvedValueOnce({});
      // Poll after update returns associated
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [{ associationState: 'associated' }],
      });
      // getDxAttachmentId
      mockEc2Send.mockResolvedValueOnce({
        TransitGatewayAttachments: [{ TransitGatewayAttachmentId: 'tgw-attach-updated', State: 'available' }],
      });
      mockDeletionPhaseDescribe();

      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(
        makeRequest(),
        makeContext(),
        'test',
      );

      expect(result.dxResponses[0]).toEqual(expect.objectContaining({ operation: 'updated' }));
      // SSM(1) + Describe(1) + Update(1) + Poll(1) + DeletionDescribe(1) = 4 DX calls
      expect(mockDxSend).toHaveBeenCalledTimes(4);
    });

    it('should throw when prefix update poll detects terminal failure state', async () => {
      const sleepSpy = vi.spyOn(DirectConnectGatewayAssociation as never, 'sleep').mockResolvedValue(undefined);

      mockSsmResolveDxGatewayId();
      // findExistingAssociation returns associated with different prefixes
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [
          {
            associatedGateway: { id: 'tgw-0abc' },
            associationId: 'assoc-123',
            associationState: 'associated',
            allowedPrefixesToDirectConnectGateway: [{ cidr: '192.168.0.0/16' }],
          },
        ],
      });
      // UpdateDirectConnectGatewayAssociationCommand
      mockDxSend.mockResolvedValueOnce({});
      // Poll returns terminal failure state (disassociated instead of associated)
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [{ associationState: DxAssociationState.DISASSOCIATED }],
      });

      await expect(
        DirectConnectGatewayAssociation.resolveDxGatewayAssociations(makeRequest(), makeContext(), 'test'),
      ).rejects.toThrow('entered terminal state: disassociated');

      sleepSpy.mockRestore();
    });

    it('should not call update when prefixes already match', async () => {
      mockSsmResolveDxGatewayId();
      mockSameAccountExistsFlow('tgw-attach-existing', ['10.0.0.0/8']);

      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(
        makeRequest(),
        makeContext(),
        'test',
      );

      expect(result.dxResponses[0]).toEqual(expect.objectContaining({ operation: 'exists' }));
      // SSM(1) + Describe(1) + DeletionDescribe(1) = 2 DX calls (no Update)
      expect(mockDxSend).toHaveBeenCalledTimes(2);
    });

    it('should skip update in dry-run mode when prefixes differ', async () => {
      mockSsmResolveDxGatewayId();
      // findExistingAssociation returns associated with different prefixes
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [
          {
            associatedGateway: { id: 'tgw-0abc' },
            associationId: 'assoc-123',
            associationState: 'associated',
            allowedPrefixesToDirectConnectGateway: [{ cidr: '192.168.0.0/16' }],
          },
        ],
      });
      // getDxAttachmentId
      mockEc2Send.mockResolvedValueOnce({
        TransitGatewayAttachments: [{ TransitGatewayAttachmentId: 'tgw-attach-dry', State: 'available' }],
      });
      mockDeletionPhaseDescribe();

      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(
        { ...makeRequest(), dryRun: true },
        makeContext(),
        'test',
      );

      expect(result.dxResponses[0]).toEqual(expect.objectContaining({ operation: 'updated' }));
      // SSM(1) + Describe(1) + DeletionDescribe(1) = 2 DX calls (no Update, no Poll)
      expect(mockDxSend).toHaveBeenCalledTimes(2);
    });
  });

  describe('same-account - dry run', () => {
    it('should return created without mutating when no existing association', async () => {
      mockSsmResolveDxGatewayId();
      mockDxSend.mockResolvedValueOnce({ directConnectGatewayAssociations: [] });
      mockDeletionPhaseDescribe();

      const request = { ...makeRequest(), dryRun: true };
      const context = makeContext();
      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(request, context, 'test');

      expect(result.dxResponses[0]).toEqual(
        expect.objectContaining({ operation: 'created', associationType: 'direct' }),
      );
      expect(result.dxAttachments).toHaveLength(1);
      expect(result.dxAttachments[0]).toEqual(
        expect.objectContaining({ type: 'dxGateway', name: 'dxgw-dxgw-1', transitGateway: 'main-tgw' }),
      );
      expect(context.attachmentIds.get('main-tgw_111111111111_dxgw-dxgw-1')).toBe(
        'placeholder-dxgw-dxgw-1-will-be-populated-on-deploy',
      );
      expect(mockEc2Send).not.toHaveBeenCalled();

      expect(mockDxSend).toHaveBeenCalledTimes(2);
    });

    it('should return exists when association already exists in dry run', async () => {
      mockSsmResolveDxGatewayId();
      mockSameAccountExistsFlow();

      const request = { ...makeRequest(), dryRun: true };
      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(request, makeContext(), 'test');

      expect(result.dxResponses[0]).toEqual(
        expect.objectContaining({ operation: 'exists', associationType: 'direct' }),
      );
    });
  });

  describe('cross-account - create proposal', () => {
    function makeCrossAccountRequest(dryRun = false) {
      const request = makeRequest({
        directConnectGateways: [
          {
            name: 'dxgw-1',
            accountId: '222222222222',
            transitGatewayAssociations: [
              { name: 'main-tgw', accountId: '222222222222', allowedPrefixes: ['10.0.0.0/8'] },
            ],
          },
        ],
      });
      return { ...request, dryRun };
    }

    function mockCrossAccountSsm() {
      mockSsmHandler.mockResolvedValueOnce([
        { name: '/accelerator/network/directConnectGateways/dxgw-1/id', value: 'dxgw-cross', exists: true },
      ]);
    }

    it('should create proposal and return proposal type', async () => {
      mockCrossAccountSsm();

      mockDxSend.mockResolvedValueOnce({ directConnectGatewayAssociations: [] });
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociationProposal: { proposalId: 'prop-123' },
      });
      mockDeletionPhaseDescribe();

      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(
        makeCrossAccountRequest(),
        makeContext(),
        'test',
      );

      expect(result.dxResponses[0]).toEqual({
        operation: 'created',
        region: 'us-east-1',
        tgwName: 'main-tgw',
        dxGatewayName: 'dxgw-1',
        associationType: 'proposal',
      });
      expect(result.dxAttachments).toHaveLength(0);
    });

    it('should return exists when association already exists cross-account', async () => {
      mockCrossAccountSsm();
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [
          {
            associatedGateway: { id: 'tgw-0abc' },
            associationId: 'assoc-x',
            associationState: DxAssociationState.ASSOCIATED,
            allowedPrefixesToDirectConnectGateway: [{ cidr: '10.0.0.0/8' }],
          },
        ],
      });
      mockDeletionPhaseDescribe();

      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(
        makeCrossAccountRequest(),
        makeContext(),
        'test',
      );

      expect(result.dxResponses[0]).toEqual(
        expect.objectContaining({ operation: 'exists', associationType: 'proposal' }),
      );
    });

    it('should check existing before dry run in cross-account flow', async () => {
      mockCrossAccountSsm();
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [
          {
            associatedGateway: { id: 'tgw-0abc' },
            associationId: 'assoc-x',
            associationState: DxAssociationState.ASSOCIATED,
            allowedPrefixesToDirectConnectGateway: [{ cidr: '10.0.0.0/8' }],
          },
        ],
      });
      mockDeletionPhaseDescribe();

      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(
        makeCrossAccountRequest(true),
        makeContext(),
        'test',
      );

      expect(result.dxResponses[0]).toEqual(
        expect.objectContaining({ operation: 'exists', associationType: 'proposal' }),
      );
    });

    it('should create new proposal when cross-account prefixes differ', async () => {
      mockCrossAccountSsm();
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [
          {
            associatedGateway: { id: 'tgw-0abc' },
            associationId: 'assoc-x',
            associationState: 'associated',
            allowedPrefixesToDirectConnectGateway: [{ cidr: '192.168.0.0/16' }],
          },
        ],
      });
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociationProposal: { proposalId: 'prop-update' },
      });
      mockDeletionPhaseDescribe();

      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(
        makeCrossAccountRequest(),
        makeContext(),
        'test',
      );

      expect(result.dxResponses[0]).toEqual(
        expect.objectContaining({ operation: 'created', associationType: 'proposal' }),
      );
      // SSM(1) + Describe(1) + CreateProposal(1) + DeletionDescribe(1) = 3 DX calls
      expect(mockDxSend).toHaveBeenCalledTimes(3);
    });

    it('should skip proposal creation in dry run when cross-account prefixes differ', async () => {
      mockCrossAccountSsm();
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [
          {
            associatedGateway: { id: 'tgw-0abc' },
            associationId: 'assoc-x',
            associationState: 'associated',
            allowedPrefixesToDirectConnectGateway: [{ cidr: '192.168.0.0/16' }],
          },
        ],
      });
      mockDeletionPhaseDescribe();

      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(
        makeCrossAccountRequest(true),
        makeContext(),
        'test',
      );

      expect(result.dxResponses[0]).toEqual(
        expect.objectContaining({ operation: 'created', associationType: 'proposal' }),
      );
      // SSM(1) + Describe(1) + DeletionDescribe(1) = 2 DX calls (no CreateProposal)
      expect(mockDxSend).toHaveBeenCalledTimes(2);
    });

    it('should return created in dry run when no existing association', async () => {
      mockCrossAccountSsm();
      mockDxSend.mockResolvedValueOnce({ directConnectGatewayAssociations: [] });
      mockDeletionPhaseDescribe();

      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(
        makeCrossAccountRequest(true),
        makeContext(),
        'test',
      );

      expect(result.dxResponses[0]).toEqual(
        expect.objectContaining({ operation: 'created', associationType: 'proposal' }),
      );
    });
  });

  describe('error cases', () => {
    it('should throw when TGW ID not resolved in context', async () => {
      mockSsmResolveDxGatewayId();
      const context = makeContext();
      context.transitGatewayIds.clear();

      await expect(
        DirectConnectGatewayAssociation.resolveDxGatewayAssociations(makeRequest(), context, 'test'),
      ).rejects.toThrow('TGW ID not resolved for main-tgw');
    });

    it('should throw when TGW config not found', async () => {
      mockSsmResolveDxGatewayId();
      const request = makeRequest({ transitGateways: [] });

      await expect(
        DirectConnectGatewayAssociation.resolveDxGatewayAssociations(request, makeContext(), 'test'),
      ).rejects.toThrow('TGW config not found for main-tgw');
    });
  });

  describe('same-account - disassociating and disassociated states', () => {
    it('should poll disassociating to disassociated then create new association', async () => {
      const sleepSpy = vi.spyOn(DirectConnectGatewayAssociation as never, 'sleep').mockResolvedValue(undefined);

      mockSsmResolveDxGatewayId();

      // findExisting → disassociating
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [
          {
            associatedGateway: { id: 'tgw-0abc' },
            associationId: 'assoc-old',
            associationState: DxAssociationState.DISASSOCIATING,
          },
        ],
      });

      // poll → disassociated
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [{ associationState: DxAssociationState.DISASSOCIATED }],
      });

      // create → new association
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociation: { associationId: 'assoc-new' },
      });

      // poll → associated
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [{ associationState: DxAssociationState.ASSOCIATED }],
      });

      // getDxAttachmentId
      mockEc2Send.mockResolvedValueOnce({
        TransitGatewayAttachments: [
          { TransitGatewayAttachmentId: 'tgw-attach-new', State: TgwAttachmentState.AVAILABLE },
        ],
      });
      mockDeletionPhaseDescribe();

      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(
        makeRequest(),
        makeContext(),
        'test',
      );

      expect(result.dxResponses[0].operation).toBe('created');
      expect(result.dxAttachments).toHaveLength(1);

      sleepSpy.mockRestore();
    });

    it('should create directly when existing association is in disassociated state', async () => {
      mockSsmResolveDxGatewayId();

      // findExisting → disassociated
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [
          {
            associatedGateway: { id: 'tgw-0abc' },
            associationId: 'assoc-old',
            associationState: DxAssociationState.DISASSOCIATED,
          },
        ],
      });

      // create → new association
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociation: { associationId: 'assoc-new' },
      });

      // poll → associated
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [{ associationState: DxAssociationState.ASSOCIATED }],
      });

      // getDxAttachmentId
      mockEc2Send.mockResolvedValueOnce({
        TransitGatewayAttachments: [
          { TransitGatewayAttachmentId: 'tgw-attach-new', State: TgwAttachmentState.AVAILABLE },
        ],
      });

      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(
        makeRequest(),
        makeContext(),
        'test',
      );

      expect(result.dxResponses[0].operation).toBe('created');
      expect(result.dxAttachments).toHaveLength(1);
    });

    it('should throw on unknown state', async () => {
      mockSsmResolveDxGatewayId();

      // findExisting → genuinely unknown state (not in DxAssociationState enum)
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [
          {
            associatedGateway: { id: 'tgw-0abc' },
            associationId: 'assoc-old',
            associationState: 'some-unexpected-state',
          },
        ],
      });

      await expect(
        DirectConnectGatewayAssociation.resolveDxGatewayAssociations(makeRequest(), makeContext(), 'test'),
      ).rejects.toThrow('unexpected state: some-unexpected-state');
    });
  });

  describe('DX Gateway ID resolution', () => {
    it('should throw when DX Gateway ID not resolved from SSM', async () => {
      mockSsmHandler.mockResolvedValueOnce([
        { name: '/accelerator/network/directConnectGateways/dxgw-1/id', value: '', exists: false },
      ]);

      await expect(
        DirectConnectGatewayAssociation.resolveDxGatewayAssociations(makeRequest(), makeContext(), 'test'),
      ).rejects.toThrow('SSM parameter not found');
    });
  });

  describe('getDxAttachmentId pagination', () => {
    it('should paginate through DescribeTransitGatewayAttachments to find DX attachment', async () => {
      mockSsmResolveDxGatewayId();
      mockDxSend.mockResolvedValueOnce({ directConnectGatewayAssociations: [] });
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociation: { associationId: 'assoc-new' },
      });

      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [{ associationState: DxAssociationState.ASSOCIATED }],
      });

      mockEc2Send.mockResolvedValueOnce({
        TransitGatewayAttachments: [{ TransitGatewayAttachmentId: 'tgw-attach-other', State: 'deleting' }],
        NextToken: 'page2',
      });

      mockEc2Send.mockResolvedValueOnce({
        TransitGatewayAttachments: [
          { TransitGatewayAttachmentId: 'tgw-attach-dx-paged', State: TgwAttachmentState.AVAILABLE },
        ],
      });
      mockDeletionPhaseDescribe();

      const context = makeContext();
      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(makeRequest(), context, 'test');

      expect(result.dxAttachments).toHaveLength(1);
      expect(context.attachmentIds.get('main-tgw_111111111111_dxgw-dxgw-1')).toBe('tgw-attach-dx-paged');
    });
  });

  describe('deletion phase', () => {
    it('should preserve an externally-created DX association that LZA does not own', async () => {
      const request = makeRequest({
        directConnectGateways: [
          {
            name: 'dxgw-1',
            accountId: '111111111111',
            transitGatewayAssociations: [],
          },
        ],
        // Empty owned set: the existing association was created out-of-band, not by LZA.
        ownedResources: [],
      });
      mockSsmResolveDxGatewayId();
      // Deletion phase: Describe returns an external association on a managed TGW.
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [
          {
            associatedGateway: { id: 'tgw-0abc', type: 'transitGateway' },
            associationId: 'assoc-external',
            associationState: 'associated',
          },
        ],
      });

      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(request, makeContext(), 'test');

      // Not owned → skipped, not deleted. Only SSM(1) + Describe(1) — no Delete, no Poll.
      expect(result.dxResponses.filter(r => r.operation === 'deleted')).toHaveLength(0);
      expect(mockDxSend).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('not created by LZA'), expect.any(String));
    });

    it('should record declared associations in the owned resource set', async () => {
      mockSsmResolveDxGatewayId();
      mockSameAccountCreateFlow();

      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(
        makeRequest(),
        makeContext(),
        'test',
      );

      // Default makeRequest declares dxgw-1 ↔ main-tgw; owned ID uses resolved dxgwId:tgwId.
      expect(result.ownedResources).toContain('dxassoc:dxgw-111:tgw-0abc');
    });

    it('should delete stale same-account DX association when previously owned by LZA', async () => {
      const request = makeRequest({
        directConnectGateways: [
          {
            name: 'dxgw-1',
            accountId: '111111111111',
            transitGatewayAssociations: [],
          },
        ],
        // Association was created by LZA on a prior run, so it is eligible for deletion.
        ownedResources: ['dxassoc:dxgw-111:tgw-0abc'],
      });
      mockSsmResolveDxGatewayId();
      // Deletion phase: Describe returns stale association
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [
          {
            associatedGateway: { id: 'tgw-0abc', type: 'transitGateway' },
            associationId: 'assoc-stale',
            associationState: 'associated',
          },
        ],
      });
      // Delete call
      mockDxSend.mockResolvedValueOnce({});
      // Poll returns disassociated
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [{ associationState: 'disassociated' }],
      });

      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(request, makeContext(), 'test');

      expect(result.dxResponses).toHaveLength(1);
      expect(result.dxResponses[0]).toEqual(expect.objectContaining({ operation: 'deleted', dxGatewayName: 'dxgw-1' }));
      // SSM(1) + Describe(1) + Delete(1) + Poll(1) = 3 mockDxSend calls
      expect(mockDxSend).toHaveBeenCalledTimes(3);
    });

    it('should throw when delete poll detects terminal failure state', async () => {
      const sleepSpy = vi.spyOn(DirectConnectGatewayAssociation as never, 'sleep').mockResolvedValue(undefined);

      const request = makeRequest({
        directConnectGateways: [
          {
            name: 'dxgw-1',
            accountId: '111111111111',
            transitGatewayAssociations: [],
          },
        ],
        ownedResources: ['dxassoc:dxgw-111:tgw-0abc'],
      });
      mockSsmResolveDxGatewayId();
      // Deletion phase: Describe returns stale association
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [
          {
            associatedGateway: { id: 'tgw-0abc', type: 'transitGateway' },
            associationId: 'assoc-stale',
            associationState: 'associated',
          },
        ],
      });
      // Delete call
      mockDxSend.mockResolvedValueOnce({});
      // Poll returns terminal failure state (associating instead of disassociated)
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [{ associationState: DxAssociationState.ASSOCIATING }],
      });

      await expect(
        DirectConnectGatewayAssociation.resolveDxGatewayAssociations(request, makeContext(), 'test'),
      ).rejects.toThrow('entered terminal state: associating');

      sleepSpy.mockRestore();
    });

    it('should skip deletion in dry-run mode', async () => {
      const request = {
        ...makeRequest({
          directConnectGateways: [
            {
              name: 'dxgw-1',
              accountId: '111111111111',
              transitGatewayAssociations: [],
            },
          ],
          ownedResources: ['dxassoc:dxgw-111:tgw-0abc'],
        }),
        dryRun: true,
      };
      mockSsmResolveDxGatewayId();
      // Deletion phase: Describe returns stale association
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [
          {
            associatedGateway: { id: 'tgw-0abc', type: 'transitGateway' },
            associationId: 'assoc-stale',
            associationState: 'associated',
          },
        ],
      });

      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(request, makeContext(), 'test');

      expect(result.dxResponses).toHaveLength(1);
      expect(result.dxResponses[0]).toEqual(expect.objectContaining({ operation: 'deleted' }));
      // SSM(1) + Describe(1) = only 1 mockDxSend call (no Delete, no Poll)
      expect(mockDxSend).toHaveBeenCalledTimes(1);
    });

    it('should skip non-transitGateway associations', async () => {
      const request = makeRequest({
        directConnectGateways: [
          {
            name: 'dxgw-1',
            accountId: '111111111111',
            transitGatewayAssociations: [],
          },
        ],
      });
      mockSsmResolveDxGatewayId();
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [
          {
            associatedGateway: { id: 'vgw-123', type: 'virtualPrivateGateway' },
            associationId: 'assoc-vgw',
            associationState: 'associated',
          },
        ],
      });

      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(request, makeContext(), 'test');

      expect(result.dxResponses).toHaveLength(0);
    });

    it('should skip associations with unmanaged TGWs', async () => {
      const request = makeRequest({
        directConnectGateways: [
          {
            name: 'dxgw-1',
            accountId: '111111111111',
            transitGatewayAssociations: [],
          },
        ],
      });
      mockSsmResolveDxGatewayId();
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [
          {
            associatedGateway: { id: 'tgw-unmanaged', type: 'transitGateway' },
            associationId: 'assoc-unmanaged',
            associationState: 'associated',
          },
        ],
      });

      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(request, makeContext(), 'test');

      expect(result.dxResponses).toHaveLength(0);
    });

    it('should skip declared DX-TGW pairs', async () => {
      mockSsmResolveDxGatewayId();
      mockSameAccountCreateFlow();

      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(
        makeRequest(),
        makeContext(),
        'test',
      );

      // The default makeRequest has dxgw-1 with transitGatewayAssociations: [{ name: 'main-tgw' }]
      // Creation phase produces 1 'created' response; deletion phase sees the pair as declared → skips
      expect(result.dxResponses).toHaveLength(1);
      expect(result.dxResponses[0].operation).toBe('created');
      expect(result.dxResponses.filter(r => r.operation === 'deleted')).toHaveLength(0);
    });

    it('should skip associations not in associated state', async () => {
      const request = makeRequest({
        directConnectGateways: [
          {
            name: 'dxgw-1',
            accountId: '111111111111',
            transitGatewayAssociations: [],
          },
        ],
      });
      mockSsmResolveDxGatewayId();
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [
          {
            associatedGateway: { id: 'tgw-0abc', type: 'transitGateway' },
            associationId: 'assoc-dying',
            associationState: 'disassociating',
          },
        ],
      });

      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(request, makeContext(), 'test');

      expect(result.dxResponses).toHaveLength(0);
    });

    it('should skip associations in associating state and log warning', async () => {
      const request = makeRequest({
        directConnectGateways: [
          {
            name: 'dxgw-1',
            accountId: '111111111111',
            transitGatewayAssociations: [],
          },
        ],
        // Owned by LZA, so it passes the ownership gate — the skip here is due to transitional state.
        ownedResources: ['dxassoc:dxgw-111:tgw-0abc'],
      });
      mockSsmResolveDxGatewayId();
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [
          {
            associatedGateway: { id: 'tgw-0abc', type: 'transitGateway' },
            associationId: 'assoc-pending',
            associationState: 'associating',
          },
        ],
      });

      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(request, makeContext(), 'test');

      expect(result.dxResponses).toHaveLength(0);
      expect(mockDxSend).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Skipped deletion'), expect.any(String));
    });

    it('should delete associated but skip associating when both present', async () => {
      const request = makeRequest({
        directConnectGateways: [
          {
            name: 'dxgw-1',
            accountId: '111111111111',
            transitGatewayAssociations: [],
          },
        ],
        // Both existing associations are LZA-owned; deletion is gated only by association state.
        ownedResources: ['dxassoc:dxgw-111:tgw-0abc'],
      });
      mockSsmResolveDxGatewayId();
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [
          {
            associatedGateway: { id: 'tgw-0abc', type: 'transitGateway' },
            associationId: 'assoc-ready',
            associationState: 'associated',
          },
          {
            associatedGateway: { id: 'tgw-0abc', type: 'transitGateway' },
            associationId: 'assoc-pending',
            associationState: 'associating',
          },
        ],
      });
      // Delete call for the associated one
      mockDxSend.mockResolvedValueOnce({});
      // Poll returns disassociated
      mockDxSend.mockResolvedValueOnce({
        directConnectGatewayAssociations: [{ associationState: 'disassociated' }],
      });

      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(request, makeContext(), 'test');

      expect(result.dxResponses).toHaveLength(1);
      expect(result.dxResponses[0]).toEqual(expect.objectContaining({ operation: 'deleted' }));
      expect(mockDxSend).toHaveBeenCalledTimes(3);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Skipped deletion'), expect.any(String));
    });

    it('should handle empty associations list in deletion phase', async () => {
      const request = makeRequest({
        directConnectGateways: [
          {
            name: 'dxgw-1',
            accountId: '111111111111',
            transitGatewayAssociations: [],
          },
        ],
      });
      mockSsmResolveDxGatewayId();
      mockDxSend.mockResolvedValueOnce({ directConnectGatewayAssociations: [] });

      const result = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(request, makeContext(), 'test');

      expect(result.dxResponses).toHaveLength(0);
      // SSM(1) + Describe(1) = only 1 mockDxSend call
      expect(mockDxSend).toHaveBeenCalledTimes(1);
    });
  });
});
