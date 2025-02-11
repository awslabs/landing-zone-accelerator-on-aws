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
import { AcceleratorModules } from '../../models/enums';
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

//
// Mock Dependencies
//
jest.mock('@aws-sdk/client-organizations', () => ({
  ...jest.requireActual('@aws-sdk/client-securityhub'),
  ListMembersCommand: jest.fn(),
  SecurityHubClient: jest.fn(),
}));

jest.mock('@aws-sdk/client-securityhub', () => ({
  ...jest.requireActual('@aws-sdk/client-securityhub'),
  ListMembersCommand: jest.fn(),
  SecurityHubClient: jest.fn(),
}));

jest.mock('../../lib/functions', () => ({
  ...jest.requireActual('../../lib/functions'),
  getRunnerTargetRegions: jest.fn(),
}));

jest.mock('../../../../@aws-lza/common/functions', () => ({
  ...jest.requireActual('../../../../@aws-lza/common/functions'),
  getCredentials: jest.fn(),
}));

describe('ExampleModule', () => {
  const mockSend = jest.fn();
  let mockAccountsConfig: Partial<AccountsConfig>;
  beforeEach(() => {
    jest.clearAllMocks();

    (SecurityHubClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));

    mockAccountsConfig = {
      getManagementAccount: jest.fn().mockReturnValue(MOCK_CONSTANTS.managementAccount),
      getManagementAccountId: jest.fn().mockReturnValue(MOCK_CONSTANTS.managementAccount.name),
      getAuditAccount: jest.fn().mockReturnValue(MOCK_CONSTANTS.auditAccount),
      getAuditAccountId: jest.fn().mockReturnValue(MOCK_CONSTANTS.auditAccount.name),
      getLogArchiveAccount: jest.fn().mockReturnValue(MOCK_CONSTANTS.logArchiveAccount),
      getLogArchiveAccountId: jest.fn().mockReturnValue(MOCK_CONSTANTS.logArchiveAccount.name),
      getAccountId: jest.fn().mockReturnValue(MOCK_CONSTANTS.auditAccountId),
      getAccountIdsFromDeploymentTarget: jest
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
        handler: jest.fn().mockResolvedValue(`Module 1 of ${AcceleratorStage.PREPARE} stage executed`),
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
    jest
      .spyOn(require('../../lib/functions'), 'getRunnerTargetRegions')
      .mockReturnValue(MOCK_CONSTANTS.includedRegions);
    jest
      .spyOn(require('../../../../@aws-lza/common/functions'), 'getCredentials')
      .mockResolvedValue(MOCK_CONSTANTS.credentials);

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
        handler: jest.fn().mockResolvedValue(`Module 1 of ${AcceleratorStage.ACCOUNTS} stage executed`),
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
    jest
      .spyOn(require('../../lib/functions'), 'getRunnerTargetRegions')
      .mockReturnValue(MOCK_CONSTANTS.includedRegions);
    jest
      .spyOn(require('../../../../@aws-lza/common/functions'), 'getCredentials')
      .mockResolvedValue(MOCK_CONSTANTS.credentials);

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
        handler: jest.fn().mockResolvedValue(`Module 1 of ${AcceleratorStage.ACCOUNTS} stage executed`),
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
