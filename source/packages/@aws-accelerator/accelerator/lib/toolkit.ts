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
import { Deployments } from 'aws-cdk/lib/api/deployments';
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

import {
  AccountsConfig,
  cdkOptionsConfig,
  CustomizationsConfig,
  GlobalConfig,
  OrganizationConfig,
} from '@aws-accelerator/config';
import { getReplacementsConfig } from '../utils/app-utils';
import { createLogger } from '@aws-accelerator/utils';
import { isBeforeBootstrapStage } from '../utils/app-utils';

import { Accelerator, AcceleratorStackNames } from './accelerator';
import { AcceleratorStage } from './accelerator-stage';
import { isIncluded } from './stacks/custom-stack';

const logger = createLogger(['toolkit']);
process.on('unhandledRejection', err => {
  logger.error(err);
  throw new Error('Runtime Error');
});

/**
 * CDK toolkit commands
 */
export enum AcceleratorToolkitCommand {
  BOOTSTRAP = Command.BOOTSTRAP,
  DEPLOY = Command.DEPLOY,
  DIFF = Command.DIFF,
  SYNTH = Command.SYNTH,
  SYNTHESIZE = Command.SYNTHESIZE,
}

interface Tag {
  readonly Key: string;
  readonly Value: string;
}

/**
 * Accelerator extended CDK toolkit properties
 */
export interface AcceleratorToolkitProps {
  /**
   * CDK toolkit command
   */
  command: string;
  /**
   * Enable single account deployment
   */
  enableSingleAccountMode: boolean;
  /**
   * The AWS partition
   */
  partition: string;
  /**
   * The accelerator stack prefix value
   */
  stackPrefix: string;
  /**
   * The AWS account ID
   */
  accountId?: string;
  /**
   * The AWS region
   */
  region?: string;
  /**
   * The accelerator stage
   */
  stage?: string;
  /**
   * The accelerator configuration directory path
   */
  configDirPath?: string;
  /**
   * Require approval flag
   */
  requireApproval?: RequireApproval;
  /**
   * Trusted account ID
   */
  trustedAccountId?: string;
  /**
   * App output file location
   */
  app?: string;
  /**
   * CA bundle path
   */
  caBundlePath?: string;
  /**
   * EC2 credentials flag
   */
  ec2Creds?: boolean;
  /**
   * Proxy address
   */
  proxyAddress?: string;
  /**
   * Centralize CDK bootstrapping
   */
  centralizeCdkBootstrap?: boolean;
  /**
   * Custom CDK options for the accelerator
   */
  cdkOptions?: cdkOptionsConfig;
  /**
   * Stack to be deployed. This stack is added to stackName list
   * For IMPORT_ASEA_RESOURCES/POST_IMPORT_ASEA_RESOURCES should be ASEA stack name
   */
  stack?: string;

  /**
   * Tags to be applied for CloudFormation stack
   */
  tags?: Tag[];

  /**
   * Use existing roles for deployment
   */
  useExistingRoles: boolean;
}

