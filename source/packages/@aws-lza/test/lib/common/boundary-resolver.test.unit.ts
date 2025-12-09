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
import { BoundaryResolver, BoundaryType, BoundaryContext } from '../../../lib/common/boundary-resolver';
import { IModuleRegionFilters } from '../../../lib/common/interfaces';

// Mock dependencies at the top level
vi.mock('@aws-sdk/client-ec2', () => ({
  EC2Client: vi.fn(),
  DescribeRegionsCommand: vi.fn(),
}));

vi.mock('../../../lib/common/utility', () => ({
  executeApi: vi.fn(),
  setRetryStrategy: vi.fn(() => 'mock-retry-strategy'),
}));

vi.mock('../../../lib/common/logger', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn() })),
}));

// Mock constants
const MOCK_CONSTANTS = {
  context: {
    partition: 'aws',
    region: 'us-east-1',
    solutionId: 'test-solution',
    credentials: {
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
      sessionToken: 'test-token',
    },
    organizationRootId: 'r-test123',
  } as BoundaryContext,
  regions: ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'],
  regionFilters: {
    ignoredRegions: ['ap-southeast-1'],
    disabledRegions: ['eu-west-1'],
  } as IModuleRegionFilters,
};

describe('boundary-resolver', () => {
  let mockExecuteApi: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const utility = await import('../../../lib/common/utility');
    mockExecuteApi = vi.mocked(utility.executeApi);
  });

  describe('BoundaryType enum', () => {
    test('should have correct enum values', () => {
      expect(BoundaryType.REGIONS).toBe('regions');
      expect(BoundaryType.ORGANIZATIONAL_UNITS).toBe('organizational-units');
      expect(BoundaryType.ACCOUNTS).toBe('accounts');
    });
  });

  describe('getAllBoundaries', () => {
    test('should get all regions when boundary type is REGIONS', async () => {
      mockExecuteApi.mockResolvedValue({
        Regions: MOCK_CONSTANTS.regions.map(region => ({ RegionName: region })),
      });

      const result = await BoundaryResolver.getAllBoundaries(BoundaryType.REGIONS, MOCK_CONSTANTS.context);

      expect(result).toEqual(MOCK_CONSTANTS.regions);
      expect(mockExecuteApi).toHaveBeenCalledTimes(1);
    });

    test('should handle empty regions response', async () => {
      mockExecuteApi.mockResolvedValue({ Regions: [] });

      const result = await BoundaryResolver.getAllBoundaries(BoundaryType.REGIONS, MOCK_CONSTANTS.context);

      expect(result).toEqual([]);
    });

    test('should handle undefined regions response', async () => {
      mockExecuteApi.mockResolvedValue({ Regions: undefined });

      const result = await BoundaryResolver.getAllBoundaries(BoundaryType.REGIONS, MOCK_CONSTANTS.context);

      expect(result).toEqual([]);
    });

    test('should filter out regions with undefined RegionName', async () => {
      mockExecuteApi.mockResolvedValue({
        Regions: [
          { RegionName: 'us-east-1' },
          { RegionName: undefined },
          { RegionName: 'us-west-2' },
          { RegionName: null },
        ],
      });

      const result = await BoundaryResolver.getAllBoundaries(BoundaryType.REGIONS, MOCK_CONSTANTS.context);

      expect(result).toEqual(['us-east-1', 'us-west-2']);
    });

    test('should throw error for unsupported boundary type', async () => {
      await expect(
        BoundaryResolver.getAllBoundaries(BoundaryType.ORGANIZATIONAL_UNITS, MOCK_CONSTANTS.context),
      ).rejects.toThrow('Unsupported boundary type: organizational-units');

      await expect(BoundaryResolver.getAllBoundaries(BoundaryType.ACCOUNTS, MOCK_CONSTANTS.context)).rejects.toThrow(
        'Unsupported boundary type: accounts',
      );
    });
  });

  describe('calculateBoundaries', () => {
    describe('when service is disabled', () => {
      test('should return empty enabled boundaries and all available as disabled when no filters', async () => {
        const result = await BoundaryResolver.calculateBoundaries(
          BoundaryType.REGIONS,
          false,
          MOCK_CONSTANTS.context,
          MOCK_CONSTANTS.regions,
        );

        expect(result).toEqual({
          enabledBoundaries: [],
          disabledBoundaries: MOCK_CONSTANTS.regions,
        });
      });

      test('should exclude ignored regions from disabled boundaries', async () => {
        const result = await BoundaryResolver.calculateBoundaries(
          BoundaryType.REGIONS,
          false,
          MOCK_CONSTANTS.context,
          MOCK_CONSTANTS.regions,
          { ignoredRegions: ['ap-southeast-1'] },
        );

        expect(result).toEqual({
          enabledBoundaries: [],
          disabledBoundaries: ['us-east-1', 'us-west-2', 'eu-west-1'],
        });
      });

      test('should handle empty ignored regions', async () => {
        const result = await BoundaryResolver.calculateBoundaries(
          BoundaryType.REGIONS,
          false,
          MOCK_CONSTANTS.context,
          MOCK_CONSTANTS.regions,
          { ignoredRegions: [] },
        );

        expect(result).toEqual({
          enabledBoundaries: [],
          disabledBoundaries: MOCK_CONSTANTS.regions,
        });
      });

      test('should fetch all boundaries when not provided', async () => {
        mockExecuteApi.mockResolvedValue({
          Regions: MOCK_CONSTANTS.regions.map(region => ({ RegionName: region })),
        });

        const result = await BoundaryResolver.calculateBoundaries(
          BoundaryType.REGIONS,
          false,
          MOCK_CONSTANTS.context,
          undefined,
          { ignoredRegions: ['ap-southeast-1'] },
        );

        expect(result).toEqual({
          enabledBoundaries: [],
          disabledBoundaries: ['us-east-1', 'us-west-2', 'eu-west-1'],
        });
        expect(mockExecuteApi).toHaveBeenCalledTimes(1);
      });
    });

    describe('when service is enabled', () => {
      test('should return correct enabled and disabled boundaries with filters', async () => {
        const result = await BoundaryResolver.calculateBoundaries(
          BoundaryType.REGIONS,
          true,
          MOCK_CONSTANTS.context,
          MOCK_CONSTANTS.regions,
          MOCK_CONSTANTS.regionFilters,
        );

        expect(result).toEqual({
          enabledBoundaries: ['us-east-1', 'us-west-2'],
          disabledBoundaries: ['eu-west-1'],
        });
      });

      test('should handle no region filters', async () => {
        const result = await BoundaryResolver.calculateBoundaries(
          BoundaryType.REGIONS,
          true,
          MOCK_CONSTANTS.context,
          MOCK_CONSTANTS.regions,
        );

        expect(result).toEqual({
          enabledBoundaries: MOCK_CONSTANTS.regions,
          disabledBoundaries: [],
        });
      });

      test('should handle empty region filters', async () => {
        const result = await BoundaryResolver.calculateBoundaries(
          BoundaryType.REGIONS,
          true,
          MOCK_CONSTANTS.context,
          MOCK_CONSTANTS.regions,
          { ignoredRegions: [], disabledRegions: [] },
        );

        expect(result).toEqual({
          enabledBoundaries: MOCK_CONSTANTS.regions,
          disabledBoundaries: [],
        });
      });

      test('should handle only ignored regions', async () => {
        const result = await BoundaryResolver.calculateBoundaries(
          BoundaryType.REGIONS,
          true,
          MOCK_CONSTANTS.context,
          MOCK_CONSTANTS.regions,
          { ignoredRegions: ['ap-southeast-1'] },
        );

        expect(result).toEqual({
          enabledBoundaries: ['us-east-1', 'us-west-2', 'eu-west-1'],
          disabledBoundaries: [],
        });
      });

      test('should handle only disabled regions', async () => {
        const result = await BoundaryResolver.calculateBoundaries(
          BoundaryType.REGIONS,
          true,
          MOCK_CONSTANTS.context,
          MOCK_CONSTANTS.regions,
          { disabledRegions: ['eu-west-1'] },
        );

        expect(result).toEqual({
          enabledBoundaries: ['us-east-1', 'us-west-2', 'ap-southeast-1'],
          disabledBoundaries: ['eu-west-1'],
        });
      });

      test('should fetch all boundaries when not provided', async () => {
        mockExecuteApi.mockResolvedValue({
          Regions: MOCK_CONSTANTS.regions.map(region => ({ RegionName: region })),
        });

        const result = await BoundaryResolver.calculateBoundaries(
          BoundaryType.REGIONS,
          true,
          MOCK_CONSTANTS.context,
          undefined,
          MOCK_CONSTANTS.regionFilters,
        );

        expect(result).toEqual({
          enabledBoundaries: ['us-east-1', 'us-west-2'],
          disabledBoundaries: ['eu-west-1'],
        });
        expect(mockExecuteApi).toHaveBeenCalledTimes(1);
      });

      test('should handle overlapping disabled and ignored regions', async () => {
        const result = await BoundaryResolver.calculateBoundaries(
          BoundaryType.REGIONS,
          true,
          MOCK_CONSTANTS.context,
          MOCK_CONSTANTS.regions,
          {
            disabledRegions: ['eu-west-1', 'ap-southeast-1'],
            ignoredRegions: ['ap-southeast-1', 'us-west-2'],
          },
        );

        expect(result).toEqual({
          enabledBoundaries: ['us-east-1'],
          disabledBoundaries: ['eu-west-1', 'ap-southeast-1'],
        });
      });
    });
  });

  describe('getAllRegions (private method coverage)', () => {
    test('should create EC2Client with correct configuration', async () => {
      const { EC2Client } = await import('@aws-sdk/client-ec2');
      mockExecuteApi.mockResolvedValue({
        Regions: [{ RegionName: 'us-east-1' }],
      });

      await BoundaryResolver.getAllBoundaries(BoundaryType.REGIONS, MOCK_CONSTANTS.context);

      expect(EC2Client).toHaveBeenCalledWith({
        region: MOCK_CONSTANTS.context.region,
        customUserAgent: MOCK_CONSTANTS.context.solutionId,
        retryStrategy: 'mock-retry-strategy',
        credentials: MOCK_CONSTANTS.context.credentials,
      });
    });

    test('should handle executeApi errors', async () => {
      const error = new Error('API Error');
      mockExecuteApi.mockRejectedValue(error);

      await expect(BoundaryResolver.getAllBoundaries(BoundaryType.REGIONS, MOCK_CONSTANTS.context)).rejects.toThrow(
        'API Error',
      );
    });
  });

  describe('edge cases and type safety', () => {
    test('should work with generic types', async () => {
      const customBoundaries = ['boundary1', 'boundary2', 'boundary3'];
      const filters = {
        ignoredRegions: ['boundary3'],
        disabledRegions: ['boundary2'],
      };

      const result = await BoundaryResolver.calculateBoundaries<string>(
        BoundaryType.REGIONS,
        true,
        MOCK_CONSTANTS.context,
        customBoundaries,
        filters,
      );

      expect(result).toEqual({
        enabledBoundaries: ['boundary1'],
        disabledBoundaries: ['boundary2'],
      });
    });

    test('should handle empty provided boundaries', async () => {
      mockExecuteApi.mockResolvedValue({ Regions: [] });

      const result = await BoundaryResolver.calculateBoundaries(BoundaryType.REGIONS, true, MOCK_CONSTANTS.context, []);

      expect(result).toEqual({
        enabledBoundaries: [],
        disabledBoundaries: [],
      });
    });
  });
});
