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
 * @fileoverview Module execution runner and orchestration engine for Landing Zone Accelerator on AWS (LZA).
 *
 * @description
 * This module provides the core execution engine for LZA module orchestration, handling the complete
 * lifecycle of module execution from parameter validation through result aggregation. It serves as
 * the primary entry point for LZA deployment operations and provides comprehensive execution control,
 * error handling, and operational visibility.
 *
 * Key capabilities include:
 * - Command-line interface for module execution control
 * - Stage-based and full pipeline execution modes
 * - Parallel execution coordination with dependency management
 * - Configuration loading and validation
 * - Cross-account credential management
 * - Central logging resource integration
 * - Environment-based module execution control
 * - Comprehensive error handling and status reporting
 * - AWS Organizations integration for account discovery
 * - Resource naming and prefix management
 *
 * The runner supports both individual stage execution and full pipeline execution,
 * with intelligent dependency resolution and parallel execution optimization.
 * It integrates with the module orchestration system to ensure proper execution
 * order and resource dependency satisfaction.
 *
 * @example
 * ```typescript
 * // Execute all modules in the pipeline
 * const allModulesResult = await ModuleRunner.execute({
 *   sessionContext: { invokingAccountId: 'XXXXXXXXXXXX', region: 'us-east-1' },
 *   configDirPath: './config',
 *   prefix: 'AWSAccelerator',
 *   solutionId: 'AwsSolution/SO0199/1.0.0',
 *   dryRun: false,
 *   loadOrganizationsFromDynamoDbTable: false
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Execute modules for a specific stage
 * const stageResult = await ModuleRunner.execute({
 *   sessionContext: { invokingAccountId: 'XXXXXXXXXXXX', region: 'us-east-1' },
 *   configDirPath: './config',
 *   stage: 'ORGANIZATIONS',
 *   prefix: 'AWSAccelerator',
 *   solutionId: 'AwsSolution/SO0199/1.0.0',
 *   dryRun: false,
 *   loadOrganizationsFromDynamoDbTable: true
 * });
 * ```
 *
 * @example
 * ```bash
 * # Command-line usage examples
 *
 * # Execute all modules
 * yarn run lza --config-dir ./config --region us-east-1
 *
 * # Execute specific stage
 * yarn run lza --config-dir ./config --stage ORGANIZATIONS --region us-east-1
 *
 * # Dry run execution
 * yarn run lza --config-dir ./config --dry-run --region us-east-1
 *
 * # Custom accelerator prefix
 * yarn run lza --config-dir ./config --accelerator-prefix MyLZA --region us-east-1
 * ```
 *
 * @critical
 * **CRITICAL EXECUTION ENGINE**: This module is the core execution engine for LZA.
 * Changes can affect the entire deployment pipeline and must be thoroughly tested.
 * The runner handles cross-account operations, resource dependencies, and error
 * propagation throughout the AWS organization.
 */

import path from 'path';
import yargs from 'yargs';

import { version } from '../package.json';
import { AcceleratorResourcePrefixes, setResourcePrefixes } from '../utils/app-utils';
import { ConfigLoader } from './config-loader';
import {
  AcceleratorModuleStageDetails,
  AcceleratorModuleStageOrders,
  EXECUTION_CONTROLLABLE_MODULES,
} from './module-orchestration';
import {
  AcceleratorEnvironmentDetailsType,
  AcceleratorModuleDetailsType,
  AcceleratorModuleRunnerParametersType,
  AcceleratorModuleStageDetailsType,
  GroupedPromisesByRunOrderType,
  GroupedStagesByRunOrderType,
  MODULE_SUPPORTED_STAGES,
  ModuleExecutionPhase,
  PromiseItemType,
  RunnerParametersType,
} from './types';

import {
  createLogger,
  createStatusLogger,
  DynamoDBFilterOperator,
  flushLoggers,
  getCredentials,
  getCurrentSessionDetails,
  getModuleSessionPolicy,
  getOrganizationAccounts,
  getOrganizationAccountsFromSourceTable,
  getOrganizationDetails,
  IAssumeRoleCredential,
  IModuleResponse,
  MODULE_EXCEPTIONS,
  MODULE_STATE_CODE,
  setRetryStrategy,
  throttlingBackOff,
  waitForLoggerInitialization,
} from 'aws-lza';
import { AcceleratorResourceNames } from '../lib/accelerator-resource-names';
import { getOrganizationSourceTableName } from './actions/utils/common-config';
import { writeModuleDiffFile } from './actions/utils/module-diff-formatter';

import { AccountsConfig, GlobalConfig } from '@aws-accelerator/config';
import { CachingCredentialProvider } from '@aws-accelerator/utils';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { Account } from '@aws-sdk/client-organizations';
import { GetParameterCommand, ParameterNotFound, SSMClient } from '@aws-sdk/client-ssm';
import { constantCase, pascalCase } from 'change-case';
import { AcceleratorStage } from './accelerator-stage';

/**
 * General purpose logger instance for detailed operational logging.
 *
 * @description
 * Provides comprehensive logging for module execution operations, debug information,
 * and detailed error tracking. Uses the filename as the logger context for easy
 * identification in log aggregation systems.
 *
 * @constant
 * @type {Logger}
 */
const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Status logger instance for high-level execution status and progress tracking.
 *
 * @description
 * Handles status-specific logging for module execution progress, completion states,
 * and operational visibility. Complements the general logger with structured status
 * information for monitoring and alerting systems.
 *
 * @constant
 * @type {StatusLogger}
 */
const statusLogger = createStatusLogger([path.parse(path.basename(__filename)).name]);

/**
 * Core module execution runner and orchestration engine for Landing Zone Accelerator.
 *
 * @description
 * This abstract class provides the primary execution engine for LZA module orchestration,
 * handling the complete lifecycle of module execution from parameter validation through
 * result aggregation. It serves as the central coordinator for all LZA deployment
 * operations with comprehensive execution control and error handling.
 *
 * The ModuleRunner provides:
 * - Stage-based and full pipeline execution modes
 * - Parallel execution coordination with dependency management
 * - Configuration loading and validation
 * - Cross-account credential management and AWS Organizations integration
 * - Central logging resource discovery and integration
 * - Environment-based module execution control
 * - Comprehensive error handling with proper error propagation
 * - Resource naming and prefix management
 * - Execution phase control (SYNTH vs DEPLOY)
 *
 * The class supports both individual stage execution for targeted deployments
 * and full pipeline execution for complete LZA deployments, with intelligent
 * dependency resolution and parallel execution optimization.
 *
 * @abstract
 * @class ModuleRunner
 *
 * @example
 * ```typescript
 * // Execute all modules in the pipeline
 * const runnerParams: RunnerParametersType = {
 *   sessionContext: {
 *     invokingAccountId: 'XXXXXXXXXXXX',
 *     region: 'us-east-1',
 *     partition: 'aws',
 *     globalRegion: 'us-east-1'
 *   },
 *   configDirPath: './accelerator-config',
 *   prefix: 'AWSAccelerator',
 *   solutionId: 'AwsSolution/SO0199/1.0.0',
 *   dryRun: false,
 *   loadOrganizationsFromDynamoDbTable: false
 * };
 *
 * const results = await ModuleRunner.execute(runnerParams);
 *
 * // Process results
 * const failedModules = results.filter(r => r.status === MODULE_STATE_CODE.FAILED);
 * const completedModules = results.filter(r => r.status === MODULE_STATE_CODE.COMPLETED);
 * ```
 *
 * @example
 * ```typescript
 * // Execute modules for a specific stage
 * const stageParams: RunnerParametersType = {
 *   sessionContext: {
 *     invokingAccountId: 'XXXXXXXXXXXX',
 *     region: 'us-east-1',
 *     partition: 'aws',
 *     globalRegion: 'us-east-1'
 *   },
 *   configDirPath: './accelerator-config',
 *   stage: 'ORGANIZATIONS', // Execute only ORGANIZATIONS stage
 *   prefix: 'AWSAccelerator',
 *   solutionId: 'AwsSolution/SO0199/1.0.0',
 *   dryRun: false,
 *   loadOrganizationsFromDynamoDbTable: true
 * };
 *
 * const stageResults = await ModuleRunner.execute(stageParams);
 * ```
 *
 * @critical
 * **CRITICAL EXECUTION ENGINE**: This class is the core execution engine for LZA.
 * All methods handle cross-account operations, resource dependencies, and error
 * propagation throughout the AWS organization. Changes must be thoroughly tested
 * and can affect the entire deployment pipeline.
 */
