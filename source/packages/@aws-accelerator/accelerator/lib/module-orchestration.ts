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
 * @fileoverview Module orchestration and execution configuration for Landing Zone Accelerator on AWS (LZA).
 *
 * @description
 * This module defines the critical execution orchestration system for LZA deployment pipeline,
 * providing comprehensive control over module execution order, stage dependencies, and runtime
 * controllability. It serves as the central registry for all LZA modules and their execution
 * characteristics.
 *
 * Key responsibilities include:
 * - Stage execution order and dependency management
 * - Module registration and handler mapping
 * - Parallel execution coordination and safety
 * - Runtime execution control through environment variables
 * - Pipeline phase management (SYNTH vs DEPLOY)
 * - Resource deployment sequencing across AWS organization
 *
 * The orchestration system ensures proper dependency resolution, prevents resource conflicts,
 * and enables safe parallel execution of independent operations while maintaining strict
 * ordering for dependent resources.
 *
 * @example
 * ```typescript
 * // Accessing stage execution order
 * import { AcceleratorModuleStageOrders } from './module-orchestration';
 *
 * const prepareStageOrder = AcceleratorModuleStageOrders.PREPARE.runOrder; // 1
 * const securityStageOrder = AcceleratorModuleStageOrders.SECURITY.runOrder; // 8
 *
 * // Stages with same runOrder execute in parallel
 * const parallelStages = Object.values(AcceleratorModuleStageOrders)
 *   .filter(stage => stage.runOrder === 8)
 *   .map(stage => stage.name);
 * // Result: ['NETWORK_PREP', 'SECURITY', 'OPERATIONS']
 * ```
 *
 * @example
 * ```typescript
 * // Finding modules in a specific stage
 * import { AcceleratorModuleStageDetails } from './module-orchestration';
 *
 * const organizationsStage = AcceleratorModuleStageDetails.find(
 *   stage => stage.stage.name === 'ORGANIZATIONS'
 * );
 *
 * const macieModule = organizationsStage?.modules.find(
 *   module => module.name === 'MACIE'
 * );
 *
 * if (macieModule) {
 *   // Execute the module
 *   const result = await macieModule.handler(moduleParams);
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Runtime module control
 * import { EXECUTION_CONTROLLABLE_MODULES } from './module-orchestration';
 *
 * // Check if a module can be controlled via environment variables
 * const canControlMacie = EXECUTION_CONTROLLABLE_MODULES.includes('MACIE');
 *
 * // Skip module execution based on environment variable
 * const skipMacie = process.env.SkipMacieModule?.toLowerCase() === 'true';
 * if (skipMacie && canControlMacie) {
 *   // Skip Macie module execution
 * }
 * ```
 *
 * @critical
 * **CRITICAL SYSTEM COMPONENT**: Changes to this file directly affect the LZA deployment
 * pipeline execution order and can impact the entire AWS organization deployment.
 * All modifications must be thoroughly tested and reviewed for:
 * - Dependency management correctness
 * - Resource deployment sequencing
 * - Parallel execution safety
 * - Cross-account operation ordering
 * - Service integration dependencies
 */

import { AcceleratorStage } from './accelerator-stage';
import { TgwAssociationsAndPropagations } from './actions/network/tgw-associations-and-propagations';
import { StackResources } from './actions/resource-retention/stack-resources';
import { AmazonMacie } from './actions/security/amazon-macie';
import {
  AcceleratorModules,
  AcceleratorModuleStageDetailsType,
  AcceleratorModuleStageOrdersType,
  MODULE_SUPPORTED_STAGES,
  ModuleExecutionPhase,
  ModuleParams,
} from './types';

