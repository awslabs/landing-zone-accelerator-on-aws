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
import { main } from '../lib/cli/lza-cli';
import { CliInvokeArgumentType } from '../lib/cli/handlers/root';
import { Commands } from '../lib/cli/commands/registry';
import { exit } from 'process';
import { IModuleResponse } from '../lib/common/interfaces';

function formatOutput(data: string | IModuleResponse<unknown>, format: string = 'json'): string {
  if (typeof data === 'string') {
    return data;
  }

  const responses = Array.isArray(data) ? data : [data];

  switch (format) {
    case 'text':
      return responses
        .map(item => {
          let output = `${item.moduleName}\t${item.status}\t${item.message}`;
          if (item.data) {
            output += `\nData:\n${JSON.stringify(item.data, null, 2)}`;
          }
          return output;
        })
        .join('\n\n');

    case 'table':
      const headers = 'MODULE\t\tSTATUS\t\tMESSAGE';
      const separator = '------\t\t------\t\t-------';
      const rows = responses.map(item => {
        let row = `${item.moduleName.padEnd(15)}\t${item.status.padEnd(10)}\t${item.message}`;
        if (item.data) {
          row += `\n\nDetailed Data:\n${JSON.stringify(item.data, null, 2)}`;
        }
        return row;
      });
      return [headers, separator, ...rows].join('\n');

    default: // json
      return JSON.stringify(responses, null, 2);
  }
}

export async function runLzaCli(): Promise<void> {
  try {
    let cli = yargs(hideBin(process.argv))
      .usage('Usage: $0 <command> <resource> [options]')
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

    // Dynamically register commands from Commands registry
    Object.entries(Commands).forEach(([verbName, verb]) => {
      cli = cli.command(verbName, verb.description, yargs => {
        // Register resources for each command
        Object.entries(verb.resources).forEach(([resourceName, resource]) => {
          yargs.command({
            command: resourceName,
            describe: resource.description,
            builder:
              resource.options?.reduce((prev, curr) => {
                const optionKey = Object.keys(curr)[0];
                const optionValue = curr[optionKey];
                return {
                  ...prev,
                  [optionKey]: optionValue,
                };
              }, {}) || {},
            handler: async () => undefined,
          });
        });
        yargs.demandCommand(1, `Resource is required for ${verbName} command`);
      });
    });

    // Output option
    cli = cli.option('output', {
      type: 'string',
      choices: ['json', 'text', 'table'],
      default: 'json',
      describe: 'Output format',
    });

    // Final CLI settings
    cli = cli
      .demandCommand(1, `too few arguments, command and resource are required`)
      .fail((msg, _, yargs) => {
        console.log(yargs.help());
        console.log(`lza: error: ${msg}`);
        process.exit(1);
      })
      .help()
      .alias('help', 'h')
      .wrap(null)
      .example('$0 setup macie', 'Setup Amazon Macie')
      .example('$0 setup control-tower', 'Setup AWS Control Tower')
      .epilog('For more information, visit https://awslabs.github.io/landing-zone-accelerator-on-aws');

    // Parse arguments and execute
    const argv: CliInvokeArgumentType = await cli.parseAsync();
    const status = await main(argv);
    console.log(formatOutput(status, argv.output as string));
  } catch (err) {
    // Handle execution errors with proper formatting
    if (err instanceof Error) {
      console.error(`lza: error: ${err.message}`);
    } else {
      console.error(`lza: error: ${err}`);
    }
    exit(1);
  }
}

// Execute the CLI
runLzaCli();
