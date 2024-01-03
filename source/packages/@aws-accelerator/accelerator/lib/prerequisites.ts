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
import mri from 'mri';
import * as fs from 'fs';
import process from 'process';
import { createLogger, evaluateLimits, getCurrentAccountId } from '@aws-accelerator/utils';
import { AccountsConfig, GlobalConfig, OrganizationConfig } from '@aws-accelerator/config';
import { setGlobalRegion } from './accelerator';

const logger = createLogger(['prerequisites']);

// (async () => {
const usage = `Usage: prerequisites.ts --config-dir CONFIG_DIRECTORY --partition PARTITION [--minimal] [--account ACCOUNT] [--region REGION]`;
/**
 * Config directory is required to pull information about homeRegion, accounts and enabled regions.
 * Partition is required to get account information.
 *
 * When minimal flag is used, the command will check for codebuild and lambda limits in management account for homeRegion and globalRegion only.
 *
 * If minimal flag is not specified, the prerequisites is run for all accounts and all enabled regions.
 * To trigger a specific account in developer mode, users can specify an account and region.
 * This will make it run only in specified account and region.
 *
 * Setting ACCELERATOR_SKIP_PREREQUISITES to true will skip running this code completely.
 */

export function checkPrerequisiteParameters(
  account: string | undefined,
  region: string | undefined,
  minimal: boolean | undefined,
  configDirPath: string,
  partition: string,
) {
  // if minimal, and (account or region) are specified throw error. Installer is standalone
  logger.debug(`Account is: ${account}`);
  logger.debug(`Region is: ${region}`);
  logger.debug(`Installer is: ${minimal}`);
  logger.debug(`Config directory is: ${configDirPath}`);
  logger.debug(`Partition is: ${partition}`);

  if (minimal) {
    logger.debug(`Installer is defined`);
    if (account || region) {
      logger.error(`When minimal is specified, do not specify account or region`);
      throw new Error(usage);
    }
    // minimal is false
  } else {
    if ((!account && region) || (account && !region)) {
      logger.error(`Both account and region must be specified`);
      throw new Error(usage);
    }
  }

  // check if config exists
  logger.debug('Checking config directory');
  if (fs.existsSync(configDirPath)) {
    logger.debug(`Config directory ${configDirPath} exists`);
  } else {
    logger.error(`Invalid --config-dir ${configDirPath}`);
    throw new Error(usage);
  }

  return true;
}
export async function main(
  accountArgs: string | undefined,
  regionArgs: string | undefined,
  minimalArgs: boolean | undefined,
  configDirPathArgs: string,
  partitionArgs: string,
) {
  checkPrerequisiteParameters(accountArgs, regionArgs, minimalArgs, configDirPathArgs, partitionArgs);
  const accountsConfig = AccountsConfig.load(configDirPathArgs);
  const orgsEnabled = OrganizationConfig.loadRawOrganizationsConfig(configDirPathArgs).enable;
  const enableSingleAccountMode = process.env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE']
    ? process.env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE'] === 'true'
    : false;
  await accountsConfig.loadAccountIds(partitionArgs, enableSingleAccountMode, orgsEnabled, accountsConfig);
  const globalConfig = GlobalConfig.loadRawGlobalConfig(configDirPathArgs);
  const allAccounts = accountsConfig.getAccounts(enableSingleAccountMode);
  logger.debug(`All accounts are ${JSON.stringify(allAccounts)}`);

  const enabledRegions = globalConfig.enabledRegions;
  logger.debug(`Enabled regions are ${JSON.stringify(enabledRegions)}`);

  const currentAccountId = await getCurrentAccountId(partitionArgs, globalConfig.homeRegion);
  logger.debug(`Current account id is ${currentAccountId}`);

  if (minimalArgs) {
    // minimal will only check for management account in homeRegion and globalRegion
    const homeRegion = globalConfig.homeRegion;
    const globalRegion = setGlobalRegion(partitionArgs);
    logger.debug(`Checking limits in account ${accountsConfig.getManagementAccountId()} in region ${homeRegion}`);
    await evaluateLimits(
      homeRegion,
      accountsConfig.getManagementAccountId(),
      partitionArgs,
      globalConfig.managementAccountAccessRole,
      currentAccountId,
    );
    logger.debug(`Checking limits in account ${accountsConfig.getManagementAccountId()} in region ${globalRegion}`);
    await evaluateLimits(
      globalRegion,
      accountsConfig.getManagementAccountId(),
      partitionArgs,
      globalConfig.managementAccountAccessRole,
      currentAccountId,
    );
  } else if (accountArgs && regionArgs) {
    // account and region is specified then only check for that account and region
    logger.debug(`Checking limits in account ${accountArgs} in region ${regionArgs}`);
    await evaluateLimits(
      regionArgs,
      accountArgs,
      partitionArgs,
      globalConfig.managementAccountAccessRole,
      currentAccountId,
    );
  } else {
    // check all accounts and all regions
    for (const account of allAccounts) {
      for (const enabledRegion of enabledRegions) {
        const accountId = accountsConfig.getAccountId(account.name);
        logger.debug(`Checking limits in account ${accountId} in region ${enabledRegion}`);
        await evaluateLimits(
          enabledRegion,
          accountId,
          partitionArgs,
          globalConfig.managementAccountAccessRole,
          currentAccountId,
        );
      }
    }
  }
}

(async () => {
  const skipPrerequisites = process.env['ACCELERATOR_SKIP_PREREQUISITES'] ?? 'true';
  logger.debug(`ACCELERATOR_SKIP_PREREQUISITES is ${skipPrerequisites}`);
  if (skipPrerequisites.toLowerCase().trim() === 'true') {
    logger.warn(`Skipping prerequisites since environment variable ACCELERATOR_SKIP_PREREQUISITES was set to true`);
  } else {
    const args = mri(process.argv.slice(2), {
      boolean: ['minimal'],
      string: ['config-dir', 'account', 'region', 'partition'],
    });

    const accountArgs = args['account'];
    const regionArgs = args['region'];
    const minimalArgs = args['minimal'];
    const configDirPathArgs = args['config-dir'];
    const partitionArgs = args['partition'];
    await main(accountArgs, regionArgs, minimalArgs, configDirPathArgs, partitionArgs);
  }
})();
