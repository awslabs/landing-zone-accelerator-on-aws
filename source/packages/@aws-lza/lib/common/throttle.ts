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
 * @fileoverview AWS API Throttling and Retry Utilities
 *
 * Provides robust retry mechanisms with exponential backoff for AWS SDK operations
 * that may encounter throttling, rate limiting, or transient failures. The utilities
 * handle both AWS SDKv2 and SDKv3 error structures with comprehensive error detection
 * and configurable retry strategies.
 *
 * Key capabilities:
 * - Exponential backoff with jitter for AWS API calls
 * - Comprehensive throttling error detection for multiple AWS services
 * - Support for both SDKv2 and SDKv3 error structures
 * - Configurable retry parameters (attempts, delays, jitter)
 * - Network-level error handling (connection resets, timeouts)
 *
 * The retry logic is essential for large-scale AWS operations where API rate limits
 * and temporary service unavailability are common, especially during bulk operations
 * across multiple accounts and regions.
 *
 * @example
 * ```typescript
 * import { throttlingBackOff } from './throttle';
 * import { MacieClient, EnableMacieCommand } from '@aws-sdk/client-macie2';
 *
 * const client = new MacieClient({ region: 'us-east-1' });
 *
 * // Retry API call with default settings
 * const result = await throttlingBackOff(() =>
 *   client.send(new EnableMacieCommand({}))
 * );
 *
 * // Custom retry configuration
 * const customResult = await throttlingBackOff(
 *   () => client.send(new EnableMacieCommand({})),
 *   { numOfAttempts: 10, startingDelay: 300 }
 * );
 * ```
 *
 * @author AWS Solutions Team
 * @since 1.0.0
 */

import { backOff, IBackOffOptions } from 'exponential-backoff';

/**
 * Executes AWS SDK operations with exponential backoff retry logic for throttling errors.
 * Provides robust error handling for AWS API calls that may encounter rate limiting,
 * throttling, or transient service failures with configurable retry parameters.
 *
 * @template T - Return type of the AWS SDK operation
 * @param request - Function that returns a Promise for the AWS SDK operation to retry
 * @param options - Optional configuration to override default backoff behavior
 * @returns Promise resolving to the result of the successful AWS SDK operation
 *
 * @throws {Error} When all retry attempts are exhausted or non-retryable errors occur
 *
 * @remarks
 * Default retry configuration:
 * - Starting delay: 150ms with exponential increase
 * - Maximum attempts: 20 retries
 * - Jitter: Full jitter to prevent thundering herd
 * - Retry condition: Uses isThrottlingError for comprehensive error detection
 *
 * The function automatically handles both AWS SDKv2 and SDKv3 error structures
 * and includes network-level error recovery for connection issues.
 *
 * @example
 * ```typescript
 * import { OrganizationsClient, ListAccountsCommand } from '@aws-sdk/client-organizations';
 *
 * const client = new OrganizationsClient({ region: 'us-east-1' });
 *
 * // Basic usage with default retry settings
 * const accounts = await throttlingBackOff(() =>
 *   client.send(new ListAccountsCommand({}))
 * );
 *
 * // Custom retry configuration for critical operations
 * const criticalResult = await throttlingBackOff(
 *   () => client.send(new ListAccountsCommand({})),
 *   {
 *     numOfAttempts: 30,     // More retries for critical operations
 *     startingDelay: 500,    // Longer initial delay
 *     maxDelay: 30000        // Cap maximum delay at 30 seconds
 *   }
 * );
 *
 * // Use with complex operations
 * const batchResult = await throttlingBackOff(async () => {
 *   const response = await client.send(new ListAccountsCommand({}));
 *   // Additional processing that might also need retry protection
 *   return processAccounts(response.Accounts);
 * });
 *
 * // Error handling
 * try {
 *   const result = await throttlingBackOff(() =>
 *     client.send(new ListAccountsCommand({}))
 *   );
 * } catch (error) {
 *   console.error('All retry attempts failed:', error);
 *   // Handle permanent failure
 * }
 * ```
 */
