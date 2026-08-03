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
 * @fileoverview Resource retention orchestration utilities for Landing Zone Accelerator on AWS (LZA).
 *
 * @description
 * This module provides high-level orchestration functions for CloudFormation resource retention operations.
 * It coordinates the complete retention workflow including:
 * - Retention state management and tracking
 * - Batch retention operations across multiple stacks
 * - Stack configuration building for common deployment patterns
 * - Retry logic and error handling
 * - Progress tracking and reporting
 *
 * The module acts as the orchestration layer between module actions (like Macie, GuardDuty) and
 * the low-level CloudFormation retention operations (cfn-retention.ts). It provides:
 * - Simplified APIs for common retention patterns
 * - Automatic state persistence and change detection
 * - Batch optimization for multi-stack operations
 * - Fail-fast behavior to prevent accidental resource deletion
 *
 * **Key Features:**
 * - Single stack retention with state management
 * - Batch retention with parallel execution
 * - Stack configuration builders for common patterns
 * - Automatic retry for failed operations
 * - Comprehensive error handling and reporting
 *
 * @example
 * ```typescript
 * // Batch retention for Macie stacks
 * const stackConfigs = [
 *   { accountId: 'XXXXXXXXXXXX', region: 'us-east-1', stackName: 'AWSAccelerator-SecurityStack-...' },
 *   { accountId: 'YYYYYYYYYYYY', region: 'us-west-2', stackName: 'AWSAccelerator-SecurityStack-...' }
 * ];
 *
 * const results = await retainStackResourcesBatch(
 *   'macie',
 *   stackConfigs,
 *   params,
 *   'XXXXXXXXXXXX:us-east-1'
 * );
 *
 * // Check results
 * const completed = results.filter(r => r.status === 'COMPLETED').length;
 * const failed = results.filter(r => r.status === 'FAILED').length;
 * ```
 *
 * @see {@link cfn-retention} - Low-level CloudFormation retention operations
 * @see {@link retention-state} - Retention state management
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-deletionpolicy.html | CloudFormation DeletionPolicy}
 */

/**
 * Resource retention orchestration utilities.
 * Provides high-level functions for orchestrating CloudFormation resource retention operations.
 */

import { createLogger, createStatusLogger, IModuleResponse, MODULE_STATE_CODE } from 'aws-lza';
import { constantCase } from 'change-case';
import path from 'node:path';
import { AcceleratorStackNames } from '../../accelerator';
import { AcceleratorStage } from '../../accelerator-stage';
import { DefaultCfnRetentionBatchSize } from '../../constants';
import { AcceleratorModules, type ModuleParams } from '../../types';
import { getCfnRetentionBucketName } from '../utils/common-config';
import { logModuleExecutionResult } from '../utils/module-logging';
import { IRetainResourceModuleRequest, retainResources, RetentionErrorCode } from './cfn-retention';
import { RESOURCE_RETENTION_REGISTRY } from './registry';
import { getAllRetentionStates, getRetentionState, saveRetentionState, updateRetentionStatus } from './retention-state';
import {
  RetentionStatus,
  type IResourceRetentionState,
  type IRetentionResult,
  type IStackConfigBuilderInput,
  type IStackRetentionConfig,
} from './types';

/**
 * Logger instance for resource retention orchestration operations.
 *
 * @private
 * @constant
 *
 * @description
 * Provides structured logging for resource retention orchestration including:
 * - Retention state checks
 * - Batch retention operations
 * - Stack configuration building
 * - Error conditions
 *
 * Uses the filename as the logger context for easy identification in log aggregation systems.
 */
const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Status logger instance for tracking module execution status and progress.
 *
 * @private
 * @static
 * @readonly
 *
 * @description
 * Provides structured logging for module status updates, progress tracking,
 * and operational visibility. Uses the filename as the logger context for
 * easy identification in log aggregation systems.
 */
const statusLogger = createStatusLogger([path.parse(path.basename(__filename)).name]);

/**
 * Check if stack needs retention based on current state.
 * Returns false if retention already completed or stack not found.
 *
 * This function is designed for batch operations where all retention states
 * are fetched once and checked in-memory for optimal performance.
 *
 * @param serviceName - Service name (e.g., 'MACIE', 'GUARDDUTY')
 * @param accountId - AWS account ID where the stack exists
 * @param region - AWS region where the stack exists
 * @param stackName - CloudFormation stack name
 * @param logPrefix - Logging prefix
 * @param allStates - Map of all retention states for batch optimization (O(1) lookup)
 * @returns True if retention needed, false if already completed or not found
 *
 * @example
 * ```typescript
 * // Batch check (uses in-memory Map, no DynamoDB query per stack)
 * const allStates = await getAllRetentionStates('macie', params, logPrefix);
 * const needed = await needsRetention(
 *   'macie',
 *   'XXXXXXXXXXXX',
 *   'us-east-1',
 *   'AWSAccelerator-SecurityStack-XXXXXXXXXXXX-us-east-1',
 *   logPrefix,
 *   allStates  // O(1) lookup, no DynamoDB query
 * );
 * ```
 */
