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

/* istanbul ignore file */

import { PluginHost } from 'aws-cdk/lib/api/plugin';
import { RequireApproval } from 'aws-cdk/lib/diff';
import { Command } from 'aws-cdk/lib/settings';
import * as AWS from 'aws-sdk';
import * as fs from 'fs';
import { AssumeRoleCommandOutput } from '@aws-sdk/client-sts';
import {
  SSMClient,
  GetParameterCommand,
  GetParameterCommandInput,
  GetParameterCommandOutput,
} from '@aws-sdk/client-ssm';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import { IAMClient, GetRoleCommand, GetRoleCommandInput } from '@aws-sdk/client-iam';
import {
  AccountsConfig,
  GlobalConfig,
  OrganizationConfig,
  CustomizationsConfig,
  ReplacementsConfig,
  Region,
  DeploymentTargets,
} from '@aws-accelerator/config';
import { createLogger } from '@aws-accelerator/utils/lib/logger';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import {
  getCrossAccountCredentials,
  getGlobalRegion,
  getCurrentAccountId,
} from '@aws-accelerator/utils/lib/common-functions';

import { AssumeProfilePlugin } from '@aws-cdk-extensions/cdk-plugin-assume-role';
import { getReplacementsConfig, isBeforeBootstrapStage, writeImportResources } from '../utils/app-utils';
import { AcceleratorStage } from './accelerator-stage';
import { AcceleratorToolkit, AcceleratorToolkitProps } from './toolkit';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { Regions } from '@aws-accelerator/utils/lib/regions';

export type CustomStackRunOrder = {
  /**
   * Unique stack name for customizations config custom stack
   */
  stackName: string;
  /**
   * Run order of stack
   */
  runOrder: number;
  /**
   * Account Ids where custom stack is deployed to
   */
  accounts: string[];
  /**
   * Regions where custom stack is deployed to
   */
  regions: string[];
};

export type ApplicationStackRunOrder = {
  /**
   * Unique stack name for application stack
   */
  stackName: string;
  /**
   * Account Ids where application stack is deployed to
   */
  accounts: string[];
  /**
   * Regions where application stack is deployed to
   */
  regions: string[];
};
const logger = createLogger(['accelerator']);

process.on('uncaughtException', err => {
  logger.error(err);
  throw new Error('Synthesis failed');
});

export const BootstrapVersion = 21;

//
// The accelerator stack prefix value
//
const stackPrefix = process.env['ACCELERATOR_PREFIX'] ?? 'AWSAccelerator';

/**
 * constant maintaining cloudformation stack names
 */
export const AcceleratorStackNames: Record<string, string> = {
  [AcceleratorStage.PREPARE]: `${stackPrefix}-PrepareStack`,
  [AcceleratorStage.DIAGNOSTICS_PACK]: `${stackPrefix}-DiagnosticsPackStack`,
  [AcceleratorStage.PIPELINE]: `${stackPrefix}-PipelineStack`,
  [AcceleratorStage.TESTER_PIPELINE]: `${stackPrefix}-TesterPipelineStack`,
  [AcceleratorStage.ORGANIZATIONS]: `${stackPrefix}-OrganizationsStack`,
  [AcceleratorStage.KEY]: `${stackPrefix}-KeyStack`,
  [AcceleratorStage.LOGGING]: `${stackPrefix}-LoggingStack`,
  [AcceleratorStage.BOOTSTRAP]: `${stackPrefix}-BootstrapStack`,
  [AcceleratorStage.ACCOUNTS]: `${stackPrefix}-AccountsStack`,
  [AcceleratorStage.DEPENDENCIES]: `${stackPrefix}-DependenciesStack`,
  [AcceleratorStage.SECURITY]: `${stackPrefix}-SecurityStack`,
  [AcceleratorStage.SECURITY_RESOURCES]: `${stackPrefix}-SecurityResourcesStack`,
  [AcceleratorStage.RESOURCE_POLICY_ENFORCEMENT]: `${stackPrefix}-ResourcePolicyEnforcementStack`,
  [AcceleratorStage.OPERATIONS]: `${stackPrefix}-OperationsStack`,
  [AcceleratorStage.IDENTITY_CENTER]: `${stackPrefix}-IdentityCenterStack`,
  [AcceleratorStage.NETWORK_PREP]: `${stackPrefix}-NetworkPrepStack`,
  [AcceleratorStage.NETWORK_VPC]: `${stackPrefix}-NetworkVpcStack`,
  [AcceleratorStage.NETWORK_VPC_ENDPOINTS]: `${stackPrefix}-NetworkVpcEndpointsStack`,
  [AcceleratorStage.NETWORK_VPC_DNS]: `${stackPrefix}-NetworkVpcDnsStack`,
  [AcceleratorStage.NETWORK_ASSOCIATIONS]: `${stackPrefix}-NetworkAssociationsStack`,
  [AcceleratorStage.NETWORK_ASSOCIATIONS_GWLB]: `${stackPrefix}-NetworkAssociationsGwlbStack`,
  [AcceleratorStage.FINALIZE]: `${stackPrefix}-FinalizeStack`,
  [AcceleratorStage.SECURITY_AUDIT]: `${stackPrefix}-SecurityAuditStack`,
  [AcceleratorStage.CUSTOMIZATIONS]: `${stackPrefix}-CustomizationsStack`,
};

/**
 * Properties for the accelerator wrapper class
 */
export interface AcceleratorProps {
  readonly command: string;
  readonly configDirPath: string;
  readonly stage?: string;
  readonly account?: string;
  readonly region?: string;
  readonly partition: string;
  readonly requireApproval: RequireApproval;
  readonly app?: string;
  readonly caBundlePath?: string;
  readonly ec2Creds?: boolean;
  readonly proxyAddress?: string;
  readonly enableSingleAccountMode: boolean;
  readonly useExistingRoles: boolean;
  readonly qualifier?: string;
}
let maxStacks = Number(process.env['MAX_CONCURRENT_STACKS'] ?? 250);

/**
 * Wrapper around the CdkToolkit. The Accelerator defines this wrapper to add
 * the following functionality:
 *
 * - Differentiation between single stack and multiple stack deployments
 * - Parallelization of multi-account/multi-region stack deployments
 * - Accelerator stage-specific deployment behaviors
 */
export abstract class Accelerator {
  static isSupportedStage(stage: AcceleratorStage): boolean {
    if (!stage) {
      return false;
    }
    return Object.values(AcceleratorStage).includes(stage);
  }

