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
import { Macie2Client, FindingPublishingFrequency } from '@aws-sdk/client-macie2';
import { MacieSession } from '../../../lib/amazon-macie/macie-session';
import { IMacieS3Destination } from '../../../lib/amazon-macie/interfaces';
import { IAcceleratorEnvironment } from '../../../lib/common/interfaces';

vi.mock('@aws-sdk/client-macie2', () => ({
  Macie2Client: vi.fn(),
  UpdateMacieSessionCommand: vi.fn(),
  PutFindingsPublicationConfigurationCommand: vi.fn(),
  PutClassificationExportConfigurationCommand: vi.fn(),
  FindingPublishingFrequency: { FIFTEEN_MINUTES: 'FIFTEEN_MINUTES', ONE_HOUR: 'ONE_HOUR', SIX_HOURS: 'SIX_HOURS' },
  MacieStatus: { ENABLED: 'ENABLED', PAUSED: 'PAUSED' },
}));

vi.mock('../../../lib/common/utility', () => ({
  executeApi: vi.fn(),
}));

vi.mock('../../../lib/common/logger', () => {
  const mockLogger = {
    dryRun: vi.fn(),
  };
  return {
    createLogger: vi.fn(() => mockLogger),
    mockLogger,
  };
});

describe('MacieSession', () => {
  let mockExecuteApi: ReturnType<typeof vi.fn>;
  let mockLogger: {
    dryRun: ReturnType<typeof vi.fn>;
  };
  const mockClient = new Macie2Client({});
  const logPrefix = 'test';

  const mockEnv: IAcceleratorEnvironment = {
    accountId: '123456789012',
    region: 'us-east-1',
  };

  const mockS3Destination: IMacieS3Destination = {
    bucketName: 'test-bucket',
    kmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/test-key',
    keyPrefix: 'custom-prefix',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const utility = await import('../../../lib/common/utility');
    const logger = await import('../../../lib/common/logger');
    mockExecuteApi = vi.mocked(utility.executeApi);
    mockLogger = (logger as { mockLogger: typeof mockLogger }).mockLogger;

    mockClient.send = vi.fn().mockResolvedValue({});
  });

  describe('configure', () => {
    test('should configure Macie session with all settings in non-dry-run mode', async () => {
      mockExecuteApi.mockResolvedValue({});

      await MacieSession.configure(
        mockEnv,
        mockClient,
        mockS3Destination,
        FindingPublishingFrequency.ONE_HOUR,
        true,
        true,
        false,
        logPrefix,
      );

      expect(mockExecuteApi).toHaveBeenCalledTimes(3);

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'UpdateMacieSessionCommand',
        { findingPublishingFrequency: FindingPublishingFrequency.ONE_HOUR },
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'PutFindingsPublicationConfigurationCommand',
        { publishSensitiveDataFindings: true, publishPolicyFindings: true },
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'PutClassificationExportConfigurationCommand',
        {
          configuration: {
            destination: {
              bucketName: 'test-bucket',
              kmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/test-key',
              keyPrefix: 'custom-prefix',
            },
          },
        },
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
    });

    test('should handle dry run mode', async () => {
      await MacieSession.configure(
        mockEnv,
        mockClient,
        mockS3Destination,
        FindingPublishingFrequency.FIFTEEN_MINUTES,
        false,
        false,
        true,
        logPrefix,
      );

      expect(mockExecuteApi).not.toHaveBeenCalled();
      expect(mockLogger.dryRun).toHaveBeenCalledTimes(3);

      expect(mockLogger.dryRun).toHaveBeenCalledWith(
        'UpdateMacieSessionCommand',
        { findingPublishingFrequency: FindingPublishingFrequency.FIFTEEN_MINUTES },
        logPrefix,
      );

      expect(mockLogger.dryRun).toHaveBeenCalledWith(
        'PutFindingsPublicationConfigurationCommand',
        { publishSensitiveDataFindings: false, publishPolicyFindings: false },
        logPrefix,
      );

      expect(mockLogger.dryRun).toHaveBeenCalledWith(
        'PutClassificationExportConfigurationCommand',
        {
          configuration: {
            destination: {
              bucketName: 'test-bucket',
              kmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/test-key',
              keyPrefix: 'custom-prefix',
            },
          },
        },
        logPrefix,
      );
    });

    test('should use default keyPrefix when not provided', async () => {
      const s3DestinationWithoutPrefix: IMacieS3Destination = {
        bucketName: 'test-bucket',
        kmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/test-key',
      };

      await MacieSession.configure(
        mockEnv,
        mockClient,
        s3DestinationWithoutPrefix,
        FindingPublishingFrequency.SIX_HOURS,
        true,
        false,
        true,
        logPrefix,
      );

      expect(mockLogger.dryRun).toHaveBeenCalledWith(
        'PutClassificationExportConfigurationCommand',
        {
          configuration: {
            destination: {
              bucketName: 'test-bucket',
              kmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/test-key',
              keyPrefix: 'macie123456789012',
            },
          },
        },
        logPrefix,
      );
    });

    test('should execute actual AWS commands in non-dry-run mode', async () => {
      mockExecuteApi.mockImplementation(async (commandName, params, fn) => {
        await fn();
        return {};
      });

      await MacieSession.configure(
        mockEnv,
        mockClient,
        mockS3Destination,
        FindingPublishingFrequency.ONE_HOUR,
        true,
        true,
        false,
        logPrefix,
      );

      expect(mockClient.send).toHaveBeenCalledTimes(3);
    });
  });
});
