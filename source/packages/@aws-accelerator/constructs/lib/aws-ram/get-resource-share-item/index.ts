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
 * get-resource-share-item - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Data: {
        arn: string;
      };
      Status: string;
    }
  | {
      PhysicalResourceId: string | undefined;
      Status: string;
    }
  | undefined
> {
  const ramClient = new AWS.RAM({ customUserAgent: process.env['SOLUTION_ID'] });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const resourceOwner = event.ResourceProperties['resourceOwner'];
      const resourceShareArn = event.ResourceProperties['resourceShareArn'];
      const resourceType = event.ResourceProperties['resourceType'];

      let nextToken: string | undefined = undefined;
      do {
        const page = await throttlingBackOff(() =>
          ramClient
            .listResources({ resourceShareArns: [resourceShareArn], resourceType, resourceOwner, nextToken })
            .promise(),
        );
        // Return the first item found with the specified filters
        if (page.resources && page.resources.length > 0) {
          const item = page.resources[0];
          if (item.arn) {
            console.log(item.arn);
            return {
              PhysicalResourceId: item.arn.split('/')[1],
              Data: {
                arn: item.arn,
              },
              Status: 'SUCCESS',
            };
          }
        }
        nextToken = page.nextToken;
      } while (nextToken);

      throw new Error(`Resource share item not found`);

    case 'Delete':
      // Do Nothing
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}
