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
import { ListAccountsCommand, ListAccountsCommandOutput } from '@aws-sdk/client-organizations';
import {
  CreateMembersCommand,
  DeleteMembersCommand,
  DisassociateMembersCommand,
  EnableSecurityHubCommand,
  ListMembersCommand,
  SecurityHubClient,
  UpdateOrganizationConfigurationCommand,
  AccountDetails,
} from '@aws-sdk/client-securityhub';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import { chunkArray, setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';
import { setOrganizationsClient } from '@aws-accelerator/utils/lib/set-organizations-client';

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
  const partition = event.ResourceProperties['partition'];
  const region = event.ResourceProperties['region'];
  const securityHubMemberAccountIds: string[] = event.ResourceProperties['securityHubMemberAccountIds'];
  const autoEnableOrgMembers: boolean = event.ResourceProperties['autoEnableOrgMembers'] === 'true';
  const solutionId = process.env['SOLUTION_ID'];
  const chunkSize = process.env['CHUNK_SIZE'] ? parseInt(process.env['CHUNK_SIZE']) : 50;
  const organizationsClient = setOrganizationsClient(partition, solutionId);

  const securityHubClient = new SecurityHubClient({
    region: region,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });

  let nextToken: string | undefined = undefined;

  let existingMemberAccountIds: string[] = [];

  // Enable security hub is admin account before creating delegation admin account, if this wasn't enabled by organization delegation
  await enableSecurityHub(securityHubClient);

  const allAccounts: AccountDetails[] = [];
  do {
    const page = await throttlingBackOff(() =>
      organizationsClient.send(new ListAccountsCommand({ NextToken: nextToken })),
    );
    allAccounts.push(...getMembersToCreate(page, securityHubMemberAccountIds));
    nextToken = page.NextToken;
  } while (nextToken);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log('starting - CreateMembersCommand');

      let autoEnableStandards: 'NONE' | 'DEFAULT' = 'DEFAULT';
      if (!autoEnableOrgMembers) {
        autoEnableStandards = 'NONE';
      }
      await throttlingBackOff(() =>
        securityHubClient.send(
          new UpdateOrganizationConfigurationCommand({
            AutoEnable: autoEnableOrgMembers,
            AutoEnableStandards: autoEnableStandards,
          }),
        ),
      );

      const chunkedAccountsForCreate = chunkArray(allAccounts, chunkSize);

      for (const accounts of chunkedAccountsForCreate) {
        console.log(`Initiating createMembers request for ${accounts.length} accounts`);
        await throttlingBackOff(() => securityHubClient.send(new CreateMembersCommand({ AccountDetails: accounts })));
      }

      // Cleanup members removed from deploymentTarget
      if (securityHubMemberAccountIds.length > 0) {
        console.log('Initiating cleanup of members removed from deploymentTargets');
        existingMemberAccountIds = await getExistingMembers(securityHubClient);

        const memberAccountIdsToDelete: string[] = [];
        for (const accountId of existingMemberAccountIds) {
          if (!securityHubMemberAccountIds.includes(accountId)) {
            memberAccountIdsToDelete.push(accountId);
          }
        }

        await disassociateAndDeleteMembers(securityHubClient, memberAccountIdsToDelete, chunkSize);
      }

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      existingMemberAccountIds = await getExistingMembers(securityHubClient);

      await disassociateAndDeleteMembers(securityHubClient, existingMemberAccountIds, chunkSize);

      return { Status: 'Success', StatusCode: 200 };
  }
}

/**
 * Enable SecurityHub
 * @param securityHubClient
 */
async function enableSecurityHub(securityHubClient: SecurityHubClient): Promise<void> {
  try {
    await throttlingBackOff(() =>
      securityHubClient.send(new EnableSecurityHubCommand({ EnableDefaultStandards: false })),
    );
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
      return;
    }
    throw new Error(`SecurityHub enable issue error message - ${e}`);
  }
}

/**
 * Get accounts details for the SecurityHub members to create
 * @param page
 * @param securityHubMemberAccountIds
 * @returns
 */
function getMembersToCreate(page: ListAccountsCommandOutput, securityHubMemberAccountIds: string[]): AccountDetails[] {
  const allAccounts: AccountDetails[] = [];
  for (const account of page.Accounts ?? []) {
    if (securityHubMemberAccountIds.length > 0) {
      if (securityHubMemberAccountIds.includes(account.Id!)) {
        allAccounts.push({ AccountId: account.Id!, Email: account.Email! });
      }
    } else {
      allAccounts.push({ AccountId: account.Id!, Email: account.Email! });
    }
  }
  return allAccounts;
}

/**
 * Function to get existing securityHub members
 * @param securityHubClient
 * @returns string[]
 */
async function getExistingMembers(securityHubClient: SecurityHubClient): Promise<string[]> {
  const existingMemberAccountIds: string[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      securityHubClient.send(new ListMembersCommand({ NextToken: nextToken })),
    );
    for (const member of page.Members ?? []) {
      console.log(member);
      existingMemberAccountIds.push(member.AccountId!);
    }
    nextToken = page.NextToken;
  } while (nextToken);

  return existingMemberAccountIds;
}

/**
 * Function to disassociate and delete securityHub members
 * @param securityHubClient
 * @param memberAccountIdsToDelete
 */
async function disassociateAndDeleteMembers(
  securityHubClient: SecurityHubClient,
  memberAccountIdsToDelete: string[],
  chunkSize: number,
) {
  if (memberAccountIdsToDelete.length > 0) {
    const chunkedAccountsForDelete = chunkArray(memberAccountIdsToDelete, chunkSize);

    for (const accounts of chunkedAccountsForDelete) {
      console.log(`Initiating disassociateMembers request for ${accounts.length} accounts`);
      await throttlingBackOff(() => securityHubClient.send(new DisassociateMembersCommand({ AccountIds: accounts })));
      console.log(`Initiating deleteMembers request for ${accounts.length} accounts`);
      await throttlingBackOff(() => securityHubClient.send(new DeleteMembersCommand({ AccountIds: accounts })));
    }
  }
}