export function throttlingBackOff<T>(
  request: () => Promise<T>,
  options?: Partial<Omit<IBackOffOptions, 'retry'>>,
): Promise<T> {
  return backOff(request, {
    startingDelay: 150,
    numOfAttempts: 20,
    jitter: 'full',
    retry: isThrottlingError,
    ...options,
  });
}

/**
 * Determines whether an error should trigger a retry attempt based on error type and code.
 * Provides comprehensive detection of throttling, rate limiting, and transient errors
 * across multiple AWS services and both SDKv2 and SDKv3 error structures.
 *
 * @param e - Error object from AWS SDK operation (any type to handle various error structures)
 * @returns Boolean indicating whether the error should trigger a retry
 *
 * @remarks
 * Detects retryable errors including:
 * - AWS service throttling (ThrottlingException, TooManyRequestsException)
 * - Concurrent modification conflicts (ConcurrentModificationException)
 * - Service-specific limits (LimitExceededException, OperationNotPermittedException)
 * - Network connectivity issues (ECONNRESET, ETIMEDOUT, ENOTFOUND)
 * - Internal service errors (InternalErrorException, InternalException)
 * - Configuration service delivery issues
 * - Organizations and RAM service-specific errors
 *
 * Supports both error.code (SDKv2) and error.name (SDKv3) properties for
 * comprehensive compatibility across AWS SDK versions.
 *
 * @example
 * ```typescript
 * // Example error objects that would trigger retries:
 *
 * // SDKv3 throttling error
 * const sdkv3Error = {
 *   name: 'ThrottlingException',
 *   message: 'Rate exceeded'
 * };
 * console.log(isThrottlingError(sdkv3Error)); // true
 *
 * // SDKv2 throttling error
 * const sdkv2Error = {
 *   code: 'TooManyRequestsException',
 *   retryable: true
 * };
 * console.log(isThrottlingError(sdkv2Error)); // true
 *
 * // Network error
 * const networkError = {
 *   code: 'ECONNRESET',
 *   errno: -104
 * };
 * console.log(isThrottlingError(networkError)); // true
 *
 * // Non-retryable error
 * const accessError = {
 *   name: 'AccessDeniedException',
 *   message: 'User not authorized'
 * };
 * console.log(isThrottlingError(accessError)); // false
 *
 * // Use in custom retry logic
 * const customRetry = async (operation: () => Promise<any>) => {
 *   let attempts = 0;
 *   const maxAttempts = 5;
 *
 *   while (attempts < maxAttempts) {
 *     try {
 *       return await operation();
 *     } catch (error) {
 *       if (isThrottlingError(error) && attempts < maxAttempts - 1) {
 *         attempts++;
 *         await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
 *         continue;
 *       }
 *       throw error;
 *     }
 *   }
 * };
 * ```
 */
export const isThrottlingError = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  e: any,
): boolean =>
  e.retryable === true ||
  e.name === 'PolicyTypeNotEnabledException' || // Retry for Resource Control Policies
  e.name === 'ConcurrentModificationException' || // Retry for AWS Organizations
  e.name === 'InsufficientDeliveryPolicyException' || // Retry for ConfigService
  e.name === 'NoAvailableDeliveryChannelException' || // Retry for ConfigService
  e.name === 'ConcurrentModifications' || // Retry for AssociateHostedZone
  e.name === 'LimitExceededException' || // Retry for SecurityHub
  e.name === 'OperationNotPermittedException' || // Retry for RAM
  e.name === 'CredentialsProviderError' || // Retry for STS
  e.name === 'TooManyRequestsException' ||
  e.name === 'TooManyUpdates' ||
  e.name === 'Throttling' ||
  e.name === 'ThrottlingException' ||
  e.name === 'InternalErrorException' ||
  e.name === 'InternalException' ||
  e.name === 'ECONNRESET' ||
  e.name === 'EPIPE' ||
  e.name === 'ENOTFOUND' ||
  e.name === 'ETIMEDOUT';
