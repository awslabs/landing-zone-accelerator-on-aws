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
 * @fileoverview LZA CLI Main Entry Point - Command-line interface for AWS Landing Zone Accelerator
 *
 * Provides the main entry point and command configuration for the AWS Landing Zone Accelerator
 * command-line interface. Handles command parsing, validation, and execution routing for
 * various AWS service modules and operations.
 *
 * Key capabilities:
 * - Command and resource validation
 * - Dynamic command routing and execution
 * - Yargs integration for CLI argument parsing
 * - Module-specific command configuration
 * - Help system and error handling
 */

import { CliInvokeArgumentType, CliCommandDetailsType } from './handlers/root';
import { Argv } from 'yargs';
import { Commands } from './commands/registry';
import { IModuleResponse } from '../common/interfaces';

/**
 * Main CLI entry point that processes command-line arguments and executes appropriate handlers
 * @template T - Type of the module response data
 * @param argv - Parsed command-line arguments from yargs
 * @returns Promise resolving to execution result or error message
 */
export async function main<T = unknown>(argv: CliInvokeArgumentType): Promise<string | IModuleResponse<T>> {
  if (argv['help'] || argv['h']) {
    return '';
  }

  const verbName = argv._[0]?.toString();
  const resourceName = argv._[1]?.toString();

  if (!verbName || !resourceName) {
    return 'Usage: lza <command> <resource> [options]';
  }

  const verb = Commands[verbName as keyof typeof Commands];
  if (!verb) {
    return `Invalid command "${verbName}"`;
  }

  const resource = verb.resources[resourceName as keyof typeof verb.resources];
  if (!resource) {
    return `Invalid resource "${resourceName}" for command "${verbName}"`;
  }

  return resource.execute({
    moduleName: resourceName,
    commandName: verbName,
    args: argv,
  }) as Promise<string | IModuleResponse<T>>;
}

/**
 * Configures yargs with module-specific commands and options
 * @param moduleName - Name of the module being configured
 * @param commands - Command definitions for the module
 * @param yargs - Yargs instance to configure
 * @returns Configured yargs instance with commands and options
 */
export function configureModuleCommands(
  moduleName: string,
  commands: Record<string, CliCommandDetailsType>,
  yargs: Argv<object>,
): Argv<object> {
  const hasDefaultCommand = '' in commands;

  if (hasDefaultCommand) {
    const defaultCommand = commands[''];
    const builder =
      defaultCommand.options?.reduce((previousValue, currentValue) => {
        const optionKey = Object.keys(currentValue)[0];
        const optionValue = currentValue[optionKey];
        return {
          ...previousValue,
          [optionKey]: optionValue,
        };
      }, {}) || {};

    return yargs
      .options(builder)
      .middleware(argv => {
        // Check for invalid subcommand before help processing
        if (argv._[1] && !argv['help'] && !argv['h']) {
          console.log(
            `lza: error: Invalid subcommand "${argv._[1]}" for module "${moduleName}". This module does not accept subcommands.`,
          );
          process.exit(1);
        }
      })
      .help()
      .alias('help', 'h');
  } else {
    Object.entries(commands).map(([name, command]) => {
      yargs.command({
        command: name,
        describe: command.description,
        builder:
          command.options?.reduce((previousValue, currentValue) => {
            const optionKey = Object.keys(currentValue)[0];
            const optionValue = currentValue[optionKey];
            return {
              ...previousValue,
              [optionKey]: optionValue,
            };
          }, {}) || {},
        handler: async () => undefined,
      });
    });

    return yargs
      .strict(true)
      .demandCommand(1, `too few arguments, command is required for ${moduleName} module`)
      .help()
      .alias('help', 'h');
  }
}
