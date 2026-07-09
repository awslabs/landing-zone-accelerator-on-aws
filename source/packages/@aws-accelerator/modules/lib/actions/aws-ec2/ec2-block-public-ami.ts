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

import path from 'path';
import { createStatusLogger } from '../../../../../@aws-lza/common/logger';
import { manageImageBlockPublicAccess } from '../../../../../@aws-lza/executors/accelerator-amazon-ec2';
import { IManageImageBlockPublicAccessHandlerParameter } from '../../../../../@aws-lza/interfaces/amazon-ec2/manage-image-block-public-access';
import { ModuleParams } from '../../../models/types';
import { Account } from '@aws-sdk/client-organizations';
import { IAssumeRoleCredential, AssumeRoleCredentialType } from '../../../../../@aws-lza/common/resources';
import { getCredentials, processModulePromises } from '../../../../../@aws-lza/common/functions';
import { AccountsConfig } from '@aws-accelerator/config';

/**
 * Module to manage EC2 Image Block Public Access across organization accounts
 */
export abstract class Ec2BlockPublicAmiModule {
  private static statusLogger = createStatusLogger([path.parse(path.basename(__filename)).name]);

  public static async execute(params: ModuleParams): Promise<string> {
    Ec2BlockPublicAmiModule.statusLogger.info(`Module ${params.moduleItem.name} execution started`);

    const config = params.moduleRunnerParameters.configs.securityConfig.centralSecurityServices.blockPublicAmi;
    if (!config || typeof config.enable !== 'boolean') {
      const status = 'Block Public AMI configuration not present, skipping execution';
      Ec2BlockPublicAmiModule.statusLogger.info(status);
      return status;
    }

    const enabledRegions = params.moduleRunnerParameters.configs.globalConfig.enabledRegions || [];
    if (enabledRegions.length === 0) {
      const status = 'No enabled regions found, skipping Block Public AMI execution';
      Ec2BlockPublicAmiModule.statusLogger.info(status);
      return status;
    }

    Ec2BlockPublicAmiModule.statusLogger.info(
      `Executing Block Public AMI across ${enabledRegions.length} regions. Feature enabled: ${config.enable}`,
    );

    const regionResults: string[] = [];
    for (const region of enabledRegions) {
      try {
        const regionParams = { ...params, runnerParameters: { ...params.runnerParameters, region } };
        const result = await Ec2BlockPublicAmiModule.executeAccountActions(regionParams);
        regionResults.push(`Region ${region}: ${result}`);
      } catch (error) {
        regionResults.push(`Region ${region}: ERROR - ${error}`);
        Ec2BlockPublicAmiModule.statusLogger.error(`Failed in region ${region}: ${error}`);
      }
    }

    Ec2BlockPublicAmiModule.statusLogger.info(`Module ${params.moduleItem.name} execution completed`);
    return regionResults.join('\n');
  }

  private static async executeAccountActions(params: ModuleParams): Promise<string> {
    const config = params.moduleRunnerParameters.configs.securityConfig.centralSecurityServices.blockPublicAmi!;
    const allAccounts = params.moduleRunnerParameters.organizationAccounts;
    const excludeAccounts = config.excludeAccounts || [];
    const managementAccountAccessRole = params.moduleRunnerParameters.configs.globalConfig.managementAccountAccessRole;
    const dryRun = params.runnerParameters.dryRun;

    const excludedSet = new Set(excludeAccounts);
    const enableAccounts: Account[] = [];
    const disableAccounts: Account[] = [];

    for (const account of allAccounts) {
      if (config.enable && !excludedSet.has(account.Name || '')) {
        enableAccounts.push(account);
      } else {
        disableAccounts.push(account);
      }
    }

    const promises: Promise<string>[] = [];
    for (const account of enableAccounts) {
      promises.push(
        Ec2BlockPublicAmiModule.manageAccount(
          account,
          params.runnerParameters.region,
          params.runnerParameters.partition,
          params.moduleRunnerParameters.managementAccountCredentials!,
          true,
          params.runnerParameters.solutionId,
          managementAccountAccessRole,
          dryRun,
        ).catch(
          error => `Account ${account.Name} (${account.Id}) in ${params.runnerParameters.region}: ERROR - ${error}`,
        ),
      );
    }
    for (const account of disableAccounts) {
      promises.push(
        Ec2BlockPublicAmiModule.manageAccount(
          account,
          params.runnerParameters.region,
          params.runnerParameters.partition,
          params.moduleRunnerParameters.managementAccountCredentials!,
          false,
          params.runnerParameters.solutionId,
          managementAccountAccessRole,
          dryRun,
        ).catch(
          error => `Account ${account.Name} (${account.Id}) in ${params.runnerParameters.region}: ERROR - ${error}`,
        ),
      );
    }

    const statuses: string[] = [];
    await processModulePromises('Ec2BlockPublicAmi', promises, statuses);
    return statuses.join('\n');
  }

  private static async manageAccount(
    account: Account,
    region: string,
    partition: string,
    managementCredentials: AssumeRoleCredentialType,
    enable: boolean,
    solutionId: string,
    managementAccountAccessRole: string,
    dryRun?: boolean,
  ): Promise<string> {
    try {
      const resolvedManagementCredentials =
        typeof managementCredentials === 'function' ? await managementCredentials() : managementCredentials;

      const targetCredentials =
        account.Name === AccountsConfig.MANAGEMENT_ACCOUNT
          ? resolvedManagementCredentials
          : await getCredentials({
              accountId: account.Id!,
              region,
              solutionId,
              partition,
              assumeRoleName: managementAccountAccessRole,
              credentials: managementCredentials,
            });

      const input: IManageImageBlockPublicAccessHandlerParameter = {
        operation: 'manage-image-block-public-access',
        configuration: { enable },
        partition,
        region,
        credentials: targetCredentials as IAssumeRoleCredential | undefined,
        solutionId,
        dryRun,
      };
      const result = await manageImageBlockPublicAccess(input);

      return `Account ${account.Name} (${account.Id}) in ${region}: ${result}`;
    } catch (error) {
      return `Account ${account.Name} (${account.Id}) in ${region}: ERROR - ${error}`;
    }
  }
}
