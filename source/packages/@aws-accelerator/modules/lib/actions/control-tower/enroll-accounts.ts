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
import { createStatusLogger, IEnrollAccountsHandlerParameter, enrollAccounts } from '../../../../../@aws-lza/index';
import { ModuleParams } from '../../../models/types';

const statusLogger = createStatusLogger([path.parse(path.basename(__filename)).name]);

/**
 * An abstract class to manage enroll accounts across the entire Control Tower organization
 */
export abstract class EnrollAccountsModule {
  /**
   * Function to invoke enroll accounts module once for the whole organization
   * @param params {@link ModuleParams}
   * @returns status string
   */
  public static async execute(params: ModuleParams): Promise<string> {
    if (!params.moduleRunnerParameters.configs.globalConfig.controlTower.enable) {
      return `Module "${params.moduleItem.name}" execution skipped, Control Tower Landing zone is not enabled for the environment.`;
    }

    statusLogger.info(`Executing "${params.moduleItem.name}" module for the entire Control Tower organization.`);

    const param: IEnrollAccountsHandlerParameter = {
      moduleName: params.moduleItem.name,
      operation: 'enroll-accounts',
      partition: params.runnerParameters.partition,
      region: params.moduleRunnerParameters.configs.globalConfig.homeRegion,
      useExistingRole: params.runnerParameters.useExistingRoles,
      solutionId: params.runnerParameters.solutionId,
      credentials: params.moduleRunnerParameters.managementAccountCredentials,
      dryRun: params.runnerParameters.dryRun,
    };

    const status = await enrollAccounts(param);

    return `Module "${params.moduleItem.name}" completed successfully with status: ${status}`;
  }
}
