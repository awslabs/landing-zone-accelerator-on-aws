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
  CustomizationsConfig,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  ReplacementsConfig,
  SecurityConfig,
} from '@aws-accelerator/config';

import * as fs from 'fs';
import * as path from 'path';

import { AcceleratorResourcePrefixes } from '../../accelerator/utils/app-utils';

import { IAssumeRoleCredential } from '../../../@aws-lza/common/resources';
import { AcceleratorConfigurationsType } from '../models/types';

/**
 * Accelerator ConfigLoader an abstract class to load all configuration for module operation
 */
export abstract class ConfigLoader {
  /**
   * Function to validate config directory and presence of mandatory files
   * @param configDirPath
   */
  public static validateConfigDirPath(configDirPath: string): void {
    if (!fs.existsSync(configDirPath)) {
      throw new Error(`Invalid config directory path !!! "${configDirPath}" not found`);
    }

    const mandatoryConfigFiles: string[] = [
      'accounts-config.yaml',
      'global-config.yaml',
      'iam-config.yaml',
      'network-config.yaml',
      'organization-config.yaml',
      'security-config.yaml',
    ];

    const files = fs.readdirSync(configDirPath);
    const missingFiles = mandatoryConfigFiles.filter(item => !files.includes(item));

    if (missingFiles.length > 0) {
      throw new Error(
        `Missing mandatory configuration files in ${configDirPath}. \n Missing files are ${missingFiles.join(',')}`,
      );
    }
  }

  /**
   * Function to load accounts config with account Ids
   * @param configDirPath
   * @param partition
   * @param orgsEnabled
   * @param managementAccountCredentials {@link IAssumeRoleCredential} | undefined
   * @returns accountConfig {@link AccountsConfig}
   */
  public static async getAccountsConfigWithAccountIds(
    configDirPath: string,
    partition: string,
    orgsEnabled: boolean,
    managementAccountCredentials?: IAssumeRoleCredential,
  ): Promise<AccountsConfig> {
    const accountsConfig = AccountsConfig.load(configDirPath);
    await accountsConfig.loadAccountIds(
      partition,
      false,
      orgsEnabled,
      accountsConfig,
      managementAccountCredentials as AWS.Credentials,
    );

    return accountsConfig;
  }

  /**
   * Function to get accelerator configurations from config directory path
   *
   * @description
   * This function will load following configurations
   * - AccountsConfig {@link AccountsConfig}
   * - CustomizationsConfig {@link CustomizationsConfig}
   * - GlobalConfig {@link GlobalConfig}
   * - IamConfig {@link IamConfig}
   * - NetworkConfig {@link NetworkConfig}
   * - OrganizationConfig {@link OrganizationConfig}
   * - ReplacementsConfig {@link ReplacementsConfig}
   * - SecurityConfig {@link SecurityConfig}
   * @param partition string
   * @param configDirPath string
   * @param resourcePrefixes {@link AcceleratorResourcePrefixes}
   * @param managementAccountCredentials {@link IAssumeRoleCredential} | undefined
   * @returns configs {@link AcceleratorConfigurationsType}
   */
  public static async getAcceleratorConfigurations(
    partition: string,
    configDirPath: string,
    resourcePrefixes: AcceleratorResourcePrefixes,
    managementAccountCredentials?: IAssumeRoleCredential,
  ): Promise<AcceleratorConfigurationsType> {
    //
    // Validate config directory path
    //
    ConfigLoader.validateConfigDirPath(configDirPath);

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
    const accountsConfig = await ConfigLoader.getAccountsConfigWithAccountIds(
      configDirPath,
      partition,
      orgsEnabled,
      managementAccountCredentials,
    );

    //
    // Get replacement config
    //
    const replacementsConfig = ConfigLoader.getReplacementsConfig(configDirPath, accountsConfig);
    replacementsConfig.loadReplacementValues(
      { region: homeRegion },
      orgsEnabled,
      managementAccountCredentials as AWS.Credentials,
    );

    //
    // Get Global config
    //
    const globalConfig = GlobalConfig.load(configDirPath, replacementsConfig);

    //
    // Get Organization config
    //
    const organizationConfig = OrganizationConfig.load(configDirPath, replacementsConfig);
    await organizationConfig.loadOrganizationalUnitIds(partition, managementAccountCredentials as AWS.Credentials);

    //
    // Load global config external mapping details
    //
    if (globalConfig.externalLandingZoneResources?.importExternalLandingZoneResources) {
      await globalConfig.loadExternalMapping(accountsConfig);
      await globalConfig.loadLzaResources(partition, resourcePrefixes.ssmParamName);
    }

    //
    // Get Network config
    //
    const networkConfig = NetworkConfig.load(configDirPath, replacementsConfig);

    //
    // Get Security config
    //
    const securityConfig = SecurityConfig.load(configDirPath, replacementsConfig);

    //
    // Get IAM config
    //
    const iamConfig = IamConfig.load(configDirPath, replacementsConfig);

    //
    // Get Customization config
    //
    let customizationsConfig = new CustomizationsConfig();

    if (fs.existsSync(`${configDirPath}/${CustomizationsConfig.FILENAME}`)) {
      customizationsConfig = CustomizationsConfig.load(configDirPath, replacementsConfig);
    }

    return {
      accountsConfig,
      customizationsConfig,
      globalConfig,
      iamConfig,
      networkConfig,
      organizationConfig,
      replacementsConfig,
      securityConfig,
    };
  }

  /**
   * Get replacementsConfig object
   * @param configDirPath string
   * @param accountsConfig {@link AccountsConfig}
   * @returns
   */
  private static getReplacementsConfig(configDirPath: string, accountsConfig: AccountsConfig): ReplacementsConfig {
    let replacementsConfig: ReplacementsConfig;

    // Create empty replacementsConfig if optional configuration file does not exist
    if (fs.existsSync(path.join(configDirPath, ReplacementsConfig.FILENAME))) {
      replacementsConfig = ReplacementsConfig.load(configDirPath, accountsConfig);
    } else {
      replacementsConfig = new ReplacementsConfig(undefined, accountsConfig);
    }
    return replacementsConfig;
  }
}
