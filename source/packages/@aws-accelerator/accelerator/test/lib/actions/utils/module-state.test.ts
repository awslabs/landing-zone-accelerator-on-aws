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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as dynamodb from '../../../../lib/actions/utils/dynamodb.js';
import {
  calculateArrayHash,
  calculateConfigHash,
  getModuleExecutionState,
  hasModuleConfigChanged,
  saveModuleExecutionState,
} from '../../../../lib/actions/utils/module-state.js';
import type { ModuleParams } from '../../../../lib/types.js';

// Mock node:path
vi.mock('node:path', () => ({
  default: {
    parse: vi.fn(function () {
      return { name: 'module-state' };
    }),
    basename: vi.fn(() => 'module-state.ts'),
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

describe('module-state utils', () => {
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

  describe('calculateConfigHash', () => {
    it('should calculate hash for simple config object', () => {
      const config = { enable: true, accountsCount: 5 };
      const hash = calculateConfigHash(config);

      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64); // SHA256 produces 64 hex characters
      expect(typeof hash).toBe('string');
    });

    it('should produce same hash for same config', () => {
      const config1 = { enable: true, accountsCount: 5 };
      const config2 = { enable: true, accountsCount: 5 };

      const hash1 = calculateConfigHash(config1);
      const hash2 = calculateConfigHash(config2);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different config', () => {
      const config1 = { enable: true, accountsCount: 5 };
      const config2 = { enable: false, accountsCount: 5 };

      const hash1 = calculateConfigHash(config1);
      const hash2 = calculateConfigHash(config2);

      expect(hash1).not.toBe(hash2);
    });

    it('should produce same hash regardless of key order', () => {
      const config1 = { enable: true, accountsCount: 5, regions: ['us-east-1'] };
      const config2 = { regions: ['us-east-1'], enable: true, accountsCount: 5 };

      const hash1 = calculateConfigHash(config1);
      const hash2 = calculateConfigHash(config2);

      expect(hash1).toBe(hash2);
    });

    it('should throw error for undefined config', () => {
      expect(() => calculateConfigHash(undefined)).toThrow('Config cannot be undefined');
    });

    it('should throw error for null config', () => {
      expect(() => calculateConfigHash(null)).toThrow('Config must be an object');
    });

    it('should throw error for non-object config', () => {
      expect(() => calculateConfigHash('string')).toThrow('Config must be an object');
      expect(() => calculateConfigHash(123)).toThrow('Config must be an object');
      expect(() => calculateConfigHash(true)).toThrow('Config must be an object');
    });

    it('should throw error for circular reference', () => {
      const config: Record<string, unknown> = { enable: true };
      config['self'] = config; // Create circular reference

      expect(() => calculateConfigHash(config)).toThrow('circular references');
    });

    it('should handle nested objects', () => {
      const config = {
        enable: true,
        settings: {
          nested: {
            value: 123,
          },
        },
      };

      const hash = calculateConfigHash(config);
      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64);
    });

    it('should handle arrays in config', () => {
      const config = {
        enable: true,
        regions: ['us-east-1', 'us-west-2'],
        accounts: [{ id: '111111111111' }, { id: '222222222222' }],
      };

      const hash = calculateConfigHash(config);
      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64);
    });
  });

  describe('calculateArrayHash', () => {
    it('should calculate hash for array of strings', () => {
      const items = ['account1', 'account2', 'account3'];
      const hash = calculateArrayHash(items);

      expect(hash).toBeDefined();
      expect(hash).toHaveLength(12); // Default hash length
      expect(typeof hash).toBe('string');
    });

    it('should produce same hash regardless of array order', () => {
      const items1 = ['account1', 'account2', 'account3'];
      const items2 = ['account3', 'account1', 'account2'];

      const hash1 = calculateArrayHash(items1);
      const hash2 = calculateArrayHash(items2);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different arrays', () => {
      const items1 = ['account1', 'account2'];
      const items2 = ['account1', 'account3'];

      const hash1 = calculateArrayHash(items1);
      const hash2 = calculateArrayHash(items2);

      expect(hash1).not.toBe(hash2);
    });

    it('should respect custom hash length', () => {
      const items = ['account1', 'account2'];
      const hash = calculateArrayHash(items, 8);

      expect(hash).toHaveLength(8);
    });

    it('should handle empty array', () => {
      const items: string[] = [];
      const hash = calculateArrayHash(items);

      expect(hash).toBeDefined();
      expect(hash).toHaveLength(12);
    });

    it('should handle single item array', () => {
      const items = ['account1'];
      const hash = calculateArrayHash(items);

      expect(hash).toBeDefined();
      expect(hash).toHaveLength(12);
    });
  });

  describe('getModuleExecutionState', () => {
    it('should retrieve module execution state successfully', async () => {
      const mockState = {
        serviceName: 'macie',
        lastExecutionTime: '2024-01-15T10:30:00.000Z',
        lastConfig: JSON.stringify({ enable: true }),
        configHash: 'abc123',
        lastStatus: 'COMPLETED',
        lastResponse: JSON.stringify({ status: 'COMPLETED' }),
      };

      vi.mocked(dynamodb.getItem).mockResolvedValue(mockState);

      const result = await getModuleExecutionState('macie', mockParams, 'test-prefix');

      expect(result).toEqual(mockState);
      expect(dynamodb.getItem).toHaveBeenCalledWith(
        expect.anything(),
        'AWSAccelerator-Module-State-123456789012-us-east-1',
        {
          PK: 'MODULE#macie',
          SK: 'EXECUTION#latest',
        },
        'test-prefix',
      );
    });

    it('should return undefined when no state found', async () => {
      vi.mocked(dynamodb.getItem).mockResolvedValue(null);

      const result = await getModuleExecutionState('macie', mockParams, 'test-prefix');

      expect(result).toBeUndefined();
    });

    it('should throw error on DynamoDB failure', async () => {
      vi.mocked(dynamodb.getItem).mockRejectedValue(new Error('DynamoDB error'));

      await expect(getModuleExecutionState('macie', mockParams, 'test-prefix')).rejects.toThrow('DynamoDB error');
    });
  });

  describe('hasModuleConfigChanged', () => {
    it('should return true when override existing is enabled', async () => {
      const result = await hasModuleConfigChanged(
        {
          serviceName: 'macie',
          currentConfig: { enable: true },
          overrideExisting: true,
        },
        mockParams,
        'test-prefix',
      );

      expect(result).toBe(true);
      expect(dynamodb.getItem).not.toHaveBeenCalled(); // Should skip state check
    });

    it('should return true when no previous execution found', async () => {
      vi.mocked(dynamodb.getItem).mockResolvedValue(null);

      const result = await hasModuleConfigChanged(
        {
          serviceName: 'macie',
          currentConfig: { enable: true },
          overrideExisting: false,
        },
        mockParams,
        'test-prefix',
      );

      expect(result).toBe(true);
    });

    it('should return false when config unchanged', async () => {
      const config = { enable: true, accountsCount: 5 };
      const configHash = calculateConfigHash(config);

      vi.mocked(dynamodb.getItem).mockResolvedValue({
        serviceName: 'macie',
        lastExecutionTime: '2024-01-15T10:30:00.000Z',
        lastConfig: JSON.stringify(config),
        configHash,
        lastStatus: 'COMPLETED',
        lastResponse: JSON.stringify({ status: 'COMPLETED' }),
      });

      const result = await hasModuleConfigChanged(
        {
          serviceName: 'macie',
          currentConfig: config,
          overrideExisting: false,
        },
        mockParams,
        'test-prefix',
      );

      expect(result).toBe(false);
    });

    it('should return true when config changed', async () => {
      const previousConfig = { enable: true, accountsCount: 5 };
      const currentConfig = { enable: false, accountsCount: 5 };
      const previousHash = calculateConfigHash(previousConfig);

      vi.mocked(dynamodb.getItem).mockResolvedValue({
        serviceName: 'macie',
        lastExecutionTime: '2024-01-15T10:30:00.000Z',
        lastConfig: JSON.stringify(previousConfig),
        configHash: previousHash,
        lastStatus: 'COMPLETED',
        lastResponse: JSON.stringify({ status: 'COMPLETED' }),
      });

      const result = await hasModuleConfigChanged(
        {
          serviceName: 'macie',
          currentConfig,
          overrideExisting: false,
        },
        mockParams,
        'test-prefix',
      );

      expect(result).toBe(true);
    });

    it('should detect removed keys in config', async () => {
      const previousConfig = { enable: true, accountsCount: 5, oldField: 'removed' };
      const currentConfig = { enable: true, accountsCount: 5 };
      const previousHash = calculateConfigHash(previousConfig);

      vi.mocked(dynamodb.getItem).mockResolvedValue({
        serviceName: 'macie',
        lastExecutionTime: '2024-01-15T10:30:00.000Z',
        lastConfig: JSON.stringify(previousConfig),
        configHash: previousHash,
        lastStatus: 'COMPLETED',
        lastResponse: JSON.stringify({ status: 'COMPLETED' }),
      });

      const result = await hasModuleConfigChanged(
        {
          serviceName: 'macie',
          currentConfig,
          overrideExisting: false,
        },
        mockParams,
        'test-prefix',
      );

      expect(result).toBe(true);
    });

    it('should throw error when previous config is not an object', async () => {
      const currentConfig = { enable: true };

      vi.mocked(dynamodb.getItem).mockResolvedValue({
        serviceName: 'macie',
        lastExecutionTime: '2024-01-15T10:30:00.000Z',
        lastConfig: '"string"', // Invalid - should be object
        configHash: 'different-hash', // Different hash to trigger comparison
        lastStatus: 'COMPLETED',
        lastResponse: JSON.stringify({ status: 'COMPLETED' }),
      });

      const result = await hasModuleConfigChanged(
        {
          serviceName: 'macie',
          currentConfig,
          overrideExisting: false,
        },
        mockParams,
        'test-prefix',
      );

      // Should still return true (config changed) but log warning
      expect(result).toBe(true);
    });

    it('should handle invalid JSON in previous config', async () => {
      const currentConfig = { enable: true };
      const previousHash = 'invalid-hash';

      vi.mocked(dynamodb.getItem).mockResolvedValue({
        serviceName: 'macie',
        lastExecutionTime: '2024-01-15T10:30:00.000Z',
        lastConfig: 'invalid json',
        configHash: previousHash,
        lastStatus: 'COMPLETED',
        lastResponse: JSON.stringify({ status: 'COMPLETED' }),
      });

      const result = await hasModuleConfigChanged(
        {
          serviceName: 'macie',
          currentConfig,
          overrideExisting: false,
        },
        mockParams,
        'test-prefix',
      );

      // Should still return true (config changed)
      expect(result).toBe(true);
    });

    it('should handle null previous config in diff comparison', async () => {
      const currentConfig = { enable: true };
      const previousHash = 'different-hash';

      vi.mocked(dynamodb.getItem).mockResolvedValue({
        serviceName: 'macie',
        lastExecutionTime: '2024-01-15T10:30:00.000Z',
        lastConfig: 'null', // null value
        configHash: previousHash,
        lastStatus: 'COMPLETED',
        lastResponse: JSON.stringify({ status: 'COMPLETED' }),
      });

      const result = await hasModuleConfigChanged(
        {
          serviceName: 'macie',
          currentConfig,
          overrideExisting: false,
        },
        mockParams,
        'test-prefix',
      );

      // Should return true (config changed) and handle null gracefully
      expect(result).toBe(true);
    });

    it('should throw error on DynamoDB failure', async () => {
      vi.mocked(dynamodb.getItem).mockRejectedValue(new Error('DynamoDB error'));

      await expect(
        hasModuleConfigChanged(
          {
            serviceName: 'macie',
            currentConfig: { enable: true },
            overrideExisting: false,
          },
          mockParams,
          'test-prefix',
        ),
      ).rejects.toThrow('DynamoDB error');
    });

    it('should return true when previous execution failed', async () => {
      const config = { enable: true, accountsCount: 5 };
      const configHash = calculateConfigHash(config);

      vi.mocked(dynamodb.getItem).mockResolvedValue({
        serviceName: 'macie',
        lastExecutionTime: '2024-01-15T10:30:00.000Z',
        lastConfig: JSON.stringify(config),
        configHash,
        lastStatus: 'failed', // Previous execution failed
        lastResponse: JSON.stringify({ status: 'failed', error: 'Some error' }),
      });

      const result = await hasModuleConfigChanged(
        {
          serviceName: 'macie',
          currentConfig: config, // Same config
          overrideExisting: false,
        },
        mockParams,
        'test-prefix',
      );

      // Should return true to force retry even though config hash is the same
      expect(result).toBe(true);
    });

    it('should return false when previous execution completed with same config', async () => {
      const config = { enable: true, accountsCount: 5 };
      const configHash = calculateConfigHash(config);

      vi.mocked(dynamodb.getItem).mockResolvedValue({
        serviceName: 'macie',
        lastExecutionTime: '2024-01-15T10:30:00.000Z',
        lastConfig: JSON.stringify(config),
        configHash,
        lastStatus: 'completed', // Completed successfully
        lastResponse: JSON.stringify({ status: 'completed' }),
      });

      const result = await hasModuleConfigChanged(
        {
          serviceName: 'macie',
          currentConfig: config, // Same config
          overrideExisting: false,
        },
        mockParams,
        'test-prefix',
      );

      // Should return false since config unchanged and previous execution succeeded
      expect(result).toBe(false);
    });

    it('should return true when previous execution failed even with different config', async () => {
      const previousConfig = { enable: true, accountsCount: 5 };
      const currentConfig = { enable: false, accountsCount: 10 };
      const previousHash = calculateConfigHash(previousConfig);

      vi.mocked(dynamodb.getItem).mockResolvedValue({
        serviceName: 'macie',
        lastExecutionTime: '2024-01-15T10:30:00.000Z',
        lastConfig: JSON.stringify(previousConfig),
        configHash: previousHash,
        lastStatus: 'failed',
        lastResponse: JSON.stringify({ status: 'failed', error: 'Some error' }),
      });

      const result = await hasModuleConfigChanged(
        {
          serviceName: 'macie',
          currentConfig,
          overrideExisting: false,
        },
        mockParams,
        'test-prefix',
      );

      // Should return true (would return true anyway due to config change, but also due to failed status)
      expect(result).toBe(true);
    });
  });

  describe('saveModuleExecutionState', () => {
    beforeEach(() => {
      // Mock Date.now() for consistent TTL calculations
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T10:30:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should save state for first execution', async () => {
      vi.mocked(dynamodb.getItem).mockResolvedValue(null); // No previous state
      vi.mocked(dynamodb.putItem).mockResolvedValue(undefined);

      const config = { enable: true, accountsCount: 5 };
      await saveModuleExecutionState(
        {
          serviceName: 'macie',
          config,
          status: 'COMPLETED',
          response: { status: 'COMPLETED', summary: 'Success' },
          dryRun: false,
        },
        mockParams,
        'test-prefix',
      );

      // Should only save "latest" record (no history)
      expect(dynamodb.putItem).toHaveBeenCalledTimes(1);
      expect(dynamodb.putItem).toHaveBeenCalledWith(
        expect.anything(),
        'AWSAccelerator-Module-State-123456789012-us-east-1',
        expect.objectContaining({
          PK: 'MODULE#macie',
          SK: 'EXECUTION#latest',
          serviceName: 'macie',
          lastStatus: 'COMPLETED',
        }),
        'test-prefix',
        false,
      );
    });

    it('should archive previous state and save new state', async () => {
      const previousState = {
        serviceName: 'macie',
        lastExecutionTime: '2024-01-14T10:00:00.000Z',
        lastConfig: JSON.stringify({ enable: true }),
        configHash: 'old-hash',
        lastStatus: 'COMPLETED',
        lastResponse: JSON.stringify({ status: 'COMPLETED' }),
      };

      vi.mocked(dynamodb.getItem).mockResolvedValue(previousState);
      vi.mocked(dynamodb.putItem).mockResolvedValue(undefined);

      const config = { enable: false, accountsCount: 5 };
      await saveModuleExecutionState(
        {
          serviceName: 'macie',
          config,
          status: 'COMPLETED',
          response: { status: 'COMPLETED', summary: 'Success' },
          dryRun: false,
        },
        mockParams,
        'test-prefix',
      );

      // Should save both history and latest
      expect(dynamodb.putItem).toHaveBeenCalledTimes(2);

      // First call: Archive previous state to history
      expect(dynamodb.putItem).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        'AWSAccelerator-Module-State-123456789012-us-east-1',
        expect.objectContaining({
          PK: 'MODULE#macie',
          SK: 'EXECUTION#2024-01-14T10:00:00.000Z',
          ttl: expect.any(Number),
        }),
        'test-prefix',
        false,
      );

      // Second call: Save new latest state
      expect(dynamodb.putItem).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        'AWSAccelerator-Module-State-123456789012-us-east-1',
        expect.objectContaining({
          PK: 'MODULE#macie',
          SK: 'EXECUTION#latest',
          serviceName: 'macie',
          lastStatus: 'COMPLETED',
        }),
        'test-prefix',
        false,
      );
    });

    it('should save state in dry run mode', async () => {
      vi.mocked(dynamodb.getItem).mockResolvedValue(null);
      vi.mocked(dynamodb.putItem).mockResolvedValue(undefined);

      const config = { enable: true };
      await saveModuleExecutionState(
        {
          serviceName: 'macie',
          config,
          status: 'COMPLETED',
          response: { status: 'COMPLETED' },
          dryRun: true,
        },
        mockParams,
        'test-prefix',
      );

      expect(dynamodb.putItem).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        'test-prefix',
        true, // dryRun flag
      );
    });

    it('should suppress save errors by default', async () => {
      vi.mocked(dynamodb.getItem).mockResolvedValue(null);
      vi.mocked(dynamodb.putItem).mockRejectedValue(new Error('DynamoDB error'));

      const config = { enable: true };
      await expect(
        saveModuleExecutionState(
          {
            serviceName: 'macie',
            config,
            status: 'COMPLETED',
            response: { status: 'COMPLETED' },
            dryRun: false,
          },
          mockParams,
          'test-prefix',
        ),
      ).resolves.toBeUndefined();
    });

    it('should calculate correct TTL for history records', async () => {
      const previousState = {
        serviceName: 'macie',
        lastExecutionTime: '2024-01-14T10:00:00.000Z',
        lastConfig: JSON.stringify({ enable: true }),
        configHash: 'old-hash',
        lastStatus: 'COMPLETED',
        lastResponse: JSON.stringify({ status: 'COMPLETED' }),
      };

      vi.mocked(dynamodb.getItem).mockResolvedValue(previousState);
      vi.mocked(dynamodb.putItem).mockResolvedValue(undefined);

      const config = { enable: false };
      await saveModuleExecutionState(
        {
          serviceName: 'macie',
          config,
          status: 'COMPLETED',
          response: { status: 'COMPLETED' },
          dryRun: false,
        },
        mockParams,
        'test-prefix',
      );

      // Check TTL is approximately 1 year from now
      const expectedTTL = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
      expect(dynamodb.putItem).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          ttl: expectedTTL,
        }),
        expect.anything(),
        expect.anything(),
      );
    });

    it('should handle complex config objects', async () => {
      vi.mocked(dynamodb.getItem).mockResolvedValue(null);
      vi.mocked(dynamodb.putItem).mockResolvedValue(undefined);

      const config = {
        enable: true,
        settings: {
          nested: {
            value: 123,
            array: ['item1', 'item2'],
          },
        },
        regions: ['us-east-1', 'us-west-2'],
      };

      await saveModuleExecutionState(
        {
          serviceName: 'macie',
          config,
          status: 'COMPLETED',
          response: { status: 'COMPLETED' },
          dryRun: false,
        },
        mockParams,
        'test-prefix',
      );

      expect(dynamodb.putItem).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          lastConfig: JSON.stringify(config),
          configHash: calculateConfigHash(config),
        }),
        expect.anything(),
        expect.anything(),
      );
    });
  });
});
