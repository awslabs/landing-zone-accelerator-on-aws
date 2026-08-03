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
import {
  ServiceQuotasClient,
  GetServiceQuotaCommand,
  RequestServiceQuotaIncreaseCommand,
  type RequestServiceQuotaIncreaseCommandInput,
  type RequestServiceQuotaIncreaseCommandOutput,
} from '@aws-sdk/client-service-quotas';
import { backOff } from 'exponential-backoff';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';

// Service Quotas caps active increase requests per account and Region (20, or 2 in opt-in Regions).
// Requests hold a slot only while PENDING or CASE_OPENED, so capacity usually frees up within minutes.
const CAPACITY_RETRY_ATTEMPTS = 12;
const CAPACITY_RETRY_STARTING_DELAY_MS = 5_000;
const CAPACITY_RETRY_MAX_DELAY_MS = 30_000;

/**
 * Submits a quota increase request, retrying while the account's active-request capacity is
 * exhausted.
 *
 * `QuotaExceededException` means the account has hit its cap on concurrently active increase
 * requests, not that the call was rate limited. Request-rate throttling stays with
 * `throttlingBackOff`, whose signature fixes `retry` to `isThrottlingError` and so cannot carry
 * this predicate.
 *
 * @param serviceQuotas the Service Quotas client
 * @param increaseRequest the increase request to submit
 * @returns the API response
 */
export async function requestServiceQuotaIncrease(
  serviceQuotas: ServiceQuotasClient,
  increaseRequest: RequestServiceQuotaIncreaseCommandInput,
): Promise<RequestServiceQuotaIncreaseCommandOutput> {
  return backOff(() => serviceQuotas.send(new RequestServiceQuotaIncreaseCommand(increaseRequest)), {
    startingDelay: CAPACITY_RETRY_STARTING_DELAY_MS,
    maxDelay: CAPACITY_RETRY_MAX_DELAY_MS,
    numOfAttempts: CAPACITY_RETRY_ATTEMPTS,
    jitter: 'full',
    retry: (error: Error) => error.name === 'QuotaExceededException',
  });
}

/**
 * service-quota-limits - lambda handler
 *
 * @param event
 * @returns
 */

export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string;
    }
  | undefined
> {
  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log(event);

      const servicequotas = new ServiceQuotasClient({
        customUserAgent: process.env['SOLUTION_ID'],
        retryStrategy: setRetryStrategy(),
      });
      const serviceCode = event.ResourceProperties['serviceCode'];
      const quotaCode = event.ResourceProperties['quotaCode'];
      const desiredValue = Number(event.ResourceProperties['desiredValue']);
      const region = process.env['AWS_REGION'];
      const accountId = event.StackId.split(':')[4];

      const serviceQuotaParams = {
        ServiceCode: serviceCode /* required */,
        QuotaCode: quotaCode,
      };

      try {
        const getServiceQuotaResponse = await throttlingBackOff(() =>
          servicequotas.send(new GetServiceQuotaCommand(serviceQuotaParams)),
        );
        const isAdjustable = getServiceQuotaResponse.Quota?.Adjustable ?? false;
        const currentValue = getServiceQuotaResponse.Quota?.Value ?? 0;
        // check to see if quota is adjustable and current value is less than desired value
        if (isAdjustable) {
          if (currentValue < desiredValue) {
            const increaseLimitParams = {
              ServiceCode: serviceCode,
              QuotaCode: quotaCode,
              DesiredValue: desiredValue,
            };
            const quotaIncreaseResponse = await requestServiceQuotaIncrease(servicequotas, increaseLimitParams);
            console.log(quotaIncreaseResponse.RequestedQuota);
          }
        } else {
          console.log(
            `Service Quota: ${serviceCode} with quota code: ${quotaCode} has adjustable set to ${isAdjustable} and current value set to ${currentValue}, skipping`,
          );
        }
      } catch (error) {
        // Service Quotas allows only one open increase request per quota.
        if (error instanceof Error && error.name === 'ResourceAlreadyExistsException') {
          console.warn(
            `A service quota increase request already exists for ${serviceCode} quota ${quotaCode} in account ${accountId} region ${region}, skipping`,
          );
        } else {
          console.error(error);
          throw new Error(
            `[service-quota-limits-config] Error increasing service quota ${quotaCode} for service ${serviceCode} in account ${accountId} region ${region}. Error: ${JSON.stringify(
              error,
            )}`,
          );
        }
      }

      return {
        PhysicalResourceId: `service-quota-limits`,
        Status: 'SUCCESS',
      };

    case 'Delete':
      // Do Nothing
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}