import { CreateStackPolicyModule } from '../../modules/lib/actions/aws-cloudformation/create-stack-policy-module';
import { GetCloudFormationTemplatesModule } from '../../modules/lib/actions/aws-cloudformation/get-cloudformation-templates';
import { CreateOrganizationalUnitModule } from '../../modules/lib/actions/aws-organizations/create-organizational-unit';
import { InviteAccountsToOrganizationsModule } from '../../modules/lib/actions/aws-organizations/invite-accounts-to-organizations';
import { MoveAccountModule } from '../../modules/lib/actions/aws-organizations/move-accounts';
import { ManageAccountsAliasModule } from '../../modules/lib/actions/aws-organizations/manage-accounts-alias';
import { RegisterOrganizationalUnitModule } from '../../modules/lib/actions/control-tower/register-organizational-unit';
import { SetupControlTowerLandingZoneModule } from '../../modules/lib/actions/control-tower/setup-control-tower-landing-zone';
import { EnrollAccountsModule } from '../../modules/lib/actions/control-tower/enroll-accounts';
import { ConfigureRootUserManagementModule } from '../../modules/lib/actions/aws-iam/root-user-management';
import { SsmBlockPublicDocumentSharingModule } from '../../modules/lib/actions/aws-ssm/ssm-block-public-document-sharing';
import { Ec2BlockPublicAmiModule } from '../../modules/lib/actions/aws-ec2/ec2-block-public-ami';
import { ManageAutomationRulesModule } from '../../modules/lib/actions/aws-security-hub/manage-automation-rules';
import { AcceleratorPrerequisites } from '../../modules/lib/actions/prerequisites/accelerator-prerequisites';
import { PipelinePrerequisites } from '../../modules/lib/actions/prerequisites/pipeline-prerequisites';
import { ModuleParams as LegacyModuleParams } from '../../modules/models/types';

import { IModuleResponse, MODULE_STATE_CODE } from 'aws-lza';

/**
 * Default maximum number of parallel module executions.
 */
const MAX_CONCURRENT_MODULE_EXECUTION_LIMIT = 50;

/**
 * Wraps a legacy module handler to accept new ModuleParams.
 *
 * @description
 * Converts the new ModuleParams to legacy format before invoking the handler,
 * bridging the type gap between the new RunnerParametersType (which uses sessionContext)
 * and the old RunnerParametersType (which has partition, region, useExistingRoles,
 * maxConcurrentExecution as top-level fields). Also adds globalRegion to
 * AcceleratorModuleRunnerParametersType.
 *
 * Remove this once old handlers are migrated to the new type.
 */
function legacyHandler(handler: (params: LegacyModuleParams) => Promise<string>) {
  return async (params: ModuleParams): Promise<IModuleResponse> => {
    const legacyParams: LegacyModuleParams = {
      moduleItem: params.moduleItem as unknown as LegacyModuleParams['moduleItem'],
      runnerParameters: {
        partition: params.runnerParameters.sessionContext.partition,
        region: params.runnerParameters.sessionContext.region,
        configDirPath: params.runnerParameters.configDirPath,
        prefix: params.runnerParameters.prefix,
        useExistingRoles: false,
        solutionId: params.runnerParameters.solutionId,
        dryRun: params.runnerParameters.dryRun,
        stage: params.runnerParameters.stage,
        maxConcurrentExecution: MAX_CONCURRENT_MODULE_EXECUTION_LIMIT,
      },
      moduleRunnerParameters: {
        ...params.moduleRunnerParameters,
        globalRegion: params.runnerParameters.sessionContext.globalRegion,
      } as unknown as LegacyModuleParams['moduleRunnerParameters'],
      stage: params.stage,
    };

    const summary = await handler(legacyParams);
    return {
      summary,
      status: MODULE_STATE_CODE.SUCCESS,
      timestamp: new Date().toISOString(),
      moduleName: params.moduleItem.name,
      dryRun: params.runnerParameters.dryRun,
    };
  };
}

