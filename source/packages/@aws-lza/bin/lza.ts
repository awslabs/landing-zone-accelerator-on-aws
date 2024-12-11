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
import { version } from '../package.json';
import { configureModuleCommands, main, parseArgs } from '../lib/cli';
import { CliInvokeArgumentType } from '../lib/cli/libraries/root';
import { ModuleCommands, Modules } from '../lib/cli/libraries/modules';

(async () => {
  try {
    let cli = yargs(hideBin(process.argv))
      .usage('Usage: $0 <module> <command> [options]')
      .strict()
      .version(false)
      .command({
        command: 'version',
        describe: 'Show version number',
        handler: () => {
          console.log(`lza: ${version}`);
          process.exit(0);
        },
      });

    Object.values(Modules).forEach(module => {
      cli = cli.command(module.name, module.description, yargs => {
        configureModuleCommands(module.name, ModuleCommands[module.name], yargs);
      });
    });

    cli = cli
      .demandCommand(1, `too few arguments, module and command is required`)
      .fail((msg, _, yargs) => {
        console.log(yargs.help());
        console.log(`lza: error: ${msg}`);
        process.exit(1);
      })
      .help()
      .alias('help', 'h')
      .wrap(null)
      .example('$0 control-tower create-landing-zone', 'Deploy AWS Control Tower Landing zone')
      .example('$0 organizations create-scp', 'Create Service Control Policy');

    const argv: CliInvokeArgumentType = await cli.parseAsync();
    const status = await main(parseArgs(argv));
    console.log(status);
  } catch (err) {
    console.error(err);
    throw err;
  }
})();
