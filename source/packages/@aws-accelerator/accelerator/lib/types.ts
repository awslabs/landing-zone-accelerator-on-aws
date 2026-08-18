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

/**
 * @fileoverview Comprehensive type definitions for Landing Zone Accelerator on AWS (LZA) module system.
 *
 * @description
 * This module provides the complete type system for the LZA module execution framework,
 * defining all interfaces, types, and enumerations used throughout the module orchestration
 * and execution pipeline. These types ensure type safety and provide clear contracts
 * between different components of the LZA system.
 *
 * The type system covers:
 * - Module definitions and execution phases
 * - Configuration aggregation and management
 * - Runtime parameter structures and contexts
 * - Stage orchestration and execution ordering
 * - Promise-based execution coordination
 * - Environment and resource identification
 * - Logging and credential management
 *
 * These types are used extensively throughout the LZA codebase to ensure
 * consistent interfaces, proper error handling, and maintainable code
 * architecture across the entire deployment pipeline.
 */

import { Account, Organization } from '@aws-sdk/client-organizations';

import {
  AccountsConfig,
  CustomizationsConfig,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  ReplacementsConfig,
  SecurityConfig,
} from '@aws-accelerator/config';
import { AcceleratorResourcePrefixes } from '../utils/app-utils';
import { AcceleratorResourceNames } from './accelerator-resource-names';
import { AcceleratorStage } from './accelerator-stage';

import { IAssumeRoleCredential, IModuleResponse, ISessionContext } from 'aws-lza';

/**
 * Enumeration of all available LZA modules for deployment and configuration.
 *
 * @description
 * Defines the complete catalog of modules available in the AWS Landing Zone Accelerator
 * that can be executed as part of the LZA deployment pipeline. Each module represents
 * a specific AWS service configuration, security control, or operational capability
 * that can be deployed across the AWS organization.
 *
 * Modules are referenced throughout the LZA system for:
 * - Module registration and discovery
 * - Execution control and environment variable naming
 * - Configuration validation and dependency management
 * - Operational visibility and logging
 * - Error handling and status reporting
 *
 * @enum {string}
 */
export enum AcceleratorModules {
  /**
   * Stack resources retention module for CloudFormation resource migration.
   *
   * @description
   * Centralized retention module that sets DeletionPolicy: Retain on CloudFormation
   * custom resources before service migration to API-based implementations. This module:
   * - Runs in the PREPARE stage before any service-specific modules
   * - Processes all services registered in the resource retention registry
   * - Ensures safe migration from CFN custom resources to native AWS SDK implementations
   * - Prevents accidental resource deletion during service module transitions
   *
   * The module can be skipped via SKIP_STACK_RESOURCES_RETENTION_MODULE environment variable,
   * which will cause all services to keep their CloudFormation custom resources as a safety net.
   */
  STACK_RESOURCES_RETENTION = 'stack-resources-retention',

  /**
   * Amazon Macie data security and privacy service module.
   *
   * @description
   * Configures Amazon Macie for automated data discovery, classification, and protection
   * across the AWS organization. This module handles:
   * - Delegated administrator account setup and configuration
   * - Member account enrollment and management
   * - Data classification policies and sensitive data discovery
   * - Security findings publishing and centralized reporting
   * - Integration with AWS Organizations for organization-wide deployment
   * - S3 bucket analysis and data security monitoring
   *
   * The module integrates with the LZA logging infrastructure to ensure all
   * Macie findings and operational logs are centrally collected and stored
   * according to organizational compliance requirements.

   */
  MACIE = 'macie',

  /**
   * Amazon GuardDuty threat detection service module.
   *
   * @description
   * Configures Amazon GuardDuty for continuous threat detection and monitoring
   * across the AWS organization. This module handles:
   * - Delegated administrator account setup and configuration
   * - Member account enrollment and management
   * - Protection plan configuration (S3, EKS, EC2, RDS, Lambda)
   * - Findings export to S3 with KMS encryption
   * - Regional deployment control and filtering
   */
  GUARDDUTY = 'guardduty',

  /**
   * AWS Control Tower Landing Zone module setup module.
   *
   * @description
   * For more information on AWS Control Tower, please refer the
   * [document](https://docs.aws.amazon.com/controltower/latest/userguide/what-is-control-tower.html)
   */
  SETUP_CONTROL_TOWER_LANDING_ZONE = 'control-tower-landing-zone',