async function needsRetention(
  serviceName: string,
  accountId: string,
  region: string,
  stackName: string,
  logPrefix: string,
  allStates: Map<string, IResourceRetentionState>,
): Promise<{ needed: boolean; reason?: string }> {
  try {
    logger.info(`Checking if retention needed for ${serviceName} stack ${stackName}`, logPrefix);

    // O(1) lookup from in-memory Map (batch optimization)
    const key = `${accountId}:${region}:${stackName}`;
    const state = allStates.get(key);

    // If no state exists, retention is needed
    if (!state) {
      logger.info(`No retention state found for ${serviceName} stack ${stackName} - retention needed`, logPrefix);
      return { needed: true };
    }

    // Check if retention already completed or stack not found
    if (state.retentionStatus === RetentionStatus.COMPLETED || state.retentionStatus === RetentionStatus.NOT_FOUND) {
      logger.info(
        `Retention already ${state.retentionStatus} for ${serviceName} stack ${stackName} - skipping`,
        logPrefix,
      );
      return { needed: false, reason: `Retention already ${state.retentionStatus}` };
    }

    // Check if custom resources already removed
    if (state.resourcesRetained) {
      logger.info(`Resources already retained for ${serviceName} stack ${stackName} - skipping retention`, logPrefix);
      return { needed: false, reason: 'Resources already retained' };
    }

    // For FAILED, PENDING, or IN_PROGRESS states, retry retention
    logger.info(
      `Retention status is ${state.retentionStatus} for ${serviceName} stack ${stackName} - retention needed`,
      logPrefix,
    );
    return { needed: true };
  } catch (error: unknown) {
    logger.error(`Error checking retention need for ${serviceName} stack ${stackName}: ${error}`, logPrefix);
    // On error, assume retention is needed (safe default)
    return { needed: true };
  }
}

/**
 * Retain resources from a single CloudFormation stack.
 * Orchestrates the complete retention workflow including state management.
 *
 * @param serviceName - Service name (e.g., 'MACIE', 'GUARDDUTY')
 * @param stackConfig - Stack retention configuration
 * @param params - Module parameters
 * @param logPrefix - Logging prefix
 * @returns Retention result with status and details
 *
 * @example
 * ```typescript
 * const result = await retainStackResources(
 *   'macie',
 *   {
 *     accountId: 'XXXXXXXXXXXX',
 *     region: 'us-east-1',
 *     stackName: 'AWSAccelerator-SecurityStack-XXXXXXXXXXXX-us-east-1',
 *     resourceTypes: ['Custom::MacieExportConfigClassification'],
 *     s3BucketName: 'my-bucket'
 *   },
 *   params,
 *   logPrefix
 * );
 *
 * logger.info(`Retention ${result.status}: ${result.message}`);
 * ```
 */
