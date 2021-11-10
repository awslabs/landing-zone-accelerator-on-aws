/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { RAMClient, paginateGetResourceShares } from '@aws-sdk/client-ram';

/**
 * get-resource-share - lambda handler
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
  const ramClient = new RAMClient({});

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const resourceOwner = event.ResourceProperties['resourceOwner'];
      const owningAccountId = event.ResourceProperties['owningAccountId'];
      const name = event.ResourceProperties['name'];

      for await (const page of paginateGetResourceShares(
        { client: ramClient },
        {
          resourceOwner,
        },
      )) {
        for (const resourceShare of page.resourceShares ?? []) {
          if (resourceShare.owningAccountId == owningAccountId && resourceShare.name === name) {
            console.log(resourceShare);

            if (resourceShare.resourceShareArn) {
              return {
                PhysicalResourceId: resourceShare.resourceShareArn.split('/')[1],
                Status: 'SUCCESS',
              };
            }
          }
        }
      }

      throw new Error(`Resource share ${name} not found`);

    case 'Delete':
      // Do Nothing
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}
