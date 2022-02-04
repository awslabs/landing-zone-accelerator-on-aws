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
import {
  AdminAccount,
  AdminStatus,
  DisableOrganizationAdminAccountCommand,
  EnableOrganizationAdminAccountCommand,
  EnableSecurityHubCommand,
  SecurityHubClient,
  paginateListOrganizationAdminAccounts,
} from '@aws-sdk/client-securityhub';
import {
  OrganizationsClient,
  DeregisterDelegatedAdministratorCommand,
  ListDelegatedAdministratorsCommand,
} from '@aws-sdk/client-organizations';

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
  const adminAccountId = event.ResourceProperties['adminAccountId'];

  const organizationsClient = new OrganizationsClient({});
  const securityHubClient = new SecurityHubClient({ region: region });

  const adminAccount = await getSecurityHubDelegatedAccount(securityHubClient, adminAccountId);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      if (!adminAccount.accountId) {
        // Enable security hub in management account before creating delegation admin account
        await enableSecurityHub(securityHubClient);

        console.log('start - EnableOrganizationAdminAccountCommand');
        await throttlingBackOff(() =>
          securityHubClient.send(new EnableOrganizationAdminAccountCommand({ AdminAccountId: adminAccountId })),
        );
      } else {
        console.log(
          `SecurityHub delegation is already setup for account ${adminAccount.accountId} and the status is ${adminAccount.status}`,
        );
      }

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      if (adminAccount.accountId) {
        if (adminAccount.accountId === adminAccountId) {
          await throttlingBackOff(() =>
            securityHubClient.send(
              new DisableOrganizationAdminAccountCommand({
                AdminAccountId: adminAccountId,
              }),
            ),
          );
          const response = await throttlingBackOff(() =>
            organizationsClient.send(
              new ListDelegatedAdministratorsCommand({
                ServicePrincipal: 'securityhub.amazonaws.com',
              }),
            ),
          );

          if (response.DelegatedAdministrators!.length > 0) {
            await throttlingBackOff(() =>
              organizationsClient.send(
                new DeregisterDelegatedAdministratorCommand({
                  AccountId: adminAccountId,
                  ServicePrincipal: 'securityhub.amazonaws.com',
                }),
              ),
            );
          } else {
            console.warn(`Account ${adminAccount.accountId} is not registered as delegated administrator account`);
          }
        }
      } else {
        console.warn(
          `SecurityHub delegation is not configured for account ${adminAccount.accountId}, no action performed`,
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
  securityHubClient: SecurityHubClient,
  adminAccountId: string,
): Promise<{ accountId: string | undefined; status: string | undefined }> {
  const adminAccounts: AdminAccount[] = [];
  for await (const page of paginateListOrganizationAdminAccounts({ client: securityHubClient }, {})) {
    for (const account of page.AdminAccounts ?? []) {
      adminAccounts.push(account);
    }
  }

  if (adminAccounts.length === 0) {
    return { accountId: undefined, status: undefined };
  }
  if (adminAccounts.length > 1) {
    throw new Error('Multiple admin accounts for SecurityHub in organization');
  }

  if (adminAccounts[0].AccountId === adminAccountId && adminAccounts[0].Status === AdminStatus.DISABLE_IN_PROGRESS) {
    throw new Error(`Admin account ${adminAccounts[0].AccountId} is in ${adminAccounts[0].Status}`);
  }

  return { accountId: adminAccounts[0].AccountId, status: adminAccounts[0].Status };
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
  } catch (e: any) {
    if (e.name === 'ResourceConflictException') {
      console.warn(e.name + ': ' + e.message);
      return;
    }
    throw new Error(`SecurityHub enable issue error message - ${e}`);
  }
}
