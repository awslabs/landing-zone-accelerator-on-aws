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

import { delay, throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { getGlobalRegion, setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import {
  AdminAccount,
  DisableOrganizationAdminAccountCommand,
  EnableOrganizationAdminAccountCommand,
  EnableSecurityHubCommand,
  paginateListOrganizationAdminAccounts,
  ResourceConflictException,
  SecurityHubClient,
} from '@aws-sdk/client-securityhub';
import {
  DeregisterDelegatedAdministratorCommand,
  ListDelegatedAdministratorsCommand,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';

type AdminAccountType = { accountId: string | undefined; status: string | undefined };
/**
 * SecurityHubOrganizationAdminAccount - lambda handler
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
  const region: string = event.ResourceProperties['region'];
  const partition: string = event.ResourceProperties['partition'];
  const adminAccountId: string = event.ResourceProperties['adminAccountId'];
  const solutionId = process.env['SOLUTION_ID'];
  const globalRegion = getGlobalRegion(partition);

  const securityHubClient = new SecurityHubClient({
    region: region,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });

  const securityHubAdminAccount: AdminAccountType = await getSecurityHubDelegatedAccount(
    securityHubClient,
    adminAccountId,
  );

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
              securityHubClient.send(new EnableOrganizationAdminAccountCommand({ AdminAccountId: adminAccountId })),
            );
            break;
          } catch (error: unknown) {
            if (error instanceof Error) {
              console.warn(error.name + ': ' + error.message);
              retries = retries + 1;
            }
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
            securityHubClient.send(new DisableOrganizationAdminAccountCommand({ AdminAccountId: adminAccountId })),
          );

          const organizationsClient = new OrganizationsClient({
            customUserAgent: solutionId,
            region: globalRegion,
            retryStrategy: setRetryStrategy(),
          });

          const response = await throttlingBackOff(() =>
            organizationsClient.send(
              new ListDelegatedAdministratorsCommand({ ServicePrincipal: 'securityhub.amazonaws.com' }),
            ),
          );
          if (response.DelegatedAdministrators!.length > 0) {
            console.log(
              `Started deregisterDelegatedAdministrator function in ${event.ResourceProperties['region']} region for account ${adminAccountId}`,
            );
            await throttlingBackOff(() =>
              organizationsClient.send(
                new DeregisterDelegatedAdministratorCommand({
                  AccountId: adminAccountId,
                  ServicePrincipal: 'securityhub.amazonaws.com',
                }),
              ),
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
 * @param client {@link SecurityHubClient}
 * @param adminAccountId string
 * @returns adminAccount {@link AdminAccountType}[]
 */
async function getSecurityHubDelegatedAccount(
  client: SecurityHubClient,
  adminAccountId: string,
): Promise<AdminAccountType> {
  const adminAccounts: AdminAccount[] = [];

  const paginator = paginateListOrganizationAdminAccounts({ client }, {});

  for await (const page of paginator) {
    if (page.AdminAccounts) {
      adminAccounts.push(...page.AdminAccounts);
    }
  }

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
 * @param client {@link SecurityHubClient}
 */
async function enableSecurityHub(client: SecurityHubClient): Promise<void> {
  try {
    await throttlingBackOff(() => client.send(new EnableSecurityHubCommand({})));
  } catch (error: unknown) {
    if (error instanceof ResourceConflictException) {
      console.warn(error.name + ': ' + error.message);
      return;
    }
    throw new Error(`SecurityHub enable issue error message - ${error}`);
  }
}
