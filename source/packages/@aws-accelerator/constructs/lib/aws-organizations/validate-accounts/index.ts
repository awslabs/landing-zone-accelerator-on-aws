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
 * validate-organization-accounts - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      Status: string | undefined;
      StatusCode: number | undefined;
    }
  | undefined
> {
  const tableName = event.ResourceProperties['tableName'];
  const configAccounts = event.ResourceProperties['accounts'];
  const partition = event.ResourceProperties['partition'];

  const dynamoDBClient = new AWS.DynamoDB({});
  let organizationsClient: AWS.Organizations;
  if (partition === 'aws-us-gov') {
    organizationsClient = new AWS.Organizations({ region: 'us-gov-west-1' });
  } else {
    organizationsClient = new AWS.Organizations({ region: 'us-east-1' });
  }

  const validationErrors: string[] = [];

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const organizationAccounts: { email: string; status: string | undefined }[] = [];
      let nextToken: string | undefined = undefined;
      do {
        const page = await throttlingBackOff(() =>
          organizationsClient.listAccounts({ NextToken: nextToken }).promise(),
        );
        for (const account of page.Accounts ?? []) {
          organizationAccounts.push({ email: account.Email!, status: account.Status });
        }
        nextToken = page.NextToken;
      } while (nextToken);

      for (const configAccount of configAccounts) {
        const existingAccount = organizationAccounts.find(item => item.email === configAccount.email);
        if (existingAccount) {
          if (existingAccount.status !== 'ACTIVE') {
            validationErrors.push(
              `Organization account with ${existingAccount.email} email in ${existingAccount.status} status`,
            );
          }
        } else {
          const putItemParams = {
            TableName: tableName,
            Item: {
              accountEmail: {
                S: configAccount.email,
              },
              accountConfig: {
                S: JSON.stringify(configAccount),
              },
            },
            ReturnConsumedCapacity: 'NONE',
          };
          await throttlingBackOff(() => dynamoDBClient.putItem(putItemParams).promise());
        }
      }

      if (validationErrors.length > 0) {
        throw new Error(validationErrors.toString());
      }

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      // DO Nothing
      return { Status: 'Success', StatusCode: 200 };
  }
}
