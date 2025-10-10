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
  getCloudFormationTemplates,
  IGetCloudFormationTemplatesHandlerParameter,
} from '../../../../../@aws-lza/index';
import { ModuleParams } from '../../../models/types';
import { AcceleratorEnvironment } from '../../../../../@aws-lza/common/types';

const statusLogger = createStatusLogger([path.parse(path.basename(__filename)).name]);

/**
 * An abstract class to download cross account CloudFormation templates module
 */
export abstract class GetCloudFormationTemplatesModule {
  /**
   * Function to download cross account CloudFormation template module
   * @param params {@link ModuleParams}
   * @returns status string
   */
  public static async execute(params: ModuleParams): Promise<string> {
    statusLogger.info(`Executing "${params.moduleItem.name}" module.`);
    if (!(params.moduleRunnerParameters.configs.globalConfig.useV2Stacks ?? false)) {
      return `Module "${params.moduleItem.name}" did not execute. Configuration option not set.`;
    }
    const ignoredOus = params.moduleRunnerParameters.configs.organizationConfig.getIgnoredOus();
    const accountIds = params.moduleRunnerParameters.configs.accountsConfig.getActiveAccountIds(ignoredOus);
    const managementAccountId = params.moduleRunnerParameters.configs.accountsConfig.getManagementAccountId();
    const regions = params.moduleRunnerParameters.configs.globalConfig.enabledRegions;
    const credentials = params.moduleRunnerParameters.managementAccountCredentials;
    const acceleratorEnvironments = GetCloudFormationTemplatesModule.getAcceleratorEnvironments({
      accountIds,
      regions,
    });
    const acceleratorPrefix = params.moduleRunnerParameters.resourcePrefixes.accelerator;
    const roleNameToAssume = params.moduleRunnerParameters.configs.globalConfig.managementAccountAccessRole;
    const param: IGetCloudFormationTemplatesHandlerParameter = {
      moduleName: params.moduleItem.name,
      operation: 'get-cloudformation-templates',
      partition: params.runnerParameters.partition,
      region: params.moduleRunnerParameters.configs.globalConfig.homeRegion,
      useExistingRole: params.runnerParameters.useExistingRoles,
      solutionId: params.runnerParameters.solutionId,
      credentials,
      dryRun: params.runnerParameters.dryRun,
      configuration: {
        acceleratorEnvironments,
        directory: './cfn-templates/',
        roleNameToAssume,
        stackPrefix: `${acceleratorPrefix}-NetworkVpcStack`,
        centralAccountId: managementAccountId,
      },
    };

    return getCloudFormationTemplates(param);
  }

  private static getAcceleratorEnvironments(props: {
    accountIds: string[];
    regions: string[];
  }): AcceleratorEnvironment[] {
    const environments: AcceleratorEnvironment[] = [];
    for (const accountId of props.accountIds) {
      for (const region of props.regions) {
        environments.push({
          accountId,
          region,
        });
      }
    }
    return environments;
  }
}