export abstract class ModuleRunner {
  /**
   * Main execution entry point for LZA module orchestration and deployment.
   *
   * @description
   * This is the primary method for executing LZA modules, providing comprehensive
   * orchestration of the deployment pipeline. It supports both full pipeline execution
   * and individual stage execution, with intelligent routing based on the provided
   * parameters.
   *
   * The method handles:
   * - Parameter validation and configuration loading
   * - Execution mode determination (stage-specific vs full pipeline)
   * - Module orchestration and dependency management
   * - Parallel execution coordination
   * - Error handling and result aggregation
   * - Cross-account credential management
   * - AWS Organizations integration
   *
   * @static
   * @async
   * @method execute
   *
   * @param {RunnerParametersType} params - Complete execution parameters
   * @param {Object} params.sessionContext - AWS session context and credentials
   * @param {string} params.sessionContext.invokingAccountId - Account ID executing the modules
   * @param {string} params.sessionContext.region - AWS region for execution
   * @param {string} params.sessionContext.partition - AWS partition (aws, aws-cn, aws-us-gov)
   * @param {string} params.sessionContext.globalRegion - Global region for Organizations operations
   * @param {string} params.configDirPath - Path to LZA configuration directory
   * @param {string} [params.stage] - Optional specific stage to execute (if undefined, executes all stages)
   * @param {string} params.prefix - Accelerator resource prefix for naming
   * @param {string} params.solutionId - Solution identifier for tracking and tagging
   * @param {boolean} params.dryRun - Whether to perform dry run without actual changes
   * @param {boolean} params.loadOrganizationsFromDynamoDbTable - Whether to load org data from DynamoDB
   *
   * @returns {Promise<IModuleResponse[]>} Promise resolving to array of module execution results
   * @returns {MODULE_STATE_CODE} returns[].status - Execution status (COMPLETED, FAILED, SKIPPED)
   * @returns {string} returns[].summary - Human-readable execution summary
   * @returns {string} returns[].timestamp - ISO timestamp of completion
   * @returns {string} returns[].moduleName - Name of the executed module
   * @returns {boolean} returns[].dryRun - Whether this was a dry run execution
   * @returns {Error} [returns[].error] - Error details if execution failed
   *
   * @throws {Error} When no modules are found in AcceleratorModuleStageDetails
   * @throws {Error} When module execution fails and cannot be recovered
   * @throws {Error} When configuration loading fails
   * @throws {Error} When credential management fails
   *
   * @example
   * ```typescript
   * // Execute all modules in the pipeline
   * const allStagesParams: RunnerParametersType = {
   *   sessionContext: {
   *     invokingAccountId: 'XXXXXXXXXXXX',
   *     region: 'us-east-1',
   *     partition: 'aws',
   *     globalRegion: 'us-east-1'
   *   },
   *   configDirPath: './config',
   *   prefix: 'AWSAccelerator',
   *   solutionId: 'AwsSolution/SO0199/1.0.0',
   *   dryRun: false,
   *   loadOrganizationsFromDynamoDbTable: false
   * };
   *
   * try {
   *   const results = await ModuleRunner.execute(allStagesParams);
   *
   *   // Analyze results
   *   const summary = {
   *     total: results.length,
   *     completed: results.filter(r => r.status === MODULE_STATE_CODE.COMPLETED).length,
   *     failed: results.filter(r => r.status === MODULE_STATE_CODE.FAILED).length,
   *     skipped: results.filter(r => r.status === MODULE_STATE_CODE.SKIPPED).length
   *   };
   *
   *   if (summary.failed > 0) {
   *     const failedModules = results
   *       .filter(r => r.status === MODULE_STATE_CODE.FAILED)
   *       .map(r => `${r.moduleName}: ${r.error?.message}`)
   *       .join('\n');
   *     throw new Error(`${summary.failed} modules failed:\n${failedModules}`);
   *   }
   * } catch (error) {
   *   // Handle execution errors
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Execute specific stage only
   * const stageParams: RunnerParametersType = {
   *   sessionContext: {
   *     invokingAccountId: 'XXXXXXXXXXXX',
   *     region: 'us-east-1',
   *     partition: 'aws',
   *     globalRegion: 'us-east-1'
   *   },
   *   configDirPath: './config',
   *   stage: 'ORGANIZATIONS', // Execute only this stage
   *   prefix: 'AWSAccelerator',
   *   solutionId: 'AwsSolution/SO0199/1.0.0',
   *   dryRun: false,
   *   loadOrganizationsFromDynamoDbTable: true
   * };
   *
   * const stageResults = await ModuleRunner.execute(stageParams);
   * ```
   *
   * @example
   * ```typescript
   * // Dry run execution for testing
   * const dryRunParams: RunnerParametersType = {
   *   ...baseParams,
   *   dryRun: true // No actual changes will be made
   * };
   *
   * const dryRunResults = await ModuleRunner.execute(dryRunParams);
   * // Review dry run results before actual deployment
   * ```
   *
   * @remarks
   * **Execution Modes:**
   * - **Full Pipeline**: When `params.stage` is undefined, executes all stages in dependency order
   * - **Stage-Specific**: When `params.stage` is provided, executes only that stage's modules
   *
   * **Error Handling:**
   * - Module failures within a run order group cause immediate termination
   * - Errors are propagated with detailed context and module information
   * - Partial results are returned for completed modules before failure
   *
   * **Parallel Execution:**
   * - Modules with the same run order execute in parallel for performance
   * - Stages with the same run order execute in parallel when safe
   * - Dependencies are strictly enforced to prevent resource conflicts
   *
   * @critical
   * **CRITICAL METHOD**: This method orchestrates the entire LZA deployment.
   * Failures can affect the entire AWS organization. Always test changes
   * thoroughly in non-production environments.
   */
  public static async execute(params: RunnerParametersType): Promise<IModuleResponse[]> {
    if (AcceleratorModuleStageDetails.length === 0) {
      throw new Error(`No modules found in AcceleratorModuleStageDetails`);
    }

    //
    // Initialize the centralized credential cache before any configuration loading.
    // ModuleRunner is a separate entry point from Accelerator.run(); without this,
    // shared config-loading code that calls CachingCredentialProvider.get() (for example
    // GlobalConfig.getCrossAccountSsmClient via loadLzaResources) throws
    // "CachingCredentialProvider not initialized". init() is idempotent. Additional
    // enabled regions are registered on demand during config load.
    //
    const initRegions = [params.sessionContext.globalRegion];
    if (params.sessionContext.region && !initRegions.includes(params.sessionContext.region)) {
      initRegions.push(params.sessionContext.region);
    }
    CachingCredentialProvider.init({
      partition: params.sessionContext.partition,
      regions: initRegions,
      sessionName: 'lza',
      enableDebug: process.env['LOG_LEVEL'] === 'debug',
      maxSockets: Number(process.env['CREDENTIAL_PROVIDER_MAX_SOCKETS'] ?? 150),
    });

    const logPrefix = `${params.sessionContext.invokingAccountId}:${params.sessionContext.region}`;

    if (params.stage) {
      return await ModuleRunner.executeStageDependentModules(params, logPrefix);
    }

    return await ModuleRunner.executeAllStageModules(params, logPrefix);
  }

  /**
   * Prepares and aggregates all module runner parameters required for execution.
   *
   * @description
   * Orchestrates the collection and preparation of all parameters needed for module
   * execution. This includes resource prefixes, management account credentials, and
   * comprehensive accelerator configurations. The function serves as a central
   * preparation point for both stage-dependent and pipeline-wide execution modes.
   *
   * @param params - Runner parameters containing session context and configuration paths
   * @param logPrefix - Logging prefix for operational visibility
   * @returns Complete module runner parameters ready for module execution
   *
   * @example
   * ```typescript
   * const runnerParams = {
   *   sessionContext: { invokingAccountId: 'XXXXX', region: 'us-east-1' },
   *   configDirPath: './config',
   *   prefix: 'AWSAccelerator',
   *   solutionId: 'AwsSolution/SO0199/1.0.0',
   *   // ... other params
   * };
   *
   * const moduleRunnerParams = await ModuleRunner.getModuleRunnerParameters(
   *   runnerParams,
   *   'XXXXX:us-east-1'
   * );
   * // Returns complete parameters for module execution
   * ```
   *
   * @remarks
   * **Parameter Assembly:**
   * 1. Resource prefixes from accelerator prefix
   * 2. Management account credentials (if configured)
   * 3. Complete accelerator configurations
   * 4. Organization details and accounts
   * 5. Central logging configuration
   *
   * **Credential Management:**
   * - Attempts to get management account credentials if environment variables are set
   * - Falls back to current session credentials if management account access not configured
   *
   * @internal
   */
  private static async getModuleRunnerParameters(
    params: RunnerParametersType,
    logPrefix: string,
  ): Promise<AcceleratorModuleRunnerParametersType> {
    //
    // Get Resource prefixes
    //
    const resourcePrefixes = setResourcePrefixes(params.prefix);

    //
    // Get Management account credentials
    //
    const managementAccountCredentials = await ModuleRunner.getManagementAccountCredentials(
      params.sessionContext.partition,
      params.sessionContext.region,
      params.solutionId,
      logPrefix,
    );
    //
    // Get accelerator module runner parameters
    //
    return await ModuleRunner.getAcceleratorModuleRunnerParameters({
      configDirPath: params.configDirPath,
      partition: params.sessionContext.partition,
      globalRegion: params.sessionContext.globalRegion,
      resourcePrefixes,
      solutionId: params.solutionId,
      loadOrganizationsFromDynamoDbTable: params.loadOrganizationsFromDynamoDbTable,
      logPrefix,
      managementAccountCredentials,
    });
  }