async function retainStackResources(
  serviceName: string,
  stackConfig: IStackRetentionConfig,
  params: ModuleParams,
  logPrefix: string,
): Promise<IRetentionResult> {
  const { accountId, region, stackName, resourceTypes } = stackConfig;

  try {
    logger.info(`Starting retention for ${serviceName} stack ${stackName} in ${accountId}:${region}`, logPrefix);

    // Initialize retention state if it doesn't exist
    const existingState = await getRetentionState(serviceName, accountId, region, stackName, params, logPrefix);
    if (!existingState) {
      await saveRetentionState(
        {
          serviceName,
          accountId,
          region,
          stackName,
          resourceTypes,
          retentionStatus: RetentionStatus.PENDING,
          retentionAttempts: 0,
          resourcesRetained: false,
        },
        params,
        logPrefix,
        params.runnerParameters.dryRun,
      );
    }

    // Update state to IN_PROGRESS
    await updateRetentionStatus(
      {
        serviceName,
        accountId,
        region,
        stackName,
        status: RetentionStatus.IN_PROGRESS,
        dryRun: params.runnerParameters.dryRun,
      },
      params,
      logPrefix,
    );

    // Build retention request
    // In external deployments, invokingAccountId is the pipeline account. For management account
    // stacks, we already hold managementAccountCredentials — set invokingAccountId to the
    // management account so cfn-retention treats it as same-account and skips role assumption.
    const managementAccountId = params.moduleRunnerParameters.configs.accountsConfig.getManagementAccountId();
    const resolvedInvokingAccountId =
      accountId === managementAccountId
        ? managementAccountId
        : params.runnerParameters.sessionContext.invokingAccountId;

    const retentionRequest: IRetainResourceModuleRequest = {
      invokingAccountId: resolvedInvokingAccountId,
      region: params.runnerParameters.sessionContext.region,
      globalRegion: params.runnerParameters.sessionContext.globalRegion,
      partition: params.runnerParameters.sessionContext.partition,
      operation: 'retain',
      solutionId: params.runnerParameters.solutionId,
      credentials: params.moduleRunnerParameters.managementAccountCredentials,
      dryRun: params.runnerParameters.dryRun,
      sessionPolicy: params.moduleRunnerParameters.sessionPolicy,
      configuration: {
        directory: params.runnerParameters.configDirPath,
        accountId,
        region,
        stackName,
        resourceTypes,
        accountAccessRoleName: stackConfig.accountAccessRoleName,
        s3BucketName: stackConfig.s3BucketName,
        bucketRegion: stackConfig.bucketRegion,
      },
    };

    // Call CloudFormation retention function
    logger.info(`Calling retainResources for ${serviceName} stack ${stackName}`, logPrefix);
    const response = await retainResources(retentionRequest);

    // Determine final status based on response
    let finalStatus: RetentionStatus;
    let resultStatus: 'COMPLETED' | 'FAILED' | 'SKIPPED' | 'NOT_FOUND';

    if (response.resourceRetentionStatus?.stackModificationStatus === 'SUCCEEDED') {
      finalStatus = RetentionStatus.COMPLETED;
      resultStatus = 'COMPLETED';
    } else if (response.errorCode === RetentionErrorCode.STACK_NOT_FOUND) {
      // Stack does not exist - explicit error code check
      finalStatus = RetentionStatus.NOT_FOUND;
      resultStatus = 'NOT_FOUND';
    } else {
      // Any other case (FAILED status or unexpected status) - treat as FAILED
      finalStatus = RetentionStatus.FAILED;
      resultStatus = 'FAILED';
    }

    // Update retention state with final status
    await updateRetentionStatus(
      {
        serviceName,
        accountId,
        region,
        stackName,
        status: finalStatus,
        error: resultStatus === 'FAILED' ? response.message : undefined,
        dryRun: params.runnerParameters.dryRun,
      },
      params,
      logPrefix,
    );

    logger.info(`Retention ${resultStatus} for ${serviceName} stack ${stackName}: ${response.message}`, logPrefix);

    return {
      stackName,
      accountId,
      region,
      status: resultStatus,
      message: response.message,
      resourcesRetained: response.resourceRetentionStatus?.totalModifiedResources,
      error: resultStatus === 'FAILED' ? response.message : undefined,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Retention failed for ${serviceName} stack ${stackName}: ${errorMessage}`, logPrefix);
    statusLogger.error(`Retention failed for ${serviceName} stack ${stackName}: ${errorMessage}`, logPrefix);

    // Update state to FAILED
    await updateRetentionStatus(
      {
        serviceName,
        accountId,
        region,
        stackName,
        status: RetentionStatus.FAILED,
        error: errorMessage,
        dryRun: params.runnerParameters.dryRun,
      },
      params,
      logPrefix,
    );

    return {
      stackName,
      accountId,
      region,
      status: 'FAILED',
      message: `Retention operation failed: ${errorMessage}`,
      error: errorMessage,
    };
  }
}

/**
 * Execute operations in batches with concurrency control.
 *
 * @description
 * Generic helper function that processes an array of items in sequential batches,
 * with parallel execution within each batch. This prevents API throttling by limiting
 * the number of concurrent operations.
 *
 * **Use Case**: When processing 1000+ stacks, executing all operations in parallel
 * causes CloudFormation API throttling (5 TPS UpdateStack, 10 TPS GetTemplate/DescribeStacks).
 * Batching limits concurrency to stay within AWS API rate limits.
 *
 * **Execution Pattern**:
 * - Batch 1: Execute 10 items in parallel → Wait for completion
 * - Batch 2: Execute 10 items in parallel → Wait for completion
 * - ... (repeat for all batches)
 *
 * @template T - Type of items to process
 * @template R - Type of result returned by executor
 *
 * @param items - Array of items to process
 * @param batchSize - Number of items to process concurrently per batch
 * @param executor - Async function to execute for each item
 * @param logPrefix - Logging prefix for consistent log formatting
 *
 * @returns Promise resolving to array of PromiseSettledResult for all items
 *
 * @example
 * ```typescript
 * // Process 1011 stacks in batches of 10
 * const results = await executeBatched(
 *   stackConfigs,           // 1011 items
 *   10,                     // Batch size
 *   (config) => retainStackResources(config),  // Executor
 *   'mgmt-account:us-east-1'
 * );
 *retainStackResourcesBatch
 * // Timeline:
 * // Batch 1 (items 0-9):   Execute in parallel, wait ~90s
 * // Batch 2 (items 10-19): Execute in parallel, wait ~90s
 * // ...
 * // Batch 102 (item 1010): Execute, wait ~90s
 * // Total time: ~153 minutes
 * ```
 */
async function executeBatched<T, R>(
  items: T[],
  batchSize: number,
  executor: (item: T) => Promise<R>,
  logPrefix: string,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  const totalBatches = Math.ceil(items.length / batchSize);

  statusLogger.info(
    `Starting batched execution: ${items.length} items in ${totalBatches} batches of ${batchSize}`,
    logPrefix,
  );

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;

    statusLogger.info(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} items)`, logPrefix);

    // Execute batch in parallel (within batch)
    const batchResults = await Promise.allSettled(batch.map(item => executor(item)));

    results.push(...batchResults);

    // Log batch completion with success/failure counts
    const succeeded = batchResults.filter(r => r.status === 'fulfilled').length;
    const failed = batchResults.filter(r => r.status === 'rejected').length;
    statusLogger.info(
      `Batch ${batchNumber}/${totalBatches} completed: ${succeeded} succeeded, ${failed} failed`,
      logPrefix,
    );

    // Optional: Add small delay between batches to avoid API burst limits
    // This gives AWS APIs time to recover between batches
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
    }
  }

  statusLogger.info(
    `Batched execution completed: ${items.length} items processed in ${totalBatches} batches`,
    logPrefix,
  );

  return results;
}

