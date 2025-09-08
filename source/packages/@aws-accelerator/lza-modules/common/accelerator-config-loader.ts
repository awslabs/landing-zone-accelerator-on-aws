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

import {
  AccountsConfig,
  GlobalConfig,
  OrganizationConfig,
  SecurityConfig,
  ReplacementsConfig,
} from '@aws-accelerator/config';
import { AssumeRoleCredentialType } from './resources';

/**
 * Accelerator all configuration types
 */
export type AllConfigType = {
  globalConfig: GlobalConfig;
  organizationConfig: OrganizationConfig;
  accountsConfig: AccountsConfig;
  securityConfig: SecurityConfig;
};

/**
 * AcceleratorConfigLoader an abstract class to load all configuration for module operation
 */
export abstract class AcceleratorConfigLoader {
  /**
   * Function to load accounts config with account Ids
   * @param configDirPath
   * @param partition
   * @param orgsEnabled
   * @param managementAccountCredentials {@link AssumeRoleCredentialType} | undefined
   * @returns accountConfig {@link AccountsConfig}
   */
  public static async getAccountsConfigWithAccountIds(
    configDirPath: string,
    partition: string,
    orgsEnabled: boolean,
    managementAccountCredentials?: AssumeRoleCredentialType,
  ): Promise<AccountsConfig> {
    const accountsConfig = AccountsConfig.load(configDirPath);
    await accountsConfig.loadAccountIds(partition, false, orgsEnabled, accountsConfig, managementAccountCredentials);

    return accountsConfig;
  }

  /**
   * Function to get all configurations
   * @param configDirPath string
   * @param partition string
   * @returns configs {@link AllConfigType}
   */
  public static async getAllConfig(configDirPath: string, partition: string): Promise<AllConfigType> {
    //
    // Get home region
    //
    const homeRegion = GlobalConfig.loadRawGlobalConfig(configDirPath).homeRegion;

    //
    // Get Org enable flag
    //
    const orgsEnabled = OrganizationConfig.loadRawOrganizationsConfig(configDirPath).enable;

    //
    // Get accounts config
    //
    const accountsConfig = await AcceleratorConfigLoader.getAccountsConfigWithAccountIds(
      configDirPath,
      partition,
      orgsEnabled,
    );

    //
    // Get replacement config
    //
    const replacementsConfig = ReplacementsConfig.load(configDirPath, accountsConfig);
    await replacementsConfig.loadDynamicReplacements(homeRegion);

    //
    // Get Global config
    //
    const globalConfig = GlobalConfig.load(configDirPath, replacementsConfig);

    //
    // Get Organization config
    //
    const organizationConfig = OrganizationConfig.load(configDirPath, replacementsConfig);

    //
    // Get Security config
    //
    const securityConfig = SecurityConfig.load(configDirPath, replacementsConfig);

    return {
      globalConfig: globalConfig,
      organizationConfig: organizationConfig,
      accountsConfig: accountsConfig,
      securityConfig: securityConfig,
    };
  }
}
