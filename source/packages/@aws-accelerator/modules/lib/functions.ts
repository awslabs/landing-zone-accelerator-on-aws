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

import { pascalCase } from 'pascal-case';
import path from 'path';
import yargs from 'yargs';
import { version } from '../../../../package.json';
import {
  AcceleratorEnvironmentDetailsType,
  AcceleratorModuleRunnerParametersType,
  RunnerParametersType,
} from '../models/types';
import { createLogger } from '../../../@aws-lza/common/logger';
import { IAssumeRoleCredential } from '../../../@aws-lza/common/resources';
import { getCredentials, setRetryStrategy } from '../../../@aws-lza/common/functions';
import {
  Account,
  AWSOrganizationsNotInUseException,
  DescribeOrganizationCommand,
  Organization,
  OrganizationsClient,
  paginateListAccounts,
} from '@aws-sdk/client-organizations';
import { throttlingBackOff } from '../../../@aws-lza/common/throttle';
import { AcceleratorResourcePrefixes } from '../../accelerator/utils/app-utils';
import { AcceleratorResourceNames } from '../../accelerator/lib/accelerator-resource-names';
import { getGlobalRegion } from '@aws-accelerator/utils/lib/common-functions';
import { GlobalConfig } from '@aws-accelerator/config/lib/global-config';
import { AccountsConfig } from '@aws-accelerator/config/lib/accounts-config';
import { GetParameterCommand, ParameterNotFound, SSMClient } from '@aws-sdk/client-ssm';
import { ConfigLoader } from './config-loader';
import { AcceleratorModuleStageOrders, EXECUTION_CONTROLLABLE_MODULES } from '../models/constants';
import { ModuleExecutionPhase } from '../models/enums';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Module runner command with option to execute the command.
 */
export const scriptUsage =
  'Usage: yarn run ts-node packages/@aws-accelerator/modules/bin/runner.ts --partition <PARTITION> --account-id <ACCOUNT_ID> --region <REGION> --config-dir <CONFIG_DIR_PATH> --stage <PIPELINE_STAGE_NAME> [--prefix <ACCELERATOR_PREFIX> --use-existing-roles --dry-run]';

/**
 * Function to validate and get runner parameters
 * @returns
 */
export function validateAndGetRunnerParameters(): RunnerParametersType {
  const argv = yargs(process.argv.slice(2))
    .options({
      partition: { type: 'string', default: undefined },
      region: { type: 'string', default: undefined },
      prefix: { type: 'string', default: undefined },
      'config-dir': { type: 'string', default: undefined },
      stage: { type: 'string', default: undefined },
      'use-existing-roles': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    })
    .parseSync();

  if (!argv.partition || !argv.region || !argv['config-dir']) {
    throw new Error(`Missing required parameters for lza module \n ** Script Usage ** ${scriptUsage}`);
  }

  const useExistingRoles = Boolean(argv['use-existing-roles']);
  const dryRun = Boolean(argv['dry-run']);

  return {
    partition: argv.partition,
    region: argv.region,
    configDirPath: argv['config-dir'],
    stage: argv.stage,
    prefix: argv.prefix ?? 'AWSAccelerator',
    useExistingRoles,
    solutionId: `AwsSolution/SO0199/${version}`,
    dryRun,
  };
}

/**
 * Function to get management account credential.
 *
 * @remarks
 * When solution deployed from external account management account credential will be provided
 * @param partition string
 * @param region string
 * @param solutionId string
 * @returns credential {@IAssumeRoleCredential} | undefined
 */
export async function getManagementAccountCredentials(
  partition: string,
  region: string,
  solutionId: string,
): Promise<IAssumeRoleCredential | undefined> {
  if (process.env['MANAGEMENT_ACCOUNT_ID'] && process.env['MANAGEMENT_ACCOUNT_ROLE_NAME']) {
    logger.info('set management account credentials');
    logger.info(`managementAccountId => ${process.env['MANAGEMENT_ACCOUNT_ID']}`);
    logger.info(`management account role name => ${process.env['MANAGEMENT_ACCOUNT_ROLE_NAME']}`);

    const assumeRoleArn = `arn:${partition}:iam::${process.env['MANAGEMENT_ACCOUNT_ID']}:role/${process.env['MANAGEMENT_ACCOUNT_ROLE_NAME']}`;

    return getCredentials({
      accountId: process.env['MANAGEMENT_ACCOUNT_ID'],
      region,
      solutionId,
      assumeRoleArn,
      sessionName: 'ManagementAccountCredentials',
    });
  }

  return undefined;
}

/**
 * Function to retrieve AWS organizations accounts
 * @param globalRegion string
 * @param solutionId string
 * @param managementAccountCredentials {@link IAssumeRoleCredential}
 * @returns accounts {@link Account}[]
 */
