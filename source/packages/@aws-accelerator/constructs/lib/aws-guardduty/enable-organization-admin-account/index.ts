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
  AdminAccount,
  AdminStatus,
  GuardDutyClient,
  paginateListOrganizationAdminAccounts,
  EnableOrganizationAdminAccountCommand,
  DisableOrganizationAdminAccountCommand,
} from '@aws-sdk/client-guardduty';

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

  const guardDutyClient = new GuardDutyClient({ region: region });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      if (!(await isGuardDutyEnable(guardDutyClient, adminAccountId))) {
        console.log('start - EnableOrganizationAdminAccountCommand');
        await throttlingBackOff(() =>
          guardDutyClient.send(new EnableOrganizationAdminAccountCommand({ AdminAccountId: adminAccountId })),
        );
      }

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      if (await isGuardDutyEnable(guardDutyClient, adminAccountId)) {
        await throttlingBackOff(() =>
          guardDutyClient.send(
            new DisableOrganizationAdminAccountCommand({
              AdminAccountId: adminAccountId,
            }),
          ),
        );
      }

      return { Status: 'Success', StatusCode: 200 };
  }
}

async function isGuardDutyEnable(guardDutyClient: GuardDutyClient, adminAccountId: string): Promise<boolean> {
  const adminAccounts: AdminAccount[] = [];
  for await (const page of paginateListOrganizationAdminAccounts({ client: guardDutyClient }, {})) {
    for (const account of page.AdminAccounts ?? []) {
      adminAccounts.push(account);
    }
  }
  if (adminAccounts.length === 0) {
    return false;
  }
  if (adminAccounts.length > 1) {
    throw new Error('Multiple admin accounts for GuardDuty in organization');
  }

  if (
    adminAccounts[0].AdminAccountId === adminAccountId &&
    adminAccounts[0].AdminStatus === AdminStatus.DISABLE_IN_PROGRESS
  ) {
    throw new Error(`Admin account ${adminAccounts[0].AdminAccountId} is in ${adminAccounts[0].AdminStatus}`);
  }

  return true;
}
