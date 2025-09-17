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
import {
  createStatusLogger,
  IManageAccountAliasHandlerParameter,
  manageAccountAlias,
} from '../../../../../@aws-lza/index';
import { ModuleParams } from '../../../models/types';
import { getCredentials, processModulePromises } from '../../../../../@aws-lza/common/functions';
import { IAssumeRoleCredential } from '../../../../../@aws-lza/common/resources';
import { AccountsConfig } from '@aws-accelerator/config';

const statusLogger = createStatusLogger([path.parse(path.basename(__filename)).name]);

/**
 * An abstract class to manage AWS Accounts alias module
 */

export abstract class ManageAccountsAliasModule {
  /**
   * Function to invoke manage account alias module
   * @param params {@link ModuleParams}
   * @returns status string
   */
  public static async execute(params: ModuleParams): Promise<string> {
    const statuses: string[] = [];
    const promises: Promise<string>[] = [];

    const { globalConfig, accountsConfig, organizationConfig } = params.moduleRunnerParameters.configs;

    const ignoredOus = organizationConfig.getIgnoredOus();
    const activeAccountIds = accountsConfig.getActiveAccountIds(ignoredOus);

    const allAccounts = [...accountsConfig.mandatoryAccounts, ...accountsConfig.workloadAccounts];

    // Only include the active accounts and those who have an accountAlias configured
    const activeAccountsWithAlias = allAccounts
      .filter(account => activeAccountIds.includes(accountsConfig.getAccountId(account.name)))
      .filter(
        (account): account is typeof account & { accountAlias: string } =>
          typeof account.accountAlias === 'string' && account.accountAlias.length > 0,
      );

    if (activeAccountsWithAlias.length === 0) {
      return `Skipping module "${params.moduleItem.name}" because no accounts have an alias configured`;
    }

    for (const account of activeAccountsWithAlias) {
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

          const input: IManageAccountAliasHandlerParameter = {
            moduleName: params.moduleItem.name,
            operation: 'manage-account-alias',
            partition: params.runnerParameters.partition,
            region: globalConfig.homeRegion,
            useExistingRole: params.runnerParameters.useExistingRoles,
            solutionId: params.runnerParameters.solutionId,
            credentials: credential ?? params.moduleRunnerParameters.managementAccountCredentials,
            dryRun: params.runnerParameters.dryRun,
            configuration: {
              alias: account.accountAlias,
            },
          };

          return manageAccountAlias(input);
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
