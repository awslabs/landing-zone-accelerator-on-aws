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
import { CliInvokeArgumentType, CliCommandDetailsType } from './libraries/root';
import { Modules } from './modules';
import { Argv } from 'yargs';

/**
 * main function to invoke aws-lza execution
 * @param argv {@link CliInvokeArgumentType}
 */
export async function main(argv: CliInvokeArgumentType): Promise<string> {
  const moduleName = argv._[0].toString();
  const commandName = argv._[1].toString();

  const module = Object.values(Modules).find(module => module.name === moduleName);
  if (module === undefined) {
    return `Invalid module "${moduleName}"`;
  }

  const command = module.commands[commandName];
  if (command === undefined) {
    return `Invalid command "${commandName}" for module "${moduleName}"`;
  }

  return command.execute({
    moduleName,
    commandName,
    args: argv,
  });
}

/**
 * Function to configure module commands
 * @param moduleName string
 * @param commands Record<string, {@link CliCommandDetailsType}>
 * @param yargs {@link Argv<object>}
 * @returns yargs {@link Argv<object>}
 */
export function configureModuleCommands(
  moduleName: string,
  commands: Record<string, CliCommandDetailsType>,
  yargs: Argv<object>,
): Argv<object> {
  Object.entries(commands).map(([name, command]) => {
    yargs
      .command({
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