/**
 * Stage execution order configuration for the LZA deployment pipeline.
 *
 * @description
 * Defines the sequential execution order for all LZA stages, establishing a dependency-aware
 * execution sequence that ensures proper resource deployment across the AWS organization.
 * Stages with lower run order numbers execute first, while stages with identical run order
 * numbers execute concurrently for optimal performance.
 *
 * This configuration is the foundation of LZA's orchestration system, ensuring that:
 * - Prerequisites are satisfied before dependent resources are created
 * - Parallel execution is safe and doesn't cause resource conflicts
 * - AWS service configurations follow proper sequencing requirements
 * - Cross-account operations occur in the correct order
 * - Infrastructure dependencies are respected throughout deployment
 *
 * @constant
 * @type {AcceleratorModuleStageOrdersType}
 *
 * @example
 * ```typescript
 * // Check execution order of stages
 * const prepareOrder = AcceleratorModuleStageOrders.PREPARE.runOrder; // 1 (first)
 * const finalizeOrder = AcceleratorModuleStageOrders.FINALIZE.runOrder; // 12 (last)
 *
 * // Find stages that execute in parallel (same runOrder)
 * const parallelStages = Object.entries(AcceleratorModuleStageOrders)
 *   .filter(([_, config]) => config.runOrder === 8)
 *   .map(([stage, _]) => stage);
 * // Result: ['NETWORK_PREP', 'SECURITY', 'OPERATIONS']
 * ```
 *
 * @example
 * ```typescript
 * // Sort stages by execution order for pipeline planning
 * const sortedStages = Object.entries(AcceleratorModuleStageOrders)
 *   .sort(([_, a], [__, b]) => a.runOrder - b.runOrder)
 *   .map(([stage, config]) => ({ stage, ...config }));
 *
 * // Execute stages in order
 * for (const stageConfig of sortedStages) {
 *   await executeStage(stageConfig.stage);
 * }
 * ```
 *
 * @remarks
 * **Execution Order and Dependencies:**
 *
 * **Sequential Stages (must run in order):**
 * - `PREPARE (1)`: Initial setup, validation, prerequisite checking, and state table initialization
 * - `ACCOUNTS (2)`: Account provisioning and organization setup
 * - `BOOTSTRAP (3)`: CDK bootstrap and foundational tooling
 * - `KEY (4)`: KMS key creation for encryption infrastructure
 * - `LOGGING (5)`: Central logging infrastructure deployment
 * - `ORGANIZATIONS (6)`: AWS Organizations configuration and policies
 * - `SECURITY_AUDIT (7)`: Security auditing and compliance setup
 *
 * **Parallel Execution Groups:**
 * - **Group 8**: `NETWORK_PREP`, `SECURITY`, `OPERATIONS` - Infrastructure preparation
 * - **Group 9**: `NETWORK_VPC`, `SECURITY_RESOURCES`, `IDENTITY_CENTER` - Core services
 *
 * **Final Stages:**
 * - `NETWORK_ASSOCIATIONS (10)`: Network connectivity and associations
 * - `CUSTOMIZATIONS (11)`: Custom resource deployment
 * - `FINALIZE (12)`: Final validation, cleanup, and completion
 *
 * @critical
 * **CRITICAL CONFIGURATION**: This execution order is essential for proper LZA deployment.
 * Modifying the order can cause:
 * - Resource dependency failures
 * - Cross-account permission issues
 * - Service integration problems
 * - Deployment pipeline failures
 *
 * Always validate changes through comprehensive testing before production deployment.
 */
