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
 * @fileoverview CLI Root Handler - Common utilities and types for CLI operations
 *
 * Provides shared utilities, type definitions, and common functionality for all CLI
 * command handlers. Includes configuration parsing, session management, error handling,
 * and common CLI option definitions.
 *
 * Key capabilities:
 * - Configuration file and JSON string parsing
 * - AWS session context management
 * - Common CLI option definitions
 * - Error logging and exit handling
 * - Type definitions for CLI operations
 */

import fs from 'fs';
import { getCurrentSessionDetails } from '../../common/sts-functions';
import { ISessionContext } from '../../common/interfaces';
import path from 'path';
import { createLogger } from '../../common/logger';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Generic configuration object type for CLI operations
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ConfigurationObjectType = Record<string, any>;

/**
 * Type definition for CLI invocation arguments from yargs
 */
export type CliInvokeArgumentType = {
  /** Positional arguments */
  _: (string | number)[];
  /** Optional output format */
  output?: 'json' | 'text' | 'table';
  /** Additional named arguments */
  [x: string]: unknown;
};

/**
 * Type definition for CLI execution parameters passed to handlers
 */
export type CliExecutionParameterType = {
  /** Name of the module being executed */
  moduleName: string;
  /** Name of the command being executed */
  commandName: string;
  /** Parsed CLI arguments */
  args: CliInvokeArgumentType;
};

/**
 * Type definition for CLI command options configuration
 */
export type CommandOptionsType = {
  [key: string]: {
    /** Option value type */
    type: 'string' | 'boolean';
    /** Option description for help text */
    description: string;
    /** Optional short alias for the option */
    alias?: string;
    /** Default value for boolean options */
    default?: boolean;
    /** Whether the option is required */
    required?: boolean;
  };
};

/**
 * Type definition for CLI command details and execution
 */
export type CliCommandDetailsType = {
  /** Command description for help text */
  description: string;
  /** Optional command-specific options */
  options?: CommandOptionsType[];
  /** Command execution handler */
  execute(args: CliExecutionParameterType): Promise<string>;
};

/**
 * Type definition for module details and available commands
 */
export type ModuleDetailsType = {
  /** Module name */
  name: string;
  /** Module description */
  description: string;
  /** Available commands for the module */
  commands: Record<string, CliCommandDetailsType>;
};

/**
 * Common CLI options available across all commands
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
  {
    region: {
      alias: 'r',
      type: 'string',
      description: 'AWS region for the session',
    },
  },
];

/**
 * Parses configuration from file path or JSON string
 * @param configArg - Configuration argument (file:// path or JSON string)
 * @returns Parsed configuration object
 */
export function getConfig(configArg: string): ConfigurationObjectType {
  if (configArg.startsWith('file://')) {
    const filePath = configArg.slice(7);
    if (!fs.existsSync(filePath)) {
      logErrorAndExit(
        `An error occurred (MissingConfigurationFile): The configuration file ${filePath} does not exists.`,
      );
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return JSON.parse(configArg);
}

/**
 * Retrieves AWS session context from CLI parameters
 * @param param - CLI execution parameters
 * @returns Promise resolving to session context
 */
export async function getSessionDetailsFromArgs(param: CliExecutionParameterType): Promise<ISessionContext> {
  const region =
    typeof param.args['region'] === 'string' ? param.args['region'] : process.env['AWS_REGION'] || 'us-east-1';

  logger.info(`Getting current session details for region ${region}`);
  return getCurrentSessionDetails({ region });
}

/**
 * Logs error message to console with CLI prefix
 * @param message - Error message to log
 */
export function logError(message: string): void {
  console.error(`aws-lza: error: ${message}`);
}

/**
 * Logs error message and exits process with specified code
 * @param message - Error message to log
 * @param exitCode - Exit code (default: 1)
 */
export function logErrorAndExit(message: string, exitCode: number = 1): never {
  logError(message);
  process.exit(exitCode);
}
