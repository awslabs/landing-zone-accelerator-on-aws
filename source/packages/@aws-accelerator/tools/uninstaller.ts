/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { Logger } from '../accelerator/lib/logger';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { AcceleratorTool } from './lib/classes/accelerator-tool';
/**
 * AWS Accelerator Uninstaller tool entry point.
 * Script Options:
 * <ul>
 * <li>--installer-stack-name The name of the installer cloudformation stack
 * <li>--partition AWS partition
 * <li>--debug Display debug logs
 * <li>--installer-delete When this flag is set to true installer stack and pipeline will be deleted
 * <li>--full-destroy(optional) When this flag is set to true every resources related to LZ Accelerator will be deleted, except installer-delete other flags will be ignored when full-destroy is set to true. Default is false
 * <li>--delete-data(optional) When this flag is set to true S3 buckets, cloudwatch log groups etc. will be deleted.
 * <li>--delete-config-repo(optional) When this flag is set to true configuration repository will be deleted.
 * <li>--keep-bootstraps(optional) When this flag is set to true CDK bootstrap stacks will be deleted
 * <li>--delete-pipelines(optional) When this flag is set to true pipelined will be deleted.
 * <li>--ignore-termination-protection(optional) When this flag is set to true termination protected stacks will be deleted.
 * <li>--stage-name(optional) Name of the LZ Accelerator pipeline stage. When this parameter is available LZ Accelerator pipeline from the given stage to the end of the pipeline will be deleted. Default is set to all.
 * <li>--action-name(optional) Name of the LZ Accelerator pipeline stage action. When this parameter is available LZ Accelerator pipeline from the given stage action to the end of the pipeline will be deleted. Default is set to all.
 *
 * </ul>
 * @example
 * ts-node uninstaller.ts --installer-stack-name <value> --keep-bootstraps --delete-data --delete-pipelines
 */
const scriptUsage =
  'Usage: yarn run ts-node --transpile-only uninstaller.ts --installer-stack-name <INSTALLER_STACK_NAME> --partition <PARTITION> [--debug] [--installer-delete] [--full-destroy] [--delete-data] [--delete-pipelines] [--delete-config-repo] [--ignore-termination-protection]  [--stage-name] <STAGE_NAME> [--action-name] <ACTION_NAME>';
async function main(): Promise<string> {
  const start = new Date().getTime();
  const usage = `** Script Usage ** ${scriptUsage}`;

  const argv = yargs(hideBin(process.argv)).argv;
  const installerStackName = argv['installerStackName'] as string;
  if (installerStackName === undefined) {
    Logger.warn(`[uninstaller] Invalid --installerStackName ${installerStackName}`);
    throw new Error(usage);
  }

  const partition = (argv['partition'] as string) ?? 'aws';
  const fullDestroy = (argv['fullDestroy'] as boolean) ?? false;
  const debug = (argv['debug'] as boolean) ?? false;

  let stageName = 'all';
  let actionName = 'all';
  let deleteBootstraps = true;
  let deleteData = true;
  let deletePipelines = true;
  let ignoreTerminationProtection = true;

  if (!fullDestroy) {
    stageName = (argv['stageName'] as string) ?? 'all';
    actionName = (argv['actionName'] as string) ?? 'all';
    deleteBootstraps = (argv['deleteBootstraps'] as boolean) ?? false;
    deleteData = (argv['deleteData'] as boolean) ?? false;
    deletePipelines = (argv['deletePipelines'] as boolean) ?? false;
    ignoreTerminationProtection = (argv['ignoreTerminationProtection'] as boolean) ?? false;

    if (stageName !== 'all' && actionName !== 'all') {
      console.log(`Only one property of stageName and actionName can be provided.`);
      throw new Error(`Usage: ${scriptUsage}`);
    }
  }

  const installerDelete = (argv['installerDelete'] as boolean) ?? false;
  const deleteConfigRepo = (argv['deleteConfigRepo'] as boolean) ?? false;

  const acceleratorTool = new AcceleratorTool({
    debug,
    installerStackName,
    stageName,
    actionName,
    partition,
    deleteBootstraps,
    deleteData,
    deleteConfigRepo,
    deletePipelines,
    ignoreTerminationProtection,
    installerDelete,
  });

  const status = await acceleratorTool.uninstallAccelerator(installerStackName);
  const elapsed = Math.round((new Date().getTime() - start) / 60000);

  return status
    ? `[uninstaller] Un-installation completed successfully for installer stack "${installerStackName}". Elapsed time ~${elapsed} minutes`
    : `[uninstaller] Un-installation failed for installer stack "${installerStackName}". Elapsed time ~${elapsed} minutes`;
}

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  // eslint-disable-next-line no-process-exit
  process.exit(1);
});

/**
 * Call Main function
 */
main().then(data => {
  Logger.info(data);
});
