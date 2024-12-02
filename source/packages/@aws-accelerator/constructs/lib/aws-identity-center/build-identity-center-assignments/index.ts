/**
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 * Y
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';

import {
  SSOAdminClient,
  CreateAccountAssignmentRequest,
  DeleteAccountAssignmentRequest,
  CreateAccountAssignmentCommand,
  DeleteAccountAssignmentCommand,
  PrincipalType,
  CreateAccountAssignmentCommandInput,
} from '@aws-sdk/client-sso-admin';
import { Group, IdentitystoreClient, ListGroupsCommand, ListUsersCommand, User } from '@aws-sdk/client-identitystore';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';

/**
 * build-identity-center-assignments - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string;
    }
  | undefined
> {
  console.log(`${JSON.stringify(event)}`);
  const ssoAdminClient = new SSOAdminClient({
    retryStrategy: setRetryStrategy(),
    customUserAgent: process.env['SOLUTION_ID'],
  });
  const idcClient = new IdentitystoreClient({
    retryStrategy: setRetryStrategy(),
    customUserAgent: process.env['SOLUTION_ID'],
  });

  const instanceArn: string = event.ResourceProperties['instanceArn'];
  const identityStoreId: string = event.ResourceProperties['identityStoreId'];
  const principalType: string | undefined = event.ResourceProperties['principalType'];
  const principalId: string | undefined = event.ResourceProperties['principalId'];
  const principals:
    | [
        {
          name: string;
          type: string;
        },
      ]
    | [] = event.ResourceProperties['principals'];
  const permissionSetArnValue: string = event.ResourceProperties['permissionSetArn'];
  const accountIds: string[] = event.ResourceProperties['accountIds'];
  // const assignmentCreationRequests: CreateAccountAssignmentRequest[] = [];
  // const assignmentDeletionRequests: DeleteAccountAssignmentRequest[] = [];

  switch (event.RequestType) {
    case 'Create':
      return onCreate(event);
    case 'Update':
      return onUpdate(event);
    case 'Delete':
      return onDelete(event);
  }

  async function onCreate(event: AWSLambda.CloudFormationCustomResourceCreateEvent) {
    // Build the account assignment creation
    const assignmentCreationRequests = await buildCreateAssignmentsList(
      accountIds,
      principals,
      identityStoreId,
      instanceArn,
      permissionSetArnValue,
      principalType as PrincipalType,
      principalId!,
      idcClient,
    );

    if (assignmentCreationRequests.length > 0) {
      await createAssignment(assignmentCreationRequests, ssoAdminClient);
    }
    return {
      PhysicalResourceId: event.LogicalResourceId,
      Status: 'SUCCESS',
    };
  }

  async function onUpdate(event: AWSLambda.CloudFormationCustomResourceUpdateEvent) {
    const previousAccountIdsList: string[] = event.OldResourceProperties['accountIds'] ?? [];
    const deletionList = await retrieveAccountDeletions(previousAccountIdsList, accountIds);
    // Build the account assignment creation
    const assignmentCreationRequests = await buildCreateAssignmentsList(
      accountIds,
      principals,
      identityStoreId,
      instanceArn,
      permissionSetArnValue,
      principalType as PrincipalType,
      principalId!,
      idcClient,
    );

    if (assignmentCreationRequests.length > 0) {
      await createAssignment(assignmentCreationRequests, ssoAdminClient);
    }

    const assignmentDeletionRequests = await buildDeleteAssignmentsList(
      deletionList,
      principals,
      identityStoreId,
      instanceArn,
      permissionSetArnValue,
      principalType as PrincipalType,
      principalId!,
      idcClient,
    );

    // Build the Delete Parameters
    if (deletionList.length > 0) {
      await deleteAssignment(assignmentDeletionRequests, ssoAdminClient);
    }
    return {
      PhysicalResourceId: event.LogicalResourceId,
      Status: 'SUCCESS',
    };
  }

  async function onDelete(event: AWSLambda.CloudFormationCustomResourceDeleteEvent) {
    const assignmentDeletionRequests = await buildDeleteAssignmentsList(
      accountIds,
      principals,
      identityStoreId,
      instanceArn,
      permissionSetArnValue,
      principalType as PrincipalType,
      principalId!,
      idcClient,
    );

    // Call the delete account assignments method
    await deleteAssignment(assignmentDeletionRequests, ssoAdminClient);

    return {
      PhysicalResourceId: event.LogicalResourceId,
      Status: 'SUCCESS',
    };
  }
}

/**
 * Method to create account assignments list. The method will fail if a user or group does not exist.
 * @param accountIds List of accounts that are in event
 * @param principals The principal object that requires a lookup
 * @param identityStoreId
 * @param instanceArn
 * @param permissionSetArnValue
 * @param principalType The Principal Type
 * @param principalId The Principal ID
 * @param idcClient
 * @returns string[]
 */
