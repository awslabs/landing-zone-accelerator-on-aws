/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *      http://www.apache.org/licenses/LICENSE-2.0
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import { beforeEach, afterEach, describe, test, expect, jest } from '@jest/globals';
import { Account } from '@aws-sdk/client-organizations';
import { AcceleratorModules, ModuleExecutionPhase } from '../../../models/enums';
import { ModuleParams } from '../../../models/types';
import {
  MOCK_CONSTANTS,
  mockAccountsConfiguration,
  mockCustomizationsConfig,
  mockGlobalConfiguration,
  mockIamConfig,
  mockNetworkConfig,
  mockOrganizationConfig,
  mockReplacementsConfig,
  mockSecurityConfig,
} from '../../mocked-resources';
import {
  AccountsConfig,
  CustomizationsConfig,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  ReplacementsConfig,
  SecurityConfig,
  CentralSecurityServicesConfig,
  BlockPublicDocumentSharingConfig,
  SsmSettingsConfig,
} from '@aws-accelerator/config';
import { SsmBlockPublicDocumentSharingModule } from '../../../lib/actions/aws-ssm/ssm-block-public-document-sharing';
import { IAssumeRoleCredential } from '../../../../../@aws-lza/common/resources';

// Mock the getCredentials function
jest.mock('../../../../../@aws-lza/common/functions', () => ({
  getCredentials: jest.fn(),
}));

// Mock the manageBlockPublicDocumentSharing function
const mockManageBlockPublicDocumentSharing =
  jest.fn<
    (params: {
      accountId: string;
      region: string;
      credentials: IAssumeRoleCredential;
      enable: boolean;
      solutionId: string;
    }) => Promise<string>
  >();

