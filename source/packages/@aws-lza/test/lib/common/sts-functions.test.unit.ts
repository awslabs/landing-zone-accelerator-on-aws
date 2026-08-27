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

import { STSClient } from '@aws-sdk/client-sts';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { IAssumeRoleCredential } from '../../../lib/common/interfaces';
import {
  createStsClient,
  getCredentials,
  getCurrentSessionDetails,
  getGlobalRegion,
  getS3Endpoint,
} from '../../../lib/common/sts-functions';

vi.mock('@aws-sdk/client-sts', () => ({
  STSClient: vi.fn(),
  AssumeRoleCommand: vi.fn(),
  GetCallerIdentityCommand: vi.fn(),
}));

vi.mock('../../../lib/common/utility', () => ({
  executeApi: vi.fn(),
  setRetryStrategy: vi.fn(function () {
    return {};
  }),
}));

vi.mock('../../../lib/common/logger', () => ({
  createLogger: vi.fn(function () {
    return {
      info: vi.fn(),
      error: vi.fn(),
    };
  }),
}));

vi.mock('../../../lib/common/types', () => ({
  MODULE_EXCEPTIONS: {
    SERVICE_EXCEPTION: 'ServiceException',
  },
}));

vi.mock('../../../lib/common/credential-cache', () => ({
  credentialCache: {
    getOrFetch: vi.fn(),
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
  let mockCredentialCache: { getOrFetch: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();
    const utility = await import('../../../lib/common/utility.js');
    mockExecuteApi = vi.mocked(utility.executeApi);

    const cache = await import('../../../lib/common/credential-cache.js');
    mockCredentialCache = vi.mocked(cache.credentialCache);

    // Default behavior: credential cache calls the fetcher function immediately
    mockCredentialCache.getOrFetch.mockImplementation(async (_, fetcher) => {
      return await fetcher();
    });
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

    test('should pass Policy parameter to AssumeRoleCommand when sessionPolicy is provided', async () => {
      const mockPolicy =
        '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:GetObject"],"Resource":"*"}]}';
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
        partition: MOCK_CONSTANTS.partition,
        assumeRoleName: MOCK_CONSTANTS.assumeRoleName,
        sessionPolicy: mockPolicy,
      });

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'AssumeRoleCommand',
        expect.objectContaining({ Policy: mockPolicy }),
        expect.any(Function),
        expect.anything(),
        MOCK_CONSTANTS.logPrefix,
      );
    });

    test('should not include Policy in AssumeRoleCommand when sessionPolicy is undefined', async () => {
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
        partition: MOCK_CONSTANTS.partition,
        assumeRoleName: MOCK_CONSTANTS.assumeRoleName,
      });

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'AssumeRoleCommand',
        expect.objectContaining({ Policy: undefined }),
        expect.any(Function),
        expect.anything(),
        MOCK_CONSTANTS.logPrefix,
      );
    });

    test('should throw when requireSessionPolicy is true and no sessionPolicy provided', async () => {
      mockExecuteApi.mockResolvedValueOnce({ Arn: 'arn:aws:iam::111111111111:role/CurrentRole' });

      await expect(
        getCredentials({
          accountId: MOCK_CONSTANTS.accountId,
          region: MOCK_CONSTANTS.region,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          partition: MOCK_CONSTANTS.partition,
          assumeRoleName: MOCK_CONSTANTS.assumeRoleName,
          requireSessionPolicy: true,
        }),
      ).rejects.toThrow('blocked: no session policy provided');
    });

    test('should throw when sessionPolicy is invalid JSON', async () => {
      mockExecuteApi.mockResolvedValueOnce({ Arn: 'arn:aws:iam::111111111111:role/CurrentRole' });

      await expect(
        getCredentials({
          accountId: MOCK_CONSTANTS.accountId,
          region: MOCK_CONSTANTS.region,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          partition: MOCK_CONSTANTS.partition,
          assumeRoleName: MOCK_CONSTANTS.assumeRoleName,
          sessionPolicy: 'not-valid-json',
        }),
      ).rejects.toThrow('Invalid session policy JSON');
    });

    test('should throw when sessionPolicy is empty string', async () => {
      mockExecuteApi.mockResolvedValueOnce({ Arn: 'arn:aws:iam::111111111111:role/CurrentRole' });

      await expect(
        getCredentials({
          accountId: MOCK_CONSTANTS.accountId,
          region: MOCK_CONSTANTS.region,
          logPrefix: MOCK_CONSTANTS.logPrefix,
          partition: MOCK_CONSTANTS.partition,
          assumeRoleName: MOCK_CONSTANTS.assumeRoleName,
          sessionPolicy: '',
          requireSessionPolicy: true,
        }),
      ).rejects.toThrow('blocked: no session policy provided');
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
      expect(getGlobalRegion('aws-eusc')).toBe('eusc-de-east-1');
      expect(getGlobalRegion('aws')).toBe('us-east-1');
      expect(getGlobalRegion('unknown')).toBe('us-east-1');
    });
  });

  describe('getS3Endpoint', () => {
    const bucket = 'cdk-accel-assets-049171542103-eusc-de-east-1';

    test('should return the EUSC S3 endpoint for aws-eusc partition', () => {
      expect(getS3Endpoint('aws-eusc', 'eusc-de-east-1', bucket)).toBe(
        `https://${bucket}.s3.eusc-de-east-1.amazonaws.eu`,
      );
    });

    test('should return correct endpoints for isolated and sovereign partitions', () => {
      expect(getS3Endpoint('aws-iso', 'us-iso-east-1', bucket)).toBe(`https://${bucket}.s3.us-iso-east-1.c2s.ic.gov`);
      expect(getS3Endpoint('aws-iso-b', 'us-isob-east-1', bucket)).toBe(
        `https://${bucket}.s3.us-isob-east-1.sc2s.sgov.gov`,
      );
      expect(getS3Endpoint('aws-iso-f', 'us-isof-south-1', bucket)).toBe(
        `https://${bucket}.s3.us-isof-south-1.csp.hci.ic.gov`,
      );
      expect(getS3Endpoint('aws-iso-e', 'eu-isoe-west-1', bucket)).toBe(
        `https://${bucket}.s3.eu-isoe-west-1.cloud.adc-e.uk`,
      );
      expect(getS3Endpoint('aws-cn', 'cn-northwest-1', bucket)).toBe(
        `https://${bucket}.s3.cn-northwest-1.amazonaws.com.cn`,
      );
    });

    test('should return the commercial S3 endpoint for aws, GovCloud, and unknown partitions', () => {
      expect(getS3Endpoint('aws', 'us-east-1', bucket)).toBe(`https://${bucket}.s3.us-east-1.amazonaws.com`);
      expect(getS3Endpoint('aws-us-gov', 'us-gov-west-1', bucket)).toBe(
        `https://${bucket}.s3.us-gov-west-1.amazonaws.com`,
      );
      expect(getS3Endpoint('unknown', 'us-east-1', bucket)).toBe(`https://${bucket}.s3.us-east-1.amazonaws.com`);
    });
  });

  describe('getCurrentSessionDetails', () => {
    test('should return session details successfully', async () => {
      const mockClient = {
        config: {
          region: vi.fn().mockResolvedValue('us-west-2'),
        },
      };
      vi.mocked(STSClient).mockImplementation(function () {
        return mockClient as unknown as STSClient;
      });

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
      vi.mocked(STSClient).mockImplementation(function () {
        return mockClient as unknown as STSClient;
      });

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
      vi.mocked(STSClient).mockImplementation(function () {
        return mockClient as unknown as STSClient;
      });

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
      vi.mocked(STSClient).mockImplementation(function () {
        return mockClient as unknown as STSClient;
      });

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
      vi.mocked(STSClient).mockImplementation(function () {
        return mockClient as unknown as STSClient;
      });

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
      vi.mocked(STSClient).mockImplementation(function () {
        return mockClient as unknown as STSClient;
      });

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
      vi.mocked(STSClient).mockImplementation(function () {
        return mockClient as unknown as STSClient;
      });

      // Explicitly set the mock response for this test
      mockExecuteApi.mockResolvedValueOnce({
        Account: MOCK_CONSTANTS.accountId,
        Arn: 'arn:aws:iam::123456789012:role/TestRole',
      });

      await expect(getCurrentSessionDetails({})).rejects.toThrow('Region is missing');
    });
  });

  describe('createStsClient', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    test('should construct an STSClient with region, solutionId and credentials, and the retry strategy', () => {
      const credentials: IAssumeRoleCredential = {
        accessKeyId: 'AKIA',
        secretAccessKey: 'secret',
        sessionToken: 'token',
      };

      createStsClient({ region: 'us-east-1', solutionId: 'SO0199', credentials });

      expect(STSClient).toHaveBeenCalledTimes(1);
      expect(STSClient).toHaveBeenCalledWith({
        region: 'us-east-1',
        customUserAgent: 'SO0199',
        retryStrategy: expect.anything(),
        credentials,
      });
    });

    test('should NOT pass an explicit endpoint so the SDK resolves it natively (honors AWS_ENDPOINT_URL / FIPS)', () => {
      createStsClient({ region: 'eusc-de-east-1', solutionId: 'SO0199' });

      expect(STSClient).toHaveBeenCalledTimes(1);
      const config = (STSClient as unknown as vi.Mock).mock.calls[0][0];
      expect(config).not.toHaveProperty('endpoint');
      expect(config.endpoint).toBeUndefined();
    });

    test('should omit customUserAgent and credentials when not provided, and never set an endpoint', () => {
      createStsClient({ region: 'us-gov-west-1' });

      const config = (STSClient as unknown as vi.Mock).mock.calls[0][0];
      expect(config.region).toBe('us-gov-west-1');
      expect(config.customUserAgent).toBeUndefined();
      expect(config.credentials).toBeUndefined();
      expect(config).not.toHaveProperty('endpoint');
    });

    /**
     * Endpoint-resolution coverage.
     *
     * STSClient is mocked in this file, so the mock captures the config `createStsClient`
     * builds but cannot resolve a host. To verify that "no explicit endpoint + this region"
     * actually resolves to the correct partition STS URL, feed the captured region into a
     * REAL STSClient (via `vi.importActual`) and resolve through its own endpoint provider.
     * This proves, for every partition including the isolated/sovereign ones, that removing
     * the hardcoded endpoint still targets the right host.
     */
    describe('resolves the correct STS endpoint URL per partition (no hardcoded endpoint)', () => {
      const PARTITION_STS_URLS: ReadonlyArray<{ partition: string; region: string; url: string }> = [
        { partition: 'aws', region: 'us-east-1', url: 'https://sts.us-east-1.amazonaws.com/' },
        { partition: 'aws', region: 'eu-west-1', url: 'https://sts.eu-west-1.amazonaws.com/' },
        { partition: 'aws-us-gov', region: 'us-gov-west-1', url: 'https://sts.us-gov-west-1.amazonaws.com/' },
        { partition: 'aws-us-gov', region: 'us-gov-east-1', url: 'https://sts.us-gov-east-1.amazonaws.com/' },
        { partition: 'aws-cn', region: 'cn-north-1', url: 'https://sts.cn-north-1.amazonaws.com.cn/' },
        { partition: 'aws-cn', region: 'cn-northwest-1', url: 'https://sts.cn-northwest-1.amazonaws.com.cn/' },
        { partition: 'aws-iso', region: 'us-iso-east-1', url: 'https://sts.us-iso-east-1.c2s.ic.gov/' },
        { partition: 'aws-iso-b', region: 'us-isob-east-1', url: 'https://sts.us-isob-east-1.sc2s.sgov.gov/' },
        { partition: 'aws-iso-e', region: 'eu-isoe-west-1', url: 'https://sts.eu-isoe-west-1.cloud.adc-e.uk/' },
        { partition: 'aws-iso-f', region: 'us-isof-south-1', url: 'https://sts.us-isof-south-1.csp.hci.ic.gov/' },
        { partition: 'aws-eusc', region: 'eusc-de-east-1', url: 'https://sts.eusc-de-east-1.amazonaws.eu/' },
      ];

      test.each(PARTITION_STS_URLS)('$partition ($region) -> $url', async ({ region, url }) => {
        // createStsClient (under test) builds the config; the mock captures it.
        createStsClient({ region, solutionId: 'SO0199' });
        const config = (STSClient as unknown as vi.Mock).mock.calls[0][0];
        expect(config.region).toBe(region);
        expect(config).not.toHaveProperty('endpoint');

        // Resolve the captured region through the REAL SDK client to get the actual URL.
        const actual = await vi.importActual<typeof import('@aws-sdk/client-sts')>('@aws-sdk/client-sts');
        const realClient = new actual.STSClient({ region: config.region });
        const resolved = (
          realClient.config as unknown as {
            endpointProvider: (p: { Region: string; UseFIPS: boolean; UseDualStack: boolean }) => { url: URL };
          }
        ).endpointProvider({ Region: config.region, UseFIPS: false, UseDualStack: false }).url.href;

        expect(resolved).toBe(url);
      });

      test('covers every partition LZA supports, including the isolated/secret partitions', () => {
        const covered = new Set(PARTITION_STS_URLS.map(p => p.partition));
        for (const required of [
          'aws',
          'aws-us-gov',
          'aws-cn',
          'aws-iso',
          'aws-iso-b',
          'aws-iso-e',
          'aws-iso-f',
          'aws-eusc',
        ]) {
          expect(covered.has(required)).toBe(true);
        }
      });
    });
  });
});
