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

import { beforeEach, describe, test } from '@jest/globals';
import * as fs from 'fs';
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
import { AcceleratorConfigLoader } from '../../lib/config/accelerator-config-loader';
import { AcceleratorResourceNames } from '../../../accelerator/lib/accelerator-resource-names';
import { ParameterNotFound, SSMClient } from '@aws-sdk/client-ssm';
import { AllConfigType } from '../../lib/config/resources';

const MOCK_CONSTANTS = {
  configDirPath: '/path/to/config',
  homeRegion: 'us-west-2',
  centralizedLoggingRegion: 'us-east-1',
  enableSingleAccountMode: false,
  managementAccountCredentials: {
    accessKeyId: 'mockAccessKeyId',
    secretAccessKey: 'mockSecretAccessKey',
    sessionToken: 'mockSessionToken',
  },
  orgEnabled: true,
  partition: 'aws',
  prefix: 'AWSAccelerator',
  solutionId: 'mockSolutionId',
  accountIds: ['111111111111', '222222222222'],
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
  centralLogBucketCmkSsmParameter: {
    Name: 'test-parameter',
    Type: 'String',
    Value: 'test-value',
    Version: 1,
    LastModifiedDate: new Date(),
  },
  resourceNames: {
    bucketPrefixes: {
      centralLogs: 'centralLogs',
    },
    parameters: {
      centralLogBucketCmkArn: 'centralLogBucketCmkArn',
      importedCentralLogBucketCmkArn: 'importedCentralLogBucketCmkArn',
    },
  },
  cdkOptions: { customDeploymentRole: 'customDeploymentRole' },
  managementAccountAccessRole: 'managementAccountAccessRole',
  logArchiveAccountName: 'LogArchive',
  logArchiveAccountId: '333333333333',
  importedBucketName: 'importedBucketName',
  ssmParamNamePrefix: '/accelerator',
};

//
// Mock Dependencies
//
// Mock the SSM client
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

jest.mock('../../../accelerator/utils/app-utils', () => {
  return { setResourcePrefixes: jest.fn() };
});

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(true),
}));

jest.mock('path', () => ({
  ...jest.requireActual('path'),
  basename: jest.fn().mockReturnValue(undefined),
  parse: jest.fn().mockReturnValue({ name: 'mockName' }),
  join: jest.fn().mockImplementation((...args) => args.join('/')),
}));

jest.mock('@aws-accelerator/utils/lib/logger', () => ({
  createLogger: jest.fn().mockReturnValue({ warn: jest.fn().mockReturnValue(undefined) }),
}));

jest.mock('../../lib/config/functions', () => ({
  getCredentials: jest.fn(),
}));

jest.mock('../../../accelerator/lib/accelerator-resource-names', () => ({
  AcceleratorResourceNames: jest.fn().mockImplementation(() => MOCK_CONSTANTS.resourceNames),
}));

const getMockGlobalConfig = () => ({
  homeRegion: MOCK_CONSTANTS.homeRegion,
  cdkOptions: { customDeploymentRole: MOCK_CONSTANTS.cdkOptions.customDeploymentRole },
  managementAccountAccessRole: MOCK_CONSTANTS.managementAccountAccessRole,
  logging: { centralizedLoggingRegion: MOCK_CONSTANTS.centralizedLoggingRegion },
  externalLandingZoneResources: undefined,
  loadExternalMapping: jest.fn().mockReturnValue(undefined),
});

