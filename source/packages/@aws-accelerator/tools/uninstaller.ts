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
import yargs from 'yargs';

import { createLogger } from '@aws-accelerator/utils';

import { AcceleratorTool } from './lib/classes/accelerator-tool';

/**
 * AWS Accelerator Uninstaller tool entry point.
 * Script Options:
 * <ul>
 * <li>--installer-stack-name The name of the installer cloudformation stack
 * <li>--partition AWS partition
 * <li>--debug Display debug logs
 * <li>--full-destroy When used, uninstaller will delete everything, including installer stack and pipeline and LZA pipeline stack and pipeline.
 * Any other flags used with full-destroy will be disregarded.
 * <li>--delete-accelerator
 * a) When this flag is set to true delete every CFN stacks (override termination protection) deployed by LZA pipeline.
 * b) Delete every resources deployed by LZA pipeline stacks, if keep-data flag is used S3 and CW logs will not be deleted.
 * c) Bootstrap stacks will be deleted unless keep-bootstraps flag is used
 * d) LZA pipeline and config repo will be deleted unless keep-pipeline flag is used
 * e) stage-name and action-name flags will be disregarded
 * <ul>
 * <li>--keep-pipeline This flag is used along with delete-accelerator flag to reduce scope of uninstaller. When used, LZA pipeline and config repo will not be deleted
 * <li>--keep-data This flag is used along with delete-accelerator flag to reduce scope of uninstaller.When used, S3 and CW logs will not be deleted.
 * This flag is not applicable to bootstrap stack buckets, bootstrap stacks bucket deletion depends on keep-bootstraps flag.
 * <li>-- This flag is used along with delete-accelerator flag to reduce scope of uninstaller. When used, bootstrap stacks will not be deleted
 * </ul>
 * <li>--stage-name When used, delete every CFN stacks and resources from the pipeline stage name to the end of the pipeline. If keep-data is used S3 and CW logs will not be deleted. action-name flag will be disregarded.
 * <li>--action-name When used, delete every CFN stacks and resources from the pipeline stage action to the end of the pipeline. If keep-data is used S3 and CW logs will not be deleted.
 * </ul>
 * @example
 * ts-node uninstaller.ts --installer-stack-name <value> --partition <value> --full-destroy
 */

const logger = createLogger(['uninstaller']);
const scriptUsage =
  'Usage: yarn run ts-node --transpile-only uninstaller.ts --installer-stack-name <INSTALLER_STACK_NAME> --partition <PARTITION> [--debug] [--full-destroy] [--delete-accelerator] [--keep-pipeline] [--keep-data] [--keep-bootstraps] [--stage-name] <STAGE_NAME> [--action-name] <ACTION_NAME>';
async function main(): Promise<string> {
  const usage = `** Script Usage ** ${scriptUsage}`;

  const argv = yargs(process.argv.slice(2))
    .options({
      installerStackName: { type: 'string', default: 'AWSAccelerator-InstallerStack' },
      partition: { type: 'string', default: 'aws' },
      debug: { type: 'boolean', default: false },
      fullDestroy: { type: 'boolean', default: false },
      deleteAccelerator: { type: 'boolean', default: false },
      stageName: { type: 'string', default: 'all' },
      actionName: { type: 'string', default: 'all' },
    })
    .parseSync();

  const installerStackName = argv.installerStackName;

  const partition = argv.partition;
  const debug = argv.debug;
  const ignoreTerminationProtection = true;

  const fullDestroy = argv.fullDestroy;
  const deleteAccelerator = argv.deleteAccelerator;

  let stageName = argv.stageName;
  let actionName = argv.actionName;

  let keepPipelineAndConfig = false;
  let keepData = false;
  let keepBootstraps = false;

  //
  // Validate parameters
  const errorMessage = validateDeleteOptions(installerStackName, fullDestroy, deleteAccelerator, stageName, actionName);

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  // When full destroy option provided
  if (fullDestroy) {
    stageName = 'all';
    actionName = 'all';

    return await uninstaller(
      installerStackName,
      partition,
      debug,
      ignoreTerminationProtection,
      fullDestroy,
      deleteAccelerator,
      keepPipelineAndConfig,
      keepData,
      keepBootstraps,
      stageName,
      actionName,
    );
  }

  // When delete accelerator option provided
  if (deleteAccelerator) {
    keepPipelineAndConfig = (argv['keepPipelineAndConfig'] as boolean) ?? false;
    keepData = (argv['keepData'] as boolean) ?? false;
    keepBootstraps = (argv['keepBootstraps'] as boolean) ?? false;
    return await uninstaller(
      installerStackName,
      partition,
      debug,
      ignoreTerminationProtection,
      fullDestroy,
      deleteAccelerator,
      keepPipelineAndConfig,
      keepData,
      keepBootstraps,
      stageName,
      actionName,
    );
  }

  // When specific stage name was provided
  if (stageName !== 'all') {
    keepData = (argv['keepData'] as boolean) ?? false;
    keepBootstraps = (argv['keepBootstraps'] as boolean) ?? false;
    actionName = 'all';
    return await uninstaller(
      installerStackName,
      partition,
      debug,
      ignoreTerminationProtection,
      fullDestroy,
      deleteAccelerator,
      keepPipelineAndConfig,
      keepData,
      keepBootstraps,
      stageName,
      actionName,
    );
  }

  // When specific action name was provided
  if (actionName !== 'all') {
    keepData = (argv['keepData'] as boolean) ?? false;
    return await uninstaller(
      installerStackName,
      partition,
      debug,
      ignoreTerminationProtection,
      fullDestroy,
      deleteAccelerator,
      keepPipelineAndConfig,
      keepData,
      keepBootstraps,
      stageName,
      actionName,
    );
  }

  logger.warn(`[uninstaller] Uninstaller didn't execute for unknown reason`);
  throw new Error(usage);
}

