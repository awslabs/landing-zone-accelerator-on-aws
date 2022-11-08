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

import { delay, throttlingBackOff } from '@aws-accelerator/utils';
import * as AWS from 'aws-sdk';
AWS.config.logger = console;

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
  const solutionId = process.env['SOLUTION_ID'];

  const macie2Client = new AWS.Macie2({ region: region, customUserAgent: solutionId });

  const macieDelegatedAccount = await getMacieDelegatedAccount(macie2Client, adminAccountId);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      // Enable macie in management account required to create delegated admin account
      let macieStatus = await isMacieEnable(macie2Client);
      if (!macieStatus) {
        console.log('start enable of macie');
        await throttlingBackOff(() =>
          macie2Client
            .enableMacie({
              status: 'ENABLED',
            })
            .promise(),
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
        console.log(
          `Started enableOrganizationAdminAccount function in ${event.ResourceProperties['region']} region for account ${adminAccountId}`,
        );
        let retries = 0;
        while (retries < 10) {
          await delay(retries ** 2 * 1000);
          try {
            await throttlingBackOff(() =>
              macie2Client.enableOrganizationAdminAccount({ adminAccountId: adminAccountId }).promise(),
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
          macie2Client.disableOrganizationAdminAccount({ adminAccountId: macieDelegatedAccount.accountId! }).promise(),
        );
      }

      return { Status: 'Success', StatusCode: 200 };
  }
}

async function getMacieDelegatedAccount(
  macie2Client: AWS.Macie2,
  adminAccountId: string,
): Promise<{ accountId: string | undefined; status: boolean }> {
  const adminAccounts: AWS.Macie2.AdminAccount[] = [];

  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() => macie2Client.listOrganizationAdminAccounts({ nextToken }).promise());
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

async function isMacieEnable(macie2Client: AWS.Macie2): Promise<boolean> {
  try {
    const response = await throttlingBackOff(() => macie2Client.getMacieSession({}).promise());
    return response.status === 'ENABLED';
  } catch (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    e: any
  ) {
    if (
      // SDKv2 Error Structure
      e.code === 'ResourceConflictException' ||
      // SDKv3 Error Structure
      e.name === 'ResourceConflictException'
    ) {
      console.warn(e.name + ': ' + e.message);
      return false;
    }

    // This is required when macie is not enabled AccessDeniedException exception issues
    if (
      // SDKv2 Error Structure
      e.code === 'AccessDeniedException' ||
      // SDKv3 Error Structure
      e.name === 'AccessDeniedException'
    ) {
      console.warn(e.name + ': ' + e.message);
      return false;
    }
    throw new Error(`Macie enable issue error message - ${e}`);
  }
}
