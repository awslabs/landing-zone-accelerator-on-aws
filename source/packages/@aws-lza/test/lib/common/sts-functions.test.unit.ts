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
import { STSClient } from '@aws-sdk/client-sts';
import { getCredentials, getGlobalRegion, getCurrentSessionDetails } from '../../../lib/common/sts-functions';
import { IAssumeRoleCredential } from '../../../lib/common/interfaces';

vi.mock('@aws-sdk/client-sts', () => ({
  STSClient: vi.fn(),
  AssumeRoleCommand: vi.fn(),
  GetCallerIdentityCommand: vi.fn(),
}));

vi.mock('../../../lib/common/utility', () => ({
  executeApi: vi.fn(),
  setRetryStrategy: vi.fn(() => ({})),
}));

vi.mock('../../../lib/common/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('../../../lib/common/types', () => ({
  MODULE_EXCEPTIONS: {
    SERVICE_EXCEPTION: 'ServiceException',
  },
}));

const MOCK_CONSTANTS = {
  logPrefix: 'test-prefix',
  accountId: '123456789012',
  region: 'us-east-1',
  partition: 'aws',
  assumeRoleName: 'TestRole',
  assumeRoleArn: 'arn:aws:iam::123456789012:role/TestRole',
  sessionName: 'TestSession',
  solutionId: 'test-solution',
  credentials: {
    accessKeyId: 'AKIATEST',
    secretAccessKey: 'secretTest',
    sessionToken: 'tokenTest',
    expiration: new Date('2024-01-01T00:00:00Z'),
  } as IAssumeRoleCredential,
};