/**
 * Retain resources from multiple CloudFormation stacks in batch.
 * Uses Promise.allSettled to collect all results, then fails if any retention failed.
 *
 * PERFORMANCE OPTIMIZATION: This function uses batch querying to minimize DynamoDB calls.
 * Instead of querying retention state individually for each stack (10,000+ queries for large deployments),
 * it queries ALL retention states for the service in ONE query, then filters in-memory.
 *
 * CONCURRENCY CONTROL: This function uses batching to prevent CloudFormation API throttling.
 * Instead of executing all 1000+ stacks in parallel (which exceeds CloudFormation API limits),
 * it processes stacks in batches of 10, staying within AWS rate limits.
 *
 * SAFETY: This function throws an error if ANY retention fails. This ensures that the calling
 * action (e.g., Macie configuration) only proceeds when ALL stacks have been successfully retained.
 * This prevents the dangerous scenario where stacks deploy without DeletionPolicy=Retain, which
 * would trigger custom resource deletion handlers.
 *
 * @param serviceName - Service name (e.g., 'MACIE', 'GUARDDUTY')
 * @param stackConfigs - Array of stack retention configurations
 * @param params - Module parameters
 * @param logPrefix - Logging prefix
 * @returns Array of retention results (only if ALL succeeded or were skipped)
 * @throws Error if any retention operation failed
 *
 * @example
 * ```typescript
 * try {
 *   const results = await retainStackResourcesBatch(
 *     'macie',
 *     stackConfigs,
 *     params,
 *     logPrefix
 *   );
 *
 *   // Only reached if ALL retentions succeeded
 *   logger.info('All retentions completed successfully');
 *   await macie.configure(params); // Safe to proceed
 *
 * } catch (error) {
 *   // Some retentions failed - action must stop
 *   logger.error('Retention failed:', error.message);
 *   // Do NOT proceed with service configuration
 *   // Do NOT deploy stacks (pipeline should fail)
 * }
 *
 * // Performance comparison for 10,000 stacks:
 * // - Old approach: 10,000 individual DynamoDB queries = ~30 seconds
 * // - New approach: 1 batch query + in-memory filtering = ~1 second
 * ```
 */
