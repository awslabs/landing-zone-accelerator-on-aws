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

import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import { getGlobalRegion, setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';
import { Account, ListAccountsCommand, OrganizationsClient } from '@aws-sdk/client-organizations';
import {
  AccessDeniedException,
  ConflictException,
  CreateMemberCommand,
  DeleteMemberCommand,
  DescribeOrganizationConfigurationCommand,
  DisassociateMemberCommand,
  EnableMacieCommand,
  GetMacieSessionCommand,
  ListMembersCommand,
  Macie2Client,
  MacieStatus,
  Member,
  UpdateOrganizationConfigurationCommand,
} from '@aws-sdk/client-macie2';

/**
 * add-macie-members - lambda handler
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
  const partition = event.ResourceProperties['partition'];
  const adminAccountId = event.ResourceProperties['adminAccountId'];
  const solutionId = process.env['SOLUTION_ID'];
  const globalRegion = getGlobalRegion(partition);
  const organizationsClient = new OrganizationsClient({
    region: globalRegion,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });
  const macie2Client = new Macie2Client({
    region,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });
  const allAccounts: Account[] = [];
  const existingMembers: Member[] = [];
  let isEnabled = false;

  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      organizationsClient.send(new ListAccountsCommand({ NextToken: nextToken })),
    );
    for (const account of page.Accounts ?? []) {
      allAccounts.push(account);
    }
    nextToken = page.NextToken;
  } while (nextToken);

  nextToken = undefined;
  do {
    const page = await throttlingBackOff(() =>
      macie2Client.send(new ListMembersCommand({ nextToken, onlyAssociated: 'false' })),
    );
    for (const member of page.members ?? []) {
      existingMembers.push(member);
    }
    nextToken = page.nextToken;
  } while (nextToken);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      if (!(await isMacieEnable(macie2Client))) {
        await enableMacie(macie2Client);
      }

      for (const account of allAccounts.filter(item => item.Id !== adminAccountId) ?? []) {
        const existingMember = existingMembers.find(member => member.accountId !== account.Id);
        if (existingMember && existingMember.relationshipStatus === 'Removed') {
          console.log(
            `OU account - ${account.Id} macie membership status is "Removed", deleting member before adding again`,
          );
          await throttlingBackOff(() => macie2Client.send(new DeleteMemberCommand({ id: account.Id! })));
        }
        if (!existingMember || existingMember.relationshipStatus === 'Removed') {
          console.log(`OU account - ${account.Id} macie membership status is "not a macie member", adding as a member`);
          await throttlingBackOff(() =>
            macie2Client.send(
              new CreateMemberCommand({
                account: { accountId: account.Id!, email: account.Email! },
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
      for (const account of allAccounts.filter(item => item.Id !== adminAccountId) ?? []) {
        if (existingMembers.find(member => member.accountId !== account.Id)) {
          console.log(
            `OU account - ${account.Id} macie membership status is "a macie member", removing from member list`,
          );
          await throttlingBackOff(() => macie2Client.send(new DisassociateMemberCommand({ id: account.Id! })));
          await throttlingBackOff(() => macie2Client.send(new DeleteMemberCommand({ id: account.Id! })));
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
 * @param macie2Client
 */
async function isOrganizationAutoEnabled(macie2Client: Macie2Client): Promise<boolean> {
  console.log('calling isOrganizationAutoEnabled');
  const response = await throttlingBackOff(() => macie2Client.send(new DescribeOrganizationConfigurationCommand({})));
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
