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

import { KmsKey } from '../../../../../lib/control-tower/setup-landing-zone/prerequisites/kms-key';
import { KMSClient, CreateKeyCommand, CreateAliasCommand, PutKeyPolicyCommand } from '@aws-sdk/client-kms';

// Mock dependencies
vi.mock('@aws-sdk/client-kms', () => ({
  KMSClient: vi.fn(),
  CreateKeyCommand: vi.fn(),
  CreateAliasCommand: vi.fn(),
  PutKeyPolicyCommand: vi.fn(),
  paginateListAliases: vi.fn(),
}));
vi.mock('../../../../../common/throttle', () => ({
  throttlingBackOff: vi.fn(fn => fn()),
}));

const MOCK_CONSTANTS = {
  partition: 'mockPartition',
  region: 'mockRegion',
  solutionId: 'mockSolutionId',
  accountId: 'mockAccountId',
  differentKeyAlias: { AliasName: 'mockDifferentKeyAlias' },
  controlTowerKeyAlias: { AliasName: 'alias/aws-controltower/logging/key' },
  createKeyResponse: {
    KeyMetadata: {
      KeyId: 'mockKeyId',
      Arn: 'mockArn',
    },
  },
  unknownError: new Error('Unknown command'),
};
describe('KmsKey', () => {
  const mockKmsClient = {
    send: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    (KMSClient as vi.Mock).mockImplementation(() => mockKmsClient);
  });

  describe('createControlTowerKeys', () => {
    test('should create new KMS keys when aliases do not exist', async () => {
      // Setup
      const { paginateListAliases } = await import('@aws-sdk/client-kms');
      (paginateListAliases as vi.Mock).mockImplementation(() => ({
        async *[Symbol.asyncIterator]() {
          yield {
            Aliases: [MOCK_CONSTANTS.differentKeyAlias],
          };
        },
      }));

      mockKmsClient.send.mockImplementation(command => {
        if (command instanceof CreateKeyCommand) {
          return Promise.resolve(MOCK_CONSTANTS.createKeyResponse);
        }
        if (command instanceof PutKeyPolicyCommand) {
          return Promise.resolve(undefined);
        }
        if (command instanceof CreateAliasCommand) {
          return Promise.resolve(undefined);
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const result = await KmsKey.createControlTowerKeys(
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.accountId,
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.solutionId,
      );

      // Verify
      expect(result.centralizedLoggingKeyArn).toBe(MOCK_CONSTANTS.createKeyResponse.KeyMetadata.Arn);
      expect(result.configLoggingKeyArn).toBe(MOCK_CONSTANTS.createKeyResponse.KeyMetadata.Arn);
      expect(mockKmsClient.send).toHaveBeenCalledWith(expect.any(CreateKeyCommand));
      expect(mockKmsClient.send).toHaveBeenCalledWith(expect.any(PutKeyPolicyCommand));
      expect(mockKmsClient.send).toHaveBeenCalledWith(expect.any(CreateAliasCommand));
    });

    test('should create new KMS keys when aliases undefined', async () => {
      // Setup
      const { paginateListAliases } = await import('@aws-sdk/client-kms');
      (paginateListAliases as vi.Mock).mockImplementation(() => ({
        async *[Symbol.asyncIterator]() {
          yield {
            Aliases: undefined,
          };
        },
      }));

      mockKmsClient.send.mockImplementation(command => {
        if (command instanceof CreateKeyCommand) {
          return Promise.resolve(MOCK_CONSTANTS.createKeyResponse);
        }
        if (command instanceof PutKeyPolicyCommand) {
          return Promise.resolve(undefined);
        }
        if (command instanceof CreateAliasCommand) {
          return Promise.resolve(undefined);
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const result = await KmsKey.createControlTowerKeys(
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.accountId,
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.solutionId,
      );

      // Verify
      expect(result.centralizedLoggingKeyArn).toBe(MOCK_CONSTANTS.createKeyResponse.KeyMetadata.Arn);
      expect(result.configLoggingKeyArn).toBe(MOCK_CONSTANTS.createKeyResponse.KeyMetadata.Arn);
      expect(mockKmsClient.send).toHaveBeenCalledWith(expect.any(CreateKeyCommand));
      expect(mockKmsClient.send).toHaveBeenCalledWith(expect.any(PutKeyPolicyCommand));
      expect(mockKmsClient.send).toHaveBeenCalledWith(expect.any(CreateAliasCommand));
    });

    test('should throw error when alias already exists', async () => {
      // Setup
      const { paginateListAliases } = await import('@aws-sdk/client-kms');
      (paginateListAliases as vi.Mock).mockImplementation(() => ({
        async *[Symbol.asyncIterator]() {
          yield {
            Aliases: [MOCK_CONSTANTS.controlTowerKeyAlias],
          };
        },
      }));

      // Don't set up mockKmsClient.send to return anything - it shouldn't be called
      mockKmsClient.send.mockRejectedValue(MOCK_CONSTANTS.unknownError);

      await expect(
        KmsKey.createControlTowerKeys(
          MOCK_CONSTANTS.partition,
          MOCK_CONSTANTS.accountId,
          MOCK_CONSTANTS.region,
          MOCK_CONSTANTS.solutionId,
        ),
      ).rejects.toThrow(/There is already an AWS Control Tower Landing Zone KMS CMK alias/);

      // Verify
      expect(mockKmsClient.send).not.toHaveBeenCalledWith(expect.any(CreateKeyCommand));
    });

    test('should handle empty aliases response', async () => {
      // Setup
      const { paginateListAliases } = await import('@aws-sdk/client-kms');
      (paginateListAliases as vi.Mock).mockImplementation(() => ({
        async *[Symbol.asyncIterator]() {
          yield {
            Aliases: [],
          };
        },
      }));

      mockKmsClient.send.mockImplementation(command => {
        if (command instanceof CreateKeyCommand) {
          return Promise.resolve(MOCK_CONSTANTS.createKeyResponse);
        }
        if (command instanceof PutKeyPolicyCommand) {
          return Promise.resolve(undefined);
        }
        if (command instanceof CreateAliasCommand) {
          return Promise.resolve(undefined);
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const result = await KmsKey.createControlTowerKeys(
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.accountId,
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.solutionId,
      );

      // Verify
      expect(result.centralizedLoggingKeyArn).toBe(MOCK_CONSTANTS.createKeyResponse.KeyMetadata.Arn);
      expect(result.configLoggingKeyArn).toBe(MOCK_CONSTANTS.createKeyResponse.KeyMetadata.Arn);
      expect(mockKmsClient.send).toHaveBeenCalledWith(expect.any(CreateKeyCommand));
      expect(mockKmsClient.send).toHaveBeenCalledWith(expect.any(PutKeyPolicyCommand));
      expect(mockKmsClient.send).toHaveBeenCalledWith(expect.any(CreateAliasCommand));
    });
  });
});