/**
 * Wrapper around the CdkToolkit. The Accelerator defines this wrapper to add
 * the following functionality:
 *
 * - Add custom app context and configuration options
 * - Enable custom stage-based implementation
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
    return Object.values(AcceleratorToolkitCommand).includes(command as unknown as AcceleratorToolkitCommand);
  }

  /**
   * Accelerator customized execution of the CDKToolkit based on
   * aws-cdk/packages/aws-cdk/bin/cdk.ts
   *
   *
   * @param options {@link AcceleratorToolkitProps}
   */
  static async execute(options: AcceleratorToolkitProps): Promise<void> {
    //
    // Validate options
    AcceleratorToolkit.validateOptions(options);

    //
    // build the context
    const context = AcceleratorToolkit.buildExecutionContext(options);

    const configuration = new Configuration({
      commandLineArguments: {
        _: [options.command as Command, ...[]],
        versionReporting: false,
        pathMetadata: false,
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

    const deployments = new Deployments({ sdkProvider });

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

    const toolkitStackName: string = ToolkitInfo.determineName(`${options.stackPrefix}-CDKToolkit`);

    const cli = new CdkToolkit({
      cloudExecutable,
      deployments,
      configuration,
      sdkProvider,
    });

    switch (options.command) {
      case Command.BOOTSTRAP:
        await AcceleratorToolkit.bootstrapToolKitStacks(context, configuration, toolkitStackName, options);
        break;
      case Command.DIFF:
        await cli.diff({ stackNames: [] });
        break;

      case Command.DEPLOY:
        await AcceleratorToolkit.deployStacks(context, toolkitStackName, options);
        break;
      case Command.SYNTHESIZE:
      case Command.SYNTH:
        await AcceleratorToolkit.synthStacks(cli);
        break;

      default:
        logger.error(`Unsupported command: ${options.command}`);
        throw new Error(`Unsupported command: ${options.command}`);
    }
  }

  /**
   * Function to validate toolkit execution options
   * @param options {@link AcceleratorToolkitProps}
   *
   */
  private static validateOptions(options: AcceleratorToolkitProps) {
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
  }

  /**
   * Function to build toolkit execution context
   * @param options {@link AcceleratorToolkitProps}
   * @returns context string[]
   */
  private static buildExecutionContext(options: AcceleratorToolkitProps): string[] {
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
    if (options.useExistingRoles) {
      context.push(`useExistingRoles=true`);
    }

    return context;
  }

  /**
   * Function to Bootstrap the CDK Toolkit stack in the accounts used by the specified stack(s).
   * @param cli {@link CdkToolkit}
   * @param configuration {@link Configuration}
   * @param toolkitStackName string
   * @param options {@link AcceleratorToolkitProps}
   */
  private static async bootstrapToolKitStacks(
    context: string[],
    configuration: Configuration,
    toolkitStackName: string,
    options: AcceleratorToolkitProps,
  ) {
    let source: BootstrapSource;

    const environments = [`aws://${options.accountId}/${options.region}`];
    const trustedAccounts: string[] = [];
    if (options.trustedAccountId && options.trustedAccountId != options.accountId) {
      trustedAccounts.push(options.trustedAccountId);
    }

    let bootstrapEnvOptions: BootstrapEnvironmentOptions = {
      toolkitStackName: toolkitStackName,
      parameters: {
        bucketName: configuration.settings.get(['toolkitBucket', 'bucketName']),
        kmsKeyId: configuration.settings.get(['toolkitBucket', 'kmsKeyId']),
        qualifier: 'accel',
        trustedAccounts,
        cloudFormationExecutionPolicies: [`arn:${options.partition}:iam::aws:policy/AdministratorAccess`],
      },
    };
    const bootstrapStackName = `${AcceleratorStackNames[AcceleratorStage.BOOTSTRAP]}-${options.accountId}-${
      options.region
    }`;

    // Use custom bootstrapping template if cdk options are set
    if (
      options.centralizeCdkBootstrap ||
      options.cdkOptions?.centralizeBuckets ||
      options.cdkOptions?.useManagementAccessRole ||
      options.cdkOptions?.customDeploymentRole ||
      options.useExistingRoles
    ) {
      if (options.cdkOptions?.customDeploymentRole) {
        bootstrapEnvOptions = {
          ...bootstrapEnvOptions,
          force: options.cdkOptions?.forceBootstrap,
        };
      }
      process.env['CDK_NEW_BOOTSTRAP'] = '1';
      const templatePath = `./cdk.out/${bootstrapStackName}/${bootstrapStackName}.template.json`;
      source = { source: 'custom', templateFile: templatePath };
    } else {
      source = { source: 'default' };
    }

    const bootstrapper = new Bootstrapper(source);
    const cli = await AcceleratorToolkit.getCdkToolKit(context, options, bootstrapStackName);

    await cli.bootstrap(environments, bootstrapper, bootstrapEnvOptions);
  }

  /**
   * Function to validate and get stage name for deploy
   * @param options {@link AcceleratorToolkitProps}
   */
  private static validateAndGetDeployStage(options: AcceleratorToolkitProps): string {
    if (options.stage === undefined) {
      logger.error('trying to deploy with an undefined stage');
      throw new Error('trying to deploy with an undefined stage');
    }

    return options.stage;
  }

  /**
   * Function to initialize PIPELINE and TESTER PIPELINE stack name
   * @param props
   * @returns
   */
  private static getPipelineAndTesterPipelineStackName(
    stageName: AcceleratorStage,
    props: { stage: string; accountId?: string; region?: string },
  ) {
    return process.env['ACCELERATOR_QUALIFIER']
      ? `${process.env['ACCELERATOR_QUALIFIER']}-${stageName}-stack-${props.accountId}-${props.region}`
      : `${AcceleratorStackNames[props.stage]}-${props.accountId}-${props.region}`;
  }

  /**
   * Function to validate and get config directory path
   * @param configDirPath
   * @returns
   */
  private static validateAndGetConfigDirectory(configDirPath?: string): string {
    if (configDirPath === undefined) {
      logger.error('Customizations stage requires an argument for configuration directory path');
      throw new Error('Customizations stage requires an argument for configuration directory path');
    }

    return configDirPath;
  }

  /**
   * Function to get customizations stack names
   * @param stackNames string[]
   * @param options {@link AcceleratorToolkitProps}
   * @returns
   */
  private static async getCustomizationsStackNames(
    stackNames: string[],
    options: AcceleratorToolkitProps,
  ): Promise<string[]> {
    const configDirPath = AcceleratorToolkit.validateAndGetConfigDirectory(options.configDirPath);

    if (fs.existsSync(path.join(configDirPath, CustomizationsConfig.FILENAME))) {
      await Accelerator.getManagementAccountCredentials(options.partition);
      const accountsConfig = AccountsConfig.load(configDirPath);
      const homeRegion = GlobalConfig.loadRawGlobalConfig(configDirPath).homeRegion;
      const replacementsConfig = getReplacementsConfig(configDirPath, accountsConfig);
      await replacementsConfig.loadReplacementValues({ region: homeRegion });
      const organizationConfig = OrganizationConfig.load(configDirPath, replacementsConfig);
      await accountsConfig.loadAccountIds(
        options.partition,
        options.enableSingleAccountMode,
        organizationConfig.enable,
        accountsConfig,
      );

      logger.info('Loading account IDs for the environment...');
      logger.info('Loading organizational units for the environment...');
      await organizationConfig.loadOrganizationalUnitIds(options.partition);

      const customizationsConfig = CustomizationsConfig.load(configDirPath, replacementsConfig);
      const customStacks = customizationsConfig.getCustomStacks();
      for (const stack of customStacks) {
        const deploymentAccts = accountsConfig.getAccountIdsFromDeploymentTarget(stack.deploymentTargets);
        const deploymentRegions = stack.regions.map(a => a.toString());
        if (deploymentRegions.includes(options.region!) && deploymentAccts.includes(options.accountId!)) {
          stackNames.push(`${stack.name}-${options.accountId}-${options.region}`);
        }
      }
      const appStacks = customizationsConfig.getAppStacks();
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
          const applicationStackName = `${options.stackPrefix}-App-${
            application.name
          }-${options.accountId!}-${options.region!}`;
          stackNames.push(applicationStackName);
        }
      }
    }
    return stackNames;
  }

  /**
   * Function to deploy stacks
   * @param cli {@link CdkToolkit}
   * @param toolkitStackName string
   * @param options {@link AcceleratorToolkitProps}
   */
  private static async deployStacks(context: string[], toolkitStackName: string, options: AcceleratorToolkitProps) {
    const stackName = await AcceleratorToolkit.getStackNames(options);

    let roleArn;
    if (!isBeforeBootstrapStage(options.command, options.stage)) {
      roleArn = getDeploymentRoleArn({
        account: options.accountId,
        region: options.region,
        cdkOptions: options.cdkOptions,
      });
    }
    const deployPromises: Promise<void>[] = [];
    for (const stack of stackName) {
      deployPromises.push(AcceleratorToolkit.runDeployStackCli(context, options, stack, toolkitStackName, roleArn));
    }
    await Promise.all(deployPromises);
  }
  /**
   * Function to get stack names for bootstrapping
   * @param options {@link AcceleratorToolkitProps}
   */
  private static async getStackNames(options: AcceleratorToolkitProps): Promise<string[]> {
    const stageName = AcceleratorToolkit.validateAndGetDeployStage(options);
    let stackName = [`${AcceleratorStackNames[stageName]}-${options.accountId}-${options.region}`];
    switch (options.stage) {
      case AcceleratorStage.PIPELINE:
        stackName = [
          AcceleratorToolkit.getPipelineAndTesterPipelineStackName(AcceleratorStage.PIPELINE, {
            stage: options.stage,
            accountId: options.accountId,
            region: options.region,
          }),
        ];
        break;
      case AcceleratorStage.TESTER_PIPELINE:
        stackName = [
          AcceleratorToolkit.getPipelineAndTesterPipelineStackName(AcceleratorStage.TESTER_PIPELINE, {
            stage: options.stage,
            accountId: options.accountId,
            region: options.region,
          }),
        ];
        break;
      case AcceleratorStage.KEY:
        stackName = [
          `${AcceleratorStackNames[AcceleratorStage.KEY]}-${options.accountId}-${options.region}`,
          `${AcceleratorStackNames[AcceleratorStage.DEPENDENCIES]}-${options.accountId}-${options.region}`,
        ];
        break;
      case AcceleratorStage.NETWORK_VPC:
        stackName = [
          `${AcceleratorStackNames[AcceleratorStage.NETWORK_VPC_DNS]}-${options.accountId}-${options.region}`,
        ];
        break;
      case AcceleratorStage.NETWORK_ASSOCIATIONS:
        stackName = [
          `${AcceleratorStackNames[AcceleratorStage.NETWORK_ASSOCIATIONS]}-${options.accountId}-${options.region}`,
          `${AcceleratorStackNames[AcceleratorStage.NETWORK_ASSOCIATIONS_GWLB]}-${options.accountId}-${options.region}`,
        ];
        break;
      case AcceleratorStage.CUSTOMIZATIONS:
        stackName = await AcceleratorToolkit.getCustomizationsStackNames(stackName, options);
        break;
      case AcceleratorStage.IMPORT_ASEA_RESOURCES:
      case AcceleratorStage.POST_IMPORT_ASEA_RESOURCES:
        stackName = [options.stack!];
        break;
    }

    return stackName;
  }
  /**
   * Function to synth stacks
   * @param cli {@link CdkToolkit}
   * @param toolkitStackName string
   * @param options {@link AcceleratorToolkitProps}
   */
  private static async synthStacks(cli: CdkToolkit) {
    await cli.synth([], false, true).catch(err => {
      logger.error(err);
      throw new Error(`Synthesis of stacks failed`);
    });
  }

  private static async getCdkToolKit(context: string[], options: AcceleratorToolkitProps, stackName: string) {
    let app: string | undefined;
    if (options.stage === AcceleratorStage.PIPELINE) {
      app = options.app;
    } else if (options.stage === AcceleratorStage.NETWORK_ASSOCIATIONS_GWLB) {
      app = `cdk.out/${
        AcceleratorStackNames[AcceleratorStage.NETWORK_ASSOCIATIONS]
      }-${options.accountId!}-${options.region!}`;
    } else if (
      options.stage === AcceleratorStage.NETWORK_VPC_ENDPOINTS ||
      options.stage === AcceleratorStage.NETWORK_VPC
    ) {
      app = `cdk.out/${
        AcceleratorStackNames[AcceleratorStage.NETWORK_VPC_DNS]
      }-${options.accountId!}-${options.region!}`;
    } else if (options.stage === AcceleratorStage.CUSTOMIZATIONS) {
      app = `cdk.out/${
        AcceleratorStackNames[AcceleratorStage.CUSTOMIZATIONS]
      }-${options.accountId!}-${options.region!}`;
    } else {
      app = `cdk.out/${stackName}`;
    }
    const configuration = new Configuration({
      commandLineArguments: {
        _: [options.command as Command, ...[]],
        versionReporting: false,
        pathMetadata: false,
        assetMetadata: false,
        staging: false,
        lookups: false,
        app,
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

    const deployments = new Deployments({ sdkProvider });

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

    return new CdkToolkit({
      cloudExecutable,
      deployments,
      configuration,
      sdkProvider,
    });
  }
  private static async runDeployStackCli(
    context: string[],
    options: AcceleratorToolkitProps,
    stack: string,
    toolkitStackName: string,
    roleArn: string | undefined,
  ) {
    const cli = await AcceleratorToolkit.getCdkToolKit(context, options, stack);
    const selector: StackSelector = {
      patterns: [stack],
    };
    const changeSetName = `${stack}-change-set`;
    await cli
      .deploy({
        selector,
        toolkitStackName,
        requireApproval: options.requireApproval,
        changeSetName: changeSetName,
        hotswap: HotswapMode.FULL_DEPLOYMENT,
        tags: options.tags,
        roleArn: roleArn,
      })
      .catch(err => {
        logger.error(err);
        throw new Error('Deployment failed');
      });
  }
}

function getDeploymentRoleArn(props: { account?: string; region?: string; cdkOptions?: cdkOptionsConfig }) {
  if (!props.account || !props.region) {
    return;
  }
  const partition = process.env['PARTITION'] ?? 'aws';
  let roleArn;
  if (props.cdkOptions?.customDeploymentRole) {
    roleArn = `arn:${partition}:iam::${props.account}:role/${props.cdkOptions.customDeploymentRole}`;
  }
  return roleArn;
}
