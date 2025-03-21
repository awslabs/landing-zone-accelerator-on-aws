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

import {
  DetachPolicyCommand,
  ListAccountsCommand,
  ListAccountsRequest,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';

let organizationsClient: OrganizationsClient;

/**
 * detach-quarantine-scp - lambda handler
 *
 * @param event
 * @returns
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string;
    }
  | undefined
> {
  console.log(event);
  const policyId: string = event.ResourceProperties['scpPolicyId'] ?? '';
  const solutionId = process.env['SOLUTION_ID'];

  organizationsClient = new OrganizationsClient({
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });
  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const accountIdList = await getAccountIds();

      for (const accountId of accountIdList) {
        await detachQuarantineScp(accountId ?? '', policyId ?? '');
      }
      return {
        PhysicalResourceId: 'detach-quarantine-scp',
        Status: 'SUCCESS',
      };
    case 'Delete':
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

async function getAccountIds(): Promise<string[]> {
  console.log('Getting list of accounts');
  const accountIdList: string[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const params: ListAccountsRequest = { NextToken: nextToken };
    const page = await throttlingBackOff(() => organizationsClient.send(new ListAccountsCommand(params)));
    for (const account of page.Accounts ?? []) {
      accountIdList.push(account.Id!);
    }
    nextToken = page.NextToken;
  } while (nextToken);
  return accountIdList;
}

async function detachQuarantineScp(accountId: string, policyId: string): Promise<boolean> {
  try {
    await throttlingBackOff(() =>
      organizationsClient.send(
        new DetachPolicyCommand({
          PolicyId: policyId,
          TargetId: accountId,
        }),
      ),
    );
    console.log(`Detached Quarantine SCP from account: ${accountId}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    if (e.code === 'PolicyNotAttachedException') {
      return true;
    } else {
      console.log(e);
      return false;
    }
  }
  return true;
}
