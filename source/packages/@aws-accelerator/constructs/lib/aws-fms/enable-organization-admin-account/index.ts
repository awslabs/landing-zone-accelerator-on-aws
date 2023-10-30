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
 * enable-fms - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent) {
  console.log(JSON.stringify(event, null, 4));
  const fmsClient = new AWS.FMS({ region: 'us-east-1' });
  const organizationsClient = new AWS.Organizations({ region: 'us-east-1' });
  const fmsServicePrincipal = 'fms.amazonaws.com';
  const currentFMSAdminAccount = await throttlingBackOff(() => fmsClient.getAdminAccount({}).promise()).catch(err => {
    console.log(err);
    return undefined;
  });
  const newFMSAdminAccount = event.ResourceProperties['adminAccountId'];
  const assumeRoleName = event.ResourceProperties['assumeRoleName'];
  const partition = event.ResourceProperties['partition'];
  const region = event.ResourceProperties['region'];

  const solutionId = process.env['SOLUTION_ID'];

  console.log(`Current FMS Account: ${currentFMSAdminAccount?.AdminAccount || 'No account found'}`);
  console.log(`New FMS Account: ${newFMSAdminAccount}`);
  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      if (currentFMSAdminAccount && currentFMSAdminAccount !== newFMSAdminAccount) {
        console.log(
          'WARNING: The FMS admin account id cannot be updated. To associate a new FMS Admin account, remove the FMS configuration and re-run the Pipeline. Once the account is fully disassociated, add the FMS configuration with the new account and run once more.',
        );
        return { Status: 'Success', StatusCode: 200 };
      }

      if (currentFMSAdminAccount === newFMSAdminAccount) {
        console.log('Accounts match. Nothing to do.');
        return { Status: 'Success', StatusCode: 200 };
      }

      console.log('No FMS Admin account detected. Registering new Admin Account');
      console.log('Checking if FMS is enabled in Organizations');
      const fmsEnabled = await isOrganizationServiceEnabled(organizationsClient, fmsServicePrincipal);
      if (!fmsEnabled) {
        console.log('Enabling FMS service in Organizations');
        await throttlingBackOff(() =>
          organizationsClient.enableAWSServiceAccess({ ServicePrincipal: fmsServicePrincipal }).promise(),
        );
      }
      console.log('Getting delegated Administrator for Organizations');
      const delegatedAdmins = await throttlingBackOff(() =>
        organizationsClient.listDelegatedAdministrators({ ServicePrincipal: fmsServicePrincipal }).promise(),
      );

      let delegatedAdminAccounts: string[] = [];
      if (delegatedAdmins.DelegatedAdministrators) {
        delegatedAdminAccounts = delegatedAdmins.DelegatedAdministrators.map(delegatedAdmin => {
          return delegatedAdmin.Id!;
        });
      }
      if (delegatedAdminAccounts.length > 0 && !delegatedAdminAccounts.includes(newFMSAdminAccount)) {
        console.log(`Deregistering delegatedAdmins for ${fmsServicePrincipal}`);
        await deregisterDelegatedAdministrators(organizationsClient, fmsServicePrincipal, delegatedAdmins, [
          newFMSAdminAccount,
        ]);
      }
      console.log('setting delegated administrator for Organizations');
      if (!delegatedAdminAccounts.includes(newFMSAdminAccount)) {
        await throttlingBackOff(() =>
          organizationsClient
            .registerDelegatedAdministrator({ AccountId: newFMSAdminAccount, ServicePrincipal: fmsServicePrincipal })
            .promise(),
        );
      }
      console.log('Enabling FMS');
      await throttlingBackOff(() => fmsClient.associateAdminAccount({ AdminAccount: newFMSAdminAccount }).promise());
      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      const adminAccountId = currentFMSAdminAccount?.AdminAccount;
      const stsClient = new AWS.STS({ customUserAgent: solutionId, region: region });
      if (adminAccountId) {
        const assumeRoleCredentials = await assumeRole(stsClient, assumeRoleName, adminAccountId, partition);
        console.log('Deregistering Admin Account');
        const adminFmsClient = new AWS.FMS({ credentials: assumeRoleCredentials, region: 'us-east-1' });
        await throttlingBackOff(() => adminFmsClient.disassociateAdminAccount({}).promise());
        await throttlingBackOff(() =>
          organizationsClient
            .deregisterDelegatedAdministrator({
              AccountId: adminAccountId,
              ServicePrincipal: 'fms.amazonaws.com',
            })
            .promise(),
        );
      } else {
        console.log('No FMS Admin Account exists');
      }

      return { Status: 'Success', StatusCode: 200 };
  }
}

async function isOrganizationServiceEnabled(organizationsClient: AWS.Organizations, servicePrincipal: string) {
  let nextToken;
  const enabledOrgServices = [];
  do {
    const services = await organizationsClient.listAWSServiceAccessForOrganization({ NextToken: nextToken }).promise();
    if (services.EnabledServicePrincipals) {
      enabledOrgServices.push(...services.EnabledServicePrincipals);
    }
  } while (nextToken);

  const enabledServiceNames = enabledOrgServices.map(service => {
    return service.ServicePrincipal;
  });

  return enabledServiceNames.includes(servicePrincipal);
}

async function deregisterDelegatedAdministrators(
  organizationsClient: AWS.Organizations,
  servicePrincipal: string,
  delegatedAdmins: AWS.Organizations.ListDelegatedAdministratorsResponse,
  accountsToExclude: string[] = [],
) {
  for (const delegatedAdmin of delegatedAdmins.DelegatedAdministrators || []) {
    if (!accountsToExclude.includes(delegatedAdmin.Id!)) {
      console.log(`Deregistering delegated Admin Account ${delegatedAdmin.Id}`);
      await throttlingBackOff(() =>
        organizationsClient
          .deregisterDelegatedAdministrator({
            AccountId: delegatedAdmin.Id!,
            ServicePrincipal: servicePrincipal,
          })
          .promise(),
      );
    }
  }
}

async function assumeRole(stsClient: AWS.STS, assumeRoleName: string, accountId: string, partition: string) {
  const roleArn = `arn:${partition}:iam::${accountId}:role/${assumeRoleName}`;
  const assumeRole = await throttlingBackOff(() =>
    stsClient.assumeRole({ RoleArn: roleArn, RoleSessionName: `fmsDeregisterAdmin` }).promise(),
  );
  return new AWS.Credentials({
    accessKeyId: assumeRole.Credentials!.AccessKeyId,
    secretAccessKey: assumeRole.Credentials!.SecretAccessKey,
    sessionToken: assumeRole.Credentials!.SessionToken,
  });
}
