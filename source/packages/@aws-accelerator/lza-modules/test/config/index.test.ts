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

import { beforeEach, describe, expect, test } from '@jest/globals';
import { LzaConfiguration, LzaConfigurationProps } from '../../lib/config/index';
import * as functions from '../../lib/config/functions';
import { AcceleratorConfigLoader } from '../../lib/config/accelerator-config-loader';
import { getGlobalRegion } from '@aws-accelerator/utils/lib/common-functions';
import { Account } from '@aws-sdk/client-organizations';

//
// Mock Dependencies
//
jest.mock('../../lib/config/functions');
jest.mock('../../lib/config/accelerator-config-loader');
jest.mock('@aws-accelerator/utils/lib/common-functions');

//
// Mock constants
//
const MOCK_CONSTANTS = {
  lzaConfigurationProps: {
    partition: 'aws',
    region: 'us-west-2',
    prefix: 'AWSAccelerator',
    configDirPath: '/path/to/config',
    useExistingRole: false,
  } as LzaConfigurationProps,

  credentials: {
    accessKeyId: 'mockAccessKeyId',
    secretAccessKey: 'mockSecretAccessKey',
  },

  accounts: [
    { Id: '123456789012', Name: 'Account1' },
    { Id: '210987654321', Name: 'Account2' },
  ] as Account[],

  organization: {
    Id: 'o-abcdef123456',
    MasterAccountId: '123456789012',
    MasterAccountEmail: 'master@example.com',
  },

  allConfigs: {
    organizationConfig: {
      enable: true,
    },
  },
  globalRegion: 'us-east-1',
  solutionId: 'AwsSolution/SO0199/',
};

describe('LzaConfiguration', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (functions.validateConfigDirPath as jest.Mock).mockImplementation(() => undefined);
    (functions.getManagementAccountCredentials as jest.Mock).mockResolvedValue(MOCK_CONSTANTS.credentials);
    (functions.getOrganizationAccounts as jest.Mock).mockResolvedValue(MOCK_CONSTANTS.accounts);
    (functions.getOrganizationDetails as jest.Mock).mockResolvedValue(MOCK_CONSTANTS.organization);
    (AcceleratorConfigLoader.getAllConfig as jest.Mock).mockResolvedValue(MOCK_CONSTANTS.allConfigs);
    (getGlobalRegion as jest.Mock).mockReturnValue(MOCK_CONSTANTS.globalRegion);
  });

  test('should return the correct configuration', async () => {
    const result = await LzaConfiguration.getConfiguration(MOCK_CONSTANTS.lzaConfigurationProps);

    expect(result).toEqual({
      configDirPath: MOCK_CONSTANTS.lzaConfigurationProps.configDirPath,
      partition: MOCK_CONSTANTS.lzaConfigurationProps.partition,
      region: MOCK_CONSTANTS.lzaConfigurationProps.region,
      acceleratorPrefix: MOCK_CONSTANTS.lzaConfigurationProps.prefix,
      useExistingRole: MOCK_CONSTANTS.lzaConfigurationProps.useExistingRole,
      solutionId: expect.stringContaining(MOCK_CONSTANTS.solutionId),
      allConfigs: MOCK_CONSTANTS.allConfigs,
      organizationAccounts: MOCK_CONSTANTS.accounts,
      awsOrganization: MOCK_CONSTANTS.organization,
      managementAccountCredentials: MOCK_CONSTANTS.credentials,
    });

    expect(functions.validateConfigDirPath).toHaveBeenCalledWith(MOCK_CONSTANTS.lzaConfigurationProps.configDirPath);
    expect(functions.getManagementAccountCredentials).toHaveBeenCalledWith(
      MOCK_CONSTANTS.lzaConfigurationProps.partition,
      MOCK_CONSTANTS.lzaConfigurationProps.region,
      expect.stringContaining(MOCK_CONSTANTS.solutionId),
    );
    expect(AcceleratorConfigLoader.getAllConfig).toHaveBeenCalledWith(
      MOCK_CONSTANTS.lzaConfigurationProps.configDirPath,
      MOCK_CONSTANTS.lzaConfigurationProps.partition,
      MOCK_CONSTANTS.lzaConfigurationProps.prefix,
      expect.stringContaining(MOCK_CONSTANTS.solutionId),
      MOCK_CONSTANTS.credentials,
    );
    expect(getGlobalRegion).toHaveBeenCalledWith(MOCK_CONSTANTS.lzaConfigurationProps.partition);
    expect(functions.getOrganizationAccounts).toHaveBeenCalledWith(
      MOCK_CONSTANTS.globalRegion,
      expect.stringContaining(MOCK_CONSTANTS.solutionId),
      MOCK_CONSTANTS.credentials,
    );
    expect(functions.getOrganizationDetails).toHaveBeenCalledWith(
      MOCK_CONSTANTS.globalRegion,
      expect.stringContaining(MOCK_CONSTANTS.solutionId),
      MOCK_CONSTANTS.credentials,
    );
  });

  test('should throw an error if AWS Organizations is not configured but enabled in config', async () => {
    (functions.getOrganizationDetails as jest.Mock).mockResolvedValue(null);

    await expect(LzaConfiguration.getConfiguration(MOCK_CONSTANTS.lzaConfigurationProps)).rejects.toThrow(
      'AWS Organizations not configured but organization is enabled in organization-config.yaml file !!!',
    );
  });

  test('should not fetch organization accounts if organization is disabled in config', async () => {
    const disabledOrgConfig = {
      ...MOCK_CONSTANTS.allConfigs,
      organizationConfig: { enable: false },
    };
    (AcceleratorConfigLoader.getAllConfig as jest.Mock).mockResolvedValue(disabledOrgConfig);

    await LzaConfiguration.getConfiguration(MOCK_CONSTANTS.lzaConfigurationProps);

    expect(functions.getOrganizationAccounts).not.toHaveBeenCalled();
  });
});