  /**
   * Executes commands conditionally based on CLI input
   * @returns
   */
  static async run(props: AcceleratorProps): Promise<void> {
    //
    // Set global region
    //
    const globalRegion = getGlobalRegion(props.partition);
    //
    // If not pipeline stage, load global config, management account credentials,
    // and assume role plugin
    //
    const configDependentStage = this.isConfigDependentStage(props.stage);
    const managementAccountCredentials = configDependentStage
      ? await this.getManagementAccountCredentials(props.partition)
      : undefined;
    const globalConfig = configDependentStage ? GlobalConfig.loadRawGlobalConfig(props.configDirPath) : undefined;
    if (globalConfig?.externalLandingZoneResources?.importExternalLandingZoneResources) {
      const orgsEnabled = OrganizationConfig.loadRawOrganizationsConfig(props.configDirPath).enable;
      const accountsConfig = AccountsConfig.load(props.configDirPath);
      await accountsConfig.loadAccountIds(props.partition, props.enableSingleAccountMode, orgsEnabled, accountsConfig);
      logger.info('Loading ASEA mapping for stacks list');
      await globalConfig.loadExternalMapping(accountsConfig);
      logger.info('Loaded ASEA mapping');
    }

    const shouldPerformNetworkRefactor = globalConfig?.cdkOptions?.stackRefactor?.networkVpcStack ?? false;

    if (shouldPerformNetworkRefactor && props.stage !== AcceleratorStage.NETWORK_VPC && props.command !== 'synth') {
      logger.info('Accelerator NetworkVpc Stack Refactor in progress, execution skipped.');
      return;
    }

    await checkDiffStage(props);

    //
    // When running parallel, this will be the max concurrent stacks
    //
    if (props.command === 'deploy') {
      maxStacks = globalConfig?.acceleratorSettings?.maxConcurrentStacks
        ? globalConfig?.acceleratorSettings?.maxConcurrentStacks
        : Number(process.env['MAX_CONCURRENT_STACKS'] ?? 250);
    }
    if (this.isConfigDependentStage(props.stage)) {
      const assumeRoleName = setAssumeRoleName({
        stage: props.stage,
        customDeploymentRole: globalConfig?.cdkOptions?.customDeploymentRole,
        command: props.command,
        managementAccountAccessRole: globalConfig?.managementAccountAccessRole,
      });
      const accountsConfig = AccountsConfig.load(props.configDirPath);
      const orgsConfig = OrganizationConfig.loadRawOrganizationsConfig(props.configDirPath);
      await accountsConfig.loadAccountIds(
        props.partition,
        props.enableSingleAccountMode,
        orgsConfig.enable,
        accountsConfig,
      );

      if (props.account !== accountsConfig.getManagementAccountId()) {
        await this.initializeAssumeRolePlugin({
          region: props.region ?? globalRegion,
          assumeRoleName,
          partition: props.partition,
          caBundlePath: props.caBundlePath,
          credentials: managementAccountCredentials,
        });
      }
    }
    //
    // Set toolkit props
    //
    const toolkitProps: AcceleratorToolkitProps = {
      command: props.command,
      enableSingleAccountMode: props.enableSingleAccountMode,
      partition: props.partition,
      stackPrefix,
      stage: props.stage,
      configDirPath: props.configDirPath,
      requireApproval: props.requireApproval,
      app: props.app,
      caBundlePath: props.caBundlePath,
      ec2Creds: props.ec2Creds,
      proxyAddress: props.proxyAddress,
      centralizeCdkBootstrap: globalConfig?.centralizeCdkBuckets?.enable,
      cdkOptions: globalConfig?.cdkOptions,
      useExistingRoles: props.useExistingRoles,
      // central logs bucket kms key arn is dynamic and will be populated in app-utils
      centralLogsBucketKmsKeyArn: undefined,
    };
    //
    // When an account and region is specified, execute as single stack.
    // Synth and diff commands are also treated as a single stack action
    //
    if (this.isSingleStackAction(props)) {
      await this.executeSingleStack(props, toolkitProps);

      //
      // Perform network refactor - diff set
      //
      if (shouldPerformNetworkRefactor && props.command === 'synth' && props.stage === AcceleratorStage.NETWORK_VPC) {
        logger.info('NetworkVpc Stack Refactor diff set will be calculated here.');
      }
    } else {
      //
      // Initialize array to enumerate promises created for parallel stack creation
      //
      const promises: Promise<void>[] = [];
      //
      // Global config is required for remaining stages
      //
      if (!globalConfig) {
        throw new Error(
          `global-config.yaml could not be loaded. Global configuration is required for stage ${props.stage}`,
        );
      }
      //
      // Read in the accounts config file and load account IDs
      // if not provided as inputs in accountsConfig
      //
      const accountsConfig = AccountsConfig.load(props.configDirPath);
      const organizationsConfig = OrganizationConfig.load(props.configDirPath);
      const homeRegion = GlobalConfig.loadRawGlobalConfig(props.configDirPath).homeRegion;
      await accountsConfig.loadAccountIds(
        props.partition,
        props.enableSingleAccountMode,
        organizationsConfig.enable,
        accountsConfig,
      );
      const replacementsConfig = getReplacementsConfig(props.configDirPath, accountsConfig);
      replacementsConfig.loadReplacementValues({ region: homeRegion }, organizationsConfig.enable);

      //
      // Set details about mandatory accounts
      //
      const managementAccountDetails = {
        id: accountsConfig.getManagementAccountId(),
        name: accountsConfig.getManagementAccount().name,
      };
      const logArchiveAccountDetails = {
        id: accountsConfig.getLogArchiveAccountId(),
        name: accountsConfig.getLogArchiveAccount().name,
        centralizedLoggingRegion: globalConfig.logging.centralizedLoggingRegion ?? globalConfig.homeRegion,
      };
      const auditAccountDetails = {
        id: accountsConfig.getAuditAccountId(),
        name: accountsConfig.getAuditAccount().name,
      };
      const regionDetails = {
        homeRegion: globalConfig.homeRegion,
        globalRegion: globalRegion,
        enabledRegions: globalConfig.enabledRegions,
      };

      //
      // Execute IMPORT_ASEA_RESOURCES Stage
      //
      await this.executeImportAseaResources(toolkitProps, promises, globalConfig, accountsConfig, maxStacks);
      //
      // Execute Bootstrap stacks for all identified accounts
      //
      await this.executeBootstrapStage(toolkitProps, promises, managementAccountDetails, globalConfig, accountsConfig);
      //
      // Execute PREPARE, ACCOUNTS, and FINALIZE stages in the management account
      //
      await this.executeManagementAccountStages(
        toolkitProps,
        globalConfig.homeRegion,
        globalRegion,
        managementAccountDetails,
      );
      //
      // Execute ORGANIZATIONS and SECURITY AUDIT stages
      //
      await this.executeSingleAccountMultiRegionStages(
        toolkitProps,
        promises,
        globalConfig.enabledRegions,
        managementAccountDetails,
        auditAccountDetails,
        maxStacks,
      );
      //
      // Execute LOGGING stage
      //
      await this.executeLoggingStage(
        toolkitProps,
        promises,
        accountsConfig,
        logArchiveAccountDetails,
        regionDetails,
        maxStacks,
      );

      let enabledRegions = globalConfig.enabledRegions;

      if (props.region) {
        if (!Regions.includes(props.region)) {
          throw Error(`Provided region: ${props.region} is not a valid aws region.`);
        }

        enabledRegions = [props.region as Region];
      }

      //
      // Perform network refactor - execute refactor
      //
      if (shouldPerformNetworkRefactor && props.command === 'deploy' && props.stage === AcceleratorStage.NETWORK_VPC) {
        logger.info('NetworkVpc Stack Refactor will be executed here.');
      }
      //
      // Execute all remaining stages
      //
      await this.executeRemainingStages(
        toolkitProps,
        promises,
        accountsConfig,
        managementAccountDetails,
        enabledRegions,
        maxStacks,
        replacementsConfig,
      );

      await Promise.all(promises);
    }
  }

