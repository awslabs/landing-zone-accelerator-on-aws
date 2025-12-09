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
 * @fileoverview Common Utility Functions - Shared utilities for AWS operations and validation
 *
 * Provides essential utility functions for AWS Landing Zone Accelerator operations including
 * timing utilities, retry mechanisms, API execution wrappers, account type classification,
 * and input validation. These utilities ensure consistent behavior across all LZA modules.
 *
 * Key capabilities:
 * - Asynchronous delay and wait utilities
 * - AWS SDK retry strategy configuration
 * - Standardized API execution with logging
 * - Account type classification logic
 * - Regional filter validation
 */

import { ConfiguredRetryStrategy } from '@aws-sdk/util-retry';
import { AcceleratorAccountType, MODULE_EXCEPTIONS } from './types';
import { IconLogger } from './logger';
import { IModuleRegionFilters } from './interfaces';

/**
 * Creates an asynchronous delay for the specified number of minutes
 * @param minutes - Number of minutes to delay
 * @returns Promise that resolves after the specified delay
 */
export async function delay(minutes: number) {
  return new Promise(resolve => setTimeout(resolve, minutes * 60000));
}

/**
 * Waits until a predicate condition is met with configurable retry logic
 * @param predicate - Async function that returns true when condition is met
 * @param error - Error message to throw if retry limit exceeded
 * @param retryLimit - Maximum number of retry attempts (default: 5)
 * @param queryIntervalMinutes - Minutes to wait between retries (default: 1)
 * @param delayFn - Optional custom delay function (default: delay)
 * @throws Error when retry limit is exceeded
 */
export async function waitUntil(
  predicate: () => Promise<boolean>,
  error: string,
  retryLimit = 5,
  queryIntervalMinutes = 1,
  delayFn: (minutes: number) => Promise<unknown> = delay, // Use Promise<any> for flexibility
): Promise<void> {
  let retryCount = 0;
  while (retryCount <= retryLimit) {
    if (await predicate()) {
      return;
    }
    if (retryCount < retryLimit) {
      await delayFn(queryIntervalMinutes);
    }
    retryCount += 1;
    if (retryCount > retryLimit) {
      throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ${error}`);
    }
  }
}

/**
 * Creates a configured retry strategy for AWS SDK operations
 * @returns ConfiguredRetryStrategy with environment-based retry limits
 */
export function setRetryStrategy() {
  const numberOfRetries = Number(process.env['ACCELERATOR_SDK_MAX_ATTEMPTS'] ?? 800);
  return new ConfiguredRetryStrategy(numberOfRetries, (attempt: number) => 100 + attempt * 1000);
}

/**
 * Executes AWS API calls with standardized logging and error handling
 * @template T - Return type of the API call
 * @param commandName - Name of the AWS command being executed
 * @param parameters - Parameters passed to the command
 * @param apiCall - Function that executes the API call
 * @param logger - Logger instance for consistent logging
 * @param logPrefix - Prefix for log messages
 * @param expectedExceptions - Optional list of expected exceptions for warning-level logging
 * @returns Promise resolving to API call result
 * @throws Re-throws any errors after logging
 */
export async function executeApi<T>(
  commandName: string,
  parameters: Record<string, unknown>,
  apiCall: () => Promise<T>,
  logger: IconLogger,
  logPrefix: string,
  expectedExceptions?: (abstract new (...args: never[]) => Error)[], // Optional list of expected exceptions for warning vs error logging
): Promise<T> {
  try {
    logger.info(`Executing ${commandName} with arguments: ${JSON.stringify(parameters)}`, logPrefix);
    const result = await apiCall();
    logger.info(`Successfully executed ${commandName}`, logPrefix);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorName = error instanceof Error ? error.name : 'UnknownError';

    // Check if this is an expected exception that should be logged as warning
    const isExpectedException = expectedExceptions?.some(ExceptionType => error instanceof ExceptionType);

    const message = `[API EXCEPTION]: ${commandName} failed with ${errorName}: ${errorMessage}`;
    if (isExpectedException) {
      logger.warn(message, logPrefix);
    } else {
      logger.error(message, logPrefix);
    }
    throw error;
  }
}

/**
 * Determines the accelerator account type based on account ID classification
 * @param accountId - Account ID to classify
 * @param managementAccountId - Management account ID
 * @param delegatedAdminAccountId - Delegated administrator account ID
 * @returns Account type classification
 */
export function getAcceleratorAccountType(
  accountId: string,
  managementAccountId: string,
  delegatedAdminAccountId: string,
): AcceleratorAccountType {
  if (accountId === managementAccountId) return 'management';
  if (accountId === delegatedAdminAccountId) return 'delegatedAdmin';
  return 'workload';
}

/**
 * Validates regional filter configuration for consistency and correctness
 * @param isEnableService - Whether the service is being enabled
 * @param logger - Logger instance for error reporting
 * @param logPrefix - Prefix for log messages
 * @param regionFilters - Optional regional filter configuration
 * @throws Error if validation fails
 */
export function validateRegionFilters(
  isEnableService: boolean,
  logger: IconLogger,
  logPrefix: string,
  regionFilters?: IModuleRegionFilters,
): void {
  if (!regionFilters) {
    return;
  }

  // Check if disabled regions are specified when service is disabled
  if (!isEnableService && regionFilters.disabledRegions && regionFilters.disabledRegions.length > 0) {
    const message = `${MODULE_EXCEPTIONS.INVALID_INPUT}: disabledRegions cannot be specified when service is disabled. Remove disabledRegions or enable the service.`;
    logger.error(message, logPrefix);
    throw new Error(message);
  }

  // Check for overlap between disabledRegions and ignoredRegions
  if (regionFilters.disabledRegions && regionFilters.ignoredRegions) {
    const overlap = regionFilters.disabledRegions.filter(region => regionFilters.ignoredRegions!.includes(region));

    if (overlap.length > 0) {
      const message = `${MODULE_EXCEPTIONS.INVALID_INPUT}: Regions cannot be both disabled and ignored. Overlapping regions: ${overlap.join(', ')}. Please remove duplicates from either disabledRegions or ignoredRegions.`;
      logger.error(message, logPrefix);
      throw new Error(message);
    }
  }
}
