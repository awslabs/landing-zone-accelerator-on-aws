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

import { beforeEach, describe, test, vi, expect } from 'vitest';
import * as functions from '../../lib/config/functions';
import * as appUtils from '../../../accelerator/utils/app-utils';
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
vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({
      Parameter: MOCK_CONSTANTS.centralLogBucketCmkSsmParameter,
    }),
  })),
  GetParameterCommand: vi.fn(),
  ParameterNotFound: class ParameterNotFound extends Error {
    constructor() {
      super('Parameter not found');
      this.name = 'ParameterNotFound';
    }
  },
}));

vi.mock('../../../accelerator/utils/app-utils', () => {
  return { setResourcePrefixes: vi.fn().mockReturnValue(undefined) };
});

vi.mock('fs', () => ({
  ...vi.importActual('fs'),
  existsSync: vi.fn().mockReturnValue(true),
}));

vi.mock('path', () => ({
  ...vi.importActual('path'),
  basename: vi.fn().mockReturnValue(undefined),
  parse: vi.fn().mockReturnValue({ name: 'mockName' }),
  join: vi.fn().mockImplementation((...args) => args.join('/')),
}));

vi.mock('@aws-accelerator/utils/lib/logger', () => ({
  createLogger: vi.fn().mockReturnValue({ warn: vi.fn().mockReturnValue(undefined) }),
}));

vi.mock('../../lib/config/functions', () => ({
  getCredentials: vi.fn(),
}));

vi.mock('../../../accelerator/lib/accelerator-resource-names', () => ({
  AcceleratorResourceNames: vi.fn().mockImplementation(() => MOCK_CONSTANTS.resourceNames),
}));

const getMockGlobalConfig = () => ({
  homeRegion: MOCK_CONSTANTS.homeRegion,
  cdkOptions: { customDeploymentRole: MOCK_CONSTANTS.cdkOptions.customDeploymentRole },
  managementAccountAccessRole: MOCK_CONSTANTS.managementAccountAccessRole,
  logging: { centralizedLoggingRegion: MOCK_CONSTANTS.centralizedLoggingRegion },
  externalLandingZoneResources: undefined,
  loadExternalMapping: vi.fn().mockReturnValue(undefined),
});

vi.mock('@aws-accelerator/config', () => {
  return {
    AccountsConfig: {
      load: vi.fn().mockReturnValue({
        getLogArchiveAccountId: vi.fn(),
        getLogArchiveAccount: vi.fn(),
      } as unknown as AccountsConfig),
    },
    GlobalConfig: {
      load: vi.fn().mockImplementation(() => getMockGlobalConfig()),
      loadRawGlobalConfig: vi.fn(),
      loadLzaResources: vi.fn().mockReturnValue(undefined),
    },
    OrganizationConfig: {
      load: vi.fn().mockReturnValue({
        loadOrganizationalUnitIds: vi.fn().mockReturnValue({ organizationalUnitIds: [] }),
      } as unknown as OrganizationConfig),
      loadRawOrganizationsConfig: vi.fn(),
    },
    IamConfig: {
      load: vi.fn().mockReturnValue(undefined as unknown as IamConfig),
    },
    NetworkConfig: {
      load: vi.fn().mockReturnValue(undefined as unknown as NetworkConfig),
    },
    SecurityConfig: {
      load: vi.fn().mockReturnValue(undefined as unknown as SecurityConfig),
    },
    CustomizationsConfig: Object.assign(
      vi.fn().mockImplementation(() => ({})),
      {
        load: vi.fn().mockReturnValue(undefined as unknown as CustomizationsConfig),
        FILENAME: 'customizations-config.yaml',
      },
    ),
    ReplacementsConfig: {
      load: vi.fn().mockReturnValue({
        loadDynamicReplacements: vi.fn().mockReturnValue(undefined),
      } as unknown as ReplacementsConfig),
    },
  };
});

