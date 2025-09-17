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

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AcceleratorModules, ModuleExecutionPhase } from '../../models/enums';
import { AcceleratorStage } from '../../../accelerator';
import { ModuleParams } from '../../models/types';
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
  mockSecurityConfigWithoutSecurityHub,
} from '../mocked-resources';
import {
  AccountsConfig,
  CustomizationsConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  ReplacementsConfig,
  SecurityConfig,
} from '@aws-accelerator/config';
import { ExampleModule } from '../../lib/actions/example-module';
import { ListMembersCommand, SecurityHubClient } from '@aws-sdk/client-securityhub';
import * as moduleLibFunctions from '../../lib/functions';
import * as lzaCommonFunctions from '../../../../@aws-lza/common/functions';

//
// Mock Dependencies
//
vi.mock('@aws-sdk/client-organizations', () => ({
  ...vi.importActual('@aws-sdk/client-securityhub'),
  ListMembersCommand: vi.fn(),
  SecurityHubClient: vi.fn(),
}));

vi.mock('@aws-sdk/client-securityhub', () => ({
  ...vi.importActual('@aws-sdk/client-securityhub'),
  ListMembersCommand: vi.fn(),
  SecurityHubClient: vi.fn(),
}));

vi.mock('../../lib/functions', () => ({
  ...vi.importActual('../../lib/functions'),
  getRunnerTargetRegions: vi.fn(),
}));

vi.mock('../../../../@aws-lza/common/functions', () => ({
  ...vi.importActual('../../../../@aws-lza/common/functions'),
  getCredentials: vi.fn(),
}));