  static async getManagementAccountCredentials(partition: string): Promise<AWS.STS.Credentials | undefined> {
    if (process.env['CREDENTIALS_PATH'] && fs.existsSync(process.env['CREDENTIALS_PATH'])) {
      logger.info('Detected Debugging environment. Loading temporary credentials.');

      const credentialsString = fs.readFileSync(process.env['CREDENTIALS_PATH']).toString();
      const credentials = JSON.parse(credentialsString);

      // Support for V2 SDK
      AWS.config.update({
        accessKeyId: credentials.AccessKeyId,
        secretAccessKey: credentials.SecretAccessKey,
        sessionToken: credentials.SessionToken,
      });
    }
    if (process.env['MANAGEMENT_ACCOUNT_ID'] && process.env['MANAGEMENT_ACCOUNT_ROLE_NAME']) {
      logger.info('set management account credentials');
      logger.info(`managementAccountId => ${process.env['MANAGEMENT_ACCOUNT_ID']}`);
      logger.info(`management account role name => ${process.env['MANAGEMENT_ACCOUNT_ROLE_NAME']}`);

      const roleArn = `arn:${partition}:iam::${process.env['MANAGEMENT_ACCOUNT_ID']}:role/${process.env['MANAGEMENT_ACCOUNT_ROLE_NAME']}`;
      const stsClient = new AWS.STS({ region: process.env['AWS_REGION'] });
      logger.info(`management account roleArn => ${roleArn}`);

      const assumeRoleCredential = await throttlingBackOff(() =>
        stsClient.assumeRole({ RoleArn: roleArn, RoleSessionName: 'acceleratorAssumeRoleSession' }).promise(),
      );

      process.env['AWS_ACCESS_KEY_ID'] = assumeRoleCredential.Credentials!.AccessKeyId!;
      process.env['AWS_ACCESS_KEY'] = assumeRoleCredential.Credentials!.AccessKeyId!;
      process.env['AWS_SECRET_KEY'] = assumeRoleCredential.Credentials!.SecretAccessKey!;
      process.env['AWS_SECRET_ACCESS_KEY'] = assumeRoleCredential.Credentials!.SecretAccessKey!;
      process.env['AWS_SESSION_TOKEN'] = assumeRoleCredential.Credentials!.SessionToken;

      // Support for V2 SDK
      AWS.config.update({
        accessKeyId: assumeRoleCredential.Credentials!.AccessKeyId,
        secretAccessKey: assumeRoleCredential.Credentials!.SecretAccessKey,
        sessionToken: assumeRoleCredential.Credentials!.SessionToken,
      });

      return assumeRoleCredential.Credentials;
    } else {
      return undefined;
    }
  }

  static async initializeAssumeRolePlugin(props: {
    region: string | undefined;
    assumeRoleName: string | undefined;
    partition: string;
    caBundlePath: string | undefined;
    credentials?: AWS.STS.Credentials;
  }): Promise<AssumeProfilePlugin> {
    const assumeRolePlugin = new AssumeProfilePlugin({
      region: props.region,
      assumeRoleName: props.assumeRoleName,
      assumeRoleDuration: 3600,
      credentials: props.credentials,
      partition: props.partition,
      caBundlePath: props.caBundlePath,
    });
    assumeRolePlugin.init(PluginHost.instance);
    return assumeRolePlugin;
  }

  /**
   * Returns true if the stage is dependent on config directory, except pipeline, tester-pipeline and diagnostic-pack all stages are config dependent
   * @param stage
   * @returns
   */
  private static isConfigDependentStage(stage?: string): boolean {
    if (!stage) {
      return true;
    }
    if (
      stage === AcceleratorStage.PIPELINE ||
      stage === AcceleratorStage.TESTER_PIPELINE ||
      stage === AcceleratorStage.DIAGNOSTICS_PACK
    ) {
      return false;
    }
    return true;
  }

  private static isSingleStackAction(props: AcceleratorProps) {
    return (
      (props.account && props.region) ||
      [Command.SYNTH.toString(), Command.SYNTHESIZE.toString()].includes(props.command)
    );
  }

  /**
   * Executes a single stack if both account and region are specified in the CLI command.
   * Also used if synth or diff commands are specified.
   * @param props
   * @param globalConfig
   * @returns
   */
  private static async executeSingleStack(
    props: AcceleratorProps,
    toolkitProps: AcceleratorToolkitProps,
  ): Promise<void> {
    // For single stack executions, ensure account and region are specified
    if (props.account || props.region) {
      if (props.account && !props.region) {
        logger.error(`Account set to ${props.account}, but region is undefined`);
        throw new Error(`CLI command validation failed at runtime.`);
      }
      if (props.region && !props.account) {
        logger.error(`Region set to ${props.region}, but account is undefined`);
        throw new Error(`CLI command validation failed at runtime.`);
      }
    }
    return AcceleratorToolkit.execute({
      accountId: props.account,
      region: props.region,
      ...toolkitProps,
    });
  }