  private static async executeAllStageModules(
    runnerParameters: RunnerParametersType,
    logPrefix: string,
  ): Promise<IModuleResponse[]> {
    logger.info(`Executing all modules since stage is undefined`, logPrefix);
    const statuses: IModuleResponse[] = [];
    const sortedStageItems = AcceleratorModuleStageDetails.sort((a, b) => a.stage.runOrder - b.stage.runOrder);

    const acceleratorModuleRunnerParameters = await ModuleRunner.getModuleRunnerParameters(runnerParameters, logPrefix);
    const groupedStageItems = ModuleRunner.groupStagesByRunOrder(sortedStageItems);

    let loadedNonPrepareStageConfig = false;

    for (const groupedStageItem of groupedStageItems) {
      const promiseItems: PromiseItemType[] = [];

      for (const stageItem of groupedStageItem.stages) {
        // Load configuration for non-PREPARE stages
        loadedNonPrepareStageConfig = await ModuleRunner.loadConfigurationForNonPrepareStages(
          stageItem,
          runnerParameters,
          acceleratorModuleRunnerParameters,
          loadedNonPrepareStageConfig,
          logPrefix,
        );

        // Process modules for this stage
        const stagePromiseItems = await ModuleRunner.processStageModules(
          stageItem,
          runnerParameters,
          acceleratorModuleRunnerParameters,
          logPrefix,
        );

        promiseItems.push(...stagePromiseItems);
      }

      statuses.push(...(await ModuleRunner.executePromises(promiseItems, logPrefix)));
    }

    return statuses;
  }

  /**
   * Checks if a module matches the current execution phase (SYNTH or DEPLOY).
   *
   * @description
   * Determines whether a module should be executed based on the current execution phase.
   * Modules are configured to run in either SYNTH phase (CDK synthesis) or DEPLOY phase
   * (actual resource deployment). This function ensures modules only execute in their
   * designated phase.
   *
   * @param moduleItem - Module item to check for phase compatibility
   * @param synthPhase - Whether currently in synthesis phase (true) or deploy phase (false)
   * @returns True if module matches current execution phase, false otherwise
   *
   * @example
   * ```typescript
   * const synthPhase = process.env['CDK_OPTIONS'] === 'bootstrap';
   * const moduleItem = {
   *   name: 'SecurityModule',
   *   executionPhase: ModuleExecutionPhase.DEPLOY,
   *   runOrder: 5
   * };
   *
   * const shouldExecute = ModuleRunner.isModuleMatchingExecutionPhase(moduleItem, synthPhase);
   * // Returns true only if synthPhase is false (deploy phase)
   * ```
   *
   * @internal
   */
  private static isModuleMatchingExecutionPhase(
    moduleItem: AcceleratorModuleDetailsType,
    synthPhase: boolean,
  ): boolean {
    return (
      (synthPhase && moduleItem.executionPhase === ModuleExecutionPhase.SYNTH) ||
      (!synthPhase && moduleItem.executionPhase === ModuleExecutionPhase.DEPLOY)
    );
  }

  /**
   * Loads configuration for non-PREPARE stages to avoid redundant API calls.
   *
   * @description
   * Manages configuration loading optimization for the LZA pipeline. The PREPARE stage
   * loads configuration directly from AWS Organizations API, while all other stages
   * can share the same configuration data loaded from DynamoDB for efficiency.
   * This function ensures configuration is loaded only once for all non-PREPARE stages.
   *
   * @param stageItem - Current stage item being processed
   * @param runnerParameters - Runner parameters containing session context and config paths
   * @param acceleratorModuleRunnerParameters - Module runner parameters to update with loaded config
   * @param loadedNonPrepareStageConfig - Whether config has already been loaded for non-PREPARE stages
   * @param logPrefix - Logging prefix for operational visibility
   * @returns Updated loadedNonPrepareStageConfig flag indicating if config was loaded
   *
   * @example
   * ```typescript
   * let configLoaded = false;
   * for (const stageItem of stages) {
   *   configLoaded = await ModuleRunner.loadConfigurationForNonPrepareStages(
   *     stageItem,
   *     runnerParams,
   *     moduleRunnerParams,
   *     configLoaded,
   *     'XXXXX:us-east-1'
   *   );
   * }
   * ```
   *
   * @remarks
   * **Configuration Loading Strategy:**
   * - PREPARE stage: Uses Organizations API directly
   * - All other stages: Share DynamoDB-loaded configuration
   * - Respects ACCELERATOR_SKIP_DYNAMODB_LOOKUP environment variable
   *
   * @internal
   */
  private static async loadConfigurationForNonPrepareStages(
    stageItem: AcceleratorModuleStageDetailsType,
    runnerParameters: RunnerParametersType,
    acceleratorModuleRunnerParameters: AcceleratorModuleRunnerParametersType,
    loadedNonPrepareStageConfig: boolean,
    logPrefix: string,
  ): Promise<boolean> {
    if (stageItem.stage.name !== MODULE_SUPPORTED_STAGES.PREPARE) {
      // Load configuration once for all non-PREPARE stages to avoid redundant API calls.
      // PREPARE stage uses its own config loading (from Organizations API), while all other
      // stages share the same configuration data (loaded from DynamoDB for efficiency).
      if (loadedNonPrepareStageConfig) {
        logger.info(`Config already loaded for non ${MODULE_SUPPORTED_STAGES.PREPARE} stage`, logPrefix);
      } else {
        logger.info(`Loading configs for non ${MODULE_SUPPORTED_STAGES.PREPARE} stage`, logPrefix);
        runnerParameters.loadOrganizationsFromDynamoDbTable =
          process.env['ACCELERATOR_SKIP_DYNAMODB_LOOKUP'] !== 'true';
        acceleratorModuleRunnerParameters.configs = await ConfigLoader.getAcceleratorConfigurations(
          runnerParameters.sessionContext.partition,
          runnerParameters.configDirPath,
          acceleratorModuleRunnerParameters.resourcePrefixes,
          runnerParameters.loadOrganizationsFromDynamoDbTable,
          acceleratorModuleRunnerParameters.managementAccountCredentials,
        );
        return true; // Configuration has been loaded
      }
    }
    return loadedNonPrepareStageConfig;
  }

  /**
   * Processes all modules for a single stage and returns promise items for execution.
   *
   * @description
   * Handles the complete processing workflow for all modules within a single stage.
   * This includes module sorting, phase filtering, environment-based skipping,
   * central logging setup, and promise item construction. The function ensures
   * modules are processed in the correct order and only eligible modules are
   * prepared for execution.
   *
   * @param stageItem - Stage item containing modules to process
   * @param runnerParameters - Runner parameters with session context and configuration
   * @param acceleratorModuleRunnerParameters - Module runner parameters with loaded configurations
   * @param logPrefix - Logging prefix for operational visibility
   * @returns Array of promise items ready for parallel execution
   *
   * @example
   * ```typescript
   * const stageItem = {
   *   stage: { name: 'SECURITY', runOrder: 5 },
   *   modules: [
   *     { name: 'MacieModule', runOrder: 1, executionPhase: ModuleExecutionPhase.DEPLOY },
   *     { name: 'GuardDutyModule', runOrder: 2, executionPhase: ModuleExecutionPhase.DEPLOY }
   *   ]
   * };
   *
   * const promiseItems = await ModuleRunner.processStageModules(
   *   stageItem,
   *   runnerParams,
   *   moduleRunnerParams,
   *   'XXXXX:us-east-1'
   * );
   * // Returns promise items for eligible modules
   * ```
   *
   * @remarks
   * **Processing Steps:**
   * 1. Sort modules by run order
   * 2. Filter by execution phase (SYNTH vs DEPLOY)
   * 3. Check environment-based skipping
   * 4. Setup central logging resources
   * 5. Build promise items for execution
   *
   * **Central Logging Integration:**
   * - Reuses setupCentralLoggingIfNeeded for consistency
   * - Ensures logging resources are available before module execution
   *
   * @internal
   */
  private static async processStageModules(
    stageItem: AcceleratorModuleStageDetailsType,
    runnerParameters: RunnerParametersType,
    acceleratorModuleRunnerParameters: AcceleratorModuleRunnerParametersType,
    logPrefix: string,
  ): Promise<PromiseItemType[]> {
    logger.info(`Preparing to execute modules of stage "${stageItem.stage.name}"`, logPrefix);
    const sortedModuleItems = [...stageItem.modules].sort((a, b) => a.runOrder - b.runOrder);

    if (sortedModuleItems.length === 0) {
      logger.info(`No modules found for "${stageItem.stage.name}" stage`, logPrefix);
      return [];
    }

    const promiseItems: PromiseItemType[] = [];
    const synthPhase = process.env['CDK_OPTIONS'] === 'bootstrap';

    for (const sortedModuleItem of sortedModuleItems) {
      logger.info(`Execution started for module "${sortedModuleItem.name}"`, logPrefix);

      const isMatchingPhase = ModuleRunner.isModuleMatchingExecutionPhase(sortedModuleItem, synthPhase);

      if (!isMatchingPhase) {
        logger.info(
          `Skipping module "${sortedModuleItem.name}" as it is not part of ${synthPhase ? ModuleExecutionPhase.SYNTH : ModuleExecutionPhase.DEPLOY} phase`,
          logPrefix,
        );
        continue;
      }

      // Reuse the central logging setup logic from executeStageDependentModules
      await ModuleRunner.setupCentralLoggingIfNeeded(
        { ...runnerParameters, stage: stageItem.stage.name },
        acceleratorModuleRunnerParameters,
        sortedModuleItem,
        logPrefix,
      );

      if (!ModuleRunner.isModuleExecutionSkippedByEnvironment(sortedModuleItem.name, logPrefix)) {
        // Look up session policy for least-privilege enforcement
        const moduleSessionPolicy = getModuleSessionPolicy(sortedModuleItem.name);
        if (!moduleSessionPolicy) {
          logger.warn(
            `Module "${sortedModuleItem.name}" has no session policy declared in module-session-policies.ts. ` +
              `Cross-account credentials will not be scoped. Add a policy to enforce least privilege.`,
            logPrefix,
          );
        }

        const scopedModuleRunnerParameters = {
          ...acceleratorModuleRunnerParameters,
          ...(moduleSessionPolicy && {
            sessionPolicy: moduleSessionPolicy.policy,
          }),
        };

        const handler = ModuleRunner.wrapHandlerWithDiffOutput(
          sortedModuleItem,
          runnerParameters,
          scopedModuleRunnerParameters,
          stageItem.stage.runOrder,
        );
        promiseItems.push({
          runOrder: sortedModuleItem.runOrder,
          promise: handler,
        });
      }
    }

    return promiseItems;
  }