async function retainStackResourcesBatch(
  serviceName: string,
  stackConfigs: IStackRetentionConfig[],
  params: ModuleParams,
  logPrefix: string,
): Promise<IRetentionResult[]> {
  statusLogger.info(
    `Starting batch resource retention for ${serviceName} across ${stackConfigs.length} stacks`,
    logPrefix,
  );
  logger.info(`Starting retention for ${stackConfigs.length} ${serviceName} stacks`, logPrefix);

  // OPTIMIZATION: Get all retention states in ONE batch query
  logger.info(`Fetching all retention states for ${serviceName} in batch to optimize filtering`, logPrefix);
  const allStates = await getAllRetentionStates(serviceName, params, logPrefix);
  logger.info(`Retrieved ${allStates.size} existing retention states for ${serviceName}`, logPrefix);

  // OPTIMIZATION: Filter stacks that need retention using in-memory Map (no DynamoDB queries)
  const stacksNeedingRetention: IStackRetentionConfig[] = [];
  const skippedStacks: IRetentionResult[] = [];

  for (const stackConfig of stackConfigs) {
    const result = await needsRetention(
      serviceName,
      stackConfig.accountId,
      stackConfig.region,
      stackConfig.stackName,
      logPrefix,
      allStates,
    );

    if (result.needed) {
      stacksNeedingRetention.push(stackConfig);
    } else {
      skippedStacks.push({
        stackName: stackConfig.stackName,
        accountId: stackConfig.accountId,
        region: stackConfig.region,
        status: 'SKIPPED',
        message: result.reason ?? 'Retention not needed',
      });
    }
  }

  logger.info(
    `Filtered ${serviceName} stacks: ${stacksNeedingRetention.length} need retention, ${skippedStacks.length} skipped`,
    logPrefix,
  );

  // Batch processing to prevent CloudFormation API throttling
  // CloudFormation API limits: UpdateStack (5 TPS), GetTemplate (10 TPS), DescribeStacks (10 TPS)
  // Batch size controls concurrent stack operations to stay within API rate limits
  // Configurable via CFN_RETENTION_BATCH_SIZE environment variable (default: 10)
  const BATCH_SIZE = Number(process.env['CFN_RETENTION_BATCH_SIZE'] ?? DefaultCfnRetentionBatchSize);

  statusLogger.info(
    `Processing ${stacksNeedingRetention.length} ${serviceName} stacks in batches of ${BATCH_SIZE}`,
    logPrefix,
  );

  const settledResults = await executeBatched(
    stacksNeedingRetention,
    BATCH_SIZE,
    stackConfig => retainStackResources(serviceName, stackConfig, params, logPrefix),
    logPrefix,
  );

  // Collect all results from retention operations
  const retentionResults: IRetentionResult[] = settledResults.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      // Promise rejected - create error result
      const stackConfig = stacksNeedingRetention[index];
      const errorMessage = result.reason instanceof Error ? result.reason.message : 'Unknown error';
      logger.error(
        `Retention promise rejected for ${serviceName} stack ${stackConfig.stackName}: ${errorMessage}`,
        logPrefix,
      );
      return {
        stackName: stackConfig.stackName,
        accountId: stackConfig.accountId,
        region: stackConfig.region,
        status: 'FAILED',
        message: `Retention operation failed: ${errorMessage}`,
        error: errorMessage,
      };
    }
  });

  // Combine skipped stacks with retention results
  const results = [...skippedStacks, ...retentionResults];

  // Log summary
  const completed = results.filter(r => r.status === 'COMPLETED').length;
  const skipped = results.filter(r => r.status === 'SKIPPED').length;
  const notFound = results.filter(r => r.status === 'NOT_FOUND').length;
  const failed = results.filter(r => r.status === 'FAILED').length;

  logger.info(
    `Retention completed for ${serviceName}: ${completed} completed, ${skipped} skipped, ${notFound} not found, ${failed} failed`,
    logPrefix,
  );

  // CRITICAL: Fail fast if ANY retention failed
  // This prevents the calling action from proceeding when retention is incomplete
  // Without this check, stacks could deploy without DeletionPolicy=Retain, triggering unwanted deletions
  if (failed > 0) {
    const failedStacks = results
      .filter(r => r.status === 'FAILED')
      .map(r => `${r.stackName} (${r.accountId}:${r.region})`)
      .join(', ');

    const errorMessage =
      `Retention failed for ${failed} ${serviceName} stack(s): ${failedStacks}. ` +
      `All retentions must succeed before proceeding with service configuration. ` +
      `Review the errors above, fix the issues, and retry the action.`;

    logger.error(errorMessage, logPrefix);
    statusLogger.error(errorMessage, logPrefix);

    // Log individual failure details for debugging
    results
      .filter(r => r.status === 'FAILED')
      .forEach(r => {
        logger.error(
          `Failed retention details - Stack: ${r.stackName}, Account: ${r.accountId}, Region: ${r.region}, Error: ${r.error}`,
          logPrefix,
        );
        statusLogger.error(
          `Failed retention details - Stack: ${r.stackName}, Account: ${r.accountId}, Region: ${r.region}, Error: ${r.error}`,
          logPrefix,
        );
      });

    throw new Error(errorMessage);
  }

  // All retentions succeeded or were skipped - safe to proceed
  statusLogger.info(
    `Batch resource retention completed for ${serviceName}: ${completed} completed, ${skipped} skipped, ${notFound} not found`,
    logPrefix,
  );
  logger.info(
    `All ${serviceName} retentions completed successfully - safe to proceed with service configuration`,
    logPrefix,
  );

  return results;
}

