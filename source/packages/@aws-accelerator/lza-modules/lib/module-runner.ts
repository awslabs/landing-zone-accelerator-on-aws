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

import { AcceleratorModuleName, ModuleRunnerParametersType } from '../common/resources';
import { AWSOrganization } from './aws-organization';
import { ControlTowerLandingZone } from './control-tower/index';
import { AccountAlias } from './account-alias';

/**
 * ModuleRunner abstract class to execute accelerator modules.
 */
export abstract class ModuleRunner {
  /**
   * Function to execute module specific handler
   * @param runnerParams {@link ModuleRunnerParametersType}
   * @returns status string
   */
  public static async execute(runnerParams: ModuleRunnerParametersType): Promise<string> {
    switch (runnerParams.module) {
      case AcceleratorModuleName.CONTROL_TOWER:
        return new ControlTowerLandingZone().handler(runnerParams.module, runnerParams.options);
      case AcceleratorModuleName.AWS_ORGANIZATIONS:
        return new AWSOrganization().handler(runnerParams.module, runnerParams.options);
      case AcceleratorModuleName.ACCOUNT_ALIAS:
        return new AccountAlias().handler(runnerParams.module, runnerParams.options);
      default:
        throw new Error(`Invalid module name "${runnerParams.module}".`);
    }
  }
}
