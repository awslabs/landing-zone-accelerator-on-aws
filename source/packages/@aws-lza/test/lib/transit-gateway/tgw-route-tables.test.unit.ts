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

import { beforeEach, describe, expect, test, vi } from 'vitest';

const mockSend = vi.fn();

vi.mock('../../../lib/common/logger', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    dryRun: vi.fn(),
  };
  return {
    createLogger: vi.fn(() => mockLogger),
    mockLogger,
  };
});

vi.mock('../../../lib/common/utility', () => ({
  executeApi: vi.fn((_name: string, _params: unknown, fn: () => Promise<unknown>) => fn()),
  setRetryStrategy: vi.fn(),
}));

vi.mock('../../../lib/common/sts-functions', () => ({
  getCredentials: vi.fn().mockResolvedValue({ accessKeyId: 'mock', secretAccessKey: 'mock', sessionToken: 'mock' }),
}));

vi.mock('../../../common/functions', () => ({
  waitUntil: vi.fn(async (predicate: () => Promise<boolean>) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      if (await predicate()) {
        return;
      }
    }
  }),
}));

vi.mock('@aws-sdk/client-ec2', () => ({
  EC2Client: vi.fn(function () {
    return { send: mockSend };
  }),
  AssociateTransitGatewayRouteTableCommand: vi.fn(),
  DisassociateTransitGatewayRouteTableCommand: vi.fn(),
  EnableTransitGatewayRouteTablePropagationCommand: vi.fn(),
  DisableTransitGatewayRouteTablePropagationCommand: vi.fn(),
  GetTransitGatewayRouteTableAssociationsCommand: vi.fn(),
  GetTransitGatewayRouteTablePropagationsCommand: vi.fn(),
  DescribeTransitGatewayAttachmentsCommand: vi.fn(),
}));

import { configureAssociationsAndPropagations } from '../../../lib/transit-gateway/tgw-route-tables';
import { ITgwModuleRequest, ITgwResolvedContext } from '../../../lib/transit-gateway/interfaces';

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
      // Default owned resources covering standard test attachment (backward-compatible)
      ownedResources: [
        'assoc:tgw-rtb-core:tgw-attach-a',
        'assoc:tgw-rtb-shared:tgw-attach-a',
        'prop:tgw-rtb-core:tgw-attach-a',
        'prop:tgw-rtb-shared:tgw-attach-a',
      ],
      transitGateways: [
        {
          name: 'main-tgw',
          accountId: '111111111111',
          region: 'us-east-1',
          routeTables: [{ name: 'core-rt' }, { name: 'shared-rt' }],
        },
      ],
      attachments: [
        {
          type: 'vpc',
          name: 'vpc-a',
          accountId: '222222222222',
          transitGateway: 'main-tgw',
          routeTableAssociations: ['core-rt'],
          routeTablePropagations: ['core-rt', 'shared-rt'],
        },
      ],
      ...overrides,
    },
  };
}

function makeContext(): ITgwResolvedContext {
  return {
    transitGatewayIds: new Map([['main-tgw', 'tgw-0abc']]),
    routeTableIds: new Map([
      ['main-tgw_core-rt', 'tgw-rtb-core'],
      ['main-tgw_shared-rt', 'tgw-rtb-shared'],
    ]),
    attachmentIds: new Map([['main-tgw_222222222222_vpc-a', 'tgw-attach-a']]),
  };
}

function tgwAttachmentAssociation(
  attachmentId: string,
  routeTableId?: string,
  state = 'associated',
): { TransitGatewayAttachmentId: string; Association?: { TransitGatewayRouteTableId: string; State: string } } {
  return {
    TransitGatewayAttachmentId: attachmentId,
    Association: routeTableId ? { TransitGatewayRouteTableId: routeTableId, State: state } : undefined,
  };
}

interface CommandParams {
  TransitGatewayAttachmentId?: string;
  TransitGatewayRouteTableId?: string;
}

