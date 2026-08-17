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
 * @fileoverview Amazon GuardDuty CLI Command Definitions
 *
 * Defines CLI command structure and options for Amazon GuardDuty operations including
 * setup, configuration, and management across AWS Organizations. Provides command
 * definitions with required parameters and execution handlers.
 */

import { GuardDutyCommand } from '../handlers/amazon-guardduty';
import { CliCommonOptions, CommandOptionsType } from '../handlers/root';

/**
 * Command-line options for Amazon GuardDuty operations
 */
const options: CommandOptionsType[] = [
  ...CliCommonOptions,
  {
    configuration: {
      alias: 'c',
      type: 'string',
      description: 'Path to GuardDuty configuration file (file://) or JSON configuration string',
      required: true,
    },
  },
];

/**
 * Available Amazon GuardDuty CLI commands with descriptions and handlers
 */
export const GuardDutyCommands = {
  setup: {
    description:
      'Setup Amazon GuardDuty across AWS Organizations with delegated administration and protection settings',
    options,
    execute: GuardDutyCommand.execute,
  },
};
