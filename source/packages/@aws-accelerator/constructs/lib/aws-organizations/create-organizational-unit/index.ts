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
import {
  CreateOrganizationalUnitCommand,
  OrganizationsClient,
  paginateListOrganizationalUnitsForParent,
  UpdateOrganizationalUnitCommand,
} from '@aws-sdk/client-organizations';

/**
 * create-organizational-unit - lambda handler
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
  const name: string = event.ResourceProperties['name'];
  const parentId: string = event.ResourceProperties['parentId'];

  const organizationsClient = new OrganizationsClient({});

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      // Check if OU already exists for the specified parent, update
      // and return the ID
      for await (const page of paginateListOrganizationalUnitsForParent(
        { client: organizationsClient },
        { ParentId: parentId },
      )) {
        for (const organizationalUnit of page.OrganizationalUnits ?? []) {
          if (organizationalUnit.Name === name) {
            console.log('Existing OU found');
            const response = await throttlingBackOff(() =>
              organizationsClient.send(
                new UpdateOrganizationalUnitCommand({
                  Name: name,
                  OrganizationalUnitId: organizationalUnit.Id,
                }),
              ),
            );
            console.log(response.OrganizationalUnit?.Id);
            return {
              PhysicalResourceId: response.OrganizationalUnit?.Id,
              Status: 'SUCCESS',
            };
          }
        }
      }
      // Create the OU if not found
      const response = await throttlingBackOff(() =>
        organizationsClient.send(
          new CreateOrganizationalUnitCommand({
            Name: name,
            ParentId: parentId,
          }),
        ),
      );
      console.log(response.OrganizationalUnit?.Id);
      return {
        PhysicalResourceId: response.OrganizationalUnit?.Id,
        Status: 'SUCCESS',
      };

    case 'Delete':
      // Do Nothing, we will leave any created OUs behind
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}