/**
 * Build stack retention configurations for any CloudFormation stack type.
 *
 * This is a completely generic building block function that works for ANY stack migration scenario:
 * - Security services (Macie, GuardDuty, SecurityHub, Detective)
 * - Network stacks (VPC, Transit Gateway, Direct Connect)
 * - Logging and monitoring stacks
 * - Custom application stacks
 * - Any other CloudFormation stack that needs resource retention
 *
 * The caller has complete control over which stacks to process by providing:
 * - Stack name prefix (e.g., 'AWSAccelerator-OrganizationsStack')
 * - List of AWS account IDs to target
 * - List of AWS regions to target
 * - List of custom resource types to retain
 *
 * Stack names are generated using the pattern: `{stackPrefix}-{accountId}-{region}`
 * This matches the LZA stack naming convention used throughout the codebase.
 *
 * @param input - Stack configuration builder input
 * @returns Array of stack retention configurations
 *
 * @example
 * ```typescript
 * // Example 1: Macie OrganizationsStack (management account, all regions)
 * const orgConfigs = buildStackConfigs({
 *   stackPrefix: 'AWSAccelerator-OrganizationsStack',
 *   accounts: ['XXXXXXXXXXXX'],  // management account only
 *   regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
 *   resourceTypes: ['Custom::MacieEnableOrganizationAdminAccount'],
 *   accountAccessRoleName: 'AWSControlTowerExecution',
 *   s3BucketName: 'cdk-accel-assets-XXXXXXXXXXXX-us-east-1'
 * });
 * // Returns 3 configs (1 account × 3 regions)
 *
 * // Example 2: Macie SecurityAuditStack (audit account, all regions)
 * const auditConfigs = buildStackConfigs({
 *   stackPrefix: 'AWSAccelerator-SecurityAuditStack',
 *   accounts: ['YYYYYYYYYYYY'],  // audit account only
 *   regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
 *   resourceTypes: ['Custom::MacieCreateMember'],
 *   accountAccessRoleName: 'AWSControlTowerExecution',
 *   s3BucketName: 'cdk-accel-assets-XXXXXXXXXXXX-us-east-1'
 * });
 * // Returns 3 configs (1 account × 3 regions)
 *
 * // Example 3: Macie SecurityStack (all accounts, all regions)
 * const securityConfigs = buildStackConfigs({
 *   stackPrefix: 'AWSAccelerator-SecurityStack',
 *   accounts: ['AAAAAAAAAAAA', 'BBBBBBBBBBBB', 'CCCCCCCCCCCC'],  // all accounts
 *   regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
 *   resourceTypes: ['Custom::MacieExportConfigClassification'],
 *   accountAccessRoleName: 'AWSControlTowerExecution',
 *   s3BucketName: 'cdk-accel-assets-XXXXXXXXXXXX-us-east-1'
 * });
 * // Returns 9 configs (3 accounts × 3 regions)
 *
 * // Example 4: Network VPC stacks with specific resource logical IDs
 * const vpcConfigs = buildStackConfigs({
 *   stackPrefix: 'AWSAccelerator-NetworkVpcStack',
 *   accounts: ['DDDDDDDDDDDD'],
 *   regions: ['us-east-1'],
 *   resourceTypes: ['Custom::VpcEndpoint', 'Custom::TransitGatewayAttachment'],
 *   resourceLogicalIds: ['VpcEndpoint1', 'TgwAttachment1'],  // Specific resources only
 *   accountAccessRoleName: 'AWSControlTowerExecution',
 *   s3BucketName: 'cdk-accel-assets-XXXXXXXXXXXX-us-east-1'
 * });
 * // Returns 1 config (1 account × 1 region)
 * ```
 * // Result: 3 stack configs (1 account × 3 regions)
 *
 * // Example 2: Macie SecurityAuditStack (audit account, all regions)
 * const auditConfigs = buildStackConfigs({
 *   stackPrefix: 'AWSAccelerator-SecurityAuditStack',
 *   accounts: ['222222222222'],  // audit account only
 *   regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
 *   resourceTypes: ['Custom::MacieCreateMember']
 * });
 * // Result: 3 stack configs (1 account × 3 regions)
 *
 * // Example 3: Macie SecurityStack (all accounts, all regions)
 * const securityConfigs = buildStackConfigs({
 *   stackPrefix: 'AWSAccelerator-SecurityStack',
 *   accounts: ['333333333333', '444444444444', '555555555555'],  // all accounts
 *   regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
 *   resourceTypes: ['Custom::MacieExportConfigClassification']
 * });
 * // Result: 9 stack configs (3 accounts × 3 regions)
 *
 * // Example 4: GuardDuty stacks (different resource types)
 * const guardDutyConfigs = buildStackConfigs({
 *   stackPrefix: 'AWSAccelerator-SecurityStack',
 *   accounts: allAccountIds,
 *   regions: enabledRegions,
 *   resourceTypes: ['Custom::GuardDutyCreatePublishingDestination', 'Custom::GuardDutyMembers']
 * });
 *
 * // Example 5: Network VPC stacks (specific accounts and regions)
 * const vpcConfigs = buildStackConfigs({
 *   stackPrefix: 'AWSAccelerator-NetworkVpcStack',
 *   accounts: ['666666666666'],
 *   regions: ['us-east-1'],
 *   resourceTypes: ['Custom::VpcEndpoint', 'Custom::TransitGatewayAttachment'],
 *   accountAccessRoleName: 'AWSAccelerator-NetworkAccountRole'
 * });
 *
 * // Caller combines results from multiple calls and processes together
 * const allConfigs = [...orgConfigs, ...auditConfigs, ...securityConfigs];
 * const results = await retainStackResourcesBatch('MACIE', allConfigs, params, logPrefix);
 * ```
 */
function buildStackConfigs(input: IStackConfigBuilderInput): IStackRetentionConfig[] {
  const configs: IStackRetentionConfig[] = [];

  const accountIds = input.accounts.filter(id => id);

  // Generate stack config for each account-region combination
  for (const accountId of accountIds) {
    for (const region of input.regions) {
      // Stack name follows LZA convention: {prefix}-{accountId}-{region}
      const stackName = `${input.stackPrefix}-${accountId}-${region}`;

      configs.push({
        accountId,
        region,
        stackName,
        resourceTypes: input.resourceTypes,
        accountAccessRoleName: input.accountAccessRoleName,
        s3BucketName: input.s3BucketName,
        bucketRegion: input.bucketRegion,
      });
    }
  }

  return configs;
}

