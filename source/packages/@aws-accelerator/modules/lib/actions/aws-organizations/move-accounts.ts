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
  IMoveAccountsBatchHandlerParameter,
  moveAccountsBatch,
} from '../../../../../@aws-lza/index';
import { ModuleParams } from '../../../models/types';

const statusLogger = createStatusLogger([path.parse(path.basename(__filename)).name]);

/**
 * An abstract class to manage move AWS Accounts to destination AWS Organizations Organizational Unit (OU) module
 */
export abstract class MoveAccountModule {
  /**
   * Function to invoke move AWS Accounts to destination AWS Organizations Organizational Unit (OU) module
   * @param params {@link ModuleParams}
   * @returns status string
   */
  public static async execute(params: ModuleParams): Promise<string> {
    const accountIdsToMove = params.moduleRunnerParameters.configs.accountsConfig.accountIds ?? [];

    const allAccountItems = [
      ...params.moduleRunnerParameters.configs.accountsConfig.mandatoryAccounts,
      ...params.moduleRunnerParameters.configs.accountsConfig.workloadAccounts,
    ];

    const accountItemsToMove = allAccountItems.filter(item =>
      accountIdsToMove.some(account => account.email === item.email),
    );

    if (accountItemsToMove.length === 0) {
      return `Skipping module "${params.moduleItem.name}" because all accounts already reside in their respective Organizational Units as defined in the configuration`;
    }

    const param: IMoveAccountsBatchHandlerParameter = {
      moduleName: params.moduleItem.name,
      operation: 'move-account',
      partition: params.runnerParameters.partition,
      region: params.moduleRunnerParameters.configs.globalConfig.homeRegion,
      useExistingRole: params.runnerParameters.useExistingRoles,
      solutionId: params.runnerParameters.solutionId,
      credentials: params.moduleRunnerParameters.managementAccountCredentials,
      dryRun: params.runnerParameters.dryRun,
      maxConcurrentExecution: params.runnerParameters.maxConcurrentExecution,
      configuration: {
        accounts: accountItemsToMove.map(accountItem => {
          return {
            email: accountItem.email,
            destinationOu: accountItem.organizationalUnit,
          };
        }),
      },
    };

    statusLogger.info(`Executing ${params.moduleItem.name} module.`);
    const status = await moveAccountsBatch(param);

    return `Module "${params.moduleItem.name}" completed successfully with status ${status}`;
  }
}
