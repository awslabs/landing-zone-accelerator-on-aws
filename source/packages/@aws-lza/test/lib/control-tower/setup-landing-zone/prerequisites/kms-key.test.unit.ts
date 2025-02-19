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
import { describe, beforeEach, expect, test } from '@jest/globals';

import { KmsKey } from '../../../../../lib/control-tower/setup-landing-zone/prerequisites/kms-key';
import { KMSClient, CreateKeyCommand, CreateAliasCommand, PutKeyPolicyCommand } from '@aws-sdk/client-kms';

// Mock dependencies
jest.mock('@aws-sdk/client-kms');
jest.mock('../../../../../common/throttle', () => ({
  throttlingBackOff: jest.fn(fn => fn()),
}));

const MOCK_CONSTANTS = {
  partition: 'mockPartition',
  region: 'mockRegion',
  solutionId: 'mockSolutionId',
  accountId: 'mockAccountId',
  differentKeyAlias: { AliasName: 'mockDifferentKeyAlias' },
  controlTowerKeyAlias: { AliasName: 'alias/aws-controltower/key' },
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
    send: jest.fn(),
  };

  const mockPaginateListAliases = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    (KMSClient as jest.Mock).mockImplementation(() => mockKmsClient);

    jest.spyOn(require('@aws-sdk/client-kms'), 'paginateListAliases').mockImplementation(mockPaginateListAliases);
  });

  describe('createControlTowerKey', () => {
    test('should create a new KMS key when alias does not exist', async () => {
      // Setup
      mockPaginateListAliases.mockImplementation(() => ({
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
      const result = await KmsKey.createControlTowerKey(
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.accountId,
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.solutionId,
      );

      // Verify
      expect(result).toBe(MOCK_CONSTANTS.createKeyResponse.KeyMetadata.Arn);
      expect(mockKmsClient.send).toHaveBeenCalledWith(expect.any(CreateKeyCommand));
      expect(mockKmsClient.send).toHaveBeenCalledWith(expect.any(PutKeyPolicyCommand));
      expect(mockKmsClient.send).toHaveBeenCalledWith(expect.any(CreateAliasCommand));
    });

    test('should create a new KMS key when alias undefined', async () => {
      // Setup

      mockPaginateListAliases.mockImplementation(() => ({
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
      const result = await KmsKey.createControlTowerKey(
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.accountId,
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.solutionId,
      );

      // Verify
      expect(result).toBe(MOCK_CONSTANTS.createKeyResponse.KeyMetadata.Arn);
      expect(mockKmsClient.send).toHaveBeenCalledWith(expect.any(CreateKeyCommand));
      expect(mockKmsClient.send).toHaveBeenCalledWith(expect.any(PutKeyPolicyCommand));
      expect(mockKmsClient.send).toHaveBeenCalledWith(expect.any(CreateAliasCommand));
    });

    test('should throw error when alias already exists', async () => {
      // Setup
      mockPaginateListAliases.mockImplementation(() => ({
        async *[Symbol.asyncIterator]() {
          yield {
            Aliases: [MOCK_CONSTANTS.controlTowerKeyAlias],
          };
        },
      }));

      await expect(
        KmsKey.createControlTowerKey(
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
      mockPaginateListAliases.mockImplementation(() => ({
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
      const result = await KmsKey.createControlTowerKey(
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.accountId,
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.solutionId,
      );

      // Verify
      expect(result).toBe(MOCK_CONSTANTS.createKeyResponse.KeyMetadata.Arn);
      expect(mockKmsClient.send).toHaveBeenCalledWith(expect.any(CreateKeyCommand));
      expect(mockKmsClient.send).toHaveBeenCalledWith(expect.any(PutKeyPolicyCommand));
      expect(mockKmsClient.send).toHaveBeenCalledWith(expect.any(CreateAliasCommand));
    });
  });
});
