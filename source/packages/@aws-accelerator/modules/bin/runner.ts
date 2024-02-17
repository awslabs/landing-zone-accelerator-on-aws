import yargs from 'yargs';
import path from 'path';
import { version } from '../../../../package.json';
import { ModuleRunnerParametersType } from '../common/resources';
import { ModuleRunner } from '../lib/module-runner';

import { createLogger } from '@aws-accelerator/utils';
import { AcceleratorStage } from '../../accelerator/lib/accelerator-stage';

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
    'Usage: yarn run ts-node packages/@aws-accelerator/modules/bin/runner.ts --module <MODULE_NAME> --stage <STAGE_NAME> --partition <PARTITION> --account-id <ACCOUNT_ID> --region <REGION> --use-existing-role <Yes/No> --config-dir <CONFIG_DIR_PATH> ';

  const argv = yargs(process.argv.slice(2))
    .options({
      module: { type: 'string', default: undefined },
      'config-dir': { type: 'string', default: undefined },
      stage: { type: 'string', default: undefined },
      partition: { type: 'string', default: undefined },
      'use-existing-role': { type: 'string', default: undefined },
    })
    .parseSync();

  if (!argv.module || !argv['config-dir'] || !argv.stage || !argv.partition || !argv['use-existing-role']) {
    throw new Error(`Missing required parameters for module ${argv.module} \n ** Script Usage ** ${scriptUsage}`);
  }

  const validStageNames: string[] = Object.values(AcceleratorStage);

  if (!validStageNames.includes(argv.stage.toLocaleLowerCase())) {
    throw new Error(`Invalid stage ${argv.stage}, valid stage names are [${validStageNames.join(',')}]`);
  }

  return {
    module: argv.module,
    options: {
      configDirPath: argv['config-dir'],
      stage: argv.stage.toLocaleLowerCase(),
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
