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
import { beforeEach, describe, expect, test } from '@jest/globals';
import {
  getAcceleratorModuleRunnerParameters,
  getCentralLogBucketName,
  getCentralLogsBucketKeyArn,
  getManagementAccountCredentials,
  getOrganizationAccounts,
  getOrganizationDetails,
  getRunnerTargetRegions,
  scriptUsage,
  validateAndGetRunnerParameters,
} from '../lib/functions';
import { version } from '../../../../package.json';
import {
  AWSOrganizationsNotInUseException,
  DescribeOrganizationCommand,
  OrganizationsClient,
  paginateListAccounts,
} from '@aws-sdk/client-organizations';
import { ParameterNotFound, SSMClient } from '@aws-sdk/client-ssm';
import {
  AccountsConfig,
  CustomizationsConfig,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  ReplacementsConfig,
  SecurityConfig,
} from '@aws-accelerator/config';
import { AcceleratorConfigurationsType } from '../models/types';
import { ConfigLoader } from '../lib/config-loader';
import {
  MOCK_CONSTANTS,
  mockAccountsConfiguration,
  mockCustomizationsConfig,
  mockIamConfig,
  mockImportedLoggingBucketGlobalConfig,
  mockLzaLoggingBucketGlobalConfig,
  mockNetworkConfig,
  mockOrganizationConfig,
  mockReplacementsConfig,
  mockSecurityConfig,
} from './mocked-resources';

const mockYargs = {
  options: jest.fn().mockReturnThis(),
  parseSync: jest.fn(),
};

//
// Mock Dependencies
//
jest.mock('@aws-sdk/client-organizations', () => ({
  ...jest.requireActual('@aws-sdk/client-organizations'),
  paginateListAccounts: jest.fn(),
  OrganizationsClient: jest.fn(),
  DescribeOrganizationCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({
      Parameter: MOCK_CONSTANTS.centralLogBucketCmkSsmParameter,
    }),
  })),
  GetParameterCommand: jest.fn(),
  ParameterNotFound: class ParameterNotFound extends Error {
    constructor() {
      super('Parameter not found');
      this.name = 'ParameterNotFound';
    }
  },
}));

jest.mock('yargs', () => ({
  __esModule: true,
  default: () => mockYargs,
}));

jest.mock('../../../@aws-lza/common/functions', () => ({
  getCredentials: jest.fn(),
  setRetryStrategy: jest.fn().mockReturnValue(undefined),
}));

jest.mock('../../../@aws-lza/common/logger', () => ({
  createLogger: jest.fn().mockReturnValue({
    info: jest.fn().mockReturnValue(undefined),
    warn: jest.fn().mockReturnValue(undefined),
    error: jest.fn().mockReturnValue(undefined),
  }),
}));

jest.mock('../../utils/lib/common-functions', () => ({
  ...jest.requireActual('../../utils/lib/common-functions'),
  getGlobalRegion: jest.fn(),
}));

