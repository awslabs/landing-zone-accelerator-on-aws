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
 * share-document - lambda handler
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
  const name = event.ResourceProperties['name'];
  const accountIds: string[] = event.ResourceProperties['accountIds'];
  const ssmClient = new AWS.SSM({});

  const documentPermission = await throttlingBackOff(() =>
    ssmClient.describeDocumentPermission({ Name: name, PermissionType: 'Share' }).promise(),
  );
  console.log('DescribeDocumentPermissionCommand:');
  console.log(JSON.stringify(documentPermission));

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const accountIdsToAdd: string[] = [];
      const accountIdsToRemove: string[] = [];

      // Identify accounts to add
      accountIds.forEach(accountId => {
        if (!documentPermission.AccountIds?.includes(accountId)) {
          accountIdsToAdd.push(accountId);
        }
      });

      // Identify accounts to remove
      documentPermission.AccountIds?.forEach(accountId => {
        if (!accountIds.includes(accountId)) {
          accountIdsToRemove.push(accountId);
        }
      });

      console.log(`accountIdsToAdd: ${accountIdsToAdd}`);
      console.log(`accountIdsToRemove: ${accountIdsToRemove}`);

      const response = await throttlingBackOff(() =>
        ssmClient
          .modifyDocumentPermission({
            Name: name,
            PermissionType: 'Share',
            AccountIdsToAdd: accountIdsToAdd,
            AccountIdsToRemove: accountIdsToRemove,
          })
          .promise(),
      );
      console.log('ModifyDocumentPermissionCommand:');
      console.log(JSON.stringify(response));

      return {
        PhysicalResourceId: 'share-document',
        Status: 'SUCCESS',
      };

    case 'Delete':
      console.log('Start un-sharing the document');
      console.log('Following accounts to be un-share');
      console.log(documentPermission.AccountIds);
      // Remove sharing
      await throttlingBackOff(() =>
        ssmClient
          .modifyDocumentPermission({
            Name: name,
            PermissionType: 'Share',
            AccountIdsToRemove: documentPermission.AccountIds,
          })
          .promise(),
      );
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}
