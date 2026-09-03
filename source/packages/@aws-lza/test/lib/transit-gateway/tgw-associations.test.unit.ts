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

vi.mock('../../../common/functions', () => ({
  waitUntil: vi.fn(async (predicate: () => Promise<boolean>) => {
    await predicate();
  }),
}));

vi.mock('@aws-sdk/client-ec2', () => ({
  EC2Client: vi.fn(function () {
    return { send: mockSend };
  }),
  AssociateTransitGatewayRouteTableCommand: vi.fn(),
  DisassociateTransitGatewayRouteTableCommand: vi.fn(),
  DescribeTransitGatewayAttachmentsCommand: vi.fn(),
}));

import { EC2Client } from '@aws-sdk/client-ec2';
import { waitUntil } from '../../../common/functions';
import { TgwAssociations } from '../../../lib/transit-gateway/tgw-associations';
import { IDesiredAttachment } from '../../../lib/transit-gateway/interfaces';

const ec2 = new EC2Client({});
const TGW_ID = 'tgw-0abc';
const TGW_NAME = 'main-tgw';
const REGION = 'us-east-1';
const LOG_PREFIX = 'test';
const CORE_RT = { routeTableId: 'tgw-rtb-core', routeTableName: 'core-rt' };
const SHARED_RT = { routeTableId: 'tgw-rtb-shared', routeTableName: 'shared-rt' };

function desiredAttachment(overrides: Partial<IDesiredAttachment> = {}): IDesiredAttachment {
  return { attachmentId: 'tgw-attach-a', attachmentName: 'vpc-a', attachmentType: 'vpc', ...overrides };
}

function currentAttachment(attachmentId: string, routeTableId?: string, state = 'associated') {
  return {
    TransitGatewayAttachmentId: attachmentId,
    Association: routeTableId ? { TransitGatewayRouteTableId: routeTableId, State: state } : undefined,
  };
}

function desiredByRouteTable(entries: [string, IDesiredAttachment[]][]) {
  return new Map(entries);
}

interface CommandParams {
  TransitGatewayAttachmentId?: string;
  TransitGatewayAttachmentIds?: string[];
  TransitGatewayRouteTableId?: string;
}

// Default owned set: treats all managed attachments as owned (backward-compatible with old behavior)
const ALL_OWNED = new Set([
  `assoc:${CORE_RT.routeTableId}:tgw-attach-a`,
  `assoc:${CORE_RT.routeTableId}:tgw-attach-b`,
  `assoc:${SHARED_RT.routeTableId}:tgw-attach-a`,
  `assoc:${SHARED_RT.routeTableId}:tgw-attach-b`,
]);

async function process(
  desired: Map<string, IDesiredAttachment[]>,
  knownAttachmentIds = new Set(['tgw-attach-a']),
  ownedResourceIds: Set<string> = ALL_OWNED,
  dryRun = false,
) {
  return TgwAssociations.processTransitGateway(
    ec2,
    TGW_ID,
    TGW_NAME,
    REGION,
    [CORE_RT, SHARED_RT],
    desired,
    knownAttachmentIds,
    ownedResourceIds,
    dryRun,
    LOG_PREFIX,
  );
}

