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
 * <li>--installerStackName The name of the installer cloudformation stack
 * <li>--keepBootstraps(optional) When this flag used CDK bootstrap stacks will be deleted
 * <li>--deleteData(optional) When this flag used S3 buckets, cloudwatch log groups etc. will be deleted.
 * <li>--deleteConfigRepo(optional) When this flag used configuration repository will be deleted.
 * <li>--deletePipelines(optional) When this flag used pipelined will be deleted.
 * <li>--ignoreTerminationProtection(optional) When this flag used termination protected stacks will be deleted.
 * </ul>
 * @example
 * ts-node uninstaller.ts --installer-stack-name <value> --keep-bootstraps --delete-data --delete-pipelines
 */
async function main(): Promise<string> {
  const start = new Date().getTime();
  const usage =
    '** Script Usage ** ts-node uninstaller.ts --installerStackName <value> [--partition] [--keepBootstraps] [--deleteData] [--deleteConfigRepo] [--deletePipelines] [--ignoreTerminationProtection]';

  const argv = yargs(hideBin(process.argv)).argv;
  const installerStackName = argv['installerStackName'] as string;
  if (installerStackName === undefined) {
    Logger.warn(`[uninstaller] Invalid --installerStackName ${installerStackName}`);
    throw new Error(usage);
  }

  const partition = (argv['partition'] as string) ?? 'aws';
  const keepBootstraps = (argv['keepBootstraps'] as boolean) ?? false;
  const deleteData = (argv['deleteData'] as boolean) ?? false;
  const deleteConfigRepo = (argv['deleteConfigRepo'] as boolean) ?? false;
  const deletePipelines = (argv['deletePipelines'] as boolean) ?? false;
  const ignoreTerminationProtection = (argv['ignoreTerminationProtection'] as boolean) ?? false;

  const acceleratorTool = new AcceleratorTool({
    installerStackName: installerStackName,
    partition: partition,
    keepBootstraps: keepBootstraps,
    deleteData: deleteData,
    deleteConfigRepo: deleteConfigRepo,
    deletePipelines: deletePipelines,
    ignoreTerminationProtection: ignoreTerminationProtection,
  });

  const status = await acceleratorTool.uninstallAccelerator(installerStackName);
  const elapsed = Math.round((new Date().getTime() - start) / 60000);

  return status
    ? `[uninstaller] Uninstallation completed successfully for installer stack "${installerStackName}". Elapsed time ~${elapsed} minutes`
    : `[uninstaller] Uninstallation failed for installer stack "${installerStackName}". Elapsed time ~${elapsed} minutes`;
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
