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

import { MODULE_EXCEPTIONS } from '../../../common/enums';
import { setRetryStrategy } from '../../../common/functions';
import {
  IGetServiceQuotaCodeModule,
  IGetServiceQuotaCodeParameter,
} from '../../../interfaces/service-quotas/get-service-quota-code';
import { ListServiceQuotasCommand, ServiceQuota, ServiceQuotasClient } from '@aws-sdk/client-service-quotas';

/**
 * GetServiceQuotaCode retrieves the quota code for a specific AWS service quota by name.
 *
 * This module searches through AWS service quotas for a specified service to find
 * the quota code that corresponds to a given quota name. The quota code is required
 * for operations like checking or modifying service quotas programmatically.
 * This module handles pagination automatically to ensure all quotas are searched.
 *
 * @implements {IGetServiceQuotaCodeModule}
 */
export class GetServiceQuotaCode implements IGetServiceQuotaCodeModule {
  /**
   * Main handler method for retrieving a service quota code by quota name.
   *
   * This method retrieves all service quotas for the specified AWS service
   * and searches for a quota that matches the provided quota name. It returns
   * the corresponding quota code if found, or undefined if no matching quota exists.
   *
   * @param props {@link IGetServiceQuotaCodeParameter}
   * @returns Promise resolving to the quota code string if found, or undefined if not found
   */
  async handler(props: IGetServiceQuotaCodeParameter): Promise<string | undefined> {
    const serviceQuotas = await this.getServiceQuotas(props);

    const quota = serviceQuotas.find(quota => {
      return quota.QuotaName === props.configuration.quotaName;
    });

    return quota?.QuotaCode;
  }

  /**
   * Retrieves all service quotas for the specified AWS service.
   *
   * This method connects to the AWS Service Quotas service and calls the ListServiceQuotas
   * API to obtain all quotas for the specified service. It handles pagination automatically
   * to ensure all quotas are retrieved, even for services with many quotas.
   *
   * @param props {@link IGetServiceQuotaCodeParameter}
   * @returns Promise resolving to an array of ServiceQuota objects
   * @throws Error if unable to retrieve the service quotas
   */
  private async getServiceQuotas(props: IGetServiceQuotaCodeParameter): Promise<ServiceQuota[]> {
    const client = new ServiceQuotasClient({
      region: props.region,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });
    try {
      const serviceQuotas: ServiceQuota[] = [];
      let nextToken;
      do {
        const request: ListServiceQuotasCommand = new ListServiceQuotasCommand({
          ServiceCode: props.configuration.serviceCode,
          MaxResults: 100,
          NextToken: nextToken,
        });

        const response = await client.send(request);

        serviceQuotas.push(...response.Quotas!);
        nextToken = response.NextToken;
      } while (nextToken);

      return serviceQuotas;
    } catch (error) {
      throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Encountered an error in getting service quotas.`);
    }
  }
}
