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
import { GetParameterCommand, ParameterNotFound, SSMClient } from '@aws-sdk/client-ssm';

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
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { createLogger } from '@aws-accelerator/utils/lib/logger';

import * as fs from 'fs';
import * as path from 'path';

import { setResourcePrefixes } from '../../../accelerator/utils/app-utils';
import { AcceleratorResourceNames } from '../../../accelerator/lib/accelerator-resource-names';

import { AcceleratorEnvironmentDetailsType, AllConfigType, AssumeRoleCredentialType } from './resources';
import { getCredentials } from './functions';

/**
 * AcceleratorConfigLoader an abstract class to load all configuration for module operation
 */
export abstract class AcceleratorConfigLoader {
  private static logger = createLogger([path.parse(path.basename(__filename)).name]);
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
   * Function to get all configurations and environment information
   * @param configDirPath string
   * @param partition string
   * @param prefix string
   * @param solutionId string
   * @param managementAccountCredentials {@link AssumeRoleCredentialType} | undefined
   * @returns configs {@link AllConfigType}
   */
  public static async getAllConfig(
    configDirPath: string,
    partition: string,
    prefix: string,
    solutionId: string,
    managementAccountCredentials?: AssumeRoleCredentialType,
  ): Promise<AllConfigType> {
    //
    // Get Resource prefixes
    //
    const resourcePrefixes = setResourcePrefixes(prefix);

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
      managementAccountCredentials,
    );

    //
    // Get replacement config
    //
    const replacementsConfig = AcceleratorConfigLoader.getReplacementsConfig(configDirPath, accountsConfig);
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
    // Get Centralized logging region
    //
    const centralizedLoggingRegion = globalConfig.logging.centralizedLoggingRegion ?? globalConfig.homeRegion;

    //
    // Get Accelerator resource names
    //
    const acceleratorResourceNames = new AcceleratorResourceNames({
      prefixes: resourcePrefixes,
      centralizedLoggingRegion,
    });

    //
    // Get Central log bucket name
    //
    const centralLogBucketName = AcceleratorConfigLoader.getCentralLogBucketName(
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

    //
    // Get Central log bucket CMK arn
    //
    const centralLogsBucketKeyArn = await AcceleratorConfigLoader.getCentralLogsBucketKeyArn(
      partition,
      solutionId,
      centralizedLoggingRegion,
      acceleratorResourceNames,
      globalConfig,
      accountsConfig,
      managementAccountCredentials,
    );

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
      resourcePrefixes,
      acceleratorResourceNames,
      logging: {
        centralizedRegion: centralizedLoggingRegion,
        bucketName: centralLogBucketName,
        bucketKeyArn: centralLogsBucketKeyArn,
      },
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

  /**
   * Function to get Central Logs bucket key arn
   * @param partition string
   * @param solutionId string
   * @param centralizedLoggingRegion string
   * @param acceleratorResourceNames {@link AcceleratorResourceNames}
   * @param globalConfig {@link GlobalConfig}
   * @param accountsConfig {@link AccountsConfig}
   * @param managementAccountCredentials {@link AssumeRoleCredentialType}
   * @returns
   */
  private static async getCentralLogsBucketKeyArn(
    partition: string,
    solutionId: string,
    centralizedLoggingRegion: string,
    acceleratorResourceNames: AcceleratorResourceNames,
    globalConfig: GlobalConfig,
    accountsConfig: AccountsConfig,
    managementAccountCredentials?: AssumeRoleCredentialType,
  ): Promise<string | undefined> {
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

      return response.Parameter!.Value!;
    } catch (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      e: any
    ) {
      if (e instanceof ParameterNotFound) {
        AcceleratorConfigLoader.logger.warn(
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
  private static getCentralLogBucketName(
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
}