export async function getOrganizationAccounts(
  globalRegion: string,
  solutionId: string,
  managementAccountCredentials?: IAssumeRoleCredential,
): Promise<Account[]> {
  const client = new OrganizationsClient({
    region: globalRegion,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
    credentials: managementAccountCredentials,
  });
  const organizationAccounts: Account[] = [];
  const paginator = paginateListAccounts({ client }, {});
  for await (const page of paginator) {
    organizationAccounts.push(...(page.Accounts ?? []));
  }
  return organizationAccounts;
}

/**
 * Function to retrieve AWS organizations details
 * @param globalRegion string
 * @param solutionId string
 * @param managementAccountCredentials {@link IAssumeRoleCredential}
 * @returns accounts {@link Account}[]
 */
export async function getOrganizationDetails(
  globalRegion: string,
  solutionId: string,
  managementAccountCredentials?: IAssumeRoleCredential,
): Promise<Organization | undefined> {
  const client = new OrganizationsClient({
    region: globalRegion,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
    credentials: managementAccountCredentials,
  });
  try {
    const response = await throttlingBackOff(() => client.send(new DescribeOrganizationCommand({})));

    if (!response.Organization) {
      throw new Error(`Aws Organization couldn't fetch organizations details`);
    }
    return response.Organization;
  } catch (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    e: any
  ) {
    if (e instanceof AWSOrganizationsNotInUseException) {
      logger.warn(`AWS Organizations is not configured !!!`);
      return undefined;
    }
    throw e;
  }
}

/**
 * Function to get accelerator module runner parameters
 * @param configDirPath string
 * @param partition string
 * @param resourcePrefixes {@link AcceleratorResourcePrefixes}
 * @param solutionId string
 * @param managementAccountCredentials {@link IAssumeRoleCredential} | undefined
 * @returns configs {@link AcceleratorModuleRunnerParametersType}
 */
export async function getAcceleratorModuleRunnerParameters(
  configDirPath: string,
  partition: string,
  resourcePrefixes: AcceleratorResourcePrefixes,
  solutionId: string,
  managementAccountCredentials?: IAssumeRoleCredential,
): Promise<AcceleratorModuleRunnerParametersType> {
  const acceleratorConfigurations = await ConfigLoader.getAcceleratorConfigurations(
    partition,
    configDirPath,
    resourcePrefixes,
    managementAccountCredentials,
  );

  //
  // Get Centralized logging region
  //
  const centralizedLoggingRegion =
    acceleratorConfigurations.globalConfig.logging.centralizedLoggingRegion ??
    acceleratorConfigurations.globalConfig.homeRegion;

  //
  // Get Accelerator resource names
  //
  const acceleratorResourceNames = new AcceleratorResourceNames({
    prefixes: resourcePrefixes,
    centralizedLoggingRegion,
  });

  //
  // Get Global Region
  //
  const globalRegion = getGlobalRegion(partition);

  //
  // Get Organization accounts
  //
  const organizationAccounts: Account[] = [];
  if (acceleratorConfigurations.organizationConfig.enable) {
    organizationAccounts.push(
      ...(await getOrganizationAccounts(globalRegion, solutionId, managementAccountCredentials)),
    );
  }
  const organizationDetails = await getOrganizationDetails(globalRegion, solutionId, managementAccountCredentials);

  if (acceleratorConfigurations.organizationConfig.enable && !organizationDetails) {
    throw new Error(
      `AWS Organizations not configured but organization is enabled in organization-config.yaml file !!!`,
    );
  }

  return {
    configs: acceleratorConfigurations,
    globalRegion,
    resourcePrefixes,
    acceleratorResourceNames,
    logging: {
      centralizedRegion: centralizedLoggingRegion,
      bucketName: undefined,
      bucketKeyArn: undefined,
    },
    organizationAccounts,
    organizationDetails,
    managementAccountCredentials,
  };
}

/**
 * Function to get Central Logging resources like Central log bucket name and bucket key arn
 * @param partition string
 * @param solutionId string
 * @param centralizedLoggingRegion string
 * @param acceleratorResourceNames {@link AcceleratorResourceNames }
 * @param globalConfig {@link GlobalConfig }
 * @param accountsConfig {@link AccountsConfig}
 * @param stage
 * @param managementAccountCredentials {@link IAssumeRoleCredential} | undefined
 * @returns
 */
