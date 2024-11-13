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
  ReplacementsConfig,
  SecurityConfig,
  SecurityConfigValidator,
  ReplacementsConfigValidator,
} from '@aws-accelerator/config';
import { createLogger } from '@aws-accelerator/utils/lib/logger';
import { Accelerator } from './accelerator';
import { getReplacementsConfig } from '../utils/app-utils';

const logger = createLogger(['config-validator']);
const configDirPath = process.argv[2];
const homeRegion = GlobalConfig.loadRawGlobalConfig(configDirPath).homeRegion;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const initErrors: { file: string; message: any }[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const configErrors: any[] = [];

const fileNameList = [
  AccountsConfig.FILENAME,
  CustomizationsConfig.FILENAME,
  GlobalConfig.FILENAME,
  IamConfig.FILENAME,
  NetworkConfig.FILENAME,
  OrganizationConfig.FILENAME,
  SecurityConfig.FILENAME,
];

const enableSingleAccountMode = process.env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE']
  ? process.env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE'] === 'true'
  : false;

const regionByRegionDeployOrder = process.env['REGION_BY_REGION_DEPLOYMENT_ORDER'] ?? '';

const props = {
  partition: process.env['PARTITION'] ?? 'aws',
  region: process.env['AWS_REGION'],
  account: process.env['ACCOUNT_ID'],
  enableSingleAccountMode: enableSingleAccountMode,
  replacementsPresent: areReplacementsPresent(),
  regionByRegionDeployOrder,
};

if (configDirPath) {
  logger.info(`Config source directory -  ${configDirPath}`);
  validateConfig(props);
} else {
  logger.info('Config source directory undefined !!!');
}

function areReplacementsPresent() {
  // Matches lookup values excluding account lookups such as {{account Management}}
  // Account lookups do not require existence of replacements-config.yaml file
  const regex = new RegExp('{{(?!.*(account )).*}}');
  let replacementsPresent = false;

  for (const fileName of fileNameList) {
    if (
      fileName === CustomizationsConfig.FILENAME &&
      !fs.existsSync(path.join(configDirPath, CustomizationsConfig.FILENAME))
    ) {
      continue;
    } else {
      replacementsPresent = checkFileForReplacements(regex, fileName);
    }

    if (replacementsPresent) {
      break;
    }
  }
  return replacementsPresent;
}

function checkFileForReplacements(regex: RegExp, fileName: string): boolean {
  let replacementsFound = false;
  const data = fs.readFileSync(path.join(configDirPath, fileName));
  if (regex.test(data.toString())) {
    logger.info(`Found replacement variables in ${fileName}`);
    replacementsFound = true;
  }
  return replacementsFound;
}

async function validateConfig(props: {
  partition: string;
  region: string | undefined;
  enableSingleAccountMode: boolean;
  account: string | undefined;
  replacementsPresent: boolean;
  regionByRegionDeployOrder: string | undefined;
}) {
  await Accelerator.getManagementAccountCredentials(props.partition);
  const orgsEnabled = OrganizationConfig.loadRawOrganizationsConfig(configDirPath).enable;

  // Load accounts config
  let accountsConfig: AccountsConfig | undefined = undefined;
  try {
    accountsConfig = AccountsConfig.load(configDirPath);
    await accountsConfig.loadAccountIds(props.partition, props.enableSingleAccountMode, orgsEnabled, accountsConfig);
  } catch (e) {
    initErrors.push({ file: AccountsConfig.FILENAME, message: e });
  }

  // Load replacements config
  let replacementsConfig: ReplacementsConfig | undefined = undefined;
  try {
    replacementsConfig = getReplacementsConfig(configDirPath, accountsConfig!);
    const isOrgsEnabled = OrganizationConfig.loadRawOrganizationsConfig(configDirPath).enable;
    await replacementsConfig.loadReplacementValues({ region: homeRegion }, isOrgsEnabled);
  } catch (e) {
    initErrors.push({ file: ReplacementsConfig.FILENAME, message: e });
  }

  // Load global config
  let globalConfig: GlobalConfig | undefined = undefined;
  try {
    globalConfig = GlobalConfig.load(configDirPath, replacementsConfig);
  } catch (e) {
    initErrors.push({ file: GlobalConfig.FILENAME, message: e });
  }

  // Load IAM config
  let iamConfig: IamConfig | undefined = undefined;
  try {
    iamConfig = IamConfig.load(configDirPath, replacementsConfig);
  } catch (e) {
    initErrors.push({ file: IamConfig.FILENAME, message: e });
  }

  // Load network config
  let networkConfig: NetworkConfig | undefined = undefined;
  try {
    networkConfig = NetworkConfig.load(configDirPath, replacementsConfig);
  } catch (e) {
    initErrors.push({ file: NetworkConfig.FILENAME, message: e });
  }

  // Load organization config
  let organizationConfig: OrganizationConfig | undefined = undefined;
  try {
    organizationConfig = OrganizationConfig.load(configDirPath, replacementsConfig);
  } catch (e) {
    initErrors.push({ file: OrganizationConfig.FILENAME, message: e });
  }

  // Load security config
  let securityConfig: SecurityConfig | undefined = undefined;
  try {
    securityConfig = SecurityConfig.load(configDirPath, replacementsConfig);
  } catch (e) {
    initErrors.push({ file: SecurityConfig.FILENAME, message: e });
  }

  // Validate optional configuration files if they exist
  let customizationsConfig: CustomizationsConfig | undefined = undefined;
  if (fs.existsSync(path.join(configDirPath, CustomizationsConfig.FILENAME))) {
    try {
      customizationsConfig = CustomizationsConfig.load(configDirPath, replacementsConfig);
    } catch (e) {
      initErrors.push({ file: CustomizationsConfig.FILENAME, message: e });
    }
  }

  //
  // Run config validators
  //
  runValidators(
    configDirPath,
    props.replacementsPresent,
    accountsConfig,
    customizationsConfig,
    globalConfig,
    iamConfig,
    networkConfig,
    organizationConfig,
    securityConfig,
    replacementsConfig,
    props.regionByRegionDeployOrder,
  );

  //
  // Process errors
  //
  processErrors(initErrors, configErrors, globalConfig?.cdkOptions?.skipStaticValidation ?? false);
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
 * @param replacementConfig
 * @param regionByRegionDeployOrder
 */
function runValidators(
  configDirPath: string,
  replacementsPresent: boolean,
  accountsConfig?: AccountsConfig,
  customizationsConfig?: CustomizationsConfig,
  globalConfig?: GlobalConfig,
  iamConfig?: IamConfig,
  networkConfig?: NetworkConfig,
  organizationConfig?: OrganizationConfig,
  securityConfig?: SecurityConfig,
  replacementsConfig?: ReplacementsConfig,
  regionByRegionDeployOrder?: string,
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
  if (
    accountsConfig &&
    customizationsConfig &&
    globalConfig &&
    iamConfig &&
    networkConfig &&
    organizationConfig &&
    securityConfig
  ) {
    try {
      new CustomizationsConfigValidator(
        customizationsConfig,
        accountsConfig,
        globalConfig,
        iamConfig,
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
  if (accountsConfig && globalConfig && iamConfig && organizationConfig && securityConfig) {
    try {
      new GlobalConfigValidator(
        globalConfig,
        accountsConfig,
        iamConfig,
        organizationConfig,
        securityConfig,
        configDirPath,
        regionByRegionDeployOrder,
      );
    } catch (e) {
      configErrors.push(e);
    }
  }

  // IAM config validator
  if (accountsConfig && globalConfig && iamConfig && networkConfig && organizationConfig && securityConfig) {
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
        replacementsConfig,
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
      new OrganizationConfigValidator(organizationConfig, replacementsConfig, configDirPath);
    } catch (e) {
      configErrors.push(e);
    }
  }

  // Security config validator
  if (accountsConfig && globalConfig && organizationConfig && securityConfig) {
    try {
      new SecurityConfigValidator(
        securityConfig,
        accountsConfig,
        globalConfig,
        organizationConfig,
        replacementsConfig,
        configDirPath,
      );
    } catch (e) {
      configErrors.push(e);
    }
  }

  if (replacementsPresent && replacementsConfig) {
    try {
      new ReplacementsConfigValidator(replacementsConfig, configDirPath);
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
function processErrors(initErrors: { file: string; message: any }[], configErrors: any[], skipValidation: boolean) {
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
    if (skipValidation) {
      logger.warn(`Errors found in configuration but ignoring since skipStaticValidation is set to true`);
    } else {
      process.exit(1);
    }
  } else {
    logger.info(`Config file validation successful.`);
  }
}
