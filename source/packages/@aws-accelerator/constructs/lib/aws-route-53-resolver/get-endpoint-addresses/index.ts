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

import { paginateListResolverEndpointIpAddresses, Route53ResolverClient } from '@aws-sdk/client-route53resolver';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';

/**
 * Get Route 53 resolver endpoint details - Lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string;
      Data: {
        ipAddresses: { Ip: string }[];
      };
      Status: string;
    }
  | {
      PhysicalResourceId: string;
      Status: string;
    }
  | undefined
> {
  const region: string = event.ResourceProperties['region'];
  const endpointId: string = event.ResourceProperties['endpointId'];
  const solutionId = process.env['SOLUTION_ID'];
  const resolverClient = new Route53ResolverClient({
    customUserAgent: solutionId,
    region,
    retryStrategy: setRetryStrategy(),
  });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const ipArray: { Ip: string }[] = [];
      for await (const page of paginateListResolverEndpointIpAddresses(
        { client: resolverClient },
        { ResolverEndpointId: endpointId },
        region,
      )) {
        for (const item of page.IpAddresses ?? []) {
          if (item.Ip) {
            ipArray.push({ Ip: item.Ip });
          }
        }
      }

      return {
        PhysicalResourceId: endpointId,
        Data: {
          ipAddresses: ipArray,
        },
        Status: 'SUCCESS',
      };

    case 'Delete':
      // Do nothing
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}
