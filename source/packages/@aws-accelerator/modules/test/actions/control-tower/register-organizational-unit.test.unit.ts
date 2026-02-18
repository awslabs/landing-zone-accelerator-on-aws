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

import { beforeEach, describe, test, vi, afterEach, expect } from 'vitest';
import { RegisterOrganizationalUnitModule } from '../../../lib/actions/control-tower/register-organizational-unit';
import { AcceleratorModules, ModuleExecutionPhase } from '../../../models/enums';
import { AcceleratorStage } from '../../../../accelerator';
import { ModuleParams } from '../../../models/types';
import {
  MOCK_CONSTANTS,
  mockAccountsConfiguration,
  mockGlobalConfiguration,
  mockGlobalConfigurationWithOutControlTower,
} from '../../mocked-resources';
import { AccountsConfig, OrganizationConfig } from '@aws-accelerator/config';
import * as awsLza from '../../../../../@aws-lza/index';

import { SSMClient } from '@aws-sdk/client-ssm';

// Mock SSM Client
vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({}),
  })),
  PutParameterCommand: vi.fn(),
}));

describe('RegisterOrganizationalUnitModule', () => {
  const unregisteredOrganizationalUnits = MOCK_CONSTANTS.configs.organizationConfig.organizationalUnits.filter(
    item =>
      item.name !== 'Security' &&
      MOCK_CONSTANTS.organizationUnitsDetail.some(
        ouDetail => ouDetail.completePath === item.name && !ouDetail.registeredwithControlTower,
      ),
  );

  let mockAccountsConfig: Partial<AccountsConfig>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Re-establish SSMClient mock after clearAllMocks
    (SSMClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      send: vi.fn().mockResolvedValue({}),
    }));

    vi.spyOn(awsLza, 'registerOrganizationalUnit').mockResolvedValue(`Successful`);
    vi.spyOn(awsLza, 'getOrganizationalUnitsDetail').mockResolvedValue(MOCK_CONSTANTS.organizationUnitsDetail);
    // Mock getParametersValue to return default value (parameter not found, falls back to default)
    vi.spyOn(awsLza, 'getParametersValue').mockResolvedValue([
      { Name: '/accelerator/control-tower/govern-regions-updated', Value: 'false' },
    ]);

    mockAccountsConfig = {
      getManagementAccount: vi.fn().mockReturnValue(MOCK_CONSTANTS.managementAccount),
      getManagementAccountId: vi.fn().mockReturnValue(MOCK_CONSTANTS.managementAccount.name),
      getAuditAccount: vi.fn().mockReturnValue(MOCK_CONSTANTS.auditAccount),
      getAuditAccountId: vi.fn().mockReturnValue(MOCK_CONSTANTS.auditAccount.name),
      getLogArchiveAccount: vi.fn().mockReturnValue(MOCK_CONSTANTS.logArchiveAccount),
      getLogArchiveAccountId: vi.fn().mockReturnValue(MOCK_CONSTANTS.logArchiveAccount.name),
      ...mockAccountsConfiguration,
    };
  });

  test('should execute successfully', async () => {
    // Setup
    const expectedOutput: string[] = [];
    for (let i = 0; i < unregisteredOrganizationalUnits.length; i++) {
      expectedOutput.push(`Successful`);
    }
    const param: ModuleParams = {
      moduleItem: {
        name: AcceleratorModules.REGISTER_ORGANIZATIONAL_UNIT,
        description: '',
        runOrder: 1,
        handler: vi.fn().mockResolvedValue(`Module 1 of ${AcceleratorStage.ACCOUNTS} stage executed`),
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      runnerParameters: MOCK_CONSTANTS.runnerParameters,
      moduleRunnerParameters: {
        configs: {
          ...MOCK_CONSTANTS.configs,
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

    // Execute
    const response = await RegisterOrganizationalUnitModule.execute(param);

    // Verify
    expect(awsLza.registerOrganizationalUnit).toHaveBeenCalledTimes(unregisteredOrganizationalUnits.length);
    expect(response).toBe(
      `Module "${
        AcceleratorModules.REGISTER_ORGANIZATIONAL_UNIT
      }" completed successfully with status ${expectedOutput.join('\n')}`,
    );
  });

  test('should skip execution when no landing zone configuration found', async () => {
    // Setup
    const param: ModuleParams = {
      moduleItem: {
        name: AcceleratorModules.REGISTER_ORGANIZATIONAL_UNIT,
        description: '',
        runOrder: 1,
        handler: vi.fn().mockResolvedValue(`Module 1 of ${AcceleratorStage.ACCOUNTS} stage executed`),
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      runnerParameters: MOCK_CONSTANTS.runnerParameters,
      moduleRunnerParameters: {
        configs: {
          ...MOCK_CONSTANTS.configs,
          accountsConfig: mockAccountsConfig as AccountsConfig,
          globalConfig: mockGlobalConfigurationWithOutControlTower,
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

    // Execute
    const response = await RegisterOrganizationalUnitModule.execute(param);

    // Verify
    expect(awsLza.registerOrganizationalUnit).toHaveBeenCalledTimes(0);
    expect(response).toBe(
      `Module "${AcceleratorModules.REGISTER_ORGANIZATIONAL_UNIT}" execution skipped, Control Tower Landing zone is not enabled for the environment.`,
    );
  });

  test('should skip execution when all organizational units already exist', async () => {
    // Setup
    const ouDetails = MOCK_CONSTANTS.organizationUnitsDetail.filter(
      item =>
        item.registeredwithControlTower &&
        MOCK_CONSTANTS.configs.organizationConfig.organizationalUnits.some(ou => ou.name === item.completePath),
    );
    vi.spyOn(awsLza, 'getOrganizationalUnitsDetail').mockResolvedValue(ouDetails);
    const param: ModuleParams = {
      moduleItem: {
        name: AcceleratorModules.REGISTER_ORGANIZATIONAL_UNIT,
        description: '',
        runOrder: 1,
        handler: vi.fn().mockResolvedValue(`Module 1 of ${AcceleratorStage.ACCOUNTS} stage executed`),
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      runnerParameters: MOCK_CONSTANTS.runnerParameters,
      moduleRunnerParameters: {
        configs: {
          ...MOCK_CONSTANTS.configs,
          accountsConfig: mockAccountsConfig as AccountsConfig,
          globalConfig: mockGlobalConfiguration,
          organizationConfig: {
            enable: true,
            organizationalUnits: [{ name: ouDetails[0].completePath, ignore: false }],
          } as OrganizationConfig,
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

    // Execute
    const response = await RegisterOrganizationalUnitModule.execute(param);

    // Verify
    expect(awsLza.registerOrganizationalUnit).toHaveBeenCalledTimes(0);
    expect(response).toBe(
      `Skipping "${AcceleratorModules.REGISTER_ORGANIZATIONAL_UNIT}" because all organizational units found in configuration file are already registered with AWS ControlTower.`,
    );
  });

  test('should re-register all OUs when governed regions were updated', async () => {
    // Setup - SSM parameter returns 'true' indicating governed regions were updated
    vi.spyOn(awsLza, 'getParametersValue').mockResolvedValue([
      { Name: '/accelerator/control-tower/govern-regions-updated', Value: 'true' },
    ]);

    // Note: securityOuName comes from getLogArchiveAccount().organizationalUnit
    // which is undefined in the mock, so Security OU is NOT excluded from re-registration.
    // All non-ignored OUs are re-registered when governed regions are updated.
    const allNonIgnoredOus = MOCK_CONSTANTS.configs.organizationConfig.organizationalUnits.filter(ou => !ou.ignore);

    const param: ModuleParams = {
      moduleItem: {
        name: AcceleratorModules.REGISTER_ORGANIZATIONAL_UNIT,
        description: '',
        runOrder: 1,
        handler: vi.fn().mockResolvedValue(`Module 1 of ${AcceleratorStage.ACCOUNTS} stage executed`),
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      runnerParameters: MOCK_CONSTANTS.runnerParameters,
      moduleRunnerParameters: {
        configs: {
          ...MOCK_CONSTANTS.configs,
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

    // Execute
    const response = await RegisterOrganizationalUnitModule.execute(param);

    // Verify - all non-Security, non-ignored OUs should be re-registered
    expect(awsLza.registerOrganizationalUnit).toHaveBeenCalledTimes(allNonIgnoredOus.length);
    expect(response).toContain('completed successfully');
  });

  test('should pass defaultValues map to getParametersValue', async () => {
    // Setup
    const getParametersValueSpy = vi
      .spyOn(awsLza, 'getParametersValue')
      .mockResolvedValue([{ Name: '/accelerator/control-tower/govern-regions-updated', Value: 'false' }]);

    const param: ModuleParams = {
      moduleItem: {
        name: AcceleratorModules.REGISTER_ORGANIZATIONAL_UNIT,
        description: '',
        runOrder: 1,
        handler: vi.fn().mockResolvedValue(`Module 1 of ${AcceleratorStage.ACCOUNTS} stage executed`),
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      runnerParameters: MOCK_CONSTANTS.runnerParameters,
      moduleRunnerParameters: {
        configs: {
          ...MOCK_CONSTANTS.configs,
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

    // Execute
    await RegisterOrganizationalUnitModule.execute(param);

    // Verify - getParametersValue should be called with defaultValues map
    expect(getParametersValueSpy).toHaveBeenCalledWith(
      ['/accelerator/control-tower/govern-regions-updated'],
      'mockHomeRegion',
      'RegisterOrganizationalUnitModule',
      undefined,
      'mockSolutionId',
      MOCK_CONSTANTS.credentials,
      { '/accelerator/control-tower/govern-regions-updated': 'false' },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
