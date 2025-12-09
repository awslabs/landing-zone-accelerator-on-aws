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
 * @fileoverview Amazon Macie CLI Command Definitions
 *
 * Defines CLI command structure and options for Amazon Macie operations including
 * setup, configuration, and management across AWS Organizations. Provides command
 * definitions with required parameters and execution handlers.
 */

import { MacieCommand } from '../handlers/amazon-macie';
import { CliCommonOptions, CommandOptionsType } from '../handlers/root';

/**
 * Command-line options for Amazon Macie operations
 */
const options: CommandOptionsType[] = [
  ...CliCommonOptions,
  {
    configuration: {
      alias: 'c',
      type: 'string',
      description: 'Path to Macie configuration file (file://) or JSON configuration string',
      required: true,
    },
  },
];

/**
 * Available Amazon Macie CLI commands with descriptions and handlers
 */
export const MacieCommands = {
  setup: {
    description: 'Setup Amazon Macie across AWS Organizations with delegated administration and other session settings',
    options,
    execute: MacieCommand.execute,
  },
};