describe('sts-functions', () => {
  let mockExecuteApi: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const utility = await import('../../../lib/common/utility');
    mockExecuteApi = vi.mocked(utility.executeApi);
  });

  describe('getCredentials', () => {
    test('should throw error when both assumeRoleName and assumeRoleArn provided', async () => {
      await expect(
        getCredentials({
          accountId: MOCK_CONSTANTS.accountId,
          region: MOCK_CONSTANTS.region,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          assumeRoleName: MOCK_CONSTANTS.assumeRoleName,
          assumeRoleArn: MOCK_CONSTANTS.assumeRoleArn,
        }),
      ).rejects.toThrow('Either assumeRoleName or assumeRoleArn can be provided not both');
    });

    test('should throw error when neither assumeRoleName nor assumeRoleArn provided', async () => {
      await expect(
        getCredentials({
          accountId: MOCK_CONSTANTS.accountId,
          region: MOCK_CONSTANTS.region,
          logPrefix: MOCK_CONSTANTS.logPrefix,
        }),
      ).rejects.toThrow('Either assumeRoleName or assumeRoleArn must provided');
    });

    test('should throw error when assumeRoleName provided without partition', async () => {
      await expect(
        getCredentials({
          accountId: MOCK_CONSTANTS.accountId,
          region: MOCK_CONSTANTS.region,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          assumeRoleName: MOCK_CONSTANTS.assumeRoleName,
        }),
      ).rejects.toThrow('When assumeRoleName provided partition must be provided');
    });

    test('should return undefined when already in target role', async () => {
      mockExecuteApi.mockResolvedValue({
        Arn: MOCK_CONSTANTS.assumeRoleArn,
      });

      const result = await getCredentials({
        accountId: MOCK_CONSTANTS.accountId,
        region: MOCK_CONSTANTS.region,
        logPrefix: MOCK_CONSTANTS.logPrefix,
        assumeRoleArn: MOCK_CONSTANTS.assumeRoleArn,
      });

      expect(result).toBeUndefined();
    });

    test('should assume role successfully with assumeRoleName', async () => {
      mockExecuteApi
        .mockResolvedValueOnce({ Arn: 'arn:aws:iam::111111111111:role/CurrentRole' })
        .mockResolvedValueOnce({
          Credentials: {
            AccessKeyId: MOCK_CONSTANTS.credentials.accessKeyId,
            SecretAccessKey: MOCK_CONSTANTS.credentials.secretAccessKey,
            SessionToken: MOCK_CONSTANTS.credentials.sessionToken,
            Expiration: MOCK_CONSTANTS.credentials.expiration,
          },
        });

      const result = await getCredentials({
        accountId: MOCK_CONSTANTS.accountId,
        region: MOCK_CONSTANTS.region,
        logPrefix: MOCK_CONSTANTS.logPrefix,
        partition: MOCK_CONSTANTS.partition,
        assumeRoleName: MOCK_CONSTANTS.assumeRoleName,
        sessionName: MOCK_CONSTANTS.sessionName,
      });

      expect(result).toEqual(MOCK_CONSTANTS.credentials);
    });

    test('should assume role successfully with assumeRoleArn', async () => {
      mockExecuteApi
        .mockResolvedValueOnce({ Arn: 'arn:aws:iam::111111111111:role/CurrentRole' })
        .mockResolvedValueOnce({
          Credentials: {
            AccessKeyId: MOCK_CONSTANTS.credentials.accessKeyId,
            SecretAccessKey: MOCK_CONSTANTS.credentials.secretAccessKey,
            SessionToken: MOCK_CONSTANTS.credentials.sessionToken,
            Expiration: MOCK_CONSTANTS.credentials.expiration,
          },
        });

      const result = await getCredentials({
        accountId: MOCK_CONSTANTS.accountId,
        region: MOCK_CONSTANTS.region,
        logPrefix: MOCK_CONSTANTS.logPrefix,
        assumeRoleArn: MOCK_CONSTANTS.assumeRoleArn,
      });

      expect(result).toEqual(MOCK_CONSTANTS.credentials);
    });

    test('should use default session name when not provided', async () => {
      mockExecuteApi
        .mockResolvedValueOnce({ Arn: 'arn:aws:iam::111111111111:role/CurrentRole' })
        .mockResolvedValueOnce({
          Credentials: {
            AccessKeyId: MOCK_CONSTANTS.credentials.accessKeyId,
            SecretAccessKey: MOCK_CONSTANTS.credentials.secretAccessKey,
            SessionToken: MOCK_CONSTANTS.credentials.sessionToken,
            Expiration: MOCK_CONSTANTS.credentials.expiration,
          },
        });

      await getCredentials({
        accountId: MOCK_CONSTANTS.accountId,
        region: MOCK_CONSTANTS.region,
        logPrefix: MOCK_CONSTANTS.logPrefix,
        assumeRoleArn: MOCK_CONSTANTS.assumeRoleArn,
      });

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'AssumeRoleCommand',
        { RoleArn: MOCK_CONSTANTS.assumeRoleArn, RoleSessionName: 'AcceleratorAssumeRole' },
        expect.any(Function),
        expect.anything(),
        MOCK_CONSTANTS.logPrefix,
      );
    });

    test('should throw error when AssumeRoleCommand returns no credentials', async () => {
      mockExecuteApi
        .mockResolvedValueOnce({ Arn: 'arn:aws:iam::111111111111:role/CurrentRole' })
        .mockResolvedValueOnce({});

      await expect(
        getCredentials({
          accountId: MOCK_CONSTANTS.accountId,
          region: MOCK_CONSTANTS.region,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          assumeRoleArn: MOCK_CONSTANTS.assumeRoleArn,
        }),
      ).rejects.toThrow('ServiceException: AssumeRoleCommand did not return Credentials');
    });

    test('should throw error when missing AccessKeyId', async () => {
      mockExecuteApi
        .mockResolvedValueOnce({ Arn: 'arn:aws:iam::111111111111:role/CurrentRole' })
        .mockResolvedValueOnce({
          Credentials: {
            SecretAccessKey: 'secret',
            SessionToken: 'token',
          },
        });

      await expect(
        getCredentials({
          accountId: MOCK_CONSTANTS.accountId,
          region: MOCK_CONSTANTS.region,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          assumeRoleArn: MOCK_CONSTANTS.assumeRoleArn,
        }),
      ).rejects.toThrow('ServiceException: AssumeRoleCommand did not return AccessKeyId');
    });

    test('should throw error when missing SecretAccessKey', async () => {
      mockExecuteApi
        .mockResolvedValueOnce({ Arn: 'arn:aws:iam::111111111111:role/CurrentRole' })
        .mockResolvedValueOnce({
          Credentials: {
            AccessKeyId: 'key',
            SessionToken: 'token',
          },
        });

      await expect(
        getCredentials({
          accountId: MOCK_CONSTANTS.accountId,
          region: MOCK_CONSTANTS.region,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          assumeRoleArn: MOCK_CONSTANTS.assumeRoleArn,
        }),
      ).rejects.toThrow('ServiceException: AssumeRoleCommand did not return SecretAccessKey');
    });

    test('should throw error when missing SessionToken', async () => {
      mockExecuteApi
        .mockResolvedValueOnce({ Arn: 'arn:aws:iam::111111111111:role/CurrentRole' })
        .mockResolvedValueOnce({
          Credentials: {
            AccessKeyId: 'key',
            SecretAccessKey: 'secret',
          },
        });

      await expect(
        getCredentials({
          accountId: MOCK_CONSTANTS.accountId,
          region: MOCK_CONSTANTS.region,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          assumeRoleArn: MOCK_CONSTANTS.assumeRoleArn,
        }),
      ).rejects.toThrow('ServiceException: AssumeRoleCommand did not return SessionToken');
    });
  });

  describe('getGlobalRegion', () => {
    test('should return correct regions for different partitions', () => {
      expect(getGlobalRegion('aws-us-gov')).toBe('us-gov-west-1');
      expect(getGlobalRegion('aws-iso')).toBe('us-iso-east-1');
      expect(getGlobalRegion('aws-iso-b')).toBe('us-isob-east-1');
      expect(getGlobalRegion('aws-iso-e')).toBe('eu-isoe-west-1');
      expect(getGlobalRegion('aws-iso-f')).toBe('us-isof-south-1');
      expect(getGlobalRegion('aws-cn')).toBe('cn-northwest-1');
      expect(getGlobalRegion('aws')).toBe('us-east-1');
      expect(getGlobalRegion('unknown')).toBe('us-east-1');
    });
  });

  describe('getCurrentSessionDetails', () => {
    test('should return session details successfully', async () => {
      const mockClient = {
        config: {
          region: vi.fn().mockResolvedValue('us-west-2'),
        },
      };
      vi.mocked(STSClient).mockReturnValue(mockClient as STSClient);

      mockExecuteApi.mockResolvedValue({
        Account: MOCK_CONSTANTS.accountId,
        Arn: 'arn:aws:iam::123456789012:role/TestRole',
      });

      const result = await getCurrentSessionDetails({ region: MOCK_CONSTANTS.region });

      expect(result).toEqual({
        invokingAccountId: MOCK_CONSTANTS.accountId,
        region: MOCK_CONSTANTS.region,
        globalRegion: 'us-east-1',
        partition: 'aws',
      });
    });

    test('should use default logPrefix when not provided', async () => {
      const mockClient = {
        config: {
          region: vi.fn().mockResolvedValue('us-west-2'),
        },
      };
      vi.mocked(STSClient).mockReturnValue(mockClient as STSClient);

      mockExecuteApi.mockResolvedValue({
        Account: MOCK_CONSTANTS.accountId,
        Arn: 'arn:aws:iam::123456789012:role/TestRole',
      });

      await getCurrentSessionDetails({ region: MOCK_CONSTANTS.region });

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'GetCallerIdentityCommand',
        {},
        expect.any(Function),
        expect.anything(),
        'Invoker:us-west-2',
      );
    });

    test('should throw error when Account is missing', async () => {
      const mockClient = {
        config: {
          region: vi.fn().mockResolvedValue('us-west-2'),
        },
      };
      vi.mocked(STSClient).mockReturnValue(mockClient as STSClient);

      mockExecuteApi.mockResolvedValue({
        Arn: 'arn:aws:iam::123456789012:role/TestRole',
      });

      await expect(getCurrentSessionDetails({ region: MOCK_CONSTANTS.region })).rejects.toThrow(
        'ServiceException: GetCallerIdentityCommand did not return Account property',
      );
    });

    test('should throw error when Arn is missing', async () => {
      const mockClient = {
        config: {
          region: vi.fn().mockResolvedValue('us-west-2'),
        },
      };
      vi.mocked(STSClient).mockReturnValue(mockClient as STSClient);

      mockExecuteApi.mockResolvedValue({
        Account: MOCK_CONSTANTS.accountId,
      });

      await expect(getCurrentSessionDetails({ region: MOCK_CONSTANTS.region })).rejects.toThrow(
        'ServiceException: GetCallerIdentityCommand did not return Arn property',
      );
    });

    test('should handle different partitions in ARN', async () => {
      const mockClient = {
        config: {
          region: vi.fn().mockResolvedValue('us-west-2'),
        },
      };
      vi.mocked(STSClient).mockReturnValue(mockClient as STSClient);

      mockExecuteApi.mockResolvedValue({
        Account: MOCK_CONSTANTS.accountId,
        Arn: 'arn:aws-us-gov:iam::123456789012:role/TestRole',
      });

      const result = await getCurrentSessionDetails({ region: MOCK_CONSTANTS.region });

      expect(result.partition).toBe('aws-us-gov');
      expect(result.globalRegion).toBe('us-gov-west-1');
    });

    test('should use config region when no region parameter provided', async () => {
      const mockClient = {
        config: {
          region: vi.fn().mockResolvedValue('eu-west-1'),
        },
      };
      vi.mocked(STSClient).mockReturnValue(mockClient as STSClient);

      mockExecuteApi.mockResolvedValue({
        Account: MOCK_CONSTANTS.accountId,
        Arn: 'arn:aws:iam::123456789012:role/TestRole',
      });

      // Pass undefined region to trigger fallback to config region
      const result = await getCurrentSessionDetails({});

      expect(result.region).toBe('eu-west-1');
    });

    test('should throw error when all region sources are missing', async () => {
      const mockClient = {
        config: {
          region: vi.fn().mockResolvedValue(undefined),
        },
      };
      vi.mocked(STSClient).mockReturnValue(mockClient as STSClient);

      mockExecuteApi.mockResolvedValue({
        Account: MOCK_CONSTANTS.accountId,
        Arn: 'arn:aws:iam::123456789012:role/TestRole',
      });

      await expect(getCurrentSessionDetails({})).rejects.toThrow('Region is missing');
    });
  });
});
