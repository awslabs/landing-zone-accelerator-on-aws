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

import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs';
import { version } from '../package.json';

import { Operations } from '../common/resources';
import { CliActivity, CliResources, IAwsLzaParameter } from './cli-resources';

/**
 * Cli argument type
 */
type CliArgumentType = {
  [x: string]: unknown;
  verbose: boolean | undefined;
  wait: boolean;
  configuration: string | undefined;
  partition: string | undefined;
  account: string | undefined;
  region: string | undefined;
  _: (string | number)[];
  $0: string;
};

const Modules = {
  CONTROL_TOWER: 'control-tower',
  ORGANIZATIONS: 'organizations',
};

const ModuleCommands: Record<string, string[]> = {
  [Modules.CONTROL_TOWER]: [],
  [Modules.ORGANIZATIONS]: ['create-scp', 'create-ou'],
};

/**
 * Function to parse arguments
 * @returns params {@link IAwsLzaParameter}
 */
function parseArgs(argv: CliArgumentType): IAwsLzaParameter {
  //
  // Validate operation
  //
  const operation = argv._[0].toString();
  const acceptedOperations = Object.values(Operations);
  if (!acceptedOperations.includes(operation)) {
    console.error(`lza: error: argument operation: Invalid choice, valid choices are:\n`);
    for (const operationName of acceptedOperations) {
      const position = acceptedOperations.indexOf(operationName) + 1;
      console.log(`${position}. ${operationName}\n`);
    }
    process.exit(1);
  }

  //
  // Validate module name
  //
  const moduleName = argv._[1].toString();
  const acceptedModules = Object.values(Modules);
  if (!acceptedModules.includes(moduleName)) {
    console.error(`lza: error: argument module: Invalid choice, valid choices are:\n`);
    for (const moduleName of acceptedModules) {
      const position = acceptedModules.indexOf(moduleName) + 1;
      console.log(`${position}. ${moduleName}\n`);
    }
    process.exit(1);
  }

  //
  // Validate configuration
  //
  const configArg = argv.configuration;
  if (!configArg) {
    console.error('lza: error: The configuration parameter is required.');
    process.exit(1);
  }

  //
  // Set command
  //
  let command: string | undefined;

  if (argv._[2]) {
    command = argv._[2].toString();
  }

  try {
    let configuration = {};
    if (configArg.startsWith('file://')) {
      const filePath = configArg.slice(7);
      configuration = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } else {
      configuration = JSON.parse(configArg);
    }

    validateModuleConfiguration(moduleName, configuration);

    return {
      operation,
      moduleName,
      command,
      configuration,
      partition: argv.partition,
      region: argv.region,
      account: argv.account,
      verbose: argv.verbose,
      wait: argv.wait,
    };
  } catch (error) {
    console.error(
      `An error occurred (MalformedConfiguration) when calling the ${operation} for ${moduleName} module: This configuration contains invalid Json. Error: \n ${error}`,
    );
    process.exit(1);
  }
}

/**
 * Function to validate module configuration
 * @param moduleName string
 * @param config Record<string, any>
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateModuleConfiguration(moduleName: string, config: Record<string, any>): boolean {
  switch (moduleName) {
    case Modules.CONTROL_TOWER:
      return CliResources.validControlTowerConfig(config);
    case Modules.ORGANIZATIONS:
      return true;
    default:
      printInvalidModuleNameStatus();
      process.exit(1);
  }
}

/**
 * Function to validate module command
 * @param moduleName string
 * @param command string
 */
function validateCommandForModule(moduleName: string, command?: string) {
  if (!command) {
    return;
  }
  const acceptedCommands = ModuleCommands[moduleName];

  if (acceptedCommands.length === 0) {
    console.error(`lza: error: argument command: Module ${moduleName} does not support any command:`);
    process.exit(1);
  } else {
    if (!acceptedCommands.includes(command)) {
      console.error(
        `lza: error: argument command for ${moduleName} module: Invalid choice ${command}, valid choices are:`,
      );
      for (const moduleCommand of acceptedCommands) {
        const position = acceptedCommands.indexOf(moduleCommand) + 1;
        console.log(`${position}. ${moduleCommand}\n`);
      }
      process.exit(1);
    }
  }
}

/**
 * Function to print invalid module name status
 */
function printInvalidModuleNameStatus() {
  console.error(`lza: error: argument module: Invalid choice, valid choices are:`);
  for (const moduleName of Object.keys(Modules)) {
    const position = Object.keys(Modules).indexOf(moduleName) + 1;
    console.log(`${position}. ${moduleName}\n`);
  }
}

/**
 * main function to invoke aws-lza execution
 * @param params {@link IAwsLzaParameter}
 */
async function main(params: IAwsLzaParameter): Promise<string> {
  validateCommandForModule(params.moduleName, params.command);
  switch (params.moduleName) {
    case Modules.CONTROL_TOWER:
      return await CliActivity.executeControlTowerLandingZoneModule(params);
    case Modules.ORGANIZATIONS:
      validateCommandForModule(params.moduleName, params.command);
      return 'Module yet to develop';
    default:
      printInvalidModuleNameStatus();
      process.exit(1);
  }
}

/**
 * Invoke main function
 */
(async () => {
  try {
    /**
     * Cli arguments
     */
    const argv: CliArgumentType = yargs(hideBin(process.argv))
      .version(version)
      .command('operation module', 'Operation to be performed on the module')
      .option('verbose', {
        alias: 'v',
        type: 'boolean',
        description: 'Run with verbose logging',
      })
      .option('wait', {
        alias: 'w',
        type: 'boolean',
        description:
          'Determines whether the CLI should wait for the operation to complete before exiting. If set, the CLI will wait and display a message when the operation is finished. If not set, the CLI will exit immediately after starting the operation.',
        default: false,
      })
      .option('configuration', {
        alias: 'c',
        type: 'string',
        description: 'Path to module configuration file (file://configuration.json) or configuration as a JSON string',
        // required: true,
      })
      .option('partition', {
        alias: 'p',
        type: 'string',
        description: 'AWS Partition',
      })
      .option('account', {
        alias: 'a',
        type: 'string',
        description: 'AWS Account Id',
      })
      .option('region', {
        alias: 'r',
        type: 'string',
        description: 'AWS Region',
      })
      .demandCommand(2, 'lza: error: too few arguments, operation and module is required')
      .help()
      .alias('help', 'h')
      .example('$0 deploy control-tower', 'Deploy AWS Control Tower Landing zone')
      .example('$0 deploy organizations create-scp', 'Create SCP')
      .parseSync();

    const status = await main(parseArgs(argv));
    console.log(status);
  } catch (err) {
    console.error(err);
    throw err;
  }
})();
