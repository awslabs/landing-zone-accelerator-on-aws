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
import {
  Administrator,
  DetectiveClient,
  ListOrganizationAdminAccountsCommand,
  DisableOrganizationAdminAccountCommand,
  EnableOrganizationAdminAccountCommand,
} from '@aws-sdk/client-detective';

/**
 * enable-detective - lambda handler
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
  const region = event.ResourceProperties['region'];
  const adminAccountId = event.ResourceProperties['adminAccountId'];
  const solutionId = process.env['SOLUTION_ID'];

  const detectiveClient = new DetectiveClient({ region: region, customUserAgent: solutionId });

  const detectiveAdminAccount = await isDetectiveEnable(detectiveClient);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      if (detectiveAdminAccount.accountId === undefined) {
        console.log(
          `Started enableOrganizationAdminAccount function in ${event.ResourceProperties['region']} region for account ${adminAccountId}`,
        );
        await throttlingBackOff(() =>
          detectiveClient.send(new EnableOrganizationAdminAccountCommand({ AccountId: adminAccountId })),
        );
        return { Status: 'Success', StatusCode: 200 };
      } else {
        if (detectiveAdminAccount.accountId === adminAccountId) {
          console.warn(
            `Detective admin account ${detectiveAdminAccount.accountId} is already an admin account, in ${region} region. No action needed`,
          );
          return { Status: 'Success', StatusCode: 200 };
        }
        if (detectiveAdminAccount.accountId !== adminAccountId) {
          console.warn(
            `Detective delegated admin is already set to ${detectiveAdminAccount.accountId} account can not assign another delegated account`,
          );
          return { Status: 'Success', StatusCode: 200 };
        }

        return { Status: 'Success', StatusCode: 200 };
      }

    case 'Delete':
      if (detectiveAdminAccount.accountId) {
        if (detectiveAdminAccount.accountId === adminAccountId) {
          console.log(
            `Started disableOrganizationAdminAccount function in ${event.ResourceProperties['region']} region for account ${adminAccountId}`,
          );
          detectiveClient.send(new DisableOrganizationAdminAccountCommand({ AccountId: adminAccountId }));
        }
      } else {
        if (detectiveAdminAccount.accountId !== adminAccountId) {
          console.warn(
            `Detective delegated admin is already set to ${detectiveAdminAccount.accountId} account which differs from the config. Skipping the removal of the delegated admin for AWS Detective.`,
          );
        }
      }

      return { Status: 'Success', StatusCode: 200 };
  }
}

async function isDetectiveEnable(detectiveClient: DetectiveClient): Promise<{ accountId: string | undefined }> {
  const adminAccounts: Administrator[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      detectiveClient.send(new ListOrganizationAdminAccountsCommand({ NextToken: nextToken })),
    );
    for (const account of page.Administrators ?? []) {
      console.log(account);
      adminAccounts.push(account);
    }
    nextToken = page.NextToken;
  } while (nextToken);
  if (adminAccounts.length === 0) {
    return { accountId: undefined };
  }
  if (adminAccounts.length > 1) {
    throw new Error('Multiple admin accounts for Detective in organization');
  }

  return { accountId: adminAccounts[0].AccountId };
}
