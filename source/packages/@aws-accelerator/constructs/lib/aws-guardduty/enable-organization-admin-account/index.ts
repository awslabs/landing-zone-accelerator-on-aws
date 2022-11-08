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
 * enable-guardduty - lambda handler
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

  const guardDutyClient = new AWS.GuardDuty({ region: region, customUserAgent: solutionId });

  const guardDutyAdminAccount = await isGuardDutyEnable(guardDutyClient, adminAccountId);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      if (guardDutyAdminAccount.status) {
        if (guardDutyAdminAccount.accountId === adminAccountId) {
          console.warn(
            `GuardDuty admin account ${guardDutyAdminAccount.accountId} is already an admin account as status is ${guardDutyAdminAccount.status}, in ${region} region. No action needed`,
          );
          return { Status: 'Success', StatusCode: 200 };
        } else {
          console.warn(
            `GuardDuty delegated admin is already set to ${guardDutyAdminAccount.accountId} account can not assign another delegated account`,
          );
        }
      } else {
        console.log(
          `Started enableOrganizationAdminAccount function in ${event.ResourceProperties['region']} region for account ${adminAccountId}`,
        );

        let retries = 0;
        while (retries < 10) {
          await delay(retries ** 2 * 1000);
          console.log('enable');
          try {
            await throttlingBackOff(() =>
              guardDutyClient.enableOrganizationAdminAccount({ AdminAccountId: adminAccountId }).promise(),
            );
            console.log('command run');
            break;
          } catch (error) {
            console.log(error);
            retries = retries + 1;
          }
        }
      }

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      if (guardDutyAdminAccount.accountId) {
        if (guardDutyAdminAccount.accountId === adminAccountId) {
          console.log(
            `Started disableOrganizationAdminAccount function in ${event.ResourceProperties['region']} region for account ${adminAccountId}`,
          );
          await throttlingBackOff(() =>
            guardDutyClient
              .disableOrganizationAdminAccount({
                AdminAccountId: adminAccountId,
              })
              .promise(),
          );
        }
      }

      return { Status: 'Success', StatusCode: 200 };
  }
}

async function isGuardDutyEnable(
  guardDutyClient: AWS.GuardDuty,
  adminAccountId: string,
): Promise<{ accountId: string | undefined; status: string | undefined }> {
  const adminAccounts: AWS.GuardDuty.AdminAccount[] = [];
  let nextToken: string | undefined = undefined;
  console.log('isenabled');
  do {
    const page = await throttlingBackOff(() =>
      guardDutyClient.listOrganizationAdminAccounts({ NextToken: nextToken }).promise(),
    );
    for (const account of page.AdminAccounts ?? []) {
      adminAccounts.push(account);
      console.log(account);
    }
    nextToken = page.NextToken;
  } while (nextToken);
  if (adminAccounts.length === 0) {
    return { accountId: undefined, status: undefined };
  }
  if (adminAccounts.length > 1) {
    throw new Error('Multiple admin accounts for GuardDuty in organization');
  }

  if (adminAccounts[0].AdminAccountId === adminAccountId && adminAccounts[0].AdminStatus === 'DISABLE_IN_PROGRESS') {
    throw new Error(`Admin account ${adminAccounts[0].AdminAccountId} is in ${adminAccounts[0].AdminStatus}`);
  }

  return { accountId: adminAccounts[0].AdminAccountId, status: adminAccounts[0].AdminStatus };
}
