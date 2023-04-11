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

import * as config from '@aws-accelerator/config';
import * as fs from 'fs';
import mri from 'mri';
import process from 'process';
import { Accelerator } from './lib/accelerator';
import { AcceleratorStage } from './lib/accelerator-stage';
import { AcceleratorToolkit } from './lib/toolkit';

(async () => {
  const usage = `Usage: cdk.ts <command> --stage STAGE --config-dir CONFIG_DIRECTORY [--account ACCOUNT] [--region REGION]`;

  const args = mri(process.argv.slice(2), {
    boolean: ['ec2Creds'],
    string: [
      'require-approval',
      'config-dir',
      'partition',
      'stage',
      'account',
      'region',
      'app',
      'ca-bundle-path',
      'proxy',
    ],
    alias: {
      c: 'config-dir',
      s: 'stage',
      a: 'account',
      r: 'region',
      p: 'app',
    },
  });

  const commands = args['_'];
  const requireApproval = args['require-approval'];
  const configDirPath = args['config-dir'];
  const partition = args['partition'];
  const stage = args['stage'];
  const account = args['account'];
  const region = args['region'];
  const app = args['app'];
  const caBundlePath = args['ca-bundle-path'];
  const ec2Creds = args['ec2Creds'];
  const proxyAddress = args['proxy'];

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
  // Validate args: verify config directory
  //
  if (stage !== AcceleratorStage.PIPELINE && stage !== AcceleratorStage.TESTER_PIPELINE) {
    if (config === undefined || !fs.existsSync(configDirPath)) {
      console.log(`Invalid --config-dir ${configDirPath}`);
      throw new Error(usage);
    }
  }

  // Check if the caBundlePath file exits
  if (caBundlePath !== undefined) {
    if (caBundlePath.length === 0 || !fs.existsSync(caBundlePath)) {
      console.log(`Invalid --ca-bundle-path ${caBundlePath}`);
      throw new Error(usage);
    }
  }

  // Boolean to set single account deployment mode
  const enableSingleAccountMode = process.env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE']
    ? process.env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE'] === 'true'
    : false;

  //
  // Execute the Accelerator engine
  //
  await Accelerator.run({
    command: commands[0],
    configDirPath,
    stage,
    account,
    region,
    partition,
    requireApproval,
    app,
    caBundlePath,
    ec2Creds,
    proxyAddress,
    enableSingleAccountMode: enableSingleAccountMode,
  }).catch(function (err) {
    console.log(err.message);
    process.exit(1);
  });
})();