  /**
   * AWS Organizations Organizational Unit (OU) create module.
   */
  CREATE_ORGANIZATIONAL_UNIT = 'create-organizational-unit',

  /**
   * Register AWS Organizations Organizational Unit (OU) with AWS Control Tower module.
   */
  REGISTER_ORGANIZATIONAL_UNIT = 'register-organizational-unit',

  /**
   * Invite AWS Accounts to AWS Organizations module.
   */
  INVITE_ACCOUNTS_TO_ORGANIZATIONS = 'invite-accounts-to-organizations',

  /**
   * Move AWS Accounts to destination AWS Organizations Organizational Unit (OU) module.
   */
  MOVE_ACCOUNTS = 'move-accounts',

  /**
   * Retrieves cross account CloudFormation Templates.
   */
  GET_CLOUDFORMATION_TEMPLATES = 'get-cloudformation-templates',

  /**
   * Set stack policy for accounts.
   */
  CREATE_STACK_POLICY = 'create-stack-policy',

  /**
   * Configure IAM Root User Management.
   */
  ROOT_USER_MANAGEMENT = 'root-user-management',

  /**
   * SSM Block Public Document Sharing module.
   *
   * @description
   * For more information on SSM Block Public Document Sharing, please refer the
   * [document](https://docs.aws.amazon.com/systems-manager/latest/userguide/document-public-access-block.html)
   */
  SSM_BLOCK_PUBLIC_DOCUMENT_SHARING = 'ssm-block-public-document-sharing',

  /**
   * EC2 Block Public AMI module.
   *
   * @description
   * For more information on EC2 Image Block Public Access, please refer the
   * [document](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/sharingamis-intro.html#block-public-access-to-amis)
   */
  EC2_BLOCK_PUBLIC_AMI = 'ec2-block-public-ami',

  /**
   * Unified accounts module — manages alias and tags in a single pass.
   */
  ACCOUNTS = 'accounts',

  /**
   * Reconcile direct-account attachments for Organizations tag and backup policies.
   */
  TAG_AND_BACKUP_POLICY_ACCOUNT_ATTACHMENTS = 'tag-and-backup-policy-account-attachments',

  /**
   * Accelerator prerequisites module.
   */
  ACCELERATOR_PREREQUISITES = 'accelerator-prerequisites',

  /**
   * Pipeline prerequisites module.
   */
  PIPELINE_PREREQUISITES = 'pipeline-prerequisites',

  /**
   * Delete default VPCs in accounts.
   */
  DELETE_DEFAULT_VPC = 'delete-default-vpc',

  /**
   * Manage Security Hub Automation rules module.
   */
  MANAGE_AUTOMATION_RULES = 'manage-automation-rules',

  /**
   * Manage Control Tower accounts enrollment.
   */
  ENROLL_ACCOUNTS = 'enroll-accounts',

  /**
   * Transit Gateway route table associations and propagations module.
   */
  TGW_ASSOCIATIONS_AND_PROPAGATIONS = 'tgw-associations-and-propagations',

  /**
   * An Example module which is executed in `PREPARE` stage.
   */
  EXAMPLE_MODULE = 'example-module',
}

/**
 * Enumeration of module execution phases within the LZA deployment pipeline.
 *
 * @description
 * Defines the two primary execution phases during the LZA deployment lifecycle,
 * allowing modules to be executed at different stages of the pipeline for optimal
 * resource management and dependency resolution. The execution phase determines
 * when a module runs relative to the CDK synthesis and deployment process.
 *
 * Phase determination is based on the CDK_OPTIONS environment variable:
 * - When CDK_OPTIONS equals 'bootstrap': SYNTH phase modules execute
 * - When CDK_OPTIONS is not 'bootstrap': DEPLOY phase modules execute
 *
 * This separation allows for:
 * - Template generation and validation without resource creation (SYNTH)
 * - Actual AWS resource deployment and configuration (DEPLOY)
 * - Proper dependency management between synthesis and deployment
 * - Optimized execution performance and resource utilization
 *
 * @enum {string}
 */