async function buildCreateAssignmentsList(
  accountIds: string[],
  principals:
    | [
        {
          name: string;
          type: string;
        },
      ]
    | [],
  identityStoreId: string,
  instanceArn: string,
  permissionSetArnValue: string,
  principalType: PrincipalType,
  principalId: string,
  idcClient: IdentitystoreClient,
): Promise<CreateAccountAssignmentRequest[]> {
  const assignmentCreationRequests: CreateAccountAssignmentRequest[] = [];
  for (const accountId of accountIds ?? []) {
    if (principals) {
      for (const principal of principals) {
        // If logic to check if the principal type is for USER
        if (principal.type === 'USER') {
          const principalId = await throttlingBackOff(() => getUserPrincipalId(principal, identityStoreId, idcClient));
          if (!principalId) {
            throw new Error(`USER not found ${principal} ${identityStoreId} ${idcClient}`);
          }
          assignmentCreationRequests.push({
            InstanceArn: instanceArn,
            TargetId: accountId,
            TargetType: 'AWS_ACCOUNT',
            PermissionSetArn: permissionSetArnValue,
            PrincipalType: principal.type,
            PrincipalId: principalId,
          });
        }
        // If logic to check if the principal type is for GROUP
        else if (principal.type === 'GROUP') {
          const principalId = await throttlingBackOff(() => getGroupPrincipalId(principal, identityStoreId, idcClient));
          if (!principalId) {
            throw new Error(`USER not found ${principal} ${identityStoreId} ${idcClient}`);
          }
          assignmentCreationRequests.push({
            InstanceArn: instanceArn,
            TargetId: accountId,
            TargetType: 'AWS_ACCOUNT',
            PermissionSetArn: permissionSetArnValue,
            PrincipalType: principal.type,
            PrincipalId: principalId,
          });
        }
      }
    } else {
      assignmentCreationRequests.push({
        InstanceArn: instanceArn,
        TargetId: accountId,
        TargetType: 'AWS_ACCOUNT',
        PermissionSetArn: permissionSetArnValue,
        PrincipalType: principalType as PrincipalType,
        PrincipalId: principalId,
      });
    }
  }
  return assignmentCreationRequests;
}

/**
 * Method to create account assignments list
 * @param accountIds List of accounts that are in event
 * @param principals The principal object that requires a lookup
 * @param identityStoreId
 * @param instanceArn
 * @param permissionSetArnValue
 * @param principalType The Principal Type
 * @parm principalId The Principal ID
 * @param idcClient
 * @returns string[]
 */
async function buildDeleteAssignmentsList(
  accountIds: string[],
  principals:
    | [
        {
          name: string;
          type: string;
        },
      ]
    | [],
  identityStoreId: string,
  instanceArn: string,
  permissionSetArnValue: string,
  principalType: PrincipalType,
  principalId: string,
  idcClient: IdentitystoreClient,
): Promise<DeleteAccountAssignmentRequest[]> {
  const assignmentDeletionRequests: DeleteAccountAssignmentRequest[] = [];
  for (const accountId of accountIds) {
    if (principals) {
      for (const principal of principals) {
        // If logic to check if the principal type is for USER
        if (principal.type === 'USER') {
          const principalId = await throttlingBackOff(() => getUserPrincipalId(principal, identityStoreId, idcClient));
          if (principalId) {
            assignmentDeletionRequests.push({
              InstanceArn: instanceArn,
              TargetId: accountId,
              TargetType: 'AWS_ACCOUNT',
              PermissionSetArn: permissionSetArnValue,
              PrincipalType: principal.type,
              PrincipalId: principalId,
            });
          }
        }
        // If logic to check if the principal type is for GROUP
        else if (principal.type === 'GROUP') {
          const principalId = await throttlingBackOff(() => getGroupPrincipalId(principal, identityStoreId, idcClient));
          if (principalId) {
            assignmentDeletionRequests.push({
              InstanceArn: instanceArn,
              TargetId: accountId,
              TargetType: 'AWS_ACCOUNT',
              PermissionSetArn: permissionSetArnValue,
              PrincipalType: principal.type,
              PrincipalId: principalId,
            });
          }
        }
      }
    } else {
      assignmentDeletionRequests.push({
        InstanceArn: instanceArn,
        TargetId: accountId,
        TargetType: 'AWS_ACCOUNT',
        PermissionSetArn: permissionSetArnValue,
        PrincipalType: principalType as PrincipalType,
        PrincipalId: principalId,
      });
    }
  }
  return assignmentDeletionRequests;
}

/**
 * Method processes list of create account Assignments
 * @param assignmentCreationRequests
 * @returns string[]
 */
