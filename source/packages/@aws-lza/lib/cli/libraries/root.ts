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
 * Configuration object type
 *
 * @description
 * This is the type used when reading json configuration file or parsing json string
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ConfigurationObjectType = Record<string, any>;

/**
 * Cli argument type
 *
 * @description
 * This is the type used when CLI is invoked to validate arguments
 */
export type CliInvokeArgumentType = {
  _: (string | number)[];
  [x: string]: unknown;
};

/**
 * CLI execution time parameter type
 *
 * @description
 * This type is used to invoke backend code to execute CLI command for the module
 */
export type CliExecutionParameterType = {
  moduleName: string;
  command: string;
  [x: string]: unknown;
};

/**
 * Commands option type
 */
export type CommandOptionsType = {
  [key: string]: {
    type: 'string' | 'boolean';
    description: string;
    alias?: string;
    default?: boolean;
    required?: boolean;
  };
};

/**
 * CLI Command details type
 */
export type CliCommandDetailsType = { name: string; description: string; options?: CommandOptionsType[] };

/**
 * Module details type
 */
export type ModuleDetailsType = {
  name: string;
  /**
   * Description of the module
   */
  description: string;
};

/**
 * Common options for CLI
 */
export const CliCommonOptions: CommandOptionsType[] = [
  {
    verbose: {
      alias: 'v',
      type: 'boolean',
      description: 'Run with verbose logging',
      default: false,
    },
  },
  {
    'dry-run': {
      type: 'boolean',
      description: 'Run the command in dry run mode',
      default: false,
    },
  },
];
