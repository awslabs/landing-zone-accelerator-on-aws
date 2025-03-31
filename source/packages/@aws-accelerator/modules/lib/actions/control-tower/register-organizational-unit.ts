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
  createLogger,
  IRegisterOrganizationalUnitHandlerParameter,
  registerOrganizationalUnit,
} from '../../../../../@aws-lza/index';
import { ModuleParams } from '../../../models/types';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * An abstract class to manage register AWS Organizations Organizational Unit (OU) with AWS Control Tower module
 */
export abstract class RegisterOrganizationalUnitModule {
  /**
   * Function to invoke register AWS Organizations Organizational Unit (OU) with AWS Control Tower module
   * @param params {@link ModuleParams}
   * @returns status string
   */
  public static async execute(params: ModuleParams): Promise<string> {
    if (!params.moduleRunnerParameters.configs.globalConfig.controlTower.enable) {
      return `Module ${params.moduleItem.name} execution skipped, Control Tower Landing zone is not enabled for the environment.`;
    }
    const securityOuName =
      params.moduleRunnerParameters.configs.accountsConfig.getLogArchiveAccount().organizationalUnit;

    const statuses: string[] = [];
    const promises: Promise<string>[] = [];
    for (const organizationalUnit of params.moduleRunnerParameters.configs.organizationConfig.organizationalUnits) {
      if (organizationalUnit.name !== securityOuName) {
        const param: IRegisterOrganizationalUnitHandlerParameter = {
          moduleName: params.moduleItem.name,
          operation: 'register-organizational-unit',
          partition: params.runnerParameters.partition,
          region: params.moduleRunnerParameters.configs.globalConfig.homeRegion,
          useExistingRole: params.runnerParameters.useExistingRole,
          solutionId: params.runnerParameters.solutionId,
          credentials: params.moduleRunnerParameters.managementAccountCredentials,
          dryRun: params.runnerParameters.dryRun,
          configuration: {
            name: organizationalUnit.name,
          },
        };
        promises.push(registerOrganizationalUnit(param));
      }
    }

    if (promises.length > 0) {
      logger.info(`Executing ${params.moduleItem.name} module.`);
      statuses.push(...(await Promise.all(promises)));
    }
    return `Module "${params.moduleItem.name}" completed successfully with status ${statuses.join('\n')}`;
  }
}
