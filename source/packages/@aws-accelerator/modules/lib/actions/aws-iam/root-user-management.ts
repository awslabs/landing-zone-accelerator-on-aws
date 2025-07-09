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
  IRootUserManagementHandlerParameter,
  configureRootUserManagment,
} from '../../../../../@aws-lza/index';
import { ModuleParams } from '../../../models/types';

const statusLogger = createStatusLogger([path.parse(path.basename(__filename)).name]);

/**
 * An abstract class to configure IAM Root User Management
 */
export abstract class ConfigureRootUserManagementModule {
  /**
   * Function to invoke configuring IAM Root User Management
   * @param params {@link ModuleParams}
   * @returns status string
   */
  public static async execute(params: ModuleParams): Promise<string> {
    const rootUserConfiguration = params.moduleRunnerParameters.configs.globalConfig.centralRootUserManagement;
    if (!rootUserConfiguration) {
      return 'Skipping module "root-user-management" because no configuration was provided';
    }

    const param: IRootUserManagementHandlerParameter = {
      moduleName: params.moduleItem.name,
      operation: 'configure-root-user-management',
      partition: params.runnerParameters.partition,
      region: params.moduleRunnerParameters.configs.globalConfig.homeRegion,
      useExistingRole: params.runnerParameters.useExistingRoles,
      solutionId: params.runnerParameters.solutionId,
      credentials: params.moduleRunnerParameters.managementAccountCredentials,
      dryRun: params.runnerParameters.dryRun,
      maxConcurrentExecution: params.runnerParameters.maxConcurrentExecution,
      configuration: {
        enabled: rootUserConfiguration.enable,
        credentials: rootUserConfiguration.capabilities.rootCredentialsManagement,
        session: rootUserConfiguration.capabilities.allowRootSessions,
      },
    };

    statusLogger.info(`Executing "${params.moduleItem.name}" module.`);
    const status = await configureRootUserManagment(param);

    return `Module "${params.moduleItem.name}" completed successfully with status ${status}`;
  }
}