  /**
   * Wraps a module handler to write diff output after execution when --diff-output is set.
   */
  private static wrapHandlerWithDiffOutput(
    moduleItem: AcceleratorModuleDetailsType,
    runnerParameters: RunnerParametersType,
    moduleRunnerParameters: AcceleratorModuleRunnerParametersType,
    stageRunOrder: number,
  ): () => Promise<IModuleResponse> {
    const baseHandler = () =>
      moduleItem.handler({
        moduleItem,
        runnerParameters,
        moduleRunnerParameters,
      });

    if (!runnerParameters.diffOutputDir || !runnerParameters.dryRun) {
      return baseHandler;
    }

    return async () => {
      const response = await baseHandler();
      try {
        writeModuleDiffFile(runnerParameters.diffOutputDir!, stageRunOrder, response);
      } catch (err) {
        logger.warn(`Failed to write diff file for module "${moduleItem.name}": ${err}`, '');
      }
      return response;
    };
  }

  private static async executeStageDependentModules(
    params: RunnerParametersType,
    logPrefix: string,
  ): Promise<IModuleResponse[]> {
    // Validate stage configuration and get sorted modules
    const validationResult = ModuleRunner.validateStageConfigurationAndGetModules(params, logPrefix);
    if ('status' in validationResult[0]) {
      return validationResult as IModuleResponse[]; // Early return with IModuleResponse[]
    }

    const sortedModuleItems = validationResult as AcceleratorModuleDetailsType[];
    const acceleratorModuleRunnerParameters = await ModuleRunner.getModuleRunnerParameters(params, logPrefix);
    const synthPhase = process.env['CDK_OPTIONS'] === 'bootstrap';

    // Build promise items for execution
    const promiseItems = await ModuleRunner.buildPromiseItemsForModules(
      sortedModuleItems,
      synthPhase,
      params,
      acceleratorModuleRunnerParameters,
      logPrefix,
    );

    // Handle case where all modules were skipped
    if (promiseItems.length === 0) {
      const message = `All modules in "${params.stage}" stage were skipped (execution phase or environment variables)`;
      logger.info(message, logPrefix);
      return [
        {
          status: MODULE_STATE_CODE.SKIPPED,
          summary: message,
          timestamp: new Date().toISOString(),
          moduleName: `Stage-${params.stage}`,
          dryRun: params.dryRun,
        },
      ];
    }

    // Execute the stage modules
    return ModuleRunner.executeStageModules(promiseItems, params.stage!, logPrefix);
  }

  /**
   * Validates stage configuration and returns sorted modules or early return response.
   *
   * @description
   * Performs comprehensive validation of stage configuration and module availability.
   * This function handles multiple validation scenarios including missing stages,
   * duplicate stage entries, and empty module lists. It returns either a sorted
   * list of modules ready for execution or an appropriate response object for
   * early termination scenarios.
   *
   * @param params - Runner parameters containing the target stage name
   * @param logPrefix - Logging prefix for operational visibility
   * @returns Either sorted module items for execution or IModuleResponse array for early return
   *
   * @example
   * ```typescript
   * const params = {
   *   stage: 'SECURITY',
   *   sessionContext: { invokingAccountId: 'XXXXX', region: 'us-east-1' },
   *   // ... other params
   * };
   *
   * const result = ModuleRunner.validateStageConfigurationAndGetModules(params, 'XXXXX:us-east-1');
   * if ('status' in result[0]) {
   *   // Early return scenario - stage not found or no modules
   *   return result as IModuleResponse[];
   * }
   * // Normal execution - modules ready for processing
   * const modules = result as AcceleratorModuleDetailsType[];
   * ```
   *
   * @remarks
   * **Validation Scenarios:**
   * - **No stage found**: Returns SKIPPED response
   * - **Duplicate stages**: Throws error (configuration issue)
   * - **No modules**: Returns COMPLETED response
   * - **Valid stage**: Returns sorted modules by run order
   *
   * **Return Type Discrimination:**
   * Use `'status' in result[0]` to determine if result is IModuleResponse[] or modules
   *
   * @throws {Error} When duplicate stage entries are found in configuration
   *
   * @internal
   */
  private static validateStageConfigurationAndGetModules(
    params: RunnerParametersType,
    logPrefix: string,
  ): AcceleratorModuleDetailsType[] | IModuleResponse[] {
    const stageModuleItems = AcceleratorModuleStageDetails.filter(item => item.stage.name === params.stage);

    if (stageModuleItems.length === 0) {
      const message = `No stage configuration found for "${params.stage}" stage`;
      logger.warn(message, logPrefix);
      return [
        {
          status: MODULE_STATE_CODE.SKIPPED,
          summary: message,
          timestamp: new Date().toISOString(),
          moduleName: `Stage-${params.stage}`,
          dryRun: params.dryRun,
        },
      ];
    }

    if (stageModuleItems.length > 1) {
      throw new Error(
        `${MODULE_EXCEPTIONS.INVALID_INPUT} - duplicate entries found for stage ${params.stage} in AcceleratorModuleStageDetails`,
      );
    }

    const sortedModuleItems = [...stageModuleItems[0].modules].sort((a, b) => a.runOrder - b.runOrder);

    if (sortedModuleItems.length === 0) {
      const message = `No modules configured for "${params.stage}" stage`;
      logger.info(message, logPrefix);
      return [
        {
          status: MODULE_STATE_CODE.COMPLETED,
          summary: message,
          timestamp: new Date().toISOString(),
          moduleName: `Stage-${params.stage}`,
          dryRun: params.dryRun,
        },
      ];
    }

    return sortedModuleItems;
  }

  /**
   * Sets up central logging resources if needed for the module execution.
   *
   * @description
   * Ensures central logging resources (S3 bucket and KMS key) are available for module
   * execution. This function checks if logging resources are already configured and
   * fetches them from the log archive account if needed. Central logging is essential
   * for audit trails and operational visibility across the LZA deployment.
   *
   * @param params - Runner parameters containing session context and stage information
   * @param acceleratorModuleRunnerParameters - Module runner parameters to update with logging resources
   * @param sortedModuleItem - Current module item requiring logging resources
   * @param logPrefix - Logging prefix for operational visibility
   *
   * @example
   * ```typescript
   * const moduleItem = {
   *   name: 'SecurityModule',
   *   executionPhase: ModuleExecutionPhase.DEPLOY,
   *   runOrder: 5
   * };
   *
   * await ModuleRunner.setupCentralLoggingIfNeeded(
   *   runnerParams,
   *   moduleRunnerParams,
   *   moduleItem,
   *   'XXXXX:us-east-1'
   * );
   *
   * // moduleRunnerParams.logging now contains bucketName and bucketKeyArn
   * ```
   *
   * @remarks
   * **Resource Discovery:**
   * - Fetches central log bucket name from log archive account
   * - Retrieves KMS key ARN from SSM parameter store
   * - Handles both standard and imported bucket configurations
   *
   * **Performance Optimization:**
   * - Only fetches resources if not already configured
   * - Caches resources in acceleratorModuleRunnerParameters for reuse
   *
   * @internal
   */
  private static async setupCentralLoggingIfNeeded(
    params: RunnerParametersType,
    acceleratorModuleRunnerParameters: AcceleratorModuleRunnerParametersType,
    sortedModuleItem: AcceleratorModuleDetailsType,
    logPrefix: string,
  ): Promise<void> {
    if (
      !acceleratorModuleRunnerParameters.logging.bucketKeyArn ||
      !acceleratorModuleRunnerParameters.logging.bucketName
    ) {
      const stageName = params.stage!;
      const centralLoggingResources = await ModuleRunner.getCentralLoggingResources({
        partition: params.sessionContext.partition,
        solutionId: params.solutionId,
        centralizedLoggingRegion: acceleratorModuleRunnerParameters.logging.centralizedRegion,
        acceleratorResourceNames: acceleratorModuleRunnerParameters.acceleratorResourceNames,
        globalConfig: acceleratorModuleRunnerParameters.configs.globalConfig,
        accountsConfig: acceleratorModuleRunnerParameters.configs.accountsConfig,
        stage: {
          name: stageName,
          runOrder: ModuleRunner.getStageRunOrder(stageName, logPrefix),
          module: { name: sortedModuleItem.name, executionPhase: sortedModuleItem.executionPhase },
        },
        managementAccountCredentials: acceleratorModuleRunnerParameters.managementAccountCredentials,
      });

      if (centralLoggingResources) {
        acceleratorModuleRunnerParameters.logging.bucketName = centralLoggingResources.bucketName;
        acceleratorModuleRunnerParameters.logging.bucketKeyArn = centralLoggingResources.keyArn;
      }
    }
  }