jest.mock('@aws-accelerator/config', () => {
  return {
    AccountsConfig: {
      load: jest.fn().mockReturnValue({
        getLogArchiveAccountId: jest.fn(),
        getLogArchiveAccount: jest.fn(),
      } as unknown as AccountsConfig),
    },
    GlobalConfig: {
      load: jest.fn().mockImplementation(() => getMockGlobalConfig()),
      loadRawGlobalConfig: jest.fn(),
      loadLzaResources: jest.fn().mockReturnValue(undefined),
    },
    OrganizationConfig: {
      load: jest.fn().mockReturnValue({
        loadOrganizationalUnitIds: jest.fn().mockReturnValue({ organizationalUnitIds: [] }),
      } as unknown as OrganizationConfig),
      loadRawOrganizationsConfig: jest.fn(),
    },
    IamConfig: {
      load: jest.fn().mockReturnValue({} as IamConfig),
    },
    NetworkConfig: {
      load: jest.fn().mockReturnValue({} as NetworkConfig),
    },
    SecurityConfig: {
      load: jest.fn().mockReturnValue({} as SecurityConfig),
    },
    CustomizationsConfig: Object.assign(
      jest.fn().mockImplementation(() => ({})),
      {
        load: jest.fn().mockReturnValue({} as unknown as CustomizationsConfig),
        FILENAME: 'customizations-config.yaml',
      },
    ),
    ReplacementsConfig: {
      load: jest.fn().mockReturnValue({
        loadReplacementValues: jest.fn().mockReturnValue(undefined),
      } as unknown as ReplacementsConfig),
    },
  };
});

