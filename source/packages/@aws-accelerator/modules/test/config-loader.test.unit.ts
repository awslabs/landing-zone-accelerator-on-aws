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
import { ParameterNotFound, SSMClient } from '@aws-sdk/client-ssm';
import { AcceleratorConfigurationsType } from '../models/types';
import { ConfigLoader } from '../lib/config-loader';
import { MOCK_CONSTANTS } from './mocked-resources';

//
// Mock Dependencies
//
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

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(true),
  readdirSync: jest.fn(),
}));

jest.mock('path', () => ({
  ...jest.requireActual('path'),
  basename: jest.fn().mockReturnValue(undefined),
  parse: jest.fn().mockReturnValue({ name: 'mockName' }),
  join: jest.fn().mockImplementation((...args) => args.join('/')),
}));

jest.mock('../../../@aws-lza/common/logger', () => ({
  createLogger: jest.fn().mockReturnValue({
    info: jest.fn().mockReturnValue(undefined),
    warn: jest.fn().mockReturnValue(undefined),
    error: jest.fn().mockReturnValue(undefined),
  }),
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
  const mockLoadReplacementValues = jest.fn().mockReturnValue(undefined);

  class MockReplacementsConfig {
    static FILENAME = 'mocked-filename';
    static POLICY_PARAMETER_PREFIX = 'mocked-prefix';

    static load = jest.fn().mockReturnValue({
      loadReplacementValues: mockLoadReplacementValues,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(public arg1: any, public arg2: any) {}

    loadReplacementValues = mockLoadReplacementValues;
  }

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
    ReplacementsConfig: MockReplacementsConfig,
  };
});

describe('ConfigLoader', () => {
  describe('validateConfigDirPath', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('Should throw error when directory does not exist', () => {
      // Setup

      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      // Verify

      expect(() => ConfigLoader.validateConfigDirPath(MOCK_CONSTANTS.runnerParameters.configDirPath)).toThrow(
        `Invalid config directory path !!! "${MOCK_CONSTANTS.runnerParameters.configDirPath}" not found`,
      );
    });

    test('Should throw error when mandatory configuration files are missing', () => {
      // Setup

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(fs, 'readdirSync').mockReturnValue([] as any);

      // Verify

      expect(() => ConfigLoader.validateConfigDirPath(MOCK_CONSTANTS.runnerParameters.configDirPath)).toThrow(
        `Missing mandatory configuration files in ${MOCK_CONSTANTS.runnerParameters.configDirPath}. \n Missing files are accounts-config.yaml,global-config.yaml,iam-config.yaml,network-config.yaml,organization-config.yaml,security-config.yaml`,
      );
    });

    test('Successfully validate the config directory path', () => {
      // Setup

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(fs, 'readdirSync').mockReturnValue(MOCK_CONSTANTS.mandatoryConfigFiles as any);

      // Verify

      expect(ConfigLoader.validateConfigDirPath(MOCK_CONSTANTS.runnerParameters.configDirPath)).toBeUndefined();
      expect(() => ConfigLoader.validateConfigDirPath(MOCK_CONSTANTS.runnerParameters.configDirPath)).not.toThrow();
    });
  });

  describe('getAccountsConfigWithAccountIds', () => {
    test('should load accounts config and account IDs successfully', async () => {
      // Setup

      const mockAccountsConfig = {
        loadAccountIds: jest.fn().mockResolvedValue({ accountIds: MOCK_CONSTANTS.accountIds }),
      };
      (AccountsConfig.load as jest.Mock).mockReturnValue(mockAccountsConfig);

      // Execute

      const result = await ConfigLoader.getAccountsConfigWithAccountIds(
        MOCK_CONSTANTS.runnerParameters.configDirPath,
        MOCK_CONSTANTS.runnerParameters.partition,
        MOCK_CONSTANTS.orgEnabled,
        MOCK_CONSTANTS.credentials,
      );

      // Verify

      expect(AccountsConfig.load).toHaveBeenCalledWith(MOCK_CONSTANTS.runnerParameters.configDirPath);
      expect(mockAccountsConfig.loadAccountIds).toHaveBeenCalledWith(
        MOCK_CONSTANTS.runnerParameters.partition,
        MOCK_CONSTANTS.enableSingleAccountMode,
        MOCK_CONSTANTS.orgEnabled,
        mockAccountsConfig,
        MOCK_CONSTANTS.credentials,
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

      await ConfigLoader.getAccountsConfigWithAccountIds(
        MOCK_CONSTANTS.runnerParameters.configDirPath,
        MOCK_CONSTANTS.runnerParameters.partition,
        MOCK_CONSTANTS.orgEnabled,
      );

      // Verify

      expect(mockAccountsConfig.loadAccountIds).toHaveBeenCalledWith(
        MOCK_CONSTANTS.runnerParameters.partition,
        MOCK_CONSTANTS.enableSingleAccountMode,
        MOCK_CONSTANTS.orgEnabled,
        mockAccountsConfig,
        undefined,
      );
    });
  });

  describe('getAcceleratorConfigurations', () => {
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

      // Mock fs functions
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(fs, 'readdirSync').mockReturnValue(MOCK_CONSTANTS.mandatoryConfigFiles as any);

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
        getLogArchiveAccount: jest.fn().mockReturnValue({ name: MOCK_CONSTANTS.logArchiveAccount.name }),
      };
      (AccountsConfig.load as jest.Mock).mockReturnValue(mockAccountsConfigInstance);
    });

    test('should load configs successfully when replacement config file is available', async () => {
      // Setup

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

      const result = await ConfigLoader.getAcceleratorConfigurations(
        MOCK_CONSTANTS.runnerParameters.partition,
        MOCK_CONSTANTS.runnerParameters.configDirPath,
        MOCK_CONSTANTS.resourcePrefixes,
        MOCK_CONSTANTS.credentials,
      );

      // Verify

      validateCommonExpectations(result);

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

    test('should load configs successfully when replacement config file is missing', async () => {
      // Setup
      (fs.existsSync as jest.Mock).mockReturnValueOnce(true).mockReturnValueOnce(false);

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

      const result = await ConfigLoader.getAcceleratorConfigurations(
        MOCK_CONSTANTS.runnerParameters.partition,
        MOCK_CONSTANTS.runnerParameters.configDirPath,
        MOCK_CONSTANTS.resourcePrefixes,
        MOCK_CONSTANTS.credentials,
      );

      // Verify
      // expect(constructorSpy).toHaveBeenCalledTimes(1);
      validateCommonExpectations(result);

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

      const result = await ConfigLoader.getAcceleratorConfigurations(
        MOCK_CONSTANTS.runnerParameters.partition,
        MOCK_CONSTANTS.runnerParameters.configDirPath,
        MOCK_CONSTANTS.resourcePrefixes,
        MOCK_CONSTANTS.credentials,
      );

      // Verify

      validateCommonExpectations(result);

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

        await ConfigLoader.getAcceleratorConfigurations(
          MOCK_CONSTANTS.runnerParameters.partition,
          MOCK_CONSTANTS.runnerParameters.configDirPath,
          MOCK_CONSTANTS.resourcePrefixes,
          MOCK_CONSTANTS.credentials,
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        // Verify

        expect(error.message).toBe('Parameter not found');
      }
    });

    test('should fail to load configs with central log bucket cmk arn undefined when central log bucket cmk arn ssm parameter not found', async () => {
      // Setup

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

      const result = await ConfigLoader.getAcceleratorConfigurations(
        MOCK_CONSTANTS.runnerParameters.partition,
        MOCK_CONSTANTS.runnerParameters.configDirPath,
        MOCK_CONSTANTS.resourcePrefixes,
        MOCK_CONSTANTS.credentials,
      );

      // Verify

      validateCommonExpectations(result);

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

      const result = await ConfigLoader.getAcceleratorConfigurations(
        MOCK_CONSTANTS.runnerParameters.partition,
        MOCK_CONSTANTS.runnerParameters.configDirPath,
        MOCK_CONSTANTS.resourcePrefixes,
        MOCK_CONSTANTS.credentials,
      );

      // Verify

      validateCommonExpectations(result);

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
 * @param result {@link AcceleratorConfigurationsType}
 */
function validateCommonExpectations(result: AcceleratorConfigurationsType) {
  expect(result).toBeDefined();
  expect(result.customizationsConfig).toBeUndefined();
  expect(result.iamConfig).toBeUndefined();
  expect(result.networkConfig).toBeUndefined();
  expect(result.securityConfig).toBeUndefined();

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
