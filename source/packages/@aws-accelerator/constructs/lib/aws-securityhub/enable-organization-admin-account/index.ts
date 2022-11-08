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

import { delay, throttlingBackOff } from '@aws-accelerator/utils';
import * as AWS from 'aws-sdk';
AWS.config.logger = console;

/**
 * SecurityHubOrganizationAdminAccount - lambda handler
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
  const securityHubClient = new AWS.SecurityHub({ region: region, customUserAgent: solutionId });

  const securityHubAdminAccount = await getSecurityHubDelegatedAccount(securityHubClient, adminAccountId);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      if (securityHubAdminAccount.status) {
        if (securityHubAdminAccount.accountId === adminAccountId) {
          console.warn(
            `SecurityHub admin account ${securityHubAdminAccount.accountId} is already an admin account as status is ${securityHubAdminAccount.status}, in ${region} region. No action needed`,
          );
          return { Status: 'Success', StatusCode: 200 };
        } else {
          console.warn(
            `SecurityHub delegated admin is already set to ${securityHubAdminAccount.accountId} account can not assign another delegated account`,
          );
        }
      } else {
        // Enable security hub in management account before creating delegation admin account
        await enableSecurityHub(securityHubClient);
        console.log(
          `Started enableOrganizationAdminAccount function in ${event.ResourceProperties['region']} region for account ${adminAccountId}`,
        );
        let retries = 0;
        while (retries < 10) {
          await delay(retries ** 2 * 1000);
          try {
            await throttlingBackOff(() =>
              securityHubClient.enableOrganizationAdminAccount({ AdminAccountId: adminAccountId }).promise(),
            );
            break;
          } catch (error) {
            console.log(error);
            retries = retries + 1;
          }
        }
      }

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      if (securityHubAdminAccount.accountId) {
        if (securityHubAdminAccount.accountId === adminAccountId) {
          console.log(
            `Started disableOrganizationAdminAccount function in ${event.ResourceProperties['region']} region for account ${adminAccountId}`,
          );
          await throttlingBackOff(() =>
            securityHubClient.disableOrganizationAdminAccount({ AdminAccountId: adminAccountId }).promise(),
          );
          const response = await throttlingBackOff(() =>
            organizationsClient
              .listDelegatedAdministrators({ ServicePrincipal: 'securityhub.amazonaws.com' })
              .promise(),
          );

          if (response.DelegatedAdministrators!.length > 0) {
            console.log(
              `Started deregisterDelegatedAdministrator function in ${event.ResourceProperties['region']} region for account ${adminAccountId}`,
            );
            await throttlingBackOff(() =>
              organizationsClient
                .deregisterDelegatedAdministrator({
                  AccountId: adminAccountId,
                  ServicePrincipal: 'securityhub.amazonaws.com',
                })
                .promise(),
            );
          } else {
            console.warn(
              `Account ${securityHubAdminAccount.accountId} is not registered as delegated administrator account`,
            );
          }
        }
      } else {
        console.warn(
          `SecurityHub delegation is not configured for account ${securityHubAdminAccount.accountId}, no action performed`,
        );
      }
      return { Status: 'Success', StatusCode: 200 };
  }
}

/**
 * Find SecurityHub delegated account Id
 * @param securityHubClient
 * @param adminAccountId
 */
async function getSecurityHubDelegatedAccount(
  securityHubClient: AWS.SecurityHub,
  adminAccountId: string,
): Promise<{ accountId: string | undefined; status: string | undefined }> {
  const adminAccounts: AWS.SecurityHub.AdminAccount[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      securityHubClient.listOrganizationAdminAccounts({ NextToken: nextToken }).promise(),
    );
    for (const account of page.AdminAccounts ?? []) {
      adminAccounts.push(account);
    }
    nextToken = page.NextToken;
  } while (nextToken);

  if (adminAccounts.length === 0) {
    return { accountId: undefined, status: undefined };
  }
  if (adminAccounts.length > 1) {
    throw new Error('Multiple admin accounts for SecurityHub in organization');
  }

  if (adminAccounts[0].AccountId === adminAccountId && adminAccounts[0].Status === 'DISABLE_IN_PROGRESS') {
    throw new Error(`Admin account ${adminAccounts[0].AccountId} is in ${adminAccounts[0].Status}`);
  }

  return { accountId: adminAccounts[0].AccountId, status: adminAccounts[0].Status };
}

/**
 * Enable SecurityHub
 * @param securityHubClient
 */
async function enableSecurityHub(securityHubClient: AWS.SecurityHub): Promise<void> {
  try {
    await throttlingBackOff(() => securityHubClient.enableSecurityHub({ EnableDefaultStandards: false }).promise());
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