describe('AcceleratorConfigLoader', () => {
  describe('getAccountsConfigWithAccountIds', () => {
    test('should load accounts config and account IDs successfully', async () => {
      // Setup

      const mockAccountsConfig = {
        loadAccountIds: jest.fn().mockResolvedValue({ accountIds: MOCK_CONSTANTS.accountIds }),
      };
      (AccountsConfig.load as jest.Mock).mockReturnValue(mockAccountsConfig);

      // Execute

      const result = await AcceleratorConfigLoader.getAccountsConfigWithAccountIds(
        MOCK_CONSTANTS.configDirPath,
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.orgEnabled,
        MOCK_CONSTANTS.managementAccountCredentials,
      );

      // Verify

      expect(AccountsConfig.load).toHaveBeenCalledWith(MOCK_CONSTANTS.configDirPath);
      expect(mockAccountsConfig.loadAccountIds).toHaveBeenCalledWith(
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.enableSingleAccountMode,
        MOCK_CONSTANTS.orgEnabled,
        mockAccountsConfig,
        MOCK_CONSTANTS.managementAccountCredentials,
      );
      expect(result).toBe(mockAccountsConfig);
      expect(await mockAccountsConfig.loadAccountIds()).toEqual({
        accountIds: MOCK_CONSTANTS.accountIds,
      });
    });

    test('should handle case without credentials', async () => {
      // Setup

      const mockAccountsConfig = {
        loadAccountIds: jest.fn().mockResolvedValue(undefined),
      };
      (AccountsConfig.load as jest.Mock).mockReturnValue(mockAccountsConfig);

      // Execute

      await AcceleratorConfigLoader.getAccountsConfigWithAccountIds(
        MOCK_CONSTANTS.configDirPath,
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.orgEnabled,
      );

      // Verify

      expect(mockAccountsConfig.loadAccountIds).toHaveBeenCalledWith(
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.enableSingleAccountMode,
        MOCK_CONSTANTS.orgEnabled,
        mockAccountsConfig,
        undefined,
      );
    });
  });

  describe('getAllConfig', () => {
    //
    let mockReplacementsConfigInstance: { loadReplacementValues: jest.Mock };
    let mockOrganizationConfigInstance: { loadOrganizationalUnitIds: jest.Mock };
    let mockGlobalConfigInstance: {
      homeRegion: string;
      cdkOptions: { customDeploymentRole: string };
      managementAccountAccessRole: string;
      logging: {
        centralizedLoggingRegion: string;
        centralLogBucket?: { importedBucket: { name: string; createAcceleratorManagedKey?: boolean } };
      };
      externalLandingZoneResources?: { importExternalLandingZoneResources: boolean };
      loadExternalMapping: jest.Mock;
      loadLzaResources?: jest.Mock;
    };
    let mockAccountsConfigInstance: {
      loadAccountIds: jest.Mock;
      getLogArchiveAccountId: jest.Mock;
      getLogArchiveAccount: jest.Mock;
    };

    let ssmMockClient: SSMClient;
    let mockSend: jest.Mock;

    beforeEach(() => {
      jest.clearAllMocks();

      // Prepare SSM ADK Client
      mockSend = jest.fn().mockResolvedValue({
        Parameter: MOCK_CONSTANTS.centralLogBucketCmkSsmParameter,
      });
      (SSMClient as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));
      ssmMockClient = new SSMClient({});

      // Mock fs.existsSync
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      // Mock GlobalConfig instance
      mockGlobalConfigInstance = {
        homeRegion: MOCK_CONSTANTS.homeRegion,
        cdkOptions: MOCK_CONSTANTS.cdkOptions,
        managementAccountAccessRole: MOCK_CONSTANTS.managementAccountAccessRole,
        logging: { centralizedLoggingRegion: MOCK_CONSTANTS.centralizedLoggingRegion },
        externalLandingZoneResources: undefined,
        loadExternalMapping: jest.fn().mockReturnValue(undefined),
      };
      (GlobalConfig.load as jest.Mock).mockReturnValue(mockGlobalConfigInstance);

      // Mock ReplacementsConfig instance
      mockReplacementsConfigInstance = {
        loadReplacementValues: jest.fn().mockReturnValue(undefined),
      };
      (ReplacementsConfig.load as jest.Mock).mockReturnValue(mockReplacementsConfigInstance);

      // Mock OrganizationConfig instance
      mockOrganizationConfigInstance = {
        loadOrganizationalUnitIds: jest.fn().mockReturnValue({ organizationalUnitIds: [] }),
      };
      (OrganizationConfig.load as jest.Mock).mockReturnValue(mockOrganizationConfigInstance);

      // Mock AccountsConfig instance
      mockAccountsConfigInstance = {
        loadAccountIds: jest.fn().mockResolvedValue({ accountIds: MOCK_CONSTANTS.accountIds }),
        getLogArchiveAccountId: jest.fn().mockReturnValue(MOCK_CONSTANTS.logArchiveAccountId),
        getLogArchiveAccount: jest.fn().mockReturnValue({ name: MOCK_CONSTANTS.logArchiveAccountName }),
      };
      (AccountsConfig.load as jest.Mock).mockReturnValue(mockAccountsConfigInstance);

      // Mock ResourceNames class
      (AcceleratorResourceNames as jest.Mock).mockImplementation(() => MOCK_CONSTANTS.resourceNames);
    });

    test('should load configs successfully', async () => {
      // Setup

      jest.spyOn(require('../../lib/config/functions'), 'getCredentials').mockResolvedValue(undefined);

      jest
        .spyOn(GlobalConfig, 'loadRawGlobalConfig')
        .mockReturnValue({ homeRegion: MOCK_CONSTANTS.homeRegion } as GlobalConfig);
      jest
        .spyOn(OrganizationConfig, 'loadRawOrganizationsConfig')
        .mockReturnValue({ enable: true } as OrganizationConfig);

      (ssmMockClient.send as jest.Mock).mockReturnValue({
        Parameter: MOCK_CONSTANTS.centralLogBucketCmkSsmParameter,
      });

      // Execute

      const result = await AcceleratorConfigLoader.getAllConfig(
        MOCK_CONSTANTS.configDirPath,
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.prefix,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.managementAccountCredentials,
      );

      // Verify

      validateCommonExpectations(result);
      expect(result.resourcePrefixes).toBeUndefined();

      expect(result.globalConfig).toEqual(
        expect.objectContaining({
          homeRegion: MOCK_CONSTANTS.homeRegion,
          cdkOptions: MOCK_CONSTANTS.cdkOptions,
          managementAccountAccessRole: MOCK_CONSTANTS.managementAccountAccessRole,
          logging: expect.objectContaining({
            centralizedLoggingRegion: MOCK_CONSTANTS.centralizedLoggingRegion,
          }),
        }),
      );
    });

    test('should load configs successfully with imported central log bucket', async () => {
      // Setup

      // Mock GlobalConfig instance
      mockGlobalConfigInstance = {
        homeRegion: MOCK_CONSTANTS.homeRegion,
        cdkOptions: MOCK_CONSTANTS.cdkOptions,
        managementAccountAccessRole: MOCK_CONSTANTS.managementAccountAccessRole,
        logging: {
          centralizedLoggingRegion: MOCK_CONSTANTS.centralizedLoggingRegion,
          centralLogBucket: {
            importedBucket: { name: MOCK_CONSTANTS.importedBucketName, createAcceleratorManagedKey: true },
          },
        },
        externalLandingZoneResources: undefined,
        loadExternalMapping: jest.fn().mockReturnValue(undefined),
      };
      (GlobalConfig.load as jest.Mock).mockReturnValue(mockGlobalConfigInstance);

      jest.spyOn(require('../../lib/config/functions'), 'getCredentials').mockResolvedValue(undefined);

      jest.spyOn(GlobalConfig, 'loadRawGlobalConfig').mockReturnValue({
        homeRegion: MOCK_CONSTANTS.homeRegion,
      } as GlobalConfig);
      jest
        .spyOn(OrganizationConfig, 'loadRawOrganizationsConfig')
        .mockReturnValue({ enable: true } as OrganizationConfig);

      (ssmMockClient.send as jest.Mock).mockReturnValue({
        Parameter: MOCK_CONSTANTS.centralLogBucketCmkSsmParameter,
      });

      // Execute

      const result = await AcceleratorConfigLoader.getAllConfig(
        MOCK_CONSTANTS.configDirPath,
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.prefix,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.managementAccountCredentials,
      );

      // Verify

      validateCommonExpectations(result);
      expect(result.resourcePrefixes).toBeUndefined();

      expect(result.globalConfig).toEqual(
        expect.objectContaining({
          homeRegion: MOCK_CONSTANTS.homeRegion,
          cdkOptions: MOCK_CONSTANTS.cdkOptions,
          managementAccountAccessRole: MOCK_CONSTANTS.managementAccountAccessRole,
          logging: {
            centralizedLoggingRegion: MOCK_CONSTANTS.centralizedLoggingRegion,
            centralLogBucket: {
              importedBucket: {
                name: MOCK_CONSTANTS.importedBucketName,
                createAcceleratorManagedKey: true,
              },
            },
          },
        }),
      );
    });

    test('should fail to load configs when central log bucket cmk arn ssm parameter not found', async () => {
      // Setup

      jest.spyOn(require('../../lib/config/functions'), 'getCredentials').mockResolvedValue(undefined);

      jest.spyOn(GlobalConfig, 'loadRawGlobalConfig').mockReturnValue({
        homeRegion: MOCK_CONSTANTS.homeRegion,
      } as GlobalConfig);
      jest
        .spyOn(OrganizationConfig, 'loadRawOrganizationsConfig')
        .mockReturnValue({ enable: true } as OrganizationConfig);

      (ssmMockClient.send as jest.Mock).mockRejectedValue({
        name: 'ParameterNotFound',
        message: 'Parameter not found',
      });

      try {
        // Execute

        await AcceleratorConfigLoader.getAllConfig(
          MOCK_CONSTANTS.configDirPath,
          MOCK_CONSTANTS.partition,
          MOCK_CONSTANTS.prefix,
          MOCK_CONSTANTS.solutionId,
          MOCK_CONSTANTS.managementAccountCredentials,
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        // Verify

        expect(error.message).toBe('Parameter not found');
      }
    });

    test('should fail to load configs with central log bucket cmk arn undefined when central log bucket cmk arn ssm parameter not found', async () => {
      // Setup

      jest.spyOn(require('../../lib/config/functions'), 'getCredentials').mockResolvedValue(undefined);

      jest.spyOn(GlobalConfig, 'loadRawGlobalConfig').mockReturnValue({
        homeRegion: MOCK_CONSTANTS.homeRegion,
      } as GlobalConfig);
      jest
        .spyOn(OrganizationConfig, 'loadRawOrganizationsConfig')
        .mockReturnValue({ enable: true } as OrganizationConfig);

      (ssmMockClient.send as jest.Mock).mockRejectedValue(
        new ParameterNotFound({
          message: 'Parameter not found',
          $metadata: {
            httpStatusCode: 400,
            requestId: 'mock-request-id',
          },
        }),
      );

      // Execute

      const result = await AcceleratorConfigLoader.getAllConfig(
        MOCK_CONSTANTS.configDirPath,
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.prefix,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.managementAccountCredentials,
      );

      // Verify

      validateCommonExpectations(result);
      expect(result.resourcePrefixes).toBeUndefined();

      expect(result.globalConfig).toEqual(
        expect.objectContaining({
          homeRegion: MOCK_CONSTANTS.homeRegion,
          cdkOptions: MOCK_CONSTANTS.cdkOptions,
          managementAccountAccessRole: MOCK_CONSTANTS.managementAccountAccessRole,
          logging: {
            centralizedLoggingRegion: MOCK_CONSTANTS.centralizedLoggingRegion,
          },
        }),
      );
    });

    test('should load configs successfully with externalLandingZoneResources configuration', async () => {
      // Setup

      // Mock GlobalConfig instance
      mockGlobalConfigInstance = {
        homeRegion: MOCK_CONSTANTS.homeRegion,
        cdkOptions: MOCK_CONSTANTS.cdkOptions,
        managementAccountAccessRole: MOCK_CONSTANTS.managementAccountAccessRole,
        logging: {
          centralizedLoggingRegion: MOCK_CONSTANTS.centralizedLoggingRegion,
        },
        externalLandingZoneResources: { importExternalLandingZoneResources: true },
        loadExternalMapping: jest.fn().mockReturnValue(undefined),
        loadLzaResources: jest.fn().mockReturnValue(undefined),
      };
      (GlobalConfig.load as jest.Mock).mockReturnValue(mockGlobalConfigInstance);

      jest.spyOn(require('../../lib/config/functions'), 'getCredentials').mockResolvedValue(undefined);
      jest.spyOn(require('../../../accelerator/utils/app-utils'), 'setResourcePrefixes').mockReturnValue({
        resourcePrefixes: {
          ssmParamName: MOCK_CONSTANTS.ssmParamNamePrefix,
        },
      });

      jest.spyOn(GlobalConfig, 'loadRawGlobalConfig').mockReturnValue({
        homeRegion: MOCK_CONSTANTS.homeRegion,
      } as GlobalConfig);
      jest
        .spyOn(OrganizationConfig, 'loadRawOrganizationsConfig')
        .mockReturnValue({ enable: true } as OrganizationConfig);

      (ssmMockClient.send as jest.Mock).mockReturnValue({
        Parameter: MOCK_CONSTANTS.centralLogBucketCmkSsmParameter,
      });

      // Execute

      const result = await AcceleratorConfigLoader.getAllConfig(
        MOCK_CONSTANTS.configDirPath,
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.prefix,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.managementAccountCredentials,
      );

      // Verify

      validateCommonExpectations(result);

      expect(result.resourcePrefixes).toEqual({
        resourcePrefixes: { ssmParamName: MOCK_CONSTANTS.ssmParamNamePrefix },
      });

      expect(result.globalConfig).toEqual(
        expect.objectContaining({
          homeRegion: MOCK_CONSTANTS.homeRegion,
          cdkOptions: MOCK_CONSTANTS.cdkOptions,
          managementAccountAccessRole: MOCK_CONSTANTS.managementAccountAccessRole,
          logging: {
            centralizedLoggingRegion: MOCK_CONSTANTS.centralizedLoggingRegion,
          },
        }),
      );
    });
  });
});

/**
 * Function to test common expectation across multiple tests
 * @param result {@link AllConfigType}
 */
function validateCommonExpectations(result: AllConfigType) {
  expect(result).toBeDefined();
  expect(result.customizationsConfig).toBeUndefined();
  expect(result.iamConfig).toBeUndefined();
  expect(result.networkConfig).toBeUndefined();
  expect(result.securityConfig).toBeUndefined();

  expect(result.acceleratorResourceNames).toEqual(MOCK_CONSTANTS.resourceNames);

  expect(result.accountsConfig).toEqual(
    expect.objectContaining({
      loadAccountIds: expect.any(Function),
    }),
  );
  expect(result.organizationConfig).toEqual(
    expect.objectContaining({
      loadOrganizationalUnitIds: expect.any(Function),
    }),
  );
  expect(result.replacementsConfig).toEqual(
    expect.objectContaining({
      loadReplacementValues: expect.any(Function),
    }),
  );
  expect(result.replacementsConfig).toEqual(
    expect.objectContaining({
      loadReplacementValues: expect.any(Function),
    }),
  );
}
