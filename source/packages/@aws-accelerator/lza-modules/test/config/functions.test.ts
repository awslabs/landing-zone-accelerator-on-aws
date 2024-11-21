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
import {
  AWSOrganizationsNotInUseException,
  DescribeOrganizationCommand,
  OrganizationsClient,
  paginateListAccounts,
} from '@aws-sdk/client-organizations';
import { STSClient, GetCallerIdentityCommand, AssumeRoleCommand } from '@aws-sdk/client-sts';

import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import fs from 'fs';

import {
  getCredentials,
  getManagementAccountCredentials,
  getOrganizationAccounts,
  getOrganizationDetails,
  validateConfigDirPath,
} from '../../lib/config/functions';

//
// Mock values
//
const MOCK_CONSTANTS = {
  // Common
  globalRegion: 'us-east-1',
  solutionId: 'SO0111',
  partition: 'aws',
  region: 'us-east-1',

  managementAccountId: '123456789012',
  managementAccountRoleName: 'ManagementAccountRole',

  credentials: {
    accessKeyId: 'AKIAXXXXXXXXXXXXXXXX',
    secretAccessKey: 'mock-secret-key',
    sessionToken: 'mock-session-token',
    expiration: new Date('2024-12-31'),
  },

  //validateConfigDirPath
  configDirPath: '/path/to/config',
  mandatoryConfigFiles: [
    'accounts-config.yaml',
    'global-config.yaml',
    'iam-config.yaml',
    'network-config.yaml',
    'organization-config.yaml',
    'security-config.yaml',
  ],

  //getCredentials
  accountId: '123456789012',
  roleName: 'TestRole',
  roleArn: 'arn:aws:iam::123456789012:role/TestRole',
  differentRoleArn: 'arn:aws:iam::123456789012:role/DifferentRole',
  sessionName: 'TestSession',
  assumeRoleName: 'assumeRoleName',

  AwsApiCredentials: {
    Credentials: {
      AccessKeyId: 'AKIAXXXXXXXXXXXXXXXX',
      SecretAccessKey: 'mock-secret-key',
      SessionToken: 'mock-session-token',
      Expiration: new Date('2024-12-31'),
    },
  },

  //getOrganizationDetails
  organization: {
    Id: 'o-1234567890',
    Arn: 'arn:aws:organizations::123456789012:organization/o-1234567890',
    FeatureSet: 'ALL',
    MasterAccountArn: 'arn:aws:organizations::123456789012:account/o-1234567890/123456789012',
    MasterAccountId: '123456789012',
    MasterAccountEmail: 'test@example.com',
  },

  //getOrganizationAccounts
  accounts: [
    {
      Id: '111111111111',
      Arn: 'arn:aws:organizations::111111111111:account/o-exampleorgid/111111111111',
      Email: 'account1@example.com',
      Name: 'Account1',
      Status: 'ACTIVE',
      JoinedMethod: 'CREATED',
      JoinedTimestamp: new Date('2023-01-01'),
    },
    {
      Id: '222222222222',
      Arn: 'arn:aws:organizations::111111111111:account/o-exampleorgid/222222222222',
      Email: 'account2@example.com',
      Name: 'Account2',
      Status: 'ACTIVE',
      JoinedMethod: 'INVITED',
      JoinedTimestamp: new Date('2023-01-02'),
    },
  ],
};

// Mock the AWS SDK(s)
jest.mock('@aws-sdk/client-sts');
jest.mock('@aws-sdk/client-organizations', () => ({
  ...jest.requireActual('@aws-sdk/client-organizations'),
  paginateListAccounts: jest.fn(),
  OrganizationsClient: jest.fn(),
}));

