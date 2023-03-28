/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import * as fs from 'fs';
import * as path from 'path';

import {
  AccountsConfig,
  AccountsConfigValidator,
  CustomizationsConfig,
  CustomizationsConfigValidator,
  GlobalConfig,
  GlobalConfigValidator,
  IamConfig,
  IamConfigValidator,
  NetworkConfig,
  NetworkConfigValidator,
  OrganizationConfig,
  OrganizationConfigValidator,
  SecurityConfig,
  SecurityConfigValidator,
} from '@aws-accelerator/config';
import { createLogger } from '@aws-accelerator/utils';

const logger = createLogger(['config-validator']);
const configDirPath = process.argv[2];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const initErrors: { file: string; message: any }[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const configErrors: any[] = [];

if (configDirPath) {
  logger.info(`Config source directory -  ${configDirPath}`);

  // Load accounts config
  let accountsConfig: AccountsConfig | undefined = undefined;
  try {
    accountsConfig = AccountsConfig.load(configDirPath);
  } catch (e) {
    initErrors.push({ file: 'accounts-config.yaml', message: e });
  }

  // Load global config
  let globalConfig: GlobalConfig | undefined = undefined;
  try {
    globalConfig = GlobalConfig.load(configDirPath);
  } catch (e) {
    initErrors.push({ file: 'global-config.yaml', message: e });
  }

  // Load IAM config
  let iamConfig: IamConfig | undefined = undefined;
  try {
    iamConfig = IamConfig.load(configDirPath);
  } catch (e) {
    initErrors.push({ file: 'iam-config.yaml', message: e });
  }

  // Load network config
  let networkConfig: NetworkConfig | undefined = undefined;
  try {
    networkConfig = NetworkConfig.load(configDirPath);
  } catch (e) {
    initErrors.push({ file: 'network-config.yaml', message: e });
  }

  // Load organization config
  let organizationConfig: OrganizationConfig | undefined = undefined;
  try {
    organizationConfig = OrganizationConfig.load(configDirPath);
  } catch (e) {
    initErrors.push({ file: 'organization-config.yaml', message: e });
  }

  // Load security config
  let securityConfig: SecurityConfig | undefined = undefined;
  try {
    securityConfig = SecurityConfig.load(configDirPath);
  } catch (e) {
    initErrors.push({ file: 'security-config.yaml', message: e });
  }

  // Validate optional configuration files if they exist
  let customizationsConfig: CustomizationsConfig | undefined = undefined;
  if (fs.existsSync(path.join(configDirPath, 'customizations-config.yaml'))) {
    try {
      customizationsConfig = CustomizationsConfig.load(configDirPath);
    } catch (e) {
      initErrors.push({ file: 'customizations-config.yaml', message: e });
    }
  }

  //
  // Run config validators
  //
  runValidators(
    configDirPath,
    accountsConfig,
    customizationsConfig,
    globalConfig,
    iamConfig,
    networkConfig,
    organizationConfig,
    securityConfig,
  );

  //
  // Process errors
  //
  processErrors(initErrors, configErrors);
} else {
  logger.info('Config source directory undefined !!!');
}

/**
 * Run config validation classes
 * @param configDirPath
 * @param accountsConfig
 * @param globalConfig
 * @param networkConfig
 * @param iamConfig
 * @param organizationConfig
 * @param securityConfig
 */
function runValidators(
  configDirPath: string,
  accountsConfig?: AccountsConfig,
  customizationsConfig?: CustomizationsConfig,
  globalConfig?: GlobalConfig,
  iamConfig?: IamConfig,
  networkConfig?: NetworkConfig,
  organizationConfig?: OrganizationConfig,
  securityConfig?: SecurityConfig,
) {
  // Accounts config validator
  if (accountsConfig && organizationConfig) {
    try {
      new AccountsConfigValidator(accountsConfig, organizationConfig);
    } catch (e) {
      configErrors.push(e);
    }
  }

  // Customizations config validator
  if (accountsConfig && customizationsConfig && globalConfig && networkConfig && organizationConfig && securityConfig) {
    try {
      new CustomizationsConfigValidator(
        customizationsConfig,
        accountsConfig,
        globalConfig,
        networkConfig,
        organizationConfig,
        securityConfig,
        configDirPath,
      );
    } catch (e) {
      configErrors.push(e);
    }
  }

  // Global config validator
  if (accountsConfig && globalConfig && iamConfig && organizationConfig) {
    try {
      new GlobalConfigValidator(globalConfig, accountsConfig, iamConfig, organizationConfig, configDirPath);
    } catch (e) {
      configErrors.push(e);
    }
  }

  // IAM config validator
  if (accountsConfig && iamConfig && networkConfig && organizationConfig && securityConfig) {
    try {
      new IamConfigValidator(
        iamConfig,
        accountsConfig,
        networkConfig,
        organizationConfig,
        securityConfig,
        configDirPath,
      );
    } catch (e) {
      configErrors.push(e);
    }
  }

  // Network config validator
  if (accountsConfig && globalConfig && networkConfig && organizationConfig && securityConfig) {
    try {
      new NetworkConfigValidator(
        networkConfig,
        accountsConfig,
        globalConfig,
        organizationConfig,
        securityConfig,
        configDirPath,
        customizationsConfig,
      );
    } catch (e) {
      configErrors.push(e);
    }
  }

  // Organization config validator
  if (organizationConfig) {
    try {
      new OrganizationConfigValidator(organizationConfig, configDirPath);
    } catch (e) {
      configErrors.push(e);
    }
  }

  // Security config validator
  if (accountsConfig && globalConfig && organizationConfig && securityConfig) {
    try {
      new SecurityConfigValidator(securityConfig, accountsConfig, globalConfig, organizationConfig, configDirPath);
    } catch (e) {
      configErrors.push(e);
    }
  }
}

/**
 * Process errors encountered during validation
 * @param initErrors
 * @param configErrors
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function processErrors(initErrors: { file: string; message: any }[], configErrors: any[]) {
  if (initErrors.length > 0 || configErrors.length > 0) {
    logger.warn(`Config file validation failed !!!`);
    // Process initial file load errors
    initErrors.forEach(initItem => {
      logger.warn(`${initItem.message} in ${initItem.file} config file`);
    });
    // Process config validation errors
    configErrors.forEach(configItem => {
      logger.warn(configItem);
    });
    // Exit with error code
    process.exit(1);
  } else {
    logger.info(`Config file validation successful.`);
  }
}