  /**
   * Execute Bootstrap stage commands
   * @param toolkitProps
   * @param promises
   * @param managementAccountDetails
   * @param globalConfig
   * @param accountsConfig
   */
  private static async executeBootstrapStage(
    toolkitProps: AcceleratorToolkitProps,
    promises: Promise<void>[],
    managementAccountDetails: { id: string; name: string },
    globalConfig: GlobalConfig,
    accountsConfig: AccountsConfig,
  ) {
    if (toolkitProps.command === Command.BOOTSTRAP) {
      //
      // Bootstrap the Management account
      await this.bootstrapManagementAccount(
        toolkitProps,
        promises,
        managementAccountDetails.id,
        globalConfig.enabledRegions,
      );
      //
      // Bootstrap remaining accounts
      await this.bootstrapRemainingAccounts(
        toolkitProps,
        promises,
        accountsConfig,
        globalConfig,
        managementAccountDetails,
      );
    }
  }

  /**
   * Bootstrap the management account
   * @param toolkitProps
   * @param promises
   * @param managementAccountId
   * @param enabledRegions
   */
  private static async bootstrapManagementAccount(
    toolkitProps: AcceleratorToolkitProps,
    promises: Promise<void>[],
    managementAccountId: string,
    enabledRegions: string[],
  ): Promise<void> {
    for (const region of enabledRegions) {
      await delay(500);
      promises.push(
        AcceleratorToolkit.execute({
          accountId: managementAccountId,
          region,
          trustedAccountId: managementAccountId,
          ...toolkitProps,
          stage: 'bootstrap',
        }),
      );
      await Promise.all(promises);
      promises.length = 0;
    }
  }

  /**
   * Bootstrap all non-management accounts in the organization
   * @param toolkitProps
   * @param promises
   * @param accountsConfig
   * @param globalConfig
   * @param managementAccountDetails
   * @returns
   */
  private static async bootstrapRemainingAccounts(
    toolkitProps: AcceleratorToolkitProps,
    promises: Promise<void>[],
    accountsConfig: AccountsConfig,
    globalConfig: GlobalConfig,
    managementAccountDetails: { id: string; name: string },
  ): Promise<void> {
    const partition = toolkitProps.partition;
    const managementAccountAccessRole = globalConfig.managementAccountAccessRole;
    const centralizedBuckets = globalConfig.centralizeCdkBuckets?.enable || globalConfig.cdkOptions?.centralizeBuckets;
    const homeRegion = globalConfig.homeRegion;
    const customDeploymentRoleName = globalConfig.cdkOptions.customDeploymentRole;
    const forceBootstrap = globalConfig.cdkOptions.forceBootstrap;
    const nonManagementAccounts = accountsConfig
      .getAccounts(toolkitProps.enableSingleAccountMode)
      .filter(accountItem => accountItem.name !== managementAccountDetails.name);
    const bootstrapRequiredPromises = [];

    for (const region of globalConfig.enabledRegions) {
      for (const account of nonManagementAccounts) {
        const accountId = accountsConfig.getAccountId(account.name);
        bootstrapRequiredPromises.push(
          bootstrapRequired({
            accountId,
            region,
            partition,
            managementAccountAccessRole,
            centralizedBuckets,
            homeRegion,
            customDeploymentRoleName,
            forceBootstrap,
          }),
        );
      }
    }
    const bootstrapRequiredResults = await Promise.all(bootstrapRequiredPromises);
    const environmentsToBootstrap = bootstrapRequiredResults.filter(bootstrapInfo => bootstrapInfo.forceBootstrap);
    for (const env of environmentsToBootstrap) {
      await delay(500);
      promises.push(
        AcceleratorToolkit.execute({
          accountId: env.accountId,
          region: env.region,
          trustedAccountId: managementAccountDetails.id,
          ...toolkitProps,
          stage: 'bootstrap',
        }),
      );
      if (promises.length > 100) {
        await Promise.all(promises);
        promises.length = 0;
      }
    }
    await Promise.all(promises);
  }

  /**
   * Execute stages that are only deployed to the management account
   * @param toolkitProps
   * @param homeRegion
   * @param globalRegion
   * @param managementAccountDetails
   * @returns
   */
  private static async executeManagementAccountStages(
    toolkitProps: AcceleratorToolkitProps,
    homeRegion: string,
    globalRegion: string,
    managementAccountDetails: { id: string; name: string },
  ): Promise<void> {
    switch (toolkitProps.stage) {
      //
      // PREPARE and IDENTITY CENTER stage
      case AcceleratorStage.IDENTITY_CENTER:
      case AcceleratorStage.PREPARE:
        logger.info(`Executing ${toolkitProps.stage} for ${managementAccountDetails.name} account.`);
        return AcceleratorToolkit.execute({
          accountId: managementAccountDetails.id,
          region: homeRegion,
          ...toolkitProps,
        });

      //
      // ACCOUNTS and FINALIZE stages
      case AcceleratorStage.ACCOUNTS:
      case AcceleratorStage.FINALIZE:
        logger.info(`Executing ${toolkitProps.stage} for ${managementAccountDetails.name} account.`);
        return AcceleratorToolkit.execute({
          accountId: managementAccountDetails.id,
          region: globalRegion,
          ...toolkitProps,
        });
    }
  }

  /**
   * Execute single account, multi-region stages
   * @param toolkitProps
   * @param promises
   * @param enabledRegions
   * @param managementAccountDetails
   * @param auditAccountDetails
   */
  private static async executeSingleAccountMultiRegionStages(
    toolkitProps: AcceleratorToolkitProps,
    promises: Promise<void>[],
    enabledRegions: string[],
    managementAccountDetails: { id: string; name: string },
    auditAccountDetails: { id: string; name: string },
    maxStacks: number,
  ) {
    for (const region of enabledRegions) {
      switch (toolkitProps.stage) {
        //
        // ORGANIZATIONS stage
        case AcceleratorStage.ORGANIZATIONS:
          logger.info(
            `Executing ${toolkitProps.stage} for ${managementAccountDetails.name} account in ${region} region.`,
          );
          promises.push(
            AcceleratorToolkit.execute({
              accountId: managementAccountDetails.id,
              region,
              ...toolkitProps,
            }),
          );
          if (promises.length >= maxStacks) {
            await Promise.all(promises);
            promises.length = 0;
          }
          break;
        //
        // SECURITY AUDIT stage
        case AcceleratorStage.SECURITY_AUDIT:
          logger.info(`Executing ${toolkitProps.stage} for ${auditAccountDetails.name} account in ${region} region.`);
          promises.push(
            AcceleratorToolkit.execute({
              accountId: auditAccountDetails.id,
              region: region,
              ...toolkitProps,
            }),
          );
          if (promises.length >= maxStacks) {
            await Promise.all(promises);
            promises.length = 0;
          }
          break;
      }
    }
  }