export const AcceleratorModuleStageOrders: AcceleratorModuleStageOrdersType = {
  [AcceleratorStage.PREPARE]: { name: AcceleratorStage.PREPARE, runOrder: 1 },

  [AcceleratorStage.ACCOUNTS]: { name: AcceleratorStage.ACCOUNTS, runOrder: 2 },

  [AcceleratorStage.BOOTSTRAP]: { name: AcceleratorStage.BOOTSTRAP, runOrder: 3 },

  [AcceleratorStage.KEY]: { name: AcceleratorStage.KEY, runOrder: 4 },

  [AcceleratorStage.LOGGING]: { name: AcceleratorStage.LOGGING, runOrder: 5 },

  [AcceleratorStage.ORGANIZATIONS]: { name: AcceleratorStage.ORGANIZATIONS, runOrder: 6 },

  [AcceleratorStage.SECURITY_AUDIT]: { name: AcceleratorStage.SECURITY_AUDIT, runOrder: 7 },

  [AcceleratorStage.NETWORK_PREP]: { name: AcceleratorStage.NETWORK_PREP, runOrder: 8 },
  [AcceleratorStage.SECURITY]: { name: AcceleratorStage.SECURITY, runOrder: 8 },
  [AcceleratorStage.OPERATIONS]: { name: AcceleratorStage.OPERATIONS, runOrder: 8 },

  [AcceleratorStage.NETWORK_VPC]: { name: AcceleratorStage.NETWORK_VPC, runOrder: 9 },
  [AcceleratorStage.SECURITY_RESOURCES]: { name: AcceleratorStage.SECURITY_RESOURCES, runOrder: 9 },
  [AcceleratorStage.IDENTITY_CENTER]: { name: AcceleratorStage.IDENTITY_CENTER, runOrder: 9 },

  [AcceleratorStage.NETWORK_ASSOCIATIONS]: { name: AcceleratorStage.NETWORK_ASSOCIATIONS, runOrder: 10 },

  [AcceleratorStage.CUSTOMIZATIONS]: { name: AcceleratorStage.CUSTOMIZATIONS, runOrder: 11 },

  [AcceleratorStage.FINALIZE]: { name: AcceleratorStage.FINALIZE, runOrder: 12 },
};

/**
 * Comprehensive module registry and stage configuration for the LZA deployment pipeline.
 *
 * @description
 * This is the authoritative registry that defines all LZA stages and their associated modules,
 * serving as the central configuration for the entire deployment pipeline. Each stage entry
 * contains complete metadata about execution order and a comprehensive list of modules to execute
 * within that stage.
 *
 * The registry provides:
 * - Complete stage definitions with execution metadata
 * - Module registration with handlers and execution characteristics
 * - Execution phase control (SYNTH vs DEPLOY)
 * - Module-level run order within stages
 * - Handler function mapping for module execution
 * - Descriptive information for operational visibility
 *
 * Modules within each stage are executed according to their individual run order, while
 * stages themselves execute according to the `AcceleratorModuleStageOrders` configuration.
 * This two-level ordering system provides fine-grained control over execution sequence.
 *
 * @constant
 * @type {AcceleratorModuleStageDetailsType[]}
 *
 * @example
 * ```typescript
 * // Find a specific stage and its modules
 * const organizationsStage = AcceleratorModuleStageDetails.find(
 *   stageDetail => stageDetail.stage.name === 'ORGANIZATIONS'
 * );
 *
 * if (organizationsStage) {
 *   // Execute all modules in the stage
 *   for (const module of organizationsStage.modules) {
 *     if (module.executionPhase === ModuleExecutionPhase.DEPLOY) {
 *       const result = await module.handler(moduleParams);
 *       // Handle module execution result
 *     }
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Get all stages with active modules
 * const activeStages = AcceleratorModuleStageDetails.filter(
 *   stageDetail => stageDetail.modules.length > 0
 * );
 *
 * // Get all modules across all stages
 * const allModules = AcceleratorModuleStageDetails.flatMap(
 *   stageDetail => stageDetail.modules
 * );
 *
 * // Find modules by execution phase
 * const deployPhaseModules = allModules.filter(
 *   module => module.executionPhase === ModuleExecutionPhase.DEPLOY
 * );
 * ```
 *
 * @example
 * ```typescript
 * // Execute modules in a stage with proper ordering
 * const executeStageModules = async (stageName: string, params: ModuleParams) => {
 *   const stage = AcceleratorModuleStageDetails.find(
 *     s => s.stage.name === stageName
 *   );
 *
 *   if (!stage) return;
 *
 *   // Sort modules by run order
 *   const sortedModules = stage.modules.sort((a, b) => a.runOrder - b.runOrder);
 *
 *   // Execute modules in order
 *   for (const module of sortedModules) {
 *     try {
 *       const result = await module.handler(params);
 *       // Process module result
 *     } catch (error) {
 *       // Handle module execution error
 *     }
 *   }
 * };
 * ```
 *
 * @remarks
 * **Stage Configuration Guidelines:**
 *
 * **Stage Structure:**
 * - Each stage entry includes stage metadata (name, runOrder) and module array
 * - Stage runOrder determines when the stage executes relative to other stages
 * - Empty module arrays indicate stages reserved for future functionality
 *
 * **Module Configuration:**
 * - `name`: Unique identifier for the module (from AcceleratorModules enum)
 * - `description`: Human-readable description for operational visibility
 * - `runOrder`: Execution order within the stage (lower numbers execute first)
 * - `handler`: Async function that performs the module's operations
 * - `executionPhase`: Determines whether module runs during SYNTH or DEPLOY phase
 *
 * **Handler Requirements:**
 * - Must be async functions that accept ModuleParams
 * - Must return IModuleResponse objects with status and summary
 * - Should handle errors gracefully and provide meaningful error messages
 * - Must support dry-run mode when params.dryRun is true
 *
 * **Execution Phases:**
 * - `SYNTH`: Modules that run during CDK synthesis phase
 * - `DEPLOY`: Modules that run during actual resource deployment
 *
 * @critical
 * **CRITICAL REGISTRY**: This is the authoritative source for all LZA modules.
 * Adding, removing, or modifying modules here directly affects what gets deployed
 * in the LZA pipeline. Changes must be:
 * - Thoroughly tested in non-production environments
 * - Reviewed for dependency impacts
 * - Validated for proper error handling
 * - Documented for operational teams
 */
