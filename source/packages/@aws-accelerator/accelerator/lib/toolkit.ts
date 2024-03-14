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
import { createLogger } from '@aws-accelerator/utils/lib/logger';
import { getCloudFormationTemplate } from '@aws-accelerator/utils/lib/get-template';
import { getAllFilesInPattern, checkDiffFiles } from '@aws-accelerator/utils/lib/common-functions';
import { printStackDiff } from '@aws-accelerator/utils/lib/diff-stack';
import { isBeforeBootstrapStage } from '../utils/app-utils';

import { AcceleratorStackNames } from './accelerator';
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
export type CustomizationStackRunOrder = {
  stackName: string;
  runOrder: number;
};

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
  /**
   * Central logs kms key arn
   * @remarks
   * this is only possible after logging stack is run in centralizedLoggingRegion
   * It will be used in
   * - logging stack for replication to s3 bucket
   * - organizations stack for org trail
   * - security-audit stack for AWS config service, SSM session manager, account trail
   * - security stack for macie and guard duty
   */
  centralLogsBucketKmsKeyArn?: string;
  /**
   * Accelerator qualifier used for external deployment
   */
  qualifier?: string;
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
        await AcceleratorToolkit.diffStacks(options);
        break;

      case Command.DEPLOY:
        await AcceleratorToolkit.deployStacks(context, toolkitStackName, options);
        break;
      case Command.SYNTHESIZE:
      case Command.SYNTH:
        await AcceleratorToolkit.synthStacks(cli, options);
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

    try {
      await cli.bootstrap(environments, bootstrapper, bootstrapEnvOptions);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      if (e.code === 'ExpiredToken' || e.name === 'ExpiredToken') {
        throw new Error(
          `Credentials expired for account ${options.accountId} in region ${options.region} running command ${options.command}`,
        );
      }
    }
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
   * Function to initialize stack name which are not dependent on config, such as  PIPELINE, TESTER PIPELINE and DIAGNOSTICS_PACK stack name
   * @param stageName {@link AcceleratorStage}
   * @param props
   * @returns
   */
  public static getNonConfigDependentStackName(
    stageName: AcceleratorStage,
    props: { stage: string; accountId?: string; region?: string },
  ) {
    if (stageName === AcceleratorStage.DIAGNOSTICS_PACK) {
      return process.env['ACCELERATOR_QUALIFIER']
        ? `${process.env['ACCELERATOR_QUALIFIER']}-DiagnosticsPackStack-${props.accountId}-${props.region}`
        : `${AcceleratorStackNames[props.stage]}-${props.accountId}-${props.region}`;
    }

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
   * @returns customizationStackNames string[]
   */
  private static async getCustomizationsStackNames(
    stackNames: string[],
    options: AcceleratorToolkitProps,
  ): Promise<string[]> {
    const configDirPath = AcceleratorToolkit.validateAndGetConfigDirectory(options.configDirPath);

    if (fs.existsSync(path.join(configDirPath, CustomizationsConfig.FILENAME))) {
      const accountsConfig = AccountsConfig.load(configDirPath);
      const homeRegion = GlobalConfig.loadRawGlobalConfig(configDirPath).homeRegion;
      const isOrgsEnabled = OrganizationConfig.loadRawOrganizationsConfig(configDirPath).enable;
      const replacementsConfig = getReplacementsConfig(configDirPath, accountsConfig);
      await replacementsConfig.loadReplacementValues({ region: homeRegion }, isOrgsEnabled);
      const organizationConfig = OrganizationConfig.load(configDirPath, replacementsConfig);
      await accountsConfig.loadAccountIds(
        options.partition,
        options.enableSingleAccountMode,
        organizationConfig.enable,
        accountsConfig,
      );

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
   * Function to get the runOrder of custom stacks
   * @param options {@link AcceleratorToolkitProps}
   * @returns customizationsStackRunOrderData CustomizationStackRunOrder[]
   */
  private static async getCustomizationsStackRunOrder(
    options: AcceleratorToolkitProps,
  ): Promise<CustomizationStackRunOrder[]> {
    const customizationsStackRunOrderData: CustomizationStackRunOrder[] = [];
    const configDirPath = AcceleratorToolkit.validateAndGetConfigDirectory(options.configDirPath);

    if (fs.existsSync(path.join(configDirPath, CustomizationsConfig.FILENAME))) {
      const accountsConfig = AccountsConfig.load(configDirPath);
      const homeRegion = GlobalConfig.loadRawGlobalConfig(configDirPath).homeRegion;
      const isOrgsEnabled = OrganizationConfig.loadRawOrganizationsConfig(configDirPath).enable;
      const replacementsConfig = getReplacementsConfig(configDirPath, accountsConfig);
      await replacementsConfig.loadReplacementValues({ region: homeRegion }, isOrgsEnabled);
      const organizationConfig = OrganizationConfig.load(configDirPath, replacementsConfig);
      await accountsConfig.loadAccountIds(
        options.partition,
        options.enableSingleAccountMode,
        organizationConfig.enable,
        accountsConfig,
      );

      const customizationsConfig = CustomizationsConfig.load(configDirPath, replacementsConfig);
      const customStacks = customizationsConfig.getCustomStacks();
      for (const stack of customStacks) {
        const deploymentAccts = accountsConfig.getAccountIdsFromDeploymentTarget(stack.deploymentTargets);
        const deploymentRegions = stack.regions.map(a => a.toString());
        if (deploymentRegions.includes(options.region!) && deploymentAccts.includes(options.accountId!)) {
          customizationsStackRunOrderData.push({
            stackName: `${stack.name}-${options.accountId}-${options.region}`,
            runOrder: stack.runOrder,
          });
        }
      }
    }
    logger.debug(
      `Sorted customization stack: ${JSON.stringify(
        customizationsStackRunOrderData.sort((a, b) => a.runOrder - b.runOrder),
      )}`,
    );
    return customizationsStackRunOrderData.sort((a, b) => a.runOrder - b.runOrder);
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
        partition: options.partition,
      });
    }

    if (
      // stage is customizations
      options.stage === AcceleratorStage.CUSTOMIZATIONS &&
      // there are stacks in customizations which have runOrder
      (await AcceleratorToolkit.getCustomizationsStackRunOrder(options)).length > 0
    ) {
      const getStackNameRunOrder = await AcceleratorToolkit.getCustomizationsStackRunOrder(options);
      await AcceleratorToolkit.deployCustomizationStacksWithRunOrder(
        getStackNameRunOrder,
        context,
        options,
        toolkitStackName,
        roleArn,
      );
    } else {
      const deployPromises: Promise<void>[] = [];
      for (const stack of stackName) {
        deployPromises.push(AcceleratorToolkit.runDeployStackCli(context, options, stack, toolkitStackName, roleArn));
      }
      await Promise.all(deployPromises);
    }
  }

  /**
   * Function to deploy custom stacks with runOrder
   * This function takes all the custom stacks for a particular account and region
   * It finds the lowestRunOrder and deploys that first
   * Repeats the above step recursively until no stacks are left to deploy
   * @param stackData {@link CustomizationStackRunOrder[]}
   * @param context string[]
   * @param options {@link AcceleratorToolkitProps}
   * @param toolkitStackName string
   * @param roleArn string
   * @returns Promise<void>
   *
   */
  private static async deployCustomizationStacksWithRunOrder(
    stackData: CustomizationStackRunOrder[],
    context: string[],
    options: AcceleratorToolkitProps,
    toolkitStackName: string,
    roleArn: string | undefined,
  ) {
    // set first run order index;
    let runOrderIndex = stackData[0].runOrder;
    const deployPromises: Promise<void>[] = [];
    for (const stack of stackData) {
      // If the run order has changed, deploy previous stacks.
      if (runOrderIndex !== stack.runOrder) {
        await Promise.all(deployPromises);
        deployPromises.length = 0;
        runOrderIndex = stack.runOrder;
      }
      deployPromises.push(
        AcceleratorToolkit.runDeployStackCli(context, options, stack.stackName, toolkitStackName, roleArn),
      );
    }
    // Execute customization stack, regardless of runOrder customizations stack must be executed if present
    deployPromises.push(
      AcceleratorToolkit.runDeployStackCli(
        context,
        options,
        `${AcceleratorStackNames[AcceleratorStage.CUSTOMIZATIONS]}-${options.accountId}-${options.region}`,
        toolkitStackName,
        roleArn,
      ),
    );
    await Promise.all(deployPromises);
  }

  /**
   * Function to diff stacks
   * @param cli {@link CdkToolkit}
   * @param toolkitStackName string
   * @param options {@link AcceleratorToolkitProps}
   */
  private static async diffStacks(options: AcceleratorToolkitProps) {
    const stackName = await AcceleratorToolkit.getStackNames(options);

    const diffPromises: Promise<void>[] = [];
    for (const stack of stackName) {
      diffPromises.push(AcceleratorToolkit.runDiffStackCli(options, stack));
    }
    await Promise.all(diffPromises);
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
          AcceleratorToolkit.getNonConfigDependentStackName(AcceleratorStage.PIPELINE, {
            stage: options.stage,
            accountId: options.accountId,
            region: options.region,
          }),
        ];
        break;
      case AcceleratorStage.TESTER_PIPELINE:
        stackName = [
          AcceleratorToolkit.getNonConfigDependentStackName(AcceleratorStage.TESTER_PIPELINE, {
            stage: options.stage,
            accountId: options.accountId,
            region: options.region,
          }),
        ];
        break;
      case AcceleratorStage.DIAGNOSTICS_PACK:
        stackName = [
          AcceleratorToolkit.getNonConfigDependentStackName(AcceleratorStage.DIAGNOSTICS_PACK, {
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
          `${AcceleratorStackNames[AcceleratorStage.NETWORK_ASSOCIATIONS_GWLB]}-${options.accountId}-${options.region}`,
        ];
        break;
      case AcceleratorStage.CUSTOMIZATIONS:
        stackName.push(
          `${AcceleratorStackNames[AcceleratorStage.RESOURCE_POLICY_ENFORCEMENT]}-${options.accountId}-${
            options.region
          }`,
        );
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
  private static async synthStacks(cli: CdkToolkit, options: AcceleratorToolkitProps) {
    await cli.synth([], false, true).catch(err => {
      logger.error(err);
      logger.error(`Options were: ${JSON.stringify(options)}`);
      throw new Error(`Synthesis of stacks failed`);
    });
  }

  private static async getCdkToolKit(context: string[], options: AcceleratorToolkitProps, stackName: string) {
    const app = await AcceleratorToolkit.setOutputDirectory(options, stackName);
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
    await cli
      .deploy({
        selector,
        toolkitStackName,
        requireApproval: options.requireApproval,
        deploymentMethod: {
          method: 'change-set',
          changeSetName: `${stack}-change-set`,
        },
        hotswap: HotswapMode.FULL_DEPLOYMENT,
        tags: options.tags,
        roleArn: roleArn,
      })
      .catch(err => {
        logger.error(err);
        throw new Error('Deployment failed');
      });
  }
  private static async runDiffStackCli(options: AcceleratorToolkitProps, stack: string) {
    const saveDirectory = await AcceleratorToolkit.setOutputDirectory(options, stack);
    const savePath = path.join(__dirname, '..', saveDirectory!);
    const stacksInFolder = await getAllFilesInPattern(savePath, '.template.json');

    const roleName = GlobalConfig.loadRawGlobalConfig(options.configDirPath!).managementAccountAccessRole;

    for (const eachStack of stacksInFolder) {
      logger.debug(
        `Running diff for stack ${eachStack} in stage ${options.stage} for account ${options.accountId} in region ${options.region}`,
      );
      await getCloudFormationTemplate(
        options.accountId!,
        options.region!,
        options.partition!,
        options.stage,
        eachStack,
        savePath,
        roleName,
      );
      const stream = fs.createWriteStream(path.join(savePath, `${eachStack}.diff`), { flags: 'w' });
      await stream.write(`\nStack: ${stack} \n`);
      await printStackDiff(
        path.join(savePath, `${eachStack}.json`),
        path.join(savePath, `${eachStack}.template.json`),
        false,
        3,
        false,
        stream,
      );
      await stream.close();
    }
    await checkDiffFiles(savePath, '.template.json', '.diff');
  }

  private static async setOutputDirectory(
    options: AcceleratorToolkitProps,
    stackName: string,
  ): Promise<string | undefined> {
    if (
      options.stage === AcceleratorStage.PIPELINE ||
      options.stage === AcceleratorStage.TESTER_PIPELINE ||
      options.stage === AcceleratorStage.DIAGNOSTICS_PACK ||
      options.stage === AcceleratorStage.IMPORT_ASEA_RESOURCES ||
      options.stage === AcceleratorStage.POST_IMPORT_ASEA_RESOURCES
    ) {
      return options.app;
    } else if (options.stage === AcceleratorStage.NETWORK_ASSOCIATIONS_GWLB) {
      return `cdk.out/${
        AcceleratorStackNames[AcceleratorStage.NETWORK_ASSOCIATIONS]
      }-${options.accountId!}-${options.region!}`;
    } else if (
      options.stage === AcceleratorStage.NETWORK_VPC_ENDPOINTS ||
      options.stage === AcceleratorStage.NETWORK_VPC
    ) {
      return `cdk.out/${
        AcceleratorStackNames[AcceleratorStage.NETWORK_VPC_DNS]
      }-${options.accountId!}-${options.region!}`;
    } else if (options.stage === AcceleratorStage.CUSTOMIZATIONS) {
      return `cdk.out/${
        AcceleratorStackNames[AcceleratorStage.CUSTOMIZATIONS]
      }-${options.accountId!}-${options.region!}`;
    } else {
      return `cdk.out/${stackName}`;
    }
  }
}

function getDeploymentRoleArn(props: {
  account?: string;
  region?: string;
  cdkOptions?: cdkOptionsConfig;
  partition: string;
}) {
  if (!props.account || !props.region) {
    return;
  }
  let roleArn;
  if (props.cdkOptions?.customDeploymentRole) {
    roleArn = `arn:${props.partition}:iam::${props.account}:role/${props.cdkOptions.customDeploymentRole}`;
  }
  return roleArn;
}
