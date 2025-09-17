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

import { beforeEach, describe, test, vi, expect, afterEach } from 'vitest';

vi.mock('../../../../accelerator', () => ({
  AcceleratorStage: {
    ACCOUNTS: 'ACCOUNTS',
  },
}));

import { AcceleratorModules, ModuleExecutionPhase } from '../../../models/enums';
import { AcceleratorStage } from '../../../../accelerator';
import { ModuleParams } from '../../../models/types';
import {
  MOCK_CONSTANTS,
  mockAccountsConfiguration,
  mockAccountsConfigurationNoAccountIds,
  mockGlobalConfiguration,
} from '../../mocked-resources';
import { AccountsConfig, OrganizationConfig } from '@aws-accelerator/config';
import * as awsLza from '../../../../../@aws-lza/index';
import * as commonFunctions from '../../../../../@aws-lza/common/functions';
import { ManageAccountsAliasModule } from '../../../lib/actions/aws-organizations/manage-accounts-alias';

describe('ManageAccountsAliasModule', () => {
  const status = 'mock status';
  let mockOrganizationConfig: Partial<OrganizationConfig>;

  const createBaseMockAccountsConfig = () => ({
    getManagementAccount: vi.fn().mockReturnValue(MOCK_CONSTANTS.managementAccount),
    getManagementAccountId: vi.fn().mockReturnValue(MOCK_CONSTANTS.managementAccount.name),
    getAuditAccount: vi.fn().mockReturnValue(MOCK_CONSTANTS.auditAccount),
    getAuditAccountId: vi.fn().mockReturnValue(MOCK_CONSTANTS.auditAccount.name),
    getLogArchiveAccount: vi.fn().mockReturnValue(MOCK_CONSTANTS.logArchiveAccount),
    getLogArchiveAccountId: vi.fn().mockReturnValue(MOCK_CONSTANTS.logArchiveAccount.name),
    getAccountId: vi.fn().mockReturnValue('111111111111'),
    getActiveAccountIds: vi.fn().mockReturnValue(['111111111111']),
  });

  const createModuleParams = (accountsConfig: Partial<AccountsConfig>): ModuleParams => ({
    moduleItem: {
      name: AcceleratorModules.MANAGE_ACCOUNTS_ALIAS,
      description: '',
      runOrder: 1,
      handler: vi.fn().mockResolvedValue(`Module 1 of ${AcceleratorStage.ACCOUNTS} stage executed`),
      executionPhase: ModuleExecutionPhase.DEPLOY,
    },
    runnerParameters: MOCK_CONSTANTS.runnerParameters,
    moduleRunnerParameters: {
      configs: {
        ...MOCK_CONSTANTS.configs,
        accountsConfig: accountsConfig as AccountsConfig,
        globalConfig: mockGlobalConfiguration,
        organizationConfig: mockOrganizationConfig as OrganizationConfig,
      },
      globalRegion: MOCK_CONSTANTS.globalRegion,
      resourcePrefixes: MOCK_CONSTANTS.resourcePrefixes,
      acceleratorResourceNames: MOCK_CONSTANTS.acceleratorResourceNames,
      logging: MOCK_CONSTANTS.logging,
      organizationDetails: MOCK_CONSTANTS.organizationDetails,
      organizationAccounts: MOCK_CONSTANTS.organizationAccounts,
      managementAccountCredentials: MOCK_CONSTANTS.credentials,
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(awsLza, 'manageAccountAlias').mockResolvedValue(status);
    vi.spyOn(commonFunctions, 'getCredentials').mockResolvedValue(MOCK_CONSTANTS.credentials);

    mockOrganizationConfig = {
      getIgnoredOus: vi.fn().mockResolvedValue([]),
    };
  });

  test('Should execute successfully with multiple accounts', async () => {
    const mockAccountsConfig = {
      ...createBaseMockAccountsConfig(),
      ...mockAccountsConfiguration,
    };
    const param = createModuleParams(mockAccountsConfig);

    // Execute
    const response = await ManageAccountsAliasModule.execute(param);

    // Verify - mockAccountsConfiguration has 2 accounts with aliases (Management and LogArchive)
    const expectedStatuses = `${status}\n${status}`;
    expect(awsLza.manageAccountAlias).toHaveBeenCalled();
    expect(response).toBe(
      `Module "${AcceleratorModules.MANAGE_ACCOUNTS_ALIAS}" completed successfully with status ${expectedStatuses}`,
    );
  });

  test('Should execute successfully when no accounts have alias', async () => {
    const mockAccountsConfig = {
      ...createBaseMockAccountsConfig(),
      ...mockAccountsConfigurationNoAccountIds,
    };
    const param = createModuleParams(mockAccountsConfig);

    // Execute
    const response = await ManageAccountsAliasModule.execute(param);

    // Verify
    expect(awsLza.manageAccountAlias).toHaveBeenCalledTimes(0);
    expect(response).toBe(
      `Skipping module "${AcceleratorModules.MANAGE_ACCOUNTS_ALIAS}" because no accounts have an alias configured`,
    );
  });

  test('Should filter out inactive accounts', async () => {
    const mockAccountsConfig = {
      ...createBaseMockAccountsConfig(),
      getAccountId: vi
        .fn()
        .mockReturnValueOnce('111111111111') // active account
        .mockReturnValueOnce('222222222222'), // inactive account
      getActiveAccountIds: vi.fn().mockReturnValue(['111111111111']), // only first account is active
      ...mockAccountsConfiguration,
    };

    const param = createModuleParams(mockAccountsConfig);

    // Execute
    await ManageAccountsAliasModule.execute(param);

    // Verify - should only call manageAccountAlias once (for the active account)
    expect(awsLza.manageAccountAlias).toHaveBeenCalledTimes(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
