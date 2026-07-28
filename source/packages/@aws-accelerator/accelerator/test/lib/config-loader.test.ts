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

import {
  AccountsConfig,
  CustomizationsConfig,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  ReplacementsConfig,
  SecurityConfig,
  setConfigValidationMode,
} from '@aws-accelerator/config';
import { IAssumeRoleCredential } from 'aws-lza';
import * as fs from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigLoader } from '../../lib/config-loader';
import { AcceleratorResourcePrefixes } from '../../utils/app-utils';

// Mock fs module
vi.mock('fs', async () => ({
  ...(await vi.importActual('fs')),
  existsSync: vi.fn().mockReturnValue(true),
  readdirSync: vi.fn(),
}));

// Mock all config classes
vi.mock('@aws-accelerator/config', () => {
  const mockLoadAccountIds = vi.fn().mockResolvedValue(undefined);
  const mockLoadDynamicReplacements = vi.fn().mockResolvedValue(undefined);
  const mockLoadOrganizationalUnitIds = vi.fn().mockResolvedValue(undefined);
  const mockLoadExternalMapping = vi.fn().mockResolvedValue(undefined);
  const mockLoadLzaResources = vi.fn().mockResolvedValue(undefined);

  return {
    AccountsConfig: {
      load: vi.fn().mockReturnValue({
        loadAccountIds: mockLoadAccountIds,
      }),
    },
    setConfigValidationMode: vi.fn(),
    CustomizationsConfig: class MockCustomizationsConfig {
      static FILENAME = 'customizations-config.yaml';
      static load = vi.fn().mockReturnValue({});
      constructor() {
        return {};
      }
    },
    GlobalConfig: {
      load: vi.fn().mockReturnValue({
        externalLandingZoneResources: undefined,
        loadExternalMapping: mockLoadExternalMapping,
        loadLzaResources: mockLoadLzaResources,
      }),
      loadRawGlobalConfig: vi.fn().mockReturnValue({
        homeRegion: 'us-east-1',
      }),
    },
    IamConfig: {
      load: vi.fn().mockReturnValue({}),
    },
    NetworkConfig: {
      load: vi.fn().mockReturnValue({}),
    },
    OrganizationConfig: {
      load: vi.fn().mockReturnValue({
        loadOrganizationalUnitIds: mockLoadOrganizationalUnitIds,
      }),
      loadRawOrganizationsConfig: vi.fn().mockReturnValue({
        enable: true,
      }),
    },
    ReplacementsConfig: {
      load: vi.fn().mockReturnValue({
        loadDynamicReplacements: mockLoadDynamicReplacements,
      }),
    },
    SecurityConfig: {
      load: vi.fn().mockReturnValue({}),
    },
  };
});