/**
 * Determine target accounts and regions for a given stack type.
 *
 * @description
 * Maps stack prefixes to their deployment targets (accounts and regions).
 * Different stack types have different deployment patterns:
 * - OrganizationsStack: Management account, all enabled regions
 * - PrepareStack: Management account, home region only
 * - AccountsStack: Management account, global region only
 * - FinalizeStack: Management account, global region only
 * - SecurityAuditStack: Audit account, all enabled regions
 * - Other stacks: All accounts, all enabled regions
 *
 * @param stackPrefix - Stack prefix from AcceleratorStackNames
 * @param context - Deployment context containing account and region information
 * @param context.managementAccountId - Management account ID
 * @param context.auditAccountId - Audit account ID
 * @param context.allAccountIds - All account IDs in the organization
 * @param context.enabledRegions - All enabled regions
 * @param context.homeRegion - Home region (primary region for control plane resources)
 * @param context.globalRegion - Global region (us-east-1 for AWS partitions)
 * @returns Object containing target accounts and regions arrays
 *
 * @example
 * ```typescript
 * // OrganizationsStack - management account, all regions
 * const orgTargets = getStackDeploymentTargets(
 *   AcceleratorStackNames[AcceleratorStage.ORGANIZATIONS],
 *   {
 *     managementAccountId: '111111111111',
 *     auditAccountId: '222222222222',
 *     allAccountIds: ['111111111111', '222222222222', '333333333333'],
 *     enabledRegions: ['us-east-1', 'us-west-2'],
 *     homeRegion: 'us-east-1',
 *     globalRegion: 'us-east-1'
 *   }
 * );
 * // Returns: { accounts: ['111111111111'], regions: ['us-east-1', 'us-west-2'] }
 *
 * // PrepareStack - management account, home region only
 * const prepareTargets = getStackDeploymentTargets(
 *   AcceleratorStackNames[AcceleratorStage.PREPARE],
 *   { ...context }
 * );
 * // Returns: { accounts: ['111111111111'], regions: ['us-east-1'] }
 *
 * // AccountsStack/FinalizeStack - management account, global region only
 * const accountsTargets = getStackDeploymentTargets(
 *   AcceleratorStackNames[AcceleratorStage.ACCOUNTS],
 *   { ...context }
 * );
 * // Returns: { accounts: ['111111111111'], regions: ['us-east-1'] }
 * ```
 */
function getStackDeploymentTargets(
  stackPrefix: string,
  context: {
    managementAccountId: string;
    auditAccountId: string;
    allAccountIds: string[];
    enabledRegions: string[];
    homeRegion: string;
    globalRegion: string;
  },
): { accounts: string[]; regions: string[] } {
  switch (stackPrefix) {
    case AcceleratorStackNames[AcceleratorStage.ORGANIZATIONS]:
      return {
        accounts: [context.managementAccountId],
        regions: context.enabledRegions,
      };

    case AcceleratorStackNames[AcceleratorStage.PREPARE]:
      return {
        accounts: [context.managementAccountId],
        regions: [context.homeRegion],
      };

    case AcceleratorStackNames[AcceleratorStage.ACCOUNTS]:
    case AcceleratorStackNames[AcceleratorStage.FINALIZE]:
      return {
        accounts: [context.managementAccountId],
        regions: [context.globalRegion],
      };

    case AcceleratorStackNames[AcceleratorStage.SECURITY_AUDIT]:
      return {
        accounts: [context.auditAccountId],
        regions: context.enabledRegions,
      };

    default:
      return {
        accounts: context.allAccountIds,
        regions: context.enabledRegions,
      };
  }
}

/**
 * Stack resources retention module.
 */