  /**
   * Builds promise items for module execution based on phase and environment conditions.
   *
   * @description
   * Creates executable promise items for stage-dependent module execution. This function
   * processes modules through phase filtering, environment-based skipping, central logging
   * setup, and promise construction. It's specifically designed for single-stage execution
   * where all modules belong to the same stage.
   *
   * @param sortedModuleItems - Pre-sorted module items ready for processing
   * @param synthPhase - Whether currently in synthesis phase (true) or deploy phase (false)
   * @param params - Runner parameters containing session context and stage information
   * @param acceleratorModuleRunnerParameters - Module runner parameters with loaded configurations
   * @param logPrefix - Logging prefix for operational visibility
   * @returns Array of promise items ready for parallel execution
   *
   * @example
   * ```typescript
   * const sortedModules = [
   *   { name: 'MacieModule', runOrder: 1, executionPhase: ModuleExecutionPhase.DEPLOY },
   *   { name: 'GuardDutyModule', runOrder: 2, executionPhase: ModuleExecutionPhase.DEPLOY }
   * ];
   *
   * const synthPhase = process.env['CDK_OPTIONS'] === 'bootstrap';
   * const promiseItems = await ModuleRunner.buildPromiseItemsForModules(
   *   sortedModules,
   *   synthPhase,
   *   runnerParams,
   *   moduleRunnerParams,
   *   'XXXXX:us-east-1'
   * );
   * // Returns promise items for eligible modules
   * ```
   *
   * @remarks
   * **Processing Pipeline:**
   * 1. Phase matching validation
   * 2. Environment-based skipping check
   * 3. Central logging resource setup
   * 4. Promise item construction with proper run order
   *
   * **Run Order Handling:**
   * - SYNTH phase: All modules use run order 1 (parallel execution)
   * - DEPLOY phase: Uses original module run order (dependency-aware)
   *
   * @internal
   */
  private static async buildPromiseItemsForModules(
    sortedModuleItems: AcceleratorModuleDetailsType[],
    synthPhase: boolean,
    params: RunnerParametersType,
    acceleratorModuleRunnerParameters: AcceleratorModuleRunnerParametersType,
    logPrefix: string,
  ): Promise<PromiseItemType[]> {
    const promiseItems: PromiseItemType[] = [];

    logger.info(`Executing modules for stage "${params.stage}"`, logPrefix);

    for (const sortedModuleItem of sortedModuleItems) {
      const isMatchingPhase = ModuleRunner.isModuleMatchingExecutionPhase(sortedModuleItem, synthPhase);

      if (!isMatchingPhase) {
        logger.info(
          `Skipping module "${sortedModuleItem.name}" as it is not part of ${
            synthPhase ? ModuleExecutionPhase.SYNTH : ModuleExecutionPhase.DEPLOY
          } phase`,
          logPrefix,
        );
        continue;
      }

      if (!ModuleRunner.isModuleExecutionSkippedByEnvironment(sortedModuleItem.name, logPrefix)) {
        logger.info(`Module "${sortedModuleItem.name}" added for execution.`, logPrefix);

        await ModuleRunner.setupCentralLoggingIfNeeded(
          params,
          acceleratorModuleRunnerParameters,
          sortedModuleItem,
          logPrefix,
        );

        // Look up session policy for least-privilege enforcement
        const moduleSessionPolicy = getModuleSessionPolicy(sortedModuleItem.name);
        if (!moduleSessionPolicy) {
          logger.warn(
            `Module "${sortedModuleItem.name}" has no session policy declared. Cross-account credentials will not be scoped.`,
            logPrefix,
          );
        }

        const scopedModuleRunnerParameters = {
          ...acceleratorModuleRunnerParameters,
          ...(moduleSessionPolicy && {
            sessionPolicy: moduleSessionPolicy.policy,
          }),
        };

        const stageRunOrder = params.stage
          ? (AcceleratorModuleStageDetails.find(s => s.stage.name === params.stage)?.stage.runOrder ?? 0)
          : 0;
        const handler = ModuleRunner.wrapHandlerWithDiffOutput(
          sortedModuleItem,
          params,
          scopedModuleRunnerParameters,
          stageRunOrder,
        );

        promiseItems.push({
          runOrder: synthPhase ? 1 : sortedModuleItem.runOrder,
          promise: handler,
        });
      }
    }

    return promiseItems;
  }

  /**
   * Executes stage modules and returns the execution results.
   *
   * @description
   * Orchestrates the final execution of stage modules with comprehensive logging
   * and result aggregation. This function provides a clean interface for executing
   * prepared promise items while maintaining operational visibility through
   * structured logging.
   *
   * @param promiseItems - Promise items ready for execution, pre-sorted by run order
   * @param stageName - Name of the stage being executed for logging context
   * @param logPrefix - Logging prefix for operational visibility
   * @returns Array of module execution responses with status, timing, and error information
   *
   * @example
   * ```typescript
   * const promiseItems = [
   *   {
   *     runOrder: 1,
   *     promise: () => macieModule.execute(params)
   *   },
   *   {
   *     runOrder: 2,
   *     promise: () => guardDutyModule.execute(params)
   *   }
   * ];
   *
   * const results = await ModuleRunner.executeStageModules(
   *   promiseItems,
   *   'SECURITY',
   *   'XXXXX:us-east-1'
   * );
   * // Returns execution results for all modules
   * ```
   *
   * @remarks
   * **Execution Flow:**
   * 1. Logs execution start for operational visibility
   * 2. Delegates to executePromises for parallel execution management
   * 3. Logs execution completion
   * 4. Returns aggregated results
   *
   * **Result Structure:**
   * Each result contains status, summary, timestamp, module name, and error details
   *
   * @internal
   */
  private static async executeStageModules(
    promiseItems: PromiseItemType[],
    stageName: string,
    logPrefix: string,
  ): Promise<IModuleResponse[]> {
    logger.processStart(`Execution started for modules of stage "${stageName}"`, logPrefix);
    const statuses = await ModuleRunner.executePromises(promiseItems, logPrefix);
    logger.processEnd(`Execution completed for modules of stage "${stageName}"`, logPrefix);

    return statuses;
  }

  private static async executePromises(promiseItems: PromiseItemType[], logPrefix: string): Promise<IModuleResponse[]> {
    const statuses: IModuleResponse[] = [];
    const groupedPromiseItems = ModuleRunner.groupPromisesByRunOrder(promiseItems);

    for (const groupByPromiseItem of groupedPromiseItems) {
      const promises = Array.isArray(groupByPromiseItem.promises)
        ? groupByPromiseItem.promises
        : [groupByPromiseItem.promises];

      // Execute all promises with the same runOrder in parallel
      const batchResults = await Promise.all(promises.map(promise => promise()));

      // Check if any module in this batch failed
      const hasError = batchResults.some(result => result.error);

      if (hasError) {
        statuses.push(...batchResults);

        const failedResults = batchResults.filter(result => result.error);
        const failedModules = failedResults
          .map(
            result =>
              `Module "${result.moduleName}" (Status: ${result.status}) ` +
              `failed with ${result.error?.name}: ${result.error?.message}`,
          )
          .join('\n  - ');

        logger.error(
          `Module execution failed in run order ${groupByPromiseItem.order}. ` +
            `${failedResults.length} of ${batchResults.length} modules failed:\n  - ${failedModules}`,
          logPrefix,
        );

        throw new Error(`${failedResults.length} modules failed in run order ${groupByPromiseItem.order}`);
      }

      // If no errors, add results and continue to next runOrder
      statuses.push(...batchResults);
    }

    return statuses;
  }

  private static groupStagesByRunOrder(stageItems: AcceleratorModuleStageDetailsType[]): GroupedStagesByRunOrderType[] {
    const groupedMap = stageItems.reduce((acc, curr) => {
      const runOrder = curr.stage.runOrder;
      if (!acc.has(runOrder)) {
        acc.set(runOrder, []);
      }
      acc.get(runOrder)!.push(curr);
      return acc;
    }, new Map<number, AcceleratorModuleStageDetailsType[]>());

    const result: GroupedStagesByRunOrderType[] = Array.from(groupedMap.entries()).map(([runOrder, stages]) => ({
      order: runOrder,
      stages: stages,
    }));

    return result.sort((a, b) => a.order - b.order);
  }