  /**
   * Execute the Logging stage
   * @param toolkitProps
   * @param promises
   * @param accountsConfig
   * @param logArchiveAccountDetails
   * @param enabledRegions
   */
  private static async executeLoggingStage(
    toolkitProps: AcceleratorToolkitProps,
    promises: Promise<void>[],
    accountsConfig: AccountsConfig,
    logArchiveAccountDetails: { id: string; name: string; centralizedLoggingRegion: string },
    regionDetails: { homeRegion: string; globalRegion: string; enabledRegions: string[] },
    maxStacks: number,
  ) {
    if (toolkitProps.stage === AcceleratorStage.LOGGING) {
      //
      // Execute in centralized logging region before other regions in LogArchive account.
      // Centralized logging region needs to complete before other enabled regions due to cross-account/region dependency on the central logs bucket.
      logger.info(
        `Executing ${toolkitProps.stage} for ${logArchiveAccountDetails.name} account in ${logArchiveAccountDetails.centralizedLoggingRegion} region.`,
      );
      await AcceleratorToolkit.execute({
        accountId: logArchiveAccountDetails.id,
        region: logArchiveAccountDetails.centralizedLoggingRegion,
        ...toolkitProps,
      });
      // Execute in all other regions in the LogArchive account
      await this.executeLogArchiveNonCentralRegions(
        toolkitProps,
        logArchiveAccountDetails,
        regionDetails.enabledRegions,
      );

      //
      // Execute in all other regions and accounts
      await this.executeRemainingLoggingStage(
        toolkitProps,
        promises,
        accountsConfig,
        logArchiveAccountDetails,
        regionDetails.enabledRegions,
        maxStacks,
      );
    }
  }

  private static async executeLogArchiveNonCentralRegions(
    toolkitProps: AcceleratorToolkitProps,
    logArchiveAccountDetails: { id: string; name: string; centralizedLoggingRegion: string },
    enabledRegions: string[],
  ) {
    const nonCentralRegions = enabledRegions.filter(
      regionItem => regionItem !== logArchiveAccountDetails.centralizedLoggingRegion,
    );
    const loggingAccountPromises = [];
    for (const region of nonCentralRegions) {
      logger.info(`Executing ${toolkitProps.stage} for ${logArchiveAccountDetails.name} account in ${region} region.`);
      loggingAccountPromises.push(
        AcceleratorToolkit.execute({
          accountId: logArchiveAccountDetails.id,
          region: region,
          ...toolkitProps,
        }),
      );
    }
    await Promise.all(loggingAccountPromises);
  }

  /**
   * Execute Logging stage in all accounts and regions other than the LogArchive account
   * @param toolkitProps
   * @param promises
   * @param accountsConfig
   * @param logArchiveAccountDetails
   * @param enabledRegions
   */
  private static async executeRemainingLoggingStage(
    toolkitProps: AcceleratorToolkitProps,
    promises: Promise<void>[],
    accountsConfig: AccountsConfig,
    logArchiveAccountDetails: { id: string; name: string; centralizedLoggingRegion: string },
    enabledRegions: string[],
    maxStacks: number,
  ) {
    let nonLogArchiveAccounts = [...accountsConfig.mandatoryAccounts, ...accountsConfig.workloadAccounts].filter(
      accountItem => accountItem.name !== logArchiveAccountDetails.name,
    );

    // Avoid changeset collisions by reducing total accounts to 1
    if (toolkitProps.enableSingleAccountMode) {
      nonLogArchiveAccounts = [accountsConfig.mandatoryAccounts[0]];
    }

    for (const region of enabledRegions) {
      for (const account of nonLogArchiveAccounts) {
        if (
          !(
            account.name === logArchiveAccountDetails.name &&
            region === logArchiveAccountDetails.centralizedLoggingRegion
          )
        ) {
          const accountId = accountsConfig.getAccountId(account.name);
          logger.info(`Executing ${toolkitProps.stage} for ${account.name} account in ${region} region.`);
          promises.push(
            AcceleratorToolkit.execute({
              accountId,
              region,
              ...toolkitProps,
            }),
          );

          if (promises.length >= maxStacks) {
            await Promise.all(promises);
            promises.length = 0;
          }
        }
      }
    }
  }