export enum ModuleExecutionPhase {
  /**
   * Synthesis phase during CDK bootstrap and template generation.
   *
   * @description
   * Modules execute during CDK synthesis when the CDK_OPTIONS environment
   * variable is set to 'bootstrap'. This phase is used for:
   * - Template generation and validation
   * - Configuration syntax checking
   * - Dependency analysis and validation
   * - Resource planning without actual deployment
   * - Pre-deployment validation and testing
   *
   * SYNTH phase modules should focus on validation, planning, and preparation
   * activities that do not require actual AWS resource creation or modification.
   */
  SYNTH = 'synth',

  /**
   * Deployment phase during actual resource creation and configuration.
   *
   * @description
   * Modules execute during actual resource deployment when CDK_OPTIONS
   * is not set to 'bootstrap'. This phase is used for:
   * - Creating and configuring AWS resources
   * - Cross-account operations and role assumptions
   * - Service integrations and policy applications
   * - Operational configuration and setup
   * - Resource state management and updates
   *
   * DEPLOY phase modules perform the actual work of creating, configuring,
   * and managing AWS resources across the organization.
   */
  DEPLOY = 'deploy',
}

/**
 * Configuration structure for centralized logging infrastructure in LZA.
 *
 * @description
 * Defines the complete centralized logging setup including the target region,
 * S3 bucket configuration, and encryption settings used across all LZA modules
 * for log aggregation and compliance. This configuration ensures consistent
 * logging behavior and centralized log management throughout the AWS organization.
 *
 * The logging configuration supports:
 * - Multi-region log aggregation to a central location
 * - Encrypted storage using customer-managed KMS keys
 * - Dynamic resource discovery during pipeline execution
 * - Integration with AWS Organizations for cross-account logging
 * - Compliance with regulatory and organizational requirements
 *
 * @typedef {Object} AcceleratorLoggingType
 */
type AcceleratorLoggingType = {
  /**
   * AWS region where centralized logging infrastructure is deployed.
   *
   * @description
   * The primary region for log aggregation, typically the home region
   * or a specifically designated logging region for compliance requirements.
   * This region hosts the central logging S3 bucket and associated KMS keys.
   */
  readonly centralizedRegion: string;

  /**
   * Name of the central logging S3 bucket for log aggregation.
   *
   * @description
   * S3 bucket where all logs from across the organization are aggregated.
   * May be undefined during early pipeline stages before logging infrastructure
   * is established. The bucket name follows LZA naming conventions and includes
   * the account ID and region for uniqueness.
   */
  bucketName?: string;

  /**
   * ARN of the KMS key used to encrypt the central logging bucket.
   *
   * @description
   * Customer-managed KMS key ARN for encrypting logs at rest in the central
   * logging bucket. Retrieved from SSM parameters after logging infrastructure
   * deployment. All log data is encrypted using this key to meet security
   * and compliance requirements.
   */
  bucketKeyArn?: string;
};

/**
 * Complete collection of LZA configuration objects.
 *
 * @description
 * Aggregates all configuration files used by the LZA including
 * accounts, networking, security, and customization settings. These
 * configurations drive the behavior of all LZA modules.
 *
 * @example
 * ```typescript
 * // Access specific configurations
 * const configs: AcceleratorConfigurationsType = {
 *   accountsConfig: new AccountsConfig(),
 *   globalConfig: new GlobalConfig(),
 *   networkConfig: new NetworkConfig(),
 *   securityConfig: new SecurityConfig(),
 *   // ... other configs
 * };
 *
 * // Get management account ID
 * const mgmtAccountId = configs.accountsConfig.getManagementAccountId();
 *
 * // Check if organizations is enabled
 * const orgEnabled = configs.organizationConfig.enable;
 * ```
 */
export type AcceleratorConfigurationsType = {
  /**
   * Account provisioning and management configuration.
   */
  accountsConfig: AccountsConfig;

  /**
   * Custom resource and application deployment configuration.
   */
  customizationsConfig: CustomizationsConfig;

  /**
   * Global LZA settings and preferences.
   */
  globalConfig: GlobalConfig;

  /**
   * Identity and Access Management configuration.
   */
  iamConfig: IamConfig;

  /**
   * Network topology and connectivity configuration.
   */
  networkConfig: NetworkConfig;

  /**
   * AWS Organizations structure and policies configuration.
   */
  organizationConfig: OrganizationConfig;

  /**
   * Variable replacement and templating configuration.
   */
  replacementsConfig: ReplacementsConfig;

  /**
   * Security services and compliance configuration.
   */
  securityConfig: SecurityConfig;
};

