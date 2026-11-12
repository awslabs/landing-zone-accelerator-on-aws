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
import * as awsLza from 'aws-lza';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAllRetentionStates,
  getRetentionState,
  saveRetentionState,
  updateRetentionStatus,
} from '../../../../lib/actions/resource-retention/retention-state.js';
import { RetentionStatus, type IResourceRetentionState } from '../../../../lib/actions/resource-retention/types.js';
import * as dynamodb from '../../../../lib/actions/utils/dynamodb.js';
import type { ModuleParams } from '../../../../lib/types.js';

// Mock node:path
vi.mock('node:path', () => ({
  default: {
    parse: vi.fn(function () {
      return { name: 'retention-state' };
    }),
    basename: vi.fn(() => 'retention-state.ts'),
  },
}));

// Mock aws-lza module
vi.mock('aws-lza', () => ({
  createLogger: vi.fn(function () {
    return {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
  }),
  createStatusLogger: vi.fn(function () {
    return {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
  }),
  queryDynamoDBTable: vi.fn(),
}));

// Mock dynamodb module
vi.mock('../../../../lib/actions/utils/dynamodb.js', () => ({
  createDynamoDBClient: vi.fn(function () {
    return { send: vi.fn() };
  }),
  getItem: vi.fn(),
  putItem: vi.fn(),
  getModuleResourcePrefix: vi.fn(() => 'AWSAccelerator'),
}));

describe('retention-state utils', () => {
  const mockParams: ModuleParams = {
    runnerParameters: {
      sessionContext: {
        globalRegion: 'us-east-1',
        region: 'us-east-1',
        invokingAccountId: '123456789012',
      },
      solutionId: 'AwsSolution/SO0199/v1.0.0',
    },
    moduleRunnerParameters: {
      resourcePrefixes: {
        accelerator: 'AWSAccelerator',
      },
      managementAccountCredentials: undefined,
    },
  } as unknown as ModuleParams;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getRetentionState', () => {
    it('should retrieve retention state successfully', async () => {
      const mockState = {
        serviceName: 'macie',
        accountId: '111111111111',
        region: 'us-west-2',
        stackName: 'AWSAccelerator-SecurityStack-111111111111-us-west-2',
        resourceTypes: ['Custom::MacieExportConfigClassification'],
        retentionStatus: 'COMPLETED',
        retentionTime: '2024-01-15T10:30:00.000Z',
        retentionAttempts: 1,
        lastError: undefined,
        resourcesRetained: true,
      };

      vi.mocked(dynamodb.getItem).mockResolvedValue(mockState);

      const result = await getRetentionState(
        'macie',
        '111111111111',
        'us-west-2',
        'AWSAccelerator-SecurityStack-111111111111-us-west-2',
        mockParams,
        'test-prefix',
      );

      expect(result).toEqual(mockState);
      expect(dynamodb.getItem).toHaveBeenCalledWith(
        expect.anything(),
        'AWSAccelerator-Resource-Retention-123456789012-us-east-1',
        {
          PK: 'RETENTION#macie',
          SK: 'STACK#111111111111#us-west-2#AWSAccelerator-SecurityStack-111111111111-us-west-2',
        },
        'test-prefix',
      );
    });

    it('should return undefined when retention state not found', async () => {
      vi.mocked(dynamodb.getItem).mockResolvedValue(null);

      const result = await getRetentionState(
        'macie',
        '111111111111',
        'us-west-2',
        'AWSAccelerator-SecurityStack-111111111111-us-west-2',
        mockParams,
        'test-prefix',
      );

      expect(result).toBeUndefined();
    });

    it('should return undefined on error', async () => {
      vi.mocked(dynamodb.getItem).mockRejectedValue(new Error('DynamoDB error'));

      const result = await getRetentionState(
        'macie',
        '111111111111',
        'us-west-2',
        'AWSAccelerator-SecurityStack-111111111111-us-west-2',
        mockParams,
        'test-prefix',
      );

      expect(result).toBeUndefined();
    });
  });

  describe('saveRetentionState', () => {
    it('should save retention state successfully', async () => {
      vi.mocked(dynamodb.putItem).mockResolvedValue(undefined);

      const state: IResourceRetentionState = {
        serviceName: 'macie',
        accountId: '111111111111',
        region: 'us-west-2',
        stackName: 'AWSAccelerator-SecurityStack-111111111111-us-west-2',
        resourceTypes: ['Custom::MacieExportConfigClassification'],
        retentionStatus: RetentionStatus.COMPLETED,
        retentionTime: '2024-01-15T10:30:00.000Z',
        retentionAttempts: 1,
        lastError: undefined,
        resourcesRetained: true,
      };

      await saveRetentionState(state, mockParams, 'test-prefix', false);

      expect(dynamodb.putItem).toHaveBeenCalledWith(
        expect.anything(),
        'AWSAccelerator-Resource-Retention-123456789012-us-east-1',
        {
          PK: 'RETENTION#macie',
          SK: 'STACK#111111111111#us-west-2#AWSAccelerator-SecurityStack-111111111111-us-west-2',
          serviceName: 'macie',
          accountId: '111111111111',
          region: 'us-west-2',
          stackName: 'AWSAccelerator-SecurityStack-111111111111-us-west-2',
          resourceTypes: ['Custom::MacieExportConfigClassification'],
          retentionStatus: RetentionStatus.COMPLETED,
          retentionTime: '2024-01-15T10:30:00.000Z',
          retentionAttempts: 1,
          lastError: undefined,
          resourcesRetained: true,
        },
        'test-prefix',
        false,
      );
    });

    it('should save retention state in dry run mode', async () => {
      vi.mocked(dynamodb.putItem).mockResolvedValue(undefined);

      const state: IResourceRetentionState = {
        serviceName: 'macie',
        accountId: '111111111111',
        region: 'us-west-2',
        stackName: 'AWSAccelerator-SecurityStack-111111111111-us-west-2',
        resourceTypes: ['Custom::MacieExportConfigClassification'],
        retentionStatus: RetentionStatus.IN_PROGRESS,
        retentionTime: undefined,
        retentionAttempts: 0,
        lastError: undefined,
        resourcesRetained: false,
      };

      await saveRetentionState(state, mockParams, 'test-prefix', true);

      expect(dynamodb.putItem).toHaveBeenCalledWith(
        expect.anything(),
        'AWSAccelerator-Resource-Retention-123456789012-us-east-1',
        expect.objectContaining({
          retentionStatus: RetentionStatus.IN_PROGRESS,
        }),
        'test-prefix',
        true,
      );
    });

    it('should not throw error when save fails', async () => {
      vi.mocked(dynamodb.putItem).mockRejectedValue(new Error('DynamoDB error'));

      const state: IResourceRetentionState = {
        serviceName: 'macie',
        accountId: '111111111111',
        region: 'us-west-2',
        stackName: 'AWSAccelerator-SecurityStack-111111111111-us-west-2',
        resourceTypes: ['Custom::MacieExportConfigClassification'],
        retentionStatus: RetentionStatus.COMPLETED,
        retentionTime: '2024-01-15T10:30:00.000Z',
        retentionAttempts: 1,
        lastError: undefined,
        resourcesRetained: true,
      };

      await expect(saveRetentionState(state, mockParams, 'test-prefix', false)).resolves.toBeUndefined();
    });
  });

  describe('updateRetentionStatus', () => {
    it('should update retention status to COMPLETED', async () => {
      const existingState = {
        serviceName: 'macie',
        accountId: '111111111111',
        region: 'us-west-2',
        stackName: 'AWSAccelerator-SecurityStack-111111111111-us-west-2',
        resourceTypes: ['Custom::MacieExportConfigClassification'],
        retentionStatus: 'IN_PROGRESS',
        retentionTime: undefined,
        retentionAttempts: 0,
        lastError: undefined,
        resourcesRetained: false,
      };

      vi.mocked(dynamodb.getItem).mockResolvedValue(existingState);
      vi.mocked(dynamodb.putItem).mockResolvedValue(undefined);

      await updateRetentionStatus(
        {
          serviceName: 'macie',
          accountId: '111111111111',
          region: 'us-west-2',
          stackName: 'AWSAccelerator-SecurityStack-111111111111-us-west-2',
          status: RetentionStatus.COMPLETED,
          dryRun: false,
        },
        mockParams,
        'test-prefix',
      );

      expect(dynamodb.putItem).toHaveBeenCalledWith(
        expect.anything(),
        'AWSAccelerator-Resource-Retention-123456789012-us-east-1',
        expect.objectContaining({
          retentionStatus: RetentionStatus.COMPLETED,
          retentionAttempts: 0,
          resourcesRetained: true,
        }),
        'test-prefix',
        false,
      );
    });

    it('should update retention status to FAILED and increment attempts', async () => {
      const existingState = {
        serviceName: 'macie',
        accountId: '111111111111',
        region: 'us-west-2',
        stackName: 'AWSAccelerator-SecurityStack-111111111111-us-west-2',
        resourceTypes: ['Custom::MacieExportConfigClassification'],
        retentionStatus: 'IN_PROGRESS',
        retentionTime: undefined,
        retentionAttempts: 1,
        lastError: undefined,
        resourcesRetained: false,
      };

      vi.mocked(dynamodb.getItem).mockResolvedValue(existingState);
      vi.mocked(dynamodb.putItem).mockResolvedValue(undefined);

      await updateRetentionStatus(
        {
          serviceName: 'macie',
          accountId: '111111111111',
          region: 'us-west-2',
          stackName: 'AWSAccelerator-SecurityStack-111111111111-us-west-2',
          status: RetentionStatus.FAILED,
          error: 'Stack not found',
          dryRun: false,
        },
        mockParams,
        'test-prefix',
      );

      expect(dynamodb.putItem).toHaveBeenCalledWith(
        expect.anything(),
        'AWSAccelerator-Resource-Retention-123456789012-us-east-1',
        expect.objectContaining({
          retentionStatus: RetentionStatus.FAILED,
          retentionAttempts: 2,
          lastError: 'Stack not found',
          resourcesRetained: false,
        }),
        'test-prefix',
        false,
      );
    });

    it('should update retention status to NOT_FOUND', async () => {
      const existingState = {
        serviceName: 'macie',
        accountId: '111111111111',
        region: 'us-west-2',
        stackName: 'AWSAccelerator-SecurityStack-111111111111-us-west-2',
        resourceTypes: ['Custom::MacieExportConfigClassification'],
        retentionStatus: 'IN_PROGRESS',
        retentionTime: undefined,
        retentionAttempts: 0,
        lastError: undefined,
        resourcesRetained: false,
      };

      vi.mocked(dynamodb.getItem).mockResolvedValue(existingState);
      vi.mocked(dynamodb.putItem).mockResolvedValue(undefined);

      await updateRetentionStatus(
        {
          serviceName: 'macie',
          accountId: '111111111111',
          region: 'us-west-2',
          stackName: 'AWSAccelerator-SecurityStack-111111111111-us-west-2',
          status: RetentionStatus.NOT_FOUND,
          dryRun: false,
        },
        mockParams,
        'test-prefix',
      );

      expect(dynamodb.putItem).toHaveBeenCalledWith(
        expect.anything(),
        'AWSAccelerator-Resource-Retention-123456789012-us-east-1',
        expect.objectContaining({
          retentionStatus: RetentionStatus.NOT_FOUND,
          resourcesRetained: true,
        }),
        'test-prefix',
        false,
      );
    });

    it('should not update when existing state not found', async () => {
      vi.mocked(dynamodb.getItem).mockResolvedValue(null);

      await updateRetentionStatus(
        {
          serviceName: 'macie',
          accountId: '111111111111',
          region: 'us-west-2',
          stackName: 'AWSAccelerator-SecurityStack-111111111111-us-west-2',
          status: RetentionStatus.COMPLETED,
          dryRun: false,
        },
        mockParams,
        'test-prefix',
      );

      expect(dynamodb.putItem).not.toHaveBeenCalled();
    });

    it('should not throw error when update fails', async () => {
      vi.mocked(dynamodb.getItem).mockRejectedValue(new Error('DynamoDB error'));

      await expect(
        updateRetentionStatus(
          {
            serviceName: 'macie',
            accountId: '111111111111',
            region: 'us-west-2',
            stackName: 'AWSAccelerator-SecurityStack-111111111111-us-west-2',
            status: RetentionStatus.COMPLETED,
            dryRun: false,
          },
          mockParams,
          'test-prefix',
        ),
      ).resolves.toBeUndefined();
    });

    it('should persist resourceTypes when provided in config', async () => {
      const existingState = {
        serviceName: 'guardduty',
        accountId: '111111111111',
        region: 'us-east-1',
        stackName: 'AWSAccelerator-SecurityAuditStack-111111111111-us-east-1',
        resourceTypes: ['Custom::GuardDutyCreateMembers'],
        retentionStatus: 'IN_PROGRESS',
        retentionTime: undefined,
        retentionAttempts: 0,
        lastError: undefined,
        resourcesRetained: false,
      };

      vi.mocked(dynamodb.getItem).mockResolvedValue(existingState);
      vi.mocked(dynamodb.putItem).mockResolvedValue(undefined);

      await updateRetentionStatus(
        {
          serviceName: 'guardduty',
          accountId: '111111111111',
          region: 'us-east-1',
          stackName: 'AWSAccelerator-SecurityAuditStack-111111111111-us-east-1',
          status: RetentionStatus.COMPLETED,
          dryRun: false,
          resourceTypes: ['Custom::GuardDutyCreateMembers', 'Custom::GuardDutyUpdateDetector'],
        },
        mockParams,
        'test-prefix',
      );

      expect(dynamodb.putItem).toHaveBeenCalledWith(
        expect.anything(),
        'AWSAccelerator-Resource-Retention-123456789012-us-east-1',
        expect.objectContaining({
          resourceTypes: ['Custom::GuardDutyCreateMembers', 'Custom::GuardDutyUpdateDetector'],
          retentionStatus: RetentionStatus.COMPLETED,
        }),
        'test-prefix',
        false,
      );
    });
  });

  describe('getAllRetentionStates', () => {
    it('should retrieve all retention states with pagination', async () => {
      const mockItems = [
        {
          serviceName: 'macie',
          accountId: '111111111111',
          region: 'us-west-2',
          stackName: 'AWSAccelerator-SecurityStack-111111111111-us-west-2',
          resourceTypes: ['Custom::MacieExportConfigClassification'],
          retentionStatus: 'COMPLETED',
          retentionTime: '2024-01-15T10:30:00.000Z',
          retentionAttempts: 1,
          lastError: undefined,
          resourcesRetained: true,
        },
        {
          serviceName: 'macie',
          accountId: '222222222222',
          region: 'us-east-1',
          stackName: 'AWSAccelerator-SecurityStack-222222222222-us-east-1',
          resourceTypes: ['Custom::MacieExportConfigClassification'],
          retentionStatus: 'IN_PROGRESS',
          retentionTime: undefined,
          retentionAttempts: 0,
          lastError: undefined,
          resourcesRetained: false,
        },
      ];

      vi.mocked(awsLza.queryDynamoDBTable).mockResolvedValue({
        items: mockItems,
        lastEvaluatedKey: undefined,
        pageCount: 1,
        totalItems: 2,
      });

      const result = await getAllRetentionStates('macie', mockParams, 'test-prefix');

      expect(result.size).toBe(2);
      expect(result.get('111111111111:us-west-2:AWSAccelerator-SecurityStack-111111111111-us-west-2')).toEqual(
        mockItems[0],
      );
      expect(result.get('222222222222:us-east-1:AWSAccelerator-SecurityStack-222222222222-us-east-1')).toEqual(
        mockItems[1],
      );

      expect(awsLza.queryDynamoDBTable).toHaveBeenCalledWith({
        client: expect.anything(),
        logPrefix: 'test-prefix',
        tableName: 'AWSAccelerator-Resource-Retention-123456789012-us-east-1',
        partitionKey: {
          name: 'PK',
          value: 'RETENTION#macie',
        },
        pagination: { enabled: true },
      });
    });

    it('should return empty map when no retention states found', async () => {
      vi.mocked(awsLza.queryDynamoDBTable).mockResolvedValue({
        items: [],
        lastEvaluatedKey: undefined,
        pageCount: 1,
        totalItems: 0,
      });

      const result = await getAllRetentionStates('macie', mockParams, 'test-prefix');

      expect(result.size).toBe(0);
    });

    it('should warn when pagination limit reached', async () => {
      const mockItems = [
        {
          serviceName: 'macie',
          accountId: '111111111111',
          region: 'us-west-2',
          stackName: 'AWSAccelerator-SecurityStack-111111111111-us-west-2',
          resourceTypes: ['Custom::MacieExportConfigClassification'],
          retentionStatus: 'COMPLETED',
          retentionTime: '2024-01-15T10:30:00.000Z',
          retentionAttempts: 1,
          lastError: undefined,
          resourcesRetained: true,
        },
      ];

      vi.mocked(awsLza.queryDynamoDBTable).mockResolvedValue({
        items: mockItems,
        lastEvaluatedKey: { PK: 'RETENTION#macie', SK: 'STACK#...' },
        pageCount: 5,
        totalItems: 10000,
      });

      const result = await getAllRetentionStates('macie', mockParams, 'test-prefix');

      expect(result.size).toBe(1);
    });

    it('should return empty map on error', async () => {
      vi.mocked(awsLza.queryDynamoDBTable).mockRejectedValue(new Error('DynamoDB error'));

      const result = await getAllRetentionStates('macie', mockParams, 'test-prefix');

      expect(result.size).toBe(0);
    });
  });
});
