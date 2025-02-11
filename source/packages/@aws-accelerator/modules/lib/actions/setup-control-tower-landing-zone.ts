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
import { createLogger } from '../../../../@aws-lza/common/logger';
import { ISetupLandingZoneHandlerParameter, setupControlTowerLandingZone } from '../../../../@aws-lza/index';
import { ModuleParams } from '../../models/types';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * An abstract class to manage execution of AWS Control Tower Landing Zone module
 */
export abstract class SetupControlTowerLandingZoneModule {
  /**
   * Function to invoke Setup Control Tower Landing Zone module
   * @param params {@link ModuleParams}
   * @returns status string
   */
  public static async execute(params: ModuleParams) {
    if (!params.moduleRunnerParameters.configs.globalConfig.controlTower.landingZone) {
      return `Module ${params.moduleItem.name} execution skipped, No configuration found for Control Tower Landing zone`;
    }

    const landingZoneConfiguration = params.moduleRunnerParameters.configs.globalConfig.controlTower.landingZone;

    const config: ISetupLandingZoneHandlerParameter = {
      moduleName: params.moduleItem.name,
      operation: 'create',
      partition: params.runnerParameters.partition,
      region: params.moduleRunnerParameters.configs.globalConfig.homeRegion,
      useExistingRole: params.runnerParameters.useExistingRole,
      solutionId: params.runnerParameters.solutionId,
      credentials: params.moduleRunnerParameters.managementAccountCredentials,
      dryRun: params.runnerParameters.dryRun,
      configuration: {
        version: landingZoneConfiguration.version,
        enabledRegions: params.moduleRunnerParameters.configs.globalConfig.enabledRegions,
        logging: {
          organizationTrail: landingZoneConfiguration.logging.organizationTrail,
          retention: {
            loggingBucket: landingZoneConfiguration.logging.loggingBucketRetentionDays,
            accessLoggingBucket: landingZoneConfiguration.logging.accessLoggingBucketRetentionDays,
          },
        },
        security: landingZoneConfiguration.security,
        sharedAccounts: {
          management: {
            name: params.moduleRunnerParameters.configs.accountsConfig.getManagementAccount().name,
            email: params.moduleRunnerParameters.configs.accountsConfig.getManagementAccount().email,
          },
          audit: {
            name: params.moduleRunnerParameters.configs.accountsConfig.getAuditAccount().name,
            email: params.moduleRunnerParameters.configs.accountsConfig.getAuditAccount().email,
          },
          logging: {
            name: params.moduleRunnerParameters.configs.accountsConfig.getLogArchiveAccount().name,
            email: params.moduleRunnerParameters.configs.accountsConfig.getLogArchiveAccount().email,
          },
        },
      },
    };

    logger.info(`Executing ${params.moduleItem.name}`);
    return await SetupControlTowerLandingZoneModule.setupControlTowerLandingZone(config);
  }

  /**
   * Function to execute setup Control Tower Landing Zone module
   * @param config {@link ISetupLandingZoneHandlerParameter}
   * @returns status string
   */
  private static async setupControlTowerLandingZone(config: ISetupLandingZoneHandlerParameter): Promise<string> {
    return await setupControlTowerLandingZone(config);
  }
}
