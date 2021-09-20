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
import * as fs from 'fs';
import mri from 'mri';
import path from 'path';
import process from 'process';
import { Stage } from './stages';

/**
 * Wrapper around the CdkToolkit. The Accelerator defines this wrapper to add
 * the following functionality:
 *
 * - x
 * - y
 * - z
 */
export class AcceleratorToolkit {
  /**
   *
   * @returns
   */
  static async cli(): Promise<void> {
    const usage = `Usage: cdk.ts <command> --stage STAGE --config-dir CONFIG_DIRECTORY [--account ACCOUNT] [--region REGION] [--parallel]`;
    const args = mri(process.argv.slice(2), {
      boolean: ['parallel'],
      string: ['account'],
      alias: {
        c: 'config-dir',
        s: 'stage',
        a: 'account',
        r: 'region',
      },
      default: {
        parallel: false,
      },
    });

    const commands = args['_'];
    // const parallel = args['parallel'];
    const configDir = args['config-dir'];
    const stage = args['stage'];
    const account = args['account'];
    const region = args['region'];

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
    const supportedCommands: string[] = [
      Command.BOOTSTRAP,
      Command.DEPLOY,
      Command.DESTROY,
      Command.LIST,
      Command.LS,
      Command.SYNTH,
      Command.SYNTHESIZE,
    ];
    if (!supportedCommands.includes(commands[0])) {
      throw new Error(`Invalid command: ${commands[0]}`);
    }

    //
    // Validate args: verify stage if not bootstrap or list
    //
    if (!Object.values(Stage).includes(stage) && commands[0] !== 'bootstrap') {
      throw new Error(`Invalid stage: ${stage}`);
    }

    //
    // Validate args: verify config directory
    //
    if (config === undefined || !fs.existsSync(configDir)) {
      console.log(`Invalid --config ${configDir}`);
      throw new Error(usage);
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
      return await AcceleratorToolkit.execute(commands[0], account, region, stage);
    }

    //
    // Read in all Accelerator Configuration files here, then pass the objects
    // to the stacks that need them
    //
    const organizationConfig = await config.loadOrganizationConfig(configDir);
    console.log(organizationConfig);

    // TODO: And Environment variables to enable debug logs

    //
    // Loop through all accounts and regions and execute commands
    //
    // TODO: Add parallel support
    // TODO: Change config to not include account numbers, need to pull from orgs
    for (const account in organizationConfig['accounts']) {
      for (const region of organizationConfig['enabled-regions']) {
        await AcceleratorToolkit.execute(commands[0], account, region, stage);
      }
    }
  }

  /**
   * Accelerator customized execution of the CDKToolkit based on
   * aws-cdk/packages/aws-cdk/bin/cdk.ts
   *
   *
   * @param command
   * @param account
   * @param region
   * @param stage
   *
   * @return Promise<void>
   *
   * @see aws-cdk/packages/aws-cdk/bin/cdk.ts
   */
  static async execute(command: string, account: string, region: string, stage: string): Promise<void> {
    console.log(`Executing cdk ${command} for aws://${account}/${region}`);

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
      case Command.LIST:
      case Command.LS:
        await cli.list([], { long: false });
        break;
      case Command.SYNTHESIZE:
      case Command.SYNTH:
        await cli.synth([], false, true);
        break;
      default:
        throw new Error(`Unsupported command: ${command}`);
    }
  }
}
