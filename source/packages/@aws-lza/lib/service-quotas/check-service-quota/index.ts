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

import { ServiceQuotasClient, GetServiceQuotaCommand, NoSuchResourceException } from '@aws-sdk/client-service-quotas';
import { setRetryStrategy } from '../../../common/functions';
import { throttlingBackOff } from '../../../common/throttle';
import {
  ICheckServiceQuotaParameter,
  ICheckServiceQuotaModule,
} from '../../../interfaces/service-quotas/check-service-quota';
import { MODULE_EXCEPTIONS } from '../../../common/enums';

/**
 * CheckServiceQuota verifies AWS service quotas for an account.
 *
 * This module checks whether an AWS account has sufficient quota for the specified service
 * to meet the required threshold. The module is used to validate
 * service quotas as a prerequisite check before deploying resources that might
 * require a specific level of service capacity.
 *
 * @implements {ICheckServiceQuotaModule}
 */
export class CheckServiceQuota implements ICheckServiceQuotaModule {
  /**
   * Main handler method for checking service quotas.
   *
   * This method validates if the specified AWS account has sufficient service
   * quota to meet the required threshold. It connects to the
   * Service Quotas service in the specified account and region, retrieves the account's
   * quota for the specified service, and compares it against the required threshold.
   *
   * @param props {@link ICheckServiceQuotaParameter}
   * @returns Promise resolving to boolean indicating if the account meets the required service quota
   */
  async handler(props: ICheckServiceQuotaParameter): Promise<boolean> {
    const serviceQuota = await this.getLimits(props);

    return serviceQuota >= props.configuration.requiredServiceQuota;
  }

  /**
   * Retrieves the specific service quota for the specified account.
   *
   * This method connects to the AWS Service Quotas service and calls the GetServiceQuota
   * API to obtain the account's specific service quota.
   *
   * @param props {@link ICheckServiceQuotaParameter}
   * @throws Error if unable to retrieve the service quota
   */
  private async getLimits(props: ICheckServiceQuotaParameter) {
    const client = new ServiceQuotasClient({
      region: props.region,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });
    try {
      const limits = await throttlingBackOff(() =>
        client.send(
          new GetServiceQuotaCommand({
            QuotaCode: props.configuration.quotaCode,
            ServiceCode: props.configuration.serviceCode,
          }),
        ),
      );

      if (!limits.Quota?.Value) {
        throw new Error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: API call did not return service quota for service ${props.configuration.serviceCode} and quota code ${props.configuration.quotaCode}`,
        );
      }

      return limits.Quota.Value;
    } catch (error) {
      if (error instanceof NoSuchResourceException) {
        throw new Error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Quota ${props.configuration.quotaCode} not found for service ${props.configuration.serviceCode}.`,
        );
      }
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Encountered an error in getting service ${props.configuration.serviceCode} limit for quota ${props.configuration.quotaCode}.`,
      );
    }
  }
}
