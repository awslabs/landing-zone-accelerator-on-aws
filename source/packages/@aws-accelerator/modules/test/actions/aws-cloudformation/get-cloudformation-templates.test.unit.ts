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

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AcceleratorModules, ModuleExecutionPhase } from '../../../models/enums';
import { AcceleratorStage } from '../../../../accelerator';
import { ModuleParams } from '../../../models/types';
import {
  MOCK_CONSTANTS,
  mockAccountsConfiguration,
  mockGlobalConfiguration,
  mockOrganizationConfig,
} from '../../mocked-resources';
import { AccountsConfig, GlobalConfig, OrganizationConfig } from '@aws-accelerator/config';
import * as awsLza from '../../../../../@aws-lza/index';
import { GetCloudFormationTemplatesModule } from '../../../lib/actions/aws-cloudformation/get-cloudformation-templates';

describe('GetCloudFormationTemplatesModule', () => {
  let mockAccountsConfig: Partial<AccountsConfig>;
  let mockOrgConfig: Partial<OrganizationConfig>;
  let mockGlobalConfig: Partial<GlobalConfig>;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(awsLza, 'getCloudFormationTemplates').mockResolvedValue(
      `Module ${AcceleratorModules.GET_CLOUDFORMATION_TEMPLATES} executed successfully`,
    );

    mockOrgConfig = {
      ...mockOrganizationConfig,
      getIgnoredOus: vi.fn().mockReturnValue([]),
    };

    mockAccountsConfig = {
      getManagementAccountId: vi.fn().mockReturnValue('111111111111'),
      getActiveAccountIds: vi.fn().mockReturnValue(['111111111111', '222222222222']),
      ...mockAccountsConfiguration,
    };

    mockGlobalConfig = {
      ...mockGlobalConfiguration,
      enabledRegions: ['us-east-2', 'us-east-1'],
      useV2Stacks: true,
    };
  });

  test('Should execute successfully', async () => {
    // Setup
    const param: ModuleParams = {
      moduleItem: {
        name: AcceleratorModules.GET_CLOUDFORMATION_TEMPLATES,
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
          globalConfig: mockGlobalConfig as GlobalConfig,
          organizationConfig: mockOrgConfig as OrganizationConfig,
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
    await GetCloudFormationTemplatesModule.execute(param);

    // Verify
    expect(awsLza.getCloudFormationTemplates).toHaveBeenCalledWith(
      expect.objectContaining({
        configuration: expect.objectContaining({
          acceleratorEnvironments: [
            { accountId: '111111111111', region: 'us-east-2' },
            { accountId: '111111111111', region: 'us-east-1' },
            { accountId: '222222222222', region: 'us-east-2' },
            { accountId: '222222222222', region: 'us-east-1' },
          ],
        }),
      }),
    );
  });

  test('Should skip execution if global config useV2Stacks disabled', async () => {
    // Setup
    const param: ModuleParams = {
      moduleItem: {
        name: AcceleratorModules.GET_CLOUDFORMATION_TEMPLATES,
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
          globalConfig: {
            ...mockGlobalConfig,
            useV2Stacks: false,
          } as GlobalConfig,
          organizationConfig: mockOrgConfig as OrganizationConfig,
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
    const response = await GetCloudFormationTemplatesModule.execute(param);

    // Verify
    expect(awsLza.getCloudFormationTemplates).not.toHaveBeenCalled();
    expect(response).toEqual(
      `Module "${AcceleratorModules.GET_CLOUDFORMATION_TEMPLATES}" did not execute. Configuration option not set.`,
    );
  });

  test('Should skip execution if global config useV2Stacks not set', async () => {
    // Setup
    const param: ModuleParams = {
      moduleItem: {
        name: AcceleratorModules.GET_CLOUDFORMATION_TEMPLATES,
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
          globalConfig: {
            ...mockGlobalConfig,
            useV2Stacks: undefined,
          } as GlobalConfig,
          organizationConfig: mockOrgConfig as OrganizationConfig,
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
    const response = await GetCloudFormationTemplatesModule.execute(param);

    // Verify
    expect(awsLza.getCloudFormationTemplates).not.toHaveBeenCalled();
    expect(response).toEqual(
      `Module "${AcceleratorModules.GET_CLOUDFORMATION_TEMPLATES}" did not execute. Configuration option not set.`,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