export abstract class StackResources {
  public static async retain(params: ModuleParams): Promise<IModuleResponse> {
    const logPrefix = `${params.runnerParameters.sessionContext.invokingAccountId}:${params.runnerParameters.sessionContext.region}`;

    statusLogger.info('Starting centralized stack resources retention', logPrefix);

    try {
      const stackResourceMap = RESOURCE_RETENTION_REGISTRY;
      const stackPrefixes = Object.keys(stackResourceMap);

      if (stackPrefixes.length === 0) {
        const result = {
          status: MODULE_STATE_CODE.SKIPPED,
          summary: 'No resources registered for retention - skipping',
          timestamp: new Date().toISOString(),
          moduleName: AcceleratorModules.STACK_RESOURCES_RETENTION,
          dryRun: params.runnerParameters.dryRun,
        };
        logModuleExecutionResult(result, AcceleratorModules.STACK_RESOURCES_RETENTION, logPrefix, logger, statusLogger);
        return result;
      }

      const allStackConfigs: IStackRetentionConfig[] = [];
      const managementAccountId = params.moduleRunnerParameters.configs.accountsConfig.getManagementAccountId();
      const auditAccountId = params.moduleRunnerParameters.configs.accountsConfig.getAuditAccountId();
      const enabledRegions = params.moduleRunnerParameters.configs.globalConfig.enabledRegions;
      // Exclude accounts in ignored OUs - they have no LZA stacks deployed, so role assumption will fail
      const ignoredOus = params.moduleRunnerParameters.configs.organizationConfig.getIgnoredOus();
      const allAccountIds = params.moduleRunnerParameters.configs.accountsConfig.getActiveAccountIds(ignoredOus);
      const accountAccessRoleName = params.moduleRunnerParameters.configs.globalConfig.managementAccountAccessRole;
      const s3BucketName = getCfnRetentionBucketName(params);
      const bucketRegion = params.runnerParameters.sessionContext.globalRegion;

      // Process each stack prefix and its service configurations
      for (const [stackPrefix, serviceConfigs] of Object.entries(stackResourceMap)) {
        // Aggregate all resource types from all services for this stack type
        const allResourceTypes: string[] = [];

        for (const serviceConfig of serviceConfigs) {
          // Respect per-module skip environment variables (e.g., SKIP_MACIE_MODULE)
          const skipEnvVar = constantCase(`skip-${serviceConfig.serviceName}`) + '_MODULE';
          if (process.env[skipEnvVar]?.toLowerCase() === 'true') {
            logger.info(
              `Skipping ${serviceConfig.serviceName} retention resources - ${skipEnvVar} is set to true`,
              logPrefix,
            );
            continue;
          }
          allResourceTypes.push(...serviceConfig.resourceTypes);
        }

        // Skip this stack prefix if all services were filtered out
        if (allResourceTypes.length === 0) {
          logger.info(
            `Skipping stack prefix ${stackPrefix} - all services filtered out by skip environment variables`,
            logPrefix,
          );
          continue;
        }

        logger.info(
          `Stack prefix ${stackPrefix}: ${allResourceTypes.length} resource type(s) to retain - [${allResourceTypes.join(', ')}]`,
          logPrefix,
        );

        // Determine accounts and regions based on stack type
        const { accounts, regions } = getStackDeploymentTargets(stackPrefix, {
          managementAccountId,
          auditAccountId,
          allAccountIds,
          enabledRegions,
          homeRegion: params.moduleRunnerParameters.configs.globalConfig.homeRegion,
          globalRegion: params.runnerParameters.sessionContext.globalRegion,
        });

        // Build stack configurations with all resource types aggregated
        const configs = buildStackConfigs({
          stackPrefix,
          accounts,
          regions,
          resourceTypes: allResourceTypes,
          accountAccessRoleName,
          s3BucketName,
          bucketRegion,
        });

        allStackConfigs.push(...configs);
      }

      // Early return if all services were filtered out by skip environment variables
      if (allStackConfigs.length === 0) {
        const result = {
          status: MODULE_STATE_CODE.COMPLETED,
          summary: 'No stacks to process - all services filtered out by skip environment variables',
          timestamp: new Date().toISOString(),
          moduleName: AcceleratorModules.STACK_RESOURCES_RETENTION,
          dryRun: params.runnerParameters.dryRun,
        };
        logModuleExecutionResult(result, AcceleratorModules.STACK_RESOURCES_RETENTION, logPrefix, logger, statusLogger);
        return result;
      }

      const retentionResults = await retainStackResourcesBatch(
        AcceleratorModules.STACK_RESOURCES_RETENTION,
        allStackConfigs,
        params,
        logPrefix,
      );

      // Count actual results
      const completed = retentionResults.filter(r => r.status === 'COMPLETED').length;
      const skipped = retentionResults.filter(r => r.status === 'SKIPPED').length;
      const notFound = retentionResults.filter(r => r.status === 'NOT_FOUND').length;

      const result = {
        status: MODULE_STATE_CODE.COMPLETED,
        summary: `Successfully processed ${allStackConfigs.length} stacks: ${completed} retained, ${notFound} not found, ${skipped} skipped`,
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.STACK_RESOURCES_RETENTION,
        dryRun: params.runnerParameters.dryRun,
      };
      logModuleExecutionResult(result, AcceleratorModules.STACK_RESOURCES_RETENTION, logPrefix, logger, statusLogger);
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown retention error';

      const result = {
        status: MODULE_STATE_CODE.FAILED,
        summary: `Resource retention failed: ${errorMessage}`,
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.STACK_RESOURCES_RETENTION,
        dryRun: params.runnerParameters.dryRun,
        error: {
          name: 'RetentionError',
          message: errorMessage,
        },
      };
      logModuleExecutionResult(result, AcceleratorModules.STACK_RESOURCES_RETENTION, logPrefix, logger, statusLogger);
      return result;
    }
  }
}
