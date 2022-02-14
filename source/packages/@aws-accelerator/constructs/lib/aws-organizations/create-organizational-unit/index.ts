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

import { throttlingBackOff } from '@aws-accelerator/utils';
import * as AWS from 'aws-sdk';
AWS.config.logger = console;

/**
 * create-organizational-unit - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Data: {
        Arn: string | undefined;
      };
      Status: string;
    }
  | {
      PhysicalResourceId: string | undefined;
      Status: string;
    }
  | undefined
> {
  const name: string = event.ResourceProperties['name'];
  const path: string = event.ResourceProperties['path'];
  const partition = event.ResourceProperties['partition'];

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      let organizationsClient: AWS.Organizations;
      if (partition === 'aws-us-gov') {
        organizationsClient = new AWS.Organizations({ region: 'us-gov-west-1' });
      } else {
        organizationsClient = new AWS.Organizations({ region: 'us-east-1' });
      }

      let rootId = '';

      let nextToken: string | undefined = undefined;
      do {
        const page = await throttlingBackOff(() => organizationsClient.listRoots({ NextToken: nextToken }).promise());
        for (const item of page.Roots ?? []) {
          if (item.Name === 'Root' && item.Id && item.Arn) {
            rootId = item.Id;
          }
        }
        nextToken = page.NextToken;
      } while (nextToken);

      let parentId = rootId;

      for (const parent of path.split('/')) {
        if (parent) {
          let nextToken: string | undefined = undefined;
          do {
            const page = await throttlingBackOff(() =>
              organizationsClient
                .listOrganizationalUnitsForParent({ ParentId: parentId, NextToken: nextToken })
                .promise(),
            );
            for (const ou of page.OrganizationalUnits ?? []) {
              if (ou.Name === parent && ou.Id) {
                parentId = ou.Id;
              }
            }
            nextToken = page.NextToken;
          } while (nextToken);
        }
      }

      // Check if OU already exists for the specified parent, update
      // and return the ID
      nextToken = undefined;
      do {
        const page = await throttlingBackOff(() =>
          organizationsClient.listOrganizationalUnitsForParent({ ParentId: parentId, NextToken: nextToken }).promise(),
        );
        for (const organizationalUnit of page.OrganizationalUnits ?? []) {
          if (organizationalUnit.Name === name) {
            console.log('Existing OU found');
            const response = await throttlingBackOff(() =>
              organizationsClient
                .updateOrganizationalUnit({
                  Name: name,
                  OrganizationalUnitId: organizationalUnit.Id!,
                })
                .promise(),
            );
            console.log(response.OrganizationalUnit?.Id);
            return {
              PhysicalResourceId: response.OrganizationalUnit?.Id,
              Data: {
                Arn: response.OrganizationalUnit?.Arn,
              },
              Status: 'SUCCESS',
            };
          }
        }
        nextToken = page.NextToken;
      } while (nextToken);

      // Create the OU if not found
      const response = await throttlingBackOff(() =>
        organizationsClient
          .createOrganizationalUnit({
            Name: name,
            ParentId: parentId,
          })
          .promise(),
      );
      console.log(response.OrganizationalUnit?.Id);
      return {
        PhysicalResourceId: response.OrganizationalUnit?.Id,
        Data: {
          Arn: response.OrganizationalUnit?.Arn,
        },
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