describe('Functions', () => {
  describe('validateConfigDirPath', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('Should throw error when directory does not exist', () => {
      // Setup

      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      // Verify

      expect(() => validateConfigDirPath(MOCK_CONSTANTS.configDirPath)).toThrow(
        `Invalid config directory path !!! "${MOCK_CONSTANTS.configDirPath}" not found`,
      );
    });

    test('Should throw error when mandatory configuration files are missing', () => {
      // Setup

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(fs, 'readdirSync').mockReturnValue([] as any);

      // Verify

      expect(() => validateConfigDirPath(MOCK_CONSTANTS.configDirPath)).toThrow(
        `Missing mandatory configuration files in ${MOCK_CONSTANTS.configDirPath}. \n Missing files are accounts-config.yaml,global-config.yaml,iam-config.yaml,network-config.yaml,organization-config.yaml,security-config.yaml`,
      );
    });

    test('Successfully validate the config directory path', () => {
      // Setup

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(fs, 'readdirSync').mockReturnValue(MOCK_CONSTANTS.mandatoryConfigFiles as any);

      // Verify

      expect(validateConfigDirPath(MOCK_CONSTANTS.configDirPath)).toBeUndefined();
      expect(() => validateConfigDirPath(MOCK_CONSTANTS.configDirPath)).not.toThrow();
    });
  });

  describe('getCredentials', () => {
    const mockSend = jest.fn();

    beforeEach(() => {
      jest.clearAllMocks();
      mockSend.mockClear();

      (STSClient as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));
    });

    test('should throw error when both assumeRoleName and assumeRoleArn are provided', async () => {
      // Verify

      await expect(
        getCredentials({
          accountId: MOCK_CONSTANTS.accountId,
          region: MOCK_CONSTANTS.region,
          solutionId: MOCK_CONSTANTS.solutionId,
          assumeRoleName: MOCK_CONSTANTS.roleName,
          assumeRoleArn: MOCK_CONSTANTS.roleArn,
        }),
      ).rejects.toThrow('Either assumeRoleName or assumeRoleArn can be provided not both');
    });

    test('should throw error when neither assumeRoleName nor assumeRoleArn is provided', async () => {
      // Verify

      await expect(
        getCredentials({
          accountId: MOCK_CONSTANTS.accountId,
          region: MOCK_CONSTANTS.region,
          solutionId: MOCK_CONSTANTS.solutionId,
        }),
      ).rejects.toThrow('Either assumeRoleName or assumeRoleArn must provided');
    });

    test('should throw error when assumeRoleName is provided without partition', async () => {
      // Verify

      await expect(
        getCredentials({
          accountId: MOCK_CONSTANTS.accountId,
          region: MOCK_CONSTANTS.region,
          solutionId: MOCK_CONSTANTS.solutionId,
          assumeRoleName: MOCK_CONSTANTS.roleName,
        }),
      ).rejects.toThrow('When assumeRoleName provided partition must be provided');
    });

    test('should return undefined when already in target role', async () => {
      // Setup

      mockSend.mockResolvedValueOnce({
        Arn: MOCK_CONSTANTS.roleArn,
      });

      // Execute

      const result = await getCredentials({
        accountId: MOCK_CONSTANTS.accountId,
        region: MOCK_CONSTANTS.region,
        solutionId: MOCK_CONSTANTS.solutionId,
        assumeRoleArn: MOCK_CONSTANTS.roleArn,
      });

      // Verify

      expect(result).toBeUndefined();
      expect(mockSend).toHaveBeenCalledWith(expect.any(GetCallerIdentityCommand));
    });

    test('should return credentials successfully with assumeRoleArn parameter', async () => {
      // Setup

      mockSend
        .mockResolvedValueOnce({ Arn: MOCK_CONSTANTS.differentRoleArn })
        .mockResolvedValueOnce(MOCK_CONSTANTS.AwsApiCredentials);

      // Execute

      const result = await getCredentials({
        accountId: MOCK_CONSTANTS.accountId,
        region: MOCK_CONSTANTS.region,
        solutionId: MOCK_CONSTANTS.solutionId,
        assumeRoleArn: MOCK_CONSTANTS.roleArn,
        sessionName: MOCK_CONSTANTS.sessionName,
      });

      // Verify

      expect(result).toEqual({
        accessKeyId: MOCK_CONSTANTS.credentials.accessKeyId,
        secretAccessKey: MOCK_CONSTANTS.credentials.secretAccessKey,
        sessionToken: MOCK_CONSTANTS.credentials.sessionToken,
        expiration: MOCK_CONSTANTS.credentials.expiration,
      });

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenNthCalledWith(1, expect.any(GetCallerIdentityCommand));
      expect(mockSend).toHaveBeenNthCalledWith(2, expect.any(AssumeRoleCommand));
    });

    test('should return credentials successfully with partition, accountId and assumeRoleName parameter', async () => {
      // Setup

      mockSend
        .mockResolvedValueOnce({ Arn: MOCK_CONSTANTS.differentRoleArn })
        .mockResolvedValueOnce(MOCK_CONSTANTS.AwsApiCredentials);

      // Execute

      const result = await getCredentials({
        accountId: MOCK_CONSTANTS.accountId,
        region: MOCK_CONSTANTS.region,
        solutionId: MOCK_CONSTANTS.solutionId,
        partition: MOCK_CONSTANTS.partition,
        assumeRoleName: MOCK_CONSTANTS.assumeRoleName,
        sessionName: MOCK_CONSTANTS.sessionName,
      });

      // Verify

      expect(result).toEqual({
        accessKeyId: MOCK_CONSTANTS.credentials.accessKeyId,
        secretAccessKey: MOCK_CONSTANTS.credentials.secretAccessKey,
        sessionToken: MOCK_CONSTANTS.credentials.sessionToken,
        expiration: MOCK_CONSTANTS.credentials.expiration,
      });

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenNthCalledWith(1, expect.any(GetCallerIdentityCommand));
      expect(mockSend).toHaveBeenNthCalledWith(2, expect.any(AssumeRoleCommand));
    });

    test('should throw error when Credentials is missing from AssumeRole command', async () => {
      // Setup

      mockSend.mockResolvedValueOnce({ Arn: MOCK_CONSTANTS.differentRoleArn }).mockResolvedValueOnce({});

      // Verify

      await expect(
        getCredentials({
          accountId: MOCK_CONSTANTS.accountId,
          region: MOCK_CONSTANTS.region,
          solutionId: MOCK_CONSTANTS.solutionId,
          assumeRoleArn: MOCK_CONSTANTS.roleArn,
        }),
      ).rejects.toThrowError('Credentials not found from AssumeRole command');
    });

    test('should throw error when AccessKeyId is missing from credentials', async () => {
      // Setup

      mockSend
        .mockResolvedValueOnce({ Arn: MOCK_CONSTANTS.differentRoleArn })
        .mockResolvedValueOnce({ Credentials: { SecretAccessKey: MOCK_CONSTANTS.credentials.secretAccessKey } });

      // Verify

      await expect(
        getCredentials({
          accountId: MOCK_CONSTANTS.accountId,
          region: MOCK_CONSTANTS.region,
          solutionId: MOCK_CONSTANTS.solutionId,
          assumeRoleArn: MOCK_CONSTANTS.roleArn,
        }),
      ).rejects.toThrowError('Access key ID not returned from AssumeRole command');
    });

    test('should throw error when SecretAccessKey is missing from credentials', async () => {
      // Setup

      mockSend.mockResolvedValueOnce({ Arn: MOCK_CONSTANTS.differentRoleArn }).mockResolvedValueOnce({
        Credentials: {
          AccessKeyId: MOCK_CONSTANTS.credentials.accessKeyId,
        },
      });

      // Verify

      await expect(
        getCredentials({
          accountId: MOCK_CONSTANTS.accountId,
          region: MOCK_CONSTANTS.region,
          solutionId: MOCK_CONSTANTS.solutionId,
          assumeRoleArn: MOCK_CONSTANTS.roleArn,
        }),
      ).rejects.toThrow('Secret access key not returned from AssumeRole command');
    });

    test('should throw error when SessionToken is missing from credentials', async () => {
      // Setup

      mockSend.mockResolvedValueOnce({ Arn: MOCK_CONSTANTS.differentRoleArn }).mockResolvedValueOnce({
        Credentials: {
          AccessKeyId: MOCK_CONSTANTS.credentials.accessKeyId,
          SecretAccessKey: MOCK_CONSTANTS.credentials.secretAccessKey,
        },
      });

      // Verify

      await expect(
        getCredentials({
          accountId: MOCK_CONSTANTS.accountId,
          region: MOCK_CONSTANTS.region,
          solutionId: MOCK_CONSTANTS.solutionId,
          assumeRoleArn: MOCK_CONSTANTS.roleArn,
        }),
      ).rejects.toThrow('Session token not returned from AssumeRole command');
    });
  });

  describe('getManagementAccountCredentials', () => {
    const mockSend = jest.fn();

    beforeEach(() => {
      jest.clearAllMocks();

      delete process.env['MANAGEMENT_ACCOUNT_ID'];
      delete process.env['MANAGEMENT_ACCOUNT_ROLE_NAME'];

      (STSClient as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));
    });

    test('should return undefined when environment variables are not set', async () => {
      // Verify

      const result = await getManagementAccountCredentials(
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.solutionId,
      );

      expect(result).toBeUndefined();
    });

    test('should return credentials when environment variables are properly set', async () => {
      // Setup

      process.env['MANAGEMENT_ACCOUNT_ID'] = MOCK_CONSTANTS.managementAccountId;
      process.env['MANAGEMENT_ACCOUNT_ROLE_NAME'] = MOCK_CONSTANTS.managementAccountRoleName;

      // Mock GetCallerIdentity response
      mockSend.mockResolvedValueOnce({
        Arn: MOCK_CONSTANTS.differentRoleArn,
      });

      // Mock AssumeRole response
      mockSend.mockResolvedValueOnce({
        Credentials: {
          AccessKeyId: MOCK_CONSTANTS.credentials.accessKeyId,
          SecretAccessKey: MOCK_CONSTANTS.credentials.secretAccessKey,
          SessionToken: MOCK_CONSTANTS.credentials.sessionToken,
          Expiration: MOCK_CONSTANTS.credentials.expiration,
        },
      });

      // Execute

      const result = await getManagementAccountCredentials(
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.solutionId,
      );

      // Verify

      expect(result).toEqual(MOCK_CONSTANTS.credentials);
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenNthCalledWith(1, expect.any(GetCallerIdentityCommand));
    });

    test('should handle getCredentials throwing an error', async () => {
      // Setup

      process.env['MANAGEMENT_ACCOUNT_ID'] = MOCK_CONSTANTS.managementAccountId;
      process.env['MANAGEMENT_ACCOUNT_ROLE_NAME'] = MOCK_CONSTANTS.managementAccountRoleName;

      const mockError = new Error('Failed to get credentials');
      mockSend.mockRejectedValueOnce(mockError);

      // Verify

      await expect(
        getManagementAccountCredentials(MOCK_CONSTANTS.partition, MOCK_CONSTANTS.region, MOCK_CONSTANTS.solutionId),
      ).rejects.toThrow(mockError);

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should handle partial environment variable configuration', async () => {
      // Setup

      process.env['MANAGEMENT_ACCOUNT_ID'] = MOCK_CONSTANTS.managementAccountId;

      // Execute

      const result = await getManagementAccountCredentials(
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.solutionId,
      );

      // Verify

      expect(result).toBeUndefined();
    });
  });

  describe('getOrganizationDetails', () => {
    const mockSend = jest.fn();

    beforeEach(() => {
      jest.clearAllMocks();
      (OrganizationsClient as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));
    });

    test('should return organization details when successful', async () => {
      // Setup

      mockSend.mockResolvedValueOnce({
        Organization: MOCK_CONSTANTS.credentials,
      });

      // Execute

      const result = await getOrganizationDetails(
        MOCK_CONSTANTS.globalRegion,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.credentials,
      );

      // Verify

      expect(result).toEqual(MOCK_CONSTANTS.credentials);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith(expect.any(DescribeOrganizationCommand));
      expect(OrganizationsClient).toHaveBeenCalledWith({
        region: MOCK_CONSTANTS.globalRegion,
        customUserAgent: MOCK_CONSTANTS.solutionId,
        retryStrategy: expect.any(Object),
        credentials: MOCK_CONSTANTS.credentials,
      });
    });

    test('should throw error when Organization is not returned', async () => {
      // Setup

      mockSend.mockResolvedValueOnce({});

      // Verify

      await expect(
        getOrganizationDetails(MOCK_CONSTANTS.globalRegion, MOCK_CONSTANTS.solutionId, MOCK_CONSTANTS.credentials),
      ).rejects.toThrow("Aws Organization couldn't fetch organizations details");

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should return undefined when Organizations is not in use', async () => {
      // Setup

      mockSend.mockRejectedValueOnce(
        new AWSOrganizationsNotInUseException({
          message: 'AWS Organizations is not in use',
          $metadata: {},
        }),
      );

      // Execute

      const result = await getOrganizationDetails(
        MOCK_CONSTANTS.globalRegion,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.credentials,
      );

      // Verify

      expect(result).toBeUndefined();
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should throw error for other exceptions', async () => {
      // Setup

      const mockError = new Error('Some other error');
      mockSend.mockRejectedValueOnce(mockError);

      // Verify

      await expect(
        getOrganizationDetails(MOCK_CONSTANTS.globalRegion, MOCK_CONSTANTS.solutionId, MOCK_CONSTANTS.credentials),
      ).rejects.toThrow(mockError);

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should work without credentials parameter', async () => {
      // Setup

      mockSend.mockResolvedValueOnce({
        Organization: MOCK_CONSTANTS.credentials,
      });

      // Execute

      const result = await getOrganizationDetails(MOCK_CONSTANTS.globalRegion, MOCK_CONSTANTS.solutionId);

      // Verify

      expect(result).toEqual(MOCK_CONSTANTS.credentials);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(OrganizationsClient).toHaveBeenCalledWith({
        region: MOCK_CONSTANTS.globalRegion,
        customUserAgent: MOCK_CONSTANTS.solutionId,
        retryStrategy: expect.any(Object),
        credentials: undefined,
      });
    });
  });

  describe('getOrganizationAccounts', () => {
    test('should return organization accounts when no credentials provided', async () => {
      // Setup

      const mockPaginator = [{ Accounts: MOCK_CONSTANTS.accounts }];
      (paginateListAccounts as jest.Mock).mockImplementation(() => mockPaginator);

      // Execute

      const result = await getOrganizationAccounts(MOCK_CONSTANTS.globalRegion, MOCK_CONSTANTS.solutionId);

      // Verify

      expect(result).toEqual(MOCK_CONSTANTS.accounts);
      expect(OrganizationsClient).toHaveBeenCalledWith(
        expect.objectContaining({
          region: MOCK_CONSTANTS.globalRegion,
          customUserAgent: MOCK_CONSTANTS.solutionId,
          credentials: undefined,
        }),
      );
      expect(paginateListAccounts).toHaveBeenCalledWith({ client: expect.any(Object) }, {});
    });

    test('should return organization accounts with management account credentials', async () => {
      // Setup

      const mockPaginator = [{ Accounts: MOCK_CONSTANTS.accounts }];
      (paginateListAccounts as jest.Mock).mockImplementation(() => mockPaginator);

      // Execute

      const result = await getOrganizationAccounts(
        MOCK_CONSTANTS.globalRegion,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.credentials,
      );

      // Verify

      expect(result).toEqual(MOCK_CONSTANTS.accounts);
      expect(OrganizationsClient).toHaveBeenCalledWith(
        expect.objectContaining({
          region: MOCK_CONSTANTS.globalRegion,
          customUserAgent: MOCK_CONSTANTS.solutionId,
          credentials: MOCK_CONSTANTS.credentials,
        }),
      );
    });

    test('should return organization accounts with management account credentials', async () => {
      // Setup

      const mockPaginator = [{ Accounts: MOCK_CONSTANTS.accounts }];
      (paginateListAccounts as jest.Mock).mockImplementation(() => mockPaginator);

      // Execute

      const result = await getOrganizationAccounts(
        MOCK_CONSTANTS.globalRegion,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.credentials,
      );

      // Verify

      expect(result).toEqual(MOCK_CONSTANTS.accounts);
      expect(OrganizationsClient).toHaveBeenCalledWith(
        expect.objectContaining({
          region: MOCK_CONSTANTS.globalRegion,
          customUserAgent: MOCK_CONSTANTS.solutionId,
          credentials: MOCK_CONSTANTS.credentials,
        }),
      );
    });

    test('should handle empty accounts list', async () => {
      // Setup

      const mockPaginator = [{ Accounts: [] }];
      (paginateListAccounts as jest.Mock).mockImplementation(() => mockPaginator);

      // Execute

      const result = await getOrganizationAccounts(MOCK_CONSTANTS.globalRegion, MOCK_CONSTANTS.solutionId);

      // Verify

      expect(result).toEqual([]);
    });

    test('should handle multiple pages of accounts', async () => {
      // Setup

      const mockPaginator = [{ Accounts: [MOCK_CONSTANTS.accounts[0]] }, { Accounts: [MOCK_CONSTANTS.accounts[1]] }];
      (paginateListAccounts as jest.Mock).mockImplementation(() => mockPaginator);

      // Execute

      const result = await getOrganizationAccounts(MOCK_CONSTANTS.globalRegion, MOCK_CONSTANTS.solutionId);

      // Verify

      expect(result).toEqual(MOCK_CONSTANTS.accounts);
    });

    test('should handle undefined Accounts in response', async () => {
      // Setup

      const mockPaginator = [{ Accounts: undefined }];
      (paginateListAccounts as jest.Mock).mockImplementation(() => mockPaginator);

      // Execute

      const result = await getOrganizationAccounts(MOCK_CONSTANTS.globalRegion, MOCK_CONSTANTS.solutionId);

      // Verify

      expect(result).toEqual([]);
    });
  });
});
