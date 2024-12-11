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

import { ControlTowerCommands, LZA_CONTROL_TOWER_MODULE } from './control-tower';
import { LZA_ORGANIZATIONS_MODULE, OrganizationsCommands } from './organizations';
import { CliCommandDetailsType } from './root';

/**
 * List of modules that are supported by the LZA CLI
 */
export const Modules = {
  /**
   * AWS Control Tower module to manage landing zone
   */
  CONTROL_TOWER: LZA_CONTROL_TOWER_MODULE,
  /**
   * AWS Organizations module to manage organizational activities
   */
  ORGANIZATIONS: LZA_ORGANIZATIONS_MODULE,
};

/**
 * List of module commands that are supported by the LZA CLI
 */
export const ModuleCommands: Record<string, CliCommandDetailsType[]> = {
  [Modules.CONTROL_TOWER.name]: ControlTowerCommands,
  [Modules.ORGANIZATIONS.name]: OrganizationsCommands,
};