  private static groupPromisesByRunOrder(promiseItems: PromiseItemType[]): GroupedPromisesByRunOrderType[] {
    const groupedMap = promiseItems.reduce((map, { runOrder, promise }) => {
      if (!map.has(runOrder)) {
        map.set(runOrder, []);
      }
      map.get(runOrder)!.push(promise);
      return map;
    }, new Map<number, Array<() => Promise<IModuleResponse>>>());

    return Array.from(groupedMap, ([order, promises]) => ({
      order,
      promises: promises.length === 1 ? promises[0] : promises,
    }));
  }

  private static getStageRunOrder(stageName: string, logPrefix: string): number {
    const stageItem = AcceleratorModuleStageDetails.find(
      (stage: AcceleratorModuleStageDetailsType) => stage.stage.name === stageName,
    );

    if (!stageItem) {
      logger.error(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: Stage ${stageName} not found in AcceleratorModuleStageDetails.`,
        logPrefix,
      );
      throw new Error(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: Stage ${stageName} not found in AcceleratorModuleStageDetails.`,
      );
    }

    return stageItem.stage.runOrder;
  }

  private static async getManagementAccountCredentials(
    partition: string,
    region: string,
    solutionId: string,
    logPrefix: string,
  ): Promise<IAssumeRoleCredential | undefined> {
    if (process.env['MANAGEMENT_ACCOUNT_ID'] && process.env['MANAGEMENT_ACCOUNT_ROLE_NAME']) {
      logger.info('set management account credentials', logPrefix);
      logger.info(`managementAccountId => ${process.env['MANAGEMENT_ACCOUNT_ID']}`, logPrefix);
      logger.info(`management account role name => ${process.env['MANAGEMENT_ACCOUNT_ROLE_NAME']}`, logPrefix);

      const assumeRoleArn = `arn:${partition}:iam::${process.env['MANAGEMENT_ACCOUNT_ID']}:role/${process.env['MANAGEMENT_ACCOUNT_ROLE_NAME']}`;

      return getCredentials({
        accountId: process.env['MANAGEMENT_ACCOUNT_ID'],
        region,
        logPrefix: `Invoker:${region}`,
        solutionId,
        assumeRoleArn,
        sessionName: 'ManagementAccountCredentials',
      });
    }

    return undefined;
  }

  /**
   * Loads organization accounts from DynamoDB table or Organizations API.
   *
   * @description
   * Conditionally loads organization accounts based on the loadOrganizationsFromDynamoDbTable flag:
   * - When true: Loads from DynamoDB table (for non-PREPARE stages)
   * - When false: Loads from Organizations API (for PREPARE stage)
   *
   * @param props - Configuration for loading organization accounts
   * @param props.organizationEnabled - Whether AWS Organizations is enabled
   * @param props.loadOrganizationsFromDynamoDbTable - Whether to load from DynamoDB or Organizations API
   * @param props.resourcePrefixes - Accelerator resource prefixes for SSM parameter names
   * @param props.globalRegion - Global region for Organizations API calls
   * @param props.homeRegion - Home region for DynamoDB table and SSM parameter lookups
   * @param props.solutionId - Solution identifier for user agent
   * @param props.managementAccountCredentials - Optional credentials for cross-account access
   * @param props.logPrefix - Logging prefix for operational visibility
   * @returns Promise resolving to array of organization accounts
   *
   * @internal
   */
  private static async loadOrganizationAccounts(props: {
    organizationEnabled: boolean;
    loadOrganizationsFromDynamoDbTable: boolean;
    resourcePrefixes: AcceleratorResourcePrefixes;
    globalRegion: string;
    homeRegion: string;
    solutionId: string;
    managementAccountCredentials?: IAssumeRoleCredential;
    logPrefix: string;
  }): Promise<Account[]> {
    const organizationAccounts: Account[] = [];

    if (!props.organizationEnabled) {
      return organizationAccounts;
    }

    if (props.loadOrganizationsFromDynamoDbTable) {
      // Load from DynamoDB table for non-PREPARE stages
      logger.info('Loading organization accounts from DynamoDB table', props.logPrefix);

      const tableName = await getOrganizationSourceTableName(
        props.resourcePrefixes.ssmParamName,
        props.homeRegion,
        props.logPrefix,
        props.solutionId,
        props.managementAccountCredentials,
      );
      const dynamoDbClient = new DynamoDBClient({
        region: props.homeRegion,
        customUserAgent: props.solutionId,
        retryStrategy: setRetryStrategy(),
        credentials: props.managementAccountCredentials,
      });

      organizationAccounts.push(
        ...(await getOrganizationAccountsFromSourceTable({
          client: dynamoDbClient,
          organizationsDataSource: {
            tableName,
            filters: [
              {
                name: 'commitId',
                value: process.env['CONFIG_COMMIT_ID'] ?? '',
              },
              {
                name: 'awsKey',
                operator: DynamoDBFilterOperator.ATTRIBUTE_EXISTS,
              },
            ],
            filterOperator: 'AND',
          },
          logPrefix: props.logPrefix,
        })),
      );

      logger.info(`Loaded ${organizationAccounts.length} accounts from DynamoDB`, props.logPrefix);
    } else {
      // Load from Organizations API for PREPARE stage
      logger.info('Loading organization accounts from Organizations API', props.logPrefix);
      organizationAccounts.push(
        ...(await getOrganizationAccounts(props.logPrefix, undefined, {
          region: props.globalRegion,
          customUserAgent: props.solutionId,
          credentials: props.managementAccountCredentials,
        })),
      );
    }

    return organizationAccounts;
  }

  private static async getAcceleratorModuleRunnerParameters(props: {
    configDirPath: string;
    partition: string;
    globalRegion: string;
    resourcePrefixes: AcceleratorResourcePrefixes;
    solutionId: string;
    loadOrganizationsFromDynamoDbTable: boolean;
    logPrefix: string;
    managementAccountCredentials?: IAssumeRoleCredential;
  }): Promise<AcceleratorModuleRunnerParametersType> {
    const acceleratorConfigurations = await ConfigLoader.getAcceleratorConfigurations(
      props.partition,
      props.configDirPath,
      props.resourcePrefixes,
      props.loadOrganizationsFromDynamoDbTable,
      props.managementAccountCredentials,
    );

    //
    // Get Centralized logging region
    //
    const centralizedLoggingRegion =
      acceleratorConfigurations.globalConfig.logging.centralizedLoggingRegion ??
      acceleratorConfigurations.globalConfig.homeRegion;

    //
    // Get Accelerator resource names
    //
    const acceleratorResourceNames = new AcceleratorResourceNames({
      prefixes: props.resourcePrefixes,
      centralizedLoggingRegion,
    });

    //
    // Get Organization accounts
    //
    const organizationAccounts = await ModuleRunner.loadOrganizationAccounts({
      organizationEnabled: acceleratorConfigurations.organizationConfig.enable,
      loadOrganizationsFromDynamoDbTable: props.loadOrganizationsFromDynamoDbTable,
      resourcePrefixes: props.resourcePrefixes,
      globalRegion: props.globalRegion,
      homeRegion: acceleratorConfigurations.globalConfig.homeRegion,
      solutionId: props.solutionId,
      managementAccountCredentials: props.managementAccountCredentials,
      logPrefix: props.logPrefix,
    });

    const organizationDetails = await getOrganizationDetails(props.logPrefix, undefined, {
      region: props.globalRegion,
      customUserAgent: props.solutionId,
      credentials: props.managementAccountCredentials,
    });

    if (acceleratorConfigurations.organizationConfig.enable && !organizationDetails) {
      throw new Error(
        `AWS Organizations not configured but organization is enabled in organization-config.yaml file !!!`,
      );
    }

    return {
      configs: acceleratorConfigurations,
      resourcePrefixes: props.resourcePrefixes,
      acceleratorResourceNames,
      logging: {
        centralizedRegion: centralizedLoggingRegion,
        bucketName: undefined,
        bucketKeyArn: undefined,
      },
      organizationAccounts,
      organizationDetails,
      managementAccountCredentials: props.managementAccountCredentials,
      // Resolve the cross-account role using the same precedence as the CDK deploy path
      // (see security-resources-stack.ts): useManagementAccessRole takes precedence, then a
      // configured customDeploymentRole, otherwise managementAccountAccessRole. This keeps module
      // cross-account operations aligned with the role the rest of LZA uses.
      accountAccessRoleName: acceleratorConfigurations.globalConfig.cdkOptions?.useManagementAccessRole
        ? acceleratorConfigurations.globalConfig.managementAccountAccessRole
        : (acceleratorConfigurations.globalConfig.cdkOptions?.customDeploymentRole ??
          acceleratorConfigurations.globalConfig.managementAccountAccessRole),
    };
  }