describe('functions', () => {
  describe('validateAndGetRunnerParameters', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockYargs.options.mockReturnValue(mockYargs);
    });

    describe('required parameters validation', () => {
      test('should throw error when partition is missing', () => {
        mockYargs.parseSync.mockReturnValue({
          region: MOCK_CONSTANTS.runnerParameters.region,
          'config-dir': MOCK_CONSTANTS.runnerParameters.configDirPath,
          stage: 'pipeline',
        });

        expect(() => validateAndGetRunnerParameters()).toThrow(
          `Missing required parameters for lza module \n ** Script Usage ** ${scriptUsage}`,
        );
      });

      test('should throw error when region is missing', () => {
        mockYargs.parseSync.mockReturnValue({
          partition: MOCK_CONSTANTS.runnerParameters.partition,
          'config-dir': MOCK_CONSTANTS.runnerParameters.configDirPath,
          stage: 'pipeline',
        });

        expect(() => validateAndGetRunnerParameters()).toThrow(
          `Missing required parameters for lza module \n ** Script Usage ** ${scriptUsage}`,
        );
      });

      test('should throw error when config-dir is missing', () => {
        mockYargs.parseSync.mockReturnValue({
          partition: MOCK_CONSTANTS.runnerParameters.partition,
          region: MOCK_CONSTANTS.runnerParameters.region,
          stage: 'pipeline',
        });

        expect(() => validateAndGetRunnerParameters()).toThrow(
          `Missing required parameters for lza module \n ** Script Usage ** ${scriptUsage}`,
        );
      });
    });

    describe('use-existing-role parameter', () => {
      test('should set useExistingRole to false when parameter is not provided', () => {
        mockYargs.parseSync.mockReturnValue({
          partition: MOCK_CONSTANTS.runnerParameters.partition,
          region: MOCK_CONSTANTS.runnerParameters.region,
          'config-dir': MOCK_CONSTANTS.runnerParameters.configDirPath,
          stage: 'pipeline',
        });

        const result = validateAndGetRunnerParameters();
        expect(result.useExistingRole).toBe(false);
      });

      test('should set useExistingRole to true when parameter is "yes"', () => {
        mockYargs.parseSync.mockReturnValue({
          partition: MOCK_CONSTANTS.runnerParameters.partition,
          region: MOCK_CONSTANTS.runnerParameters.region,
          'config-dir': MOCK_CONSTANTS.runnerParameters.configDirPath,
          stage: 'pipeline',
          'use-existing-role': 'yes',
        });

        const result = validateAndGetRunnerParameters();
        expect(result.useExistingRole).toBe(true);
      });

      test('should set useExistingRole to false when parameter is "no"', () => {
        mockYargs.parseSync.mockReturnValue({
          partition: MOCK_CONSTANTS.runnerParameters.partition,
          region: MOCK_CONSTANTS.runnerParameters.region,
          'config-dir': MOCK_CONSTANTS.runnerParameters.configDirPath,
          stage: 'pipeline',
          'use-existing-role': 'no',
        });

        const result = validateAndGetRunnerParameters();
        expect(result.useExistingRole).toBe(false);
      });
    });

    describe('dry-run parameter', () => {
      test('should set dryRun to false when parameter is not provided', () => {
        mockYargs.parseSync.mockReturnValue({
          partition: MOCK_CONSTANTS.runnerParameters.partition,
          region: MOCK_CONSTANTS.runnerParameters.region,
          'config-dir': MOCK_CONSTANTS.runnerParameters.configDirPath,
          stage: 'pipeline',
        });

        const result = validateAndGetRunnerParameters();
        expect(result.dryRun).toBe(false);
      });

      test('should set dryRun to true when parameter is "yes"', () => {
        mockYargs.parseSync.mockReturnValue({
          partition: MOCK_CONSTANTS.runnerParameters.partition,
          region: MOCK_CONSTANTS.runnerParameters.region,
          'config-dir': MOCK_CONSTANTS.runnerParameters.configDirPath,
          stage: 'pipeline',
          'dry-run': 'yes',
        });

        const result = validateAndGetRunnerParameters();
        expect(result.dryRun).toBe(true);
      });

      test('should set dryRun to false when parameter is "no"', () => {
        mockYargs.parseSync.mockReturnValue({
          partition: MOCK_CONSTANTS.runnerParameters.partition,
          region: MOCK_CONSTANTS.runnerParameters.region,
          'config-dir': MOCK_CONSTANTS.runnerParameters.configDirPath,
          stage: 'pipeline',
          'dry-run': 'no',
        });

        const result = validateAndGetRunnerParameters();
        expect(result.dryRun).toBe(false);
      });
    });

    describe('return object', () => {
      test('should return object with all parameters including defaults', () => {
        mockYargs.parseSync.mockReturnValue({
          partition: MOCK_CONSTANTS.runnerParameters.partition,
          region: MOCK_CONSTANTS.runnerParameters.region,
          'config-dir': MOCK_CONSTANTS.runnerParameters.configDirPath,
          stage: 'pipeline',
        });

        const result = validateAndGetRunnerParameters();

        expect(result).toEqual({
          partition: MOCK_CONSTANTS.runnerParameters.partition,
          region: MOCK_CONSTANTS.runnerParameters.region,
          configDirPath: MOCK_CONSTANTS.runnerParameters.configDirPath,
          stage: 'pipeline',
          prefix: 'AWSAccelerator',
          useExistingRole: false,
          solutionId: `AwsSolution/SO0199/${version}`,
          dryRun: false,
        });
      });

      test('should use provided prefix when available', () => {
        mockYargs.parseSync.mockReturnValue({
          partition: MOCK_CONSTANTS.runnerParameters.partition,
          region: MOCK_CONSTANTS.runnerParameters.region,
          'config-dir': MOCK_CONSTANTS.runnerParameters.configDirPath,
          stage: 'pipeline',
          prefix: 'CustomPrefix',
        });

        const result = validateAndGetRunnerParameters();
        expect(result.prefix).toBe('CustomPrefix');
      });
    });
  });

  describe('getManagementAccountCredentials', () => {
    beforeEach(() => {
      jest.clearAllMocks();

      delete process.env['MANAGEMENT_ACCOUNT_ID'];
      delete process.env['MANAGEMENT_ACCOUNT_ROLE_NAME'];
    });

    test('should return undefined when environment variables are not set', async () => {
      // Verify

      const result = await getManagementAccountCredentials(
        MOCK_CONSTANTS.runnerParameters.partition,
        MOCK_CONSTANTS.runnerParameters.region,
        MOCK_CONSTANTS.runnerParameters.solutionId,
      );

      expect(result).toBeUndefined();
    });

    test('should return credentials when environment variables are properly set', async () => {
      // Setup

      process.env['MANAGEMENT_ACCOUNT_ID'] = MOCK_CONSTANTS.managementAccountId;
      process.env['MANAGEMENT_ACCOUNT_ROLE_NAME'] = MOCK_CONSTANTS.managementAccountAccessRole;

      jest
        .spyOn(require('../../../@aws-lza/common/functions'), 'getCredentials')
        .mockResolvedValue(MOCK_CONSTANTS.credentials);

      // Execute

      const result = await getManagementAccountCredentials(
        MOCK_CONSTANTS.runnerParameters.partition,
        MOCK_CONSTANTS.runnerParameters.region,
        MOCK_CONSTANTS.runnerParameters.solutionId,
      );

      // Verify

      expect(result).toEqual(MOCK_CONSTANTS.credentials);
    });

    test('should handle partial environment variable configuration', async () => {
      // Setup

      process.env['MANAGEMENT_ACCOUNT_ID'] = MOCK_CONSTANTS.managementAccountId;

      // Execute

      const result = await getManagementAccountCredentials(
        MOCK_CONSTANTS.runnerParameters.partition,
        MOCK_CONSTANTS.runnerParameters.region,
        MOCK_CONSTANTS.runnerParameters.solutionId,
      );

      // Verify

      expect(result).toBeUndefined();
    });
  });

  describe('getOrganizationAccounts', () => {
    test('should return organization accounts when no credentials provided', async () => {
      // Setup

      const mockPaginator = [{ Accounts: MOCK_CONSTANTS.organizationAccounts }];
      (paginateListAccounts as jest.Mock).mockImplementation(() => mockPaginator);

      // Execute

      const result = await getOrganizationAccounts(
        MOCK_CONSTANTS.globalRegion,
        MOCK_CONSTANTS.runnerParameters.solutionId,
      );

      // Verify

      expect(result).toEqual(MOCK_CONSTANTS.organizationAccounts);
      expect(OrganizationsClient).toHaveBeenCalledWith(
        expect.objectContaining({
          region: MOCK_CONSTANTS.globalRegion,
          customUserAgent: MOCK_CONSTANTS.runnerParameters.solutionId,
          credentials: undefined,
        }),
      );
      expect(paginateListAccounts).toHaveBeenCalledWith({ client: expect.any(Object) }, {});
    });

    test('should return organization accounts with management account credentials', async () => {
      // Setup

      const mockPaginator = [{ Accounts: MOCK_CONSTANTS.organizationAccounts }];
      (paginateListAccounts as jest.Mock).mockImplementation(() => mockPaginator);

      // Execute

      const result = await getOrganizationAccounts(
        MOCK_CONSTANTS.globalRegion,
        MOCK_CONSTANTS.runnerParameters.solutionId,
        MOCK_CONSTANTS.credentials,
      );

      // Verify

      expect(result).toEqual(MOCK_CONSTANTS.organizationAccounts);
      expect(OrganizationsClient).toHaveBeenCalledWith(
        expect.objectContaining({
          region: MOCK_CONSTANTS.globalRegion,
          customUserAgent: MOCK_CONSTANTS.runnerParameters.solutionId,
          credentials: MOCK_CONSTANTS.credentials,
        }),
      );
    });

    test('should return organization accounts with management account credentials', async () => {
      // Setup

      const mockPaginator = [{ Accounts: MOCK_CONSTANTS.organizationAccounts }];
      (paginateListAccounts as jest.Mock).mockImplementation(() => mockPaginator);

      // Execute

      const result = await getOrganizationAccounts(
        MOCK_CONSTANTS.globalRegion,
        MOCK_CONSTANTS.runnerParameters.solutionId,
        MOCK_CONSTANTS.credentials,
      );

      // Verify

      expect(result).toEqual(MOCK_CONSTANTS.organizationAccounts);
      expect(OrganizationsClient).toHaveBeenCalledWith(
        expect.objectContaining({
          region: MOCK_CONSTANTS.globalRegion,
          customUserAgent: MOCK_CONSTANTS.runnerParameters.solutionId,
          credentials: MOCK_CONSTANTS.credentials,
        }),
      );
    });

    test('should handle empty accounts list', async () => {
      // Setup

      const mockPaginator = [{ Accounts: [] }];
      (paginateListAccounts as jest.Mock).mockImplementation(() => mockPaginator);

      // Execute

      const result = await getOrganizationAccounts(
        MOCK_CONSTANTS.globalRegion,
        MOCK_CONSTANTS.runnerParameters.solutionId,
      );

      // Verify

      expect(result).toEqual([]);
    });

    test('should handle multiple pages of accounts', async () => {
      // Setup

      const mockPaginator = [
        { Accounts: [MOCK_CONSTANTS.organizationAccounts[0]] },
        { Accounts: [MOCK_CONSTANTS.organizationAccounts[1]] },
      ];
      (paginateListAccounts as jest.Mock).mockImplementation(() => mockPaginator);

      // Execute

      const result = await getOrganizationAccounts(
        MOCK_CONSTANTS.globalRegion,
        MOCK_CONSTANTS.runnerParameters.solutionId,
      );

      // Verify

      expect(result).toEqual(MOCK_CONSTANTS.organizationAccounts);
    });

    test('should handle undefined Accounts in response', async () => {
      // Setup

      const mockPaginator = [{ Accounts: undefined }];
      (paginateListAccounts as jest.Mock).mockImplementation(() => mockPaginator);

      // Execute

      const result = await getOrganizationAccounts(
        MOCK_CONSTANTS.globalRegion,
        MOCK_CONSTANTS.runnerParameters.solutionId,
      );

      // Verify

      expect(result).toEqual([]);
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
        MOCK_CONSTANTS.runnerParameters.solutionId,
        MOCK_CONSTANTS.credentials,
      );

      // Verify

      expect(result).toEqual(MOCK_CONSTANTS.credentials);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith(expect.any(DescribeOrganizationCommand));
      expect(OrganizationsClient).toHaveBeenCalledWith({
        region: MOCK_CONSTANTS.globalRegion,
        customUserAgent: MOCK_CONSTANTS.runnerParameters.solutionId,
        retryStrategy: undefined,
        credentials: MOCK_CONSTANTS.credentials,
      });
    });

    test('should throw error when Organization is not returned', async () => {
      // Setup

      mockSend.mockResolvedValueOnce({});

      // Verify

      await expect(
        getOrganizationDetails(
          MOCK_CONSTANTS.globalRegion,
          MOCK_CONSTANTS.runnerParameters.solutionId,
          MOCK_CONSTANTS.credentials,
        ),
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
        MOCK_CONSTANTS.runnerParameters.solutionId,
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
        getOrganizationDetails(
          MOCK_CONSTANTS.globalRegion,
          MOCK_CONSTANTS.runnerParameters.solutionId,
          MOCK_CONSTANTS.credentials,
        ),
      ).rejects.toThrow(mockError);

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should work without credentials parameter', async () => {
      // Setup

      mockSend.mockResolvedValueOnce({
        Organization: MOCK_CONSTANTS.credentials,
      });

      // Execute

      const result = await getOrganizationDetails(
        MOCK_CONSTANTS.globalRegion,
        MOCK_CONSTANTS.runnerParameters.solutionId,
      );

      // Verify

      expect(result).toEqual(MOCK_CONSTANTS.credentials);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(OrganizationsClient).toHaveBeenCalledWith({
        region: MOCK_CONSTANTS.globalRegion,
        customUserAgent: MOCK_CONSTANTS.runnerParameters.solutionId,
        retryStrategy: undefined,
        credentials: undefined,
      });
    });
  });

  describe('getCentralLogsBucketKeyArn', () => {
    const mockSend = jest.fn();
    let ssmMockClient: SSMClient;
    let mockAccountsConfig: Partial<AccountsConfig>;

    beforeEach(() => {
      jest.clearAllMocks();
      (SSMClient as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));
      ssmMockClient = new SSMClient({});
      mockAccountsConfig = {
        getLogArchiveAccount: jest.fn().mockReturnValue(MOCK_CONSTANTS.logArchiveAccount),
        getLogArchiveAccountId: jest.fn().mockReturnValue(MOCK_CONSTANTS.logArchiveAccountId),
        ...mockAccountsConfiguration,
      };
    });

    test('should return CMK ARN when parameter exists', async () => {
      // Setup
      jest
        .spyOn(require('../../../@aws-lza/common/functions'), 'getCredentials')
        .mockResolvedValue(MOCK_CONSTANTS.credentials);

      (ssmMockClient.send as jest.Mock).mockReturnValue({
        Parameter: MOCK_CONSTANTS.centralLogBucketCmkSsmParameter,
      });

      // Execute
      const result = await getCentralLogsBucketKeyArn(
        MOCK_CONSTANTS.runnerParameters.partition,
        MOCK_CONSTANTS.runnerParameters.solutionId,
        MOCK_CONSTANTS.centralizedLoggingRegion,
        MOCK_CONSTANTS.acceleratorResourceNames,
        mockLzaLoggingBucketGlobalConfig as GlobalConfig,
        mockAccountsConfig as AccountsConfig,
        MOCK_CONSTANTS.credentials,
      );

      // Verify
      expect(result).toBe(MOCK_CONSTANTS.centralLogBucketCmkSsmParameter.Value);
      expect(SSMClient).toHaveBeenCalledWith(
        expect.objectContaining({
          region: MOCK_CONSTANTS.runnerParameters.region,
          customUserAgent: MOCK_CONSTANTS.runnerParameters.solutionId,
          credentials: MOCK_CONSTANTS.credentials,
        }),
      );
    });

    test('should use imported bucket parameter name when createAcceleratorManagedKey is true', async () => {
      // Setup
      jest
        .spyOn(require('../../../@aws-lza/common/functions'), 'getCredentials')
        .mockResolvedValue(MOCK_CONSTANTS.credentials);

      (ssmMockClient.send as jest.Mock).mockReturnValue({
        Parameter: MOCK_CONSTANTS.centralLogBucketCmkSsmParameter,
      });

      // Execute
      const result = await getCentralLogsBucketKeyArn(
        MOCK_CONSTANTS.runnerParameters.partition,
        MOCK_CONSTANTS.runnerParameters.solutionId,
        MOCK_CONSTANTS.centralizedLoggingRegion,
        MOCK_CONSTANTS.acceleratorResourceNames,
        mockImportedLoggingBucketGlobalConfig as GlobalConfig,
        mockAccountsConfig as AccountsConfig,
        MOCK_CONSTANTS.credentials,
      );

      // Verify
      expect(result).toBe(MOCK_CONSTANTS.centralLogBucketCmkSsmParameter.Value);
      expect(SSMClient).toHaveBeenCalledWith(
        expect.objectContaining({
          region: MOCK_CONSTANTS.runnerParameters.region,
          customUserAgent: MOCK_CONSTANTS.runnerParameters.solutionId,
          credentials: MOCK_CONSTANTS.credentials,
        }),
      );
    });

    test('should return undefined when parameter is not found', async () => {
      // Setup
      jest
        .spyOn(require('../../../@aws-lza/common/functions'), 'getCredentials')
        .mockResolvedValue(MOCK_CONSTANTS.credentials);

      mockSend.mockRejectedValueOnce(
        new ParameterNotFound({
          message: 'Parameter not found',
          $metadata: {},
        }),
      );

      // Execute
      const result = await getCentralLogsBucketKeyArn(
        MOCK_CONSTANTS.runnerParameters.partition,
        MOCK_CONSTANTS.runnerParameters.solutionId,
        MOCK_CONSTANTS.centralizedLoggingRegion,
        MOCK_CONSTANTS.acceleratorResourceNames,
        mockImportedLoggingBucketGlobalConfig as GlobalConfig,
        mockAccountsConfig as AccountsConfig,
        MOCK_CONSTANTS.credentials,
      );

      // Verify
      expect(result).toBeUndefined();
    });

    test('should throw error for other exceptions', async () => {
      // Setup
      const mockError = new Error('Some other error');
      jest
        .spyOn(require('../../../@aws-lza/common/functions'), 'getCredentials')
        .mockResolvedValue(MOCK_CONSTANTS.credentials);

      mockSend.mockRejectedValueOnce(mockError);

      // Execute & Verify
      await expect(
        getCentralLogsBucketKeyArn(
          MOCK_CONSTANTS.runnerParameters.partition,
          MOCK_CONSTANTS.runnerParameters.solutionId,
          MOCK_CONSTANTS.centralizedLoggingRegion,
          MOCK_CONSTANTS.acceleratorResourceNames,
          mockImportedLoggingBucketGlobalConfig as GlobalConfig,
          mockAccountsConfig as AccountsConfig,
          MOCK_CONSTANTS.credentials,
        ),
      ).rejects.toThrow(mockError);
    });
  });

  describe('getCentralLogBucketName', () => {
    let mockAccountsConfig: Partial<AccountsConfig>;
    beforeEach(() => {
      jest.clearAllMocks();
      mockAccountsConfig = {
        getLogArchiveAccount: jest.fn().mockReturnValue(MOCK_CONSTANTS.logArchiveAccount),
        getLogArchiveAccountId: jest.fn().mockReturnValue(MOCK_CONSTANTS.logArchiveAccountId),
        ...mockAccountsConfiguration,
      };
    });
    test('should return imported bucket name when provided', () => {
      // Execute
      const result = getCentralLogBucketName(
        MOCK_CONSTANTS.runnerParameters.region,
        MOCK_CONSTANTS.acceleratorResourceNames,
        MOCK_CONSTANTS.acceleratorEnvironmentDetails,
        mockImportedLoggingBucketGlobalConfig as GlobalConfig,
        mockAccountsConfig as AccountsConfig,
      );

      // Verify
      expect(result).toBe(mockImportedLoggingBucketGlobalConfig.logging.centralLogBucket?.importedBucket?.name);
    });

    test('should return generated bucket name when no imported bucket is provided', () => {
      // Execute
      const result = getCentralLogBucketName(
        MOCK_CONSTANTS.runnerParameters.region,
        MOCK_CONSTANTS.acceleratorResourceNames,
        MOCK_CONSTANTS.acceleratorEnvironmentDetails,
        mockLzaLoggingBucketGlobalConfig as GlobalConfig,
        mockAccountsConfig as AccountsConfig,
      );

      // Verify
      expect(result).toBe(
        `aws-accelerator-central-logs-${MOCK_CONSTANTS.logArchiveAccountId}-${MOCK_CONSTANTS.runnerParameters.region}`,
      );
    });
  });

  describe('getAcceleratorModuleRunnerParameters', () => {
    const mockSsmSend = jest.fn();
    const mockOrgSend = jest.fn();
    let ssmMockClient: SSMClient;
    let orgMockClient: OrganizationsClient;
    let mockAccountsConfig: Partial<AccountsConfig>;
    let configs: AcceleratorConfigurationsType;

    beforeEach(() => {
      jest.clearAllMocks();

      (OrganizationsClient as jest.Mock).mockImplementation(() => ({
        send: mockOrgSend,
      }));

      (SSMClient as jest.Mock).mockImplementation(() => ({
        send: mockSsmSend,
      }));

      ssmMockClient = new SSMClient({});
      orgMockClient = new OrganizationsClient({});

      mockAccountsConfig = {
        getLogArchiveAccount: jest.fn().mockReturnValue(MOCK_CONSTANTS.logArchiveAccount),
        getLogArchiveAccountId: jest.fn().mockReturnValue(MOCK_CONSTANTS.logArchiveAccountId),
        ...mockAccountsConfiguration,
      };

      const mockPaginator = [{ Accounts: MOCK_CONSTANTS.organizationAccounts }];
      (paginateListAccounts as jest.Mock).mockImplementation(() => mockPaginator);

      (ssmMockClient.send as jest.Mock).mockReturnValue({
        Parameter: MOCK_CONSTANTS.centralLogBucketCmkSsmParameter,
      });

      (orgMockClient.send as jest.Mock).mockReturnValue({
        Organization: MOCK_CONSTANTS.organizationDetails,
      });

      configs = {
        accountsConfig: mockAccountsConfig as AccountsConfig,
        customizationsConfig: mockCustomizationsConfig as CustomizationsConfig,
        globalConfig: mockImportedLoggingBucketGlobalConfig,
        iamConfig: mockIamConfig as IamConfig,
        networkConfig: mockNetworkConfig as NetworkConfig,
        organizationConfig: mockOrganizationConfig as OrganizationConfig,
        replacementsConfig: mockReplacementsConfig as ReplacementsConfig,
        securityConfig: mockSecurityConfig as SecurityConfig,
      };

      jest.spyOn(ConfigLoader, 'getAcceleratorConfigurations').mockResolvedValue(configs);
    });

    test('should return correct parameters when organization is enabled', async () => {
      // Setup
      jest
        .spyOn(require('../../utils/lib/common-functions'), 'getGlobalRegion')
        .mockReturnValue(MOCK_CONSTANTS.globalRegion);

      // Execute
      const result = await getAcceleratorModuleRunnerParameters(
        MOCK_CONSTANTS.runnerParameters.configDirPath,
        MOCK_CONSTANTS.runnerParameters.partition,
        MOCK_CONSTANTS.resourcePrefixes,
        MOCK_CONSTANTS.runnerParameters.solutionId,
        MOCK_CONSTANTS.credentials,
      );

      // Verify
      expect(result).toEqual({
        configs: configs,
        globalRegion: MOCK_CONSTANTS.globalRegion,
        resourcePrefixes: MOCK_CONSTANTS.resourcePrefixes,
        acceleratorResourceNames: MOCK_CONSTANTS.acceleratorResourceNames,
        logging: MOCK_CONSTANTS.logging,
        organizationAccounts: MOCK_CONSTANTS.organizationAccounts,
        organizationDetails: MOCK_CONSTANTS.organizationDetails,
        managementAccountCredentials: MOCK_CONSTANTS.credentials,
      });

      expect(ConfigLoader.getAcceleratorConfigurations).toHaveBeenCalledWith(
        MOCK_CONSTANTS.runnerParameters.partition,
        MOCK_CONSTANTS.runnerParameters.configDirPath,
        MOCK_CONSTANTS.resourcePrefixes,
        MOCK_CONSTANTS.credentials,
      );
    });

    test('should return correct parameters when centralized logging region is enabled', async () => {
      //Setup
      configs = {
        accountsConfig: mockAccountsConfig as AccountsConfig,
        customizationsConfig: mockCustomizationsConfig as CustomizationsConfig,
        globalConfig: mockLzaLoggingBucketGlobalConfig,
        iamConfig: mockIamConfig as IamConfig,
        networkConfig: mockNetworkConfig as NetworkConfig,
        organizationConfig: mockOrganizationConfig as OrganizationConfig,
        replacementsConfig: mockReplacementsConfig as ReplacementsConfig,
        securityConfig: mockSecurityConfig as SecurityConfig,
      };

      jest.spyOn(ConfigLoader, 'getAcceleratorConfigurations').mockResolvedValue(configs);

      // Execute
      const result = await getAcceleratorModuleRunnerParameters(
        MOCK_CONSTANTS.runnerParameters.configDirPath,
        MOCK_CONSTANTS.runnerParameters.partition,
        MOCK_CONSTANTS.resourcePrefixes,
        MOCK_CONSTANTS.runnerParameters.solutionId,
        MOCK_CONSTANTS.credentials,
      );

      // Verify
      expect(result).toBeDefined();
    });

    test('should return error when organization is not enabled but organization is enabled in configuration', async () => {
      // Setup
      const errorMessage =
        'AWS Organizations not configured but organization is enabled in organization-config.yaml file !!!';

      mockOrgSend.mockRejectedValueOnce(
        new AWSOrganizationsNotInUseException({
          message: errorMessage,
          $metadata: {},
        }),
      );

      // Execute & Verify
      await expect(
        getAcceleratorModuleRunnerParameters(
          MOCK_CONSTANTS.runnerParameters.configDirPath,
          MOCK_CONSTANTS.runnerParameters.partition,
          MOCK_CONSTANTS.resourcePrefixes,
          MOCK_CONSTANTS.runnerParameters.solutionId,
          MOCK_CONSTANTS.credentials,
        ),
      ).rejects.toThrow(new Error(errorMessage));
    });
  });

  describe('getRunnerTargetRegions', () => {
    test('should return all enabled regions when excluded regions is empty', () => {
      // Execute
      const result = getRunnerTargetRegions(MOCK_CONSTANTS.enabledRegions, []);

      // Verify
      expect(result).toEqual(MOCK_CONSTANTS.enabledRegions);
    });

    test('should return filtered regions when some regions are excluded', () => {
      // Execute
      const result = getRunnerTargetRegions(MOCK_CONSTANTS.enabledRegions, MOCK_CONSTANTS.excludedRegions);

      // Verify
      expect(result).toEqual([MOCK_CONSTANTS.enabledRegions[2]]);
    });

    test('should return empty array when all regions are excluded', () => {
      // Execute
      const result = getRunnerTargetRegions(MOCK_CONSTANTS.enabledRegions, MOCK_CONSTANTS.enabledRegions);

      // Verify
      expect(result).toEqual([]);
    });

    test('should return empty array when enabled regions is empty', () => {
      // Execute
      const result = getRunnerTargetRegions([], MOCK_CONSTANTS.excludedRegions);

      // Verify
      expect(result).toEqual([]);
    });

    test('should handle case-sensitive region names correctly', () => {
      // Setup
      const enabledRegions = MOCK_CONSTANTS.enabledRegions.map(item => item.toUpperCase());
      // Execute
      const result = getRunnerTargetRegions(enabledRegions, MOCK_CONSTANTS.excludedRegions);

      // Verify
      expect(result).toEqual(enabledRegions);
    });
  });
});