export async function getCentralLoggingResources(
  partition: string,
  solutionId: string,
  centralizedLoggingRegion: string,
  acceleratorResourceNames: AcceleratorResourceNames,
  globalConfig: GlobalConfig,
  accountsConfig: AccountsConfig,
  stage: {
    name: string;
    runOrder: number;
    module: {
      name: string;
      executionPhase: ModuleExecutionPhase;
    };
  },
  managementAccountCredentials?: IAssumeRoleCredential,
): Promise<{ bucketName: string; keyArn: string } | undefined> {
  if (stage.runOrder <= AcceleratorModuleStageOrders.logging.runOrder) {
    logger.info(
      `Central Logging resources are not required to be fetched for ${stage.module.name} module of ${stage.name} stage.`,
    );
    return undefined;
  }

  if (stage.module.executionPhase === ModuleExecutionPhase.SYNTH) {
    logger.info(
      `Central Logging resources are not required to be fetched for ${stage.module.name} module of ${stage.name} stage, becasue module execution phase is ${stage.module.executionPhase}`,
    );

    return undefined;
  }

  logger.info(`Fetching Central Logging resources for ${stage.module.name} module of ${stage.name} stage.`);

  //
  // Get Central log bucket name
  //
  const centralLogBucketName = getCentralLogBucketName(
    centralizedLoggingRegion,
    acceleratorResourceNames,
    {
      accountId: accountsConfig.getLogArchiveAccountId(),
      accountName: accountsConfig.getLogArchiveAccount().name,
      region: centralizedLoggingRegion,
    },
    globalConfig,
    accountsConfig,
  );

  let ssmParamName = acceleratorResourceNames.parameters.centralLogBucketCmkArn;
  if (globalConfig.logging.centralLogBucket?.importedBucket?.createAcceleratorManagedKey) {
    ssmParamName = acceleratorResourceNames.parameters.importedCentralLogBucketCmkArn;
  }

  const credentials = await getCredentials({
    accountId: accountsConfig.getLogArchiveAccountId(),
    region: centralizedLoggingRegion,
    solutionId,
    partition,
    assumeRoleName: globalConfig.cdkOptions.customDeploymentRole ?? globalConfig.managementAccountAccessRole,
    credentials: managementAccountCredentials,
  });

  const client: SSMClient = new SSMClient({
    region: centralizedLoggingRegion,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
    credentials,
  });

  try {
    const response = await throttlingBackOff(() => client.send(new GetParameterCommand({ Name: ssmParamName })));
    return { bucketName: centralLogBucketName, keyArn: response.Parameter!.Value! };
  } catch (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    e: any
  ) {
    if (e instanceof ParameterNotFound) {
      logger.warn(
        `Central Logs bucket CMK arn SSM parameter ${ssmParamName} not found in region ${centralizedLoggingRegion}`,
      );
      return undefined;
    }
    throw e;
  }
}

/**
 * Function to get Central logs bucket name
 * @param centralizedLoggingRegion string
 * @param acceleratorResourceNames {@link AcceleratorResourceNames}
 * @param env {@link AcceleratorEnvironmentDetailsType}
 * @param globalConfig {@link GlobalConfig}
 * @param accountsConfig {@link AccountsConfig}
 * @returns bucketName string
 */
export function getCentralLogBucketName(
  centralizedLoggingRegion: string,
  acceleratorResourceNames: AcceleratorResourceNames,
  env: AcceleratorEnvironmentDetailsType,
  globalConfig: GlobalConfig,
  accountsConfig: AccountsConfig,
): string {
  if (globalConfig.logging.centralLogBucket?.importedBucket) {
    const name = globalConfig.logging.centralLogBucket.importedBucket.name;
    return name.replace('${REGION}', env.region.replace('${ACCOUNT_ID}', env.accountId));
  }
  return `${
    acceleratorResourceNames.bucketPrefixes.centralLogs
  }-${accountsConfig.getLogArchiveAccountId()}-${centralizedLoggingRegion}`;
}

/**
 * Function to get runner target regions by comparing enabled regions and excluded regions
 * @param enabledRegions string[]
 * @param excludedRegions string[]
 * @returns includedRegions string[]
 */
export function getRunnerTargetRegions(enabledRegions: string[], excludedRegions: string[]): string[] {
  const includedRegions = enabledRegions.filter(item => !excludedRegions.includes(item));
  return includedRegions;
}

/**
 * Function to check if module execution is skipped by environment
 * @param moduleName
 * @returns
 */
export function isModuleExecutionSkippedByEnvironment(moduleName: string): boolean {
  if (!EXECUTION_CONTROLLABLE_MODULES.includes(moduleName)) {
    return false;
  }

  const environmentVariableName = pascalCase(`skip-${moduleName}`);
  const environmentSetting = process.env[pascalCase(environmentVariableName)]?.toLowerCase() === 'true';
  if (environmentSetting) {
    logger.warn(
      `Module ${moduleName} skipped by environment variable settings. To enable the module execution set the environment variable ${environmentVariableName} to true (case insensitive) for AWSAccelerator-ToolkitProject CodeBuild project.`,
    );
    return true;
  }
  logger.info(
    `Module ${moduleName} will be executed, module execution can be skipped by setting environment variable ${environmentVariableName} to false (case insensitive) for AWSAccelerator-ToolkitProject CodeBuild project. Removing the variable will enable module execution. Contact AWS Support prior to making changes to the module's default settings.`,
  );
  return false;
}
