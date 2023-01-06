/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { backOff, IBackOffOptions } from 'exponential-backoff';

/**
 * Auxiliary function to retry AWS SDK calls when a throttling error occurs.
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

export const isThrottlingError = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any,@typescript-eslint/explicit-module-boundary-types
  e: any,
): boolean =>
  e.retryable === true ||
  // SDKv2 Error Structure
  e.code === 'ConcurrentModificationException' || // Retry for AWS Organizations
  e.code === 'InsufficientDeliveryPolicyException' || // Retry for ConfigService
  e.code === 'NoAvailableDeliveryChannelException' || // Retry for ConfigService
  e.code === 'ConcurrentModifications' || // Retry for AssociateHostedZone
  e.code === 'LimitExceededException' || // Retry for SecurityHub
  e.code === 'OperationNotPermittedException' || // Retry for RAM
  e.code === 'InvalidStateException' || //retry for ServiceCatalog
  e.code === 'TooManyRequestsException' ||
  e.code === 'Throttling' ||
  e.code === 'ThrottlingException' ||
  e.code === 'InternalErrorException' ||
  e.code === 'InternalException' ||
  e.code === 'ECONNRESET' ||
  e.code === 'EPIPE' ||
  e.code === 'ETIMEDOUT' ||
  // SDKv3 Error Structure
  e.name === 'ConcurrentModificationException' || // Retry for AWS Organizations
  e.name === 'InsufficientDeliveryPolicyException' || // Retry for ConfigService
  e.name === 'NoAvailableDeliveryChannelException' || // Retry for ConfigService
  e.name === 'ConcurrentModifications' || // Retry for AssociateHostedZone
  e.name === 'LimitExceededException' || // Retry for SecurityHub
  e.name === 'OperationNotPermittedException' || // Retry for RAM
  e.name === 'TooManyRequestsException' ||
  e.name === 'Throttling' ||
  e.name === 'ThrottlingException' ||
  e.name === 'InternalErrorException' ||
  e.name === 'InternalException' ||
  e.name === 'ECONNRESET' ||
  e.name === 'EPIPE' ||
  e.name === 'ETIMEDOUT';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function delay(ms: number): Promise<any> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
