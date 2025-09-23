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

import * as fs from 'fs';
import {
  SSMClient,
  GetParameterCommand,
  GetParameterCommandInput,
  GetParameterCommandOutput,
} from '@aws-sdk/client-ssm';
import { S3Client } from '@aws-sdk/client-s3';
import { IAMClient } from '@aws-sdk/client-iam';
import { AssumeRoleCommandOutput } from '@aws-sdk/client-sts';
import {
  AccountsConfig,
  GlobalConfig,
  OrganizationConfig,
  CustomizationsConfig,
  ReplacementsConfig,
  DeploymentTargets,
} from '@aws-accelerator/config';
import {
  createLogger,
  throttlingBackOff,
  getCrossAccountCredentials,
  getGlobalRegion,
  getCurrentAccountId,
  getManagementAccountCredentials,
  setExternalManagementAccountCredentials,
  getRegionList,
} from '@aws-accelerator/utils';

import { writeImportResources } from '../utils/app-utils';
import { AcceleratorStage } from './accelerator-stage';
import { AcceleratorToolkit, AcceleratorToolkitProps, AcceleratorToolkitCommand } from './toolkit';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

export type AcceleratorConfiguration =
  | {
      globalConfig: GlobalConfig;
      orgsConfig: OrganizationConfig;
      accountsConfig: AccountsConfig;
      managementAccountDetails: {
        id: string;
        name: string;
      };
      logArchiveAccountDetails: {
        id: string;
        name: string;
        centralizedLoggingRegion: string;
      };
      auditAccountDetails: {
        id: string;
        name: string;
      };
      regionDetails: {
        homeRegion: string;
        globalRegion: string;
        enabledRegions: string[];
      };
      replacementsConfig: ReplacementsConfig;
    }
  | undefined;

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

export const BootstrapVersion = 29;

//
// The accelerator stack prefix value
//
const stackPrefix = process.env['ACCELERATOR_PREFIX'] ?? 'AWSAccelerator';

/**
 * Accelerator V2 stacks
 */