/**
 * Basic parameters required to initialize the module runner.
 *
 * @description
 * Contains essential information needed to start module execution including
 * AWS environment details, configuration paths, and execution options.
 * Used as input to the ModuleRunner.execute() method.
 *
 * @example
 * ```typescript
 * const runnerParams: RunnerParametersType = {
 *   partition: 'aws',
 *   region: 'us-east-1',
 *   configDirPath: './accelerator-config',
 *   prefix: 'AWSAccelerator',
 *   solutionId: 'AwsSolution/SO0199/1.0.0',
 *   dryRun: false,
 *   stage: 'organizations' // Optional for stage-specific execution
 * };
 *
 * const status = await ModuleRunner.execute(runnerParams);
 * ```
 */
export type RunnerParametersType = {
  /**
   * Runner session context
   */
  readonly sessionContext: ISessionContext;

  /**
   * File system path to LZA configuration directory.
   */
  readonly configDirPath: string;

  /**
   * Resource naming prefix for LZA-managed resources.
   */
  readonly prefix: string;

  /**
   * AWS solution identifier for tracking and support.
   */
  readonly solutionId: string;

  /**
   * Flag indicating dry-run mode without actual resource changes.
   */
  readonly dryRun: boolean;

  /**
   * Optional directory path for writing module diff output files.
   *
   * @description
   * When provided alongside --dry-run, module execution results are formatted
   * as human-readable .module.diff files and written to this directory.
   * Requires dryRun to be true.
   */
  readonly diffOutputDir?: string;

  /**
   * Optional specific stage name for targeted execution.
   *
   * @description
   * When provided, only modules in the specified stage will execute.
   * When undefined, all stages execute in their defined order.
   */
  readonly stage?: string;

  /**
   * Flag indicating if solution should load AWS Organizations details from DynamoDB table.
   * When the value is set to false, solution will use AWS Organizations API to get AWS Organizations details.
   */
  loadOrganizationsFromDynamoDbTable: boolean;
};

/**
 * Individual module configuration and execution definition.
 *
 * @description
 * Defines a single LZA module including its metadata, execution
 * handler, and runtime behavior. Modules are registered in stage configurations
 * and executed by the ModuleRunner according to their run order.
 *
 * @example
 * ```typescript
 * const macieModule: AcceleratorModuleDetailsType = {
 *   name: AcceleratorModules.MACIE,
 *   description: 'Configure Amazon Macie for data security',
 *   runOrder: 1,
 *   executionPhase: ModuleExecutionPhase.DEPLOY,
 *   handler: async (params: ModuleParams) => {
 *     // Module implementation
 *     return 'Macie configuration completed';
 *   }
 * };
 * ```
 */
export type AcceleratorModuleDetailsType = {
  /**
   * Unique identifier for the module from AcceleratorModules enum.
   */
  readonly name: AcceleratorModules;

  /**
   * Human-readable description of module functionality.
   */
  readonly description: string;

  /**
   * Execution order within the parent stage (lower numbers execute first).
   */
  readonly runOrder: number;

  /**
   * Async function that implements the module's core functionality.
   *
   * @param params - Complete module execution context and configuration
   * @returns Promise resolving to execution status string
   *
   * @example
   * ```typescript
   * const handler = async (params: ModuleParams): Promise<IModuleResponse> => {
   *   const { moduleRunnerParameters, runnerParameters } = params;
   *
   *   // Access configurations
   *   const globalConfig = moduleRunnerParameters.configs.globalConfig;
   *
   *   // Perform module operations
   *   await configureService(globalConfig);
   *
   *   return 'Module execution completed successfully';
   * };
   * ```
   */
  readonly handler: (params: ModuleParams) => Promise<IModuleResponse>;

  /**
   * Pipeline phase when the module should execute (SYNTH or DEPLOY).
   */
  readonly executionPhase: ModuleExecutionPhase;
};

