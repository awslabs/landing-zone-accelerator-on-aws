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

import * as AWS from 'aws-sdk';
import { throttlingBackOff } from '@aws-accelerator/utils';

let organizationsClient: AWS.Organizations;

/**
 * detach-quarantine-scp - lambda handler
 *
 * @param event
 * @returns
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string;
    }
  | undefined
> {
  console.log(event);
  const policyId: string = event.ResourceProperties['scpPolicyId'] ?? '';
  const solutionId = process.env['SOLUTION_ID'];

  organizationsClient = new AWS.Organizations({ customUserAgent: solutionId });
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
    const params: AWS.Organizations.ListAccountsRequest = { NextToken: nextToken };
    const page = await throttlingBackOff(() => organizationsClient.listAccounts(params).promise());
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
      organizationsClient
        .detachPolicy({
          PolicyId: policyId,
          TargetId: accountId,
        })
        .promise(),
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