describe('ExampleModule', () => {
  const mockSend = vi.fn();
  let mockAccountsConfig: Partial<AccountsConfig>;
  beforeEach(() => {
    vi.clearAllMocks();

    (SecurityHubClient as vi.Mock).mockImplementation(() => ({
      send: mockSend,
    }));

    mockAccountsConfig = {
      getManagementAccount: vi.fn().mockReturnValue(MOCK_CONSTANTS.managementAccount),
      getManagementAccountId: vi.fn().mockReturnValue(MOCK_CONSTANTS.managementAccount.name),
      getAuditAccount: vi.fn().mockReturnValue(MOCK_CONSTANTS.auditAccount),
      getAuditAccountId: vi.fn().mockReturnValue(MOCK_CONSTANTS.auditAccount.name),
      getLogArchiveAccount: vi.fn().mockReturnValue(MOCK_CONSTANTS.logArchiveAccount),
      getLogArchiveAccountId: vi.fn().mockReturnValue(MOCK_CONSTANTS.logArchiveAccount.name),
      getAccountId: vi.fn().mockReturnValue(MOCK_CONSTANTS.auditAccountId),
      getAccountIdsFromDeploymentTarget: vi
        .fn()
        .mockReturnValue([
          MOCK_CONSTANTS.logArchiveAccountId,
          MOCK_CONSTANTS.managementAccountId,
          MOCK_CONSTANTS.auditAccountId,
        ]),
      ...mockAccountsConfiguration,
    };
  });

  test('should skip execution when service is not enabled', async () => {
    const param: ModuleParams = {
      moduleItem: {
        name: AcceleratorModules.SETUP_CONTROL_TOWER_LANDING_ZONE,
        description: '',
        runOrder: 1,
        handler: vi.fn().mockResolvedValue(`Module 1 of ${AcceleratorStage.PREPARE} stage executed`),
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      runnerParameters: MOCK_CONSTANTS.runnerParameters,
      moduleRunnerParameters: {
        configs: {
          customizationsConfig: mockCustomizationsConfig as CustomizationsConfig,
          iamConfig: mockIamConfig as IamConfig,
          networkConfig: mockNetworkConfig as NetworkConfig,
          organizationConfig: mockOrganizationConfig as OrganizationConfig,
          replacementsConfig: mockReplacementsConfig as ReplacementsConfig,
          securityConfig: mockSecurityConfigWithoutSecurityHub as SecurityConfig,
          accountsConfig: mockAccountsConfig as AccountsConfig,
          globalConfig: mockGlobalConfiguration,
        },
        globalRegion: MOCK_CONSTANTS.globalRegion,
        resourcePrefixes: MOCK_CONSTANTS.resourcePrefixes,
        acceleratorResourceNames: MOCK_CONSTANTS.acceleratorResourceNames,
        logging: MOCK_CONSTANTS.logging,
        organizationDetails: MOCK_CONSTANTS.organizationDetails,
        organizationAccounts: MOCK_CONSTANTS.organizationAccounts,
        managementAccountCredentials: MOCK_CONSTANTS.credentials,
      },
    };

    const result = await ExampleModule.execute(param);
    expect(result).toBe('Security Hub is not enabled. Skipping module execution');
  });

  test('should execute successfully when service is enabled', async () => {
    vi.spyOn(moduleLibFunctions, 'getRunnerTargetRegions').mockReturnValue(MOCK_CONSTANTS.includedRegions);
    vi.spyOn(lzaCommonFunctions, 'getCredentials').mockResolvedValue(MOCK_CONSTANTS.credentials);

    mockSend.mockImplementation(command => {
      if (command instanceof ListMembersCommand) {
        return Promise.resolve({
          Members: [
            { AccountId: 'AccountId1', MemberStatus: 'MemberStatus1' },
            { AccountId: 'AccountId2', MemberStatus: 'MemberStatus2' },
            { AccountId: 'AccountId3', MemberStatus: 'MemberStatus3' },
          ],
        });
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    const param: ModuleParams = {
      moduleItem: {
        name: AcceleratorModules.SETUP_CONTROL_TOWER_LANDING_ZONE,
        description: '',
        runOrder: 1,
        handler: vi.fn().mockResolvedValue(`Module 1 of ${AcceleratorStage.ACCOUNTS} stage executed`),
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      runnerParameters: MOCK_CONSTANTS.runnerParameters,
      moduleRunnerParameters: {
        configs: {
          customizationsConfig: mockCustomizationsConfig as CustomizationsConfig,
          iamConfig: mockIamConfig as IamConfig,
          networkConfig: mockNetworkConfig as NetworkConfig,
          organizationConfig: mockOrganizationConfig as OrganizationConfig,
          replacementsConfig: mockReplacementsConfig as ReplacementsConfig,
          securityConfig: mockSecurityConfig as SecurityConfig,
          accountsConfig: mockAccountsConfig as AccountsConfig,
          globalConfig: mockGlobalConfiguration,
        },
        globalRegion: MOCK_CONSTANTS.globalRegion,
        resourcePrefixes: MOCK_CONSTANTS.resourcePrefixes,
        acceleratorResourceNames: MOCK_CONSTANTS.acceleratorResourceNames,
        logging: MOCK_CONSTANTS.logging,
        organizationDetails: MOCK_CONSTANTS.organizationDetails,
        organizationAccounts: MOCK_CONSTANTS.organizationAccounts,
        managementAccountCredentials: MOCK_CONSTANTS.credentials,
      },
    };

    const result = await ExampleModule.execute(param);
    expect(result).toContain(
      `[Stage:undefined/Module:${AcceleratorModules.SETUP_CONTROL_TOWER_LANDING_ZONE}/Action:DelegatedAdmin`,
    );
    expect(result).toContain(
      `[Stage:undefined/Module:${AcceleratorModules.SETUP_CONTROL_TOWER_LANDING_ZONE}/Action:CreateMembers`,
    );
    expect(ListMembersCommand).toHaveBeenCalledTimes(2);
  });

  test('should execute successfully when service is enabled but no members to add for create members action', async () => {
    vi.spyOn(moduleLibFunctions, 'getRunnerTargetRegions').mockReturnValue(MOCK_CONSTANTS.includedRegions);
    vi.spyOn(lzaCommonFunctions, 'getCredentials').mockResolvedValue(MOCK_CONSTANTS.credentials);

    mockSend.mockImplementation(command => {
      if (command instanceof ListMembersCommand) {
        return Promise.resolve({
          Members: undefined,
        });
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    const param: ModuleParams = {
      moduleItem: {
        name: AcceleratorModules.SETUP_CONTROL_TOWER_LANDING_ZONE,
        description: '',
        runOrder: 1,
        handler: vi.fn().mockResolvedValue(`Module 1 of ${AcceleratorStage.ACCOUNTS} stage executed`),
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      runnerParameters: MOCK_CONSTANTS.runnerParameters,
      moduleRunnerParameters: {
        configs: {
          customizationsConfig: mockCustomizationsConfig as CustomizationsConfig,
          iamConfig: mockIamConfig as IamConfig,
          networkConfig: mockNetworkConfig as NetworkConfig,
          organizationConfig: mockOrganizationConfig as OrganizationConfig,
          replacementsConfig: mockReplacementsConfig as ReplacementsConfig,
          securityConfig: mockSecurityConfig as SecurityConfig,
          accountsConfig: mockAccountsConfig as AccountsConfig,
          globalConfig: mockGlobalConfiguration,
        },
        globalRegion: MOCK_CONSTANTS.globalRegion,
        resourcePrefixes: MOCK_CONSTANTS.resourcePrefixes,
        acceleratorResourceNames: MOCK_CONSTANTS.acceleratorResourceNames,
        logging: MOCK_CONSTANTS.logging,
        organizationDetails: MOCK_CONSTANTS.organizationDetails,
        organizationAccounts: MOCK_CONSTANTS.organizationAccounts,
        managementAccountCredentials: MOCK_CONSTANTS.credentials,
      },
    };

    const result = await ExampleModule.execute(param);
    expect(result).toContain(
      `[Stage:undefined/Module:${AcceleratorModules.SETUP_CONTROL_TOWER_LANDING_ZONE}/Action:DelegatedAdmin`,
    );
    expect(result).toContain(
      `[Stage:undefined/Module:${AcceleratorModules.SETUP_CONTROL_TOWER_LANDING_ZONE}/Action:CreateMembers`,
    );
    expect(ListMembersCommand).toHaveBeenCalledTimes(2);
  });
});