/**
 * Complete runtime parameters assembled for module execution.
 *
 * @description
 * Contains all configurations, credentials, and runtime context needed
 * for module execution. Assembled by the ModuleRunner from basic runner
 * parameters and includes loaded configurations, organization details,
 * and resource naming conventions.
 *
 * @example
 * ```typescript
 * // Typically assembled internally by ModuleRunner
 * const moduleParams: AcceleratorModuleRunnerParametersType = {
 *   configs: acceleratorConfigurations,
 *   globalRegion: 'us-east-1',
 *   resourcePrefixes: { accelerator: 'AWSAccelerator' },
 *   acceleratorResourceNames: resourceNames,
 *   logging: { centralizedRegion: 'us-east-1' },
 *   organizationAccounts: accounts,
 *   organizationDetails: orgDetails,
 *   managementAccountCredentials: credentials
 * };
 * ```
 */
export type AcceleratorModuleRunnerParametersType = {
  /**
   * Complete set of loaded LZA configurations.
   */
  configs: AcceleratorConfigurationsType;

  /**
   * Resource naming prefixes for consistent resource identification.
   */
  readonly resourcePrefixes: AcceleratorResourcePrefixes;

  /**
   * Utility class for generating standardized resource names.
   */
  readonly acceleratorResourceNames: AcceleratorResourceNames;

  /**
   * Centralized logging configuration and resource details.
   */
  readonly logging: AcceleratorLoggingType;

  /**
   * Array of all accounts in the AWS organization.
   */
  readonly organizationAccounts: Account[];

  /**
   * AWS Organizations metadata and configuration details.
   */
  readonly organizationDetails?: Organization;

  /**
   * Cross-account credentials for management account operations.
   *
   * @description
   * Only available when the LZA is deployed from an external account
   * and needs to assume roles in the management account for operations.
   */
  readonly managementAccountCredentials?: IAssumeRoleCredential;

  /**
   * IAM session policy JSON string for least-privilege cross-account role assumption.
   *
   * @description
   * When provided, this policy is passed to STS AssumeRole as a session policy,
   * restricting the assumed credentials to only the declared actions. The effective
   * permissions are the intersection of the target role's policy and this session policy.
   */
  readonly sessionPolicy?: string;
};

/**
 * Complete parameter set passed to module handler functions.
 *
 * @description
 * Composite type containing all context needed for module execution including
 * the module's own configuration, basic runner parameters, and complete
 * runtime parameters with loaded configurations and credentials.
 *
 * @example
 * ```typescript
 * const moduleHandler = async (params: ModuleParams): Promise<IModuleResponse> => {
 *   const { moduleItem, runnerParameters, moduleRunnerParameters } = params;
 *
 *
 *   // Access basic parameters
 *   const region = runnerParameters.region;
 *   const dryRun = runnerParameters.dryRun;
 *
 *   // Access loaded configurations
 *   const globalConfig = moduleRunnerParameters.configs.globalConfig;
 *   const accounts = moduleRunnerParameters.organizationAccounts;
 *
 *   // Perform module operations
 *   if (!dryRun) {
 *     await configureService(region, globalConfig, accounts);
 *   }
 *
 *   return `${moduleItem.name} module completed`;
 * };
 * ```
 */
export type ModuleParams = {
  /**
   * Configuration and metadata for the currently executing module.
   */
  moduleItem: AcceleratorModuleDetailsType;

  /**
   * Basic runner parameters provided at execution start.
   */
  runnerParameters: RunnerParametersType;

  /**
   * Complete runtime parameters with loaded configurations.
   */
  moduleRunnerParameters: AcceleratorModuleRunnerParametersType;

  /**
   * Optional stage name for context-aware module behavior.
   */
  stage?: string;
};

/**
 * Mapping of LZA pipeline stages that support module execution.
 *
 * @description
 * Defines which AcceleratorStage values support module execution by mapping
 * them to a constant object. This provides a single source of truth derived
 * from AcceleratorStage while clearly indicating which stages can have modules.
 *
 * @example
 * ```typescript
 * // Check if a stage supports modules
 * const supportsModules = Object.values(MODULE_SUPPORTED_STAGES).includes(AcceleratorStage.PREPARE);
 *
 * // Find modules for a stage
 * const orgModules = AcceleratorModuleStageDetails.find(
 *   s => s.stage.name === MODULE_SUPPORTED_STAGES.ORGANIZATIONS
 * )?.modules;
 *
 * // Stage-specific logic
 * switch (currentStage) {
 *   case MODULE_SUPPORTED_STAGES.LOGGING:
 *     await setupLogging();
 *     break;
 *   case MODULE_SUPPORTED_STAGES.SECURITY:
 *     await configureSecurity();
 *     break;
 * }
 * ```
 */
