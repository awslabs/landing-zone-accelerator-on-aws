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
import AWS from 'aws-sdk';
AWS.config.logger = console;

/**
 * service-quota-limits - lambda handler
 *
 * @param event
 * @returns
 */

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
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

      const servicequotas = new AWS.ServiceQuotas();
      const serviceCode = event.ResourceProperties['serviceCode'];
      const quotaCode = event.ResourceProperties['quotaCode'];
      const desiredValue = Number(event.ResourceProperties['desiredValue']);

      const serviceQuotaParams = {
        ServiceCode: serviceCode /* required */,
        QuotaCode: quotaCode,
      };

      try {
        const getServiceQuotaResponse = await servicequotas.getServiceQuota(serviceQuotaParams).promise();
        if (getServiceQuotaResponse.Quota?.Adjustable) {
          const increaseLimitParams = {
            ServiceCode: serviceCode,
            QuotaCode: quotaCode,
            DesiredValue: desiredValue,
          };
          const quotaIncreaseResponse = await servicequotas.requestServiceQuotaIncrease(increaseLimitParams).promise();
          console.log(quotaIncreaseResponse.RequestedQuota);
        } else {
          console.log(`Service Quota ${serviceCode}-${quotaCode} is not adjustable`);
        }
      } catch (error) {
        console.log(
          '[service-quota-limits-config] Error parsing input, the quota code or service code utilized is throwing an error',
        );
        console.log(`${error}`);
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