  private static async getCentralLoggingResources(props: {
    partition: string;
    solutionId: string;
    centralizedLoggingRegion: string;
    acceleratorResourceNames: AcceleratorResourceNames;
    globalConfig: GlobalConfig;
    accountsConfig: AccountsConfig;
    stage: {
      name: string;
      runOrder: number;
      module: {
        name: string;
        executionPhase: ModuleExecutionPhase;
      };
    };
    managementAccountCredentials?: IAssumeRoleCredential;
  }): Promise<{ bucketName: string; keyArn: string } | undefined> {
    const logArchiveAccountId = props.accountsConfig.getLogArchiveAccountId();
    const logPrefix = `${logArchiveAccountId}:${props.centralizedLoggingRegion}`;

    if (props.stage.runOrder <= AcceleratorModuleStageOrders.logging.runOrder) {
      logger.info(
        `Central Logging resources are not required to be fetched for ${props.stage.module.name} module of ${props.stage.name} stage.`,
        logPrefix,
      );
      return undefined;
    }

    if (props.stage.module.executionPhase === ModuleExecutionPhase.SYNTH) {
      logger.info(
        `Central Logging resources are not required to be fetched for ${props.stage.module.name} module of ${props.stage.name} stage, because module execution phase is ${props.stage.module.executionPhase}`,
        logPrefix,
      );

      return undefined;
    }

    logger.info(
      `Fetching Central Logging resources for ${props.stage.module.name} module of ${props.stage.name} stage.`,
      logPrefix,
    );

    //
    // Get Central log bucket name
    //
    const centralLogBucketName = ModuleRunner.getCentralLogBucketName(
      props.centralizedLoggingRegion,
      props.acceleratorResourceNames,
      {
        accountId: props.accountsConfig.getLogArchiveAccountId(),
        accountName: props.accountsConfig.getLogArchiveAccount().name,
        region: props.centralizedLoggingRegion,
      },
      props.globalConfig,
      props.accountsConfig,
    );

    // The central log bucket CMK ARN is stored under different SSM parameter names depending on
    // whether the central log bucket is imported. The logging stack (createOrGetCentralLogsBucket)
    // writes the ARN to `importedCentralLogBucketCmkArn` for ANY imported central log bucket and to
    // `centralLogBucketCmkArn` only for an accelerator-created bucket. The selection therefore must
    // key off the presence of an imported bucket — NOT `createAcceleratorManagedKey`. Using
    // `createAcceleratorManagedKey` causes an imported bucket without an accelerator-managed key to
    // read the (never-created) `centralLogBucketCmkArn` parameter, yielding ParameterNotFound and an
    // undefined logging bucket. This matches getCentralLogBucketKmsKeyArn in app-utils.ts and
    // getCentralLogsBucketKey in accelerator-stack.ts.
    let ssmParamName = props.acceleratorResourceNames.parameters.centralLogBucketCmkArn;
    if (props.globalConfig.logging.centralLogBucket?.importedBucket?.name) {
      ssmParamName = props.acceleratorResourceNames.parameters.importedCentralLogBucketCmkArn;
    }

    const credentials = await getCredentials({
      accountId: logArchiveAccountId,
      region: props.centralizedLoggingRegion,
      logPrefix,
      solutionId: props.solutionId,
      partition: props.partition,
      assumeRoleName:
        props.globalConfig.cdkOptions.customDeploymentRole ?? props.globalConfig.managementAccountAccessRole,
      credentials: props.managementAccountCredentials,
    });

    const client: SSMClient = new SSMClient({
      region: props.centralizedLoggingRegion,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials,
    });

    try {
      const response = await throttlingBackOff(() => client.send(new GetParameterCommand({ Name: ssmParamName })));
      if (!response.Parameter) {
        logger.error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: GetParameter response missing Parameter object for ${ssmParamName} in region ${props.centralizedLoggingRegion}`,
          logPrefix,
        );
        throw new Error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Parameter response is malformed: missing Parameter object for ${ssmParamName}`,
        );
      }

      if (!response.Parameter.Value) {
        logger.error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Parameter ${ssmParamName} exists but has no value in region ${props.centralizedLoggingRegion}`,
          logPrefix,
        );
        throw new Error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Parameter ${ssmParamName} exists but contains no value`,
        );
      }
      return { bucketName: centralLogBucketName, keyArn: response.Parameter.Value };
    } catch (e: unknown) {
      if (e instanceof ParameterNotFound) {
        logger.warn(
          `Central Logs bucket CMK arn SSM parameter ${ssmParamName} not found in region ${props.centralizedLoggingRegion}`,
          logPrefix,
        );
        return undefined;
      }
      throw e;
    }
  }

  private static getCentralLogBucketName(
    centralizedLoggingRegion: string,
    acceleratorResourceNames: AcceleratorResourceNames,
    env: AcceleratorEnvironmentDetailsType,
    globalConfig: GlobalConfig,
    accountsConfig: AccountsConfig,
  ): string {
    if (globalConfig.logging.centralLogBucket?.importedBucket) {
      const name = globalConfig.logging.centralLogBucket.importedBucket.name;
      return name.replace('${REGION}', env.region.replace('${ACCOUNT_ID}', env.accountId));
    }
    return `${
      acceleratorResourceNames.bucketPrefixes.centralLogs
    }-${accountsConfig.getLogArchiveAccountId()}-${centralizedLoggingRegion}`;
  }

  private static isModuleExecutionSkippedByEnvironment(moduleName: string, logPrefix: string): boolean {
    if (!EXECUTION_CONTROLLABLE_MODULES.includes(moduleName)) {
      return false;
    }

    const constantCaseVarName = constantCase(`skip-${moduleName}`) + '_MODULE';
    const pascalCaseVarName = pascalCase(`skip-${moduleName}`);
    const environmentVariableNames = [constantCaseVarName, pascalCaseVarName];

    const matchedVarName = environmentVariableNames.find(varName => process.env[varName]?.toLowerCase() === 'true');

    if (matchedVarName) {
      statusLogger.warn(
        `Module ${moduleName} skipped by environment variable settings. To enable the module execution, set the environment variable ${matchedVarName} to false (case insensitive) in your execution environment.`,
        logPrefix,
      );
      return true;
    }
    statusLogger.info(
      `Module ${moduleName} will be executed. Module execution can be skipped by setting environment variable ${constantCaseVarName} to true (case insensitive) in your execution environment. Removing the variable will enable module execution. Contact AWS Support prior to making changes to the module's default settings.`,
      logPrefix,
    );
    return false;
  }
}

/**
 * Command-line usage instructions for the LZA module runner.
 *
 * @description
 * Provides complete usage syntax and parameter documentation for the LZA module runner
 * command-line interface. Used for help text, error messages, and documentation when
 * invalid parameters are provided or help is requested.
 *
 * The usage string includes all required and optional parameters with their expected
 * formats and provides guidance for proper command construction.
 *
 * @constant
 * @type {string}
 *
 * @example
 * ```bash
 * # Basic usage with required parameters
 * yarn run lza --config-dir ./config
 *
 * # Full parameter specification
 * yarn run lza --config-dir ./config \
 *   --partition aws \
 *   --account-id XXXXXXXXXXXX \
 *   --region us-east-1 \
 *   --stage ORGANIZATIONS \
 *   --accelerator-prefix MyLZA \
 *   --dry-run \
 *   --verbose
 * ```
 *
 * @remarks
 * **Parameter Descriptions:**
 * - `--config-dir`: **Required** - Path to LZA configuration directory
 * - `--partition`: Optional - AWS partition (aws, aws-cn, aws-us-gov)
 * - `--account-id`: Optional - Specific account ID for execution context
 * - `--region`: Optional - AWS region for execution
 * - `--stage`: Optional - Specific pipeline stage to execute
 * - `--accelerator-prefix`: Optional - Custom resource naming prefix
 * - `--dry-run`: Optional - Perform validation without making changes
 * - `--verbose`: Optional - Enable detailed logging output
 */
export const scriptUsage =
  'Usage: yarn run lza --config-dir <CONFIG_DIR_PATH> [--partition <PARTITION>] [--account-id <ACCOUNT_ID>] [--region <REGION>] [--stage <PIPELINE_STAGE_NAME>] [--accelerator-prefix <ACCELERATOR_PREFIX>] [--dry-run] [--diff-output <DIR>] [--verbose]';

/**
 * Validates command-line arguments and constructs runner parameters for module execution.
 *
 * @description
 * This function processes command-line arguments using yargs, validates required parameters,
 * and constructs a complete RunnerParametersType object for module execution. It handles
 * parameter defaults, session context initialization, and environment-specific configuration.
 *
 * The function performs comprehensive validation of input parameters and establishes
 * the execution context including AWS session details, configuration paths, and
 * operational settings like dry-run mode and organization loading preferences.
 *
 * @async
 * @function validateAndGetRunnerParameters
 *
 * @returns {Promise<RunnerParametersType>} Promise resolving to validated runner parameters
 * @returns {Object} returns.sessionContext - AWS session context with account and region details
 * @returns {string} returns.configDirPath - Validated path to configuration directory
 * @returns {string} [returns.stage] - Optional specific stage to execute
 * @returns {string} returns.prefix - Accelerator resource prefix for naming
 * @returns {string} returns.solutionId - Solution identifier for tracking
 * @returns {boolean} returns.dryRun - Whether to perform dry run execution
 * @returns {boolean} returns.loadOrganizationsFromDynamoDbTable - Organization loading preference
 *
 * @throws {Error} When required config-dir parameter is missing
 * @throws {Error} When AWS session context cannot be established
 * @throws {Error} When configuration directory is invalid or inaccessible
 *
 * @example
 * ```typescript
 * // Validate and get parameters from command line
 * try {
 *   const runnerParams = await validateAndGetRunnerParameters();
 *
 *   // Use validated parameters for execution
 *   const results = await ModuleRunner.execute(runnerParams);
 * } catch (error) {
 *   if (error.message.includes('Missing required config-dir')) {
 *     // Handle missing required parameter
 *   } else {
 *     // Handle other validation errors
 *   }
 * }
 * ```
 *
 * @example
 * ```bash
 * # Command-line examples that this function processes
 *
 * # Minimal required parameters
 * yarn run lza --config-dir ./config
 *
 * # With optional parameters
 * yarn run lza --config-dir ./config --region us-west-2 --dry-run
 *
 * # Stage-specific execution
 * yarn run lza --config-dir ./config --stage ORGANIZATIONS
 *
 * # Custom prefix
 * yarn run lza --config-dir ./config --accelerator-prefix MyCompanyLZA
 * ```
 *
 * @remarks
 * **Parameter Processing:**
 * - Uses yargs for robust command-line argument parsing
 * - Provides sensible defaults for optional parameters
 * - Validates required parameters and throws descriptive errors
 * - Establishes AWS session context automatically
 *
 * **Environment Integration:**
 * - Respects ACCELERATOR_SKIP_DYNAMODB_LOOKUP environment variable
 * - Automatically determines organization loading strategy
 * - Integrates with AWS credential chain for session establishment
 *
 * **Special Handling:**
 * - PREPARE stage automatically disables DynamoDB organization loading
 * - Solution ID is constructed from package version
 * - Session context includes partition and region detection
 */
