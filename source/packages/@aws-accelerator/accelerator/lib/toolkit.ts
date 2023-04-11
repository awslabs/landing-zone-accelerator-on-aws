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
import { BootstrapEnvironmentOptions, Bootstrapper, BootstrapSource } from 'aws-cdk/lib/api/bootstrap';
import { CloudFormationDeployments } from 'aws-cdk/lib/api/cloudformation-deployments';
import { StackSelector } from 'aws-cdk/lib/api/cxapp/cloud-assembly';
import { CloudExecutable } from 'aws-cdk/lib/api/cxapp/cloud-executable';
import { execProgram } from 'aws-cdk/lib/api/cxapp/exec';
import { ILock } from 'aws-cdk/lib/api/util/rwlock';
import { ToolkitInfo } from 'aws-cdk/lib/api/toolkit-info';
import { CdkToolkit } from 'aws-cdk/lib/cdk-toolkit';
import { RequireApproval } from 'aws-cdk/lib/diff';
import { Command, Configuration } from 'aws-cdk/lib/settings';
import { HotswapMode } from 'aws-cdk/lib/api/hotswap/common';
import * as fs from 'fs';
import * as path from 'path';

import { AccountsConfig, cdkOptionsConfig, CustomizationsConfig, OrganizationConfig } from '@aws-accelerator/config';
import { createLogger } from '@aws-accelerator/utils';

import { AcceleratorStackNames } from './accelerator';
import { AcceleratorStage } from './accelerator-stage';
import { isIncluded } from './stacks/custom-stack';

const logger = createLogger(['toolkit']);
process.on('unhandledRejection', err => {
  logger.error(err);
  throw new Error('Runtime Error');
});

