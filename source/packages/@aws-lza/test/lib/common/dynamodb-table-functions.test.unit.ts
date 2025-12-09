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

import { describe, beforeEach, expect, test, vi } from 'vitest';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { queryDynamoDBTable, putItemsBatch } from '../../../lib/common/dynamodb-table-functions';
import { IDynamoDBPartitionKey, IDynamoDBSortKey, IDynamoDBFilter } from '../../../lib/common/interfaces';
import { DynamoDBFilterOperator } from '../../../lib/common/types';

// Mock dependencies
vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(),
  DescribeTableCommand: vi.fn(),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(),
  },
  ScanCommand: vi.fn(),
  QueryCommand: vi.fn(),
  BatchWriteCommand: vi.fn(),
}));

vi.mock('../../../lib/common/utility', () => ({
  executeApi: vi.fn(),
}));

vi.mock('../../../lib/common/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    dryRun: vi.fn(),
  })),
}));

vi.mock('../../../lib/common/types', () => ({
  MODULE_EXCEPTIONS: {
    INVALID_INPUT: 'InvalidInput',
    SERVICE_EXCEPTION: 'ServiceException',
  },
  DynamoDBFilterOperator: {
    EQUALS: '=',
    GREATER_THAN: '>',
    BEGINS_WITH: 'begins_with',
    BETWEEN: 'between',
    ATTRIBUTE_EXISTS: 'attribute_exists',
    ATTRIBUTE_NOT_EXISTS: 'attribute_not_exists',
    CONTAINS: 'contains',
    ATTRIBUTE_TYPE: 'attribute_type',
    SIZE: 'size',
    IN: 'in',
  },
}));

// Mock constants
const MOCK_CONSTANTS = {
  tableName: 'test-table',
  logPrefix: 'test-prefix',
  client: {} as DynamoDBClient,
  docClient: {
    send: vi.fn(),
  },
  partitionKey: {
    name: 'pk',
    value: 'test-pk-value',
  } as IDynamoDBPartitionKey,
  sortKey: {
    name: 'sk',
    value: 'test-sk-value',
  } as IDynamoDBSortKey,
  mockItems: [
    { id: '1', name: 'item1' },
    { id: '2', name: 'item2' },
  ],
};

