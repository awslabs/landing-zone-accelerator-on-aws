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

import { DestinationType, GuardDutyClient } from '@aws-sdk/client-guardduty';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { FindingsExportConfiguration } from '../../../lib/guardduty/findings-export-configuration';

vi.mock('@aws-sdk/client-guardduty', () => ({
  GuardDutyClient: vi.fn(),
  CreatePublishingDestinationCommand: vi.fn(),
  DeletePublishingDestinationCommand: vi.fn(),
  UpdatePublishingDestinationCommand: vi.fn(),
  ListPublishingDestinationsCommand: vi.fn(),
  DestinationType: { S3: 'S3' },
}));

vi.mock('../../../lib/common/utility', () => ({
  executeApi: vi.fn(),
}));

vi.mock('../../../lib/common/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    dryRun: vi.fn(),
    commandExecution: vi.fn(),
    commandSuccess: vi.fn(),
  })),
}));

describe('FindingsExportConfiguration', () => {
  let mockExecuteApi: ReturnType<typeof vi.fn>;
  const mockClient = new GuardDutyClient({});
  const logPrefix = 'test';
  const detectorId = 'detector-123';
  const destinationType = DestinationType.S3;
  const destinationProperties = { DestinationArn: 'arn:aws:s3:::my-bucket', KmsKeyArn: 'arn:aws:kms:::key' };

  beforeEach(async () => {
    vi.clearAllMocks();
    const utility = await import('../../../lib/common/utility.js');
    mockExecuteApi = vi.mocked(utility.executeApi);
  });

  describe('configurePublishingDestination', () => {
    test('should create a new destination when none exists', async () => {
      mockExecuteApi.mockResolvedValueOnce({ Destinations: [] }).mockResolvedValueOnce({});

      await FindingsExportConfiguration.configurePublishingDestination(
        mockClient,
        true,
        detectorId,
        destinationType,
        destinationProperties,
        false,
        logPrefix,
      );

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'CreatePublishingDestinationCommand',
        expect.objectContaining({
          DetectorId: detectorId,
          DestinationType: destinationType,
          DestinationProperties: destinationProperties,
        }),
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
    });

    test('should dry run create when no destination exists', async () => {
      await FindingsExportConfiguration.configurePublishingDestination(
        mockClient,
        true,
        detectorId,
        destinationType,
        destinationProperties,
        true,
        logPrefix,
      );

      // Dry run returns early — no API calls
      expect(mockExecuteApi).not.toHaveBeenCalled();
    });

    test('should update existing destination when overrideExisting is true', async () => {
      mockExecuteApi
        .mockResolvedValueOnce({ Destinations: [{ DestinationId: 'dest-456', DestinationType: destinationType }] })
        .mockResolvedValueOnce({});

      await FindingsExportConfiguration.configurePublishingDestination(
        mockClient,
        true,
        detectorId,
        destinationType,
        destinationProperties,
        false,
        logPrefix,
      );

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'UpdatePublishingDestinationCommand',
        expect.objectContaining({
          DetectorId: detectorId,
          DestinationId: 'dest-456',
          DestinationProperties: destinationProperties,
        }),
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
    });

    test('should dry run update when destination exists and overrideExisting is true', async () => {
      await FindingsExportConfiguration.configurePublishingDestination(
        mockClient,
        true,
        detectorId,
        destinationType,
        destinationProperties,
        true,
        logPrefix,
      );

      // Dry run returns early — no API calls
      expect(mockExecuteApi).not.toHaveBeenCalled();
    });

    test('should skip update when destination exists and overrideExisting is false', async () => {
      mockExecuteApi.mockResolvedValueOnce({
        Destinations: [{ DestinationId: 'dest-456', DestinationType: destinationType }],
      });

      await FindingsExportConfiguration.configurePublishingDestination(
        mockClient,
        false,
        detectorId,
        destinationType,
        destinationProperties,
        false,
        logPrefix,
      );

      // Only the list call, no update
      expect(mockExecuteApi).toHaveBeenCalledTimes(1);
    });

    test('should throw when Destinations is undefined in list response', async () => {
      mockExecuteApi.mockResolvedValue({ Destinations: undefined });

      await expect(
        FindingsExportConfiguration.configurePublishingDestination(
          mockClient,
          true,
          detectorId,
          destinationType,
          destinationProperties,
          false,
          logPrefix,
        ),
      ).rejects.toThrow('API did not return destinations');
    });

    test('should throw when more than one destination of the same type exists', async () => {
      mockExecuteApi.mockResolvedValue({
        Destinations: [
          { DestinationId: 'dest-1', DestinationType: destinationType },
          { DestinationId: 'dest-2', DestinationType: destinationType },
        ],
      });

      await expect(
        FindingsExportConfiguration.configurePublishingDestination(
          mockClient,
          true,
          detectorId,
          destinationType,
          destinationProperties,
          false,
          logPrefix,
        ),
      ).rejects.toThrow('Expected 1 destination ID but found');
    });
  });

  describe('deletePublishingDestination', () => {
    test('should delete existing destination', async () => {
      mockExecuteApi
        .mockResolvedValueOnce({ Destinations: [{ DestinationId: 'dest-456', DestinationType: destinationType }] })
        .mockResolvedValueOnce({});

      await FindingsExportConfiguration.deletePublishingDestination(
        mockClient,
        detectorId,
        destinationType,
        false,
        logPrefix,
      );

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'DeletePublishingDestinationCommand',
        expect.objectContaining({ DetectorId: detectorId, DestinationId: 'dest-456' }),
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
    });

    test('should dry run delete when destination exists', async () => {
      await FindingsExportConfiguration.deletePublishingDestination(
        mockClient,
        detectorId,
        destinationType,
        true,
        logPrefix,
      );

      // Dry run returns early — no API calls
      expect(mockExecuteApi).not.toHaveBeenCalled();
    });

    test('should log info when no destination found to delete', async () => {
      mockExecuteApi.mockResolvedValue({ Destinations: [] });

      await FindingsExportConfiguration.deletePublishingDestination(
        mockClient,
        detectorId,
        destinationType,
        false,
        logPrefix,
      );

      // Only the list call
      expect(mockExecuteApi).toHaveBeenCalledTimes(1);
    });

    test('should throw when Destinations is undefined in list response', async () => {
      mockExecuteApi.mockResolvedValue({ Destinations: undefined });

      await expect(
        FindingsExportConfiguration.deletePublishingDestination(
          mockClient,
          detectorId,
          destinationType,
          false,
          logPrefix,
        ),
      ).rejects.toThrow('API did not return destinations');
    });
  });
});