const stackPrefix = process.env['ACCELERATOR_PREFIX']!;

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
    caBundlePath?: string;
    ec2Creds?: boolean;
    proxyAddress?: string;
    centralizeCdkBootstrap?: boolean;
    cdkOptions?: cdkOptionsConfig;
    enableSingleAccountMode: boolean;
  }): Promise<void> {
    if (options.accountId || options.region) {
      if (options.stage) {
        logger.info(
          `Executing cdk ${options.command} ${options.stage} for aws://${options.accountId}/${options.region}`,
        );
      } else {
        logger.info(`Executing cdk ${options.command} for aws://${options.accountId}/${options.region}`);
      }
    } else if (options.stage) {
      logger.info(`Executing cdk ${options.command} ${options.stage}`);
    } else {
      logger.info(`Executing cdk ${options.command}`);
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
      ec2creds: options.ec2Creds,
      httpOptions: {
        proxyAddress: options.proxyAddress,
        caBundlePath: options.caBundlePath,
      },
    });

    const cloudFormation = new CloudFormationDeployments({ sdkProvider });

    let outDirLock: ILock | undefined;
    const cloudExecutable = new CloudExecutable({
      configuration,
      sdkProvider,
      synthesizer: async (aws, config) => {
        await outDirLock?.release();
        const { assembly, lock } = await execProgram(aws, config);
        outDirLock = lock;
        return assembly;
      },
    });

    const toolkitStackName: string = ToolkitInfo.determineName(`${stackPrefix}-CDKToolkit`);

    const cli = new CdkToolkit({
      cloudExecutable,
      cloudFormation,
      configuration,
      sdkProvider,
    });

    switch (options.command) {
      case Command.BOOTSTRAP:
        let source: BootstrapSource;

        const environments = [`aws://${options.accountId}/${options.region}`];
        const trustedAccounts: string[] = [];
        if (options.trustedAccountId && options.trustedAccountId != options.accountId) {
          trustedAccounts.push(options.trustedAccountId);
        }

        const bootstrapEnvOptions: BootstrapEnvironmentOptions = {
          toolkitStackName: toolkitStackName,
          parameters: {
            bucketName: configuration.settings.get(['toolkitBucket', 'bucketName']),
            kmsKeyId: configuration.settings.get(['toolkitBucket', 'kmsKeyId']),
            qualifier: 'accel',
            trustedAccounts,
            cloudFormationExecutionPolicies: [`arn:${options.partition}:iam::aws:policy/AdministratorAccess`],
          },
        };

        // Use custom bootstrapping template if cdk options are set
        if (
          options.centralizeCdkBootstrap ||
          options.cdkOptions?.centralizeBuckets ||
          options.cdkOptions?.useManagementAccessRole
        ) {
          process.env['CDK_NEW_BOOTSTRAP'] = '1';
          const templatePath = `./cdk.out/${AcceleratorStackNames[AcceleratorStage.BOOTSTRAP]}-${options.accountId}-${
            options.region
          }.template.json`;
          source = { source: 'custom', templateFile: templatePath };
        } else {
          source = { source: 'default' };
        }

        const bootstrapper = new Bootstrapper(source);

        await cli.bootstrap(environments, bootstrapper, bootstrapEnvOptions);
        break;
      case Command.DIFF:
        await cli.diff({ stackNames: [] });
        break;

      case Command.DEPLOY:
        if (options.stage === undefined) {
          logger.error('trying to deploy with an undefined stage');
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

        if (options.stage === AcceleratorStage.KEY) {
          stackName = [
            `${AcceleratorStackNames[AcceleratorStage.KEY]}-${options.accountId}-${options.region}`,
            `${AcceleratorStackNames[AcceleratorStage.DEPENDENCIES]}-${options.accountId}-${options.region}`,
          ];
        }

        if (options.stage === AcceleratorStage.NETWORK_VPC) {
          stackName = [
            `${AcceleratorStackNames[AcceleratorStage.NETWORK_VPC_DNS]}-${options.accountId}-${options.region}`,
          ];
        }

        if (options.stage === AcceleratorStage.NETWORK_ASSOCIATIONS) {
          stackName = [
            `${AcceleratorStackNames[AcceleratorStage.NETWORK_ASSOCIATIONS]}-${options.accountId}-${options.region}`,
            `${AcceleratorStackNames[AcceleratorStage.NETWORK_ASSOCIATIONS_GWLB]}-${options.accountId}-${
              options.region
            }`,
          ];
        }

        if (options.stage === AcceleratorStage.CUSTOMIZATIONS) {
          if (options.configDirPath === undefined) {
            logger.error('Customizations stage requires an argument for configuration directory path');
            throw new Error('Customizations stage requires an argument for configuration directory path');
          }
          if (fs.existsSync(path.join(options.configDirPath, 'customizations-config.yaml'))) {
            const customizationsConfig = CustomizationsConfig.load(options.configDirPath);
            const accountsConfig = AccountsConfig.load(options.configDirPath);
            await accountsConfig.loadAccountIds(options.partition, options.enableSingleAccountMode);
            const customStacks = customizationsConfig.getCustomStacks();
            for (const stack of customStacks) {
              const deploymentAccts = accountsConfig.getAccountIdsFromDeploymentTarget(stack.deploymentTargets);
              const deploymentRegions = stack.regions.map(a => a.toString());
              if (deploymentRegions.includes(options.region!) && deploymentAccts.includes(options.accountId!)) {
                stackName.push(`${stack.name}-${options.accountId}-${options.region}`);
              }
            }
            const appStacks = customizationsConfig.getAppStacks();
            const organizationConfig = OrganizationConfig.load(options.configDirPath);
            for (const application of appStacks) {
              if (
                isIncluded(
                  application.deploymentTargets,
                  options.region!,
                  options.accountId!,
                  accountsConfig,
                  organizationConfig,
                )
              ) {
                const applicationStackName = `${stackPrefix}-App-${
                  application.name
                }-${options.accountId!}-${options.region!}`;
                stackName.push(applicationStackName);
              }
            }
          }
        }

        const selector: StackSelector = {
          // patterns: [`${AcceleratorStackNames[options.stage]}-${options.accountId}-${options.region}`],
          patterns: stackName,
        };

        const changeSetName = `${stackName[0]}-change-set`;

        await cli
          .deploy({
            selector,
            toolkitStackName,
            requireApproval: options.requireApproval,
            changeSetName: changeSetName,
            hotswap: HotswapMode.FULL_DEPLOYMENT,
          })
          .catch(err => {
            logger.error(err);
            throw new Error('Deployment failed');
          });
        break;
      case Command.SYNTHESIZE:
      case Command.SYNTH:
        await cli.synth([], false, true);
        break;

      default:
        logger.error(`Unsupported command: ${options.command}`);
        throw new Error(`Unsupported command: ${options.command}`);
    }
  }
}
