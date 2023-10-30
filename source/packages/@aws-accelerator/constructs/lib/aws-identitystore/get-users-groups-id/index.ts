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

import { throttlingBackOff } from '@aws-accelerator/utils';
import * as AWS from 'aws-sdk';
AWS.config.logger = console;

/**
 * get-users-groups-id - lambda handler
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
      const iamClient = new AWS.IdentityStore({
        customUserAgent: process.env['SOLUTION_ID'],
      });

      const identityStoreId = event.ResourceProperties['identityStoreId'];
      const principalType: string = event.ResourceProperties['principalType'];
      const principalName: string = event.ResourceProperties['principalName'];

      let principalId: string | undefined;

      if (principalType === 'USER') {
        let nextToken: string | undefined = undefined;
        do {
          const page = await throttlingBackOff(() =>
            iamClient
              .listUsers({
                IdentityStoreId: identityStoreId,
                Filters: [{ AttributePath: 'UserName', AttributeValue: principalName }],
              })
              .promise(),
          );
          validateNumberOfPrincipals(page.Users, principalName, principalType, identityStoreId, principalId);

          for (const user of page.Users ?? []) {
            principalId = user.UserId;
          }
          nextToken = page.NextToken;
        } while (nextToken);
      } else if (principalType === 'GROUP') {
        let nextToken: string | undefined = undefined;
        do {
          const page = await throttlingBackOff(() =>
            iamClient
              .listGroups({
                IdentityStoreId: identityStoreId,
                Filters: [{ AttributePath: 'DisplayName', AttributeValue: principalName }],
              })
              .promise(),
          );

          validateNumberOfPrincipals(page.Groups, principalName, principalType, identityStoreId, principalId);
          for (const group of page.Groups ?? []) {
            principalId = group.GroupId;
          }

          nextToken = page.NextToken;
        } while (nextToken);
      } else {
        console.error(`Invalid principal type ${principalType}`);
        return {
          PhysicalResourceId: undefined,
          Status: 'FAILURE',
        };
      }

      return {
        PhysicalResourceId: principalId,
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

function validateNumberOfPrincipals(
  principalArray: AWS.IdentityStore.Users | AWS.IdentityStore.Groups,
  principalName: string,
  principalType: string,
  identityStoreId: string,
  principalId: string | undefined,
): { PhysicalResourceId: undefined; Status: string } | boolean {
  if (principalArray.length > 1 && principalId) {
    console.error(`Multiple ${principalName} of ${principalType} found in identity store ${identityStoreId}!!!!`);
    return {
      PhysicalResourceId: undefined,
      Status: 'FAILURE',
    };
  }

  return true;
}
