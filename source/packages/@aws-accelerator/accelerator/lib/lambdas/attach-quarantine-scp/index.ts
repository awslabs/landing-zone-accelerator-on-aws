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

import * as AWS from 'aws-sdk';
import { delay, throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { Context } from '@aws-accelerator/utils/lib/common-types';
import { getGlobalRegion } from '@aws-accelerator/utils/lib/common-functions';

/**
 * attach-quarantine-scp - lambda handler
 *
 * @param event
 * @returns
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handler(event: any, context: Context): Promise<any> {
  console.log(event);

  const partition = context.invokedFunctionArn.split(':')[1];
  const globalRegion = getGlobalRegion(partition);
  // Move to setOrganizationsClient method after refactoring to SDK v3
  const organizationsClient = new AWS.Organizations({
    customUserAgent: process.env['SOLUTION_ID'],
    region: globalRegion,
  });

  // eslint-disable-next-line prefer-const
  const policyName: string = process.env['SCP_POLICY_NAME'] ?? '';

  const createAccountStatus = JSON.parse(JSON.stringify(event.detail.responseElements.createAccountStatus));
  console.log(`Create Account Request Id: ${createAccountStatus.id}`);

  let statusResponse = await getAccountCreationStatus(createAccountStatus.id, organizationsClient);
  while (statusResponse.CreateAccountStatus?.State !== 'SUCCEEDED') {
    await delay(1000);
    statusResponse = await getAccountCreationStatus(createAccountStatus.id, organizationsClient);
  }
  if (statusResponse.CreateAccountStatus?.State === 'SUCCEEDED') {
    const policyId = await getPolicyId(policyName, organizationsClient);
    if (policyId === 'NotFound') {
      console.error(
        `Policy with name ${policyName} was not found. Policy was not applied to account ${statusResponse.CreateAccountStatus.AccountId}`,
      );
      return {
        statusCode: 200,
      };
    }
    await attachQuarantineScp(statusResponse.CreateAccountStatus.AccountId ?? '', policyId ?? '', organizationsClient);
  }
  console.log(statusResponse);
  return {
    statusCode: 200,
  };
}

async function getAccountCreationStatus(
  requestId: string,
  orgsClient: AWS.Organizations,
): Promise<AWS.Organizations.DescribeCreateAccountStatusResponse> {
  return throttlingBackOff(() =>
    orgsClient.describeCreateAccountStatus({ CreateAccountRequestId: requestId }).promise(),
  );
}

async function getPolicyId(policyName: string, orgsClient: AWS.Organizations) {
  console.log(`Looking for policy named ${policyName}`);
  const scpPolicies: AWS.Organizations.PolicySummary[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() => orgsClient.listPolicies({ Filter: 'SERVICE_CONTROL_POLICY' }).promise());

    for (const scpPolicy of page.Policies ?? []) {
      console.log(`Policy named ${scpPolicy.Name} added to list`);
      scpPolicies.push(scpPolicy);
    }
    nextToken = page.NextToken;
  } while (nextToken);

  const policy = scpPolicies.find(item => item.Name === policyName);
  if (policy) {
    console.log(policy);
    return policy?.Id;
  } else {
    return 'NotFound';
  }
}

async function attachQuarantineScp(
  accountId: string,
  policyId: string,
  orgsClient: AWS.Organizations,
): Promise<boolean> {
  try {
    await throttlingBackOff(() =>
      orgsClient
        .attachPolicy({
          PolicyId: policyId,
          TargetId: accountId,
        })
        .promise(),
    );
    console.log(`Attached Quarantine SCP to account: ${accountId}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    if (e.code === 'DuplicatePolicyAttachmentException') {
      console.log(`Quarantine SCP was previously attached to account: ${accountId}`);
      return true;
    } else {
      console.log(e);
      return false;
    }
  }
  return true;
}
