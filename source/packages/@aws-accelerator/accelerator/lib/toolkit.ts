/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { App } from 'aws-cdk-lib';

import { cdkOptionsConfig, GlobalConfig } from '@aws-accelerator/config';
import { createCdkApp } from './app-lib';
import {
  createLogger,
  getCloudFormationTemplate,
  getAllFilesInPattern,
  checkDiffFiles,
  printStackDiff,
} from '@aws-accelerator/utils';

import { AcceleratorStackNames } from './accelerator';
import { AcceleratorStage } from './accelerator-stage';
import {
  BaseCredentials,
  BootstrapEnvironments,
  BootstrapOptions,
  BootstrapSource,
  BootstrapStackParameters,
  CdkAppMultiContext,
  DeploymentMethod,
  DeployResult,
  StackSelectionStrategy,
  Toolkit,
  ToolkitError,
} from '@aws-cdk/toolkit-lib';
import { SDKv3CompatibleCredentialProvider } from '@aws-cdk/cli-plugin-contract';
import { fromNodeProviderChain, fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import { setRetryStrategy, getGlobalRegion } from '@aws-accelerator/utils/lib/common-functions';

const logger = createLogger(['toolkit']);
process.on('unhandledRejection', err => {
  logger.error(err);
  throw new Error('Runtime Error');
});

/**
 * CDK toolkit commands
 */
export enum AcceleratorToolkitCommand {
  BOOTSTRAP = 'bootstrap',
  DEPLOY = 'deploy',
  DIFF = 'diff',
  SYNTH = 'synth',
  SYNTHESIZE = 'synth',
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
  /***
   * Management account ID
   */
  managementAccountId: string;
  /**
   * Assume role name
   */
  assumeRoleName?: string;
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
  /**
   * Stack names for custom stack deployment
   */
  stackNames?: string[];
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
   * Accelerator customized execution of the Toolkit based on
   * https://www.npmjs.com/package/@aws-cdk/toolkit-lib
   *
   * @param options {@link AcceleratorToolkitProps}
   */
  static async execute(options: AcceleratorToolkitProps): Promise<void> {
    //
    // Validate options
    AcceleratorToolkit.validateOptions(options);

    logger.info(`Starting CDK toolkit execution`);
    //
    const toolkitStackName = `${options.stackPrefix}-CDKToolkit`;
    const cli = await this.getCdkToolKit(options, toolkitStackName);

    switch (options.command) {
      case AcceleratorToolkitCommand.BOOTSTRAP:
        await AcceleratorToolkit.bootstrapToolKitStacks(cli, options);
        break;
      case AcceleratorToolkitCommand.DIFF:
        await AcceleratorToolkit.diffStacks(options);
        break;

      case AcceleratorToolkitCommand.DEPLOY:
        await AcceleratorToolkit.deployStacks(cli, options);
        break;
      case AcceleratorToolkitCommand.SYNTHESIZE:
      case AcceleratorToolkitCommand.SYNTH:
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
   * Function to Bootstrap the CDK Toolkit stack in the accounts used by the specified stack(s).
   * @param cli {@link Toolkit}
   * @param options {@link AcceleratorToolkitProps}
   */
  private static async bootstrapToolKitStacks(cli: Toolkit, options: AcceleratorToolkitProps) {
    let source = BootstrapSource.default();

    const environments = BootstrapEnvironments.fromList([`aws://${options.accountId}/${options.region}`]);
    const trustedAccounts: string[] = [];
    if (options.trustedAccountId && options.trustedAccountId != options.accountId) {
      trustedAccounts.push(options.trustedAccountId);
    }

    // Use custom bootstrapping template if cdk options are set
    if (
      options.centralizeCdkBootstrap ||
      options.cdkOptions?.centralizeBuckets ||
      options.cdkOptions?.useManagementAccessRole ||
      options.cdkOptions?.customDeploymentRole
    ) {
      process.env['CDK_NEW_BOOTSTRAP'] = '1';
      const bootstrapStackName = `${AcceleratorStackNames[AcceleratorStage.BOOTSTRAP]}-${options.accountId}-${
        options.region
      }`;
      const templatePath = `./cdk.out/${bootstrapStackName}/${bootstrapStackName}.template.json`;
      source = BootstrapSource.customTemplate(templatePath);
    }

    const bootstrapStackParameters: BootstrapStackParameters = {
      keepExistingParameters: true,
      parameters: {
        qualifier: 'accel',
        trustedAccounts,
        cloudFormationExecutionPolicies: [`arn:${options.partition}:iam::aws:policy/AdministratorAccess`],
      },
    };

    const bootstrapOptions: BootstrapOptions = {
      parameters: bootstrapStackParameters,
      source,
      terminationProtection: true,
    };

    try {
      await cli.bootstrap(environments, bootstrapOptions);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      if (e.code === 'ExpiredToken' || e.name === 'ExpiredToken') {
        throw new Error(
          `Credentials expired for account ${options.accountId} in region ${options.region} running command ${options.command}`,
        );
      }
      logger.error(`Bootstrap failed with error :${e}. Options are: ${JSON.stringify(options)}`);
      throw new Error(`Bootstrap for account ${options.accountId} in region ${options.region} failed.`);
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
   * Function to deploy stacks
   * @param cli {@link Toolkit}
   * @param toolkitStackName string
   * @param options {@link AcceleratorToolkitProps}
   */
  private static async deployStacks(cli: Toolkit, options: AcceleratorToolkitProps) {
    const stackName = await AcceleratorToolkit.getStackNames(options);
    const deploymentRoleName = AcceleratorToolkit.getDeploymentRole({
      stackPrefix: options.stackPrefix,
      customDeploymentRoleName: options.cdkOptions?.customDeploymentRole,
      accountId: options.accountId!,
      managementAccountId: options.managementAccountId,
      stage: options.stage!,
    });
    const roleArn = `arn:${options.partition}:iam::${options.accountId!}:role/${deploymentRoleName}`;
    const deployPromises: Promise<DeployResult>[] = [];
    for (const stack of stackName) {
      deployPromises.push(AcceleratorToolkit.runDeployStackCli(options, stack, cli, roleArn));
    }
    logger.debug(`Invoked deployStackCli for the following stacks: ${stackName}`);
    await Promise.all(deployPromises);
  }

  private static getDeploymentRole(props: {
    stackPrefix: string;
    customDeploymentRoleName?: string;
    accountId: string;
    managementAccountId: string;
    stage: string;
  }) {
    if (
      props.accountId === props.managementAccountId &&
      [AcceleratorStage.ACCOUNTS, AcceleratorStage.PREPARE].includes(props.stage as AcceleratorStage)
    ) {
      return `${props.stackPrefix}-Management-Deployment-Role`;
    }
    if (props.customDeploymentRoleName) {
      return props.customDeploymentRoleName;
    }
    return `${props.stackPrefix}-Deployment-Role`;
  }

  /**
   * Function to diff stacks
   * @param cli {@link Toolkit}
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
    if (options.stackNames) {
      logger.debug(`Stack names already provided in ToolkitOptions: ${options.stackNames}`);
      return options.stackNames;
    }
    const stageName = AcceleratorToolkit.validateAndGetDeployStage(options);
    logger.debug(`Stage name: ${stageName}`);
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
      case AcceleratorStage.IMPORT_ASEA_RESOURCES:
      case AcceleratorStage.POST_IMPORT_ASEA_RESOURCES:
        stackName = [options.stack!];
        break;
    }
    logger.debug(`Returning the following stack names: ${stackName}`);
    return stackName;
  }

  /**
   * Synthesizes a single CDK app with error handling
   * @param toolkit CDK Toolkit instance
   * @param app CDK App to synthesize
   * @param options Accelerator toolkit options for error context
   */
  private static async synthesizeCdkApp(toolkit: Toolkit, app: App, options: AcceleratorToolkitProps): Promise<void> {
    const contextStore = new CdkAppMultiContext(path.resolve(__dirname, '..'));
    try {
      const cloudAssemblySource = await toolkit.fromAssemblyBuilder(async () => app.synth(), {
        contextStore,
        clobberEnv: true,
        synthOptions: {
          versionReporting: false,
          pathMetadata: false,
        },
      });

      try {
        const cloudAssembly = await toolkit.synth(cloudAssemblySource);
        await cloudAssembly.dispose();
      } catch (error) {
        if (ToolkitError.isAuthenticationError(error)) {
          logger.error('Authentication failed. Check your AWS credentials.');
        } else if (ToolkitError.isAssemblyError(error)) {
          logger.error('CDK app assembly error:', (error as Error).message);
        } else if (ToolkitError.isContextProviderError(error)) {
          logger.error('CDK context provider error:', (error as Error).message);
        } else if (ToolkitError.isToolkitError(error)) {
          logger.error('CDK Toolkit error:', (error as Error).message);
        } else {
          logger.error('Unexpected error:', error);
        }
        throw error;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      logger.error('Assembly builder error details:');
      logger.error(err.stack || err.toString());
      logger.error(`Options were: ${JSON.stringify(options)}`);
      throw err;
    }
  }

  private static async synthStacks(toolkit: Toolkit, options: AcceleratorToolkitProps) {
    logger.info('Begin Accelerator CDK App');
    const apps = await createCdkApp(options);
    const appsArray = Array.isArray(apps) ? apps : [apps];

    for (const app of appsArray) {
      await AcceleratorToolkit.synthesizeCdkApp(toolkit, app, options);
    }
    logger.info('End Accelerator CDK App');
  }

  private static async getCdkToolKit(options: AcceleratorToolkitProps, toolkitStackName: string) {
    logger.debug(`Getting toolkit for command ${options.command}`);
    const agentOptions: https.AgentOptions = {};

    // Add CA bundle if provided
    if (options.caBundlePath) {
      agentOptions.ca = fs.readFileSync(options.caBundlePath);
    }

    // Add proxy if provided
    if (options.proxyAddress) {
      const proxyUrl = new URL(options.proxyAddress);
      agentOptions.host = proxyUrl.hostname;
      agentOptions.port = parseInt(proxyUrl.port);
    }

    if (options.command === 'diff' || options.command === 'synth') {
      new Toolkit({
        sdkConfig: {
          httpOptions: {
            agent: new https.Agent(agentOptions),
          },
        },
        toolkitStackName: toolkitStackName,
      });
    }
    return new Toolkit({
      sdkConfig: {
        httpOptions: {
          agent: new https.Agent(agentOptions),
        },
        baseCredentials: BaseCredentials.custom({
          provider: await sdkProvider(
            options.managementAccountId,
            options.accountId!,
            options.partition,
            options.region!,
            options.assumeRoleName,
            options.stage,
          ),
        }),
      },
      toolkitStackName: toolkitStackName,
    });
  }

  private static async runDeployStackCli(
    options: AcceleratorToolkitProps,
    stackName: string,
    toolkit: Toolkit,
    roleArn: string | undefined,
  ) {
    const appPath = await AcceleratorToolkit.setOutputDirectory(options, stackName);
    if (!appPath) {
      throw new Error(`CDK App path for ${stackName} is undefined`);
    }

    const deploymentMethod: DeploymentMethod = getDeploymentMethod(stackName, options?.cdkOptions?.deploymentMethod);

    try {
      // Create cloud assembly source from the CDK app
      logger.debug(`Creating cloud assembly source from ${appPath}`);
      const cloudAssemblySource = await toolkit.fromAssemblyDirectory(appPath);

      // Deploy with environment-specific options
      logger.debug(`Deploying stack ${stackName} using role ${roleArn}`);
      return await toolkit.deploy(cloudAssemblySource, {
        concurrency: 1,
        deploymentMethod: deploymentMethod,
        roleArn: roleArn,
        stacks: {
          strategy: StackSelectionStrategy.ALL_STACKS,
        },
        tags: options.tags,
      });
    } catch (error) {
      logger.error(`Deployment of ${stackName} failed:`, error);
      throw error;
    }
  }

  private static async runDiffStackCli(options: AcceleratorToolkitProps, stack: string) {
    const saveDirectory = await AcceleratorToolkit.setOutputDirectory(options, stack);
    const savePath = path.join(__dirname, '..', saveDirectory!);
    let stacksInFolder = await getAllFilesInPattern(savePath, '.template.json');
    // Customizations evaluates on a per stack basis, so this ensures that only one stack will be processed instead of all stacks in the directory
    if (options.stage === AcceleratorStage.CUSTOMIZATIONS) {
      stacksInFolder = stacksInFolder.filter(stackInFolder => stackInFolder.includes(stack));
    }
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
      await stream.write(`\nStack: ${eachStack} \n`);
      await printStackDiff(
        path.join(savePath, `${eachStack}.json`),
        path.join(savePath, `${eachStack}.template.json`),
        false,
        3,
        false,
        undefined,
        stream,
      );
      await stream.close();
    }
    // Customizations stack will evaluate on a per stack basis, so no need to check the diff files on this stage.
    if (options.stage !== AcceleratorStage.CUSTOMIZATIONS) {
      await checkDiffFiles(savePath, '.template.json', '.diff');
    }
  }

  private static async setOutputDirectory(
    options: AcceleratorToolkitProps,
    stackName: string,
  ): Promise<string | undefined> {
    if (
      options.stage === AcceleratorStage.TESTER_PIPELINE ||
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

function getDeploymentMethod(stack: string, deploymentType: string | undefined): DeploymentMethod {
  if (deploymentType === 'change-set') {
    return {
      method: 'change-set',
      changeSetName: `${stack}-change-set`,
    };
  }

  return {
    method: 'direct',
  };
}

async function sdkProvider(
  managementAccountId: string,
  accountId: string,
  partition: string,
  region: string,
  assumeRoleName?: string,
  stage?: string,
): Promise<SDKv3CompatibleCredentialProvider> {
  // check to see if deployment is external or standard
  const isExternalDeployment = process.env['MANAGEMENT_ACCOUNT_ID'] && process.env['MANAGEMENT_ACCOUNT_ROLE_NAME'];

  // if current account is management account and not external pipeline
  const isManagementAccount = !isExternalDeployment && accountId === managementAccountId;

  const isManagementAccountExternalDeployment = isExternalDeployment && accountId === managementAccountId;
  const isNonManagementAccountExternalDeployment = isExternalDeployment && accountId !== managementAccountId;

  const installStage = [AcceleratorStage.DIAGNOSTICS_PACK, AcceleratorStage.PIPELINE, AcceleratorStage.TESTER_PIPELINE];

  const isExternalInstallStage = isExternalDeployment && installStage.includes(stage as AcceleratorStage);

  if (isExternalInstallStage) {
    logger.debug(
      `Using current credentials for external deployment of management account in installer phase ${managementAccountId}`,
    );
    return fromNodeProviderChain();
  } else if (isManagementAccountExternalDeployment) {
    logger.debug(
      `Using temporary credentials for external deployment of management account ${accountId} with role ${process.env['MANAGEMENT_ACCOUNT_ROLE_NAME']}`,
    );
    return fromNodeProviderChain();
  } else if (isNonManagementAccountExternalDeployment) {
    logger.debug(
      `Using chained temporary credentials for external deployment: Management Account ${process.env['MANAGEMENT_ACCOUNT_ID']} -> Target Account ${accountId} with role ${assumeRoleName}`,
    );
    return fromTemporaryCredentials({
      params: {
        RoleArn: `arn:${partition}:iam::${accountId}:role/${assumeRoleName}`,
        RoleSessionName: 'cdk-toolkit-session',
      },
      clientConfig: { retryStrategy: setRetryStrategy(), region: region ?? getGlobalRegion(partition) },
    });
  } else if (isManagementAccount || !assumeRoleName || !accountId) {
    logger.debug(`Using environment credentials`);
    return fromNodeProviderChain();
  }
  // this is non-management account of regular deployment
  logger.debug(`Using temporary credentials for account ${accountId} with role ${assumeRoleName}`);
  return fromTemporaryCredentials({
    params: {
      RoleArn: `arn:${partition}:iam::${accountId}:role/${assumeRoleName}`,
      RoleSessionName: 'lza-session',
    },
    clientConfig: { retryStrategy: setRetryStrategy(), region: region ?? getGlobalRegion(partition) },
  });
}