export const MODULE_SUPPORTED_STAGES = {
  /** Initial setup and validation stage */
  PREPARE: AcceleratorStage.PREPARE,
  /** Account provisioning and configuration stage */
  ACCOUNTS: AcceleratorStage.ACCOUNTS,
  /** CDK bootstrap and foundational resources stage */
  BOOTSTRAP: AcceleratorStage.BOOTSTRAP,
  /** KMS key creation and management stage */
  KEY: AcceleratorStage.KEY,
  /** Central logging infrastructure stage */
  LOGGING: AcceleratorStage.LOGGING,
  /** AWS Organizations configuration stage */
  ORGANIZATIONS: AcceleratorStage.ORGANIZATIONS,
  /** Security auditing and compliance stage */
  SECURITY_AUDIT: AcceleratorStage.SECURITY_AUDIT,
  /** Network preparation and planning stage */
  NETWORK_PREP: AcceleratorStage.NETWORK_PREP,
  /** Security services and policies stage */
  SECURITY: AcceleratorStage.SECURITY,
  /** Operations and monitoring stage */
  OPERATIONS: AcceleratorStage.OPERATIONS,
  /** VPC and network infrastructure stage */
  NETWORK_VPC: AcceleratorStage.NETWORK_VPC,
  /** Security resource deployment stage */
  SECURITY_RESOURCES: AcceleratorStage.SECURITY_RESOURCES,
  /** Identity Center configuration stage */
  IDENTITY_CENTER: AcceleratorStage.IDENTITY_CENTER,
  /** Network connectivity and associations stage */
  NETWORK_ASSOCIATIONS: AcceleratorStage.NETWORK_ASSOCIATIONS,
  /** Custom resource and application deployment stage */
  CUSTOMIZATIONS: AcceleratorStage.CUSTOMIZATIONS,
  /** Final validation and cleanup stage */
  FINALIZE: AcceleratorStage.FINALIZE,
} as const;

/**
 * Type representing LZA pipeline stages that support module execution.
 *
 * @description
 * Derived type from MODULE_SUPPORTED_STAGES constant that provides type safety
 * for stage values while maintaining single source of truth with AcceleratorStage.
 */
export type AcceleratorModuleStages = (typeof MODULE_SUPPORTED_STAGES)[keyof typeof MODULE_SUPPORTED_STAGES];

/**
 * Type definition for stage execution order configuration.
 *
 * @description
 * Maps each LZA stage to its execution metadata including
 * display name and run order. Used to define the sequential execution
 * order of stages in the LZA deployment.
 *
 * @example
 * ```typescript
 * const stageOrders: AcceleratorModuleStageOrdersType = {
 *   [AcceleratorModuleStages.PREPARE]: { name: 'prepare', runOrder: 1 },
 *   [AcceleratorModuleStages.LOGGING]: { name: 'logging', runOrder: 5 },
 *   [AcceleratorModuleStages.SECURITY]: { name: 'security', runOrder: 8 }
 * };
 *
 * // Get execution order
 * const loggingOrder = stageOrders[AcceleratorModuleStages.LOGGING].runOrder;
 * ```
 */
export type AcceleratorModuleStageOrdersType = Record<
  AcceleratorModuleStages,
  {
    /**
     * Human-readable stage name for display and logging.
     */
    name: string;
    /**
     * Numeric execution order (lower numbers execute first).
     */
    runOrder: number;
  }
>;

/**
 * Complete stage definition including metadata and associated modules.
 *
 * @description
 * Defines a pipeline stage with its execution order and the list of
 * modules that execute within that stage. Modules within a stage
 * execute according to their individual run order.
 *
 * @example
 * ```typescript
 * const organizationsStage: AcceleratorModuleStageDetailsType = {
 *   stage: {
 *     name: AcceleratorModuleStages.ORGANIZATIONS,
 *     runOrder: 6
 *   },
 *   modules: [
 *     {
 *       name: AcceleratorModules.MACIE,
 *       description: 'Configure Amazon Macie',
 *       runOrder: 1,
 *       handler: async (params) => 'Macie configured',
 *       executionPhase: ModuleExecutionPhase.DEPLOY
 *     }
 *   ]
 * };
 * ```
 */
