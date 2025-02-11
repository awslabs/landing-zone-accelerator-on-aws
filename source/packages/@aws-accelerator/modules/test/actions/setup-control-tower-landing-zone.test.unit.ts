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
import { SetupControlTowerLandingZoneModule } from '../../lib/actions/setup-control-tower-landing-zone';
import { AcceleratorModules } from '../../models/enums';
import { AcceleratorStage } from '../../../accelerator';
import { ModuleParams } from '../../models/types';
import {
  MOCK_CONSTANTS,
  mockAccountsConfiguration,
  mockGlobalConfiguration,
  mockGlobalConfigurationWithOutLandingZone,
} from '../mocked-resources';
import { AccountsConfig } from '@aws-accelerator/config';
import * as awsLza from '../../../../@aws-lza/index';

describe('SetupControlTowerLandingZoneModule', () => {
  let mockAccountsConfig: Partial<AccountsConfig>;

  beforeEach(() => {
    jest.clearAllMocks();

    jest
      .spyOn(awsLza, 'setupControlTowerLandingZone')
      .mockResolvedValue(`Module ${AcceleratorModules.SETUP_CONTROL_TOWER_LANDING_ZONE} executed successfully`);

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

  test('Should execute successfully', async () => {
    // Setup
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
    const response = await SetupControlTowerLandingZoneModule.execute(param);

    // Verify
    expect(awsLza.setupControlTowerLandingZone).toHaveBeenCalled();
    expect(response).toBe(`Module ${AcceleratorModules.SETUP_CONTROL_TOWER_LANDING_ZONE} executed successfully`);
  });

  test('Should execute successfully when no landing zone configuration found', async () => {
    // Setup
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
          ...MOCK_CONSTANTS.configs,
          accountsConfig: mockAccountsConfig as AccountsConfig,
          globalConfig: mockGlobalConfigurationWithOutLandingZone,
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
    const response = await SetupControlTowerLandingZoneModule.execute(param);

    // Verify
    expect(response).toBe(
      `Module ${AcceleratorModules.SETUP_CONTROL_TOWER_LANDING_ZONE} execution skipped, No configuration found for Control Tower Landing zone`,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
