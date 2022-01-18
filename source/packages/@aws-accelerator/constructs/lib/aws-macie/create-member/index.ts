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
  EnableMacieCommand,
  GetMacieSessionCommand,
  CreateMemberCommand,
  DeleteMemberCommand,
  DescribeOrganizationConfigurationCommand,
  DisassociateMemberCommand,
  Macie2Client,
  Member,
  MacieStatus,
  UpdateOrganizationConfigurationCommand,
  paginateListMembers,
} from '@aws-sdk/client-macie2';
import { Account, OrganizationsClient, paginateListAccounts } from '@aws-sdk/client-organizations';

/**
 * add-macie-members - lambda handler
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

  const organizationsClient = new OrganizationsClient({});
  const macie2Client = new Macie2Client({ region: region });
  const allAccounts: Account[] = [];
  const existingMembers: Member[] = [];
  let isEnabled = false;

  for await (const page of paginateListAccounts({ client: organizationsClient }, {})) {
    for (const account of page.Accounts ?? []) {
      allAccounts.push(account);
    }
  }

  for await (const page of paginateListMembers({ client: macie2Client }, {})) {
    for (const member of page.members ?? []) {
      existingMembers.push(member);
    }
  }

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      if (!(await isMacieEnable(macie2Client))) {
        console.log('start enable of macie');
        await throttlingBackOff(() =>
          macie2Client.send(
            new EnableMacieCommand({
              status: MacieStatus.ENABLED,
            }),
          ),
        );
      }

      for (const account of allAccounts.filter(account => account.Id !== adminAccountId) ?? []) {
        if (!existingMembers!.find(member => member.accountId !== account.Id)) {
          console.log(`OU account - ${account.Id} macie membership status is "not a macie member", adding as a member`);
          await throttlingBackOff(() =>
            macie2Client.send(
              new CreateMemberCommand({
                account: { accountId: account.Id, email: account.Email },
              }),
            ),
          );
        } else {
          console.warn(
            `OU account - ${account.Id} macie membership status is "a macie member", ignoring create member for the account!!`,
          );
        }
      }

      isEnabled = await isOrganizationAutoEnabled(macie2Client);

      if (!isEnabled) {
        await throttlingBackOff(() =>
          macie2Client.send(new UpdateOrganizationConfigurationCommand({ autoEnable: true })),
        );
      } else {
        console.warn('Delegation admin account Auto-Enable is ON, so ignoring');
      }
      return { Status: 'Success', StatusCode: 200 };
    case 'Delete':
      for (const account of allAccounts.filter(account => account.Id !== adminAccountId) ?? []) {
        if (existingMembers!.find(member => member.accountId !== account.Id)) {
          console.log(
            `OU account - ${account.Id} macie membership status is "a macie member", removing from member list`,
          );
          await throttlingBackOff(() => macie2Client.send(new DisassociateMemberCommand({ id: account.Id })));
          await throttlingBackOff(() => macie2Client.send(new DeleteMemberCommand({ id: account.Id })));
        } else {
          console.warn(
            `OU account - ${account.Id} macie membership status is "not a macie member", ignoring removing member list!!`,
          );
        }
      }

      isEnabled = await isOrganizationAutoEnabled(macie2Client);
      if (isEnabled) {
        await throttlingBackOff(() =>
          macie2Client.send(new UpdateOrganizationConfigurationCommand({ autoEnable: false })),
        );
      } else {
        console.warn('Delegation admin account Auto-Enable is OFF, so ignoring');
      }
      return { Status: 'Success', StatusCode: 200 };
  }
}

/**
 * Checking is organization auto enabled for new account
 * @param macie2Clinet
 */
async function isOrganizationAutoEnabled(macie2Clinet: Macie2Client): Promise<boolean> {
  console.log('calling isOrganizationAutoEnabled');
  const response = await throttlingBackOff(() => macie2Clinet.send(new DescribeOrganizationConfigurationCommand({})));
  return response.autoEnable ?? false;
}

/**
 * Checking Macie is enable or disabled
 * @param macie2Client
 */
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
