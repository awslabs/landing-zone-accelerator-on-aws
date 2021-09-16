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

import { AssumeProfilePlugin } from '@aws-cdk-extensions/cdk-plugin-assume-role';
import { SdkProvider } from 'aws-cdk/lib/api/aws-auth';
import { Bootstrapper, BootstrapSource } from 'aws-cdk/lib/api/bootstrap';
import { CloudFormationDeployments } from 'aws-cdk/lib/api/cloudformation-deployments';
import { StackSelector } from 'aws-cdk/lib/api/cxapp/cloud-assembly';
import { CloudExecutable } from 'aws-cdk/lib/api/cxapp/cloud-executable';
import { execProgram } from 'aws-cdk/lib/api/cxapp/exec';
import { ToolkitInfo } from 'aws-cdk/lib/api/toolkit-info';
import { CdkToolkit } from 'aws-cdk/lib/cdk-toolkit';
import { PluginHost } from 'aws-cdk/lib/plugin';
import { Command, Configuration } from 'aws-cdk/lib/settings';
import console from 'console';
import mri from 'mri';
import path from 'path';
import process from 'process';

import { Stage } from './lib/stages';

/**
 * Accelerator customized execution of the CDKToolkit based on
 * aws-cdk/packages/aws-cdk/bin/cdk.ts
 *
 *
 * @param command
 * @param selector
 * @param accountId
 * @param accountRegion
 * @param stage
 *
 * @see aws-cdk/packages/aws-cdk/bin/cdk.ts
 */
async function execute(
  command: string,
  account: string,
  region: string,
  stage: string,
): Promise<number | string | {} | void> {
  const configuration = new Configuration({
    commandLineArguments: {
      _: [Command.BOOTSTRAP, ...[]],
      pathMetadata: false,
      assetMetadata: false,
      versionReporting: false,
      output: path.join('cdk.out', account, region),
      context: [`account=${account}`, `region=${region}`, `stage=${stage}`],
    },
  });
  await configuration.load();

  const sdkProvider = await SdkProvider.withAwsCliCompatibleDefaults({
    profile: configuration.settings.get(['profile']),
  });

  const cloudFormation = new CloudFormationDeployments({ sdkProvider });

  const cloudExecutable = new CloudExecutable({
    configuration,
    sdkProvider,
    synthesizer: execProgram,
  });

  const toolkitStackName: string = ToolkitInfo.determineName(configuration.settings.get(['toolkitStackName']));

  const cli = new CdkToolkit({
    cloudExecutable,
    cloudFormation,
    configuration,
    sdkProvider,
  });

  const selector: StackSelector = {
    patterns: [],
  };

  switch (command) {
    case Command.BOOTSTRAP:
      const source: BootstrapSource = { source: 'default' };
      const bootstrapper = new Bootstrapper(source);
      const environments = [`aws://${account}/${region}`];
      await cli.bootstrap(environments, bootstrapper, {
        toolkitStackName,
        parameters: {
          bucketName: configuration.settings.get(['toolkitBucket', 'bucketName']),
          kmsKeyId: configuration.settings.get(['toolkitBucket', 'kmsKeyId']),
        },
      });
      break;
    case Command.DEPLOY:
      await cli.deploy({
        selector,
        toolkitStackName,
      });
      break;
    case Command.DESTROY:
      await cli.destroy({
        selector,
        exclusively: false,
        force: true,
      });
      break;
    case Command.SYNTHESIZE:
    case Command.SYNTH:
      await cli.synth([], false, true);
      break;
    default:
      throw new Error(`Unsupported command: ${command}`);
  }
}

/**
 *
 * @returns
 */
async function main(): Promise<void> {
  const usage = `Usage: cdk.ts <command> --stage STAGE [--account ACCOUNT] [--region REGION] [--parallel]`;
  const args = mri(process.argv.slice(2), {
    boolean: ['parallel'],
    string: ['account'],
    alias: {
      s: 'stage',
      a: 'account',
      r: 'region',
    },
    default: {
      parallel: false,
    },
  });

  const commands = args['_'];
  const parallel = args.parallel;
  const stage = args.stage;
  const account = args.account;
  const region = args.region;

  //
  // Validate args: must specify a command
  //
  if (commands.length === 0) {
    console.log(usage);
    return;
  }

  //
  // Validate args: verify command against our sub-list
  //
  const supportedCommands: string[] = [
    Command.BOOTSTRAP,
    Command.DEPLOY,
    Command.DESTROY,
    Command.SYNTH,
    Command.SYNTHESIZE,
  ];
  if (!supportedCommands.includes(commands[0])) {
    console.log(`Invalid command: ${commands[0]}`);
    return;
  }

  //
  // Validate args: verify stage if not bootstrap
  //
  if (!Object.values(Stage).includes(stage) && commands[0] !== 'bootstrap') {
    console.log(`Invalid stage: ${stage}`);
    return;
  }

  //
  // Load Plugins
  //
  const assumeRolePlugin = new AssumeProfilePlugin({
    // TODO: Read this from arg
    assumeRoleName: 'AWSControlTowerExecution',
    assumeRoleDuration: 3600,
  });
  assumeRolePlugin.init(PluginHost.instance);

  //
  // When an account and region is specified, execute as single stack
  //
  if (account || region) {
    if (account && region === undefined) {
      throw new Error(`Account set to ${account}, but region is undefined`);
    }
    if (region && account === undefined) {
      throw new Error(`Region set to ${region}, but region is undefined`);
    }
    await execute(commands[0], account, region, stage);
    return;
  }

  // TODO: Read in Accelerator Config files. Loop through accounts/regions and
  //       call the execute command to deploy the stacks into those accounts
  const accounts = ['111111111111', '222222222222'];
  const regions = ['us-east-1', 'us-west-2'];

  // if (parallel) {
  //   const promises = [];
  //   for (const account of accounts) {
  //     for (const region of regions) {
  //       // TODO: Add paging here
  //       promises.push(commands[0], account, region, stage);
  //     }
  //   }
  //   const output = await Promise.all(promises);
  //   console.log(output);
  // } else {
  for (const account of accounts) {
    for (const region of regions) {
      await execute(commands[0], account, region, stage);
    }
  }
  // }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
