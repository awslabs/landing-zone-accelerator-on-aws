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
    jest.clearAllMocks();

    jest.spyOn(awsLza, 'registerOrganizationalUnit').mockResolvedValue(`Successful`);
    jest.spyOn(awsLza, 'getOrganizationalUnitsDetail').mockResolvedValue(MOCK_CONSTANTS.organizationUnitsDetail);

    mockAccountsConfig = {
      getManagementAccount: jest.fn().mockReturnValue(MOCK_CONSTANTS.managementAccount),
      getManagementAccountId: jest.fn().mockReturnValue(MOCK_CONSTANTS.managementAccount.name),
      getAuditAccount: jest.fn().mockReturnValue(MOCK_CONSTANTS.auditAccount),
      getAuditAccountId: jest.fn().mockReturnValue(MOCK_CONSTANTS.auditAccount.name),
      getLogArchiveAccount: jest.fn().mockReturnValue(MOCK_CONSTANTS.logArchiveAccount),
      getLogArchiveAccountId: jest.fn().mockReturnValue(MOCK_CONSTANTS.logArchiveAccount.name),
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
        handler: jest.fn().mockResolvedValue(`Module 1 of ${AcceleratorStage.ACCOUNTS} stage executed`),
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
        handler: jest.fn().mockResolvedValue(`Module 1 of ${AcceleratorStage.ACCOUNTS} stage executed`),
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
    jest.spyOn(awsLza, 'getOrganizationalUnitsDetail').mockResolvedValue(ouDetails);
    const param: ModuleParams = {
      moduleItem: {
        name: AcceleratorModules.REGISTER_ORGANIZATIONAL_UNIT,
        description: '',
        runOrder: 1,
        handler: jest.fn().mockResolvedValue(`Module 1 of ${AcceleratorStage.ACCOUNTS} stage executed`),
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

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