describe('TgwAssociations', () => {
  let mockExecuteApi: ReturnType<typeof vi.fn>;
  let mockLogger: {
    warn: ReturnType<typeof vi.fn>;
    dryRun: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const utility = await import('../../../lib/common/utility');
    const logger = await import('../../../lib/common/logger');
    mockExecuteApi = vi.mocked(utility.executeApi);
    mockExecuteApi.mockImplementation((_name: string, _params: unknown, fn: () => Promise<unknown>) => fn());
    mockLogger = (logger as unknown as { mockLogger: typeof mockLogger }).mockLogger;
    mockSend.mockResolvedValue({ TransitGatewayAttachments: [] });
  });

  test('should create association when none exists', async () => {
    const result = await process(desiredByRouteTable([[CORE_RT.routeTableId, [desiredAttachment()]]]));

    expect(result).toContainEqual(
      expect.objectContaining({ operation: 'created', attachmentName: 'vpc-a', routeTableName: 'core-rt' }),
    );
  });

  test('should report exists when desired association already exists', async () => {
    mockSend.mockResolvedValue({
      TransitGatewayAttachments: [currentAttachment('tgw-attach-a', CORE_RT.routeTableId)],
    });

    const result = await process(desiredByRouteTable([[CORE_RT.routeTableId, [desiredAttachment()]]]));

    expect(result).toEqual([
      expect.objectContaining({ operation: 'exists', attachmentName: 'vpc-a', routeTableName: 'core-rt' }),
    ]);
  });

  test('should delete managed association that is no longer desired', async () => {
    mockSend.mockResolvedValue({
      TransitGatewayAttachments: [currentAttachment('tgw-attach-a', CORE_RT.routeTableId)],
    });

    const result = await process(desiredByRouteTable([]));

    expect(result).toContainEqual(
      expect.objectContaining({ operation: 'deleted', attachmentName: 'tgw-attach-a', routeTableName: 'core-rt' }),
    );
  });

  test('should never touch unmanaged associations', async () => {
    mockSend.mockResolvedValue({
      TransitGatewayAttachments: [currentAttachment('tgw-attach-external', CORE_RT.routeTableId)],
    });

    const result = await process(desiredByRouteTable([]));

    expect(result).toHaveLength(0);
  });

  test('should not wait for unmanaged associations in transitional state', async () => {
    mockSend.mockResolvedValue({
      TransitGatewayAttachments: [currentAttachment('tgw-attach-external', CORE_RT.routeTableId, 'disassociating')],
    });

    const result = await process(desiredByRouteTable([]));

    expect(result).toHaveLength(0);
    expect(waitUntil).not.toHaveBeenCalled();
  });

  test('should release all changed associations before acquiring any new associations', async () => {
    const calls: string[] = [];
    const current = new Map([
      ['tgw-attach-a', CORE_RT.routeTableId],
      ['tgw-attach-b', SHARED_RT.routeTableId],
    ]);
    mockExecuteApi.mockImplementation(
      async (commandName: string, params: CommandParams, fn: () => Promise<unknown>) => {
        if (commandName === 'DescribeTransitGatewayAttachmentsCommand') {
          return {
            TransitGatewayAttachments: [...current].map(([attachmentId, routeTableId]) =>
              currentAttachment(attachmentId, routeTableId),
            ),
          };
        }
        if (commandName === 'DisassociateTransitGatewayRouteTableCommand') {
          calls.push(`${commandName}:${params.TransitGatewayAttachmentId}`);
          current.delete(params.TransitGatewayAttachmentId);
        }
        if (commandName === 'AssociateTransitGatewayRouteTableCommand') {
          calls.push(`${commandName}:${params.TransitGatewayAttachmentId}`);
          current.set(params.TransitGatewayAttachmentId, params.TransitGatewayRouteTableId);
        }
        return fn();
      },
    );

    const result = await process(
      desiredByRouteTable([
        [SHARED_RT.routeTableId, [desiredAttachment()]],
        [CORE_RT.routeTableId, [desiredAttachment({ attachmentId: 'tgw-attach-b', attachmentName: 'vpc-b' })]],
      ]),
      new Set(['tgw-attach-a', 'tgw-attach-b']),
    );

    expect(result.filter(r => r.operation === 'deleted')).toHaveLength(2);
    expect(result.filter(r => r.operation === 'created')).toHaveLength(2);
    const firstAssociate = calls.findIndex(call => call.startsWith('AssociateTransitGatewayRouteTableCommand'));
    const lastDisassociate = calls.findLastIndex(call =>
      call.startsWith('DisassociateTransitGatewayRouteTableCommand'),
    );
    expect(firstAssociate).toBeGreaterThan(lastDisassociate);
  });

  test('should handle InvalidAssociation.NotFound as already deleted', async () => {
    mockSend.mockResolvedValue({
      TransitGatewayAttachments: [currentAttachment('tgw-attach-a', CORE_RT.routeTableId)],
    });
    mockExecuteApi.mockImplementation(async (commandName: string, _params: unknown, fn: () => Promise<unknown>) => {
      if (commandName === 'DisassociateTransitGatewayRouteTableCommand') {
        const err = new Error('InvalidAssociation.NotFound');
        err.name = 'InvalidAssociation.NotFound';
        throw err;
      }
      return fn();
    });

    const result = await process(desiredByRouteTable([]));

    expect(result).toContainEqual(expect.objectContaining({ operation: 'deleted' }));
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  test('should report per-item failure when association create fails', async () => {
    mockExecuteApi.mockImplementation(async (commandName: string, _params: unknown, fn: () => Promise<unknown>) => {
      if (commandName === 'AssociateTransitGatewayRouteTableCommand') {
        throw new Error('Throttling');
      }
      return fn();
    });

    const result = await process(desiredByRouteTable([[CORE_RT.routeTableId, [desiredAttachment()]]]));

    expect(result).toEqual([
      expect.objectContaining({ operation: 'failed', errorMessage: 'Throttling', routeTableName: 'core-rt' }),
    ]);
  });

  test('should handle Resource.AlreadyAssociated on target as exists', async () => {
    mockExecuteApi.mockImplementation(
      async (commandName: string, params: CommandParams, fn: () => Promise<unknown>) => {
        if (commandName === 'AssociateTransitGatewayRouteTableCommand') {
          const err = new Error('Resource.AlreadyAssociated');
          err.name = 'Resource.AlreadyAssociated';
          throw err;
        }
        if (commandName === 'DescribeTransitGatewayAttachmentsCommand' && params.TransitGatewayAttachmentIds) {
          return { TransitGatewayAttachments: [currentAttachment('tgw-attach-a', CORE_RT.routeTableId)] };
        }
        return fn();
      },
    );

    const result = await process(desiredByRouteTable([[CORE_RT.routeTableId, [desiredAttachment()]]]));

    expect(result).toEqual([
      expect.objectContaining({ operation: 'exists', attachmentName: 'vpc-a', routeTableName: 'core-rt' }),
    ]);
  });

  test('should report failed when AlreadyAssociated verification fails', async () => {
    mockExecuteApi.mockImplementation(
      async (commandName: string, params: CommandParams, fn: () => Promise<unknown>) => {
        if (commandName === 'AssociateTransitGatewayRouteTableCommand') {
          const err = new Error('Resource.AlreadyAssociated');
          err.name = 'Resource.AlreadyAssociated';
          throw err;
        }
        if (commandName === 'DescribeTransitGatewayAttachmentsCommand' && params.TransitGatewayAttachmentIds) {
          throw new Error('Describe failed');
        }
        return fn();
      },
    );

    const result = await process(desiredByRouteTable([[CORE_RT.routeTableId, [desiredAttachment()]]]));

    expect(result).toEqual([
      expect.objectContaining({ operation: 'failed', errorMessage: 'Describe failed', routeTableName: 'core-rt' }),
    ]);
  });

  test('should reject duplicate desired route table associations for one attachment', async () => {
    await expect(
      process(
        desiredByRouteTable([
          [CORE_RT.routeTableId, [desiredAttachment()]],
          [SHARED_RT.routeTableId, [desiredAttachment()]],
        ]),
      ),
    ).rejects.toThrow('is associated with multiple route tables');
  });

  test('should log both release and acquire in dry run for moves', async () => {
    mockSend.mockResolvedValue({
      TransitGatewayAttachments: [currentAttachment('tgw-attach-a', CORE_RT.routeTableId)],
    });

    const result = await process(
      desiredByRouteTable([[SHARED_RT.routeTableId, [desiredAttachment()]]]),
      undefined,
      ALL_OWNED,
      true,
    );

    expect(result).toContainEqual(expect.objectContaining({ operation: 'deleted', routeTableName: 'core-rt' }));
    expect(result).toContainEqual(expect.objectContaining({ operation: 'created', routeTableName: 'shared-rt' }));
    expect(mockLogger.dryRun).toHaveBeenCalledWith(
      'DisassociateTransitGatewayRouteTableCommand',
      expect.objectContaining({ TransitGatewayAttachmentId: 'tgw-attach-a' }),
      LOG_PREFIX,
    );
    expect(mockLogger.dryRun).toHaveBeenCalledWith(
      'AssociateTransitGatewayRouteTableCommand',
      expect.objectContaining({ TransitGatewayAttachmentId: 'tgw-attach-a' }),
      LOG_PREFIX,
    );
  });

  describe('ownership-based deletion', () => {
    test('should NOT release association on managed attachment when not in owned set', async () => {
      // Attachment is known (managed) and associated, but NOT in ownedResourceIds
      mockSend.mockResolvedValue({
        TransitGatewayAttachments: [currentAttachment('tgw-attach-a', CORE_RT.routeTableId)],
      });
      const emptyOwned = new Set<string>(); // Nothing owned — first run or external

      const result = await process(
        desiredByRouteTable([]), // Not in desired
        new Set(['tgw-attach-a']), // Known/managed
        emptyOwned, // Not owned by LZA
      );

      expect(result.filter(r => r.operation === 'deleted')).toHaveLength(0);
    });

    test('should release association when it IS in owned set and removed from config', async () => {
      mockSend.mockResolvedValue({
        TransitGatewayAttachments: [currentAttachment('tgw-attach-a', CORE_RT.routeTableId)],
      });
      const ownedSet = new Set([`assoc:${CORE_RT.routeTableId}:tgw-attach-a`]);

      const result = await process(
        desiredByRouteTable([]), // Not in desired (customer removed from config)
        new Set(['tgw-attach-a']), // Known/managed
        ownedSet, // Owned by LZA
      );

      expect(result.filter(r => r.operation === 'deleted')).toHaveLength(1);
    });

    test('should still release for route table moves even when not in owned set', async () => {
      // Attachment is being moved from core to shared — should release even without ownership
      mockSend.mockResolvedValue({
        TransitGatewayAttachments: [currentAttachment('tgw-attach-a', CORE_RT.routeTableId)],
      });
      const emptyOwned = new Set<string>(); // Not owned

      const result = await process(
        desiredByRouteTable([[SHARED_RT.routeTableId, [desiredAttachment()]]]), // Desired at shared (not core)
        new Set(['tgw-attach-a']),
        emptyOwned,
      );

      // Should release from core (move to shared)
      expect(result).toContainEqual(expect.objectContaining({ operation: 'deleted', routeTableName: 'core-rt' }));
      expect(result).toContainEqual(expect.objectContaining({ operation: 'created', routeTableName: 'shared-rt' }));
    });
  });
});
