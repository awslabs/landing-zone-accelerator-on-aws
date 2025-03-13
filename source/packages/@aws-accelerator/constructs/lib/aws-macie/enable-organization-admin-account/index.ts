/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { delay, throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import {
  AccessDeniedException,
  AdminAccount,
  ConflictException,
  DisableOrganizationAdminAccountCommand,
  EnableMacieCommand,
  EnableOrganizationAdminAccountCommand,
  GetMacieSessionCommand,
  ListOrganizationAdminAccountsCommand,
  Macie2Client,
  MacieStatus,
} from '@aws-sdk/client-macie2';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';

/**
 * enableOrganizationAdminAccount - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      Status: string | undefined;
      StatusCode: number | undefined;
    }
  | undefined
> {
  const adminAccountId = event.ResourceProperties['adminAccountId'];
  const region = event.ResourceProperties['region'];
  const solutionId = process.env['SOLUTION_ID'];

  const macie2Client = new Macie2Client({
    region,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });

  const macieDelegatedAccount = await getMacieDelegatedAccount(macie2Client, adminAccountId);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      // Enable macie in management account required to create delegated admin account
      let macieStatus = await isMacieEnable(macie2Client);
      if (!macieStatus) {
        await enableMacie(macie2Client);
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
        console.log(
          `Started enableOrganizationAdminAccount function in ${event.ResourceProperties['region']} region for account ${adminAccountId}`,
        );
        let retries = 0;
        while (retries < 10) {
          await delay(retries ** 2 * 1000);
          try {
            await throttlingBackOff(() =>
              macie2Client.send(new EnableOrganizationAdminAccountCommand({ adminAccountId: adminAccountId })),
            );
            break;
          } catch (error) {
            console.log(error);
            retries = retries + 1;
          }
        }
      }

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      if (macieDelegatedAccount.status) {
        console.log(
          `Started disableOrganizationAdminAccount function in ${event.ResourceProperties['region']} region for account ${adminAccountId}`,
        );
        await throttlingBackOff(() =>
          macie2Client.send(
            new DisableOrganizationAdminAccountCommand({ adminAccountId: macieDelegatedAccount.accountId! }),
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

  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      macie2Client.send(new ListOrganizationAdminAccountsCommand({ nextToken })),
    );
    for (const account of page.adminAccounts ?? []) {
      adminAccounts.push(account);
    }
    nextToken = page.nextToken;
  } while (nextToken);

  if (adminAccounts.length === 0) {
    return { accountId: undefined, status: false };
  }
  if (adminAccounts.length > 1) {
    throw new Error('Multiple admin accounts for Macie in organization');
  }

  if (adminAccounts[0].accountId === adminAccountId && adminAccounts[0].status === 'DISABLING_IN_PROGRESS') {
    throw new Error(`Admin account ${adminAccounts[0].accountId} is in ${adminAccounts[0].status}`);
  }

  return { accountId: adminAccounts[0].accountId, status: true };
}

async function isMacieEnable(macie2Client: Macie2Client): Promise<boolean> {
  try {
    const response = await throttlingBackOff(() => macie2Client.send(new GetMacieSessionCommand({})));
    return response.status === MacieStatus.ENABLED;
  } catch (e: unknown) {
    // This is required when macie is not enabled AccessDeniedException exception issues
    if (e instanceof AccessDeniedException) {
      console.warn(e.name + ': ' + e.message);
      return false;
    }
    throw e;
  }
}

/**
 * Function to Enable Macie
 * @param macie2Client {@link Macie2Client}
 */
async function enableMacie(macie2Client: Macie2Client): Promise<void> {
  try {
    console.log('start enable of macie');
    await throttlingBackOff(() =>
      macie2Client.send(
        new EnableMacieCommand({
          status: MacieStatus.ENABLED,
        }),
      ),
    );
  } catch (e: unknown) {
    // This is required when macie is already enabled ConflictException exception issues
    if (e instanceof ConflictException) {
      console.warn(`Macie already enabled`);
      console.warn(e.name + ': ' + e.message);
      return;
    }
    throw e;
  }
}
