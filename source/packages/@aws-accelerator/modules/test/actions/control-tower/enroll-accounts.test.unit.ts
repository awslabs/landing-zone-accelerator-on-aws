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
import { EnrollAccountsModule } from '../../../lib/actions/control-tower/enroll-accounts';
import { AcceleratorModules, ModuleExecutionPhase } from '../../../models/enums';
import { AcceleratorStage } from '../../../../accelerator';
import { ModuleParams } from '../../../models/types';
import {
  MOCK_CONSTANTS,
  mockAccountsConfiguration,
  mockGlobalConfiguration,
  mockGlobalConfigurationWithOutControlTower,
} from '../../mocked-resources';
import { AccountsConfig, OrganizationConfig, OrganizationalUnitConfig } from '@aws-accelerator/config';
import * as awsLza from '../../../../../@aws-lza/index';

describe('EnrollAccountsModule', () => {
  const mockAccountsConfig = { ...mockAccountsConfiguration } as AccountsConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(awsLza, 'enrollAccounts').mockResolvedValue('Successful');
  });

  function makeOrganizationConfig(overrides: {
    organizationalUnits: (Partial<OrganizationalUnitConfig> & { name: string })[];
    organizationalUnitIds?: { name: string; id: string; arn: string }[];
  }): OrganizationConfig {
    const organizationalUnits = overrides.organizationalUnits as OrganizationalUnitConfig[];
    return {
      enable: true,
      organizationalUnits,
      organizationalUnitIds: overrides.organizationalUnitIds,
      getIgnoredOus(): OrganizationalUnitConfig[] {
        return organizationalUnits.filter(ou => ou.ignore);
      },
    } as unknown as OrganizationConfig;
  }

  function makeModuleParams(organizationConfig?: OrganizationConfig): ModuleParams {
    return {
      moduleItem: {
        name: AcceleratorModules.ENROLL_ACCOUNTS,
        description: '',
        runOrder: 1,
        handler: vi.fn().mockResolvedValue(`Module 1 of ${AcceleratorStage.ACCOUNTS} stage executed`),
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      runnerParameters: MOCK_CONSTANTS.runnerParameters,
      moduleRunnerParameters: {
        configs: {
          ...MOCK_CONSTANTS.configs,
          accountsConfig: mockAccountsConfig,
          organizationConfig: organizationConfig ?? (MOCK_CONSTANTS.configs.organizationConfig as OrganizationConfig),
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
  }

  test('should pass resolved ignored OU ARNs to enrollAccounts configuration', async () => {
    const organizationConfig = makeOrganizationConfig({
      organizationalUnits: [{ name: 'Security' }, { name: 'Infrastructure' }, { name: 'Suspended', ignore: true }],
      organizationalUnitIds: [
        { name: 'Security', id: 'ou-1111-aaaaaaaa', arn: 'arn:aws:organizations::123:ou/o-x/ou-1111-aaaaaaaa' },
        { name: 'Infrastructure', id: 'ou-2222-bbbbbbbb', arn: 'arn:aws:organizations::123:ou/o-x/ou-2222-bbbbbbbb' },
        { name: 'Suspended', id: 'ou-3333-cccccccc', arn: 'arn:aws:organizations::123:ou/o-x/ou-3333-cccccccc' },
      ],
    });

    const response = await EnrollAccountsModule.execute(makeModuleParams(organizationConfig));

    expect(awsLza.enrollAccounts).toHaveBeenCalledTimes(1);
    expect(awsLza.enrollAccounts).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'enroll-accounts',
        configuration: { ignoredOuArns: ['arn:aws:organizations::123:ou/o-x/ou-3333-cccccccc'] },
      }),
    );
    expect(response).toBe(
      `Module "${AcceleratorModules.ENROLL_ACCOUNTS}" completed successfully with status: Successful`,
    );
  });

  test('should only include explicitly ignored OU ARNs and not inherit to descendants', async () => {
    const organizationConfig = makeOrganizationConfig({
      organizationalUnits: [
        { name: 'Security' },
        { name: 'Suspended', ignore: true },
        { name: 'Suspended/Archived' },
        { name: 'Suspended/Archived/Legacy' },
      ],
      organizationalUnitIds: [
        { name: 'Security', id: 'ou-1111-aaaaaaaa', arn: 'arn:aws:organizations::123:ou/o-x/ou-1111-aaaaaaaa' },
        { name: 'Suspended', id: 'ou-3333-cccccccc', arn: 'arn:aws:organizations::123:ou/o-x/ou-3333-cccccccc' },
        {
          name: 'Suspended/Archived',
          id: 'ou-4444-dddddddd',
          arn: 'arn:aws:organizations::123:ou/o-x/ou-4444-dddddddd',
        },
        {
          name: 'Suspended/Archived/Legacy',
          id: 'ou-5555-eeeeeeee',
          arn: 'arn:aws:organizations::123:ou/o-x/ou-5555-eeeeeeee',
        },
      ],
    });

    await EnrollAccountsModule.execute(makeModuleParams(organizationConfig));

    expect(awsLza.enrollAccounts).toHaveBeenCalledWith(
      expect.objectContaining({
        configuration: {
          ignoredOuArns: ['arn:aws:organizations::123:ou/o-x/ou-3333-cccccccc'],
        },
      }),
    );
  });

  test('should pass empty ignoredOuArns when no OUs are marked ignore', async () => {
    const organizationConfig = makeOrganizationConfig({
      organizationalUnits: [{ name: 'Security' }, { name: 'Infrastructure' }],
      organizationalUnitIds: [
        { name: 'Security', id: 'ou-1111-aaaaaaaa', arn: 'arn:aws:organizations::123:ou/o-x/ou-1111-aaaaaaaa' },
        { name: 'Infrastructure', id: 'ou-2222-bbbbbbbb', arn: 'arn:aws:organizations::123:ou/o-x/ou-2222-bbbbbbbb' },
      ],
    });

    await EnrollAccountsModule.execute(makeModuleParams(organizationConfig));

    expect(awsLza.enrollAccounts).toHaveBeenCalledWith(
      expect.objectContaining({
        configuration: { ignoredOuArns: [] },
      }),
    );
  });

  test('should warn and skip ignored OU when organizationalUnitIds entry is missing', async () => {
    const organizationConfig = makeOrganizationConfig({
      organizationalUnits: [{ name: 'Suspended', ignore: true }],
      organizationalUnitIds: [],
    });

    await EnrollAccountsModule.execute(makeModuleParams(organizationConfig));

    expect(awsLza.enrollAccounts).toHaveBeenCalledWith(
      expect.objectContaining({
        configuration: { ignoredOuArns: [] },
      }),
    );
  });

  test('should skip execution when no landing zone configuration found', async () => {
    const param: ModuleParams = {
      ...makeModuleParams(),
      moduleRunnerParameters: {
        ...makeModuleParams().moduleRunnerParameters,
        configs: {
          ...makeModuleParams().moduleRunnerParameters.configs,
          globalConfig: mockGlobalConfigurationWithOutControlTower,
        },
      },
    };

    const response = await EnrollAccountsModule.execute(param);

    expect(awsLza.enrollAccounts).toHaveBeenCalledTimes(0);
    expect(response).toBe(
      `Module "${AcceleratorModules.ENROLL_ACCOUNTS}" execution skipped, Control Tower Landing zone is not enabled for the environment.`,
    );
  });
});
