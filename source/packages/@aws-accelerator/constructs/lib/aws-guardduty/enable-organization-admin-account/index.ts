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
  AdminAccount,
  BadRequestException,
  DisableOrganizationAdminAccountCommand,
  EnableOrganizationAdminAccountCommand,
  GuardDutyClient,
  ListOrganizationAdminAccountsCommand,
} from '@aws-sdk/client-guardduty';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';
/**
 * enable-guardduty - lambda handler
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
  const region = event.ResourceProperties['region'];
  const adminAccountId = event.ResourceProperties['adminAccountId'];
  const solutionId = process.env['SOLUTION_ID'];

  const guardDutyClient = new GuardDutyClient({
    region,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });

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
          const message = `GuardDuty delegated admin is already set to ${guardDutyAdminAccount.accountId} account, cannot assign another delegated account ${adminAccountId}. Please remove ${guardDutyAdminAccount.accountId} as a delegated administrator and rerun the pipeline.`;
          console.warn(message);
          throw new Error(message);
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
              guardDutyClient.send(new EnableOrganizationAdminAccountCommand({ AdminAccountId: adminAccountId })),
            );
            console.log('command run');
            break;
          } catch (error) {
            if (
              error instanceof BadRequestException &&
              error.message ===
                'The request failed because another account is already enabled as GuardDuty delegated administrator for the organization.'
            ) {
              throw new Error(
                `Another account is already enabled as GuardDuty delegated administrator for the organization, can not assign another delegated account ${adminAccountId}. Please remove the existing delegated administrator in organization setting and rerun the pipeline.`,
              );
            }
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
            guardDutyClient.send(
              new DisableOrganizationAdminAccountCommand({
                AdminAccountId: adminAccountId,
              }),
            ),
          );
        }
      }

      return { Status: 'Success', StatusCode: 200 };
  }
}

async function isGuardDutyEnable(
  guardDutyClient: GuardDutyClient,
  adminAccountId: string,
): Promise<{ accountId: string | undefined; status: string | undefined }> {
  const adminAccounts: AdminAccount[] = [];
  let nextToken: string | undefined = undefined;
  console.log('isenabled');
  do {
    const page = await throttlingBackOff(() =>
      guardDutyClient.send(new ListOrganizationAdminAccountsCommand({ NextToken: nextToken })),
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