export async function validateAndGetRunnerParameters(): Promise<RunnerParametersType> {
  const argv = yargs(process.argv.slice(2))
    .options({
      partition: { type: 'string', default: undefined },
      region: { type: 'string', default: undefined },
      'accelerator-prefix': { type: 'string', default: undefined },
      'config-dir': { type: 'string', default: undefined },
      stage: { type: 'string', default: undefined },
      'dry-run': { type: 'boolean', default: false },
      'diff-output': { type: 'string', default: undefined },
    })
    .parseSync();

  if (!argv['config-dir']) {
    throw new Error(`Missing required config-dir parameter \n ** Script Usage ** ${scriptUsage}`);
  }

  const dryRun = Boolean(argv['dry-run']);
  const diffOutputDir = argv['diff-output'];
  if (diffOutputDir && !dryRun) {
    throw new Error(`--diff-output requires --dry-run. Diff output can only be generated during a dry run.`);
  }
  const configDirPath = argv['config-dir'];
  const stage = argv.stage;
  const acceleratorPrefix = argv['accelerator-prefix'] ?? 'AWSAccelerator';
  const solutionId = `AwsSolution/SO0199/${version}`;
  let loadOrganizationsFromDynamoDbTable = process.env['ACCELERATOR_SKIP_DYNAMODB_LOOKUP'] !== 'true';
  if (!stage || stage === AcceleratorStage.PREPARE) {
    loadOrganizationsFromDynamoDbTable = false;
  }

  // Get Current Session detail
  const sessionContext = await getCurrentSessionDetails({ region: argv.region, solutionId, logPrefix: `Invoker` });

  return {
    sessionContext,
    configDirPath,
    stage,
    prefix: acceleratorPrefix,
    solutionId,
    dryRun,
    diffOutputDir,
    loadOrganizationsFromDynamoDbTable,
  };
}

/**
 * Main execution function that orchestrates the complete LZA module execution workflow.
 *
 * @description
 * This function serves as the primary entry point for LZA module execution, coordinating
 * the complete workflow from parameter validation through result reporting. It handles
 * environment-based execution control, parameter validation, module execution, and
 * comprehensive result aggregation.
 *
 * The function provides a complete execution wrapper that:
 * - Checks for execution bypass via environment variables
 * - Validates and processes command-line parameters
 * - Executes the module runner with proper error handling
 * - Aggregates and formats execution results
 * - Returns comprehensive execution summary
 *
 * @async
 * @function main
 *
 * @returns {Promise<string>} Promise resolving to execution summary string
 *
 * @throws {Error} When parameter validation fails
 * @throws {Error} When module execution encounters unrecoverable errors
 * @throws {Error} When configuration loading fails
 *
 * @example
 * ```typescript
 * // Direct function usage (typically called by CLI wrapper)
 * try {
 *   const executionSummary = await main();
 *   // executionSummary contains formatted results from all executed modules
 * } catch (error) {
 *   // Handle execution errors
 * }
 * ```
 *
 * @example
 * ```bash
 * # Environment variable control
 * export USE_LZA_MODULES=no  # Skips all module execution
 * yarn run lza --config-dir ./config
 * # Output: "Skipping execution of LZA Modules"
 * ```
 *
 * @remarks
 * **Environment Controls:**
 * - `USE_LZA_MODULES=no`: Completely bypasses module execution
 * - Useful for testing, debugging, or emergency scenarios
 *
 * **Result Processing:**
 * - Aggregates results from all executed modules
 * - Formats summaries into readable execution report
 * - Preserves individual module status and error information
 *
 * **Error Handling:**
 * - Catches and processes all execution errors
 * - Provides detailed error context for troubleshooting
 * - Ensures proper cleanup and resource management
 */
async function main(): Promise<string> {
  // Wait for CloudWatch logging initialization to complete before any logging occurs
  // This ensures all logs (including early module initialization logs) go to CloudWatch
  await waitForLoggerInitialization();

  //validate and get runner parameters
  const runnerParams = await validateAndGetRunnerParameters();

  const response = await ModuleRunner.execute(runnerParams);

  return response.map(item => item.summary).join('\n');
}

/**
 * Immediately invoked async function expression (IIFE) for main execution workflow.
 *
 * @description
 * Wraps the main function execution in comprehensive error handling and logging,
 * ensuring that any errors during execution are properly logged and re-thrown
 * for process termination. This provides a clean separation between execution
 * logic and error handling while maintaining proper process exit behavior.
 *
 * The IIFE pattern ensures that:
 * - Async execution is properly handled at the top level
 * - Errors are caught and logged with appropriate detail
 * - Process termination occurs with proper error codes
 * - Status logging provides operational visibility
 * - Execution is skipped during testing to prevent interference
 *
 * @example
 * ```typescript
 * // This IIFE executes automatically when the module is loaded
 * // It handles the complete execution workflow:
 * // 1. Calls main() function
 * // 2. Logs successful completion status
 * // 3. Catches and logs any errors
 * // 4. Re-throws errors for process termination
 * ```
 *
 * @remarks
 * **Error Handling Strategy:**
 * - Catches all errors from main execution
 * - Logs errors using status logger for visibility
 * - Re-throws errors to ensure proper process exit codes
 * - Handles both Error instances and unknown error types
 *
 * **Logging Integration:**
 * - Uses status logger for execution completion
 * - Provides structured error logging for monitoring
 * - Ensures operational visibility of execution state
 *
 * **Test Environment Handling:**
 * - Skips execution when NODE_ENV is 'test' to prevent test interference
 * - Allows proper test isolation and module mocking
 */
(async () => {
  // Skip execution during testing to prevent interference with test setup
  if (process.env['NODE_ENV'] === 'test') {
    return;
  }

  try {
    const status = await main();
    statusLogger.info(status);
    // Flush all CloudWatch log transports before process exits
    // This ensures final logs (module response, state saved, completion) are sent to CloudWatch
    await flushLoggers();
    // Exit cleanly after successful execution
    process.exit(0);
  } catch (error: unknown) {
    if (error instanceof Error) {
      statusLogger.error(error.message);
      // Flush error logs to CloudWatch before process terminates
      await flushLoggers();
      throw error;
    }
  }
})();

/**
 * Global unhandled promise rejection handler for process stability.
 *
 * @description
 * Provides a critical safety net for unhandled promise rejections that could
 * otherwise cause the process to hang or terminate unexpectedly. This handler
 * ensures that any unhandled rejections are logged and cause immediate process
 * termination with a non-zero exit code.
 *
 * This is particularly important in the LZA execution environment where:
 * - Multiple async operations run concurrently
 * - Cross-account operations may have complex error scenarios
 * - Process stability is critical for pipeline reliability
 * - Hanging processes can block deployment pipelines
 *
 * @param {unknown} reason - The rejection reason (error or other value)
 *
 * @example
 * ```typescript
 * // This handler automatically catches scenarios like:
 *
 * // Unhandled promise rejection
 * Promise.reject(new Error('Unhandled error'));
 *
 * // Async function without proper error handling
 * async function riskyOperation() {
 *   throw new Error('This error is not caught');
 * }
 * riskyOperation(); // No .catch() handler
 * ```
 *
 * @remarks
 * **Process Termination:**
 * - Immediately logs the rejection reason to console
 * - Terminates process with exit code 1 (error)
 * - Prevents process from hanging on unhandled rejections
 * - Ensures pipeline failures are properly detected
 *
 * **Operational Impact:**
 * - Critical for CI/CD pipeline reliability
 * - Prevents silent failures in deployment processes
 * - Ensures proper error propagation to monitoring systems
 * - Maintains process hygiene in containerized environments
 *
 * @critical
 * **CRITICAL ERROR HANDLER**: This handler is essential for process stability
 * and proper error propagation in the LZA execution environment. Removing or
 * modifying this handler can cause silent failures or hanging processes.
 */
process.on('unhandledRejection', reason => {
  console.error(reason);

  process.exit(1);
});
