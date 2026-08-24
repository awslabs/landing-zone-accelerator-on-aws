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
 * @fileoverview Batch processor utilities for managing concurrent AWS operations across multiple accounts and regions
 *
 * This module provides functions to process AWS service operations in batches with concurrency control,
 * timeout handling, and dependency management. It supports both enable and disable operations with
 * ordered account processing for dependency resolution.
 *
 * Key features:
 * - Concurrent processing with configurable limits
 * - Timeout protection for long-running operations
 * - Account dependency ordering
 * - Comprehensive logging and error handling
 * - Support for dry-run operations
 */

import { Account } from '@aws-sdk/client-organizations';
import { IRegionOperationError, IRequiredBatchOperationSettings } from './interfaces';
import { createLogger } from './logger';
import { OrderedAccountListType } from './types';

const logger = createLogger(['batch-processor']);

/**
 * Configuration type for batch processor operations
 * @template TProps - Properties type for the operation
 * @template TResult - Return type of the operation (defaults to void)
 */
export type BatchProcessorConfig<TProps, TResult = void> = {
  /** Name of the AWS service being processed */
  service: string;
  /** ID of the management account */
  managementAccountId: string;
  /** List of target AWS regions */
  targetRegions: string[];
  /** Properties for the operations */
  props: TProps;
  /** Whether to perform dry run without making changes */
  dryRun: boolean;
  /** Handler function for service operations */
  serviceHandler: ServiceOperationHandler<TProps, TResult>;
  /** Batch operation settings for concurrency and timeout */
  batchOperationSettings: IRequiredBatchOperationSettings;
  /** Optional handler for account-specific setup */
  accountSetupHandler?: AccountSetupHandler<TProps>;
  /** Optional list of all organization accounts */
  organizationAccounts?: Account[];
};

/**
 * Extended configuration type for ordered batch operations (enable/disable)
 * @template TProps - Properties type for the operation
 * @template TResult - Return type of the operation (defaults to void)
 */
export type OrderedBatchProcessorConfig<TProps, TResult = void> = Omit<
  BatchProcessorConfig<TProps, TResult>,
  'service'
> & {
  /** Name of the AWS service being processed */
  service: string;
  /** Ordered list of account batches with dependencies */
  orderedTargetAccounts: OrderedAccountListType[];
};

/**
 * Handler function type for service operations on AWS accounts
 * @template TProps - Properties type for the operation
 * @template TResult - Return type of the operation (defaults to void)
 * @param managementAccountId - ID of the management account
 * @param targetAccount - Target AWS account for the operation
 * @param targetRegion - AWS region where operation will be performed
 * @param dryRun - Whether to perform a dry run without making changes
 * @param logPrefix - Prefix for logging messages
 * @param props - Operation-specific properties
 * @param organizationAccounts - Optional list of all organization accounts
 * @returns Promise resolving to operation result
 */
export type ServiceOperationHandler<TProps, TResult = void> = (
  managementAccountId: string,
  targetAccount: Account,
  targetRegion: string,
  dryRun: boolean,
  logPrefix: string,
  props: TProps,
  organizationAccounts?: Account[],
) => Promise<TResult>;

/**
 * Handler function type for setting up account-specific properties
 * @template TProps - Properties type
 * @param targetAccount - Target AWS account
 * @param managementAccountId - ID of the management account
 * @param props - Base properties to customize
 * @returns Promise resolving to customized properties for the account
 */
export type AccountSetupHandler<TProps> = (
  targetAccount: Account,
  managementAccountId: string,
  props: TProps,
) => Promise<TProps>;

/**
 * Processes operations across multiple AWS accounts and regions in batches with concurrency control
 * @template TProps - Properties type for operations
 * @template TResult - Return type of operations
 * @param operation - Operation being performed
 * @param targetAccounts - List of target AWS accounts
 * @param config - Configuration object containing all batch processing parameters
 * @returns Promise resolving to array of operation results or regional errors
 */
