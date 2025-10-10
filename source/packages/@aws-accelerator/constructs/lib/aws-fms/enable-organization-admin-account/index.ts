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
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import { getGlobalRegion, setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';
import {
  DeregisterDelegatedAdministratorCommand,
  EnableAWSServiceAccessCommand,
  ListAWSServiceAccessForOrganizationCommand,
  ListDelegatedAdministratorsCommand,
  ListDelegatedAdministratorsResponse,
  OrganizationsClient,
  RegisterDelegatedAdministratorCommand,
} from '@aws-sdk/client-organizations';
import {
  AssociateAdminAccountCommand,
  DisassociateAdminAccountCommand,
  FMSClient,
  GetAdminAccountCommand,
} from '@aws-sdk/client-fms';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
/**
 * enable-fms - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: CloudFormationCustomResourceEvent) {
  console.log(JSON.stringify(event, null, 4));
  const partition = event.ResourceProperties['partition'];
  const globalRegion = getGlobalRegion(partition);
  const solutionId = process.env['SOLUTION_ID'];
  const fmsClient = new FMSClient({
    region: globalRegion,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });
  const fmsServicePrincipal = 'fms.amazonaws.com';
  const currentFMSAdminAccount = await throttlingBackOff(() => fmsClient.send(new GetAdminAccountCommand({}))).catch(
    err => {
      console.log(err);
      return undefined;
    },
  );
  const newFMSAdminAccount = event.ResourceProperties['adminAccountId'];
  const assumeRoleName = event.ResourceProperties['assumeRoleName'];
  const region = event.ResourceProperties['region'];

  const organizationsClient = new OrganizationsClient({
    region: globalRegion,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });

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
          organizationsClient.send(new EnableAWSServiceAccessCommand({ ServicePrincipal: fmsServicePrincipal })),
        );
      }
      console.log('Getting delegated Administrator for Organizations');
      const delegatedAdmins = await throttlingBackOff(() =>
        organizationsClient.send(new ListDelegatedAdministratorsCommand({ ServicePrincipal: fmsServicePrincipal })),
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
          organizationsClient.send(
            new RegisterDelegatedAdministratorCommand({
              AccountId: newFMSAdminAccount,
              ServicePrincipal: fmsServicePrincipal,
            }),
          ),
        );
      }
      console.log('Enabling FMS');
      await throttlingBackOff(() =>
        fmsClient.send(new AssociateAdminAccountCommand({ AdminAccount: newFMSAdminAccount })),
      );
      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      const adminAccountId = currentFMSAdminAccount?.AdminAccount;
      const stsClient = new STSClient({
        region,
        customUserAgent: solutionId,
        retryStrategy: setRetryStrategy(),
      });
      if (adminAccountId) {
        const assumeRoleCredentials = await assumeRole(stsClient, assumeRoleName, adminAccountId, partition);
        console.log('Deregistering Admin Account');
        const adminFmsClient = new FMSClient({
          region: globalRegion,
          customUserAgent: solutionId,
          retryStrategy: setRetryStrategy(),
          credentials: {
            accessKeyId: assumeRoleCredentials.AccessKeyId!,
            secretAccessKey: assumeRoleCredentials.SecretAccessKey!,
            sessionToken: assumeRoleCredentials.SessionToken,
            expiration: assumeRoleCredentials.Expiration,
          },
        });
        await throttlingBackOff(() => adminFmsClient.send(new DisassociateAdminAccountCommand({})));
        await throttlingBackOff(() =>
          organizationsClient.send(
            new DeregisterDelegatedAdministratorCommand({
              AccountId: adminAccountId,
              ServicePrincipal: 'fms.amazonaws.com',
            }),
          ),
        );
      } else {
        console.log('No FMS Admin Account exists');
      }

      return { Status: 'Success', StatusCode: 200 };
  }
}

async function isOrganizationServiceEnabled(organizationsClient: OrganizationsClient, servicePrincipal: string) {
  let nextToken;
  const enabledOrgServices = [];
  do {
    const services = await throttlingBackOff(() =>
      organizationsClient.send(new ListAWSServiceAccessForOrganizationCommand({ NextToken: nextToken })),
    );
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
  organizationsClient: OrganizationsClient,
  servicePrincipal: string,
  delegatedAdmins: ListDelegatedAdministratorsResponse,
  accountsToExclude: string[] = [],
) {
  for (const delegatedAdmin of delegatedAdmins.DelegatedAdministrators || []) {
    if (!accountsToExclude.includes(delegatedAdmin.Id!)) {
      console.log(`Deregistering delegated Admin Account ${delegatedAdmin.Id}`);
      await throttlingBackOff(() =>
        organizationsClient.send(
          new DeregisterDelegatedAdministratorCommand({
            AccountId: delegatedAdmin.Id!,
            ServicePrincipal: servicePrincipal,
          }),
        ),
      );
    }
  }
}

async function assumeRole(stsClient: STSClient, assumeRoleName: string, accountId: string, partition: string) {
  const roleArn = `arn:${partition}:iam::${accountId}:role/${assumeRoleName}`;
  const assumeRole = await throttlingBackOff(() =>
    stsClient.send(new AssumeRoleCommand({ RoleArn: roleArn, RoleSessionName: `fmsDeregisterAdmin` })),
  );

  return assumeRole.Credentials!;
}
