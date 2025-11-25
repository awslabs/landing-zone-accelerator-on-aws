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
/* eslint-disable @typescript-eslint/no-explicit-any */

import { beforeEach, describe, test, vi, expect, afterEach } from 'vitest';
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

vi.mock('fs', async () => ({
  ...(await vi.importActual('fs')),
  existsSync: vi.fn().mockReturnValue(true),
  readdirSync: vi.fn(),
}));

vi.mock('path', async () => ({
  ...(await vi.importActual('path')),
  basename: vi.fn().mockReturnValue(undefined),
  parse: vi.fn().mockReturnValue({ name: 'mockName' }),
  join: vi.fn().mockImplementation((...args) => args.join('/')),
}));

vi.mock('../../../@aws-lza/common/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn().mockReturnValue(undefined),
    warn: vi.fn().mockReturnValue(undefined),
    error: vi.fn().mockReturnValue(undefined),
  }),
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
  const mockLoadDynamicReplacements = vi.fn().mockReturnValue(undefined);

  class MockReplacementsConfig {
    static FILENAME = 'mocked-filename';
    static POLICY_PARAMETER_PREFIX = 'mocked-prefix';

    static load = vi.fn().mockReturnValue({
      loadDynamicReplacements: mockLoadDynamicReplacements,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(public arg1: any, public arg2: any) {}

    loadDynamicReplacements = mockLoadDynamicReplacements;
  }

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
      load: vi.fn().mockReturnValue({}),
    },
    NetworkConfig: {
      load: vi.fn().mockReturnValue({}),
    },
    SecurityConfig: {
      load: vi.fn().mockReturnValue({}),
    },
    CustomizationsConfig: class MockCustomizationsConfig {
      static FILENAME = 'customizations-config.yaml';
      static load = vi.fn().mockReturnValue({});
      constructor() {
        return {};
      }
    },
    ReplacementsConfig: MockReplacementsConfig,
  };
});

