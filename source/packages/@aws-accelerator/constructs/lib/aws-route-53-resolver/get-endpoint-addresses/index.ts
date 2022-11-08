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

import * as AWS from 'aws-sdk';

import { throttlingBackOff } from '@aws-accelerator/utils';

AWS.config.logger = console;

/**
 * Get Route 53 resolver endpoint details - Lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
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
  const resolverClient = new AWS.Route53Resolver({ region: region, customUserAgent: solutionId });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const ipArray: { Ip: string }[] = [];
      let nextToken: string | undefined = undefined;
      do {
        const page = await throttlingBackOff(() =>
          resolverClient
            .listResolverEndpointIpAddresses({ ResolverEndpointId: endpointId, NextToken: nextToken })
            .promise(),
        );

        // Loop through IP addresses and push to array
        for (const item of page.IpAddresses ?? []) {
          if (item.Ip) {
            ipArray.push({ Ip: item.Ip });
          }
        }

        nextToken = page.NextToken;
      } while (nextToken);

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
