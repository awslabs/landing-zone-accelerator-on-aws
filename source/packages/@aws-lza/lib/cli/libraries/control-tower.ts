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

import { CliCommandDetailsType, CliCommonOptions, CommandOptionsType, ModuleDetailsType } from './root';

/**
 * control-tower module details
 */
export const LZA_CONTROL_TOWER_MODULE: ModuleDetailsType = {
  name: 'control-tower',
  description: 'Manage AWS Control Tower Landing zone operations',
};

/**
 * Common options for each control-tower module commands
 */
const ControlTowerCommonOptions: CommandOptionsType[] = [
  ...CliCommonOptions,
  {
    configuration: {
      alias: 'c',
      type: 'string',
      description: 'Path to configuration file (file://configuration.json) or configuration as a JSON string',
      required: true,
    },
  },
  {
    partition: {
      alias: 'p',
      type: 'string',
      description: 'AWS Partition',
      required: true,
    },
  },
  {
    region: {
      alias: 'r',
      type: 'string',
      description: 'AWS Region',
      required: true,
    },
  },
];

/**
 * List of control-tower module commands that are supported by the LZA CLI
 */
export const ControlTowerCommands: CliCommandDetailsType[] = [
  {
    name: 'create-landing-zone',
    description: 'Deploy AWS Control Tower Landing zone',
    options: ControlTowerCommonOptions,
  },
  {
    name: 'update-landing-zone',
    description: 'Update existing Landing zone configuration',
    options: ControlTowerCommonOptions,
  },
  {
    name: 'reset-landing-zone',
    description: 'Reset Landing zone to initial state',
    options: ControlTowerCommonOptions,
  },
];