async function createAssignment(
  assignmentCreationRequests: CreateAccountAssignmentCommandInput[],
  ssoAdminClient: SSOAdminClient,
) {
  for (const createParameter of assignmentCreationRequests ?? []) {
    console.log(
      `Creating account assignment for Principal ID ${createParameter.PrincipalId} for ${createParameter.TargetId}`,
    );
    const createEvent = await throttlingBackOff(() =>
      ssoAdminClient.send(new CreateAccountAssignmentCommand(createParameter)),
    );
    if (createEvent.AccountAssignmentCreationStatus) {
      console.log(
        `Request Id ${createEvent.AccountAssignmentCreationStatus.RequestId} for account ${createParameter.TargetId} in status: ${createEvent.AccountAssignmentCreationStatus.Status}`,
      );
    }
    console.log(`Processing create event: ${JSON.stringify(createEvent, null, 4)}`);
  }
}

/**
 * Method processes list of delete account Assignments
 * @param assignmentDeletionRequests
 * @returns string[]
 */
async function deleteAssignment(
  assignmentDeletionRequests: DeleteAccountAssignmentRequest[],
  ssoAdminClient: SSOAdminClient,
) {
  for (const deleteParameter of assignmentDeletionRequests ?? []) {
    console.log(
      `Deleting account assignment for Principal ID ${deleteParameter.PrincipalId} for ${deleteParameter.TargetId}`,
    );
    const deleteEvent = await throttlingBackOff(() =>
      ssoAdminClient.send(new DeleteAccountAssignmentCommand(deleteParameter)),
    );
    if (deleteEvent.AccountAssignmentDeletionStatus) {
      console.log(
        `Request Id ${deleteEvent.AccountAssignmentDeletionStatus.RequestId} for account ${deleteParameter.TargetId} in status: ${deleteEvent.AccountAssignmentDeletionStatus.Status}`,
      );
    }
  }
}

/**
 * Returns the list of accounts IDs that need to have the account assignments deleted for.
 * @param previousAccountIdsList List of accounts IDs that Identity Center Assignments were previously created for
 * @returns string[]
 */
async function retrieveAccountDeletions(previousAccountIdsList: string[], accountIds: string[]) {
  const deletionList: string[] = [];
  for (const accountId of previousAccountIdsList) {
    if (accountIds.indexOf(accountId) === -1) {
      if (!deletionList.includes(accountId)) {
        deletionList.push(accountId);
      }
    }
  }
  return deletionList;
}

/**
 * Retruns the principal ID of the User.
 * @param principal Incoming JSON object containing the name of the user/group as well as its type.
 * @param identityStoreId The Identity store id
 * @param idcClient
 * @returns string
 */
async function getUserPrincipalId(
  principal: { name: string; type: string },
  identityStoreId: string,
  idcClient: IdentitystoreClient,
) {
  let principalId: string | undefined;
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      idcClient.send(
        new ListUsersCommand({
          IdentityStoreId: identityStoreId,
          Filters: [{ AttributePath: 'UserName', AttributeValue: principal.name }],
        }),
      ),
    );
    // Going through results and retrieving the principal ID
    for (const user of page.Users ?? []) {
      principalId = user.UserId;
    }
    if (page.Users) {
      validateNumberOfPrincipals(page.Users, principal.name, principal.type, identityStoreId, principalId);
    }
    nextToken = page.NextToken;
  } while (nextToken);
  return principalId;
}

/**
 * Retruns the principal ID of the Group.
 * @param principal Incoming JSON object containing the name of the user/group as well as its type.
 * @param identityStoreId The Identity store id
 * @param idcClient
 * @returns string
 */
async function getGroupPrincipalId(
  principal: { name: string; type: string },
  identityStoreId: string,
  idcClient: IdentitystoreClient,
) {
  let principalId: string | undefined;
  let nextToken: string | undefined = undefined;

  do {
    const page = await throttlingBackOff(() =>
      idcClient.send(
        new ListGroupsCommand({
          IdentityStoreId: identityStoreId,
          Filters: [{ AttributePath: 'DisplayName', AttributeValue: principal.name }],
        }),
      ),
    );
    // Going through results and retrieving the principal ID
    for (const group of page.Groups ?? []) {
      principalId = group.GroupId;
    }
    if (page.Groups) {
      validateNumberOfPrincipals(page.Groups, principal.name, principal.type, identityStoreId, principalId);
    }
    nextToken = page.NextToken;
  } while (nextToken);
  return principalId;
}

/**
 * Principal validation function
 * @param principalArray Users and Groups to validate
 * @param principalName Name of the principal
 * @param principalType Type of the principal (USER/GROUP)
 * @param identityStoreId
 * @param principalId
 * @returns boolean
 */
function validateNumberOfPrincipals(
  principalArray: User[] | Group[],
  principalName: string,
  principalType: string,
  identityStoreId: string,
  principalId: string | undefined,
): { PhysicalResourceId: undefined; Status: string } | boolean {
  if (principalArray.length > 1 && principalId) {
    console.error(`Multiple ${principalName} of ${principalType} found in identity store ${identityStoreId}!!!!`);
    return {
      PhysicalResourceId: undefined,
      Status: 'FAILURE',
    };
  }
  return true;
}
