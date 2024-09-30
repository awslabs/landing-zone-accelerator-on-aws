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

import yargs from 'yargs';
import path from 'path';
import { version } from '../../../../package.json';
import { ModuleRunnerParametersType } from '../common/resources';
import { ModuleRunner } from '../lib/module-runner';

import { createLogger } from '@aws-accelerator/utils';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Function to validate and get module runner parameters
 * @returns
 */
function validateAndGetRunnerParameters(): ModuleRunnerParametersType {
  /**
   * Module runner command with option to execute the command.
   */
  const scriptUsage =
    'Usage: yarn run ts-node packages/@aws-accelerator/lza-modules/bin/runner.ts --module <MODULE_NAME> --partition <PARTITION> --account-id <ACCOUNT_ID> --region <REGION> --use-existing-role <Yes/No> --config-dir <CONFIG_DIR_PATH> ';

  const argv = yargs(process.argv.slice(2))
    .options({
      module: { type: 'string', default: undefined },
      'config-dir': { type: 'string', default: undefined },
      partition: { type: 'string', default: undefined },
      'use-existing-role': { type: 'string', default: undefined },
    })
    .parseSync();

  if (!argv.module || !argv['config-dir'] || !argv.partition || !argv['use-existing-role']) {
    throw new Error(`Missing required parameters for module ${argv.module} \n ** Script Usage ** ${scriptUsage}`);
  }

  return {
    module: argv.module,
    options: {
      configDirPath: argv['config-dir'],
      partition: argv.partition,
      useExistingRole: argv['use-existing-role'].toLocaleLowerCase() === 'yes',
      solutionId: `AwsSolution/SO0199/${version}`,
    },
  };
}

process.on('unhandledRejection', reason => {
  console.error(reason);
  // eslint-disable-next-line no-process-exit
  process.exit(1);
});

/**
 * Main function to invoke accelerator runner
 * @returns status string
 */
async function main(): Promise<string> {
  //validate and get runner parameters
  const runnerParams = validateAndGetRunnerParameters();

  return await ModuleRunner.execute(runnerParams);
}

/**
 * Call Main function
 */
(async () => {
  try {
    const status = await main();
    logger.info(status);
  } catch (err) {
    logger.error(err);
    throw err;
  }
})();