  /**
   * Execute all remaining stages
   * @param toolkitProps
   * @param promises
   * @param accountsConfig
   * @param managementAccountDetails
   * @param enabledRegions
   */
  private static async executeRemainingStages(
    toolkitProps: AcceleratorToolkitProps,
    promises: Promise<void>[],
    accountsConfig: AccountsConfig,
    managementAccountDetails: { id: string; name: string },
    enabledRegions: string[],
    maxStacks: number,
    replacementsConfig: ReplacementsConfig,
  ) {
    if (
      toolkitProps.stage === AcceleratorStage.SECURITY ||
      toolkitProps.stage === AcceleratorStage.SECURITY_RESOURCES ||
      toolkitProps.stage === AcceleratorStage.OPERATIONS ||
      toolkitProps.stage === AcceleratorStage.NETWORK_PREP ||
      toolkitProps.stage === AcceleratorStage.NETWORK_VPC ||
      toolkitProps.stage === AcceleratorStage.NETWORK_ASSOCIATIONS ||
      toolkitProps.stage === AcceleratorStage.CUSTOMIZATIONS ||
      toolkitProps.stage === AcceleratorStage.KEY
    ) {
      //
      // Execute for all regions in Management account
      await this.executeManagementRemainingStages(toolkitProps, promises, managementAccountDetails.id, enabledRegions);
      await Promise.all(promises);
      promises.length = 0;
      //
      // Execute for all remaining accounts and regions
      await this.executeAllAccountRemainingStages(
        toolkitProps,
        promises,
        accountsConfig,
        managementAccountDetails.name,
        enabledRegions,
        maxStacks,
      );
      await Promise.all(promises);
      promises.length = 0;

      // check to see if customizations has stacks. If no stacks are specified then do nothing
      if (
        fs.existsSync(path.join(toolkitProps.configDirPath!, CustomizationsConfig.FILENAME)) &&
        toolkitProps.stage === AcceleratorStage.CUSTOMIZATIONS
      ) {
        this.executeCustomizationsStacks(
          toolkitProps,
          promises,
          replacementsConfig,
          accountsConfig,
          enabledRegions,
          maxStacks,
        );
      }
      // clearing queue after customizations run
      await Promise.all(promises);
      promises.length = 0;
    }
  }
  private static async executeCustomizationsStacks(
    toolkitProps: AcceleratorToolkitProps,
    promises: Promise<void>[],
    replacementsConfig: ReplacementsConfig,
    accountsConfig: AccountsConfig,
    enabledRegions: string[],
    maxStacks: number,
  ) {
    const customizationsConfig = CustomizationsConfig.load(toolkitProps.configDirPath!, replacementsConfig);
    const customStacks = customizationsConfig.getCustomStacks();
    const customizationsStackRunOrderData: CustomStackRunOrder[] = [];
    for (const stack of customStacks) {
      // get accounts where custom stack is deployed to
      const deploymentAccts = accountsConfig.getAccountIdsFromDeploymentTarget(stack.deploymentTargets);
      // get regions where custom stack is deployed to
      const deploymentRegions = stack.regions.map(a => a.toString()).filter(r => enabledRegions.includes(r));
      customizationsStackRunOrderData.push({
        stackName: stack.name,
        runOrder: stack.runOrder,
        accounts: deploymentAccts,
        regions: deploymentRegions,
      });
    }
    const groupedRunOrders = groupByRunOrder(customizationsStackRunOrderData);

    for (const groupRunOrder of groupedRunOrders) {
      for (const stack of groupRunOrder.stacks) {
        logger.info(
          `Executing custom stacks ${stack.stackNames.join(', ')} for ${stack.account} account in ${
            stack.region
          } region.`,
        );
        promises.push(
          AcceleratorToolkit.execute({
            accountId: stack.account,
            region: stack.region,
            ...toolkitProps,
            stackNames: stack.stackNames,
          }),
        );
        if (promises.length >= maxStacks) {
          await Promise.all(promises);
          promises.length = 0;
        }
      }
      // exhaust each runOrder before proceeding to the next
      await Promise.all(promises);
    }

    promises.length = 0;
    // process application stacks
    const appStacks = customizationsConfig.getAppStacks();
    for (const application of appStacks) {
      //find out deployment account
      const deploymentAccts = accountsConfig.getAccountIdsFromDeploymentTarget(application.deploymentTargets);
      //find out deployment region
      const deploymentRegions = getRegionsFromDeploymentTarget(application.deploymentTargets, enabledRegions);
      for (const deploymentAcct of deploymentAccts) {
        for (const deploymentRegion of deploymentRegions) {
          const applicationStackName = `${toolkitProps.stackPrefix}-App-${application.name}-${deploymentAcct}-${deploymentRegion}`;
          logger.info(
            `Executing application stack ${applicationStackName} for ${deploymentAcct} account in ${deploymentRegion} region.`,
          );
          promises.push(
            AcceleratorToolkit.execute({
              accountId: deploymentAcct,
              region: deploymentRegion,
              ...toolkitProps,
              stackNames: [applicationStackName],
            }),
          );
          if (promises.length >= maxStacks) {
            await Promise.all(promises);
            promises.length = 0;
          }
        }
      }
    }
    // wait for all applications stacks to deploy
    await Promise.all(promises);
  }

  /**
   * Execute all remaining stages for the Management account
   * @param toolkitProps
   * @param promises
   * @param managementAccountId
   * @param enabledRegions
   */
  private static async executeManagementRemainingStages(
    toolkitProps: AcceleratorToolkitProps,
    promises: Promise<void>[],
    managementAccountId: string,
    enabledRegions: string[],
  ) {
    for (const region of enabledRegions) {
      promises.push(
        AcceleratorToolkit.execute({
          accountId: managementAccountId,
          region,
          ...toolkitProps,
        }),
      );
    }
    await Promise.all(promises);
  }

  /**
   * Execute all remaining accounts/regions for all remaining stages
   * @param toolkitProps
   * @param promises
   * @param accountsConfig
   * @param enabledRegions
   */
  private static async executeAllAccountRemainingStages(
    toolkitProps: AcceleratorToolkitProps,
    promises: Promise<void>[],
    accountsConfig: AccountsConfig,
    managementAccountName: string,
    enabledRegions: string[],
    maxStacks: number,
  ) {
    let nonManagementAccounts = [...accountsConfig.mandatoryAccounts, ...accountsConfig.workloadAccounts].filter(
      accountItem => accountItem.name !== managementAccountName,
    );
    // Avoid changeset collisions by reducing total accounts to 1
    if (toolkitProps.enableSingleAccountMode) {
      nonManagementAccounts = [accountsConfig.mandatoryAccounts[0]];
    }

    for (const region of enabledRegions) {
      for (const account of nonManagementAccounts) {
        const accountId = accountsConfig.getAccountId(account.name);
        logger.info(`Executing ${toolkitProps.stage} for ${account.name} account in ${region} region.`);
        promises.push(
          AcceleratorToolkit.execute({
            accountId,
            region,
            ...toolkitProps,
          }),
        );
        if (promises.length >= maxStacks) {
          await Promise.all(promises);
          promises.length = 0;
        }
      }
    }
  }

