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
 * enable-identity-center - lambda handler
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
  console.log(JSON.stringify(event, null, 4));
  let organizationsClient = new AWS.Organizations();
  const identityCenterServicePrincipal = 'sso.amazonaws.com';
  const partition = event.ResourceProperties['partition'];
  if (partition === 'aws-us-gov') {
    organizationsClient = new AWS.Organizations({ region: 'us-gov-west-1' });
  } else if (partition === 'aws-cn') {
    organizationsClient = new AWS.Organizations({ region: 'cn-northwest-1' });
  } else {
    organizationsClient = new AWS.Organizations({ region: 'us-east-1' });
  }

  const newIdentityCenterDelegatedAdminAccount = event.ResourceProperties['adminAccountId'];

  const currentIdentityCenterDelegatedAdmin = await getCurrentDelegatedAdminAccount(
    organizationsClient,
    identityCenterServicePrincipal,
  );

  console.log(
    `Current Identity Center Delegated Admin Account: ${currentIdentityCenterDelegatedAdmin || 'No account found'}`,
  );
  console.log(`New Identity Center Delegated Admin Account: ${newIdentityCenterDelegatedAdminAccount}`);
  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      if (currentIdentityCenterDelegatedAdmin === newIdentityCenterDelegatedAdminAccount) {
        console.log('Accounts match. Nothing to do.');
        return { Status: 'Success', StatusCode: 200 };
      }

      console.log('No Identity Center Admin account detected. Registering new Admin Account');
      console.log('Checking if Identity Center is enabled in Organizations');
      const identityCenterEnabled = await isOrganizationServiceEnabled(
        organizationsClient,
        identityCenterServicePrincipal,
      );
      if (!identityCenterEnabled) {
        console.log('Enabling Identity service in Organizations');
        await throttlingBackOff(() =>
          organizationsClient.enableAWSServiceAccess({ ServicePrincipal: identityCenterServicePrincipal }).promise(),
        );
      }

      if (
        currentIdentityCenterDelegatedAdmin &&
        currentIdentityCenterDelegatedAdmin != newIdentityCenterDelegatedAdminAccount
      ) {
        console.log(`Deregistering delegatedAdmins for ${identityCenterServicePrincipal}`);
        await deregisterDelegatedAdministrators(
          organizationsClient,
          identityCenterServicePrincipal,
          currentIdentityCenterDelegatedAdmin,
        );
        console.log('Waiting 5 seconds to allow DelegatedAdmin account to de-register');
        await delay(5000);
      }

      console.log('Setting delegated administrator for Organizations');
      await throttlingBackOff(() =>
        organizationsClient
          .registerDelegatedAdministrator({
            AccountId: newIdentityCenterDelegatedAdminAccount,
            ServicePrincipal: identityCenterServicePrincipal,
          })
          .promise(),
      );

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      const adminAccountId = await getCurrentDelegatedAdminAccount(organizationsClient, identityCenterServicePrincipal);
      if (adminAccountId) {
        console.log('Deregistering Admin Account');
        console.log(adminAccountId);
        await throttlingBackOff(() =>
          organizationsClient
            .deregisterDelegatedAdministrator({
              AccountId: adminAccountId,
              ServicePrincipal: identityCenterServicePrincipal,
            })
            .promise(),
        );
      } else {
        console.log('No Identity Center Admin Account exists');
      }

      return { Status: 'Success', StatusCode: 200 };
  }
}

async function isOrganizationServiceEnabled(
  orgnizationsClient: AWS.Organizations,
  servicePrincipal: string,
): Promise<boolean> {
  let nextToken;
  const enabledOrgServices = [];
  do {
    const services = await orgnizationsClient.listAWSServiceAccessForOrganization({ NextToken: nextToken }).promise();
    if (services.EnabledServicePrincipals) {
      enabledOrgServices.push(...services.EnabledServicePrincipals);
    }
  } while (nextToken);

  const enabledServiceNames = enabledOrgServices.map(service => {
    return service.ServicePrincipal;
  });

  return enabledServiceNames.includes(servicePrincipal);
}

async function getCurrentDelegatedAdminAccount(
  organizationsClient: AWS.Organizations,
  identityCenterServicePrincipal: string,
) {
  console.log('Getting delegated Administrator for SSO');
  const delegatedAdmins = await throttlingBackOff(() =>
    organizationsClient.listDelegatedAdministrators({ ServicePrincipal: identityCenterServicePrincipal }).promise(),
  );

  let delegatedAdminAccounts: string[] = [];
  if (delegatedAdmins.DelegatedAdministrators) {
    delegatedAdminAccounts = delegatedAdmins.DelegatedAdministrators.map(delegatedAdmin => {
      return delegatedAdmin.Id!;
    });
  }
  console.log(delegatedAdminAccounts);
  let delegatedAdmin = '';
  if (delegatedAdminAccounts?.length > 0) {
    delegatedAdmin = delegatedAdminAccounts[0];
    console.log(`Current Delegated Admins for ${identityCenterServicePrincipal} is account: ${delegatedAdmin}`);
  }

  return delegatedAdmin;
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function deregisterDelegatedAdministrators(
  organizationsClient: AWS.Organizations,
  servicePrincipal: string,
  delegatedAdmin: string,
): Promise<void> {
  console.log(`Deregistering delegated Admin Account ${delegatedAdmin}`);
  await throttlingBackOff(() =>
    organizationsClient
      .deregisterDelegatedAdministrator({
        AccountId: delegatedAdmin,
        ServicePrincipal: servicePrincipal,
      })
      .promise(),
  );
}
