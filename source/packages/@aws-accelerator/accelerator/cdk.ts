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

import * as config from '@aws-accelerator/config';
import * as fs from 'fs';
import mri from 'mri';
import process from 'process';
import { Accelerator } from './lib/accelerator';
import { AcceleratorStage } from './lib/accelerator-stage';
import { AcceleratorToolkit, AcceleratorToolkitCommand } from './lib/toolkit';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  // eslint-disable-next-line no-process-exit
  process.exit(1);
});

const usage = `Usage: cdk.ts <command> --stage STAGE --config-dir CONFIG_DIRECTORY [--account ACCOUNT] [--region REGION] [--parallel]`;

const args = mri(process.argv.slice(2), {
  boolean: ['parallel'],
  string: ['account'],
  alias: {
    c: 'config-dir',
    s: 'stage',
    a: 'account',
    r: 'region',
    p: 'partition',
  },
  default: {
    parallel: false,
  },
});

const commands = args['_'];
const parallel = args['parallel'];
const configDirPath = args['config-dir'];
const stage = args['stage'];
const account = args['account'];
const region = args['region'];
const partition = args['partition'];
const requireApproval = args['require-approval'];

//
// Validate args: must specify a command
//
if (commands.length === 0) {
  console.log('<command> not set');
  throw new Error(usage);
}

//
// Validate args: verify command against our sub-list
//
if (!AcceleratorToolkit.isSupportedCommand(commands[0])) {
  throw new Error(`Invalid command: ${commands[0]}`);
}

//
// Validate args: verify stage if not bootstrap
//
if (!Accelerator.isSupportedStage(stage) && commands[0] !== String(AcceleratorToolkitCommand.BOOTSTRAP)) {
  throw new Error(`Invalid stage: ${stage}`);
}

//
// Validate args: verify config directory
//
if (stage !== AcceleratorStage.PIPELINE) {
  if (config === undefined || !fs.existsSync(configDirPath)) {
    console.log(`Invalid --config-dir ${configDirPath}`);
    throw new Error(usage);
  }
}

//
// Execute the Accelerator engine
//
Accelerator.run({
  command: commands[0],
  configDirPath,
  stage,
  parallel,
  account,
  region,
  partition,
  requireApproval,
}).catch(function (err) {
  console.log(err.message);
  process.exit(1);
});
