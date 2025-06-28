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
  createOrganizationalUnit,
  ICreateOrganizationalUnitHandlerParameter,
  getOrganizationalUnitsDetail,
} from '../../../../../@aws-lza/index';
import { ModuleParams } from '../../../models/types';

const statusLogger = createStatusLogger([path.parse(path.basename(__filename)).name]);

/**
 * An abstract class to manage create AWS Organizations Organizational unit (OU) module
 */
export abstract class CreateOrganizationalUnitModule {
  /**
   * Function to invoke create AWS Organizations Organizational unit (OU) module
   * @param params {@link ModuleParams}
   * @returns status string
   */
  public static async execute(params: ModuleParams): Promise<string> {
    if (!params.moduleRunnerParameters.configs.organizationConfig.enable) {
      return `Module "${params.moduleItem.name}" execution skipped, AWS Organization is not enabled for the environment.`;
    }

    statusLogger.info(`Executing "${params.moduleItem.name}" module.`);
    const statuses: string[] = [];

    const organizationalUnitsDetail = await getOrganizationalUnitsDetail({
      moduleName: params.moduleItem.name,
      operation: 'get-organizational-units-detail',
      partition: params.runnerParameters.partition,
      region: params.moduleRunnerParameters.configs.globalConfig.homeRegion,
      useExistingRole: params.runnerParameters.useExistingRoles,
      solutionId: params.runnerParameters.solutionId,
      credentials: params.moduleRunnerParameters.managementAccountCredentials,
      dryRun: params.runnerParameters.dryRun,
    });

    const newOrganizationalUnits = params.moduleRunnerParameters.configs.organizationConfig.organizationalUnits.filter(
      item => !organizationalUnitsDetail.some(ouDetail => ouDetail.completePath === item.name),
    );

    // Sort organizational units by hierarchy depth
    const sortedOrganizationalUnits = [...newOrganizationalUnits]
      .filter(ou => !ou.ignore)
      .sort((a, b) => {
        const depthA = a.name.split('/').length;
        const depthB = b.name.split('/').length;

        if (depthA === depthB) {
          return a.name.localeCompare(b.name);
        }

        return depthA - depthB;
      });

    if (sortedOrganizationalUnits.length === 0) {
      return `Skipping "${params.moduleItem.name}" because all organizational units found in configuration file are already part of the AWS Organization.`;
    }

    for (const organizationalUnit of sortedOrganizationalUnits) {
      const param: ICreateOrganizationalUnitHandlerParameter = {
        moduleName: params.moduleItem.name,
        operation: 'create-organizational-unit',
        partition: params.runnerParameters.partition,
        region: params.moduleRunnerParameters.configs.globalConfig.homeRegion,
        useExistingRole: params.runnerParameters.useExistingRoles,
        solutionId: params.runnerParameters.solutionId,
        credentials: params.moduleRunnerParameters.managementAccountCredentials,
        dryRun: params.runnerParameters.dryRun,
        configuration: {
          name: organizationalUnit.name,
        },
      };

      statusLogger.info(`Executing "${params.moduleItem.name}" module for ${organizationalUnit.name} OU.`);
      statuses.push(await createOrganizationalUnit(param));
    }

    return `Module "${params.moduleItem.name}" completed successfully with status ${statuses.join('\n')}`;
  }
}