describe('dynamodb-table-functions', () => {
  let mockExecuteApi: ReturnType<typeof vi.fn>;
  let mockDocumentClient: ReturnType<typeof vi.fn>;
  let mockLogger: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    dryRun: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const utility = await import('../../../lib/common/utility');
    mockExecuteApi = vi.mocked(utility.executeApi);

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      dryRun: vi.fn(),
    };
    const logger = await import('../../../lib/common/logger');
    vi.mocked(logger.createLogger).mockReturnValue(mockLogger);

    mockDocumentClient = MOCK_CONSTANTS.docClient;
    vi.mocked(DynamoDBDocumentClient.from).mockReturnValue(mockDocumentClient as DynamoDBDocumentClient);
  });

  describe('queryDynamoDBTable', () => {
    describe('scan operations (no partition key or filters)', () => {
      test('should perform scan when no partition key or filters provided', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Scan

        const result = await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
        });

        expect(result).toEqual(MOCK_CONSTANTS.mockItems);
        expect(mockExecuteApi).toHaveBeenCalledTimes(2);
      });

      test('should return undefined when scan returns no items', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: [] }); // Scan

        const result = await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
        });

        expect(result).toBeUndefined();
      });

      test('should return undefined when scan returns undefined items', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: undefined }); // Scan

        const result = await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
        });

        expect(result).toBeUndefined();
      });

      test('should pass limit parameter to scan', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Scan

        await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          limit: 10,
        });

        expect(mockExecuteApi).toHaveBeenNthCalledWith(
          2,
          'ScanCommand',
          { TableName: MOCK_CONSTANTS.tableName, Limit: 10 },
          expect.any(Function),
          expect.anything(),
          MOCK_CONSTANTS.logPrefix,
        );
      });
    });

    describe('query operations (with partition key)', () => {
      test('should perform query with partition key only', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Query

        const result = await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          partitionKey: MOCK_CONSTANTS.partitionKey,
        });

        expect(result).toEqual(MOCK_CONSTANTS.mockItems);
        expect(mockExecuteApi).toHaveBeenNthCalledWith(
          2,
          'QueryCommand',
          expect.objectContaining({
            TableName: MOCK_CONSTANTS.tableName,
            KeyConditionExpression: 'pk = :pk',
            ExpressionAttributeValues: { ':pk': 'test-pk-value' },
          }),
          expect.any(Function),
          expect.anything(),
          MOCK_CONSTANTS.logPrefix,
        );
      });

      test('should perform query with partition key and sort key (equals)', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Query

        await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          partitionKey: MOCK_CONSTANTS.partitionKey,
          sortKey: MOCK_CONSTANTS.sortKey,
        });

        expect(mockExecuteApi).toHaveBeenNthCalledWith(
          2,
          'QueryCommand',
          expect.objectContaining({
            KeyConditionExpression: 'pk = :pk AND sk = :sk1',
            ExpressionAttributeValues: { ':pk': 'test-pk-value', ':sk1': 'test-sk-value' },
          }),
          expect.any(Function),
          expect.anything(),
          MOCK_CONSTANTS.logPrefix,
        );
      });

      test('should handle sort key with begins_with operator', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Query

        await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          partitionKey: MOCK_CONSTANTS.partitionKey,
          sortKey: { ...MOCK_CONSTANTS.sortKey, operator: DynamoDBFilterOperator.BEGINS_WITH },
        });

        expect(mockExecuteApi).toHaveBeenNthCalledWith(
          2,
          'QueryCommand',
          expect.objectContaining({
            KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk1)',
          }),
          expect.any(Function),
          expect.anything(),
          MOCK_CONSTANTS.logPrefix,
        );
      });

      test('should handle sort key with between operator', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Query

        await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          partitionKey: MOCK_CONSTANTS.partitionKey,
          sortKey: {
            ...MOCK_CONSTANTS.sortKey,
            operator: DynamoDBFilterOperator.BETWEEN,
            value2: 'test-sk-value2',
          },
        });

        expect(mockExecuteApi).toHaveBeenNthCalledWith(
          2,
          'QueryCommand',
          expect.objectContaining({
            KeyConditionExpression: 'pk = :pk AND sk BETWEEN :sk1 AND :sk2',
            ExpressionAttributeValues: {
              ':pk': 'test-pk-value',
              ':sk1': 'test-sk-value',
              ':sk2': 'test-sk-value2',
            },
          }),
          expect.any(Function),
          expect.anything(),
          MOCK_CONSTANTS.logPrefix,
        );
      });

      test('should handle sort key with other operators', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Query

        await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          partitionKey: MOCK_CONSTANTS.partitionKey,
          sortKey: { ...MOCK_CONSTANTS.sortKey, operator: DynamoDBFilterOperator.GREATER_THAN },
        });

        expect(mockExecuteApi).toHaveBeenNthCalledWith(
          2,
          'QueryCommand',
          expect.objectContaining({
            KeyConditionExpression: 'pk = :pk AND sk > :sk1',
          }),
          expect.any(Function),
          expect.anything(),
          MOCK_CONSTANTS.logPrefix,
        );
      });

      test('should return undefined when query returns no items', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: [] }); // Query

        const result = await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          partitionKey: MOCK_CONSTANTS.partitionKey,
        });

        expect(result).toBeUndefined();
      });

      test('should handle scanIndexForward and limit parameters', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Query

        await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          partitionKey: MOCK_CONSTANTS.partitionKey,
          scanIndexForward: false,
          limit: 5,
        });

        expect(mockExecuteApi).toHaveBeenNthCalledWith(
          2,
          'QueryCommand',
          expect.objectContaining({
            ScanIndexForward: false,
            Limit: 5,
          }),
          expect.any(Function),
          expect.anything(),
          MOCK_CONSTANTS.logPrefix,
        );
      });
    });

    describe('filter operations', () => {
      const testFilters: IDynamoDBFilter[] = [
        { name: 'status', value: 'active', operator: DynamoDBFilterOperator.EQUALS },
      ];

      test('should handle filters with partition key (query with filter)', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Query

        await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          partitionKey: MOCK_CONSTANTS.partitionKey,
          filters: testFilters,
        });

        expect(mockExecuteApi).toHaveBeenNthCalledWith(
          2,
          'QueryCommand',
          expect.objectContaining({
            FilterExpression: 'status = :val1',
            ExpressionAttributeValues: { ':pk': 'test-pk-value', ':val1': 'active' },
          }),
          expect.any(Function),
          expect.anything(),
          MOCK_CONSTANTS.logPrefix,
        );
      });

      test('should handle filters without partition key (scan with filter)', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Scan

        await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          filters: testFilters,
        });

        expect(mockExecuteApi).toHaveBeenNthCalledWith(
          2,
          'ScanCommand',
          expect.objectContaining({
            FilterExpression: 'status = :val1',
            ExpressionAttributeValues: { ':val1': 'active' },
          }),
          expect.any(Function),
          expect.anything(),
          MOCK_CONSTANTS.logPrefix,
        );
      });

      test('should handle attribute_exists filter', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Scan

        await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          filters: [{ name: 'field', operator: DynamoDBFilterOperator.ATTRIBUTE_EXISTS }],
        });

        expect(mockExecuteApi).toHaveBeenNthCalledWith(
          2,
          'ScanCommand',
          expect.objectContaining({
            FilterExpression: 'attribute_exists(field)',
          }),
          expect.any(Function),
          expect.anything(),
          MOCK_CONSTANTS.logPrefix,
        );
      });

      test('should handle attribute_not_exists filter', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Scan

        await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          filters: [{ name: 'field', operator: DynamoDBFilterOperator.ATTRIBUTE_NOT_EXISTS }],
        });

        expect(mockExecuteApi).toHaveBeenNthCalledWith(
          2,
          'ScanCommand',
          expect.objectContaining({
            FilterExpression: 'attribute_not_exists(field)',
          }),
          expect.any(Function),
          expect.anything(),
          MOCK_CONSTANTS.logPrefix,
        );
      });

      test('should handle begins_with filter', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Scan

        await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          filters: [{ name: 'field', value: 'prefix', operator: DynamoDBFilterOperator.BEGINS_WITH }],
        });

        expect(mockExecuteApi).toHaveBeenNthCalledWith(
          2,
          'ScanCommand',
          expect.objectContaining({
            FilterExpression: 'begins_with(field, :val1)',
            ExpressionAttributeValues: { ':val1': 'prefix' },
          }),
          expect.any(Function),
          expect.anything(),
          MOCK_CONSTANTS.logPrefix,
        );
      });

      test('should handle contains filter', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Scan

        await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          filters: [{ name: 'field', value: 'substring', operator: DynamoDBFilterOperator.CONTAINS }],
        });

        expect(mockExecuteApi).toHaveBeenNthCalledWith(
          2,
          'ScanCommand',
          expect.objectContaining({
            FilterExpression: 'contains(field, :val1)',
            ExpressionAttributeValues: { ':val1': 'substring' },
          }),
          expect.any(Function),
          expect.anything(),
          MOCK_CONSTANTS.logPrefix,
        );
      });

      test('should handle attribute_type filter', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Scan

        await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          filters: [{ name: 'field', value: 'S', operator: DynamoDBFilterOperator.ATTRIBUTE_TYPE }],
        });

        expect(mockExecuteApi).toHaveBeenNthCalledWith(
          2,
          'ScanCommand',
          expect.objectContaining({
            FilterExpression: 'field attribute_type :val1',
            ExpressionAttributeValues: { ':val1': 'S' },
          }),
          expect.any(Function),
          expect.anything(),
          MOCK_CONSTANTS.logPrefix,
        );
      });

      test('should handle size filter', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Scan

        await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          filters: [{ name: 'field', value: 10, operator: DynamoDBFilterOperator.SIZE }],
        });

        expect(mockExecuteApi).toHaveBeenNthCalledWith(
          2,
          'ScanCommand',
          expect.objectContaining({
            FilterExpression: 'field size :val1',
            ExpressionAttributeValues: { ':val1': 10 },
          }),
          expect.any(Function),
          expect.anything(),
          MOCK_CONSTANTS.logPrefix,
        );
      });

      test('should handle between filter', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Scan

        await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          filters: [{ name: 'field', value: 1, value2: 10, operator: DynamoDBFilterOperator.BETWEEN }],
        });

        expect(mockExecuteApi).toHaveBeenNthCalledWith(
          2,
          'ScanCommand',
          expect.objectContaining({
            FilterExpression: 'field BETWEEN :val1 AND :val2',
            ExpressionAttributeValues: { ':val1': 1, ':val2': 10 },
          }),
          expect.any(Function),
          expect.anything(),
          MOCK_CONSTANTS.logPrefix,
        );
      });

      test('should handle in filter', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Scan

        await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          filters: [{ name: 'field', values: ['val1', 'val2', 'val3'], operator: DynamoDBFilterOperator.IN }],
        });

        expect(mockExecuteApi).toHaveBeenNthCalledWith(
          2,
          'ScanCommand',
          expect.objectContaining({
            FilterExpression: 'field IN (:val2, :val3, :val4)',
            ExpressionAttributeValues: { ':val2': 'val1', ':val3': 'val2', ':val4': 'val3' },
          }),
          expect.any(Function),
          expect.anything(),
          MOCK_CONSTANTS.logPrefix,
        );
      });

      test('should handle in filter with no values', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Scan

        await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          filters: [{ name: 'field', operator: DynamoDBFilterOperator.IN }],
        });

        expect(mockExecuteApi).toHaveBeenNthCalledWith(
          2,
          'ScanCommand',
          expect.objectContaining({
            FilterExpression: '',
          }),
          expect.any(Function),
          expect.anything(),
          MOCK_CONSTANTS.logPrefix,
        );
      });

      test('should handle multiple filters with AND operator', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Scan

        await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          filters: [
            { name: 'status', value: 'active' },
            { name: 'type', value: 'user' },
          ],
          filterOperator: 'AND',
        });

        expect(mockExecuteApi).toHaveBeenNthCalledWith(
          2,
          'ScanCommand',
          expect.objectContaining({
            FilterExpression: 'status = :val1 AND type = :val2',
          }),
          expect.any(Function),
          expect.anything(),
          MOCK_CONSTANTS.logPrefix,
        );
      });

      test('should handle multiple filters with OR operator', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Scan

        await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          filters: [
            { name: 'status', value: 'active' },
            { name: 'status', value: 'pending' },
          ],
          filterOperator: 'OR',
        });

        expect(mockExecuteApi).toHaveBeenNthCalledWith(
          2,
          'ScanCommand',
          expect.objectContaining({
            FilterExpression: 'status = :val1 OR status = :val2',
          }),
          expect.any(Function),
          expect.anything(),
          MOCK_CONSTANTS.logPrefix,
        );
      });

      test('should return undefined when scan with filters returns no items', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: [] }); // Scan

        const result = await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          filters: testFilters,
        });

        expect(result).toBeUndefined();
      });
    });

    describe('edge cases', () => {
      test('should return undefined when no partition key and no filters', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Scan (fallback)

        const result = await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
        });

        expect(result).toEqual(MOCK_CONSTANTS.mockItems);
        expect(mockExecuteApi).toHaveBeenCalledTimes(2); // DescribeTable + Scan
      });

      test('should return undefined when no matching conditions at end', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: [] }); // Scan returns empty

        const result = await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          // No partition key, no filters - should perform scan
        });

        expect(result).toBeUndefined();
        expect(mockExecuteApi).toHaveBeenCalledTimes(2); // DescribeTable + Scan
      });

      test('should handle empty filter expression', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Query

        await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          partitionKey: MOCK_CONSTANTS.partitionKey,
          filters: [],
        });

        expect(mockExecuteApi).toHaveBeenNthCalledWith(
          2,
          'QueryCommand',
          expect.objectContaining({
            FilterExpression: '',
          }),
          expect.any(Function),
          expect.anything(),
          MOCK_CONSTANTS.logPrefix,
        );
      });

      test('should handle filters that return empty conditions', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Scan

        await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          filters: [{ name: 'field', operator: DynamoDBFilterOperator.IN }], // IN with no values returns empty
        });

        expect(mockExecuteApi).toHaveBeenNthCalledWith(
          2,
          'ScanCommand',
          expect.objectContaining({
            FilterExpression: '',
          }),
          expect.any(Function),
          expect.anything(),
          MOCK_CONSTANTS.logPrefix,
        );
      });

      test('should handle default operator case in scan filters', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Scan

        await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          filters: [
            { name: 'field1', value: 'test', operator: DynamoDBFilterOperator.GREATER_THAN },
            { name: 'field2', value: 'test2' }, // No operator defaults to EQUALS
          ],
        });

        expect(mockExecuteApi).toHaveBeenNthCalledWith(
          2,
          'ScanCommand',
          expect.objectContaining({
            FilterExpression: 'field1 > :val1 AND field2 = :val2',
          }),
          expect.any(Function),
          expect.anything(),
          MOCK_CONSTANTS.logPrefix,
        );
      });

      test('should handle FilterExpression empty string when no filter conditions', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Query

        await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          partitionKey: MOCK_CONSTANTS.partitionKey,
        });

        expect(mockExecuteApi).toHaveBeenNthCalledWith(
          2,
          'QueryCommand',
          expect.objectContaining({
            FilterExpression: '',
          }),
          expect.any(Function),
          expect.anything(),
          MOCK_CONSTANTS.logPrefix,
        );
      });

      test('should handle query filters with all special operators', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Query

        await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          partitionKey: MOCK_CONSTANTS.partitionKey,
          filters: [
            { name: 'field1', value: 'S', operator: DynamoDBFilterOperator.ATTRIBUTE_TYPE },
            { name: 'field2', value: 10, operator: DynamoDBFilterOperator.SIZE },
          ],
        });

        expect(mockExecuteApi).toHaveBeenNthCalledWith(
          2,
          'QueryCommand',
          expect.objectContaining({
            FilterExpression: 'attribute_type(field1, :val1) AND size(field2) = :val2',
          }),
          expect.any(Function),
          expect.anything(),
          MOCK_CONSTANTS.logPrefix,
        );
      });

      test('should handle scan filters with all special operators', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Scan

        await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          filters: [
            { name: 'field1', value: 'S', operator: DynamoDBFilterOperator.ATTRIBUTE_TYPE },
            { name: 'field2', value: 10, operator: DynamoDBFilterOperator.SIZE },
          ],
        });

        expect(mockExecuteApi).toHaveBeenNthCalledWith(
          2,
          'ScanCommand',
          expect.objectContaining({
            FilterExpression: 'field1 attribute_type :val1 AND field2 size :val2',
          }),
          expect.any(Function),
          expect.anything(),
          MOCK_CONSTANTS.logPrefix,
        );
      });

      test('should handle scan filters with attribute_type and size operators', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Scan

        await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          filters: [
            { name: 'field1', value: 'S', operator: 'attribute_type' as DynamoDBFilterOperator },
            { name: 'field2', value: 10, operator: 'size' as DynamoDBFilterOperator },
          ],
        });

        expect(mockExecuteApi).toHaveBeenNthCalledWith(
          2,
          'ScanCommand',
          expect.objectContaining({
            FilterExpression: 'field1 attribute_type :val1 AND field2 size :val2',
          }),
          expect.any(Function),
          expect.anything(),
          MOCK_CONSTANTS.logPrefix,
        );
      });

      test('should return undefined when no conditions match final case', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: [] }); // Scan returns empty

        const result = await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          // No partition key, no filters - should perform scan and return undefined
        });

        expect(result).toBeUndefined();
        expect(mockExecuteApi).toHaveBeenCalledTimes(2);
      });

      test('should handle query with minimal ExpressionAttributeValues', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Query

        await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          partitionKey: MOCK_CONSTANTS.partitionKey,
          filters: [{ name: 'field', operator: DynamoDBFilterOperator.ATTRIBUTE_EXISTS }],
        });

        expect(mockExecuteApi).toHaveBeenNthCalledWith(
          2,
          'QueryCommand',
          expect.objectContaining({
            ExpressionAttributeValues: { ':pk': 'test-pk-value' }, // Only partition key
            FilterExpression: 'attribute_exists(field)',
          }),
          expect.any(Function),
          expect.anything(),
          MOCK_CONSTANTS.logPrefix,
        );
      });

      test('should handle scan with no ExpressionAttributeValues', async () => {
        mockExecuteApi
          .mockResolvedValueOnce({}) // DescribeTable
          .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Scan

        await queryDynamoDBTable({
          client: MOCK_CONSTANTS.client,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          tableName: MOCK_CONSTANTS.tableName,
          filters: [{ name: 'field', operator: DynamoDBFilterOperator.ATTRIBUTE_EXISTS }],
        });

        expect(mockExecuteApi).toHaveBeenNthCalledWith(
          2,
          'ScanCommand',
          expect.not.objectContaining({
            ExpressionAttributeValues: expect.anything(),
          }),
          expect.any(Function),
          expect.anything(),
          MOCK_CONSTANTS.logPrefix,
        );
      });
    });
  });

  describe('validateTableExists', () => {
    test('should validate table exists through DescribeTable call', async () => {
      mockExecuteApi
        .mockResolvedValueOnce({}) // DescribeTable success
        .mockResolvedValueOnce({ Items: MOCK_CONSTANTS.mockItems }); // Query

      // This is tested indirectly through queryDynamoDBTable calls
      await queryDynamoDBTable({
        client: MOCK_CONSTANTS.client,
        logPrefix: MOCK_CONSTANTS.logPrefix,
        tableName: MOCK_CONSTANTS.tableName,
        partitionKey: MOCK_CONSTANTS.partitionKey,
      });

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'DescribeTableCommand',
        { TableName: MOCK_CONSTANTS.tableName },
        expect.any(Function),
        expect.anything(),
        MOCK_CONSTANTS.logPrefix,
      );
    });
  });

  describe('putItemsBatch', () => {
    test('should validate table exists', async () => {
      mockExecuteApi
        .mockResolvedValueOnce({}) // DescribeTable
        .mockResolvedValue({}); // BatchWrite

      await putItemsBatch({
        client: MOCK_CONSTANTS.client,
        tableName: MOCK_CONSTANTS.tableName,
        items: MOCK_CONSTANTS.mockItems,
        dryRun: false,
        logPrefix: MOCK_CONSTANTS.logPrefix,
      });

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'DescribeTableCommand',
        { TableName: MOCK_CONSTANTS.tableName },
        expect.any(Function),
        expect.anything(),
        MOCK_CONSTANTS.logPrefix,
      );
    });

    test('should handle empty items array', async () => {
      mockExecuteApi.mockResolvedValueOnce({}); // DescribeTable

      await putItemsBatch({
        client: MOCK_CONSTANTS.client,
        tableName: MOCK_CONSTANTS.tableName,
        items: [],
        dryRun: false,
        logPrefix: MOCK_CONSTANTS.logPrefix,
      });

      expect(mockExecuteApi).toHaveBeenCalledTimes(1);
    });

    test('should throw error for invalid items', async () => {
      mockExecuteApi.mockResolvedValueOnce({}); // DescribeTable

      const invalidItems = [{ id: '1' }, null, 'invalid'];

      await expect(
        putItemsBatch({
          client: MOCK_CONSTANTS.client,
          tableName: MOCK_CONSTANTS.tableName,
          items: invalidItems as Record<string, unknown>[],
          dryRun: false,
          logPrefix: MOCK_CONSTANTS.logPrefix,
        }),
      ).rejects.toThrow('InvalidInput: Item at index 1 is not a valid object, Item at index 2 is not a valid object');
    });

    test('should perform dry run', async () => {
      mockExecuteApi.mockResolvedValueOnce({}); // DescribeTable

      await putItemsBatch({
        client: MOCK_CONSTANTS.client,
        tableName: MOCK_CONSTANTS.tableName,
        items: MOCK_CONSTANTS.mockItems,
        dryRun: true,
        logPrefix: MOCK_CONSTANTS.logPrefix,
      });

      expect(mockExecuteApi).toHaveBeenCalledTimes(1);
    });

    test('should process batch successfully', async () => {
      mockExecuteApi
        .mockResolvedValueOnce({}) // DescribeTable
        .mockResolvedValueOnce({}); // BatchWrite

      await putItemsBatch({
        client: MOCK_CONSTANTS.client,
        tableName: MOCK_CONSTANTS.tableName,
        items: MOCK_CONSTANTS.mockItems,
        dryRun: false,
        logPrefix: MOCK_CONSTANTS.logPrefix,
      });

      expect(mockExecuteApi).toHaveBeenCalledTimes(2);
    });

    test('should handle unprocessed items with retry', async () => {
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = vi.fn(callback => {
        callback();
        return 1 as NodeJS.Timeout;
      });

      mockExecuteApi
        .mockResolvedValueOnce({}) // DescribeTable
        .mockResolvedValueOnce({
          UnprocessedItems: {
            [MOCK_CONSTANTS.tableName]: [{ PutRequest: { Item: { id: '1' } } }],
          },
        })
        .mockResolvedValueOnce({}); // Retry succeeds

      await putItemsBatch({
        client: MOCK_CONSTANTS.client,
        tableName: MOCK_CONSTANTS.tableName,
        items: MOCK_CONSTANTS.mockItems,
        dryRun: false,
        logPrefix: MOCK_CONSTANTS.logPrefix,
      });

      expect(mockExecuteApi).toHaveBeenCalledTimes(3);

      global.setTimeout = originalSetTimeout;
    });

    test('should throw error when max retries exceeded', async () => {
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = vi.fn(callback => {
        callback();
        return 1 as NodeJS.Timeout;
      });

      mockExecuteApi
        .mockResolvedValueOnce({}) // DescribeTable
        .mockResolvedValue({
          UnprocessedItems: {
            [MOCK_CONSTANTS.tableName]: [{ PutRequest: { Item: { id: '1' } } }],
          },
        });

      await expect(
        putItemsBatch({
          client: MOCK_CONSTANTS.client,
          tableName: MOCK_CONSTANTS.tableName,
          items: MOCK_CONSTANTS.mockItems,
          dryRun: false,
          logPrefix: MOCK_CONSTANTS.logPrefix,
        }),
      ).rejects.toThrow(
        'ServiceException: Failed to process all items in batch 1 after 3 retries. 1 items remain unprocessed',
      );

      global.setTimeout = originalSetTimeout;
    }, 10000);

    test('should split large batches', async () => {
      const largeItems = Array.from({ length: 60 }, (_, i) => ({ id: `${i + 1}` }));

      mockExecuteApi
        .mockResolvedValueOnce({}) // DescribeTable
        .mockResolvedValue({}); // BatchWrite calls

      await putItemsBatch({
        client: MOCK_CONSTANTS.client,
        tableName: MOCK_CONSTANTS.tableName,
        items: largeItems,
        dryRun: false,
        logPrefix: MOCK_CONSTANTS.logPrefix,
      });

      expect(mockExecuteApi).toHaveBeenCalledTimes(4); // 1 DescribeTable + 3 BatchWrite
    });

    test('should handle undefined items', async () => {
      mockExecuteApi.mockResolvedValueOnce({}); // DescribeTable

      await putItemsBatch({
        client: MOCK_CONSTANTS.client,
        tableName: MOCK_CONSTANTS.tableName,
        items: undefined as unknown as Record<string, unknown>[],
        dryRun: false,
        logPrefix: MOCK_CONSTANTS.logPrefix,
      });

      expect(mockExecuteApi).toHaveBeenCalledTimes(1);
    });

    test('should handle empty unprocessed items response', async () => {
      mockExecuteApi
        .mockResolvedValueOnce({}) // DescribeTable
        .mockResolvedValueOnce({ UnprocessedItems: {} }); // BatchWrite with empty unprocessed

      await putItemsBatch({
        client: MOCK_CONSTANTS.client,
        tableName: MOCK_CONSTANTS.tableName,
        items: MOCK_CONSTANTS.mockItems,
        dryRun: false,
        logPrefix: MOCK_CONSTANTS.logPrefix,
      });

      expect(mockExecuteApi).toHaveBeenCalledTimes(2);
    });

    test('should handle undefined unprocessed items', async () => {
      mockExecuteApi
        .mockResolvedValueOnce({}) // DescribeTable
        .mockResolvedValueOnce({ UnprocessedItems: undefined }); // BatchWrite with undefined unprocessed

      await putItemsBatch({
        client: MOCK_CONSTANTS.client,
        tableName: MOCK_CONSTANTS.tableName,
        items: MOCK_CONSTANTS.mockItems,
        dryRun: false,
        logPrefix: MOCK_CONSTANTS.logPrefix,
      });

      expect(mockExecuteApi).toHaveBeenCalledTimes(2);
    });

    test('should handle unprocessed items with undefined table entry', async () => {
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = vi.fn(callback => {
        callback();
        return 1 as NodeJS.Timeout;
      });

      mockExecuteApi
        .mockResolvedValueOnce({}) // DescribeTable
        .mockResolvedValueOnce({
          UnprocessedItems: {
            [MOCK_CONSTANTS.tableName]: undefined,
          },
        })
        .mockResolvedValueOnce({}); // Second call succeeds

      await putItemsBatch({
        client: MOCK_CONSTANTS.client,
        tableName: MOCK_CONSTANTS.tableName,
        items: MOCK_CONSTANTS.mockItems,
        dryRun: false,
        logPrefix: MOCK_CONSTANTS.logPrefix,
      });

      expect(mockExecuteApi).toHaveBeenCalledTimes(3);
      global.setTimeout = originalSetTimeout;
    });
  });
});
