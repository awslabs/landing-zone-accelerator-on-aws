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
import fs from 'fs';
import { CliResources } from './resources';
import {
  CliInvokeArgumentType,
  CliExecutionParameterType,
  ConfigurationObjectType,
  CliCommandDetailsType,
} from './libraries/root';
import { CliActivity } from './activities';
import { Modules } from './libraries/modules';
import { Argv } from 'yargs';

/**
 * Function to parse arguments
 * @returns params {@link CliExecutionParameterType}
 */
export function parseArgs(argv: CliInvokeArgumentType): CliExecutionParameterType {
  const moduleName = argv._[0].toString();
  const command = argv._[1].toString();
  const configArg = argv['configuration'] as string;
  let configuration: ConfigurationObjectType | undefined;

  const cliExecutionParameter: CliExecutionParameterType = { moduleName, command };

  //
  // Validate configuration
  //
  if (configArg) {
    validateConfigParameter(configArg, command, moduleName, cliExecutionParameter, configuration);
  }

  for (const [key, value] of Object.entries(argv)) {
    if (!Object.keys(cliExecutionParameter).includes(key)) {
      cliExecutionParameter[key] = value;
    }
  }

  return cliExecutionParameter;
}

/**
 * Function to validate module configuration
 * @param moduleName string
 * @param config Record<string, any>
 */
export function validModuleConfiguration(moduleName: string, config: ConfigurationObjectType): boolean {
  switch (moduleName) {
    case Modules.CONTROL_TOWER.name:
      return CliResources.validControlTowerConfig(config);
    case Modules.ORGANIZATIONS.name:
      return true;
    default:
      printInvalidModuleNameStatus();
      process.exit(1);
  }
}

/**
 * Function to print invalid module name status
 */
export function printInvalidModuleNameStatus() {
  console.error(`lza: error: argument module: Invalid choice, valid choices are:`);
  for (const moduleName of Object.keys(Modules)) {
    const position = Object.keys(Modules).indexOf(moduleName) + 1;
    console.log(`${position}. ${moduleName}\n`);
  }
}

/**
 * main function to invoke aws-lza execution
 * @param params {@link CliExecutionParameterType}
 */
export async function main(params: CliExecutionParameterType): Promise<string> {
  switch (params.moduleName) {
    case Modules.CONTROL_TOWER.name:
      return await CliActivity.executeControlTowerLandingZoneModule(params);
    case Modules.ORGANIZATIONS.name:
      return 'Module yet to develop';
  }

  return `Invalid Module ${params.moduleName}`;
}

/**
 * Function to configure module commands
 * @param moduleName string
 * @param commands {@link CliCommandDetailsType}[]
 * @param yargs {@link Argv<object>}
 * @returns yargs {@link Argv<object>}
 */
export function configureModuleCommands(
  moduleName: string,
  commands: CliCommandDetailsType[],
  yargs: Argv<object>,
): Argv<object> {
  commands.forEach(command => {
    yargs
      .command({
        command: command.name,
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
      })
      .fail((msg, _, yargs) => {
        console.log(yargs.help());
        console.log(`lza: error: ${msg}`);
        process.exit(1);
      });
  });

  return yargs
    .demandCommand(1, `too few arguments, command is required for ${moduleName} module`)
    .fail((msg, _, yargs) => {
      console.log(yargs.help());
      console.log(`lza: error: ${msg}`);
      process.exit(1);
    })
    .help()
    .alias('help', 'h');
}

/**
 * Function to validate config parameter
 * @param configArg string
 * @param command string
 * @param moduleName string
 * @param cliExecutionParameter {@link CliExecutionParameterType}
 * @param configuration {@link ConfigurationObjectType}
 */
function validateConfigParameter(
  configArg: string,
  command: string,
  moduleName: string,
  cliExecutionParameter: CliExecutionParameterType,
  configuration?: ConfigurationObjectType,
) {
  try {
    if (configArg.startsWith('file://')) {
      const filePath = configArg.slice(7);
      if (!fs.existsSync(filePath)) {
        console.error(
          `lza: error: An error occurred (MissingConfigurationFile) when calling the ${command} for ${moduleName} module: The configuration file ${filePath} does not exists.`,
        );
        process.exit(1);
      }
      configuration = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } else {
      configuration = JSON.parse(configArg);
    }

    if (!validModuleConfiguration(moduleName, configuration!)) {
      console.error(
        `lza: error: An error occurred (InvalidConfiguration) when calling the ${command} for ${moduleName} module: Missing required properties in configuration JSON.`,
      );
      process.exit(1);
    }

    cliExecutionParameter['configuration'] = configuration;
  } catch (error) {
    console.error(
      `lza: error: An error occurred (MalformedConfiguration) when calling the ${command} for ${moduleName} module: The configuration contains invalid Json. Error: \n ${error}`,
    );
    process.exit(1);
  }
}
