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

import { beforeEach, describe, test, expect, vi } from 'vitest';
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
  SecurityHubConfig,
  SecurityhubAutomationRuleConfig,
} from '@aws-accelerator/config';
import { ManageAutomationRulesModule, MESSAGES } from '../../../lib/actions/aws-security-hub/manage-automation-rules';
import { getCredentials } from '../../../../../@aws-lza/common/functions';
import { getRunnerTargetRegions } from '../../../lib/functions';
import { manageSecurityHubAutomationRules } from '../../../../../@aws-lza/index';

// Mock the getCredentials function
vi.mock('../../../../../@aws-lza/common/functions', async importActual => ({
  ...(await importActual()),
  getCredentials: vi.fn().mockResolvedValue(MOCK_CONSTANTS.credentials),
}));

// Mock the getRunnerTargetRegions function
vi.mock('../../../lib/functions', () => ({
  getRunnerTargetRegions: vi.fn().mockReturnValue(['us-east-1', 'us-west-2']),
}));

// Mock the manageSecurityHubAutomationRules function
vi.mock('../../../../../@aws-lza/index', () => ({
  manageSecurityHubAutomationRules: vi.fn(),
}));

const mockGetCredentials = vi.mocked(getCredentials);
const mockGetRunnerTargetRegions = vi.mocked(getRunnerTargetRegions);
const mockManageSecurityHubAutomationRules = vi.mocked(manageSecurityHubAutomationRules);