describe('AcceleratorConfigLoader', () => {
  describe('getAccountsConfigWithAccountIds', () => {
    test('should load accounts config and account IDs successfully', async () => {
      // Setup

      const mockAccountsConfig = {
        loadAccountIds: vi.fn().mockResolvedValue({ accountIds: MOCK_CONSTANTS.accountIds }),
      };
      (AccountsConfig.load as vi.Mock).mockReturnValue(mockAccountsConfig);

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
        loadAccountIds: vi.fn().mockResolvedValue(undefined),
      };
      (AccountsConfig.load as vi.Mock).mockReturnValue(mockAccountsConfig);

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
    let mockReplacementsConfigInstance: { loadDynamicReplacements: vi.Mock };
    let mockOrganizationConfigInstance: { loadOrganizationalUnitIds: vi.Mock };
    let mockGlobalConfigInstance: {
      homeRegion: string;
      cdkOptions: { customDeploymentRole: string };
      managementAccountAccessRole: string;
      logging: {
        centralizedLoggingRegion: string;
        centralLogBucket?: { importedBucket: { name: string; createAcceleratorManagedKey?: boolean } };
      };
      externalLandingZoneResources?: { importExternalLandingZoneResources: boolean };
      loadExternalMapping: vi.Mock;
      loadLzaResources?: vi.Mock;
    };
    let mockAccountsConfigInstance: {
      loadAccountIds: vi.Mock;
      getLogArchiveAccountId: vi.Mock;
      getLogArchiveAccount: vi.Mock;
    };

    let ssmMockClient: SSMClient;
    let mockSend: vi.Mock;

    beforeEach(() => {
      vi.clearAllMocks();

      // Prepare SSM ADK Client
      mockSend = vi.fn().mockResolvedValue({
        Parameter: MOCK_CONSTANTS.centralLogBucketCmkSsmParameter,
      });
      (SSMClient as vi.Mock).mockImplementation(() => ({
        send: mockSend,
      }));
      ssmMockClient = new SSMClient({});

      // Mock fs.existsSync
      (fs.existsSync as vi.Mock).mockReturnValue(true);

      // Mock GlobalConfig instance
      mockGlobalConfigInstance = {
        homeRegion: MOCK_CONSTANTS.homeRegion,
        cdkOptions: MOCK_CONSTANTS.cdkOptions,
        managementAccountAccessRole: MOCK_CONSTANTS.managementAccountAccessRole,
        logging: { centralizedLoggingRegion: MOCK_CONSTANTS.centralizedLoggingRegion },
        externalLandingZoneResources: undefined,
        loadExternalMapping: vi.fn().mockReturnValue(undefined),
      };
      (GlobalConfig.load as vi.Mock).mockReturnValue(mockGlobalConfigInstance);

      // Mock ReplacementsConfig instance
      mockReplacementsConfigInstance = {
        loadDynamicReplacements: vi.fn().mockReturnValue(undefined),
      };
      (ReplacementsConfig.load as vi.Mock).mockReturnValue(mockReplacementsConfigInstance);

      // Mock OrganizationConfig instance
      mockOrganizationConfigInstance = {
        loadOrganizationalUnitIds: vi.fn().mockReturnValue({ organizationalUnitIds: [] }),
      };
      (OrganizationConfig.load as vi.Mock).mockReturnValue(mockOrganizationConfigInstance);

      // Mock AccountsConfig instance
      mockAccountsConfigInstance = {
        loadAccountIds: vi.fn().mockResolvedValue({ accountIds: MOCK_CONSTANTS.accountIds }),
        getLogArchiveAccountId: vi.fn().mockReturnValue(MOCK_CONSTANTS.logArchiveAccountId),
        getLogArchiveAccount: vi.fn().mockReturnValue({ name: MOCK_CONSTANTS.logArchiveAccountName }),
      };
      (AccountsConfig.load as vi.Mock).mockReturnValue(mockAccountsConfigInstance);

      // Mock ResourceNames class
      (AcceleratorResourceNames as vi.Mock).mockImplementation(() => MOCK_CONSTANTS.resourceNames);
    });

    test('should load configs successfully', async () => {
      // Setup

      vi.spyOn(functions, 'getCredentials').mockResolvedValue(undefined);

      vi.spyOn(GlobalConfig, 'loadRawGlobalConfig').mockReturnValue({
        homeRegion: MOCK_CONSTANTS.homeRegion,
      } as GlobalConfig);
      vi.spyOn(OrganizationConfig, 'loadRawOrganizationsConfig').mockReturnValue({
        enable: true,
      } as OrganizationConfig);

      (ssmMockClient.send as vi.Mock).mockReturnValue({
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
        loadExternalMapping: vi.fn().mockReturnValue(undefined),
      };
      (GlobalConfig.load as vi.Mock).mockReturnValue(mockGlobalConfigInstance);

      vi.spyOn(functions, 'getCredentials').mockResolvedValue(undefined);

      vi.spyOn(GlobalConfig, 'loadRawGlobalConfig').mockReturnValue({
        homeRegion: MOCK_CONSTANTS.homeRegion,
      } as GlobalConfig);
      vi.spyOn(OrganizationConfig, 'loadRawOrganizationsConfig').mockReturnValue({
        enable: true,
      } as OrganizationConfig);

      (ssmMockClient.send as vi.Mock).mockReturnValue({
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

      vi.spyOn(functions, 'getCredentials').mockResolvedValue(undefined);

      vi.spyOn(GlobalConfig, 'loadRawGlobalConfig').mockReturnValue({
        homeRegion: MOCK_CONSTANTS.homeRegion,
      } as GlobalConfig);
      vi.spyOn(OrganizationConfig, 'loadRawOrganizationsConfig').mockReturnValue({
        enable: true,
      } as OrganizationConfig);

      (ssmMockClient.send as vi.Mock).mockRejectedValue({
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

      vi.spyOn(functions, 'getCredentials').mockResolvedValue(undefined);

      vi.spyOn(GlobalConfig, 'loadRawGlobalConfig').mockReturnValue({
        homeRegion: MOCK_CONSTANTS.homeRegion,
      } as GlobalConfig);
      vi.spyOn(OrganizationConfig, 'loadRawOrganizationsConfig').mockReturnValue({
        enable: true,
      } as OrganizationConfig);

      (ssmMockClient.send as vi.Mock).mockRejectedValue(
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
        loadExternalMapping: vi.fn().mockReturnValue(undefined),
        loadLzaResources: vi.fn().mockReturnValue(undefined),
      };
      (GlobalConfig.load as vi.Mock).mockReturnValue(mockGlobalConfigInstance);

      vi.spyOn(functions, 'getCredentials').mockResolvedValue(undefined);
      vi.spyOn(appUtils, 'setResourcePrefixes').mockReturnValue({
        resourcePrefixes: {
          ssmParamName: MOCK_CONSTANTS.ssmParamNamePrefix,
        },
      });

      vi.spyOn(GlobalConfig, 'loadRawGlobalConfig').mockReturnValue({
        homeRegion: MOCK_CONSTANTS.homeRegion,
      } as GlobalConfig);
      vi.spyOn(OrganizationConfig, 'loadRawOrganizationsConfig').mockReturnValue({
        enable: true,
      } as OrganizationConfig);

      (ssmMockClient.send as vi.Mock).mockReturnValue({
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
      loadDynamicReplacements: expect.any(Function),
    }),
  );
  expect(result.replacementsConfig).toEqual(
    expect.objectContaining({
      loadDynamicReplacements: expect.any(Function),
    }),
  );
}
