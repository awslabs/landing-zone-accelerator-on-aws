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

import path from 'path';
import { createLogger } from '../../../@aws-lza/common/logger';
import { validateAndGetRunnerParameters } from '../lib/functions';
import { ModuleRunner } from '../index';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

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

process.on('unhandledRejection', reason => {
  console.error(reason);
  // eslint-disable-next-line no-process-exit
  process.exit(1);
});