describe('ConfigLoader', () => {
  describe('validateConfigDirPath', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    test('Should throw error when directory does not exist', () => {
      // Setup

      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      // Verify

      expect(() => ConfigLoader.validateConfigDirPath(MOCK_CONSTANTS.runnerParameters.configDirPath)).toThrow(
        `Invalid config directory path !!! "${MOCK_CONSTANTS.runnerParameters.configDirPath}" not found`,
      );
    });

    test('Should throw error when mandatory configuration files are missing', () => {
      // Setup

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(fs, 'readdirSync').mockReturnValue([] as any);

      // Verify

      expect(() => ConfigLoader.validateConfigDirPath(MOCK_CONSTANTS.runnerParameters.configDirPath)).toThrow(
        `Missing mandatory configuration files in ${MOCK_CONSTANTS.runnerParameters.configDirPath}. \n Missing files are accounts-config.yaml,global-config.yaml,iam-config.yaml,network-config.yaml,organization-config.yaml,security-config.yaml`,
      );
    });

    test('Successfully validate the config directory path', () => {
      // Setup

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(fs, 'readdirSync').mockReturnValue(MOCK_CONSTANTS.mandatoryConfigFiles as any);

      // Verify

      expect(ConfigLoader.validateConfigDirPath(MOCK_CONSTANTS.runnerParameters.configDirPath)).toBeUndefined();
      expect(() => ConfigLoader.validateConfigDirPath(MOCK_CONSTANTS.runnerParameters.configDirPath)).not.toThrow();
    });
  });

  describe('getAccountsConfigWithAccountIds', () => {
    test('should load accounts config and account IDs successfully', async () => {
      // Setup

      const mockAccountsConfig = {
        loadAccountIds: vi.fn().mockResolvedValue({ accountIds: MOCK_CONSTANTS.accountIds }),
      };
      (AccountsConfig.load as any).mockReturnValue(mockAccountsConfig);

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
        loadAccountIds: vi.fn().mockResolvedValue(undefined),
      };
      (AccountsConfig.load as any).mockReturnValue(mockAccountsConfig);

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
    let mockReplacementsConfigInstance: { loadDynamicReplacements: any };
    let mockOrganizationConfigInstance: { loadOrganizationalUnitIds: any };
    let mockGlobalConfigInstance: {
      homeRegion: string;
      cdkOptions: { customDeploymentRole: string };
      managementAccountAccessRole: string;
      logging: {
        centralizedLoggingRegion: string;
        centralLogBucket?: { importedBucket: { name: string; createAcceleratorManagedKey?: boolean } };
      };
      externalLandingZoneResources?: { importExternalLandingZoneResources: boolean };
      loadExternalMapping: any;
      loadLzaResources?: any;
    };
    let mockAccountsConfigInstance: {
      loadAccountIds: any;
      getLogArchiveAccountId: any;
      getLogArchiveAccount: any;
    };

    let ssmMockClient: SSMClient;
    let mockSend: any;

    afterEach(() => {
      vi.clearAllMocks();
    });

    beforeEach(() => {
      // Prepare SSM ADK Client
      mockSend = vi.fn().mockResolvedValue({
        Parameter: MOCK_CONSTANTS.centralLogBucketCmkSsmParameter,
      });
      (SSMClient as any).mockImplementation(() => ({
        send: mockSend,
      }));
      ssmMockClient = new SSMClient({});

      // Mock fs functions
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(fs, 'readdirSync').mockReturnValue(MOCK_CONSTANTS.mandatoryConfigFiles as any);

      // Mock GlobalConfig instance
      mockGlobalConfigInstance = {
        homeRegion: MOCK_CONSTANTS.homeRegion,
        cdkOptions: MOCK_CONSTANTS.cdkOptions,
        managementAccountAccessRole: MOCK_CONSTANTS.managementAccountAccessRole,
        logging: { centralizedLoggingRegion: MOCK_CONSTANTS.centralizedLoggingRegion },
        externalLandingZoneResources: undefined,
        loadExternalMapping: vi.fn().mockReturnValue(undefined),
      };
      (GlobalConfig.load as any).mockReturnValue(mockGlobalConfigInstance);

      // Mock ReplacementsConfig instance
      mockReplacementsConfigInstance = {
        loadDynamicReplacements: vi.fn().mockReturnValue(undefined),
      };
      (ReplacementsConfig.load as any).mockReturnValue(mockReplacementsConfigInstance);

      // Mock OrganizationConfig instance
      mockOrganizationConfigInstance = {
        loadOrganizationalUnitIds: vi.fn().mockReturnValue({ organizationalUnitIds: [] }),
      };
      (OrganizationConfig.load as any).mockReturnValue(mockOrganizationConfigInstance);

      // Mock AccountsConfig instance
      mockAccountsConfigInstance = {
        loadAccountIds: vi.fn().mockResolvedValue({ accountIds: MOCK_CONSTANTS.accountIds }),
        getLogArchiveAccountId: vi.fn().mockReturnValue(MOCK_CONSTANTS.logArchiveAccountId),
        getLogArchiveAccount: vi.fn().mockReturnValue({ name: MOCK_CONSTANTS.logArchiveAccount.name }),
      };
      (AccountsConfig.load as any).mockReturnValue(mockAccountsConfigInstance);

      // Reset config load mocks to ensure they return proper objects
      (IamConfig.load as any).mockReturnValue({});
      (NetworkConfig.load as any).mockReturnValue({});
      (SecurityConfig.load as any).mockReturnValue({});
      (CustomizationsConfig.load as any).mockReturnValue({});
    });

    test('should load configs successfully when replacement config file is available', async () => {
      // Setup

      vi.spyOn(GlobalConfig, 'loadRawGlobalConfig').mockReturnValue({
        homeRegion: MOCK_CONSTANTS.homeRegion,
      } as GlobalConfig);
      vi.spyOn(OrganizationConfig, 'loadRawOrganizationsConfig').mockReturnValue({
        enable: true,
      } as OrganizationConfig);

      (ssmMockClient.send as any).mockReturnValue({
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
      (fs.existsSync as any).mockReturnValueOnce(true).mockReturnValueOnce(false);

      vi.spyOn(GlobalConfig, 'loadRawGlobalConfig').mockReturnValue({
        homeRegion: MOCK_CONSTANTS.homeRegion,
      } as GlobalConfig);
      vi.spyOn(OrganizationConfig, 'loadRawOrganizationsConfig').mockReturnValue({
        enable: true,
      } as OrganizationConfig);

      (ssmMockClient.send as any).mockReturnValue({
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
        loadExternalMapping: vi.fn().mockReturnValue(undefined),
      };
      (GlobalConfig.load as any).mockReturnValue(mockGlobalConfigInstance);

      vi.spyOn(GlobalConfig, 'loadRawGlobalConfig').mockReturnValue({
        homeRegion: MOCK_CONSTANTS.homeRegion,
      } as GlobalConfig);
      vi.spyOn(OrganizationConfig, 'loadRawOrganizationsConfig').mockReturnValue({
        enable: true,
      } as OrganizationConfig);

      (ssmMockClient.send as any).mockReturnValue({
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

      vi.spyOn(GlobalConfig, 'loadRawGlobalConfig').mockReturnValue({
        homeRegion: MOCK_CONSTANTS.homeRegion,
      } as GlobalConfig);
      vi.spyOn(OrganizationConfig, 'loadRawOrganizationsConfig').mockReturnValue({
        enable: true,
      } as OrganizationConfig);

      (ssmMockClient.send as any).mockRejectedValue({
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

      vi.spyOn(GlobalConfig, 'loadRawGlobalConfig').mockReturnValue({
        homeRegion: MOCK_CONSTANTS.homeRegion,
      } as GlobalConfig);
      vi.spyOn(OrganizationConfig, 'loadRawOrganizationsConfig').mockReturnValue({
        enable: true,
      } as OrganizationConfig);

      (ssmMockClient.send as any).mockRejectedValue(
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
        loadExternalMapping: vi.fn().mockReturnValue(undefined),
        loadLzaResources: vi.fn().mockReturnValue(undefined),
      };
      (GlobalConfig.load as any).mockReturnValue(mockGlobalConfigInstance);

      vi.spyOn(GlobalConfig, 'loadRawGlobalConfig').mockReturnValue({
        homeRegion: MOCK_CONSTANTS.homeRegion,
      } as GlobalConfig);
      vi.spyOn(OrganizationConfig, 'loadRawOrganizationsConfig').mockReturnValue({
        enable: true,
      } as OrganizationConfig);

      (ssmMockClient.send as any).mockReturnValue({
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
  expect(result.customizationsConfig).toBeDefined();
  expect(result.iamConfig).toBeDefined();
  expect(result.networkConfig).toBeDefined();
  expect(result.securityConfig).toBeDefined();
  expect(result.customizationsConfig).toEqual({});
  expect(result.iamConfig).toEqual({});
  expect(result.networkConfig).toEqual({});
  expect(result.securityConfig).toEqual({});

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
