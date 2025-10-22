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
import { createStatusLogger, IDeleteDefaultVpcParameter, deleteDefaultVpc } from '../../../../../@aws-lza/index';
import { ModuleParams } from '../../../models/types';
import { getCredentials, processModulePromises } from '../../../../../@aws-lza/common/functions';
import { IAssumeRoleCredential } from '../../../../../@aws-lza/common/resources';
import { AccountsConfig } from '@aws-accelerator/config';

const statusLogger = createStatusLogger([path.parse(path.basename(__filename)).name]);

/**
 * An abstract class to delete default VPCs module
 */
export abstract class DeleteDefaultVpc {
  /**
   * Function to invoke delete default VPC module
   * @param params {@link ModuleParams}
   * @returns status string
   */
  public static async execute(params: ModuleParams): Promise<string> {
    const statuses: string[] = [];
    const promises: Promise<string>[] = [];

    const { globalConfig, accountsConfig, organizationConfig, networkConfig } = params.moduleRunnerParameters.configs;

    // Skip excluded regions to avoid unnecessary account processing
    if (networkConfig.defaultVpc.excludeRegions?.includes(params.runnerParameters.region)) {
      return `Skipping module "${params.moduleItem.name}" because region ${params.runnerParameters.region} is excluded`;
    }

    const ignoredOus = organizationConfig.getIgnoredOus();
    const activeAccountIds = accountsConfig.getActiveAccountIds(ignoredOus);

    const allAccounts = [...accountsConfig.mandatoryAccounts, ...accountsConfig.workloadAccounts];

    // Only include the active accounts
    const activeAccounts = allAccounts.filter(account =>
      activeAccountIds.includes(accountsConfig.getAccountId(account.name)),
    );

    if (activeAccounts.length === 0) {
      return `Skipping module "${params.moduleItem.name}" because no active accounts found`;
    }

    for (const account of activeAccounts) {
      // Skip excluded accounts
      if (networkConfig.defaultVpc.excludeAccounts?.includes(account.name)) {
        continue;
      }

      promises.push(
        (async () => {
          let credential: IAssumeRoleCredential | undefined;
          if (account.name !== AccountsConfig.MANAGEMENT_ACCOUNT) {
            credential = await getCredentials({
              accountId: accountsConfig.getAccountId(account.name),
              region: globalConfig.homeRegion,
              solutionId: params.runnerParameters.solutionId,
              partition: params.runnerParameters.partition,
              assumeRoleName: globalConfig.managementAccountAccessRole,
            });
          }

          const input: IDeleteDefaultVpcParameter = {
            moduleName: params.moduleItem.name,
            operation: 'delete-default-vpc',
            partition: params.runnerParameters.partition,
            region: params.runnerParameters.region,
            useExistingRole: params.runnerParameters.useExistingRoles,
            solutionId: params.runnerParameters.solutionId,
            credentials: credential ?? params.moduleRunnerParameters.managementAccountCredentials,
            dryRun: params.runnerParameters.dryRun,
            configuration: {},
          };

          return deleteDefaultVpc(input);
        })(),
      );
    }

    statusLogger.info(`Executing "${params.moduleItem.name}" module.`);
    await processModulePromises(
      params.moduleItem.name,
      promises,
      statuses,
      params.runnerParameters.maxConcurrentExecution,
    );

    return `Module "${params.moduleItem.name}" completed successfully with status ${statuses.join('\n')}`;
  }
}
