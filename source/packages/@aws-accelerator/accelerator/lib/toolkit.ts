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

import { SdkProvider } from 'aws-cdk/lib/api/aws-auth';
import { Bootstrapper, BootstrapSource } from 'aws-cdk/lib/api/bootstrap';
import { CloudFormationDeployments } from 'aws-cdk/lib/api/cloudformation-deployments';
import { StackSelector } from 'aws-cdk/lib/api/cxapp/cloud-assembly';
import { CloudExecutable } from 'aws-cdk/lib/api/cxapp/cloud-executable';
import { execProgram } from 'aws-cdk/lib/api/cxapp/exec';
import { ToolkitInfo } from 'aws-cdk/lib/api/toolkit-info';
import { CdkToolkit } from 'aws-cdk/lib/cdk-toolkit';
import { RequireApproval } from 'aws-cdk/lib/diff';
import { Command, Configuration } from 'aws-cdk/lib/settings';

import { AcceleratorStackNames } from './accelerator';
import { AcceleratorStage } from './accelerator-stage';
import { Logger } from './logger';

/**
 *
 */
export enum AcceleratorToolkitCommand {
  BOOTSTRAP = Command.BOOTSTRAP,
  DEPLOY = Command.DEPLOY,
  DIFF = Command.DIFF,
  SYNTH = Command.SYNTH,
  SYNTHESIZE = Command.SYNTHESIZE,
}

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
  static isSupportedCommand(command: string): boolean {
    if (command === undefined) {
      return false;
    }
    return Object.values(AcceleratorToolkitCommand).includes(command);
  }

  /**
   * Accelerator customized execution of the CDKToolkit based on
   * aws-cdk/packages/aws-cdk/bin/cdk.ts
   *
   *
   * @param options
   */
  static async execute(options: {
    command: string;
    accountId?: string;
    region?: string;
    partition: string;
    stage?: string;
    configDirPath?: string;
    requireApproval?: RequireApproval;
    trustedAccountId?: string;
    app?: string;
  }): Promise<void> {
    // Logger
    if (options.accountId || options.region) {
      if (options.stage) {
        Logger.info(
          `[toolkit] Executing cdk ${options.command} ${options.stage} for aws://${options.accountId}/${options.region}`,
        );
      } else {
        Logger.info(`[toolkit] Executing cdk ${options.command} for aws://${options.accountId}/${options.region}`);
      }
    } else if (options.stage) {
      Logger.info(`[toolkit] Executing cdk ${options.command} ${options.stage}`);
    } else {
      Logger.info(`[toolkit] Executing cdk ${options.command}`);
    }

    // build the context
    const context: string[] = [];
    if (options.configDirPath) {
      context.push(`config-dir=${options.configDirPath}`);
    }
    if (options.stage) {
      context.push(`stage=${options.stage}`);
    }
    if (options.accountId) {
      context.push(`account=${options.accountId}`);
    }
    if (options.region) {
      context.push(`region=${options.region}`);
    }
    if (options.partition) {
      context.push(`partition=${options.partition}`);
    }

    const configuration = new Configuration({
      commandLineArguments: {
        _: [options.command as Command, ...[]],
        versionReporting: false,
        pathMetadata: false,
        output: 'cdk.out',
        assetMetadata: false,
        staging: false,
        lookups: false,
        app: options.app,
        context,
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

    const toolkitStackName: string = ToolkitInfo.determineName('AWSAccelerator-CDKToolkit');

    const cli = new CdkToolkit({
      cloudExecutable,
      cloudFormation,
      configuration,
      sdkProvider,
    });

    switch (options.command) {
      case Command.BOOTSTRAP:
        const source: BootstrapSource = { source: 'default' };
        const bootstrapper = new Bootstrapper(source);
        const environments = [`aws://${options.accountId}/${options.region}`];
        const trustedAccounts: string[] = [];
        if (options.trustedAccountId && options.trustedAccountId != options.accountId) {
          trustedAccounts.push(options.trustedAccountId);
        }
        await cli.bootstrap(environments, bootstrapper, {
          toolkitStackName,
          parameters: {
            bucketName: configuration.settings.get(['toolkitBucket', 'bucketName']),
            kmsKeyId: configuration.settings.get(['toolkitBucket', 'kmsKeyId']),
            qualifier: 'accel',
            trustedAccounts,
            cloudFormationExecutionPolicies: [`arn:${options.partition}:iam::aws:policy/AdministratorAccess`],
          },
        });
        break;
      case Command.DIFF:
        await cli.diff({ stackNames: [] });
        break;

      case Command.DEPLOY:
        if (options.stage === undefined) {
          throw new Error('trying to deploy with an undefined stage');
        }
        let stackName = [`${AcceleratorStackNames[options.stage]}-${options.accountId}-${options.region}`];

        if (options.stage === AcceleratorStage.PIPELINE) {
          stackName = process.env['ACCELERATOR_QUALIFIER']
            ? [
                `${process.env['ACCELERATOR_QUALIFIER']}-${AcceleratorStage.PIPELINE}-stack-${options.accountId}-${options.region}`,
              ]
            : [`${AcceleratorStackNames[options.stage]}-${options.accountId}-${options.region}`];
        }

        if (options.stage === AcceleratorStage.TESTER_PIPELINE) {
          stackName = process.env['ACCELERATOR_QUALIFIER']
            ? [
                `${process.env['ACCELERATOR_QUALIFIER']}-${AcceleratorStage.TESTER_PIPELINE}-stack-${options.accountId}-${options.region}`,
              ]
            : [`${AcceleratorStackNames[options.stage]}-${options.accountId}-${options.region}`];
        }

        if (options.stage === AcceleratorStage.NETWORK_VPC) {
          stackName = [
            `${AcceleratorStackNames[AcceleratorStage.NETWORK_VPC_DNS]}-${options.accountId}-${options.region}`,
          ];
        }

        const selector: StackSelector = {
          // patterns: [`${AcceleratorStackNames[options.stage]}-${options.accountId}-${options.region}`],
          patterns: stackName,
        };

        await cli.deploy({
          selector,
          toolkitStackName,
          requireApproval: options.requireApproval,
        });
        break;
      case Command.SYNTHESIZE:
      case Command.SYNTH:
        await cli.synth([], false, true);
        break;

      default:
        throw new Error(`Unsupported command: ${options.command}`);
    }
  }
}