describe('ManageAutomationRulesModule', () => {
  let mockAccountsConfig: AccountsConfig;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockAccountsConfig = {
      getAccountId: vi.fn().mockReturnValue('111111111111'),
      ...mockAccountsConfiguration,
    } as AccountsConfig;

    // Reset all mocks to their default values
    mockGetRunnerTargetRegions.mockReturnValue(['us-east-1', 'us-west-2']);
    mockManageSecurityHubAutomationRules.mockResolvedValue('Automation rules managed successfully');
  });

  function createMockSecurityConfig(
    securityHubEnabled?: boolean,
    automationRules?: SecurityhubAutomationRuleConfig[],
    excludeRegions?: string[],
  ): SecurityConfig {
    const securityHubConfig: SecurityHubConfig = {
      enable: securityHubEnabled ?? true,
      excludeRegions: excludeRegions ?? [],
      automationRules: automationRules ?? [],
    } as SecurityHubConfig;

    const centralSecurityServices: CentralSecurityServicesConfig = {
      ...mockSecurityConfig.centralSecurityServices!,
      delegatedAdminAccount: 'Audit',
      securityHub: securityHubConfig,
    };

    return {
      ...mockSecurityConfig,
      centralSecurityServices,
    } as SecurityConfig;
  }

  function createMockGlobalConfig(
    homeRegion?: string,
    managementAccountAccessRole?: string,
    enabledRegions?: string[],
  ): GlobalConfig {
    return {
      ...mockGlobalConfiguration,
      homeRegion: homeRegion ?? 'us-east-1',
      managementAccountAccessRole: managementAccountAccessRole ?? 'AWSControlTowerExecution',
      enabledRegions: enabledRegions ?? ['us-east-1', 'us-west-2'],
    } as GlobalConfig;
  }

  function createModuleParams(
    securityConfig: SecurityConfig,
    globalConfig: GlobalConfig,
    dryRun = false,
  ): ModuleParams {
    return {
      moduleItem: {
        name: AcceleratorModules.MANAGE_AUTOMATION_RULES,
        description: 'Manage Security Hub automation rules',
        runOrder: 1,
        handler: vi.fn<(params: ModuleParams) => Promise<string>>(),
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      runnerParameters: {
        ...MOCK_CONSTANTS.runnerParameters,
        dryRun,
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
        organizationAccounts: [],
        managementAccountCredentials: MOCK_CONSTANTS.credentials,
      },
    };
  }

  function createAutomationRuleConfig(
    name: string,
    excludeRegions?: string[],
    isTerminal?: boolean,
  ): SecurityhubAutomationRuleConfig {
    return {
      name: name,
      description: `Test automation rule ${name}`,
      ruleOrder: 1,
      isTerminal: isTerminal ?? false,
      enabled: true,
      criteria: [
        {
          key: 'productArn',
          filter: [
            {
              value: 'arn:aws:securityhub:*:*:product/aws/securityhub',
              comparison: 'EQUALS' as const,
            },
          ],
        },
      ],
      actions: [
        {
          type: 'FINDING_FIELDS_UPDATE' as const,
          findingFieldsUpdate: {
            severityLabel: 'LOW',
          },
        },
      ],
      excludeRegions: excludeRegions ?? [],
    } as SecurityhubAutomationRuleConfig;
  }

  describe('Configuration validation', () => {
    test('should skip execution when Security Hub is not enabled', async () => {
      const securityConfig = createMockSecurityConfig(false);
      const globalConfig = createMockGlobalConfig();
      const params = createModuleParams(securityConfig, globalConfig);

      const result = await ManageAutomationRulesModule.execute(params);

      expect(result).toBe(MESSAGES.SKIP_NO_SECURITY_HUB);
      expect(mockManageSecurityHubAutomationRules).not.toHaveBeenCalled();
    });

    test('should skip execution when automation rules are not configured', async () => {
      const securityConfig = createMockSecurityConfig(true, []);
      const globalConfig = createMockGlobalConfig();
      const params = createModuleParams(securityConfig, globalConfig);

      const result = await ManageAutomationRulesModule.execute(params);

      expect(result).toBe(MESSAGES.SKIP_NO_AUTOMATION_RULES);
      expect(mockManageSecurityHubAutomationRules).not.toHaveBeenCalled();
    });

    test('should skip execution when automation rules is undefined', async () => {
      const securityConfig = createMockSecurityConfig(true, undefined);
      const globalConfig = createMockGlobalConfig();
      const params = createModuleParams(securityConfig, globalConfig);

      const result = await ManageAutomationRulesModule.execute(params);

      expect(result).toBe(MESSAGES.SKIP_NO_AUTOMATION_RULES);
      expect(mockManageSecurityHubAutomationRules).not.toHaveBeenCalled();
    });

    test('should execute when Security Hub is enabled and automation rules are configured', async () => {
      const automationRules = [createAutomationRuleConfig('TestRule1')];
      const securityConfig = createMockSecurityConfig(true, automationRules);
      const globalConfig = createMockGlobalConfig();
      const params = createModuleParams(securityConfig, globalConfig);

      const result = await ManageAutomationRulesModule.execute(params);

      expect(mockGetCredentials).toHaveBeenCalledWith({
        accountId: '111111111111',
        region: 'us-east-1',
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
        partition: MOCK_CONSTANTS.runnerParameters.partition,
        assumeRoleName: 'AWSControlTowerExecution',
        credentials: MOCK_CONSTANTS.credentials,
      });
      expect(mockGetRunnerTargetRegions).toHaveBeenCalledWith(['us-east-1', 'us-west-2'], []);
      expect(mockManageSecurityHubAutomationRules).toHaveBeenCalledTimes(2); // us-east-1 and us-west-2
      expect(result).toContain('[Region: us-east-1] Automation rules managed successfully');
      expect(result).toContain('[Region: us-west-2] Automation rules managed successfully');
    });
  });

  describe('Region filtering', () => {
    test('should exclude regions specified in Security Hub excludeRegions', async () => {
      const automationRules = [createAutomationRuleConfig('TestRule1')];
      const securityConfig = createMockSecurityConfig(true, automationRules, ['us-west-2']);
      const globalConfig = createMockGlobalConfig();
      const params = createModuleParams(securityConfig, globalConfig);

      mockGetRunnerTargetRegions.mockReturnValue(['us-east-1']); // Only us-east-1 after filtering

      const result = await ManageAutomationRulesModule.execute(params);

      expect(mockGetRunnerTargetRegions).toHaveBeenCalledWith(['us-east-1', 'us-west-2'], ['us-west-2']);
      expect(mockManageSecurityHubAutomationRules).toHaveBeenCalledTimes(1); // Only us-east-1
      expect(result).toContain('[Region: us-east-1] Automation rules managed successfully');
      expect(result).not.toContain('[Region: us-west-2]');
    });

    test('should filter automation rules by excludeRegions per rule', async () => {
      const automationRules = [
        createAutomationRuleConfig('TestRule1', ['us-west-2']),
        createAutomationRuleConfig('TestRule2', []),
      ];
      const securityConfig = createMockSecurityConfig(true, automationRules);
      const globalConfig = createMockGlobalConfig();
      const params = createModuleParams(securityConfig, globalConfig);

      // Reset the mock to return default regions
      mockGetRunnerTargetRegions.mockReturnValue(['us-east-1', 'us-west-2']);

      const result = await ManageAutomationRulesModule.execute(params);

      expect(mockManageSecurityHubAutomationRules).toHaveBeenCalledTimes(2);

      // Verify us-east-1 call includes both rules
      expect(mockManageSecurityHubAutomationRules).toHaveBeenCalledWith({
        configuration: {
          automationRules: [
            expect.objectContaining({ name: 'TestRule1' }),
            expect.objectContaining({ name: 'TestRule2' }),
          ],
        },
        region: 'us-east-1',
        partition: MOCK_CONSTANTS.runnerParameters.partition,
        dryRun: false,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
        credentials: MOCK_CONSTANTS.credentials,
        operation: 'manage-automation-rules',
        moduleName: AcceleratorModules.MANAGE_AUTOMATION_RULES,
      });

      // Verify us-west-2 call excludes TestRule1
      expect(mockManageSecurityHubAutomationRules).toHaveBeenCalledWith({
        configuration: {
          automationRules: [expect.objectContaining({ name: 'TestRule2' })],
        },
        region: 'us-west-2',
        partition: MOCK_CONSTANTS.runnerParameters.partition,
        dryRun: false,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
        credentials: MOCK_CONSTANTS.credentials,
        operation: 'manage-automation-rules',
        moduleName: AcceleratorModules.MANAGE_AUTOMATION_RULES,
      });

      // Verify the result contains success messages for both regions
      expect(result).toContain('[Region: us-east-1] Automation rules managed successfully');
      expect(result).toContain('[Region: us-west-2] Automation rules managed successfully');
    });

    test('should handle empty automation rules after region filtering', async () => {
      const automationRules = [createAutomationRuleConfig('TestRule1', ['us-east-1', 'us-west-2'])];
      const securityConfig = createMockSecurityConfig(true, automationRules);
      const globalConfig = createMockGlobalConfig();
      const params = createModuleParams(securityConfig, globalConfig);

      // Reset the mock to return default regions
      mockGetRunnerTargetRegions.mockReturnValue(['us-east-1', 'us-west-2']);

      const result = await ManageAutomationRulesModule.execute(params);

      expect(mockManageSecurityHubAutomationRules).toHaveBeenCalledTimes(2);

      // Both regions should get empty automation rules arrays
      expect(mockManageSecurityHubAutomationRules).toHaveBeenCalledWith({
        configuration: { automationRules: [] },
        region: 'us-east-1',
        partition: MOCK_CONSTANTS.runnerParameters.partition,
        dryRun: false,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
        credentials: MOCK_CONSTANTS.credentials,
        operation: 'manage-automation-rules',
        moduleName: AcceleratorModules.MANAGE_AUTOMATION_RULES,
      });

      expect(mockManageSecurityHubAutomationRules).toHaveBeenCalledWith({
        configuration: { automationRules: [] },
        region: 'us-west-2',
        partition: MOCK_CONSTANTS.runnerParameters.partition,
        dryRun: false,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
        credentials: MOCK_CONSTANTS.credentials,
        operation: 'manage-automation-rules',
        moduleName: AcceleratorModules.MANAGE_AUTOMATION_RULES,
      });

      // Verify the result contains success messages for both regions even with empty rules
      expect(result).toContain('[Region: us-east-1] Automation rules managed successfully');
      expect(result).toContain('[Region: us-west-2] Automation rules managed successfully');
    });
  });

  describe('Multi-region execution', () => {
    test('should execute in all target regions', async () => {
      const automationRules = [createAutomationRuleConfig('TestRule1')];
      const securityConfig = createMockSecurityConfig(true, automationRules);
      const globalConfig = createMockGlobalConfig();
      const params = createModuleParams(securityConfig, globalConfig);

      mockGetRunnerTargetRegions.mockReturnValue(['us-east-1', 'us-west-2', 'eu-west-1']);

      const result = await ManageAutomationRulesModule.execute(params);

      expect(mockManageSecurityHubAutomationRules).toHaveBeenCalledTimes(3);
      expect(result).toContain('[Region: us-east-1] Automation rules managed successfully');
      expect(result).toContain('[Region: us-west-2] Automation rules managed successfully');
      expect(result).toContain('[Region: eu-west-1] Automation rules managed successfully');
    });

    test('should continue processing other regions when one region fails', async () => {
      const automationRules = [createAutomationRuleConfig('TestRule1')];
      const securityConfig = createMockSecurityConfig(true, automationRules);
      const globalConfig = createMockGlobalConfig();
      const params = createModuleParams(securityConfig, globalConfig);

      // Make the first region fail, second region succeed
      mockManageSecurityHubAutomationRules
        .mockRejectedValueOnce(new Error('Region us-east-1 failed'))
        .mockResolvedValueOnce('Automation rules managed successfully');

      const result = await ManageAutomationRulesModule.execute(params);

      expect(mockManageSecurityHubAutomationRules).toHaveBeenCalledTimes(2);
      expect(result).toContain(
        '[Region: us-east-1] Failed to manage automation rules in region us-east-1: Region us-east-1 failed',
      );
      expect(result).toContain('[Region: us-west-2] Automation rules managed successfully');
    });

    test('should handle no target regions', async () => {
      const automationRules = [createAutomationRuleConfig('TestRule1')];
      const securityConfig = createMockSecurityConfig(true, automationRules);
      const globalConfig = createMockGlobalConfig();
      const params = createModuleParams(securityConfig, globalConfig);

      mockGetRunnerTargetRegions.mockReturnValue([]);

      const result = await ManageAutomationRulesModule.execute(params);

      expect(mockManageSecurityHubAutomationRules).not.toHaveBeenCalled();
      expect(result).toBe('');
    });
  });

  describe('Dry run mode', () => {
    test('should pass dry run flag to automation rules management', async () => {
      const automationRules = [createAutomationRuleConfig('TestRule1')];
      const securityConfig = createMockSecurityConfig(true, automationRules);
      const globalConfig = createMockGlobalConfig();
      const params = createModuleParams(securityConfig, globalConfig, true);

      const result = await ManageAutomationRulesModule.execute(params);

      expect(mockManageSecurityHubAutomationRules).toHaveBeenCalledWith({
        configuration: { automationRules },
        region: 'us-east-1',
        partition: MOCK_CONSTANTS.runnerParameters.partition,
        dryRun: true,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
        credentials: MOCK_CONSTANTS.credentials,
        operation: 'manage-automation-rules',
        moduleName: AcceleratorModules.MANAGE_AUTOMATION_RULES,
      });
      expect(result).toContain('Automation rules managed successfully');
    });

    test('should handle dry run with multiple rules and regions', async () => {
      const automationRules = [
        createAutomationRuleConfig('TestRule1'),
        createAutomationRuleConfig('TestRule2', ['us-west-2']),
      ];
      const securityConfig = createMockSecurityConfig(true, automationRules);
      const globalConfig = createMockGlobalConfig();
      const params = createModuleParams(securityConfig, globalConfig, true);

      mockManageSecurityHubAutomationRules.mockResolvedValue('Dry run: Automation rules would be managed');

      const result = await ManageAutomationRulesModule.execute(params);

      expect(mockManageSecurityHubAutomationRules).toHaveBeenCalledTimes(2);
      expect(result).toContain('Dry run: Automation rules would be managed');
    });
  });

  describe('Error handling', () => {
    test('should handle credential retrieval failure', async () => {
      const automationRules = [createAutomationRuleConfig('TestRule1')];
      const securityConfig = createMockSecurityConfig(true, automationRules);
      const globalConfig = createMockGlobalConfig();
      const params = createModuleParams(securityConfig, globalConfig);

      mockGetCredentials.mockRejectedValueOnce(new Error('Failed to get credentials'));

      await expect(ManageAutomationRulesModule.execute(params)).rejects.toThrow('Failed to get credentials');
      expect(mockManageSecurityHubAutomationRules).not.toHaveBeenCalled();
    });

    test('should handle when getCredentials returns undefined', async () => {
      const automationRules = [createAutomationRuleConfig('TestRule1')];
      const securityConfig = createMockSecurityConfig(true, automationRules);
      const globalConfig = createMockGlobalConfig();
      const params = createModuleParams(securityConfig, globalConfig);

      mockGetCredentials.mockResolvedValueOnce(undefined);

      const result = await ManageAutomationRulesModule.execute(params);

      // The code now uses undefined credentials if getCredentials returns undefined
      expect(mockManageSecurityHubAutomationRules).toHaveBeenCalledWith(
        expect.objectContaining({
          credentials: undefined,
        }),
      );
      expect(result).toContain('Automation rules managed successfully');
    });

    test('should handle automation rules management failure', async () => {
      const automationRules = [createAutomationRuleConfig('TestRule1')];
      const securityConfig = createMockSecurityConfig(true, automationRules);
      const globalConfig = createMockGlobalConfig();
      const params = createModuleParams(securityConfig, globalConfig);

      mockManageSecurityHubAutomationRules.mockRejectedValueOnce(new Error('AWS SDK Error'));

      const result = await ManageAutomationRulesModule.execute(params);

      expect(result).toContain(
        '[Region: us-east-1] Failed to manage automation rules in region us-east-1: AWS SDK Error',
      );
      expect(result).toContain('[Region: us-west-2] Automation rules managed successfully');
    });

    test('should handle mixed success and failure results', async () => {
      const automationRules = [createAutomationRuleConfig('TestRule1')];
      const securityConfig = createMockSecurityConfig(true, automationRules);
      const globalConfig = createMockGlobalConfig();
      const params = createModuleParams(securityConfig, globalConfig);

      mockGetRunnerTargetRegions.mockReturnValue(['us-east-1', 'us-west-2', 'eu-west-1']);

      // Mix of success and failure
      mockManageSecurityHubAutomationRules
        .mockResolvedValueOnce('Automation rules managed successfully')
        .mockRejectedValueOnce(new Error('Region us-west-2 failed'))
        .mockResolvedValueOnce('Automation rules managed successfully');

      const result = await ManageAutomationRulesModule.execute(params);

      expect(mockManageSecurityHubAutomationRules).toHaveBeenCalledTimes(3);
      expect(result).toContain('[Region: us-east-1] Automation rules managed successfully');
      expect(result).toContain(
        '[Region: us-west-2] Failed to manage automation rules in region us-west-2: Region us-west-2 failed',
      );
      expect(result).toContain('[Region: eu-west-1] Automation rules managed successfully');
    });

    test('should handle non-Error exceptions', async () => {
      const automationRules = [createAutomationRuleConfig('TestRule1')];
      const securityConfig = createMockSecurityConfig(true, automationRules);
      const globalConfig = createMockGlobalConfig();
      const params = createModuleParams(securityConfig, globalConfig);

      mockManageSecurityHubAutomationRules.mockRejectedValueOnce('String error');

      const result = await ManageAutomationRulesModule.execute(params);

      expect(result).toContain(
        '[Region: us-east-1] Failed to manage automation rules in region us-east-1: String error',
      );
    });
  });

  describe('Delegated admin account', () => {
    test('should use correct delegated admin account credentials', async () => {
      const automationRules = [createAutomationRuleConfig('TestRule1')];
      const securityConfig = createMockSecurityConfig(true, automationRules);
      const globalConfig = createMockGlobalConfig();
      const params = createModuleParams(securityConfig, globalConfig);

      // Mock same account ID for delegated admin as current account
      mockAccountsConfig.getAccountId = vi.fn().mockReturnValue('222222222222');

      const result = await ManageAutomationRulesModule.execute(params);

      // getCredentials is now always called to get delegated admin credentials
      expect(mockGetCredentials).toHaveBeenCalledWith({
        accountId: '222222222222',
        region: 'us-east-1',
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
        partition: MOCK_CONSTANTS.runnerParameters.partition,
        assumeRoleName: 'AWSControlTowerExecution',
        credentials: MOCK_CONSTANTS.credentials,
      });
      expect(result).toContain('Automation rules managed successfully');
    });

    test('should use custom management account access role', async () => {
      const automationRules = [createAutomationRuleConfig('TestRule1')];
      const securityConfig = createMockSecurityConfig(true, automationRules);
      const globalConfig = createMockGlobalConfig('us-east-1', 'CustomRole');
      const params = createModuleParams(securityConfig, globalConfig);

      const result = await ManageAutomationRulesModule.execute(params);

      expect(mockGetCredentials).toHaveBeenCalledWith({
        accountId: '111111111111',
        region: 'us-east-1',
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
        partition: MOCK_CONSTANTS.runnerParameters.partition,
        assumeRoleName: 'CustomRole',
        credentials: MOCK_CONSTANTS.credentials,
      });
      expect(result).toContain('Automation rules managed successfully');
    });
  });

  describe('Complex automation rules scenarios', () => {
    test('should handle multiple automation rules with different configurations', async () => {
      const automationRules = [
        createAutomationRuleConfig('HighSeverityRule', [], true),
        createAutomationRuleConfig('MediumSeverityRule', ['us-west-2'], false),
        createAutomationRuleConfig('LowSeverityRule', [], false),
      ];
      const securityConfig = createMockSecurityConfig(true, automationRules);
      const globalConfig = createMockGlobalConfig();
      const params = createModuleParams(securityConfig, globalConfig);

      const result = await ManageAutomationRulesModule.execute(params);

      expect(mockManageSecurityHubAutomationRules).toHaveBeenCalledTimes(2);

      // Verify us-east-1 gets all rules
      expect(mockManageSecurityHubAutomationRules).toHaveBeenCalledWith({
        configuration: {
          automationRules: [
            expect.objectContaining({ name: 'HighSeverityRule', isTerminal: true }),
            expect.objectContaining({ name: 'MediumSeverityRule', isTerminal: false }),
            expect.objectContaining({ name: 'LowSeverityRule', isTerminal: false }),
          ],
        },
        region: 'us-east-1',
        partition: MOCK_CONSTANTS.runnerParameters.partition,
        dryRun: false,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
        credentials: MOCK_CONSTANTS.credentials,
        operation: 'manage-automation-rules',
        moduleName: AcceleratorModules.MANAGE_AUTOMATION_RULES,
      });

      // Verify us-west-2 excludes MediumSeverityRule
      expect(mockManageSecurityHubAutomationRules).toHaveBeenCalledWith({
        configuration: {
          automationRules: [
            expect.objectContaining({ name: 'HighSeverityRule' }),
            expect.objectContaining({ name: 'LowSeverityRule' }),
          ],
        },
        region: 'us-west-2',
        partition: MOCK_CONSTANTS.runnerParameters.partition,
        dryRun: false,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
        credentials: MOCK_CONSTANTS.credentials,
        operation: 'manage-automation-rules',
        moduleName: AcceleratorModules.MANAGE_AUTOMATION_RULES,
      });

      // Verify the result contains success messages for both regions
      expect(result).toContain('[Region: us-east-1] Automation rules managed successfully');
      expect(result).toContain('[Region: us-west-2] Automation rules managed successfully');
    });

    test('should handle automation rules with complex criteria and actions', async () => {
      const complexRule: SecurityhubAutomationRuleConfig = {
        name: 'ComplexRule',
        description: 'Complex automation rule with multiple criteria',
        ruleOrder: 1,
        isTerminal: false,
        enabled: true,
        criteria: [
          {
            key: 'productArn',
            filter: [
              {
                value: 'arn:aws:securityhub:*:*:product/aws/securityhub',
                comparison: 'EQUALS' as const,
              },
            ],
          },
          {
            key: 'severity',
            filter: [
              {
                gte: 70.0,
              },
            ],
          },
          {
            key: 'complianceStatus',
            filter: [
              {
                value: 'FAILED',
                comparison: 'EQUALS' as const,
              },
            ],
          },
        ],
        actions: [
          {
            type: 'FINDING_FIELDS_UPDATE' as const,
            findingFieldsUpdate: {
              severityLabel: 'CRITICAL',
              note: {
                text: 'Automatically updated by automation rule',
                updatedBy: 'SecurityHub',
              },
              relatedFindings: [
                {
                  productArn: 'arn:aws:securityhub:*:*:product/aws/securityhub',
                  id: 'related-finding-1',
                },
              ],
            },
          },
        ],
        excludeRegions: [],
      } as SecurityhubAutomationRuleConfig;

      const securityConfig = createMockSecurityConfig(true, [complexRule]);
      const globalConfig = createMockGlobalConfig();
      const params = createModuleParams(securityConfig, globalConfig);

      const result = await ManageAutomationRulesModule.execute(params);

      expect(mockManageSecurityHubAutomationRules).toHaveBeenCalledWith({
        configuration: {
          automationRules: [expect.objectContaining({ name: 'ComplexRule' })],
        },
        region: 'us-east-1',
        partition: MOCK_CONSTANTS.runnerParameters.partition,
        dryRun: false,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
        credentials: MOCK_CONSTANTS.credentials,
        operation: 'manage-automation-rules',
        moduleName: AcceleratorModules.MANAGE_AUTOMATION_RULES,
      });
      expect(result).toContain('Automation rules managed successfully');
    });
  });

  describe('Edge cases', () => {
    test('should handle undefined excludeRegions in automation rules', async () => {
      const ruleWithoutExcludeRegions = {
        ...createAutomationRuleConfig('TestRule1'),
        excludeRegions: undefined,
      } as SecurityhubAutomationRuleConfig;

      const securityConfig = createMockSecurityConfig(true, [ruleWithoutExcludeRegions]);
      const globalConfig = createMockGlobalConfig();
      const params = createModuleParams(securityConfig, globalConfig);

      const result = await ManageAutomationRulesModule.execute(params);

      expect(mockManageSecurityHubAutomationRules).toHaveBeenCalledTimes(2);
      expect(result).toContain('Automation rules managed successfully');
    });
  });
});