export async function processAccountBatch<TProps, TResult = void>(
  operation: string,
  targetAccounts: Account[],
  config: BatchProcessorConfig<TProps, TResult>,
): Promise<(TResult | IRegionOperationError)[]> {
  const totalEnvironments = targetAccounts.length * config.targetRegions.length;

  logger.processStart(
    `Starting ${config.service} ${operation} operations for ${totalEnvironments} environments (${targetAccounts.length} accounts × ${config.targetRegions.length} regions) with max ${config.batchOperationSettings.maxConcurrentEnvironments} concurrent`,
  );

  // Create all account/region tasks upfront
  const allTasks: (() => Promise<TResult | IRegionOperationError>)[] = [];

  for (const targetAccount of targetAccounts) {
    const accountPropsPromise = config.accountSetupHandler
      ? config.accountSetupHandler(targetAccount, config.managementAccountId, config.props)
      : Promise.resolve(config.props);
    for (const targetRegion of config.targetRegions) {
      allTasks.push(async () => {
        try {
          const accountProps = await accountPropsPromise;
          const logPrefix = `${targetAccount.Name ?? 'Unknown'}:${targetAccount.Id ?? 'Unknown'}:${targetRegion}`;

          const result = await withTimeout(
            config.serviceHandler(
              config.managementAccountId,
              targetAccount,
              targetRegion,
              config.dryRun,
              logPrefix,
              accountProps,
              config.organizationAccounts,
            ),
            config.batchOperationSettings.operationTimeoutMs,
            `${logPrefix} ${config.service} ${operation} operation`,
          );

          return result;
        } catch (error: unknown) {
          // Convert error to regional error
          let errorMessage = String(error);
          let errorName = 'UnknownError';
          if (error instanceof Error) {
            errorMessage = error.message;
            errorName = error.name;
          }

          const regionError: IRegionOperationError = {
            region: targetRegion,
            accountId: targetAccount.Id ?? 'Unknown',
            accountName: targetAccount.Name ?? 'Unknown',
            errorName,
            errorMessage,
          };

          logger.error(`Regional error in ${targetRegion} for account ${targetAccount.Name}: ${errorMessage}`);
          return regionError;
        }
      });
    }
  }

  const results = await processWithWorkerPool(allTasks, config.batchOperationSettings.maxConcurrentEnvironments);

  logger.processEnd(
    `Successfully completed ${config.service} ${operation} operations for ${totalEnvironments} environments (${targetAccounts.length} accounts × ${config.targetRegions.length} regions)`,
  );
  return results;
}

/**
 * Wraps a promise with a timeout mechanism
 * @template T - Type of the promise result
 * @param promise - Promise to wrap with timeout
 * @param timeoutMs - Timeout duration in milliseconds
 * @param operation - Description of the operation for error messages
 * @returns Promise that rejects if timeout is exceeded
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${operation} timeout after ${timeoutMs}ms`)), timeoutMs);
  });

  return Promise.race([promise.finally(() => clearTimeout(timeoutId)), timeoutPromise]);
}

/**
 * Processes enable operations across ordered account batches with dependency management
 * @template TProps - Properties type for operations
 * @template TResult - Return type of operations
 * @param config - Configuration object containing all batch processing parameters
 * @returns Promise resolving to array of all operation results or regional errors
 */
export async function processEnableOperations<TProps, TResult = void>(
  config: OrderedBatchProcessorConfig<TProps, TResult>,
): Promise<(TResult | IRegionOperationError)[]> {
  const allResults: (TResult | IRegionOperationError)[] = [];
  const failedRegions = new Set<string>(); // Track regions that have failed in previous batches

  logger.processStart(
    `Processing ${config.orderedTargetAccounts.length}(${config.orderedTargetAccounts.map(a => a.name)}) enable dependency account batches for ${config.service}`,
  );

  // Sort by order to ensure proper sequence
  const sortedBatches = config.orderedTargetAccounts.sort((a, b) => a.order - b.order);

  for (const batch of sortedBatches) {
    // Filter out regions that failed in previous batches to prevent cascading failures
    const availableRegions = config.targetRegions.filter(region => !failedRegions.has(region));

    if (availableRegions.length === 0) {
      logger.warn(`Skipping batch ${batch.order}(${batch.name}) - all regions have failed in previous batches`);
      continue;
    }

    if (availableRegions.length < config.targetRegions.length) {
      logger.info(
        `Batch ${batch.order}(${batch.name}) will skip ${failedRegions.size} failed regions: [${Array.from(failedRegions).join(', ')}]`,
      );
    }

    logger.info(
      `Starting batch ${batch.order}(${batch.name}) with ${batch.accounts.length} accounts across ${availableRegions.length} regions`,
    );
    const batchResults = await processAccountBatch('enable', batch.accounts, {
      service: config.service,
      managementAccountId: config.managementAccountId,
      targetRegions: availableRegions,
      props: config.props,
      dryRun: config.dryRun,
      serviceHandler: config.serviceHandler,
      batchOperationSettings: config.batchOperationSettings,
      accountSetupHandler: config.accountSetupHandler,
      organizationAccounts: config.organizationAccounts,
    });

    // Track newly failed regions from this batch
    const newlyFailedRegions = batchResults
      .filter(
        (result): result is IRegionOperationError =>
          result !== null && typeof result === 'object' && 'region' in result && 'errorName' in result,
      )
      .map(error => error.region);

    newlyFailedRegions.forEach(region => failedRegions.add(region));

    if (newlyFailedRegions.length > 0) {
      logger.warn(
        `Batch ${batch.order}(${batch.name}) failed in ${newlyFailedRegions.length} regions: [${newlyFailedRegions.join(', ')}]. These regions will be skipped in subsequent batches.`,
      );
    }

    logger.info(
      `Completed batch ${batch.order}(${batch.name}) with ${batch.accounts.length} accounts across ${availableRegions.length} regions`,
    );
    allResults.push(...batchResults);
  }

  logger.processEnd(
    `Successfully completed all ${config.orderedTargetAccounts.length}(${config.orderedTargetAccounts.map(a => a.name)}) enable dependency account batches for ${config.service}`,
  );

  return allResults;
}

