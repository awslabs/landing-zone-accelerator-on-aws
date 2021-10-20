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
  AdminAccount,
  AdminStatus,
  DisableOrganizationAdminAccountCommand,
  EnableMacieCommand,
  EnableOrganizationAdminAccountCommand,
  GetMacieSessionCommand,
  Macie2Client,
  MacieStatus,
  paginateListOrganizationAdminAccounts,
} from '@aws-sdk/client-macie2';
import * as console from 'console';

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
  const adminAccountId = event.ResourceProperties['adminAccountId'];
  const region = event.ResourceProperties['region'];
  const macie2Client = new Macie2Client({ region: region });

  const macieDelegatedAccount = await getMacieDelegatedAccount(macie2Client, adminAccountId);

  console.log(
    `Started enableOrganizationAdminAccount function in ${event.ResourceProperties['region']} region for account ${adminAccountId}`,
  );

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      // Enable macie in management account required to create delegated admin account
      let macieStatus = await isMacieEnable(macie2Client);
      if (!macieStatus) {
        console.log('start enable of macie');
        await throttlingBackOff(() =>
          macie2Client.send(
            new EnableMacieCommand({
              status: MacieStatus.ENABLED,
            }),
          ),
        );
      }

      // macie status do not change immediately causing failure to other processes, so wait till macie enabled
      while (!macieStatus) {
        console.log(`checking macie status ${macieStatus}`);
        macieStatus = await isMacieEnable(macie2Client);
      }

      if (macieDelegatedAccount.status) {
        if (macieDelegatedAccount.accountId === adminAccountId) {
          console.warn(
            `Macie admin account ${macieDelegatedAccount.accountId} is already an admin account as status is ${macieDelegatedAccount.status}, in ${region} region. No action needed`,
          );
          return { Status: 'Success', StatusCode: 200 };
        } else {
          console.warn(
            `Macie delegated admin is already set to ${macieDelegatedAccount.accountId} account can not assign another delegated account`,
          );
        }
      } else {
        console.log(`Enabling macie admin account ${adminAccountId} in ${region} region`);
        await throttlingBackOff(() =>
          macie2Client.send(new EnableOrganizationAdminAccountCommand({ adminAccountId: adminAccountId })),
        );
      }

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      if (macieDelegatedAccount.status) {
        await throttlingBackOff(() =>
          macie2Client.send(
            new DisableOrganizationAdminAccountCommand({ adminAccountId: macieDelegatedAccount.accountId }),
          ),
        );
      }

      return { Status: 'Success', StatusCode: 200 };
  }
}

async function getMacieDelegatedAccount(
  macie2Client: Macie2Client,
  adminAccountId: string,
): Promise<{ accountId: string | undefined; status: boolean }> {
  const adminAccounts: AdminAccount[] = [];
  for await (const page of paginateListOrganizationAdminAccounts({ client: macie2Client }, {})) {
    for (const account of page.adminAccounts ?? []) {
      adminAccounts.push(account);
    }
  }
  if (adminAccounts.length === 0) {
    return { accountId: undefined, status: false };
  }
  if (adminAccounts.length > 1) {
    throw new Error('Multiple admin accounts for GuardDuty in organization');
  }

  if (adminAccounts[0].accountId === adminAccountId && adminAccounts[0].status === AdminStatus.DISABLING_IN_PROGRESS) {
    throw new Error(`Admin account ${adminAccounts[0].accountId} is in ${adminAccounts[0].status}`);
  }

  return { accountId: adminAccounts[0].accountId, status: true };
}

async function isMacieEnable(macie2Client: Macie2Client): Promise<boolean> {
  try {
    const response = await throttlingBackOff(() => macie2Client.send(new GetMacieSessionCommand({})));
    return response.status === MacieStatus.ENABLED;
  } catch (e) {
    if (`${e}`.includes('Macie is not enabled')) {
      console.warn('Macie is not enabled');
      return false;
    } else {
      throw e;
    }
  }
}
