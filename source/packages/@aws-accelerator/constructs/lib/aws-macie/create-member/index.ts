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
import * as AWS from 'aws-sdk';
AWS.config.logger = console;

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
  const partition = event.ResourceProperties['partition'];
  const adminAccountId = event.ResourceProperties['adminAccountId'];
  const solutionId = process.env['SOLUTION_ID'];

  let organizationsClient: AWS.Organizations;
  if (partition === 'aws-us-gov') {
    organizationsClient = new AWS.Organizations({ region: 'us-gov-west-1', customUserAgent: solutionId });
  } else if (partition === 'aws-cn') {
    organizationsClient = new AWS.Organizations({ region: 'cn-northwest-1', customUserAgent: solutionId });
  } else {
    organizationsClient = new AWS.Organizations({ region: 'us-east-1', customUserAgent: solutionId });
  }

  const macie2Client = new AWS.Macie2({ region: region, customUserAgent: solutionId });
  const allAccounts: AWS.Organizations.Account[] = [];
  const existingMembers: AWS.Macie2.Member[] = [];
  let isEnabled = false;

  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() => organizationsClient.listAccounts({ NextToken: nextToken }).promise());
    for (const account of page.Accounts ?? []) {
      allAccounts.push(account);
    }
    nextToken = page.NextToken;
  } while (nextToken);

  nextToken = undefined;
  do {
    const page = await throttlingBackOff(() => macie2Client.listMembers({ nextToken }).promise());
    for (const member of page.members ?? []) {
      existingMembers.push(member);
    }
    nextToken = page.nextToken;
  } while (nextToken);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      if (!(await isMacieEnable(macie2Client))) {
        console.log('start enable of macie');
        await throttlingBackOff(() =>
          macie2Client
            .enableMacie({
              status: 'ENABLED',
            })
            .promise(),
        );
      }

      for (const account of allAccounts.filter(item => item.Id !== adminAccountId) ?? []) {
        if (!existingMembers.find(member => member.accountId !== account.Id)) {
          console.log(`OU account - ${account.Id} macie membership status is "not a macie member", adding as a member`);
          await throttlingBackOff(() =>
            macie2Client
              .createMember({
                account: { accountId: account.Id!, email: account.Email! },
              })
              .promise(),
          );
        } else {
          console.warn(
            `OU account - ${account.Id} macie membership status is "a macie member", ignoring create member for the account!!`,
          );
        }
      }

      isEnabled = await isOrganizationAutoEnabled(macie2Client);

      if (!isEnabled) {
        await throttlingBackOff(() => macie2Client.updateOrganizationConfiguration({ autoEnable: true }).promise());
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
          await throttlingBackOff(() => macie2Client.disassociateMember({ id: account.Id! }).promise());
          await throttlingBackOff(() => macie2Client.deleteMember({ id: account.Id! }).promise());
        } else {
          console.warn(
            `OU account - ${account.Id} macie membership status is "not a macie member", ignoring removing member list!!`,
          );
        }
      }

      isEnabled = await isOrganizationAutoEnabled(macie2Client);
      if (isEnabled) {
        await throttlingBackOff(() => macie2Client.updateOrganizationConfiguration({ autoEnable: false }).promise());
      } else {
        console.warn('Delegation admin account Auto-Enable is OFF, so ignoring');
      }
      return { Status: 'Success', StatusCode: 200 };
  }
}

/**
 * Checking is organization auto enabled for new account
 * @param macieClient
 */
async function isOrganizationAutoEnabled(macieClient: AWS.Macie2): Promise<boolean> {
  console.log('calling isOrganizationAutoEnabled');
  const response = await throttlingBackOff(() => macieClient.describeOrganizationConfiguration({}).promise());
  return response.autoEnable ?? false;
}

/**
 * Checking Macie is enable or disabled
 * @param macie2Client
 */
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