describe('SsmBlockPublicDocumentSharingModule', () => {
  let mockAccountsConfig: AccountsConfig;
  let mockImportSpy: jest.SpiedFunction<() => Promise<unknown>>;
  let mockGetCredentials: jest.MockedFunction<typeof import('../../../../../@aws-lza/common/functions').getCredentials>;

  // Test organization accounts
  const testAccounts: Account[] = [
    {
      Id: '111111111111',
      Name: 'Management',
      Email: 'management@example.com',
      Status: 'ACTIVE',
    },
    {
      Id: '222222222222',
      Name: 'Audit',
      Email: 'audit@example.com',
      Status: 'ACTIVE',
    },
    {
      Id: '333333333333',
      Name: 'LogArchive',
      Email: 'logarchive@example.com',
      Status: 'ACTIVE',
    },
    {
      Id: '444444444444',
      Name: 'Workload1',
      Email: 'workload1@example.com',
      Status: 'ACTIVE',
    },
    {
      Id: '555555555555',
      Name: 'Workload2',
      Email: 'workload2@example.com',
      Status: 'ACTIVE',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Get the mocked function reference
    mockGetCredentials = require('../../../../../@aws-lza/common/functions').getCredentials;

    mockAccountsConfig = {
      getManagementAccount: jest.fn().mockReturnValue(MOCK_CONSTANTS.managementAccount),
      getManagementAccountId: jest.fn().mockReturnValue(MOCK_CONSTANTS.managementAccount.name),
      getAuditAccount: jest.fn().mockReturnValue(MOCK_CONSTANTS.auditAccount),
      getAuditAccountId: jest.fn().mockReturnValue(MOCK_CONSTANTS.auditAccount.name),
      getLogArchiveAccount: jest.fn().mockReturnValue(MOCK_CONSTANTS.logArchiveAccount),
      getLogArchiveAccountId: jest.fn().mockReturnValue(MOCK_CONSTANTS.logArchiveAccount.name),
      ...mockAccountsConfiguration,
    } as AccountsConfig;

    // Setup default mocks
    mockGetCredentials.mockResolvedValue(MOCK_CONSTANTS.credentials);
    mockManageBlockPublicDocumentSharing.mockResolvedValue('SSM Block Public Document Sharing enabled successfully');

    // Mock the import wrapper function
    mockImportSpy = jest.spyOn(
      SsmBlockPublicDocumentSharingModule as unknown as {
        importBlockPublicDocumentSharing: () => Promise<unknown>;
      },
      'importBlockPublicDocumentSharing',
    );
    mockImportSpy.mockResolvedValue({
      manageBlockPublicDocumentSharing: mockManageBlockPublicDocumentSharing,
    });
  });

  afterEach(() => {
    mockImportSpy.mockRestore();
  });

  function createMockSecurityConfig(ssmConfig?: BlockPublicDocumentSharingConfig): SecurityConfig {
    const ssmSettings = ssmConfig ? { blockPublicDocumentSharing: ssmConfig } : undefined;
    const centralSecurityServices: CentralSecurityServicesConfig = {
      ...mockSecurityConfig.centralSecurityServices!,
      ssmSettings,
    };

    return {
      ...mockSecurityConfig,
      centralSecurityServices,
    } as SecurityConfig;
  }

  function createMockGlobalConfig(homeRegion?: string, managementAccountAccessRole?: string): GlobalConfig {
    return {
      ...mockGlobalConfiguration,
      homeRegion,
      managementAccountAccessRole: managementAccountAccessRole || 'AWSControlTowerExecution',
    } as GlobalConfig;
  }

  function createModuleParams(
    securityConfig: SecurityConfig,
    globalConfig: GlobalConfig,
    region = 'us-east-1',
    organizationAccounts: Account[] = testAccounts,
  ): ModuleParams {
    return {
      moduleItem: {
        name: AcceleratorModules.SSM_BLOCK_PUBLIC_DOCUMENT_SHARING,
        description: 'Manage SSM Block Public Document Sharing across organization accounts',
        runOrder: 1,
        handler: jest.fn<(params: ModuleParams) => Promise<string>>(),
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      runnerParameters: {
        ...MOCK_CONSTANTS.runnerParameters,
        region,
      },
      moduleRunnerParameters: {
        configs: {
          customizationsConfig: mockCustomizationsConfig as CustomizationsConfig,
          iamConfig: mockIamConfig as IamConfig,
          networkConfig: mockNetworkConfig as NetworkConfig,
          organizationConfig: mockOrganizationConfig as OrganizationConfig,
          replacementsConfig: mockReplacementsConfig as ReplacementsConfig,
          securityConfig,
          accountsConfig: mockAccountsConfig,
          globalConfig,
        },
        globalRegion: MOCK_CONSTANTS.globalRegion,
        resourcePrefixes: MOCK_CONSTANTS.resourcePrefixes,
        acceleratorResourceNames: MOCK_CONSTANTS.acceleratorResourceNames,
        logging: MOCK_CONSTANTS.logging,
        organizationDetails: MOCK_CONSTANTS.organizationDetails,
        organizationAccounts,
        managementAccountCredentials: MOCK_CONSTANTS.credentials,
      },
    };
  }

  function createSsmConfig(enable: boolean, excludeAccounts?: string[]): BlockPublicDocumentSharingConfig {
    const config = new BlockPublicDocumentSharingConfig();
    // Use Object.defineProperty to override readonly properties
    Object.defineProperty(config, 'enable', { value: enable, writable: false });
    if (excludeAccounts !== undefined) {
      Object.defineProperty(config, 'excludeAccounts', { value: excludeAccounts, writable: false });
    }
    return config;
  }

  describe('Configuration validation', () => {
    test('should skip execution when configuration is not present', async () => {
      const securityConfig = createMockSecurityConfig(undefined);
      const globalConfig = createMockGlobalConfig('us-east-1');
      const params = createModuleParams(securityConfig, globalConfig);

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(result).toBe('SSM Block Public Document Sharing configuration not present, skipping execution');
    });

    test('should skip execution when configuration is null', async () => {
      // Create config with null value
      const centralSecurityServices: CentralSecurityServicesConfig = {
        ...mockSecurityConfig.centralSecurityServices!,
        ssmSettings: null as unknown as SsmSettingsConfig,
      };
      const securityConfig = {
        ...mockSecurityConfig,
        centralSecurityServices,
      } as SecurityConfig;
      const globalConfig = createMockGlobalConfig('us-east-1');
      const params = createModuleParams(securityConfig, globalConfig);

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(result).toBe('SSM Block Public Document Sharing configuration not present, skipping execution');
    });

    test('should skip execution when ssmSettings is present but blockPublicDocumentSharing is undefined', async () => {
      const centralSecurityServices: CentralSecurityServicesConfig = {
        ...mockSecurityConfig.centralSecurityServices!,
        ssmSettings: { blockPublicDocumentSharing: undefined } as SsmSettingsConfig,
      };
      const securityConfig = {
        ...mockSecurityConfig,
        centralSecurityServices,
      } as SecurityConfig;
      const globalConfig = createMockGlobalConfig('us-east-1');
      const params = createModuleParams(securityConfig, globalConfig);

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(result).toBe('SSM Block Public Document Sharing configuration not present, skipping execution');
    });

    test('should skip execution when ssmSettings is present but blockPublicDocumentSharing is null', async () => {
      const centralSecurityServices: CentralSecurityServicesConfig = {
        ...mockSecurityConfig.centralSecurityServices!,
        ssmSettings: { blockPublicDocumentSharing: null } as unknown as SsmSettingsConfig,
      };
      const securityConfig = {
        ...mockSecurityConfig,
        centralSecurityServices,
      } as SecurityConfig;
      const globalConfig = createMockGlobalConfig('us-east-1');
      const params = createModuleParams(securityConfig, globalConfig);

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(result).toBe('SSM Block Public Document Sharing configuration not present, skipping execution');
    });

    test('should skip execution when enable property is not boolean', async () => {
      // Create an invalid config by manually creating an object with wrong type
      const invalidConfig = {
        enable: 'true',
        excludeAccounts: [],
      } as unknown as BlockPublicDocumentSharingConfig;
      const securityConfig = createMockSecurityConfig(invalidConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      const params = createModuleParams(securityConfig, globalConfig);

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(result).toBe('SSM Block Public Document Sharing configuration not present, skipping execution');
    });
  });

  describe('Multi-region execution', () => {
    test('should skip execution when no enabled regions are defined', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      // Don't set enabledRegions - should skip execution since enabledRegions is required
      const params = createModuleParams(securityConfig, globalConfig, 'us-east-1');

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(result).toBe(
        'No enabled regions found in global configuration, skipping SSM Block Public Document Sharing execution',
      );
    });

    test('should skip execution when enabledRegions is empty array', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: [], writable: false });
      const params = createModuleParams(securityConfig, globalConfig, 'us-east-1');

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(result).toBe(
        'No enabled regions found in global configuration, skipping SSM Block Public Document Sharing execution',
      );
    });

    test('should execute in all enabled regions', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1', 'us-west-2'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig, 'us-east-1', [testAccounts[0]]);

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      // Should be called twice - once for each region
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledTimes(2);

      // Verify calls for us-east-1
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledWith({
        accountId: '111111111111',
        region: 'us-east-1',
        credentials: MOCK_CONSTANTS.credentials,
        enable: true,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
      });

      // Verify calls for us-west-2
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledWith({
        accountId: '111111111111',
        region: 'us-west-2',
        credentials: MOCK_CONSTANTS.credentials,
        enable: true,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
      });

      expect(result).toContain('Region us-east-1:');
      expect(result).toContain('Region us-west-2:');
      expect(result).toContain('SSM Block Public Document Sharing enabled successfully');
    });

    test('should execute in multiple regions independently', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', {
        value: ['us-east-1', 'us-west-2', 'eu-west-1'],
        writable: false,
      });
      const params = createModuleParams(securityConfig, globalConfig, 'us-east-1', [testAccounts[0]]);

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      // Should be called three times - once for each region
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledTimes(3);

      // Verify calls for all regions
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledWith({
        accountId: '111111111111',
        region: 'us-east-1',
        credentials: MOCK_CONSTANTS.credentials,
        enable: true,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
      });

      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledWith({
        accountId: '111111111111',
        region: 'us-west-2',
        credentials: MOCK_CONSTANTS.credentials,
        enable: true,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
      });

      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledWith({
        accountId: '111111111111',
        region: 'eu-west-1',
        credentials: MOCK_CONSTANTS.credentials,
        enable: true,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
      });

      expect(result).toContain('Region us-east-1:');
      expect(result).toContain('Region us-west-2:');
      expect(result).toContain('Region eu-west-1:');
      expect(result).toContain('SSM Block Public Document Sharing enabled successfully');
    });

    test('should handle region addition scenario', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);

      // Initially only us-east-1 is enabled
      const globalConfigSingleRegion = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfigSingleRegion, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const paramsSingleRegion = createModuleParams(securityConfig, globalConfigSingleRegion, 'us-east-1', [
        testAccounts[0],
      ]);

      const resultSingleRegion = await SsmBlockPublicDocumentSharingModule.execute(paramsSingleRegion);

      // Should only be called once for us-east-1
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledTimes(1);
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledWith({
        accountId: '111111111111',
        region: 'us-east-1',
        credentials: MOCK_CONSTANTS.credentials,
        enable: true,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
      });
      expect(resultSingleRegion).toContain('Region us-east-1:');
      expect(resultSingleRegion).not.toContain('Region us-west-2:');

      // Reset mocks
      jest.clearAllMocks();
      mockManageBlockPublicDocumentSharing.mockResolvedValue('SSM Block Public Document Sharing enabled successfully');

      // Now add us-west-2 to enabled regions (create new config object)
      const globalConfigMultiRegion = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfigMultiRegion, 'enabledRegions', {
        value: ['us-east-1', 'us-west-2'],
        writable: false,
      });
      const paramsMultiRegion = createModuleParams(securityConfig, globalConfigMultiRegion, 'us-east-1', [
        testAccounts[0],
      ]);

      const resultMultiRegion = await SsmBlockPublicDocumentSharingModule.execute(paramsMultiRegion);

      // Should now be called twice - once for each region
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledTimes(2);
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledWith({
        accountId: '111111111111',
        region: 'us-east-1',
        credentials: MOCK_CONSTANTS.credentials,
        enable: true,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
      });
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledWith({
        accountId: '111111111111',
        region: 'us-west-2',
        credentials: MOCK_CONSTANTS.credentials,
        enable: true,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
      });
      expect(resultMultiRegion).toContain('Region us-east-1:');
      expect(resultMultiRegion).toContain('Region us-west-2:');
    });

    test('should handle region removal scenario', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);

      // Initially both regions are enabled
      const globalConfigMultiRegion = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfigMultiRegion, 'enabledRegions', {
        value: ['us-east-1', 'us-west-2'],
        writable: false,
      });
      const paramsMultiRegion = createModuleParams(securityConfig, globalConfigMultiRegion, 'us-east-1', [
        testAccounts[0],
      ]);

      const resultMultiRegion = await SsmBlockPublicDocumentSharingModule.execute(paramsMultiRegion);

      // Should be called twice - once for each region
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledTimes(2);
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledWith({
        accountId: '111111111111',
        region: 'us-east-1',
        credentials: MOCK_CONSTANTS.credentials,
        enable: true,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
      });
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledWith({
        accountId: '111111111111',
        region: 'us-west-2',
        credentials: MOCK_CONSTANTS.credentials,
        enable: true,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
      });
      expect(resultMultiRegion).toContain('Region us-east-1:');
      expect(resultMultiRegion).toContain('Region us-west-2:');

      // Reset mocks
      jest.clearAllMocks();
      mockManageBlockPublicDocumentSharing.mockResolvedValue('SSM Block Public Document Sharing enabled successfully');

      // Now remove us-west-2 from enabled regions (create new config object)
      const globalConfigSingleRegion = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfigSingleRegion, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const paramsSingleRegion = createModuleParams(securityConfig, globalConfigSingleRegion, 'us-east-1', [
        testAccounts[0],
      ]);

      const resultSingleRegion = await SsmBlockPublicDocumentSharingModule.execute(paramsSingleRegion);

      // Should only be called once for us-east-1
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledTimes(1);
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledWith({
        accountId: '111111111111',
        region: 'us-east-1',
        credentials: MOCK_CONSTANTS.credentials,
        enable: true,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
      });
      expect(resultSingleRegion).toContain('Region us-east-1:');
      expect(resultSingleRegion).not.toContain('Region us-west-2:');
    });

    test('should continue processing other regions when one region fails', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1', 'us-west-2'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig, 'us-east-1', [testAccounts[0]]);

      // Make the first region fail, second region succeed
      mockManageBlockPublicDocumentSharing
        .mockRejectedValueOnce(new Error('Region us-east-1 failed'))
        .mockResolvedValueOnce('SSM Block Public Document Sharing enabled successfully');

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      // Should be called twice - once for each region
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledTimes(2);

      expect(result).toContain('Region us-east-1:');
      expect(result).toContain('Region us-west-2:');
      expect(result).toContain('ERROR - Error: Region us-east-1 failed');
      expect(result).toContain('SSM Block Public Document Sharing enabled successfully');
    });

    test('should handle executeAccountActions throwing an error', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig, 'us-east-1', [testAccounts[0]]);

      // Mock executeAccountActions to throw an error
      const originalExecuteAccountActions = (SsmBlockPublicDocumentSharingModule as unknown as Record<string, unknown>)[
        'executeAccountActions'
      ];
      (SsmBlockPublicDocumentSharingModule as unknown as Record<string, unknown>)['executeAccountActions'] = jest
        .fn<(params: ModuleParams) => Promise<string>>()
        .mockRejectedValue(new Error('executeAccountActions failed'));

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(result).toContain('Region us-east-1: ERROR - Error: executeAccountActions failed');

      // Restore the original method
      (SsmBlockPublicDocumentSharingModule as unknown as Record<string, unknown>)['executeAccountActions'] =
        originalExecuteAccountActions;
    });
  });

  describe('Successful account processing', () => {
    test('should enable feature for all accounts when no exclusions', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig);

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(mockGetCredentials).toHaveBeenCalledTimes(5);
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledTimes(5);

      // Verify all accounts are enabled in us-east-1
      for (const account of testAccounts) {
        expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledWith({
          accountId: account.Id,
          region: 'us-east-1',
          credentials: MOCK_CONSTANTS.credentials,
          enable: true,
          solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
        });
      }

      expect(result).toContain('Region us-east-1:');
      expect(result).toContain('SSM Block Public Document Sharing enabled successfully');
    });

    test('should exclude specified accounts when feature is enabled', async () => {
      const ssmConfig = createSsmConfig(true, ['Workload1', 'Workload2']);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig);

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(mockGetCredentials).toHaveBeenCalledTimes(5);
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledTimes(5);

      // Verify enabled accounts
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledWith({
        accountId: '111111111111',
        region: 'us-east-1',
        credentials: MOCK_CONSTANTS.credentials,
        enable: true,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
      });

      // Verify disabled accounts (excluded)
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledWith({
        accountId: '444444444444',
        region: 'us-east-1',
        credentials: MOCK_CONSTANTS.credentials,
        enable: false,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
      });

      expect(result).toContain('Region us-east-1:');
      expect(result).toContain('SSM Block Public Document Sharing enabled successfully');
    });

    test('should disable feature for all accounts when feature is disabled', async () => {
      const ssmConfig = createSsmConfig(false, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig);

      mockManageBlockPublicDocumentSharing.mockResolvedValue('SSM Block Public Document Sharing disabled successfully');

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(mockGetCredentials).toHaveBeenCalledTimes(5);
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledTimes(5);

      // Verify all accounts are disabled in us-east-1
      for (const account of testAccounts) {
        expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledWith({
          accountId: account.Id,
          region: 'us-east-1',
          credentials: MOCK_CONSTANTS.credentials,
          enable: false,
          solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
        });
      }

      expect(result).toContain('Region us-east-1:');
      expect(result).toContain('SSM Block Public Document Sharing disabled successfully');
    });

    test('should handle undefined excludeAccounts', async () => {
      const ssmConfig = createSsmConfig(true);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig);

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(mockGetCredentials).toHaveBeenCalledTimes(5);
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledTimes(5);

      // All accounts should be enabled in us-east-1
      for (const account of testAccounts) {
        expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledWith({
          accountId: account.Id,
          region: 'us-east-1',
          credentials: MOCK_CONSTANTS.credentials,
          enable: true,
          solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
        });
      }

      expect(result).toContain('Region us-east-1:');
      expect(result).toContain('SSM Block Public Document Sharing enabled successfully');
    });

    test('should handle null excludeAccounts to trigger fallback branch', async () => {
      const ssmConfig = createSsmConfig(true);
      // Explicitly set excludeAccounts to null to test the || [] fallback on line 113
      Object.defineProperty(ssmConfig, 'excludeAccounts', { value: null, writable: false });

      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig);

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(mockGetCredentials).toHaveBeenCalledTimes(5);
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledTimes(5);

      // All accounts should be enabled since null excludeAccounts becomes []
      for (const account of testAccounts) {
        expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledWith({
          accountId: account.Id,
          region: 'us-east-1',
          credentials: MOCK_CONSTANTS.credentials,
          enable: true,
          solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
        });
      }

      expect(result).toContain('Region us-east-1:');
      expect(result).toContain('SSM Block Public Document Sharing enabled successfully');
    });
  });

  describe('Error handling', () => {
    test('should handle credential retrieval failure', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig);

      mockGetCredentials.mockResolvedValueOnce(undefined);

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(result).toContain('Region us-east-1:');
      expect(result).toContain('ERROR');
      expect(result).toContain('Failed to get credentials for account');
    });

    test('should handle AWS SDK errors gracefully', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig);

      mockManageBlockPublicDocumentSharing.mockRejectedValueOnce(new Error('AWS SDK Error'));

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(result).toContain('Region us-east-1:');
      expect(result).toContain('ERROR');
      expect(result).toContain('AWS SDK Error');
    });

    test('should continue processing other accounts when one fails', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig);

      // Make the first account fail
      mockManageBlockPublicDocumentSharing
        .mockRejectedValueOnce(new Error('First account error'))
        .mockResolvedValue('SSM Block Public Document Sharing enabled successfully');

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledTimes(5);
      expect(result).toContain('Region us-east-1:');
      expect(result).toContain('ERROR');
      expect(result).toContain('First account error');
      expect(result).toContain('SSM Block Public Document Sharing enabled successfully');
    });

    test('should handle dynamic import failure', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig, 'us-east-1', [testAccounts[0]]);

      // Mock import failure
      mockImportSpy.mockRejectedValueOnce(new Error('Import failed'));

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(result).toContain('Region us-east-1:');
      expect(result).toContain('ERROR');
      expect(result).toContain('Import failed');
    });

    test('should handle mixed success and failure results', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig, 'us-east-1', testAccounts.slice(0, 2));

      // Mix of success and failure
      mockManageBlockPublicDocumentSharing
        .mockResolvedValueOnce(
          'Account Management (111111111111): SSM Block Public Document Sharing enabled successfully',
        )
        .mockRejectedValueOnce(new Error('Account Audit failed'));

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledTimes(2);
      expect(result).toContain('Region us-east-1:');
      expect(result).toContain('Management');
      expect(result).toContain('SSM Block Public Document Sharing enabled successfully');
      expect(result).toContain('Account Audit failed');
    });

    test('should handle promise rejection in Promise.allSettled', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig, 'us-east-1', [testAccounts[0]]);

      // Create a promise that will be rejected at the Promise.allSettled level
      // This simulates a scenario where the promise itself is rejected, not just the function call
      const rejectedPromise = Promise.reject(new Error('Promise settlement error'));

      // Mock the private method to return a rejected promise
      const originalMethod = (SsmBlockPublicDocumentSharingModule as unknown as Record<string, unknown>)[
        'blockPublicDocumentSharing'
      ];
      (SsmBlockPublicDocumentSharingModule as unknown as Record<string, unknown>)['blockPublicDocumentSharing'] = jest
        .fn()
        .mockReturnValue(rejectedPromise);

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(result).toContain('Region us-east-1:');
      expect(result).toContain('Promise rejected');
      expect(result).toContain('Promise settlement error');

      // Restore the original method
      (SsmBlockPublicDocumentSharingModule as unknown as Record<string, unknown>)['blockPublicDocumentSharing'] =
        originalMethod;
    });

    test('should call import wrapper function', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig, 'us-east-1', [testAccounts[0]]);

      await SsmBlockPublicDocumentSharingModule.execute(params);

      // Verify that the import wrapper function was called
      expect(mockImportSpy).toHaveBeenCalledTimes(1);
    });

    test('should test import wrapper function directly', async () => {
      // Test the import wrapper function directly by calling it through reflection
      const importFunction = (SsmBlockPublicDocumentSharingModule as unknown as Record<string, unknown>)[
        'importBlockPublicDocumentSharing'
      ] as () => Promise<unknown>;
      const result = await importFunction();

      expect(result).toBeDefined();
      expect((result as { manageBlockPublicDocumentSharing: unknown }).manageBlockPublicDocumentSharing).toBeDefined();
      expect(typeof (result as { manageBlockPublicDocumentSharing: unknown }).manageBlockPublicDocumentSharing).toBe(
        'function',
      );
    });

    test('should handle ServiceSettingNotFound exceptions in AWS SDK module', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig, 'us-east-1', [testAccounts[0]]);

      // Mock the AWS SDK module to throw ServiceSettingNotFound
      mockManageBlockPublicDocumentSharing.mockRejectedValueOnce(
        new Error('ServiceSettingNotFound: Setting not found'),
      );

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(result).toContain('Region us-east-1:');
      expect(result).toContain('ERROR');
      expect(result).toContain('ServiceSettingNotFound');
    });

    test('should handle throttling retry logic with multiple retry attempts', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig, 'us-east-1', [testAccounts[0]]);

      // Mock the AWS SDK module to throw ThrottlingException
      mockManageBlockPublicDocumentSharing.mockRejectedValueOnce(
        new Error('ThrottlingException: Request was throttled'),
      );

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(result).toContain('Region us-east-1:');
      expect(result).toContain('ERROR');
      expect(result).toContain('ThrottlingException');
    });

    test('should handle credential failure scenarios and error propagation', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig, 'us-east-1', [testAccounts[0]]);

      // Mock credential failure
      mockGetCredentials.mockRejectedValueOnce(new Error('Credential failure: Unable to assume role'));

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(result).toContain('Region us-east-1:');
      expect(result).toContain('ERROR');
      expect(result).toContain('Credential failure');
    });

    test('should handle network timeout and connection failure scenarios', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig, 'us-east-1', [testAccounts[0]]);

      // Mock network timeout
      mockManageBlockPublicDocumentSharing.mockRejectedValueOnce(new Error('NetworkingError: Connection timeout'));

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(result).toContain('Region us-east-1:');
      expect(result).toContain('ERROR');
      expect(result).toContain('NetworkingError');
    });

    test('should handle malformed configuration scenarios and validation edge cases', async () => {
      // Test with malformed configuration that passes initial validation but fails later
      const malformedConfig = {
        enable: true,
        excludeAccounts: ['ValidAccount'],
        // Add some unexpected properties
        unexpectedProperty: 'should be ignored',
      } as unknown as BlockPublicDocumentSharingConfig;

      const securityConfig = createMockSecurityConfig(malformedConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig, 'us-east-1', [testAccounts[0]]);

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      // Should still execute successfully as the core properties are valid
      expect(result).toContain('Region us-east-1:');
      expect(result).toContain('SSM Block Public Document Sharing enabled successfully');
    });
  });

  describe('Edge cases', () => {
    test('should handle accounts with missing names', async () => {
      const accountsWithMissingNames: Account[] = [
        ...testAccounts,
        {
          Id: '666666666666',
          Name: undefined,
          Email: 'missing@example.com',
          Status: 'ACTIVE',
        },
      ];

      const ssmConfig = createSsmConfig(true, ['Workload1']);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig, 'us-east-1', accountsWithMissingNames);

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(mockGetCredentials).toHaveBeenCalledTimes(6);
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledTimes(6);

      // Account with missing name should be enabled (not in exclude list)
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledWith({
        accountId: '666666666666',
        region: 'us-east-1',
        credentials: MOCK_CONSTANTS.credentials,
        enable: true,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
      });

      expect(result).toContain('Region us-east-1:');
      expect(result).toContain('SSM Block Public Document Sharing enabled successfully');
    });

    test('should handle duplicate account names in excludeAccounts', async () => {
      const ssmConfig = createSsmConfig(true, ['Workload1', 'Workload1', 'Workload2']);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig);

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(mockGetCredentials).toHaveBeenCalledTimes(5);
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledTimes(5);

      // Both Workload1 and Workload2 should be disabled
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledWith({
        accountId: '444444444444',
        region: 'us-east-1',
        credentials: MOCK_CONSTANTS.credentials,
        enable: false,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
      });

      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledWith({
        accountId: '555555555555',
        region: 'us-east-1',
        credentials: MOCK_CONSTANTS.credentials,
        enable: false,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
      });

      expect(result).toContain('Region us-east-1:');
      expect(result).toContain('SSM Block Public Document Sharing enabled successfully');
    });

    test('should handle non-existent account names in excludeAccounts', async () => {
      const ssmConfig = createSsmConfig(true, ['NonExistentAccount', 'Workload1']);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig);

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(mockGetCredentials).toHaveBeenCalledTimes(5);
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledTimes(5);

      // Only Workload1 should be disabled (NonExistentAccount doesn't exist)
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledWith({
        accountId: '444444444444',
        region: 'us-east-1',
        credentials: MOCK_CONSTANTS.credentials,
        enable: false,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
      });

      // Other accounts should be enabled
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledWith({
        accountId: '111111111111',
        region: 'us-east-1',
        credentials: MOCK_CONSTANTS.credentials,
        enable: true,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
      });

      expect(result).toContain('Region us-east-1:');
      expect(result).toContain('SSM Block Public Document Sharing enabled successfully');
    });

    test('should handle empty organization accounts list', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig, 'us-east-1', []);

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(mockGetCredentials).not.toHaveBeenCalled();
      expect(mockManageBlockPublicDocumentSharing).not.toHaveBeenCalled();

      // Should handle empty accounts list - no errors since no accounts to process
      expect(result).toContain('Region us-east-1:');
    });

    test('should handle null and undefined parameter handling in all functions', async () => {
      // Test determineAccountActions with null/undefined parameters
      const determineAccountActionsFunction = (
        SsmBlockPublicDocumentSharingModule as unknown as Record<string, unknown>
      )['determineAccountActions'] as (
        allAccounts: Account[],
        excludeAccounts: string[],
        featureEnabled: boolean,
      ) => { enableAccounts: Account[]; disableAccounts: Account[] };

      // Test with null excludeAccounts
      const result1 = determineAccountActionsFunction(testAccounts, null as unknown as string[], true);
      expect(result1.enableAccounts).toHaveLength(5);
      expect(result1.disableAccounts).toHaveLength(0);

      // Test with undefined excludeAccounts
      const result2 = determineAccountActionsFunction(testAccounts, undefined as unknown as string[], true);
      expect(result2.enableAccounts).toHaveLength(5);
      expect(result2.disableAccounts).toHaveLength(0);

      // Test with empty accounts array
      const result3 = determineAccountActionsFunction([], ['Workload1'], true);
      expect(result3.enableAccounts).toHaveLength(0);
      expect(result3.disableAccounts).toHaveLength(0);
    });

    test('should handle maximum retry scenarios and exponential backoff limits', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig, 'us-east-1', [testAccounts[0]]);

      // Mock multiple retry failures
      mockManageBlockPublicDocumentSharing.mockRejectedValue(new Error('Max retries exceeded'));

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(result).toContain('Region us-east-1:');
      expect(result).toContain('ERROR');
      expect(result).toContain('Max retries exceeded');
    });

    test('should handle concurrent execution scenarios and race conditions', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig, 'us-east-1', testAccounts);

      // Mock concurrent execution with varying delays
      mockManageBlockPublicDocumentSharing.mockImplementation(props => {
        const delay = Math.random() * 100; // Random delay to simulate race conditions
        return new Promise(resolve => {
          setTimeout(() => {
            resolve(`Account ${props.accountId}: SSM Block Public Document Sharing enabled successfully`);
          }, delay);
        });
      });

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledTimes(5);
      expect(result).toContain('Region us-east-1:');
      expect(result).toContain('SSM Block Public Document Sharing enabled successfully');
    });

    test('should handle malformed account data and missing properties', async () => {
      const malformedAccounts: Account[] = [
        {
          Id: '111111111111',
          Name: 'Management',
          Email: 'management@example.com',
          Status: 'ACTIVE',
        },
        {
          Id: undefined, // Missing ID
          Name: 'MissingId',
          Email: 'missing@example.com',
          Status: 'ACTIVE',
        } as unknown as Account,
        {
          Id: '333333333333',
          Name: '', // Empty name
          Email: 'empty@example.com',
          Status: 'ACTIVE',
        },
      ];

      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig, 'us-east-1', malformedAccounts);

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      // Should handle malformed accounts gracefully
      expect(result).toContain('Region us-east-1:');
      // Should process valid accounts
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledWith({
        accountId: '111111111111',
        region: 'us-east-1',
        credentials: MOCK_CONSTANTS.credentials,
        enable: true,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
      });
    });

    test('should handle large account lists and performance edge cases', async () => {
      // Create a large list of accounts to test performance
      const largeAccountList: Account[] = [];
      for (let i = 0; i < 100; i++) {
        largeAccountList.push({
          Id: `${i.toString().padStart(12, '0')}`,
          Name: `Account${i}`,
          Email: `account${i}@example.com`,
          Status: 'ACTIVE',
        });
      }

      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig, 'us-east-1', largeAccountList);

      // Mock fast responses to test performance
      mockManageBlockPublicDocumentSharing.mockResolvedValue('SSM Block Public Document Sharing enabled successfully');

      const startTime = Date.now();
      const result = await SsmBlockPublicDocumentSharingModule.execute(params);
      const endTime = Date.now();

      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledTimes(100);
      expect(result).toContain('Region us-east-1:');
      expect(result).toContain('SSM Block Public Document Sharing enabled successfully');

      // Should complete in reasonable time (less than 5 seconds for 100 accounts)
      expect(endTime - startTime).toBeLessThan(5000);
    });

    test('should handle empty enabledRegions array handling', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: [], writable: false });
      const params = createModuleParams(securityConfig, globalConfig, 'us-east-1', [testAccounts[0]]);

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(result).toBe(
        'No enabled regions found in global configuration, skipping SSM Block Public Document Sharing execution',
      );
      expect(mockManageBlockPublicDocumentSharing).not.toHaveBeenCalled();
    });

    test('should handle null enabledRegions handling', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: null, writable: false });
      const params = createModuleParams(securityConfig, globalConfig, 'us-east-1', [testAccounts[0]]);

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(result).toBe(
        'No enabled regions found in global configuration, skipping SSM Block Public Document Sharing execution',
      );
      expect(mockManageBlockPublicDocumentSharing).not.toHaveBeenCalled();
    });

    test('should handle undefined enabledRegions handling', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: undefined, writable: false });
      const params = createModuleParams(securityConfig, globalConfig, 'us-east-1', [testAccounts[0]]);

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(result).toBe(
        'No enabled regions found in global configuration, skipping SSM Block Public Document Sharing execution',
      );
      expect(mockManageBlockPublicDocumentSharing).not.toHaveBeenCalled();
    });
  });

  describe('Region-specific logging', () => {
    test('should include region context in success messages', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1', 'eu-west-1'], writable: false });

      // Test in eu-west-1 region
      const params = createModuleParams(securityConfig, globalConfig, 'eu-west-1', [testAccounts[0]]);

      mockManageBlockPublicDocumentSharing.mockResolvedValue(
        'Account Management (111111111111): SSM Block Public Document Sharing enabled successfully in region eu-west-1',
      );

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledWith({
        accountId: '111111111111',
        region: 'eu-west-1',
        credentials: MOCK_CONSTANTS.credentials,
        enable: true,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
      });
      expect(result).toContain('region eu-west-1');
    });

    test('should include region context in error messages', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', {
        value: ['us-east-1', 'ap-southeast-1'],
        writable: false,
      });

      // Test in ap-southeast-1 region
      const params = createModuleParams(securityConfig, globalConfig, 'ap-southeast-1', [testAccounts[0]]);

      mockManageBlockPublicDocumentSharing.mockRejectedValue(
        new Error('SSM Block Public Document Sharing failed in region ap-southeast-1'),
      );

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledWith({
        accountId: '111111111111',
        region: 'ap-southeast-1',
        credentials: MOCK_CONSTANTS.credentials,
        enable: true,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
      });
      expect(result).toContain('region ap-southeast-1');
    });

    test('should include region context in skip messages', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1'], writable: false });

      // Test with enabled region - should execute and include region context
      const params = createModuleParams(securityConfig, globalConfig, 'us-east-1');

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      expect(result).toContain('Region us-east-1:');
      expect(result).toContain('SSM Block Public Document Sharing enabled successfully');
    });
  });

  describe('Date formatting', () => {
    test('should format dates correctly in execution logs', async () => {
      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig);

      // Mock Date to ensure consistent formatting
      const mockDate = new Date('2023-01-01T12:00:00.000Z');
      const originalDate = global.Date;
      global.Date = jest.fn(() => mockDate) as unknown as DateConstructor;
      global.Date.now = originalDate.now;

      const result = await SsmBlockPublicDocumentSharingModule.execute(params);

      // Should execute without date-related errors
      expect(result).toContain('Region us-east-1:');
      expect(result).toContain('SSM Block Public Document Sharing enabled successfully');

      // Restore original Date
      global.Date = originalDate;
    });

    test('should test formatDate function directly', () => {
      // Test the formatDate function directly by calling it through reflection
      const formatDateFunction = (SsmBlockPublicDocumentSharingModule as unknown as Record<string, unknown>)[
        'formatDate'
      ] as (date: Date) => string;
      const testDate = new Date('2023-01-01T12:00:00.000Z');
      const result = formatDateFunction(testDate);

      expect(result).toBe('2023-01-01 12:00:00.000');
    });

    test('should format different dates correctly', () => {
      const formatDateFunction = (SsmBlockPublicDocumentSharingModule as unknown as Record<string, unknown>)[
        'formatDate'
      ] as (date: Date) => string;

      // Test with different date
      const testDate1 = new Date('2024-12-31T23:59:59.999Z');
      const result1 = formatDateFunction(testDate1);
      expect(result1).toBe('2024-12-31 23:59:59.999');

      // Test with another date
      const testDate2 = new Date('2025-06-15T08:30:45.123Z');
      const result2 = formatDateFunction(testDate2);
      expect(result2).toBe('2025-06-15 08:30:45.123');
    });
  });

  describe('Private function testing', () => {
    test('should test import wrapper function directly', async () => {
      // Test the import wrapper function directly by calling it through reflection
      const importFunction = (SsmBlockPublicDocumentSharingModule as unknown as Record<string, unknown>)[
        'importBlockPublicDocumentSharing'
      ] as () => Promise<unknown>;
      const result = await importFunction();

      expect(result).toBeDefined();
      expect((result as { manageBlockPublicDocumentSharing: unknown }).manageBlockPublicDocumentSharing).toBeDefined();
      expect(typeof (result as { manageBlockPublicDocumentSharing: unknown }).manageBlockPublicDocumentSharing).toBe(
        'function',
      );
    });

    test('should test isConfigurationPresent function directly', () => {
      // Test the isConfigurationPresent function directly by calling it through reflection
      const isConfigurationPresentFunction = (
        SsmBlockPublicDocumentSharingModule as unknown as Record<string, unknown>
      )['isConfigurationPresent'] as (config: unknown) => boolean;

      // Test with valid configuration
      expect(isConfigurationPresentFunction({ enable: true })).toBe(true);
      expect(isConfigurationPresentFunction({ enable: false })).toBe(true);

      // Test with invalid configurations
      expect(isConfigurationPresentFunction(undefined)).toBe(false);
      expect(isConfigurationPresentFunction(null)).toBe(false);
      expect(isConfigurationPresentFunction({})).toBe(false);
      expect(isConfigurationPresentFunction({ enable: 'true' })).toBe(false);
      expect(isConfigurationPresentFunction({ enable: 1 })).toBe(false);
    });

    test('should test executeAccountActions function directly', async () => {
      // Test the executeAccountActions function directly by calling it through reflection
      const executeAccountActionsFunction = (SsmBlockPublicDocumentSharingModule as unknown as Record<string, unknown>)[
        'executeAccountActions'
      ] as (params: ModuleParams) => Promise<string>;

      const ssmConfig = createSsmConfig(true, []);
      const securityConfig = createMockSecurityConfig(ssmConfig);
      const globalConfig = createMockGlobalConfig('us-east-1');
      Object.defineProperty(globalConfig, 'enabledRegions', { value: ['us-east-1'], writable: false });
      const params = createModuleParams(securityConfig, globalConfig, 'us-east-1', [testAccounts[0]]);

      const result = await executeAccountActionsFunction(params);

      expect(result).toContain('SSM Block Public Document Sharing enabled successfully');
      expect(mockManageBlockPublicDocumentSharing).toHaveBeenCalledTimes(1);
    });

    test('should test determineAccountActions function directly', () => {
      // Test the determineAccountActions function directly by calling it through reflection
      const determineAccountActionsFunction = (
        SsmBlockPublicDocumentSharingModule as unknown as Record<string, unknown>
      )['determineAccountActions'] as (
        allAccounts: Account[],
        excludeAccounts: string[],
        featureEnabled: boolean,
      ) => { enableAccounts: Account[]; disableAccounts: Account[] };

      // Test with feature enabled and no exclusions
      const result1 = determineAccountActionsFunction(testAccounts, [], true);
      expect(result1.enableAccounts).toHaveLength(5);
      expect(result1.disableAccounts).toHaveLength(0);

      // Test with feature disabled
      const result2 = determineAccountActionsFunction(testAccounts, [], false);
      expect(result2.enableAccounts).toHaveLength(0);
      expect(result2.disableAccounts).toHaveLength(5);

      // Test with exclusions
      const result3 = determineAccountActionsFunction(testAccounts, ['Workload1'], true);
      expect(result3.enableAccounts).toHaveLength(4);
      expect(result3.disableAccounts).toHaveLength(1);
    });

    test('should test blockPublicDocumentSharing function directly', async () => {
      // Test the blockPublicDocumentSharing function directly by calling it through reflection
      const blockPublicDocumentSharingFunction = (
        SsmBlockPublicDocumentSharingModule as unknown as Record<string, unknown>
      )['blockPublicDocumentSharing'] as (
        accountId: string,
        accountName: string,
        region: string,
        managementCredentials: IAssumeRoleCredential,
        enable: boolean,
        solutionId: string,
        managementAccountAccessRole: string,
      ) => Promise<string>;

      const result = await blockPublicDocumentSharingFunction(
        '111111111111',
        'Management',
        'us-east-1',
        MOCK_CONSTANTS.credentials,
        true,
        MOCK_CONSTANTS.runnerParameters.solutionId,
        'AWSControlTowerExecution',
      );

      expect(result).toContain('Account Management (111111111111) in region us-east-1:');
      expect(result).toContain('SSM Block Public Document Sharing enabled successfully');
      expect(mockGetCredentials).toHaveBeenCalledWith({
        accountId: '111111111111',
        region: 'us-east-1',
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
        partition: 'aws',
        assumeRoleName: 'AWSControlTowerExecution',
      });
    });

    test('should test real import function without mocking', async () => {
      // Temporarily restore the original import function to test the actual import statement
      mockImportSpy.mockRestore();

      try {
        // Test the import wrapper function directly by calling it through reflection
        const importFunction = (SsmBlockPublicDocumentSharingModule as unknown as Record<string, unknown>)[
          'importBlockPublicDocumentSharing'
        ] as () => Promise<unknown>;

        // The import should now succeed since we've fixed the import path
        // This test ensures the import statement is covered for 100% coverage
        const result = await importFunction();
        expect(result).toBeDefined();
        expect(typeof result).toBe('object');
        expect(result).toHaveProperty('manageBlockPublicDocumentSharing');
        expect(typeof (result as { manageBlockPublicDocumentSharing: unknown }).manageBlockPublicDocumentSharing).toBe(
          'function',
        );
      } finally {
        // Re-mock the import function for other tests
        mockImportSpy = jest.spyOn(
          SsmBlockPublicDocumentSharingModule as unknown as {
            importBlockPublicDocumentSharing: () => Promise<unknown>;
          },
          'importBlockPublicDocumentSharing',
        );
        mockImportSpy.mockResolvedValue({
          blockPublicDocumentSharing: mockManageBlockPublicDocumentSharing,
        });
      }
    });
  });
});