  private static async executeImportAseaResources(
    toolkitProps: AcceleratorToolkitProps,
    promises: Promise<void>[],
    globalConfig: GlobalConfig,
    accountsConfig: AccountsConfig,
    maxStacks: number,
  ) {
    if (
      ![AcceleratorStage.IMPORT_ASEA_RESOURCES, AcceleratorStage.POST_IMPORT_ASEA_RESOURCES].includes(
        toolkitProps.stage as AcceleratorStage,
      )
    ) {
      return;
    }
    if (!globalConfig.externalLandingZoneResources) {
      logger.error(`Stage is ${toolkitProps.stage} but externalLandingZoneResources is not defined in global config.`);
      throw new Error(`Configuration validation failed at runtime.`);
    }
    const aseaPrefix = globalConfig.externalLandingZoneResources.acceleratorPrefix;
    const aseaName = globalConfig.externalLandingZoneResources.acceleratorName;
    const mapping = globalConfig.externalLandingZoneResources.templateMap;
    let previousPhase = '-1';
    for (const phase of ['-1', '0', '1', '2', '3', '4', '5']) {
      logger.info(`Deploying Stacks in Phase ${phase}`);
      if (previousPhase !== phase) {
        await Promise.all(promises).catch(err => {
          logger.error(err);
          throw new Error(`Configuration validation failed at runtime.`);
        });
        previousPhase = phase;
      }
      for (const region of globalConfig.enabledRegions) {
        for (const account of [...accountsConfig.mandatoryAccounts, ...accountsConfig.workloadAccounts]) {
          const accountId = accountsConfig.getAccountId(account.name);
          const stackKeys: string[] = [];
          Object.keys(mapping).forEach(key => {
            if (
              mapping[key].accountId === accountId &&
              mapping[key].region === region &&
              mapping[key].phase === phase &&
              !mapping[key].parentStack
            ) {
              stackKeys.push(key);
            }
          });

          for (const key of stackKeys) {
            const stack = mapping[key];
            promises.push(
              AcceleratorToolkit.execute({
                ...toolkitProps,
                app: `cdk.out/phase${phase}-${accountId}-${region}`,
                stackPrefix: aseaPrefix,
                stack: stack.stackName,
                // ASEA Adds "AcceleratorName" tag to all stacks
                // Adding it to avoid updating all stacks
                tags: [
                  {
                    Key: 'AcceleratorName',
                    Value: aseaName,
                  },
                ],
              }),
            );
            if (promises.length >= maxStacks) {
              await Promise.all(promises).catch(err => {
                logger.error(err);
                throw new Error(`Configuration validation failed at runtime.`);
              });
              promises.length = 0;
            }
          }
        }
      }
    }
    await Promise.all(promises).catch(err => {
      logger.error(err);
      throw new Error(`Configuration validation failed at runtime.`);
    });
    // Write resource mapping and stacks to s3
    const managementCredentials = await this.getManagementAccountCredentials(toolkitProps.partition);

    await writeImportResources({
      credentials: managementCredentials,
      accountsConfig: accountsConfig,
      globalConfig: globalConfig,
      mapping,
    });
  }
}

export async function checkDiffStage(props: AcceleratorProps) {
  const diffPromises: Promise<void>[] = [];
  const allStages = [
    AcceleratorStage.ORGANIZATIONS,
    AcceleratorStage.KEY,
    AcceleratorStage.CUSTOMIZATIONS,
    AcceleratorStage.RESOURCE_POLICY_ENFORCEMENT,
    AcceleratorStage.DEPENDENCIES,
    AcceleratorStage.FINALIZE,
    AcceleratorStage.IDENTITY_CENTER,
    AcceleratorStage.LOGGING,
    AcceleratorStage.NETWORK_ASSOCIATIONS,
    AcceleratorStage.NETWORK_ASSOCIATIONS_GWLB,
    AcceleratorStage.NETWORK_PREP,
    AcceleratorStage.NETWORK_VPC,
    AcceleratorStage.NETWORK_VPC_DNS,
    AcceleratorStage.NETWORK_VPC_ENDPOINTS,
    AcceleratorStage.OPERATIONS,
    AcceleratorStage.ORGANIZATIONS,
    AcceleratorStage.SECURITY,
    AcceleratorStage.SECURITY_AUDIT,
    AcceleratorStage.SECURITY_RESOURCES,
  ];

  // if diff command is run and no stage is set then run all stages
  if (props.command === Command.DIFF.toString() && !props.stage) {
    for (const diffStage of allStages) {
      const diffProps: AcceleratorProps = {
        app: props.app,
        command: props.command,
        configDirPath: props.configDirPath,
        stage: diffStage,
        account: props.account,
        region: props.region,
        partition: props.partition,
        requireApproval: props.requireApproval,
        caBundlePath: props.caBundlePath,
        ec2Creds: props.ec2Creds,
        proxyAddress: props.proxyAddress,
        enableSingleAccountMode: props.enableSingleAccountMode,
        useExistingRoles: props.useExistingRoles,
      };
      diffPromises.push(Accelerator.run(diffProps));
    }
    await Promise.all(diffPromises);
  }
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function bootstrapRequired(props: {
  accountId: string;
  region: string;
  partition: string;
  managementAccountAccessRole: string;
  centralizedBuckets: boolean;
  homeRegion: string;
  customDeploymentRoleName?: string;
  forceBootstrap?: boolean;
}): Promise<{ accountId: string; region: string; forceBootstrap: boolean }> {
  const bootstrapInfo = { accountId: props.accountId, region: props.region, forceBootstrap: true };
  const crossAccountCredentials = await getCrossAccountCredentials(
    props.accountId,
    props.region,
    props.partition,
    props.managementAccountAccessRole,
  );
  if (props.forceBootstrap) {
    return bootstrapInfo;
  }
  if (!props.centralizedBuckets) {
    logger.info(`Checking if workload account CDK asset bucket exists in account ${props.accountId}`);
    const s3Client = getCrossAccountClient(props.region, crossAccountCredentials, 'S3') as S3Client;
    const assetBucketExists = await doesCdkAssetBucketExist(s3Client, props.accountId, props.region);
    if (!assetBucketExists) {
      return bootstrapInfo;
    }
  }

  if (props.customDeploymentRoleName && props.region === props.homeRegion) {
    logger.info(
      `Checking account ${props.accountId} in home region ${props.homeRegion} to see if custom deployment role ${props.customDeploymentRoleName} exists`,
    );
    const iamClient = getCrossAccountClient(props.region, crossAccountCredentials, 'IAM') as IAMClient;
    const deploymentRoleExists = await customDeploymentRoleExists(
      iamClient,
      props.customDeploymentRoleName,
      props.region,
    );
    if (!deploymentRoleExists) {
      return bootstrapInfo;
    }
  }
  const bootstrapVersionName = ' /cdk-bootstrap/accel/version';
  const ssmClient = (await getCrossAccountClient(props.region, crossAccountCredentials, 'SSM')) as SSMClient;
  const bootstrapVersionValue = await getSsmParameterValue(bootstrapVersionName, ssmClient);
  if (bootstrapVersionValue && Number(bootstrapVersionValue) >= BootstrapVersion) {
    logger.info(`Skipping bootstrap for account-region: ${props.accountId}-${props.region}`);
    bootstrapInfo.forceBootstrap = false;
    return bootstrapInfo;
  }

  return bootstrapInfo;
}

async function doesCdkAssetBucketExist(s3Client: S3Client, accountId: string, region: string) {
  const commandInput = {
    Bucket: `cdk-accel-assets-${accountId}-${region}`,
  };
  try {
    await throttlingBackOff(() => s3Client.send(new HeadBucketCommand(commandInput)));
    return true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    logger.info(`CDK Asset Bucket not found for account ${accountId}, attempting to re-bootstrap`);
    return false;
  }
}

async function customDeploymentRoleExists(iamClient: IAMClient, roleName: string, region: string) {
  const commandInput: GetRoleCommandInput = {
    RoleName: roleName,
  };
  try {
    await throttlingBackOff(() => iamClient.send(new GetRoleCommand(commandInput)));
    return true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    logger.info(`Custom deployment role does not exist in region ${region}, attempting to re-bootstrap`);
    return false;
  }
}

async function getSsmParameterValue(parameterName: string, ssmClient: SSMClient) {
  const parameterInput: GetParameterCommandInput = {
    Name: parameterName,
  };
  let parameterOutput: GetParameterCommandOutput | undefined = undefined;

  try {
    parameterOutput = await throttlingBackOff(() => ssmClient.send(new GetParameterCommand(parameterInput)));
    return parameterOutput.Parameter?.Value ?? '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    if (e.name === 'ParameterNotFound') {
      logger.info(`Value not found for SSM Parameter: ${parameterName}`);
      return '';
    }
    logger.error(JSON.stringify(e));
    throw new Error(e.message);
  }
}

