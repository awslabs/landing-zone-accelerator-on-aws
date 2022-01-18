/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { hideBin } from 'yargs/helpers';
import { AcceleratorTool } from './classes/accelerator-tool';
/**
 * AWS Platform Accelerator Uninstaller tool entry point.
 * Script Options:
 * <ul>
 * <li>--installer-stack-name The name of the installer cloudformation stack
 * <li>--keep-bootstraps to keep CDK bootstrap within every account of landing zone, default delete bootstrap (optional)
 * <li>--delete-data To delete data stored in S3 bucket, cloudwatch log group etc. default do not delete (optional)
 * <li>--delete-pipelines To delete accelerator pipelines and installer pipeline. default do not delete (optional)
 * </ul>
 * @example
 * ts-node uninstaller.ts --installer-stack-name <value> --keep-bootstraps --delete-data --delete-pipelines
 */
async function main(): Promise<string> {
  const start = new Date().getTime();
  const argv = yargs(hideBin(process.argv)).argv;
  if (!argv['installer-stack-name']) {
    console.warn('[PlatformAccelerator][Cleanup][ERROR] Missing required arguments!!!');
    console.warn(
      '[PlatformAccelerator][Cleanup][INFO] ** Script Usage ** ts-node uninstaller.ts --installer-stack-name <value> [--partition] [--keep-bootstraps] [--delete-data] [--delete-pipelines] [--ignore-termination-protection]',
    );
    process.exit(1);
  }

  const installerStackName = argv['installer-stack-name'] as string;
  const partition = (argv['partition'] as string) ?? 'aws';
  const keepBootstraps = (argv['keep-bootstraps'] as boolean) ?? false;
  const deleteData = (argv['delete-data'] as boolean) ?? false;
  const deletePipelines = (argv['delete-pipelines'] as boolean) ?? false;
  const ignoreTerminationProtection = (argv['ignore-termination-protection'] as boolean) ?? false;

  const acceleratorTool = new AcceleratorTool({
    installerStackName: installerStackName,
    partition: partition,
    keepBootstraps: keepBootstraps,
    deleteData: deleteData,
    deletePipelines: deletePipelines,
    ignoreTerminationProtection: ignoreTerminationProtection,
  });

  const status = await acceleratorTool.uninstallAccelerator(installerStackName);
  const elapsed = Math.round((new Date().getTime() - start) / 60000);

  return status
    ? `[PlatformAccelerator][Cleanup][INFO] Uninstallation completed successfully for installer stack "${installerStackName}". Elapsed time ~${elapsed} minutes`
    : `[PlatformAccelerator][Cleanup][ERROR] Uninstallation failed for installer stack "${installerStackName}". Elapsed time ~${elapsed} minutes`;
}

/**
 * Main function
 */
main().then(data => {
  console.log(data);
});
