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

import { beforeEach, afterEach, describe, test, expect, vi } from 'vitest';
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
  BlockPublicAmiConfig,
  CustomizationsConfig,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  ReplacementsConfig,
  SecurityConfig,
  CentralSecurityServicesConfig,
} from '@aws-accelerator/config';
import { Ec2BlockPublicAmiModule } from '../../../lib/actions/aws-ec2/ec2-block-public-ami';

// Mock the getCredentials function
vi.mock('../../../../../@aws-lza/common/functions', () => ({
  getCredentials: vi.fn(),
}));

// Mock the manageImageBlockPublicAccess executor
vi.mock('../../../../../@aws-lza/executors/accelerator-amazon-ec2', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../../@aws-lza/executors/accelerator-amazon-ec2')>();
  return {
    ...actual,
    manageImageBlockPublicAccess: vi.fn(),
  };
});

import { manageImageBlockPublicAccess } from '../../../../../@aws-lza/executors/accelerator-amazon-ec2';
const mockManageImageBlockPublicAccess = vi.mocked(manageImageBlockPublicAccess);

describe('Ec2BlockPublicAmiModule', () => {
  let mockAccountsConfig: AccountsConfig;
  let mockGetCredentials: ReturnType<typeof vi.fn>;

  const testAccounts: Account[] = [
    { Id: '111111111111', Name: 'Management', Email: 'mgmt@example.com', Status: 'ACTIVE' },
    { Id: '222222222222', Name: 'Audit', Email: 'audit@example.com', Status: 'ACTIVE' },
    { Id: '333333333333', Name: 'Workload1', Email: 'wl1@example.com', Status: 'ACTIVE' },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();

    mockGetCredentials = vi.mocked((await import('../../../../../@aws-lza/common/functions')).getCredentials);

    mockAccountsConfig = {
      getManagementAccount: vi.fn().mockReturnValue(MOCK_CONSTANTS.managementAccount),
      getManagementAccountId: vi.fn().mockReturnValue(MOCK_CONSTANTS.managementAccount.name),
      ...mockAccountsConfiguration,
    } as AccountsConfig;

    mockGetCredentials.mockResolvedValue(await MOCK_CONSTANTS.credentials());
    mockManageImageBlockPublicAccess.mockResolvedValue('Image Block Public Access enabled successfully');
  });

  afterEach(() => {});

  function createBlockPublicAmiConfig(enable: boolean, excludeAccounts?: string[]): BlockPublicAmiConfig {
    const config = new BlockPublicAmiConfig();
    Object.defineProperty(config, 'enable', { value: enable, writable: false });
    if (excludeAccounts !== undefined) {
      Object.defineProperty(config, 'excludeAccounts', { value: excludeAccounts, writable: false });
    }
    return config;
  }

  function createModuleParams(
    blockPublicAmiConfig: BlockPublicAmiConfig | undefined,
    enabledRegions: string[] = ['us-east-1'],
    organizationAccounts: Account[] = testAccounts,
    dryRun = false,
  ): ModuleParams {
    const centralSecurityServices: CentralSecurityServicesConfig = {
      ...mockSecurityConfig.centralSecurityServices!,
      blockPublicAmi: blockPublicAmiConfig,
    };
    const securityConfig = { ...mockSecurityConfig, centralSecurityServices } as SecurityConfig;
    const globalConfig = {
      ...mockGlobalConfiguration,
      enabledRegions,
      managementAccountAccessRole: 'AWSControlTowerExecution',
    } as GlobalConfig;

    return {
      moduleItem: {
        name: AcceleratorModules.EC2_BLOCK_PUBLIC_AMI,
        description: 'Manage EC2 Image Block Public Access',
        runOrder: 1,
        handler: vi.fn<(params: ModuleParams) => Promise<string>>(),
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      runnerParameters: {
        ...MOCK_CONSTANTS.runnerParameters,
        region: 'us-east-1',
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
        organizationAccounts,
        managementAccountCredentials: MOCK_CONSTANTS.credentials,
      },
    };
  }

  describe('Configuration validation', () => {
    test('should skip execution when configuration is not present', async () => {
      const params = createModuleParams(undefined);
      const result = await Ec2BlockPublicAmiModule.execute(params);
      expect(result).toContain('not present, skipping');
    });

    test('should skip execution when no enabled regions', async () => {
      const config = createBlockPublicAmiConfig(true);
      const params = createModuleParams(config, []);
      const result = await Ec2BlockPublicAmiModule.execute(params);
      expect(result).toContain('No enabled regions');
    });
  });

  describe('Account actions', () => {
    test('should enable for all accounts when no exclusions', async () => {
      const config = createBlockPublicAmiConfig(true);
      const params = createModuleParams(config);
      await Ec2BlockPublicAmiModule.execute(params);

      expect(mockManageImageBlockPublicAccess).toHaveBeenCalledTimes(3);
      for (const call of mockManageImageBlockPublicAccess.mock.calls) {
        expect(call[0].configuration.enable).toBe(true);
      }
    });

    test('should exclude specified accounts', async () => {
      const config = createBlockPublicAmiConfig(true, ['Audit']);
      const params = createModuleParams(config);
      await Ec2BlockPublicAmiModule.execute(params);

      expect(mockManageImageBlockPublicAccess).toHaveBeenCalledTimes(3);
      // Audit account should have enable=false (1 excluded)
      const disabledCalls = mockManageImageBlockPublicAccess.mock.calls.filter(
        c => c[0].configuration.enable === false,
      );
      expect(disabledCalls).toHaveLength(1);
      // Others should have enable=true
      const enabledCalls = mockManageImageBlockPublicAccess.mock.calls.filter(c => c[0].configuration.enable === true);
      expect(enabledCalls).toHaveLength(2);
    });

    test('should disable for all accounts when feature is disabled', async () => {
      const config = createBlockPublicAmiConfig(false);
      const params = createModuleParams(config);
      await Ec2BlockPublicAmiModule.execute(params);

      expect(mockManageImageBlockPublicAccess).toHaveBeenCalledTimes(3);
      for (const call of mockManageImageBlockPublicAccess.mock.calls) {
        expect(call[0].configuration.enable).toBe(false);
      }
    });

    test('should execute across multiple regions', async () => {
      const config = createBlockPublicAmiConfig(true);
      const params = createModuleParams(config, ['us-east-1', 'eu-west-1']);
      await Ec2BlockPublicAmiModule.execute(params);

      // 3 accounts * 2 regions = 6 calls
      expect(mockManageImageBlockPublicAccess).toHaveBeenCalledTimes(6);
    });
  });

  describe('Error handling', () => {
    test('should continue processing when individual account fails', async () => {
      mockManageImageBlockPublicAccess.mockRejectedValueOnce(new Error('Access denied')).mockResolvedValue('Success');

      const config = createBlockPublicAmiConfig(true);
      const params = createModuleParams(config);
      const result = await Ec2BlockPublicAmiModule.execute(params);

      // Should still have called all 3 accounts
      expect(mockManageImageBlockPublicAccess).toHaveBeenCalledTimes(3);
      expect(result).toContain('us-east-1');
    });
  });

  describe('Dry run', () => {
    test('should pass dryRun flag to handler input', async () => {
      const config = createBlockPublicAmiConfig(true);
      const params = createModuleParams(config, ['us-east-1'], testAccounts, true);
      await Ec2BlockPublicAmiModule.execute(params);

      expect(mockManageImageBlockPublicAccess).toHaveBeenCalledTimes(3);
      for (const call of mockManageImageBlockPublicAccess.mock.calls) {
        expect(call[0].dryRun).toBe(true);
      }
    });

    test('should not pass dryRun when it is false', async () => {
      const config = createBlockPublicAmiConfig(true);
      const params = createModuleParams(config, ['us-east-1'], testAccounts, false);
      await Ec2BlockPublicAmiModule.execute(params);

      for (const call of mockManageImageBlockPublicAccess.mock.calls) {
        expect(call[0].dryRun).toBe(false);
      }
    });
  });

  describe('Account filtering', () => {
    test('should process all accounts provided by organizationAccounts (pre-filtered upstream)', async () => {
      const accountsProvided: Account[] = [
        { Id: '111111111111', Name: 'Management', Email: 'mgmt@example.com', Status: 'ACTIVE' },
        { Id: '222222222222', Name: 'Audit', Email: 'audit@example.com', Status: 'ACTIVE' },
        { Id: '333333333333', Name: 'Workload1', Email: 'wl1@example.com', Status: 'ACTIVE' },
      ];
      const config = createBlockPublicAmiConfig(true);
      const params = createModuleParams(config, ['us-east-1'], accountsProvided);
      await Ec2BlockPublicAmiModule.execute(params);

      // All 3 accounts should be processed (filtering happens upstream)
      expect(mockManageImageBlockPublicAccess).toHaveBeenCalledTimes(3);
    });
  });
});