function getCrossAccountClient(
  region: string,
  assumeRoleCredential: AssumeRoleCommandOutput,
  clientType: string,
): IAMClient | S3Client | SSMClient {
  const credentials = {
    accessKeyId: assumeRoleCredential.Credentials!.AccessKeyId!,
    secretAccessKey: assumeRoleCredential.Credentials!.SecretAccessKey!,
    sessionToken: assumeRoleCredential.Credentials?.SessionToken,
  };
  let client = undefined;
  switch (clientType) {
    case 'IAM':
      client = new IAMClient({ credentials, region });
      break;
    case 'S3':
      client = new S3Client({ credentials, region });
      break;
    case 'SSM':
      client = new SSMClient({ credentials, region });
      break;
    default:
      if (!client) {
        logger.error(`Could not create client for client type ${clientType} in region ${region}`);
        throw new Error(`Configuration validation failed at runtime.`);
      }
  }
  return client;
}

function setAssumeRoleName(props: {
  managementAccountAccessRole?: string;
  stage?: string;
  command: string;
  customDeploymentRole?: string;
}) {
  let assumeRoleName = props.managementAccountAccessRole;
  if (!isBeforeBootstrapStage(props.command, props.stage) && props.customDeploymentRole) {
    assumeRoleName = props.customDeploymentRole;
  }

  return assumeRoleName;
}

export async function getCentralLogBucketKmsKeyArn(
  region: string,
  partition: string,
  accountId: string,
  managementAccountAccessRole: string,
  parameterName: string,
  orgsEnabled: boolean,
): Promise<string> {
  if (!orgsEnabled) {
    return uuidv4();
  }

  let ssmClient: SSMClient;
  try {
    const currentAccountId = await getCurrentAccountId(partition, region);
    // if its not the current account then get the credentials from the logArchive account
    if (currentAccountId !== accountId) {
      const crossAccountCredentials = await getCrossAccountCredentials(
        accountId,
        region,
        partition,
        managementAccountAccessRole,
      );
      ssmClient = (await getCrossAccountClient(region, crossAccountCredentials, 'SSM')) as SSMClient;
    } else {
      ssmClient = new SSMClient({ region });
    }

    return await getSsmParameterValue(parameterName, ssmClient);
  } catch (error) {
    logger.error(
      `Error getting central log bucket kms key arn: ${error} using parameter ${parameterName} for account ${accountId} using role ${managementAccountAccessRole}`,
    );
    return uuidv4();
  }
}

/**
 * Function to group runOrder in custom stacks
 * Example usage:

const customStackRunOrders: CustomStackRunOrder[] = [
  {
    stackName: 'Stack1',
    runOrder: 2,
    accounts: ['123456789012', '999999999999'],
    regions: ['us-east-1', 'eu-west-1'],
  },
  {
    stackName: 'Stack2',
    runOrder: 1,
    accounts: ['123456789012'],
    regions: ['us-east-1'],
  },
  {
    stackName: 'Stack3',
    runOrder: 2,
    accounts: ['999999999999'],
    regions: ['eu-west-1'],
  },
];

const groupedRunOrders = groupByRunOrder(customStackRunOrders);

Output:

[
  {
    runOrder: 1,
    stacks: [
      {
        account: '123456789012',
        region: 'us-east-1',
        stackNames: ['Stack2-123456789012-us-east-1']
      }
    ]
  },
  {
    runOrder: 2,
    stacks: [
      {
        account: '123456789012',
        region: 'us-east-1',
        stackNames: ['Stack1-123456789012-us-east-1']
      },
      {
        account: '123456789012',
        region: 'eu-west-1',
        stackNames: ['Stack1-123456789012-eu-west-1']
      },
      {
        account: '999999999999',
        region: 'us-east-1',
        stackNames: ['Stack1-999999999999-us-east-1']
      },
      {
        account: '999999999999',
        region: 'eu-west-1',
        stackNames: ['Stack1-999999999999-eu-west-1', 'Stack3-999999999999-eu-west-1']
      }
    ]
  }
]
 */
function groupByRunOrder(
  customStackRunOrders: CustomStackRunOrder[],
): { runOrder: number; stacks: { account: string; region: string; stackNames: string[] }[] }[] {
  // Sort the array by runOrder
  const sortedRunOrders = customStackRunOrders.sort((a, b) => a.runOrder - b.runOrder);

  // Group the objects by runOrder, account, and region
  const groupedRunOrders: { [runOrder: number]: { account: string; region: string; stackNames: string[] }[] } = {};

  sortedRunOrders.forEach(runOrder => {
    const { runOrder: order, accounts, regions, stackName } = runOrder;

    if (!groupedRunOrders[order]) {
      groupedRunOrders[order] = [];
    }

    accounts.forEach(account => {
      regions.forEach(region => {
        const modifiedStackName = `${stackName}-${account}-${region}`;
        const existingStackGroup = groupedRunOrders[order].find(
          group => group.account === account && group.region === region,
        );
        if (existingStackGroup) {
          existingStackGroup.stackNames.push(modifiedStackName);
        } else {
          groupedRunOrders[order].push({ account, region, stackNames: [modifiedStackName] });
        }
      });
    });
  });

  // Convert the object to an array of objects
  return Object.entries(groupedRunOrders).map(([runOrder, stacks]) => ({
    runOrder: parseInt(runOrder),
    stacks,
  }));
}

export function getRegionsFromDeploymentTarget(
  deploymentTargets: DeploymentTargets,
  enabledRegions: string[],
): string[] {
  const regions: string[] = [];
  regions.push(
    ...enabledRegions.filter(region => {
      return !deploymentTargets?.excludedRegions?.includes(region as Region);
    }),
  );
  return regions;
}
