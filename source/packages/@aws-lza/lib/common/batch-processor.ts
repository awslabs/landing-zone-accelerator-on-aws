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
import { createLogger } from './logger';
import { IConcurrencySettings } from './interfaces';
import { DEFAULT_MAX_CONCURRENT_ENVIRONMENTS, DEFAULT_SECURITY_OPERATION_TIMEOUTS_MS } from './constants';
import { OrderedAccountListType } from './types';

const logger = createLogger(['batch-processor']);

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
 * @param service - Name of the AWS service
 * @param operation - Operation being performed
 * @param managementAccountId - ID of the management account
 * @param targetAccounts - List of target AWS accounts
 * @param targetRegions - List of target AWS regions
 * @param props - Properties for the operations
 * @param dryRun - Whether to perform dry run
 * @param serviceHandler - Handler function for service operations
 * @param concurrency - Optional concurrency settings
 * @param accountSetupHandler - Optional handler for account-specific setup
 * @param organizationAccounts - Optional list of all organization accounts
 * @returns Promise resolving to array of operation results
 */
export async function processAccountBatch<TProps, TResult = void>(
  service: string,
  operation: string,
  managementAccountId: string,
  targetAccounts: Account[],
  targetRegions: string[],
  props: TProps,
  dryRun: boolean,
  serviceHandler: ServiceOperationHandler<TProps, TResult>,
  concurrency?: IConcurrencySettings,
  accountSetupHandler?: AccountSetupHandler<TProps>,
  organizationAccounts?: Account[],
): Promise<TResult[]> {
  const concurrencySettings = resolveConcurrencySettings(concurrency);
  const totalEnvironments = targetAccounts.length * targetRegions.length;

  logger.processStart(
    `Starting ${service} ${operation} operations for ${totalEnvironments} environments (${targetAccounts.length} accounts × ${targetRegions.length} regions) with max ${concurrencySettings.maxConcurrentEnvironments} concurrent`,
  );

  // Create all account/region tasks upfront
  const allTasks: (() => Promise<TResult>)[] = [];

  for (const targetAccount of targetAccounts) {
    for (const targetRegion of targetRegions) {
      allTasks.push(async () => {
        const accountProps = accountSetupHandler
          ? await accountSetupHandler(targetAccount, managementAccountId, props)
          : props;
        const logPrefix = `${targetAccount.Name ?? 'Unknown'}:${targetAccount.Id ?? 'Unknown'}:${targetRegion}`;

        const result = await withTimeout(
          serviceHandler(
            managementAccountId,
            targetAccount,
            targetRegion,
            dryRun,
            logPrefix,
            accountProps,
            organizationAccounts,
          ),
          concurrencySettings.operationTimeoutMs,
          `${logPrefix} ${service} ${operation} operation`,
        );

        return result; // Remove the string formatting: `[${logPrefix}]: ${result}`
      });
    }
  }

  const results = await processWithWorkerPool(allTasks, concurrencySettings.maxConcurrentEnvironments);

  logger.processEnd(
    `Successfully completed ${service} ${operation} operations for ${totalEnvironments} environments (${targetAccounts.length} accounts × ${targetRegions.length} regions)`,
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
 * Resolves concurrency settings with default values
 * @param concurrency - Optional concurrency settings
 * @returns Complete concurrency settings with defaults applied
 */
function resolveConcurrencySettings(concurrency?: IConcurrencySettings): Required<IConcurrencySettings> {
  return {
    maxConcurrentEnvironments: concurrency?.maxConcurrentEnvironments ?? DEFAULT_MAX_CONCURRENT_ENVIRONMENTS,
    operationTimeoutMs: concurrency?.operationTimeoutMs ?? DEFAULT_SECURITY_OPERATION_TIMEOUTS_MS,
  };
}

/**
 * Processes enable operations across ordered account batches with dependency management
 * @template TProps - Properties type for operations
 * @template TResult - Return type of operations
 * @param service - Name of the AWS service
 * @param managementAccountId - ID of the management account
 * @param orderedTargetAccounts - Ordered list of account batches with dependencies
 * @param targetRegions - List of target AWS regions
 * @param props - Properties for the operations
 * @param dryRun - Whether to perform dry run
 * @param serviceHandler - Handler function for service operations
 * @param concurrency - Optional concurrency settings
 * @param accountSetupHandler - Optional handler for account-specific setup
 * @param organizationAccounts - Optional list of all organization accounts
 * @returns Promise resolving to array of all operation results
 */
export async function processEnableOperations<TProps, TResult = void>(
  service: string,
  managementAccountId: string,
  orderedTargetAccounts: OrderedAccountListType[],
  targetRegions: string[],
  props: TProps,
  dryRun: boolean,
  serviceHandler: ServiceOperationHandler<TProps, TResult>,
  concurrency?: IConcurrencySettings,
  accountSetupHandler?: AccountSetupHandler<TProps>,
  organizationAccounts?: Account[],
): Promise<TResult[]> {
  const allResults: TResult[] = [];

  logger.processStart(
    `Processing ${orderedTargetAccounts.length}(${orderedTargetAccounts.map(a => a.name)}) enable dependency account batches for ${service}`,
  );

  // Sort by order to ensure proper sequence
  const sortedBatches = orderedTargetAccounts.sort((a, b) => a.order - b.order);

  for (const batch of sortedBatches) {
    logger.info(
      `Starting batch ${batch.order}(${batch.name}) with ${batch.accounts.length} accounts across ${targetRegions.length} regions`,
    );
    const batchResults = await processAccountBatch(
      service,
      'enable',
      managementAccountId,
      batch.accounts,
      targetRegions,
      props,
      dryRun,
      serviceHandler,
      concurrency,
      accountSetupHandler,
      organizationAccounts,
    );
    logger.info(
      `Completed batch ${batch.order}(${batch.name}) with ${batch.accounts.length} accounts across ${targetRegions.length} regions`,
    );
    allResults.push(...batchResults);
  }

  logger.processEnd(
    `Successfully completed all ${orderedTargetAccounts.length}(${orderedTargetAccounts.map(a => a.name)}) enable dependency account batches for ${service}`,
  );

  return allResults;
}

/**
 * Processes disable operations across ordered account batches with dependency management
 * @template TProps - Properties type for operations
 * @template TResult - Return type of operations
 * @param service - Name of the AWS service
 * @param managementAccountId - ID of the management account
 * @param orderedTargetAccounts - Ordered list of account batches with dependencies
 * @param targetRegions - List of target AWS regions
 * @param props - Properties for the operations
 * @param dryRun - Whether to perform dry run
 * @param serviceHandler - Handler function for service operations
 * @param concurrency - Optional concurrency settings
 * @param accountSetupHandler - Optional handler for account-specific setup
 * @param organizationAccounts - Optional list of all organization accounts
 * @returns Promise resolving to array of all operation results
 */
export async function processDisableOperations<TProps, TResult = void>(
  service: string,
  managementAccountId: string,
  orderedTargetAccounts: OrderedAccountListType[],
  targetRegions: string[],
  props: TProps,
  dryRun: boolean,
  serviceHandler: ServiceOperationHandler<TProps, TResult>,
  concurrency?: IConcurrencySettings,
  accountSetupHandler?: AccountSetupHandler<TProps>,
  organizationAccounts?: Account[],
): Promise<TResult[]> {
  const allResults: TResult[] = [];

  logger.processStart(
    `Processing ${orderedTargetAccounts.length}(${orderedTargetAccounts.map(a => a.name)}) disable dependency account batches for ${service}`,
  );

  // Sort by order to ensure proper sequence
  const sortedBatches = orderedTargetAccounts.sort((a, b) => a.order - b.order);

  for (const batch of sortedBatches) {
    logger.info(
      `Starting batch ${batch.order}(${batch.name}) with ${batch.accounts.length} accounts across ${targetRegions.length} regions`,
    );
    const batchResults = await processAccountBatch(
      service,
      'disable',
      managementAccountId,
      batch.accounts,
      targetRegions,
      props,
      dryRun,
      serviceHandler,
      concurrency,
      accountSetupHandler,
      organizationAccounts,
    );
    logger.info(
      `Completed batch ${batch.order}(${batch.name}) with ${batch.accounts.length} accounts across ${targetRegions.length} regions`,
    );
    allResults.push(...batchResults);
  }

  logger.processEnd(
    `Successfully completed all ${orderedTargetAccounts.length}(${orderedTargetAccounts.map(a => a.name)}) disable dependency account batches for ${service}`,
  );

  return allResults;
}

/**
 * Processes tasks using a worker pool with controlled concurrency
 * @template T - Type of task results
 * @param taskFactories - Array of functions that create tasks
 * @param maxConcurrency - Maximum number of concurrent tasks
 * @returns Promise resolving to array of task results in original order
 */
async function processWithWorkerPool<T>(taskFactories: (() => Promise<T>)[], maxConcurrency: number): Promise<T[]> {
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