describe('ConfigLoader', () => {
  const mockConfigDirPath = '/mock/config/path';
  const mockPartition = 'aws';
  const mockResourcePrefixes: AcceleratorResourcePrefixes = {
    accelerator: 'AWSAccelerator',
    bucketName: 'aws-accelerator',
    databaseName: 'aws-accelerator',
    kmsAlias: 'alias/accelerator',
    repoName: 'aws-accelerator',
    secretName: '/accelerator',
    snsTopicName: 'aws-accelerator',
    ssmParamName: '/accelerator',
    importResourcesSsmParamName: '/accelerator/imported-resources',
    trailLogName: 'aws-accelerator',
    ssmLogName: 'aws-accelerator',
  };
  const mockCredentials: IAssumeRoleCredential = {
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
    sessionToken: 'test-session-token',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateConfigDirPath', () => {
    it('should throw error when directory does not exist', () => {
      // Setup
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      // Execute & Verify
      expect(() => ConfigLoader.validateConfigDirPath(mockConfigDirPath)).toThrow(
        `Invalid config directory path !!! "${mockConfigDirPath}" not found`,
      );
    });

    it('should throw error when mandatory configuration files are missing', () => {
      // Setup
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readdirSync').mockReturnValue(['some-other-file.yaml'] as any);

      // Execute & Verify
      expect(() => ConfigLoader.validateConfigDirPath(mockConfigDirPath)).toThrow(
        `Missing mandatory configuration files in ${mockConfigDirPath}. \n Missing files are accounts-config.yaml,global-config.yaml,iam-config.yaml,network-config.yaml,organization-config.yaml,security-config.yaml`,
      );
    });

    it('should throw error when some mandatory files are missing', () => {
      // Setup
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readdirSync').mockReturnValue([
        'accounts-config.yaml',
        'global-config.yaml',
        // Missing other mandatory files
      ] as any);

      // Execute & Verify
      expect(() => ConfigLoader.validateConfigDirPath(mockConfigDirPath)).toThrow(
        `Missing mandatory configuration files in ${mockConfigDirPath}. \n Missing files are iam-config.yaml,network-config.yaml,organization-config.yaml,security-config.yaml`,
      );
    });

    it('should successfully validate when all mandatory files are present', () => {
      // Setup
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readdirSync').mockReturnValue([
        'accounts-config.yaml',
        'global-config.yaml',
        'iam-config.yaml',
        'network-config.yaml',
        'organization-config.yaml',
        'security-config.yaml',
        'customizations-config.yaml', // Optional file
      ] as any);

      // Execute & Verify
      expect(() => ConfigLoader.validateConfigDirPath(mockConfigDirPath)).not.toThrow();
    });
  });

  describe('getAccountsConfigWithAccountIds', () => {
    it('should load accounts config with account IDs successfully', async () => {
      // Setup
      const mockAccountsConfig = {
        loadAccountIds: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(AccountsConfig.load).mockReturnValue(mockAccountsConfig as any);

      // Execute
      const result = await ConfigLoader.getAccountsConfigWithAccountIds(
        mockConfigDirPath,
        mockPartition,
        true, // orgsEnabled
        true, // loadOrganizationsFromDynamoDbTable
        mockCredentials,
      );

      // Verify
      expect(AccountsConfig.load).toHaveBeenCalledWith(mockConfigDirPath);
      expect(mockAccountsConfig.loadAccountIds).toHaveBeenCalledWith(
        mockPartition,
        false, // enableSingleAccountMode
        true, // orgsEnabled
        mockAccountsConfig,
        mockCredentials,
        true, // loadOrganizationsFromDynamoDbTable
      );
      expect(result).toBe(mockAccountsConfig);
    });

    it('should handle case without credentials', async () => {
      // Setup
      const mockAccountsConfig = {
        loadAccountIds: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(AccountsConfig.load).mockReturnValue(mockAccountsConfig as any);

      // Execute
      const result = await ConfigLoader.getAccountsConfigWithAccountIds(
        mockConfigDirPath,
        mockPartition,
        false, // orgsEnabled
        false, // loadOrganizationsFromDynamoDbTable
      );

      // Verify
      expect(mockAccountsConfig.loadAccountIds).toHaveBeenCalledWith(
        mockPartition,
        false, // enableSingleAccountMode
        false, // orgsEnabled
        mockAccountsConfig,
        undefined, // no credentials
        false, // loadOrganizationsFromDynamoDbTable
      );
      expect(result).toBe(mockAccountsConfig);
    });

    it('should handle organizations disabled', async () => {
      // Setup
      const mockAccountsConfig = {
        loadAccountIds: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(AccountsConfig.load).mockReturnValue(mockAccountsConfig as any);

      // Execute
      await ConfigLoader.getAccountsConfigWithAccountIds(
        mockConfigDirPath,
        mockPartition,
        false, // orgsEnabled
        true, // loadOrganizationsFromDynamoDbTable
        mockCredentials,
      );

      // Verify
      expect(mockAccountsConfig.loadAccountIds).toHaveBeenCalledWith(
        mockPartition,
        false, // enableSingleAccountMode
        false, // orgsEnabled
        mockAccountsConfig,
        mockCredentials,
        true, // loadOrganizationsFromDynamoDbTable
      );
    });
  });

  describe('getAcceleratorConfigurations', () => {
    beforeEach(() => {
      // Setup common mocks for successful configuration loading
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readdirSync').mockReturnValue([
        'accounts-config.yaml',
        'global-config.yaml',
        'iam-config.yaml',
        'network-config.yaml',
        'organization-config.yaml',
        'security-config.yaml',
        'customizations-config.yaml',
      ] as any);

      // Mock raw config loading
      vi.spyOn(GlobalConfig, 'loadRawGlobalConfig').mockReturnValue({
        homeRegion: 'us-east-1',
      } as any);
      vi.spyOn(OrganizationConfig, 'loadRawOrganizationsConfig').mockReturnValue({
        enable: true,
      } as any);

      // Mock config instances
      const mockAccountsConfig = {
        loadAccountIds: vi.fn().mockResolvedValue(undefined),
      };
      const mockReplacementsConfig = {
        loadDynamicReplacements: vi.fn().mockResolvedValue(undefined),
      };
      const mockGlobalConfig = {
        externalLandingZoneResources: undefined,
        loadExternalMapping: vi.fn().mockResolvedValue(undefined),
        loadLzaResources: vi.fn().mockResolvedValue(undefined),
      };
      const mockOrganizationConfig = {
        loadOrganizationalUnitIds: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(AccountsConfig.load).mockReturnValue(mockAccountsConfig as any);
      vi.mocked(ReplacementsConfig.load).mockReturnValue(mockReplacementsConfig as any);
      vi.mocked(GlobalConfig.load).mockReturnValue(mockGlobalConfig as any);
      vi.mocked(OrganizationConfig.load).mockReturnValue(mockOrganizationConfig as any);
      vi.mocked(NetworkConfig.load).mockReturnValue({} as any);
      vi.mocked(SecurityConfig.load).mockReturnValue({} as any);
      vi.mocked(IamConfig.load).mockReturnValue({} as any);
      vi.mocked(CustomizationsConfig.load).mockReturnValue({} as any);
    });

    it('should load all configurations successfully', async () => {
      // Execute
      const result = await ConfigLoader.getAcceleratorConfigurations(
        mockPartition,
        mockConfigDirPath,
        mockResourcePrefixes,
        true, // loadOrganizationsFromDynamoDbTable
        mockCredentials,
      );

      // Verify
      expect(result).toBeDefined();
      expect(result.accountsConfig).toBeDefined();
      expect(result.customizationsConfig).toBeDefined();
      expect(result.globalConfig).toBeDefined();
      expect(result.iamConfig).toBeDefined();
      expect(result.networkConfig).toBeDefined();
      expect(result.organizationConfig).toBeDefined();
      expect(result.replacementsConfig).toBeDefined();
      expect(result.securityConfig).toBeDefined();

      // Verify config loading calls
      expect(AccountsConfig.load).toHaveBeenCalledWith(mockConfigDirPath);
      expect(ReplacementsConfig.load).toHaveBeenCalledWith(mockConfigDirPath, result.accountsConfig);
      expect(GlobalConfig.load).toHaveBeenCalledWith(mockConfigDirPath, result.replacementsConfig);
      expect(OrganizationConfig.load).toHaveBeenCalledWith(mockConfigDirPath, result.replacementsConfig);
      expect(NetworkConfig.load).toHaveBeenCalledWith(mockConfigDirPath, result.replacementsConfig);
      expect(SecurityConfig.load).toHaveBeenCalledWith(mockConfigDirPath, result.replacementsConfig);
      expect(IamConfig.load).toHaveBeenCalledWith(mockConfigDirPath, result.replacementsConfig);
      expect(CustomizationsConfig.load).toHaveBeenCalledWith(mockConfigDirPath, result.replacementsConfig);
    });

    it('should apply the configuration validation mode from the raw global config', async () => {
      // Setup
      vi.mocked(setConfigValidationMode).mockClear();
      vi.spyOn(GlobalConfig, 'loadRawGlobalConfig').mockReturnValue({
        homeRegion: 'us-east-1',
        configurationValidationMode: 'strict',
      } as any);

      // Execute
      await ConfigLoader.getAcceleratorConfigurations(
        mockPartition,
        mockConfigDirPath,
        mockResourcePrefixes,
        true,
        mockCredentials,
      );

      // Verify
      expect(setConfigValidationMode).toHaveBeenCalledWith('strict');
    });

    it('should default the validation mode to off when not set in the global config', async () => {
      // Setup
      vi.mocked(setConfigValidationMode).mockClear();
      vi.spyOn(GlobalConfig, 'loadRawGlobalConfig').mockReturnValue({
        homeRegion: 'us-east-1',
      } as any);

      // Execute
      await ConfigLoader.getAcceleratorConfigurations(
        mockPartition,
        mockConfigDirPath,
        mockResourcePrefixes,
        true,
        mockCredentials,
      );

      // Verify
      expect(setConfigValidationMode).toHaveBeenCalledWith('off');
    });

    it('should load configurations without credentials', async () => {
      // Execute
      const result = await ConfigLoader.getAcceleratorConfigurations(
        mockPartition,
        mockConfigDirPath,
        mockResourcePrefixes,
        false, // loadOrganizationsFromDynamoDbTable
      );

      // Verify
      expect(result).toBeDefined();
      expect(result.accountsConfig).toBeDefined();
      expect(result.customizationsConfig).toBeDefined();
      expect(result.globalConfig).toBeDefined();
      expect(result.iamConfig).toBeDefined();
      expect(result.networkConfig).toBeDefined();
      expect(result.organizationConfig).toBeDefined();
      expect(result.replacementsConfig).toBeDefined();
      expect(result.securityConfig).toBeDefined();
    });

    it('should handle missing customizations config file', async () => {
      // Setup - mock fs.existsSync to return false for customizations config
      vi.spyOn(fs, 'existsSync')
        .mockReturnValueOnce(true) // For config directory
        .mockReturnValueOnce(false); // For customizations config file

      // Execute
      const result = await ConfigLoader.getAcceleratorConfigurations(
        mockPartition,
        mockConfigDirPath,
        mockResourcePrefixes,
        true,
        mockCredentials,
      );

      // Verify
      expect(result.customizationsConfig).toBeDefined();
      expect(CustomizationsConfig.load).not.toHaveBeenCalled();
    });

    it('should handle external landing zone resources configuration', async () => {
      // Setup
      const mockGlobalConfigWithExternal = {
        externalLandingZoneResources: {
          importExternalLandingZoneResources: true,
        },
        loadExternalMapping: vi.fn().mockResolvedValue(undefined),
        loadLzaResources: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(GlobalConfig.load).mockReturnValue(mockGlobalConfigWithExternal as any);

      // Execute
      const result = await ConfigLoader.getAcceleratorConfigurations(
        mockPartition,
        mockConfigDirPath,
        mockResourcePrefixes,
        true,
        mockCredentials,
      );

      // Verify
      expect(result.globalConfig.loadExternalMapping).toHaveBeenCalledWith(result.accountsConfig);
      expect(result.globalConfig.loadLzaResources).toHaveBeenCalledWith(
        mockPartition,
        mockResourcePrefixes.ssmParamName,
      );
    });

    it('should not load external resources when not configured', async () => {
      // Setup
      const mockGlobalConfigWithoutExternal = {
        externalLandingZoneResources: undefined,
        loadExternalMapping: vi.fn().mockResolvedValue(undefined),
        loadLzaResources: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(GlobalConfig.load).mockReturnValue(mockGlobalConfigWithoutExternal as any);

      // Execute
      const result = await ConfigLoader.getAcceleratorConfigurations(
        mockPartition,
        mockConfigDirPath,
        mockResourcePrefixes,
        true,
        mockCredentials,
      );

      // Verify
      expect(result.globalConfig.loadExternalMapping).not.toHaveBeenCalled();
      expect(result.globalConfig.loadLzaResources).not.toHaveBeenCalled();
    });

    it('should handle external landing zone resources with importExternalLandingZoneResources false', async () => {
      // Setup
      const mockGlobalConfigWithExternalFalse = {
        externalLandingZoneResources: {
          importExternalLandingZoneResources: false,
        },
        loadExternalMapping: vi.fn().mockResolvedValue(undefined),
        loadLzaResources: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(GlobalConfig.load).mockReturnValue(mockGlobalConfigWithExternalFalse as any);

      // Execute
      const result = await ConfigLoader.getAcceleratorConfigurations(
        mockPartition,
        mockConfigDirPath,
        mockResourcePrefixes,
        true,
        mockCredentials,
      );

      // Verify
      expect(result.globalConfig.loadExternalMapping).not.toHaveBeenCalled();
      expect(result.globalConfig.loadLzaResources).not.toHaveBeenCalled();
    });

    it('should call dynamic replacements loading', async () => {
      // Setup
      const mockReplacementsConfig = {
        loadDynamicReplacements: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(ReplacementsConfig.load).mockReturnValue(mockReplacementsConfig as any);

      // Execute
      await ConfigLoader.getAcceleratorConfigurations(
        mockPartition,
        mockConfigDirPath,
        mockResourcePrefixes,
        true,
        mockCredentials,
      );

      // Verify
      expect(mockReplacementsConfig.loadDynamicReplacements).toHaveBeenCalledWith('us-east-1', mockCredentials);
    });

    it('should call organizational unit IDs loading', async () => {
      // Setup
      const mockOrganizationConfig = {
        loadOrganizationalUnitIds: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(OrganizationConfig.load).mockReturnValue(mockOrganizationConfig as any);

      // Execute
      await ConfigLoader.getAcceleratorConfigurations(
        mockPartition,
        mockConfigDirPath,
        mockResourcePrefixes,
        true,
        mockCredentials,
      );

      // Verify
      expect(mockOrganizationConfig.loadOrganizationalUnitIds).toHaveBeenCalledWith(mockPartition, mockCredentials);
    });

    it('should validate config directory path before loading', async () => {
      // Setup - make directory validation fail
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      // Execute & Verify
      await expect(
        ConfigLoader.getAcceleratorConfigurations(
          mockPartition,
          mockConfigDirPath,
          mockResourcePrefixes,
          true,
          mockCredentials,
        ),
      ).rejects.toThrow(`Invalid config directory path !!! "${mockConfigDirPath}" not found`);
    });

    it('should handle organizations disabled in raw config', async () => {
      // Setup
      vi.spyOn(OrganizationConfig, 'loadRawOrganizationsConfig').mockReturnValue({
        enable: false,
      } as any);

      const mockAccountsConfig = {
        loadAccountIds: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(AccountsConfig.load).mockReturnValue(mockAccountsConfig as any);

      // Execute
      await ConfigLoader.getAcceleratorConfigurations(
        mockPartition,
        mockConfigDirPath,
        mockResourcePrefixes,
        true,
        mockCredentials,
      );

      // Verify that loadAccountIds was called with orgsEnabled = false
      expect(mockAccountsConfig.loadAccountIds).toHaveBeenCalledWith(
        mockPartition,
        false, // enableSingleAccountMode
        false, // orgsEnabled (from raw config)
        mockAccountsConfig,
        mockCredentials,
        true, // loadOrganizationsFromDynamoDbTable
      );
    });

    it('should handle different home regions', async () => {
      // Setup
      vi.spyOn(GlobalConfig, 'loadRawGlobalConfig').mockReturnValue({
        homeRegion: 'eu-west-1',
      } as any);

      const mockReplacementsConfig = {
        loadDynamicReplacements: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(ReplacementsConfig.load).mockReturnValue(mockReplacementsConfig as any);

      // Execute
      await ConfigLoader.getAcceleratorConfigurations(
        mockPartition,
        mockConfigDirPath,
        mockResourcePrefixes,
        true,
        mockCredentials,
      );

      // Verify
      expect(mockReplacementsConfig.loadDynamicReplacements).toHaveBeenCalledWith('eu-west-1', mockCredentials);
    });

    it('should handle different partitions', async () => {
      // Setup
      const govCloudPartition = 'aws-us-gov';
      const mockOrganizationConfig = {
        loadOrganizationalUnitIds: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(OrganizationConfig.load).mockReturnValue(mockOrganizationConfig as any);

      // Execute
      await ConfigLoader.getAcceleratorConfigurations(
        govCloudPartition,
        mockConfigDirPath,
        mockResourcePrefixes,
        true,
        mockCredentials,
      );

      // Verify
      expect(mockOrganizationConfig.loadOrganizationalUnitIds).toHaveBeenCalledWith(govCloudPartition, mockCredentials);
    });
  });
});
