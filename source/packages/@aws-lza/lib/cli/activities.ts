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

import { setupControlTowerLandingZone } from '../../executors/accelerator-control-tower';
import {
  ISetupLandingZoneConfiguration,
  ISetupLandingZoneHandlerParameter,
} from '../../interfaces/control-tower/setup-landing-zone';
import { CliExecutionParameterType } from './libraries/root';

/**
 * Abstract class to define various activities for CLI
 */
export abstract class CliActivity {
  public static async executeControlTowerLandingZoneModule(params: CliExecutionParameterType): Promise<string> {
    if (!params['configuration'] || !params['partition'] || !params['region']) {
      console.error(
        `An error occurred (MissingRequiredParameters) when calling the ${params.command} for ${params.moduleName} module: The configuration, partition and region parameters are required`,
      );
      process.exit(1);
    }

    const moduleConfig = params['configuration'] as ISetupLandingZoneConfiguration;
    const input: ISetupLandingZoneHandlerParameter = {
      operation: params.command,
      partition: params['partition'] as string,
      region: params['region'] as string,
      configuration: moduleConfig,
      dryRun: params['dryRun'] as boolean,
    };

    return await setupControlTowerLandingZone(input);
  }
}
