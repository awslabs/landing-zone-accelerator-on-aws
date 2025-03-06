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
import { IdentityCenterPermissionSetConfig } from '@aws-accelerator/config/lib/iam-config';
import {
  DeregisterDelegatedAdministratorCommand,
  EnableAWSServiceAccessCommand,
  EnabledServicePrincipal,
  ListDelegatedAdministratorsCommand,
  OrganizationsClient,
  paginateListAWSServiceAccessForOrganization,
  RegisterDelegatedAdministratorCommand,
} from '@aws-sdk/client-organizations';
import {
  DescribePermissionSetCommand,
  ListAccountAssignmentsCommand,
  ListInstancesCommand,
  ListPermissionSetsCommand,
  PermissionSet,
  SSOAdminClient,
} from '@aws-sdk/client-sso-admin';

/**
 * enable-identity-center - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      Status: string | undefined;
      StatusCode: number | undefined;
      Reason?: string | undefined;
    }
  | undefined
> {
  console.log(JSON.stringify(event, null, 4));
  const solutionId = process.env['SOLUTION_ID'];
  const identityCenterServicePrincipal = 'sso.amazonaws.com';
  const newIdentityCenterDelegatedAdminAccount = event.ResourceProperties['adminAccountId'];
  const lzaManagedPermissionSets = event.ResourceProperties['lzaManagedPermissionSets'];
  const lzaManagedAssignments = event.ResourceProperties['lzaManagedAssignments'];
  const partition = event.ResourceProperties['partition'];
  const globalRegion = getGlobalRegion(partition);

  const organizationsClient = new OrganizationsClient({
    region: globalRegion,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });

  const identityCenterClient = new SSOAdminClient({
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });

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

      console.log('Checking if Identity Center is enabled in Organizations');
      const identityCenterEnabled = await isOrganizationServiceEnabled(
        organizationsClient,
        identityCenterServicePrincipal,
      );
      if (!identityCenterEnabled) {
        console.log('Enabling Identity service in Organizations');
        await throttlingBackOff(() =>
          organizationsClient.send(
            new EnableAWSServiceAccessCommand({ ServicePrincipal: identityCenterServicePrincipal }),
          ),
        );
      }

      let isDelegatedAdminDeregistered = true;
      if (
        currentIdentityCenterDelegatedAdmin &&
        currentIdentityCenterDelegatedAdmin != newIdentityCenterDelegatedAdminAccount
      ) {
        console.log(`Deregistering Delegated Administrator for ${identityCenterServicePrincipal}`);
        isDelegatedAdminDeregistered = await deregisterDelegatedAdministrators(
          organizationsClient,
          identityCenterClient,
          identityCenterServicePrincipal,
          currentIdentityCenterDelegatedAdmin,
          lzaManagedPermissionSets,
          lzaManagedAssignments,
        );
      }

      if (isDelegatedAdminDeregistered) {
        console.log('Registering Delegated Administrator for Identity Center');
        await throttlingBackOff(() =>
          organizationsClient.send(
            new RegisterDelegatedAdministratorCommand({
              AccountId: newIdentityCenterDelegatedAdminAccount,
              ServicePrincipal: identityCenterServicePrincipal,
            }),
          ),
        );
      }

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      const adminAccountId = await getCurrentDelegatedAdminAccount(organizationsClient, identityCenterServicePrincipal);
      if (adminAccountId) {
        console.log('Deregistering Delegated Admin Account');
        console.log(adminAccountId);
        await throttlingBackOff(() =>
          organizationsClient.send(
            new DeregisterDelegatedAdministratorCommand({
              AccountId: adminAccountId,
              ServicePrincipal: identityCenterServicePrincipal,
            }),
          ),
        );
      } else {
        console.log('No Identity Center Admin Account exists');
      }

      return { Status: 'Success', StatusCode: 200 };
  }
}

async function isOrganizationServiceEnabled(client: OrganizationsClient, servicePrincipal: string): Promise<boolean> {
  const enabledServicePrincipals: EnabledServicePrincipal[] = [];
  const paginator = paginateListAWSServiceAccessForOrganization({ client }, {});

  for await (const page of paginator) {
    if (page.EnabledServicePrincipals) {
      enabledServicePrincipals.push(...page.EnabledServicePrincipals);
    }
  }

  const enabledServiceNames = enabledServicePrincipals.map(service => {
    return service.ServicePrincipal;
  });

  return enabledServiceNames.includes(servicePrincipal);
}

async function getCurrentDelegatedAdminAccount(client: OrganizationsClient, identityCenterServicePrincipal: string) {
  console.log('Getting Delegated Administrator for Identity Center');
  const delegatedAdmins = await throttlingBackOff(() =>
    client.send(new ListDelegatedAdministratorsCommand({ ServicePrincipal: identityCenterServicePrincipal })),
  );

  let delegatedAdminAccounts: string[] = [];
  if (delegatedAdmins.DelegatedAdministrators) {
    delegatedAdminAccounts = delegatedAdmins.DelegatedAdministrators.map(delegatedAdmin => {
      return delegatedAdmin.Id!;
    });
  }
  let delegatedAdmin = '';
  if (delegatedAdminAccounts?.length > 0) {
    delegatedAdmin = delegatedAdminAccounts[0];
    console.log(`Current Delegated Admins for Identity Center is account: ${delegatedAdmin}`);
  }

  return delegatedAdmin;
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function deregisterDelegatedAdministrators(
  organizationsClient: OrganizationsClient,
  identityCenterClient: SSOAdminClient,
  servicePrincipal: string,
  delegatedAdmin: string,
  permissionSetsFromConfig: IdentityCenterPermissionSetConfig[],
  assignmentsFromConfig: Map<string, string[]>,
): Promise<boolean> {
  const ssoInstanceId = await getSsoInstanceId(identityCenterClient);
  if (ssoInstanceId) {
    console.log(`Identity Center Instance ID is: ${ssoInstanceId}`);
    const isIdentityCenterDeregisterable = await verifyIdentityCenterResourcesBeforeDeletion(
      identityCenterClient,
      ssoInstanceId,
      permissionSetsFromConfig,
      assignmentsFromConfig,
    );

    // Only Deregister Account if No Permission Sets or Assignments are present in the account.
    if (isIdentityCenterDeregisterable) {
      console.log(`Deregistering Delegated Admin Account ${delegatedAdmin}`);
      await throttlingBackOff(() =>
        organizationsClient.send(
          new DeregisterDelegatedAdministratorCommand({
            AccountId: delegatedAdmin,
            ServicePrincipal: servicePrincipal,
          }),
        ),
      );
      console.log('Waiting 5 seconds to allow DelegatedAdmin account to de-register');
      await delay(5000);
      return true;
    }
  }
  return false;
}

async function verifyIdentityCenterResourcesBeforeDeletion(
  client: SSOAdminClient,
  ssoInstanceId: string,
  permissionSetsFromConfig: IdentityCenterPermissionSetConfig[],
  assignmentsFromConfig: Map<string, string[]>,
): Promise<boolean> {
  const permissionSetList = await getPermissionSetList(client, ssoInstanceId);
  const filteredPermissionSetList = await filterPermissionSetList(permissionSetList, permissionSetsFromConfig);
  const assignmentList = await getAssignmentsList(client, ssoInstanceId, assignmentsFromConfig, permissionSetList);

  if (
    (filteredPermissionSetList && filteredPermissionSetList.length > 0) ||
    (assignmentList && assignmentList.length > 0)
  ) {
    throw new Error(
      `Delegated Admin Identity Center cannot be updated due to existing Permission Sets or Assignments. Remove existing Permission Sets and Assignments from iam-config.yaml and re-run the pipeline. For more error log details, please check the custom resource Lambda logs.`,
    );
  }
  return true;
}

async function getPermissionSetList(client: SSOAdminClient, ssoInstanceId: string): Promise<PermissionSet[]> {
  let permissionSetArnList: string[] = [];
  let permissionSetList: PermissionSet[] = [];
  const listPermissionsResponse = await throttlingBackOff(() =>
    client.send(
      new ListPermissionSetsCommand({
        InstanceArn: ssoInstanceId,
      }),
    ),
  );
  permissionSetArnList = listPermissionsResponse.PermissionSets!;
  permissionSetList = await getPermissionSetObject(client, ssoInstanceId, permissionSetArnList);

  return permissionSetList!;
}

async function filterPermissionSetList(
  permissionSetList: PermissionSet[],
  permissionSetsFromConfig: IdentityCenterPermissionSetConfig[],
): Promise<IdentityCenterPermissionSetConfig[]> {
  const permissionSetListNames: string[] = [];

  //Filter down permission set object to list of permission set names.
  permissionSetList.filter(permissionSet => {
    if (permissionSet.Name) {
      permissionSetListNames.push(permissionSet.Name);
    }
  });

  //Check to see if existing permission sets are in SSO Permission Set Config
  const filteredConfigPermissionSetList = permissionSetsFromConfig.filter(permissionSet =>
    permissionSetListNames.includes(permissionSet.name),
  );

  if (filteredConfigPermissionSetList && filteredConfigPermissionSetList.length > 0) {
    console.log(
      `Delegated Admin Identity Center cannot be updated due to existing LZA-Managed Permission Sets. Please remove all Permission Sets from the iam-config.yaml file before changing the delegated administrator.`,
    );
    console.log(filteredConfigPermissionSetList);
  }
  return filteredConfigPermissionSetList;
}

async function getPermissionSetObject(
  client: SSOAdminClient,
  ssoInstanceId: string,
  permissionSetArnList: string[],
): Promise<PermissionSet[]> {
  const permissionSetList: PermissionSet[] = [];
  for (const permissionSetArn of permissionSetArnList) {
    const describePermissionSetResponse = await throttlingBackOff(() =>
      client.send(
        new DescribePermissionSetCommand({
          InstanceArn: ssoInstanceId,
          PermissionSetArn: permissionSetArn,
        }),
      ),
    );
    if (describePermissionSetResponse.PermissionSet) {
      permissionSetList.push(describePermissionSetResponse.PermissionSet);
    }
  }
  return permissionSetList;
}

async function getAssignmentsList(
  client: SSOAdminClient,
  ssoInstanceId: string,
  assignmentsFromConfig: Map<string, string[]>,
  permissionSetList: PermissionSet[],
): Promise<string[]> {
  const accountAssignmentList: string[] = [];
  //Iterate through each assignment
  for (const assignment of assignmentsFromConfig) {
    //Since object is Map<string, string[]>, we need to extract permissionSet and deploymentTarget Account
    Object.entries(assignment).forEach(async (key: [string, string | string[]]) => {
      const permissionSetName = key[0];
      const permissionSet = permissionSetList.filter(permissionSet => {
        if (permissionSet.Name === permissionSetName) {
          return permissionSet;
        }
        return undefined;
      })[0];
      const deploymentTargetAccounts = key[1];
      //Then we have to call listAccountAssignments on each individual deploymentTargetAccount
      if (permissionSet && permissionSet.PermissionSetArn) {
        for (const deploymentTargetAccount of deploymentTargetAccounts) {
          const listAccountAssignmentsResponse = await throttlingBackOff(() =>
            client.send(
              new ListAccountAssignmentsCommand({
                InstanceArn: ssoInstanceId!,
                AccountId: deploymentTargetAccount!,
                PermissionSetArn: permissionSet.PermissionSetArn!,
              }),
            ),
          );
          if (
            listAccountAssignmentsResponse.AccountAssignments &&
            listAccountAssignmentsResponse.AccountAssignments.length > 0
          ) {
            accountAssignmentList.push(JSON.stringify(listAccountAssignmentsResponse.AccountAssignments!));
          }
        }
      }
    });
  }
  if (accountAssignmentList && accountAssignmentList.length > 0) {
    console.log(
      `Delegated Admin Identity Center cannot be updated due to existing LZA-Managed Assignments. Please remove all Assignments from the iam-config.yaml file before changing the delegated administrator.`,
    );
    console.log(JSON.stringify(accountAssignmentList));
  }

  return accountAssignmentList!;
}

async function getSsoInstanceId(client: SSOAdminClient): Promise<string | undefined> {
  console.log('Checking for Identity Center Instance Id...');
  const listInstanceResponse = await throttlingBackOff(() => client.send(new ListInstancesCommand({})));
  const identityCenterInstanceIdList = listInstanceResponse.Instances;
  let identityCenterInstance;
  if (identityCenterInstanceIdList) {
    for (const identityCenterInstanceId of identityCenterInstanceIdList) {
      identityCenterInstance = identityCenterInstanceId.InstanceArn;
    }
  }
  return identityCenterInstance;
}