export enum AcceleratorV2Stacks {
  VPC_STACK = 'VpcStack',
  ROUTE_TABLES_STACK = 'RouteTablesStack',
  ROUTE_ENTRIES_STACK = 'RouteEntriesStack',
  SECURITY_GROUPS_STACK = 'SecurityGroupsStack',
  SUBNETS_STACK = 'SubnetsStack',
  SUBNETS_SHARE_STACK = 'SubnetsShareStack',
  NACLS_STACK = 'NaclsStack',
  LB_STACK = 'LoadBalancersStack',
}

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

  [AcceleratorV2Stacks.VPC_STACK]: `${stackPrefix}-${AcceleratorV2Stacks.VPC_STACK}`,
  [AcceleratorV2Stacks.ROUTE_TABLES_STACK]: `${stackPrefix}-${AcceleratorV2Stacks.ROUTE_TABLES_STACK}`,
  [AcceleratorV2Stacks.ROUTE_ENTRIES_STACK]: `${stackPrefix}-${AcceleratorV2Stacks.ROUTE_ENTRIES_STACK}`,
  [AcceleratorV2Stacks.SECURITY_GROUPS_STACK]: `${stackPrefix}-${AcceleratorV2Stacks.SECURITY_GROUPS_STACK}`,
  [AcceleratorV2Stacks.SUBNETS_STACK]: `${stackPrefix}-${AcceleratorV2Stacks.SUBNETS_STACK}`,
  [AcceleratorV2Stacks.SUBNETS_SHARE_STACK]: `${stackPrefix}-${AcceleratorV2Stacks.SUBNETS_SHARE_STACK}`,
  [AcceleratorV2Stacks.NACLS_STACK]: `${stackPrefix}-${AcceleratorV2Stacks.NACLS_STACK}`,
  [AcceleratorV2Stacks.LB_STACK]: `${stackPrefix}-${AcceleratorV2Stacks.LB_STACK}`,
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
  readonly app?: string;
  readonly caBundlePath?: string;
  readonly proxyAddress?: string;
  readonly enableSingleAccountMode: boolean;
  readonly qualifier?: string;
}
// Reducing concurrency as high concurrency is saturating socket with sdk calls
// https://github.com/aws/aws-sdk-js-v3/issues/7310#issuecomment-3259235981
let maxStacks = Number(process.env['MAX_CONCURRENT_STACKS'] ?? 100);

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

    // Check to see if lookups for organization entities should be done in DynamoDB or native AWS Organizations API calls
    const loadFromDDB = shouldLookupDynamoDb(props.stage);
    //
    // If not pipeline stage, load global config and account ids
    //
    const isConfigDependentStage = this.isConfigDependentStage(props.stage);
    const managementAccountId = await getManagementAccount(props.partition);
    const acceleratorConfig = await Accelerator.loadAcceleratorConfiguration({
      isConfigDependentStage,
      loadFromDDB,
      acceleratorProps: props,
    });

    await checkDiffStage(props);

    if (props.partition === 'aws') {
      const regionList = await getRegionList(globalRegion);
      const invalidRegions =
        acceleratorConfig?.globalConfig?.enabledRegions.filter(region => !regionList.includes(region)) ?? [];

      if (invalidRegions.length > 0) {
        logger.error(
          `Invalid regions found: ${invalidRegions.join(', ')}. Available regions: ${regionList.join(', ')}`,
        );
        throw new Error('Config validation failed at runtime.');
      }

      if (props.region && !regionList.includes(props.region)) {
        logger.error(`Invalid region found: ${props.region}. Available regions: ${regionList.join(', ')}`);
        throw new Error('Config validation failed at runtime.');
      }
    }

    //
    // When running parallel, this will be the max concurrent stacks
    //
    if (props.command === 'deploy') {
      maxStacks = acceleratorConfig?.globalConfig?.acceleratorSettings?.maxConcurrentStacks
        ? acceleratorConfig?.globalConfig?.acceleratorSettings?.maxConcurrentStacks
        : // Reducing concurrency as high concurrency is saturating socket with sdk calls
          // https://github.com/aws/aws-sdk-js-v3/issues/7310#issuecomment-3259235981
          Number(process.env['MAX_CONCURRENT_STACKS'] ?? 100);
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
      app: props.app,
      caBundlePath: props.caBundlePath,
      proxyAddress: props.proxyAddress,
      centralizeCdkBootstrap: acceleratorConfig?.globalConfig?.centralizeCdkBuckets?.enable,
      cdkOptions: acceleratorConfig?.globalConfig?.cdkOptions,
      useExistingRoles: false, // deprecated option to be removed in a future release
      // central logs bucket kms key arn is dynamic and will be populated in app-utils
      centralLogsBucketKmsKeyArn: undefined,
      managementAccountId,
    };
    //
    // When an account and region is specified, execute as single stack.
    // Synth and diff commands are also treated as a single stack action
    //
    if (this.isSingleStackAction(props)) {
      await this.executeSingleStack(props, toolkitProps);
    } else {
      //
      // Initialize array to enumerate promises created for parallel stack creation
      //
      const promises: Promise<void>[] = [];
      //
      // Global config is required for remaining stages
      //
      if (!acceleratorConfig) {
        throw new Error('Global config is required for remaining stages');
      }
      //
      // Execute IMPORT_ASEA_RESOURCES Stage
      //
      await this.executeImportAseaResources(
        toolkitProps,
        promises,
        acceleratorConfig.globalConfig,
        acceleratorConfig.accountsConfig,
        maxStacks,
      );
      //
      // Execute Bootstrap stacks for all identified accounts
      //
      await this.executeBootstrapStage(
        toolkitProps,
        promises,
        acceleratorConfig.managementAccountDetails,
        acceleratorConfig.globalConfig,
        acceleratorConfig.accountsConfig,
      );
      //
      // Execute PREPARE, ACCOUNTS, and FINALIZE stages in the management account
      //
      await this.executeManagementAccountStages(
        toolkitProps,
        acceleratorConfig.globalConfig.homeRegion,
        globalRegion,
        acceleratorConfig.managementAccountDetails,
      );
      //
      // Execute ORGANIZATIONS and SECURITY AUDIT stages
      //
      await this.executeSingleAccountMultiRegionStages(
        toolkitProps,
        promises,
        acceleratorConfig.globalConfig.enabledRegions,
        acceleratorConfig.managementAccountDetails,
        acceleratorConfig.auditAccountDetails,
        maxStacks,
        acceleratorConfig.globalConfig.managementAccountAccessRole,
      );
      //
      // Execute LOGGING stage
      //
      await this.executeLoggingStage(
        toolkitProps,
        promises,
        acceleratorConfig.accountsConfig,
        acceleratorConfig.logArchiveAccountDetails,
        acceleratorConfig.regionDetails,
        maxStacks,
        acceleratorConfig.globalConfig.managementAccountAccessRole,
      );

      let enabledRegions = acceleratorConfig.globalConfig.enabledRegions;

      if (props.region) {
        enabledRegions = [props.region];
      }
      //
      // Execute all remaining stages
      //
      await this.executeRemainingStages(
        toolkitProps,
        promises,
        acceleratorConfig.accountsConfig,
        acceleratorConfig.managementAccountDetails,
        enabledRegions,
        maxStacks,
        acceleratorConfig.replacementsConfig,
        acceleratorConfig.globalConfig.managementAccountAccessRole,
      );

      await Promise.all(promises);
    }
  }

  private static async loadAcceleratorConfiguration(props: {
    isConfigDependentStage: boolean;
    loadFromDDB: boolean;
    acceleratorProps: AcceleratorProps;
  }): Promise<AcceleratorConfiguration> {
    if (!props.isConfigDependentStage) {
      return undefined;
    }
    const globalRegion = getGlobalRegion(props.acceleratorProps.partition);
    const globalConfig = GlobalConfig.loadRawGlobalConfig(props.acceleratorProps.configDirPath);
    const homeRegion = globalConfig.homeRegion;
    await setExternalManagementAccountCredentials(props.acceleratorProps.partition, homeRegion);
    const orgsConfig = OrganizationConfig.loadRawOrganizationsConfig(props.acceleratorProps.configDirPath);
    const accountsConfig = AccountsConfig.load(props.acceleratorProps.configDirPath);
    await accountsConfig.loadAccountIds(
      props.acceleratorProps.partition,
      props.acceleratorProps.enableSingleAccountMode,
      orgsConfig.enable,
      accountsConfig,
      undefined,
      props.loadFromDDB,
    );
    const replacementsConfig = ReplacementsConfig.load(props.acceleratorProps.configDirPath, accountsConfig);
    await replacementsConfig.loadDynamicReplacements(homeRegion);
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
    if (globalConfig?.externalLandingZoneResources?.importExternalLandingZoneResources) {
      logger.info('Loading ASEA mapping for stacks list');
      await globalConfig.loadExternalMapping(accountsConfig);
      logger.info('Loaded ASEA mapping');
    }

    return {
      globalConfig,
      orgsConfig,
      accountsConfig,
      managementAccountDetails,
      logArchiveAccountDetails,
      auditAccountDetails,
      regionDetails,
      replacementsConfig,
    };
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
      [AcceleratorToolkitCommand.SYNTH.toString(), AcceleratorToolkitCommand.SYNTHESIZE.toString()].includes(
        props.command,
      )
    );
  }

  /**
   * Executes a single stack if both account and region are specified in the CLI AcceleratorToolkitCommand.
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
    // If config is provided then use that for assumedRole
    const assumeRoleName = props.configDirPath
      ? GlobalConfig.loadRawGlobalConfig(props.configDirPath).managementAccountAccessRole
      : undefined;

    return AcceleratorToolkit.execute({
      accountId: props.account,
      region: props.region,
      assumeRoleName,
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
    if (toolkitProps.command === AcceleratorToolkitCommand.BOOTSTRAP) {
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
      // await delay(500);
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
    const managementAccountAccessRole = globalConfig.managementAccountAccessRole;
    const nonManagementAccounts = accountsConfig
      .getAccounts(toolkitProps.enableSingleAccountMode)
      .filter(accountItem => accountItem.name !== managementAccountDetails.name);
    const environments = nonManagementAccounts
      .map(account => {
        const environmentArray = [];
        const accountId = accountsConfig.getAccountId(account.name);
        for (const region of globalConfig.enabledRegions) {
          environmentArray.push({ accountId, region });
        }
        return environmentArray;
      })
      .flat();

    for (const env of environments) {
      promises.push(
        AcceleratorToolkit.execute({
          accountId: env.accountId,
          region: env.region,
          trustedAccountId: managementAccountDetails.id,
          assumeRoleName: managementAccountAccessRole,
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
      // PREPARE and IDENTITY CENTER stage deployed to home region
      case AcceleratorStage.IDENTITY_CENTER:
      case AcceleratorStage.PREPARE:
        logger.info(`Executing ${toolkitProps.stage} for ${managementAccountDetails.name} account.`);
        return AcceleratorToolkit.execute({
          accountId: managementAccountDetails.id,
          region: homeRegion,
          ...toolkitProps,
        });

      //
      // ACCOUNTS and FINALIZE stages deployed to global region
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
    managementAccountAccessRole: string,
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
              assumeRoleName: managementAccountAccessRole,
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
    assumeRoleName: string,
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
        assumeRoleName,
        ...toolkitProps,
      });
      // Execute in all other regions in the LogArchive account
      await this.executeLogArchiveNonCentralRegions(
        toolkitProps,
        logArchiveAccountDetails,
        regionDetails.enabledRegions,
        assumeRoleName,
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
        assumeRoleName,
      );
    }
  }

  private static async executeLogArchiveNonCentralRegions(
    toolkitProps: AcceleratorToolkitProps,
    logArchiveAccountDetails: { id: string; name: string; centralizedLoggingRegion: string },
    enabledRegions: string[],
    assumeRoleName: string,
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
          assumeRoleName,
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
    assumeRoleName: string,
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
              assumeRoleName,
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
    assumeRoleName: string,
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
        assumeRoleName,
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
          assumeRoleName,
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
    assumeRoleName: string,
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
            assumeRoleName,
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
              assumeRoleName,
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
    assumeRoleName: string,
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
            assumeRoleName,
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
            const role = globalConfig.cdkOptions.customDeploymentRole ?? `${aseaPrefix}-Deployment-Role`;
            promises.push(
              AcceleratorToolkit.execute({
                ...toolkitProps,
                app: `cdk.out/phase${phase}-${accountId}-${region}`,
                stackPrefix: aseaPrefix,
                stack: stack.stackName,
                assumeRoleName: role,
                accountId,
                region,
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
    const managementCredentials = await getManagementAccountCredentials(toolkitProps.partition);

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
  if (props.command === AcceleratorToolkitCommand.DIFF.toString() && !props.stage) {
    for (const diffStage of allStages) {
      const diffProps: AcceleratorProps = {
        app: props.app,
        command: props.command,
        configDirPath: props.configDirPath,
        stage: diffStage,
        account: props.account,
        region: props.region,
        partition: props.partition,
        caBundlePath: props.caBundlePath,
        proxyAddress: props.proxyAddress,
        enableSingleAccountMode: props.enableSingleAccountMode,
      };
      diffPromises.push(Accelerator.run(diffProps));
    }
    await Promise.all(diffPromises);
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
      return !deploymentTargets?.excludedRegions?.includes(region);
    }),
  );
  return regions;
}

/**
 * Determines if DynamoDB lookup should be performed for the given stage.
 * Returns true if the stage is NOT in the excluded list of stages AND the environment
 * variable ACCELERATOR_SKIP_DYNAMODB_LOOKUP is not set to 'true'.
 *
 * @param stage - The deployment stage to check
 * @returns boolean - True if DynamoDB lookup should be performed, false otherwise
 */
export function shouldLookupDynamoDb(stage?: string): boolean {
  const stages = [
    AcceleratorStage.PREPARE,
    AcceleratorStage.ACCOUNTS,
    AcceleratorStage.PIPELINE,
    AcceleratorStage.TESTER_PIPELINE,
    AcceleratorStage.DIAGNOSTICS_PACK,
  ] as string[];

  const lookup = process.env['ACCELERATOR_SKIP_DYNAMODB_LOOKUP']
    ? process.env['ACCELERATOR_SKIP_DYNAMODB_LOOKUP'] === 'true'
    : false;

  if (!stage || lookup) {
    return false;
  }

  return !stages.includes(stage);
}

async function getManagementAccount(partition: string) {
  const isExternalDeployment = process.env['MANAGEMENT_ACCOUNT_ID'] && process.env['MANAGEMENT_ACCOUNT_ROLE_NAME'];
  if (isExternalDeployment) {
    return process.env['MANAGEMENT_ACCOUNT_ID']!;
  }
  return getCurrentAccountId(partition, getGlobalRegion(partition));
}
