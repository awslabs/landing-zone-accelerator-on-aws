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
  const partition = event.ResourceProperties['partition'];

  let organizationsClient: AWS.Organizations;
  if (partition === 'aws-us-gov') {
    organizationsClient = new AWS.Organizations({ region: 'us-gov-west-1' });
  } else {
    organizationsClient = new AWS.Organizations({ region: 'us-east-1' });
  }
  const securityHubClient = new AWS.SecurityHub({ region: region });

  // Enable security hub is admin account before creating delegation admin account, if this wasn't enabled by organization delegation
  await enableSecurityHub(securityHubClient);

  const allAccounts: AWS.SecurityHub.AccountDetails[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() => organizationsClient.listAccounts({ NextToken: nextToken }).promise());
    for (const account of page.Accounts ?? []) {
      allAccounts.push({ AccountId: account.Id!, Email: account.Email });
    }
    nextToken = page.NextToken;
  } while (nextToken);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log('starting - CreateMembersCommand');

      await throttlingBackOff(() => securityHubClient.createMembers({ AccountDetails: allAccounts }).promise());

      await throttlingBackOff(() => securityHubClient.updateOrganizationConfiguration({ AutoEnable: true }).promise());

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      const existingMemberAccountIds: string[] = [];
      let nextToken: string | undefined = undefined;
      do {
        const page = await throttlingBackOff(() => securityHubClient.listMembers({ NextToken: nextToken }).promise());
        for (const member of page.Members ?? []) {
          console.log(member);
          existingMemberAccountIds.push(member.AccountId!);
        }
        nextToken = page.NextToken;
      } while (nextToken);

      await throttlingBackOff(() =>
        securityHubClient.disassociateMembers({ AccountIds: existingMemberAccountIds }).promise(),
      );

      await throttlingBackOff(() =>
        securityHubClient.deleteMembers({ AccountIds: existingMemberAccountIds }).promise(),
      );

      return { Status: 'Success', StatusCode: 200 };
  }
}

async function enableSecurityHub(securityHubClient: AWS.SecurityHub): Promise<void> {
  try {
    console.log('inside enableSecurityHub');
    await throttlingBackOff(() => securityHubClient.enableSecurityHub({ EnableDefaultStandards: false }).promise());
  } catch (e) {
    if (`${e}`.includes('Account is already subscribed to Security Hub')) {
      console.warn(`Securityhub is already enabled, error message got ${e}`);
      return;
    }
    throw new Error(`SecurityHub enable issue error message - ${e}`);
  }
}