process.on('unhandledRejection', reason => {
  console.error(reason);
  // eslint-disable-next-line no-process-exit
  process.exit(1);
});

/**
 * Function to validate delete option for the uninstaller
 * @param installerStackName
 * @param fullDestroy
 * @param deleteAccelerator
 * @param stageName
 * @param actionName
 * @returns
 */
function validateDeleteOptions(
  installerStackName: string,
  fullDestroy: boolean,
  deleteAccelerator: boolean,
  stageName: string,
  actionName: string,
): string | undefined {
  if (installerStackName === undefined) {
    return `[uninstaller] Invalid --installerStackName ${installerStackName}`;
  }

  const errorMessage = `[uninstaller] Invalid options !! Only one delete option (fullDestroy, deleteAccelerator, stageName and actionName) can be used `;
  // One of the option is must from fullDestroy, deleteAccelerator, stageName and actionName
  if (!fullDestroy && !deleteAccelerator && stageName === 'all' && actionName === 'all') {
    return `[uninstaller] Invalid options !! One of the option is must from fullDestroy, deleteAccelerator, stageName and actionName`;
  }

  // When fullDestroy option specified, then deleteAccelerator, stageName and actionName can't be specified
  if (fullDestroy && (deleteAccelerator || stageName !== 'all' || actionName !== 'all')) {
    return errorMessage;
  }

  // When deleteAccelerator option specified, then fullDestroy, stageName and actionName can't be specified
  if (deleteAccelerator && (fullDestroy || stageName !== 'all' || actionName !== 'all')) {
    return errorMessage;
  }

  // When stageName option specified, then fullDestroy, deleteAccelerator and actionName can't be specified
  if (stageName !== 'all' && (fullDestroy || deleteAccelerator || actionName !== 'all')) {
    return errorMessage;
  }

  // When actionName option specified, then fullDestroy, deleteAccelerator and stageName can't be specified
  if (actionName !== 'all' && (fullDestroy || deleteAccelerator || stageName !== 'all')) {
    return errorMessage;
  }

  return undefined;
}

async function uninstaller(
  installerStackName: string,
  partition: string,
  debug: boolean,
  ignoreTerminationProtection: boolean,
  fullDestroy: boolean,
  deleteAccelerator: boolean,
  keepPipelineAndConfig: boolean,
  keepData: boolean,
  keepBootstraps: boolean,
  stageName: string,
  actionName: string,
): Promise<string> {
  const start = new Date().getTime();

  const acceleratorTool = new AcceleratorTool({
    installerStackName,
    partition,
    fullDestroy,
    deleteAccelerator,
    keepBootstraps,
    keepData,
    keepPipelineAndConfig,
    stageName,
    actionName,
    debug,
    ignoreTerminationProtection,
  });

  const status = await acceleratorTool.uninstallAccelerator(installerStackName);
  const elapsed = Math.round((new Date().getTime() - start) / 60000);

  return status
    ? `[uninstaller] Un-installation completed successfully for installer stack "${installerStackName}". Elapsed time ~${elapsed} minutes`
    : `[uninstaller] Un-installation failed for installer stack "${installerStackName}". Elapsed time ~${elapsed} minutes`;
}

/**
 * Call Main function
 */
main().then(data => {
  logger.info(data);
});