describe('configureAssociationsAndPropagations', () => {
  let mockExecuteApi: ReturnType<typeof vi.fn>;
  let mockLogger: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
    dryRun: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const utility = await import('../../../lib/common/utility');
    const logger = await import('../../../lib/common/logger');
    mockExecuteApi = vi.mocked(utility.executeApi);
    mockExecuteApi.mockImplementation((_commandName: string, _params: unknown, fn: () => Promise<unknown>) => fn());
    mockLogger = (logger as unknown as { mockLogger: typeof mockLogger }).mockLogger;
    mockSend.mockResolvedValue({ Associations: [], TransitGatewayRouteTablePropagations: [] });
  });

  describe('associations', () => {
    test('should create association when none exists', async () => {
      const result = await configureAssociationsAndPropagations(makeRequest(), makeContext(), 'test');
      const coreAssoc = result.associations.find(a => a.routeTableName === 'core-rt');
      expect(coreAssoc?.operation).toBe('created');
      expect(coreAssoc?.attachmentName).toBe('vpc-a');
      expect(coreAssoc?.attachmentType).toBe('vpc');
    });

    test('should report exists when association already present', async () => {
      mockExecuteApi.mockImplementation(async (commandName: string, _params: unknown, fn: () => Promise<unknown>) => {
        if (commandName === 'DescribeTransitGatewayAttachmentsCommand') {
          return { TransitGatewayAttachments: [tgwAttachmentAssociation('tgw-attach-a', 'tgw-rtb-core')] };
        }
        return fn();
      });
      const result = await configureAssociationsAndPropagations(makeRequest(), makeContext(), 'test');
      const coreAssoc = result.associations.find(a => a.routeTableName === 'core-rt');
      expect(coreAssoc?.operation).toBe('exists');
    });

    test('should delete managed associations not in desired config', async () => {
      mockExecuteApi.mockImplementation(async (commandName: string, _params: unknown, fn: () => Promise<unknown>) => {
        if (commandName === 'DescribeTransitGatewayAttachmentsCommand') {
          return { TransitGatewayAttachments: [tgwAttachmentAssociation('tgw-attach-a', 'tgw-rtb-core')] };
        }
        return fn();
      });
      const request = makeRequest({
        attachments: [
          {
            type: 'vpc',
            name: 'vpc-a',
            accountId: '222222222222',
            transitGateway: 'main-tgw',
            routeTableAssociations: [],
            routeTablePropagations: [],
          },
        ],
      });
      const result = await configureAssociationsAndPropagations(request, makeContext(), 'test');
      const deleted = result.associations.filter(a => a.operation === 'deleted');
      expect(deleted).toHaveLength(1);
      expect(deleted.map(d => d.routeTableName)).toEqual(['core-rt']);
    });

    test('should never touch external attachments', async () => {
      mockExecuteApi.mockImplementation(async (commandName: string, _params: unknown, fn: () => Promise<unknown>) => {
        if (commandName === 'DescribeTransitGatewayAttachmentsCommand') {
          return {
            TransitGatewayAttachments: [tgwAttachmentAssociation('tgw-attach-external', 'tgw-rtb-core')],
          };
        }
        return fn();
      });
      const request = makeRequest({ attachments: [] });
      const result = await configureAssociationsAndPropagations(request, makeContext(), 'test');
      expect(result.associations.filter(a => a.operation === 'deleted')).toHaveLength(0);
    });

    test('should handle 1:1 constraint — move attachment from one route table to another', async () => {
      let describeCount = 0;
      let currentRouteTableId: string | undefined = 'tgw-rtb-core';
      let pendingRouteTableId: string | undefined;
      let pendingRouteTableUpdate = false;
      let pendingDescribeCount = 0;
      mockExecuteApi.mockImplementation(
        async (commandName: string, params: CommandParams, fn: () => Promise<unknown>) => {
          if (commandName === 'DescribeTransitGatewayAttachmentsCommand') {
            describeCount++;
            if (pendingRouteTableUpdate && pendingDescribeCount++ > 0) {
              currentRouteTableId = pendingRouteTableId;
              pendingRouteTableUpdate = false;
            }
            return { TransitGatewayAttachments: [tgwAttachmentAssociation('tgw-attach-a', currentRouteTableId)] };
          }
          if (commandName === 'DisassociateTransitGatewayRouteTableCommand') {
            pendingRouteTableId = undefined;
            pendingRouteTableUpdate = true;
            pendingDescribeCount = 0;
          }
          if (commandName === 'AssociateTransitGatewayRouteTableCommand') {
            pendingRouteTableId = params.TransitGatewayRouteTableId;
            pendingRouteTableUpdate = true;
            pendingDescribeCount = 0;
          }
          return fn();
        },
      );
      const request = makeRequest({
        attachments: [
          {
            type: 'vpc',
            name: 'vpc-a',
            accountId: '222222222222',
            transitGateway: 'main-tgw',
            routeTableAssociations: ['shared-rt'],
            routeTablePropagations: [],
          },
        ],
      });
      const result = await configureAssociationsAndPropagations(request, makeContext(), 'test');
      const coreDeleted = result.associations.find(a => a.routeTableName === 'core-rt' && a.operation === 'deleted');
      expect(coreDeleted).toBeDefined();
      const sharedCreated = result.associations.find(
        a => a.routeTableName === 'shared-rt' && a.operation === 'created',
      );
      expect(sharedCreated).toBeDefined();
      expect(describeCount).toBeGreaterThanOrEqual(5);
    });

    test('should release all changed associations before acquiring any new associations', async () => {
      const request = makeRequest({
        attachments: [
          {
            type: 'vpc',
            name: 'vpc-a',
            accountId: '222222222222',
            transitGateway: 'main-tgw',
            routeTableAssociations: ['shared-rt'],
            routeTablePropagations: [],
          },
          {
            type: 'vpc',
            name: 'vpc-b',
            accountId: '333333333333',
            transitGateway: 'main-tgw',
            routeTableAssociations: ['core-rt'],
            routeTablePropagations: [],
          },
        ],
      });
      const context: ITgwResolvedContext = {
        ...makeContext(),
        attachmentIds: new Map([
          ['main-tgw_222222222222_vpc-a', 'tgw-attach-a'],
          ['main-tgw_333333333333_vpc-b', 'tgw-attach-b'],
        ]),
      };
      const calls: string[] = [];
      const currentRouteTableIdsByAttachmentId = new Map([
        ['tgw-attach-a', 'tgw-rtb-core'],
        ['tgw-attach-b', 'tgw-rtb-shared'],
      ]);
      mockExecuteApi.mockImplementation(
        async (commandName: string, params: CommandParams, fn: () => Promise<unknown>) => {
          if (commandName === 'DescribeTransitGatewayAttachmentsCommand') {
            return {
              TransitGatewayAttachments: [
                tgwAttachmentAssociation('tgw-attach-a', currentRouteTableIdsByAttachmentId.get('tgw-attach-a')),
                tgwAttachmentAssociation('tgw-attach-b', currentRouteTableIdsByAttachmentId.get('tgw-attach-b')),
              ],
            };
          }
          if (commandName === 'DisassociateTransitGatewayRouteTableCommand') {
            currentRouteTableIdsByAttachmentId.delete(params.TransitGatewayAttachmentId!);
            calls.push(`${commandName}:${params.TransitGatewayAttachmentId}`);
          }
          if (commandName === 'AssociateTransitGatewayRouteTableCommand') {
            currentRouteTableIdsByAttachmentId.set(
              params.TransitGatewayAttachmentId!,
              params.TransitGatewayRouteTableId!,
            );
            calls.push(`${commandName}:${params.TransitGatewayAttachmentId}`);
          }
          return fn();
        },
      );

      const result = await configureAssociationsAndPropagations(request, context, 'test');

      expect(result.associations.filter(a => a.operation === 'deleted')).toHaveLength(2);
      expect(result.associations.filter(a => a.operation === 'created')).toHaveLength(2);
      const firstAssociate = calls.findIndex(call => call.startsWith('AssociateTransitGatewayRouteTableCommand'));
      const lastDisassociate = calls.findLastIndex(call =>
        call.startsWith('DisassociateTransitGatewayRouteTableCommand'),
      );
      expect(firstAssociate).toBeGreaterThan(lastDisassociate);
    });

    test('should handle Resource.AlreadyAssociated as exists', async () => {
      mockExecuteApi.mockImplementation(async (commandName: string, _params: unknown, fn: () => Promise<unknown>) => {
        if (commandName === 'AssociateTransitGatewayRouteTableCommand') {
          const err = new Error('Resource.AlreadyAssociated');
          err.name = 'Resource.AlreadyAssociated';
          throw err;
        }
        if (commandName === 'DescribeTransitGatewayAttachmentsCommand') {
          return { TransitGatewayAttachments: [tgwAttachmentAssociation('tgw-attach-a', 'tgw-rtb-core')] };
        }
        return fn();
      });
      const request = makeRequest({
        transitGateways: [
          { name: 'main-tgw', accountId: '111111111111', region: 'us-east-1', routeTables: [{ name: 'core-rt' }] },
        ],
        attachments: [
          {
            type: 'vpc',
            name: 'vpc-a',
            accountId: '222222222222',
            transitGateway: 'main-tgw',
            routeTableAssociations: ['core-rt'],
            routeTablePropagations: [],
          },
        ],
      });
      const context: ITgwResolvedContext = {
        transitGatewayIds: new Map([['main-tgw', 'tgw-0abc']]),
        routeTableIds: new Map([['main-tgw_core-rt', 'tgw-rtb-core']]),
        attachmentIds: new Map([['main-tgw_222222222222_vpc-a', 'tgw-attach-a']]),
      };
      const result = await configureAssociationsAndPropagations(request, context, 'test');
      expect(result.associations.find(a => a.routeTableName === 'core-rt')?.operation).toBe('exists');
    });

    test('should report per-item failure instead of throwing when association create fails', async () => {
      mockExecuteApi.mockImplementation(async (commandName: string, _params: unknown, fn: () => Promise<unknown>) => {
        if (commandName === 'AssociateTransitGatewayRouteTableCommand') {
          throw new Error('Throttling');
        }
        return fn();
      });

      const result = await configureAssociationsAndPropagations(makeRequest(), makeContext(), 'test');

      expect(result.associations).toContainEqual(
        expect.objectContaining({
          operation: 'failed',
          attachmentName: 'vpc-a',
          routeTableName: 'core-rt',
          errorMessage: 'Throttling',
        }),
      );
    });
  });

  describe('propagations', () => {
    test('should create propagations when none exist', async () => {
      const result = await configureAssociationsAndPropagations(makeRequest(), makeContext(), 'test');
      expect(result.propagations.find(p => p.routeTableName === 'core-rt')?.operation).toBe('created');
      expect(result.propagations.find(p => p.routeTableName === 'shared-rt')?.operation).toBe('created');
    });

    test('should report exists when propagation already present', async () => {
      mockSend.mockImplementation(() =>
        Promise.resolve({
          Associations: [],
          TransitGatewayRouteTablePropagations: [{ TransitGatewayAttachmentId: 'tgw-attach-a', State: 'enabled' }],
        }),
      );
      const result = await configureAssociationsAndPropagations(makeRequest(), makeContext(), 'test');
      expect(result.propagations.find(p => p.routeTableName === 'core-rt')?.operation).toBe('exists');
    });

    test('should delete managed propagation not in desired config', async () => {
      mockSend.mockImplementation(() =>
        Promise.resolve({
          Associations: [],
          TransitGatewayRouteTablePropagations: [{ TransitGatewayAttachmentId: 'tgw-attach-a', State: 'enabled' }],
        }),
      );
      const request = makeRequest({
        attachments: [
          {
            type: 'vpc',
            name: 'vpc-a',
            accountId: '222222222222',
            transitGateway: 'main-tgw',
            routeTableAssociations: [],
            routeTablePropagations: [],
          },
        ],
      });
      const result = await configureAssociationsAndPropagations(request, makeContext(), 'test');
      expect(result.propagations.filter(p => p.operation === 'deleted').length).toBeGreaterThan(0);
    });

    test('should never touch external propagations', async () => {
      mockSend.mockImplementation(() =>
        Promise.resolve({
          Associations: [],
          TransitGatewayRouteTablePropagations: [
            { TransitGatewayAttachmentId: 'tgw-attach-external', State: 'enabled' },
          ],
        }),
      );
      const request = makeRequest({ attachments: [] });
      const result = await configureAssociationsAndPropagations(request, makeContext(), 'test');
      expect(result.propagations.filter(p => p.operation === 'deleted')).toHaveLength(0);
    });

    test('should handle TransitGatewayRouteTablePropagation.AlreadyEnabled as exists', async () => {
      mockExecuteApi.mockImplementation(async (commandName: string, _params: unknown, fn: () => Promise<unknown>) => {
        if (commandName === 'EnableTransitGatewayRouteTablePropagationCommand') {
          const err = new Error('TransitGatewayRouteTablePropagation.AlreadyEnabled');
          err.name = 'TransitGatewayRouteTablePropagation.AlreadyEnabled';
          throw err;
        }
        return fn();
      });
      const request = makeRequest({
        transitGateways: [
          { name: 'main-tgw', accountId: '111111111111', region: 'us-east-1', routeTables: [{ name: 'core-rt' }] },
        ],
        attachments: [
          {
            type: 'vpc',
            name: 'vpc-a',
            accountId: '222222222222',
            transitGateway: 'main-tgw',
            routeTableAssociations: [],
            routeTablePropagations: ['core-rt'],
          },
        ],
      });
      const context: ITgwResolvedContext = {
        transitGatewayIds: new Map([['main-tgw', 'tgw-0abc']]),
        routeTableIds: new Map([['main-tgw_core-rt', 'tgw-rtb-core']]),
        attachmentIds: new Map([['main-tgw_222222222222_vpc-a', 'tgw-attach-a']]),
      };
      const result = await configureAssociationsAndPropagations(request, context, 'test');
      expect(result.propagations.find(p => p.routeTableName === 'core-rt')?.operation).toBe('exists');
    });
  });

  describe('dry run', () => {
    test('should not call create/delete APIs in dry run mode', async () => {
      const request = makeRequest();
      request.dryRun = true;
      const result = await configureAssociationsAndPropagations(request, makeContext(), 'test');
      expect(result.associations.length).toBeGreaterThan(0);
      expect(result.propagations.length).toBeGreaterThan(0);
      expect(mockLogger.dryRun).toHaveBeenCalledWith(
        'AssociateTransitGatewayRouteTableCommand',
        expect.objectContaining({
          TransitGatewayRouteTableId: 'tgw-rtb-core',
          TransitGatewayAttachmentId: 'tgw-attach-a',
        }),
        'test',
      );
      expect(mockLogger.dryRun).toHaveBeenCalledWith(
        'EnableTransitGatewayRouteTablePropagationCommand',
        expect.objectContaining({
          TransitGatewayRouteTableId: 'tgw-rtb-core',
          TransitGatewayAttachmentId: 'tgw-attach-a',
        }),
        'test',
      );
    });

    test('should call logger.dryRun for disassociation in dry run mode', async () => {
      mockExecuteApi.mockImplementation(async (commandName: string, _params: unknown, fn: () => Promise<unknown>) => {
        if (commandName === 'DescribeTransitGatewayAttachmentsCommand') {
          return { TransitGatewayAttachments: [tgwAttachmentAssociation('tgw-attach-a', 'tgw-rtb-core')] };
        }
        return fn();
      });
      const request = makeRequest({
        attachments: [
          {
            type: 'vpc',
            name: 'vpc-a',
            accountId: '222222222222',
            transitGateway: 'main-tgw',
            routeTableAssociations: [],
            routeTablePropagations: [],
          },
        ],
      });
      request.dryRun = true;
      await configureAssociationsAndPropagations(request, makeContext(), 'test');
      expect(mockLogger.dryRun).toHaveBeenCalledWith(
        'DisassociateTransitGatewayRouteTableCommand',
        expect.objectContaining({
          TransitGatewayRouteTableId: 'tgw-rtb-core',
          TransitGatewayAttachmentId: 'tgw-attach-a',
        }),
        'test',
      );
    });

    test('should call logger.dryRun for disable propagation in dry run mode', async () => {
      mockSend.mockImplementation(() =>
        Promise.resolve({
          Associations: [],
          TransitGatewayRouteTablePropagations: [{ TransitGatewayAttachmentId: 'tgw-attach-a', State: 'enabled' }],
        }),
      );
      const request = makeRequest({
        attachments: [
          {
            type: 'vpc',
            name: 'vpc-a',
            accountId: '222222222222',
            transitGateway: 'main-tgw',
            routeTableAssociations: [],
            routeTablePropagations: [],
          },
        ],
      });
      request.dryRun = true;
      await configureAssociationsAndPropagations(request, makeContext(), 'test');
      expect(mockLogger.dryRun).toHaveBeenCalledWith(
        'DisableTransitGatewayRouteTablePropagationCommand',
        expect.objectContaining({
          TransitGatewayRouteTableId: 'tgw-rtb-core',
          TransitGatewayAttachmentId: 'tgw-attach-a',
        }),
        'test',
      );
    });
  });

  describe('error handling', () => {
    test('should throw when route table ID not resolved', async () => {
      const context = makeContext();
      context.routeTableIds.delete('main-tgw_core-rt');
      await expect(configureAssociationsAndPropagations(makeRequest(), context, 'test')).rejects.toThrow(
        'Route table ID not resolved for main-tgw_core-rt',
      );
    });

    test('should throw when attachment ID not resolved', async () => {
      const context = makeContext();
      context.attachmentIds.delete('main-tgw_222222222222_vpc-a');
      await expect(configureAssociationsAndPropagations(makeRequest(), context, 'test')).rejects.toThrow(
        'Attachment ID not resolved',
      );
    });

    test('should throw when attachment references invalid route table name', async () => {
      const request = makeRequest({
        attachments: [
          {
            type: 'vpc',
            name: 'vpc-a',
            accountId: '222222222222',
            transitGateway: 'main-tgw',
            routeTableAssociations: ['Typo-RT'],
            routeTablePropagations: [],
          },
        ],
      });
      await expect(configureAssociationsAndPropagations(request, makeContext(), 'test')).rejects.toThrow(
        /Route table "Typo-RT" referenced in attachment "vpc-a" does not exist on TGW "main-tgw".*Available route tables: \[core-rt, shared-rt\]/,
      );
    });

    test('should warn when attachment references unknown TGW', async () => {
      const request = makeRequest({
        attachments: [
          {
            type: 'vpc',
            name: 'vpc-a',
            accountId: '222222222222',
            transitGateway: 'unknown-tgw',
            routeTableAssociations: ['core-rt'],
            routeTablePropagations: [],
          },
        ],
      });
      const result = await configureAssociationsAndPropagations(request, makeContext(), 'test');
      expect(result.associations).toHaveLength(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('unknown transit gateway "unknown-tgw"'),
        expect.any(String),
      );
    });

    test('should throw on duplicate TGW names', async () => {
      const request = makeRequest({
        transitGateways: [
          { name: 'main-tgw', accountId: '111111111111', region: 'us-east-1', routeTables: [{ name: 'core-rt' }] },
          { name: 'main-tgw', accountId: '222222222222', region: 'us-west-2', routeTables: [{ name: 'other-rt' }] },
        ],
      });
      await expect(configureAssociationsAndPropagations(request, makeContext(), 'test')).rejects.toThrow(
        'Duplicate transit gateway name "main-tgw"',
      );
    });
  });

  describe('multi-attachment', () => {
    test('should handle multiple attachments on the same route table', async () => {
      const request = makeRequest({
        attachments: [
          {
            type: 'vpc',
            name: 'vpc-a',
            accountId: '222222222222',
            transitGateway: 'main-tgw',
            routeTableAssociations: ['core-rt'],
            routeTablePropagations: ['core-rt'],
          },
          {
            type: 'vpc',
            name: 'vpc-b',
            accountId: '333333333333',
            transitGateway: 'main-tgw',
            routeTableAssociations: ['core-rt'],
            routeTablePropagations: ['shared-rt'],
          },
        ],
      });
      const context: ITgwResolvedContext = {
        ...makeContext(),
        attachmentIds: new Map([
          ['main-tgw_222222222222_vpc-a', 'tgw-attach-a'],
          ['main-tgw_333333333333_vpc-b', 'tgw-attach-b'],
        ]),
      };
      const result = await configureAssociationsAndPropagations(request, context, 'test');
      const coreAssocs = result.associations.filter(a => a.routeTableName === 'core-rt');
      expect(coreAssocs).toHaveLength(2);
      expect(coreAssocs.map(a => a.attachmentName).sort()).toEqual(['vpc-a', 'vpc-b']);
    });

    test('should filter out attachments targeting a different TGW', async () => {
      const request = makeRequest({
        attachments: [
          {
            type: 'vpc',
            name: 'vpc-a',
            accountId: '222222222222',
            transitGateway: 'main-tgw',
            routeTableAssociations: ['core-rt'],
            routeTablePropagations: [],
          },
          {
            type: 'vpc',
            name: 'vpc-other',
            accountId: '444444444444',
            transitGateway: 'other-tgw',
            routeTableAssociations: ['core-rt'],
            routeTablePropagations: [],
          },
        ],
      });
      const result = await configureAssociationsAndPropagations(request, makeContext(), 'test');
      expect(result.associations.filter(a => a.attachmentName === 'vpc-other')).toHaveLength(0);
    });
  });

  describe('multi-TGW grouping', () => {
    test('should process two TGWs in different accounts/regions', async () => {
      const request = makeRequest({
        transitGateways: [
          {
            name: 'tgw-east',
            accountId: '111111111111',
            region: 'us-east-1',
            routeTables: [{ name: 'core-rt' }],
          },
          {
            name: 'tgw-west',
            accountId: '222222222222',
            region: 'us-west-2',
            routeTables: [{ name: 'shared-rt' }],
          },
        ],
        attachments: [
          {
            type: 'vpc',
            name: 'vpc-east',
            accountId: '111111111111',
            transitGateway: 'tgw-east',
            routeTableAssociations: ['core-rt'],
            routeTablePropagations: [],
          },
          {
            type: 'vpc',
            name: 'vpc-west',
            accountId: '222222222222',
            transitGateway: 'tgw-west',
            routeTableAssociations: ['shared-rt'],
            routeTablePropagations: [],
          },
        ],
      });
      const context: ITgwResolvedContext = {
        transitGatewayIds: new Map([
          ['tgw-east', 'tgw-0east'],
          ['tgw-west', 'tgw-0west'],
        ]),
        routeTableIds: new Map([
          ['tgw-east_core-rt', 'tgw-rtb-core'],
          ['tgw-west_shared-rt', 'tgw-rtb-shared'],
        ]),
        attachmentIds: new Map([
          ['tgw-east_111111111111_vpc-east', 'tgw-attach-east'],
          ['tgw-west_222222222222_vpc-west', 'tgw-attach-west'],
        ]),
      };
      const result = await configureAssociationsAndPropagations(request, context, 'test');
      expect(result.associations).toHaveLength(2);
      expect(result.associations.map(a => a.tgwName).sort()).toEqual(['tgw-east', 'tgw-west']);
    });

    test('should return ownedResources with correct key format for resolved attachments', async () => {
      mockExecuteApi.mockImplementation(async (_name: string, _params: unknown, fn: () => Promise<unknown>) => fn());

      const result = await configureAssociationsAndPropagations(makeRequest(), makeContext(), 'test');

      // Default config: routeTableAssociations: ['core-rt'], routeTablePropagations: ['core-rt', 'shared-rt']
      // Verify owned resources contain the correct key format: assoc:{rtId}:{attachId} / prop:{rtId}:{attachId}
      expect(result.ownedResources).toContain('assoc:tgw-rtb-core:tgw-attach-a');
      expect(result.ownedResources).toContain('prop:tgw-rtb-core:tgw-attach-a');
      expect(result.ownedResources).toContain('prop:tgw-rtb-shared:tgw-attach-a');
      expect(result.ownedResources).toHaveLength(3);
      // Verify all entries are strings with no undefined segments
      for (const r of result.ownedResources) {
        expect(typeof r).toBe('string');
        expect(r).not.toContain('undefined');
      }
    });
  });
});