export type AcceleratorModuleStageDetailsType = {
  /**
   * Stage identification and execution order metadata.
   */
  readonly stage: {
    /**
     * Stage identifier from AcceleratorModuleStages enum.
     */
    name: AcceleratorModuleStages;
    /**
     * Numeric execution order relative to other stages.
     */
    runOrder: number;
  };

  /**
   * Array of modules that execute within this stage.
   *
   * @description
   * Modules execute in order of their individual runOrder property.
   * Empty arrays indicate stages reserved for future functionality
   * or stages that only contain CDK stack deployments.
   */
  readonly modules: AcceleratorModuleDetailsType[];
};

/**
 * Promise wrapper with execution order for concurrent execution control.
 *
 * @description
 * Used internally by the ModuleRunner to group and execute promises
 * according to their run order while maintaining proper dependency
 * sequencing between different order levels.
 *
 * @example
 * ```typescript
 * const promiseItems: PromiseItemType[] = [
 *   {
 *     runOrder: 1,
 *     promise: () => moduleA.execute()
 *   },
 *   {
 *     runOrder: 1,
 *     promise: () => moduleB.execute()
 *   },
 *   {
 *     runOrder: 2,
 *     promise: () => moduleC.execute()
 *   }
 * ];
 *
 * // Modules A and B execute concurrently, then C executes
 * ```
 */
export type PromiseItemType = {
  /** Execution order for dependency management */
  runOrder: number;
  /** Promise-returning function to execute */
  promise: () => Promise<IModuleResponse>;
};

/**
 * Grouped stages by execution order for concurrent processing.
 *
 * @description
 * Used by the ModuleRunner to group stages that have the same run order
 * for concurrent execution while maintaining sequential execution between
 * different run order levels.
 *
 * @example
 * ```typescript
 * const groupedStages: GroupedStagesByRunOrderType = {
 *   order: 8,
 *   stages: [
 *     { stage: { name: AcceleratorModuleStages.SECURITY, runOrder: 8 }, modules: [] },
 *     { stage: { name: AcceleratorModuleStages.OPERATIONS, runOrder: 8 }, modules: [] }
 *   ]
 * };
 * ```
 */
export type GroupedStagesByRunOrderType = {
  /** Execution order level */
  order: number;
  /** Stages that execute at this order level */
  stages: AcceleratorModuleStageDetailsType[];
};

/**
 * Grouped promises by execution order for controlled concurrent execution.
 *
 * @description
 * Used internally to organize promise execution with proper dependency
 * management. Single promises or arrays of promises can execute concurrently
 * within the same order level.
 *
 * @example
 * ```typescript
 * const groupedPromises: GroupedPromisesByRunOrderType = {
 *   order: 1,
 *   promises: [
 *     () => Promise.resolve('Module A completed'),
 *     () => Promise.resolve('Module B completed')
 *   ]
 * };
 * ```
 */
export type GroupedPromisesByRunOrderType = {
  /** Execution order level */
  order: number;
  /** Single promise or array of promises for concurrent execution */
  promises: (() => Promise<IModuleResponse>) | (() => Promise<IModuleResponse>)[];
};

/**
 * Environment context for LZA resource operations.
 *
 * @description
 * Provides account and region context for resource operations including
 * account identification, naming, and regional targeting. Used throughout
 * the LZA for cross-account and cross-region operations.
 *
 * @example
 * ```typescript
 * const logArchiveEnv: AcceleratorEnvironmentDetailsType = {
 *   accountId: '123456789012',
 *   accountName: 'LogArchive',
 *   region: 'us-east-1'
 * };
 *
 * // Use for resource naming
 * const bucketName = `aws-accelerator-logs-${logArchiveEnv.accountId}-${logArchiveEnv.region}`;
 *
 * // Use for cross-account operations
 * const roleArn = `arn:aws:iam::${logArchiveEnv.accountId}:role/AcceleratorRole`;
 * ```
 */
export type AcceleratorEnvironmentDetailsType = {
  /** AWS account ID (12-digit number) */
  accountId: string;
  /** Human-readable account name */
  accountName: string;
  /** AWS region identifier */
  region: string;
};
