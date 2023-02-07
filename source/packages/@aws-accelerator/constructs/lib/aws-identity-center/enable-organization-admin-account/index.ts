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
import { PermissionSet } from 'aws-sdk/clients/ssoadmin';
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
      Reason?: string | undefined;
    }
  | undefined
> {
  console.log(JSON.stringify(event, null, 4));
  let organizationsClient = new AWS.Organizations();
  const identityCenterClient = new AWS.SSOAdmin();
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
        );
      }

      if (isDelegatedAdminDeregistered) {
        console.log('Registering Delegated Administrator for Identity Center');
        await throttlingBackOff(() =>
          organizationsClient
            .registerDelegatedAdministrator({
              AccountId: newIdentityCenterDelegatedAdminAccount,
              ServicePrincipal: identityCenterServicePrincipal,
            })
            .promise(),
        );
      }

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      const adminAccountId = await getCurrentDelegatedAdminAccount(organizationsClient, identityCenterServicePrincipal);
      if (adminAccountId) {
        console.log('Deregistering Delegated Admin Account');
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
  console.log('Getting Delegated Administrator for Identity Center');
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
    console.log(`Current Delegated Admins for Identity Center is account: ${delegatedAdmin}`);
  }

  return delegatedAdmin;
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function deregisterDelegatedAdministrators(
  organizationsClient: AWS.Organizations,
  identityCenterClient: AWS.SSOAdmin,
  servicePrincipal: string,
  delegatedAdmin: string,
): Promise<boolean> {
  const ssoInstanceId = await getSsoInstanceId(identityCenterClient);
  if (ssoInstanceId) {
    console.log(`Identity Center Instance ID is: ${ssoInstanceId}`);
    const isIdentityCenterDeregisterable = await verifyIdentityCenterResourcesBeforeDeletion(
      identityCenterClient,
      ssoInstanceId,
      delegatedAdmin,
    );

    // Only Deregister Account if No Permission Sets or Assignments are present in the account.
    if (isIdentityCenterDeregisterable) {
      console.log(`Deregistering Delegated Admin Account ${delegatedAdmin}`);
      await throttlingBackOff(() =>
        organizationsClient
          .deregisterDelegatedAdministrator({
            AccountId: delegatedAdmin,
            ServicePrincipal: servicePrincipal,
          })
          .promise(),
      );
      console.log('Waiting 5 seconds to allow DelegatedAdmin account to de-register');
      await delay(5000);
      return true;
    }
  }
  return false;
}

async function verifyIdentityCenterResourcesBeforeDeletion(
  identityCenterClient: AWS.SSOAdmin,
  ssoInstanceId: string,
  delegatedAdminAccountId: string,
): Promise<boolean> {
  const permissionSetList = await getPermissionSetList(identityCenterClient, ssoInstanceId);
  const filteredPermissionSetList = await filterPermissionSetList(permissionSetList);
  const assignmentList = await getAssignmentsList(
    identityCenterClient,
    ssoInstanceId,
    delegatedAdminAccountId,
    permissionSetList,
  );
  if (
    (filteredPermissionSetList && filteredPermissionSetList.length > 0) ||
    (assignmentList && assignmentList.length > 0)
  ) {
    throw new Error(
      `Delegated Admin Identity Center cannot be updated due to existing Permission Sets or Assignments. Please remove the following Permission Sets and Assignments: 
      Permission Sets: ${JSON.stringify(filteredPermissionSetList)}
      Assignments: ${JSON.stringify(assignmentList)}`,
    );
  }
  return true;
}

async function getPermissionSetList(
  identityCenterClient: AWS.SSOAdmin,
  ssoInstanceId: string,
): Promise<PermissionSet[]> {
  let permissionSetArnList: string[] = [];
  let permissionSetList: PermissionSet[] = [];
  const listPermissionsResponse = await throttlingBackOff(() =>
    identityCenterClient
      .listPermissionSets({
        InstanceArn: ssoInstanceId,
      })
      .promise(),
  );
  permissionSetArnList = listPermissionsResponse.PermissionSets!;
  permissionSetList = await getPermissionSetObject(identityCenterClient, ssoInstanceId, permissionSetArnList);

  return permissionSetList!;
}

async function filterPermissionSetList(permissionSetList: PermissionSet[]): Promise<PermissionSet[]> {
  //Filter out AWS Default permissionSets
  const filteredPermissionSetList = permissionSetList.filter(permissionSet => !permissionSet.Name?.includes('AWS'));

  if (filteredPermissionSetList && filteredPermissionSetList.length > 0) {
    console.log(
      `Delegated Admin Identity Center cannot be updated due to existing Permission Sets. Please remove the following Permission Sets and Re-Run the Pipeline.`,
    );
    console.log(filteredPermissionSetList);
  }
  return filteredPermissionSetList;
}

async function getPermissionSetObject(
  identityCenterClient: AWS.SSOAdmin,
  ssoInstanceId: string,
  permissionSetArnList: string[],
): Promise<PermissionSet[]> {
  const permissionSetList: PermissionSet[] = [];
  for (const permissionSetArn of permissionSetArnList) {
    const describePermissionSetResponse = await throttlingBackOff(() =>
      identityCenterClient
        .describePermissionSet({
          InstanceArn: ssoInstanceId,
          PermissionSetArn: permissionSetArn,
        })
        .promise(),
    );
    if (describePermissionSetResponse.PermissionSet) {
      permissionSetList.push(describePermissionSetResponse.PermissionSet);
    }
  }
  return permissionSetList;
}

async function getAssignmentsList(
  identityCenterClient: AWS.SSOAdmin,
  ssoInstanceId: string,
  accountId: string,
  permissionSetList: PermissionSet[],
): Promise<string[]> {
  const accountAssignmentList: string[] = [];
  for (const permissionSet of permissionSetList) {
    const listAccountAssignmentsResponse = await throttlingBackOff(() =>
      identityCenterClient
        .listAccountAssignments({
          InstanceArn: ssoInstanceId,
          AccountId: accountId,
          PermissionSetArn: permissionSet.PermissionSetArn!,
        })
        .promise(),
    );
    if (
      listAccountAssignmentsResponse.AccountAssignments &&
      listAccountAssignmentsResponse.AccountAssignments.length > 0
    ) {
      accountAssignmentList.push(JSON.stringify(listAccountAssignmentsResponse.AccountAssignments!));
    }
  }

  if (accountAssignmentList && accountAssignmentList.length > 0) {
    console.log(
      `Delegated Admin Identity Center cannot be updated due to existing Assignments. Please remove the following Assignments and Re-Run the Pipeline.`,
    );
    console.log(JSON.stringify(accountAssignmentList));
  }

  return accountAssignmentList!;
}

async function getSsoInstanceId(identityCenterClient: AWS.SSOAdmin): Promise<string | undefined> {
  console.log('Checking for Identity Center Instance Id...');
  const listInstanceResponse = await throttlingBackOff(() => identityCenterClient.listInstances().promise());
  const identityCenterInstanceIdList = listInstanceResponse.Instances;
  let identityCenterInstance;
  if (identityCenterInstanceIdList) {
    for (const identityCenterInstanceId of identityCenterInstanceIdList) {
      identityCenterInstance = identityCenterInstanceId.InstanceArn;
    }
  }
  return identityCenterInstance;
}