export const AcceleratorModuleStageDetails: AcceleratorModuleStageDetailsType[] = [
  {
    stage: {
      name: MODULE_SUPPORTED_STAGES.PREPARE,
      runOrder: AcceleratorModuleStageOrders[MODULE_SUPPORTED_STAGES.PREPARE].runOrder,
    },
    modules: [
      {
        name: AcceleratorModules.STACK_RESOURCES_RETENTION,
        description: 'Retain CloudFormation custom resources before service migration',
        runOrder: 1,
        handler: async (params: ModuleParams) => {
          return await StackResources.retain(params);
        },
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      {
        name: AcceleratorModules.PIPELINE_PREREQUISITES,
        description: 'Pipeline Prerequisites module',
        runOrder: 1,
        handler: legacyHandler(PipelinePrerequisites.execute),
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      {
        name: AcceleratorModules.CREATE_ORGANIZATIONAL_UNIT,
        description: 'Create AWS Organizations Organizational Unit (OU)',
        runOrder: 2,
        handler: legacyHandler(CreateOrganizationalUnitModule.execute),
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      {
        name: AcceleratorModules.INVITE_ACCOUNTS_TO_ORGANIZATIONS,
        description: 'Invite AWS Accounts to AWS Organizations',
        runOrder: 3,
        handler: legacyHandler(InviteAccountsToOrganizationsModule.execute),
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      {
        name: AcceleratorModules.MOVE_ACCOUNTS,
        description: 'Move AWS Accounts to destination AWS Organizations Organizational Unit (OU)',
        runOrder: 4,
        handler: legacyHandler(MoveAccountModule.execute),
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      {
        name: AcceleratorModules.SETUP_CONTROL_TOWER_LANDING_ZONE,
        description: 'Manage AWS Control Tower Landing Zone',
        runOrder: 5,
        handler: legacyHandler(SetupControlTowerLandingZoneModule.execute),
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      {
        name: AcceleratorModules.REGISTER_ORGANIZATIONAL_UNIT,
        description: 'Register AWS Organizations Organizational Unit (OU) with AWS Control Tower',
        runOrder: 6,
        handler: legacyHandler(RegisterOrganizationalUnitModule.execute),
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      {
        name: AcceleratorModules.ROOT_USER_MANAGEMENT,
        description: 'Configure IAM Root User Management',
        runOrder: 7,
        handler: legacyHandler(ConfigureRootUserManagementModule.execute),
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      {
        name: AcceleratorModules.CREATE_STACK_POLICY,
        description: 'Setup Stack Policy in accounts',
        runOrder: 8,
        handler: legacyHandler(CreateStackPolicyModule.execute),
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
    ],
  },
  {
    stage: {
      name: MODULE_SUPPORTED_STAGES.ACCOUNTS,
      runOrder: AcceleratorModuleStageOrders[MODULE_SUPPORTED_STAGES.ACCOUNTS].runOrder,
    },
    modules: [
      {
        name: AcceleratorModules.ENROLL_ACCOUNTS,
        description: 'Enroll new accounts with AWS Control Tower',
        runOrder: 1,
        handler: legacyHandler(EnrollAccountsModule.execute),
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      {
        name: AcceleratorModules.MANAGE_ACCOUNTS_ALIAS,
        description: 'Manage the alias of accounts',
        runOrder: 2,
        handler: legacyHandler(ManageAccountsAliasModule.execute),
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
    ],
  },
  {
    stage: {
      name: MODULE_SUPPORTED_STAGES.BOOTSTRAP,
      runOrder: AcceleratorModuleStageOrders[MODULE_SUPPORTED_STAGES.BOOTSTRAP].runOrder,
    },
    modules: [],
  },
  {
    stage: {
      name: MODULE_SUPPORTED_STAGES.KEY,
      runOrder: AcceleratorModuleStageOrders[MODULE_SUPPORTED_STAGES.KEY].runOrder,
    },
    modules: [],
  },
  {
    stage: {
      name: MODULE_SUPPORTED_STAGES.LOGGING,
      runOrder: AcceleratorModuleStageOrders[MODULE_SUPPORTED_STAGES.LOGGING].runOrder,
    },
    modules: [
      {
        name: AcceleratorModules.ACCELERATOR_PREREQUISITES,
        description: 'Prerequisites module',
        runOrder: 1,
        handler: legacyHandler(AcceleratorPrerequisites.execute),
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
    ],
  },
  {
    stage: {
      name: MODULE_SUPPORTED_STAGES.ORGANIZATIONS,
      runOrder: AcceleratorModuleStageOrders[MODULE_SUPPORTED_STAGES.ORGANIZATIONS].runOrder,
    },
    modules: [
      {
        name: AcceleratorModules.MACIE,
        description: 'Configure Amazon Macie for the AWS Organizations',
        runOrder: 1,
        handler: async (params: ModuleParams) => {
          return await AmazonMacie.configure(params);
        },
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
    ],
  },
  {
    stage: {
      name: MODULE_SUPPORTED_STAGES.SECURITY_AUDIT,
      runOrder: AcceleratorModuleStageOrders[MODULE_SUPPORTED_STAGES.SECURITY_AUDIT].runOrder,
    },
    modules: [],
  },
  {
    stage: {
      name: MODULE_SUPPORTED_STAGES.NETWORK_PREP,
      runOrder: AcceleratorModuleStageOrders[MODULE_SUPPORTED_STAGES.NETWORK_PREP].runOrder,
    },
    modules: [],
  },
  {
    stage: {
      name: MODULE_SUPPORTED_STAGES.SECURITY,
      runOrder: AcceleratorModuleStageOrders[MODULE_SUPPORTED_STAGES.SECURITY].runOrder,
    },
    modules: [
      {
        name: AcceleratorModules.SSM_BLOCK_PUBLIC_DOCUMENT_SHARING,
        description: 'Manage SSM Block Public Document Sharing across organization accounts',
        runOrder: 1,
        handler: legacyHandler(SsmBlockPublicDocumentSharingModule.execute),
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      {
        name: AcceleratorModules.EC2_BLOCK_PUBLIC_AMI,
        description: 'Manage EC2 Image Block Public Access across organization accounts',
        runOrder: 1,
        handler: legacyHandler(Ec2BlockPublicAmiModule.execute),
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      {
        name: AcceleratorModules.MANAGE_AUTOMATION_RULES,
        description: 'Manage Automation Rules module',
        runOrder: 1,
        handler: legacyHandler(ManageAutomationRulesModule.execute),
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
    ],
  },
  {
    stage: {
      name: MODULE_SUPPORTED_STAGES.OPERATIONS,
      runOrder: AcceleratorModuleStageOrders[MODULE_SUPPORTED_STAGES.OPERATIONS].runOrder,
    },
    modules: [],
  },
  {
    stage: {
      name: MODULE_SUPPORTED_STAGES.NETWORK_VPC,
      runOrder: AcceleratorModuleStageOrders[MODULE_SUPPORTED_STAGES.NETWORK_VPC].runOrder,
    },
    modules: [
      {
        name: AcceleratorModules.GET_CLOUDFORMATION_TEMPLATES,
        description: 'Get Cloudformation Templates Cross Account',
        runOrder: 1,
        handler: legacyHandler(GetCloudFormationTemplatesModule.execute),
        executionPhase: ModuleExecutionPhase.SYNTH,
      },
    ],
  },
  {
    stage: {
      name: MODULE_SUPPORTED_STAGES.SECURITY_RESOURCES,
      runOrder: AcceleratorModuleStageOrders[MODULE_SUPPORTED_STAGES.SECURITY_RESOURCES].runOrder,
    },
    modules: [],
  },
  {
    stage: {
      name: MODULE_SUPPORTED_STAGES.IDENTITY_CENTER,
      runOrder: AcceleratorModuleStageOrders[MODULE_SUPPORTED_STAGES.IDENTITY_CENTER].runOrder,
    },
    modules: [],
  },
  {
    stage: {
      name: MODULE_SUPPORTED_STAGES.NETWORK_ASSOCIATIONS,
      runOrder: AcceleratorModuleStageOrders[MODULE_SUPPORTED_STAGES.NETWORK_ASSOCIATIONS].runOrder,
    },
    modules: [
      {
        name: AcceleratorModules.TGW_ASSOCIATIONS_AND_PROPAGATIONS,
        description: 'Configure Transit Gateway route table associations and propagations',
        runOrder: 1,
        handler: async (params: ModuleParams) => {
          return await TgwAssociationsAndPropagations.configure(params);
        },
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
    ],
  },
  {
    stage: {
      name: MODULE_SUPPORTED_STAGES.CUSTOMIZATIONS,
      runOrder: AcceleratorModuleStageOrders[MODULE_SUPPORTED_STAGES.CUSTOMIZATIONS].runOrder,
    },
    modules: [],
  },
  {
    stage: {
      name: MODULE_SUPPORTED_STAGES.FINALIZE,
      runOrder: AcceleratorModuleStageOrders[MODULE_SUPPORTED_STAGES.FINALIZE].runOrder,
    },
    modules: [
      {
        name: AcceleratorModules.CREATE_STACK_POLICY,
        description: 'Setup Stack Policy in accounts',
        runOrder: 1,
        handler: legacyHandler(CreateStackPolicyModule.execute),
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
    ],
  },
];

/**
 * Registry of modules that support runtime execution control via environment variables.
 *
 * @description
 * Defines the complete list of LZA modules that can be selectively enabled or disabled
 * through environment variable configuration during pipeline execution. This provides
 * operational flexibility for troubleshooting, testing, and selective deployment scenarios
 * without requiring code changes or pipeline reconfiguration.
 *
 * Modules listed in this registry can be controlled using PascalCase environment variables
 * following the pattern: `Skip{ModuleName}Module=true`. When set to 'true' (case insensitive),
 * the module execution will be skipped entirely, allowing the pipeline to continue without
 * that specific functionality.
 *
 * This capability is particularly useful for:
 * - Troubleshooting deployment issues by isolating problematic modules
 * - Testing pipeline changes with reduced scope
 * - Temporary workarounds during service outages
 * - Gradual rollout of new modules in production environments
 * - Emergency deployment scenarios requiring specific module exclusion
 *
 * @constant
 * @type {string[]}
 *
 * @example
 * ```typescript
 * // Check if a module supports execution control
 * import { EXECUTION_CONTROLLABLE_MODULES } from './module-orchestration';
 *
 * const canControlMacie = EXECUTION_CONTROLLABLE_MODULES.includes('MACIE');
 * if (canControlMacie) {
 *   // Module can be controlled via environment variable
 *   const skipMacie = process.env.SkipMacieModule?.toLowerCase() === 'true';
 *   if (skipMacie) {
 *     // Skip Macie module execution
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Runtime module control implementation
 * const shouldSkipModule = (moduleName: string): boolean => {
 *   if (!EXECUTION_CONTROLLABLE_MODULES.includes(moduleName)) {
 *     return false; // Module doesn't support control
 *   }
 *
 *   const envVarName = `Skip${moduleName}Module`;
 *   const skipValue = process.env[envVarName]?.toLowerCase();
 *   return skipValue === 'true';
 * };
 *
 * // Usage in module execution
 * if (shouldSkipModule('MACIE')) {
 *   // Log skip reason and continue
 *   return { status: 'SKIPPED', summary: 'Module skipped via environment variable' };
 * }
 * ```
 *
 * @example
 * ```bash
 * # Environment variable examples for module control
 *
 * # Skip Macie module execution
 * export SkipMacieModule=true
 *
 * # Skip multiple modules
 * export SkipMacieModule=true
 * export SkipGuardDutyModule=true
 *
 * # Enable all modules (default behavior)
 * unset SkipMacieModule
 * # or explicitly set to false
 * export SkipMacieModule=false
 * ```
 *
 * @remarks
 * **Environment Variable Control Guidelines:**
 *
 * **Naming Convention:**
 * - Pattern: `Skip{ModuleName}Module`
 * - Use exact PascalCase module name from AcceleratorModules enum
 * - Always prefix with 'Skip' and suffix with 'Module'
 *
 * **Value Interpretation:**
 * - `'true'` (case insensitive): Skip module execution
 * - `'false'` or unset: Execute module normally (default behavior)
 * - Any other value: Treated as false (module executes)
 *
 * **Operational Considerations:**
 * - Only modules in this registry support environment-based control
 * - Skipping modules may affect dependent resources and system functionality
 * - Always test module skipping in non-production environments first
 * - Document any production use of module skipping for operational teams
 * - Consider dependency impacts when skipping modules
 *
 * **Production Usage:**
 * - Contact AWS Support before modifying default module execution in production
 * - Use module skipping as a temporary measure, not permanent configuration
 * - Monitor system functionality when modules are skipped
 * - Plan for re-enabling skipped modules once issues are resolved
 *
 * @critical
 * **CRITICAL OPERATIONAL CONTROL**: This configuration enables runtime control of
 * module execution. Use with extreme caution as skipping modules can:
 * - Leave security services unconfigured
 * - Break dependent resource deployments
 * - Create compliance gaps
 * - Impact overall system functionality
 *
 * Always validate the impact of skipping modules before production use.
 */
export const EXECUTION_CONTROLLABLE_MODULES: string[] = Object.values(AcceleratorModules);
