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
import * as console from 'console';
import {
  Macie2Client,
  EnableOrganizationAdminAccountCommand,
  paginateListOrganizationAdminAccounts,
  AdminAccount,
} from '@aws-sdk/client-macie2';
import { OrganizationsClient, paginateListAccounts } from '@aws-sdk/client-organizations';

/**
 * enableOrganizationAdminAccount - lambda handler
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
  const adminAccountEmail = event.ResourceProperties['adminAccountEmail'];
  const region = event.ResourceProperties['region'];
  const organizationsClient = new OrganizationsClient({});
  const macie2Client = new Macie2Client({ region: region });

  let existingAdminAccountList: AdminAccount | undefined;

  console.log(
    `Started enableOrganizationAdminAccount function in ${event.ResourceProperties['region']} region for account with email ${adminAccountEmail}`,
  );

  for await (const page of paginateListOrganizationAdminAccounts({ client: macie2Client }, {})) {
    for (const account of page.adminAccounts ?? []) {
      existingAdminAccountList = account;
    }
  }

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      let adminAccountId: string | undefined = undefined;

      for await (const page of paginateListAccounts({ client: organizationsClient }, {})) {
        for (const account of page.Accounts ?? []) {
          if (account.Email == adminAccountEmail && account.Id) {
            adminAccountId = account.Id;
          }
        }
      }
      if (!adminAccountId) {
        throw new Error(`No Audit account found with email - ${adminAccountEmail}`);
      }

      if (existingAdminAccountList) {
        if (existingAdminAccountList.accountId === adminAccountId) {
          console.warn(
            `Macie admin account ${adminAccountId} is already an admin account as status is ${existingAdminAccountList.status}, in ${region} region. No action needed`,
          );
          return { Status: 'Success', StatusCode: 200 };
        }
      } else {
        console.log(`Enabing macie admin account ${adminAccountId} in ${region} region`);
        await throttlingBackOff(() =>
          macie2Client.send(new EnableOrganizationAdminAccountCommand({ adminAccountId: adminAccountId })),
        );
      }

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      // TO DO for Delete
      return { Status: 'Success', StatusCode: 200 };
  }
}