/**
 * Processes disable operations across ordered account batches with dependency management
 * @template TProps - Properties type for operations
 * @template TResult - Return type of operations
 * @param config - Configuration object containing all batch processing parameters
 * @returns Promise resolving to array of all operation results or regional errors
 */
export async function processDisableOperations<TProps, TResult = void>(
  config: OrderedBatchProcessorConfig<TProps, TResult>,
): Promise<(TResult | IRegionOperationError)[]> {
  const allResults: (TResult | IRegionOperationError)[] = [];
  const failedRegions = new Set<string>(); // Track regions that have failed in previous batches

  logger.processStart(
    `Processing ${config.orderedTargetAccounts.length}(${config.orderedTargetAccounts.map(a => a.name)}) disable dependency account batches for ${config.service}`,
  );

  // Sort by order to ensure proper sequence
  const sortedBatches = config.orderedTargetAccounts.sort((a, b) => a.order - b.order);

  for (const batch of sortedBatches) {
    // Filter out regions that failed in previous batches to prevent cascading failures
    const availableRegions = config.targetRegions.filter(region => !failedRegions.has(region));

    if (availableRegions.length === 0) {
      logger.warn(`Skipping batch ${batch.order}(${batch.name}) - all regions have failed in previous batches`);
      continue;
    }

    if (availableRegions.length < config.targetRegions.length) {
      logger.info(
        `Batch ${batch.order}(${batch.name}) will skip ${failedRegions.size} failed regions: [${Array.from(failedRegions).join(', ')}]`,
      );
    }

    logger.info(
      `Starting batch ${batch.order}(${batch.name}) with ${batch.accounts.length} accounts across ${availableRegions.length} regions`,
    );
    const batchResults = await processAccountBatch('disable', batch.accounts, {
      service: config.service,
      managementAccountId: config.managementAccountId,
      targetRegions: availableRegions,
      props: config.props,
      dryRun: config.dryRun,
      serviceHandler: config.serviceHandler,
      batchOperationSettings: config.batchOperationSettings,
      accountSetupHandler: config.accountSetupHandler,
      organizationAccounts: config.organizationAccounts,
    });

    // Track newly failed regions from this batch
    const newlyFailedRegions = batchResults
      .filter(
        (result): result is IRegionOperationError =>
          result !== null && typeof result === 'object' && 'region' in result && 'errorName' in result,
      )
      .map(error => error.region);

    newlyFailedRegions.forEach(region => failedRegions.add(region));

    if (newlyFailedRegions.length > 0) {
      logger.warn(
        `Batch ${batch.order}(${batch.name}) failed in ${newlyFailedRegions.length} regions: [${newlyFailedRegions.join(', ')}]. These regions will be skipped in subsequent batches.`,
      );
    }

    logger.info(
      `Completed batch ${batch.order}(${batch.name}) with ${batch.accounts.length} accounts across ${availableRegions.length} regions`,
    );
    allResults.push(...batchResults);
  }

  logger.processEnd(
    `Successfully completed all ${config.orderedTargetAccounts.length}(${config.orderedTargetAccounts.map(a => a.name)}) disable dependency account batches for ${config.service}`,
  );

  return allResults;
}

/**
 * Processes task factories using a worker pool with controlled concurrency.
 *
 * @template T - Type of task results
 * @param taskFactories - Array of functions that create tasks
 * @param maxConcurrency - Maximum number of concurrent tasks
 * @returns Promise resolving to array of task results in original order
 * @throws Error when maxConcurrency is not greater than zero or a task rejects
 */
export async function processWithWorkerPool<T>(
  taskFactories: (() => Promise<T>)[],
  maxConcurrency: number,
): Promise<T[]> {
  if (maxConcurrency <= 0) {
    throw new Error('maxConcurrency must be greater than 0');
  }
  if (taskFactories.length === 0) {
    return [];
  }

  const results: T[] = new Array(taskFactories.length);
  const executing = new Set<Promise<void>>();
  let taskIndex = 0;

  while (taskIndex < taskFactories.length || executing.size > 0) {
    // Fill up to max concurrency
    while (executing.size < maxConcurrency && taskIndex < taskFactories.length) {
      const currentIndex = taskIndex++;

      // Log queue status when there's meaningful queuing activity
      if (taskFactories.length > maxConcurrency && taskIndex === maxConcurrency) {
        logger.info(
          `Queue: ${executing.size}/${maxConcurrency} running, ${taskFactories.length - taskIndex} remaining`,
        );
      }

      const promise = taskFactories[currentIndex]()
        .then(result => {
          results[currentIndex] = result;
        })
        .catch(error => {
          throw error;
        })
        .finally(() => {
          executing.delete(promise);
        });

      executing.add(promise);
    }

    if (executing.size > 0) {
      await Promise.race(executing);
    }
  }

  return results;
}
