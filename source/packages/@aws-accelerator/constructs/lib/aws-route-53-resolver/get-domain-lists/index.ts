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

import { paginateListFirewallDomainLists, Route53ResolverClient } from '@aws-sdk/client-route53resolver';
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
      Status: string;
    }
  | undefined
> {
  const region: string = event.ResourceProperties['region'];
  const listName: string = event.ResourceProperties['listName'];
  const solutionId = process.env['SOLUTION_ID'];
  const resolverClient = new Route53ResolverClient({
    customUserAgent: solutionId,
    region,
    retryStrategy: setRetryStrategy(),
  });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      let resourceId: string | undefined = undefined;

      const domainLists = [];
      const response = paginateListFirewallDomainLists({ client: resolverClient }, {});

      for await (const item of response) {
        for (const domainList of item.FirewallDomainLists ?? []) {
          domainLists.push(domainList);
        }
      }

      for (const firewallItem of domainLists ?? []) {
        if (firewallItem.Name === listName) {
          resourceId = firewallItem.Id;
          break;
        }
      }

      if (!resourceId) {
        throw new Error(`Managed domain list ${listName} does not exist.`);
      }

      return {
        PhysicalResourceId: resourceId,
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
