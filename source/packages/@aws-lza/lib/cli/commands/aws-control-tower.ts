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

/**
 * @fileoverview AWS Control Tower CLI Command Definitions
 *
 * Defines CLI command structure and options for AWS Control Tower operations including
 * landing zone setup, organizational structure configuration, and guardrail deployment.
 * Provides command definitions with required parameters and execution handlers.
 */

import { CliCommonOptions, CommandOptionsType } from '../handlers/root';
import { ControlTowerCommand } from '../handlers/aws-control-tower';

/**
 * Command-line options for AWS Control Tower operations
 */
const options: CommandOptionsType[] = [
  ...CliCommonOptions,
  {
    configuration: {
      alias: 'c',
      type: 'string',
      description: 'Path to Control Tower configuration file (file://) or JSON configuration string',
      required: true,
    },
  },
];

/**
 * Available AWS Control Tower CLI commands with descriptions and handlers
 */
export const ControlTowerCommands = {
  setup: {
    description:
      'Deploy and configure AWS Control Tower Landing Zone with organizational structure, guardrails, and Account Factory',
    options: options,
    execute: ControlTowerCommand.execute,
  },
};
