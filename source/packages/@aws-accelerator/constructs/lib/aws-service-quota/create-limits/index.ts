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
} from '@aws-sdk/client-service-quotas';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';

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
            const quotaIncreaseResponse = await throttlingBackOff(() =>
              servicequotas.send(new RequestServiceQuotaIncreaseCommand(increaseLimitParams)),
            );
            console.log(quotaIncreaseResponse.RequestedQuota);
          }
        } else {
          console.log(
            `Service Quota: ${serviceCode} with quota code: ${quotaCode} has adjustable set to ${isAdjustable} and current value set to ${currentValue}, skipping`,
          );
        }
      } catch (error) {
        console.error(error);
        throw new Error(
          `[service-quota-limits-config] Error increasing service quota ${quotaCode} for service ${serviceCode} in account ${accountId} region ${region}. Error: ${JSON.stringify(
            error,
          )}`,
        );
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
