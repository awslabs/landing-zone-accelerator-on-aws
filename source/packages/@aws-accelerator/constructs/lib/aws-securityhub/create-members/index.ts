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
import { OrganizationsClient, paginateListAccounts } from '@aws-sdk/client-organizations';
import {
  AccountDetails,
  CreateMembersCommand,
  DeleteMembersCommand,
  DisassociateMembersCommand,
  EnableSecurityHubCommand,
  SecurityHubClient,
  UpdateOrganizationConfigurationCommand,
  paginateListMembers,
} from '@aws-sdk/client-securityhub';

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

  const organizationsClient = new OrganizationsClient({});
  const securityHubClient = new SecurityHubClient({ region: region });

  // Enable security hub is admin account before creating delegation admin account, if this wasn't enabled by organization delegation
  await enableSecurityHub(securityHubClient);

  const allAccounts: AccountDetails[] = [];
  for await (const page of paginateListAccounts({ client: organizationsClient }, {})) {
    for (const account of page.Accounts ?? []) {
      allAccounts.push({ AccountId: account.Id, Email: account.Email });
    }
  }

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log('starting - CreateMembersCommand');

      await throttlingBackOff(() => securityHubClient.send(new CreateMembersCommand({ AccountDetails: allAccounts })));

      await throttlingBackOff(() =>
        securityHubClient.send(new UpdateOrganizationConfigurationCommand({ AutoEnable: true })),
      );

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      const existingMemberAccountIds: string[] = [];
      for await (const page of paginateListMembers({ client: securityHubClient }, {})) {
        for (const member of page.Members ?? []) {
          console.log(member);
          existingMemberAccountIds.push(member.AccountId!);
        }
      }

      await throttlingBackOff(() =>
        securityHubClient.send(new DisassociateMembersCommand({ AccountIds: existingMemberAccountIds })),
      );

      await throttlingBackOff(() =>
        securityHubClient.send(new DeleteMembersCommand({ AccountIds: existingMemberAccountIds })),
      );

      return { Status: 'Success', StatusCode: 200 };
  }
}

async function enableSecurityHub(securityHubClient: SecurityHubClient): Promise<void> {
  try {
    console.log('inside enableSecurityHub');
    await throttlingBackOff(() =>
      securityHubClient.send(new EnableSecurityHubCommand({ EnableDefaultStandards: false })),
    );
  } catch (e) {
    if (`${e}`.includes('Account is already subscribed to Security Hub')) {
      console.warn(`Securityhub is already enabled, error message got ${e}`);
      return;
    }
    throw new Error(`SecurityHub enable issue error message - ${e}`);
  }
}
