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
  DescribeAccountAssignmentCreationStatusCommand,
  DescribeAccountAssignmentDeletionStatusCommand,
  PrincipalType,
  CreateAccountAssignmentCommandInput,
} from '@aws-sdk/client-sso-admin';
import { IdentitystoreClient, GetGroupIdCommand, GetUserIdCommand } from '@aws-sdk/client-identitystore';
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
    try {
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
    } catch (error) {
      console.error('Error creating Identity Center assignments:', error);
      return {
        PhysicalResourceId: event.LogicalResourceId,
        Status: 'FAILED',
        Reason: String(error),
      };
    }
  }

  async function onUpdate(event: AWSLambda.CloudFormationCustomResourceUpdateEvent) {
    try {
      const previousAccountIdsList: string[] = event.OldResourceProperties['accountIds'] ?? [];
      const previousPermissionSetArn: string | undefined = event.OldResourceProperties['permissionSetArn'];
      const permissionSetChanged =
        previousPermissionSetArn !== undefined && previousPermissionSetArn !== permissionSetArnValue;

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

      // Accounts dropping out of scope held whichever permission set was previously assigned,
      // not necessarily the new one, so they must be cleaned up against the old ARN.
      if (deletionList.length > 0) {
        const assignmentDeletionRequests = await buildDeleteAssignmentsList(
          deletionList,
          principals,
          identityStoreId,
          instanceArn,
          permissionSetChanged ? previousPermissionSetArn! : permissionSetArnValue,
          principalType as PrincipalType,
          principalId!,
          idcClient,
        );
        await deleteAssignment(assignmentDeletionRequests, ssoAdminClient);
      }

      // CloudFormation treats a permissionSetName change on an unchanged assignment as an
      // in-place update of this same custom resource, not a replacement, so nothing else
      // will ever notice the old permission set's assignment needs removing. Every account
      // still in scope that was assigned under the previous permission set must have that
      // grant explicitly removed here, or it is left permanently orphaned in Identity Center.
      if (permissionSetChanged) {
        const staleAccounts = previousAccountIdsList.filter(accountId => !deletionList.includes(accountId));
        if (staleAccounts.length > 0) {
          const staleAssignmentDeletionRequests = await buildDeleteAssignmentsList(
            staleAccounts,
            principals,
            identityStoreId,
            instanceArn,
            previousPermissionSetArn!,
            principalType as PrincipalType,
            principalId!,
            idcClient,
          );
          await deleteAssignment(staleAssignmentDeletionRequests, ssoAdminClient);
        }
      }

      return {
        PhysicalResourceId: event.LogicalResourceId,
        Status: 'SUCCESS',
      };
    } catch (error) {
      console.error('Error updating Identity Center assignments:', error);
      return {
        PhysicalResourceId: event.LogicalResourceId,
        Status: 'FAILED',
        Reason: String(error),
      };
    }
  }

  async function onDelete(event: AWSLambda.CloudFormationCustomResourceDeleteEvent) {
    try {
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
    } catch (error) {
      console.error('Error deleting Identity Center assignments:', error);
      return {
        PhysicalResourceId: event.LogicalResourceId,
        Status: 'FAILED',
        Reason: String(error),
      };
    }
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
            throw new Error(`GROUP not found ${principal} ${identityStoreId} ${idcClient}`);
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

const POLL_MAX_ATTEMPTS = 10;
const POLL_BASE_DELAY_MS = 2000;
const POLL_MAX_DELAY_MS = 30000;

/**
 * Returns a delay with exponential backoff and jitter.
 * @param attempt - The current attempt number (1-based)
 */
function getPollingDelay(attempt: number): number {
  const exponentialDelay = Math.min(POLL_BASE_DELAY_MS * Math.pow(2, attempt - 1), POLL_MAX_DELAY_MS);
  const jitter = Math.floor(Math.random() * exponentialDelay * 0.3);
  return exponentialDelay + jitter;
}

/**
 * Polls DescribeAccountAssignmentCreationStatus until the assignment succeeds, fails, or times out.
 */
async function waitForCreationStatus(
  ssoAdminClient: SSOAdminClient,
  instanceArn: string,
  requestId: string,
  targetId: string,
): Promise<void> {
  for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++) {
    const response = await throttlingBackOff(() =>
      ssoAdminClient.send(
        new DescribeAccountAssignmentCreationStatusCommand({
          InstanceArn: instanceArn,
          AccountAssignmentCreationRequestId: requestId,
        }),
      ),
    );
    const status = response.AccountAssignmentCreationStatus;

    if (status?.Status === 'SUCCEEDED') {
      console.log(`Account assignment creation for account ${targetId} succeeded (RequestId: ${requestId})`);
      return;
    }
    if (status?.Status === 'FAILED') {
      throw new Error(
        `Account assignment creation failed for account ${targetId}: ${status.FailureReason ?? 'Unknown reason'} (RequestId: ${requestId})`,
      );
    }

    console.log(
      `Account assignment create for account ${targetId} still in progress, polling attempt ${attempt}/${POLL_MAX_ATTEMPTS}`,
    );
    await new Promise(resolve => setTimeout(resolve, getPollingDelay(attempt)));
  }

  throw new Error(
    `Account assignment creation for account ${targetId} timed out after ${POLL_MAX_ATTEMPTS} attempts (RequestId: ${requestId})`,
  );
}

/**
 * Polls DescribeAccountAssignmentDeletionStatus until the assignment succeeds, fails, or times out.
 */
async function waitForDeletionStatus(
  ssoAdminClient: SSOAdminClient,
  instanceArn: string,
  requestId: string,
  targetId: string,
): Promise<void> {
  for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++) {
    const response = await throttlingBackOff(() =>
      ssoAdminClient.send(
        new DescribeAccountAssignmentDeletionStatusCommand({
          InstanceArn: instanceArn,
          AccountAssignmentDeletionRequestId: requestId,
        }),
      ),
    );
    const status = response.AccountAssignmentDeletionStatus;

    if (status?.Status === 'SUCCEEDED') {
      console.log(`Account assignment deletion for account ${targetId} succeeded (RequestId: ${requestId})`);
      return;
    }
    if (status?.Status === 'FAILED') {
      throw new Error(
        `Account assignment deletion failed for account ${targetId}: ${status.FailureReason ?? 'Unknown reason'} (RequestId: ${requestId})`,
      );
    }

    console.log(
      `Account assignment delete for account ${targetId} still in progress, polling attempt ${attempt}/${POLL_MAX_ATTEMPTS}`,
    );
    await new Promise(resolve => setTimeout(resolve, getPollingDelay(attempt)));
  }

  throw new Error(
    `Account assignment deletion for account ${targetId} timed out after ${POLL_MAX_ATTEMPTS} attempts (RequestId: ${requestId})`,
  );
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

    const requestId = createEvent.AccountAssignmentCreationStatus?.RequestId;
    const status = createEvent.AccountAssignmentCreationStatus?.Status;

    console.log(`Request Id ${requestId} for account ${createParameter.TargetId} in status: ${status}`);

    if (status === 'IN_PROGRESS' && requestId) {
      await waitForCreationStatus(ssoAdminClient, createParameter.InstanceArn!, requestId, createParameter.TargetId!);
    } else if (status === 'FAILED') {
      throw new Error(
        `Account assignment creation failed for account ${createParameter.TargetId}: ${createEvent.AccountAssignmentCreationStatus?.FailureReason ?? 'Unknown reason'}`,
      );
    }
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

    const requestId = deleteEvent.AccountAssignmentDeletionStatus?.RequestId;
    const status = deleteEvent.AccountAssignmentDeletionStatus?.Status;

    console.log(`Request Id ${requestId} for account ${deleteParameter.TargetId} in status: ${status}`);

    if (status === 'IN_PROGRESS' && requestId) {
      await waitForDeletionStatus(ssoAdminClient, deleteParameter.InstanceArn!, requestId, deleteParameter.TargetId!);
    } else if (status === 'FAILED') {
      throw new Error(
        `Account assignment deletion failed for account ${deleteParameter.TargetId}: ${deleteEvent.AccountAssignmentDeletionStatus?.FailureReason ?? 'Unknown reason'}`,
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
 * Returns the principal ID of the User.
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
  try {
    const response = await throttlingBackOff(() =>
      idcClient.send(
        new GetUserIdCommand({
          IdentityStoreId: identityStoreId,
          AlternateIdentifier: {
            UniqueAttribute: {
              AttributePath: 'userName',
              AttributeValue: principal.name,
            },
          },
        }),
      ),
    );
    return response.UserId;
  } catch (error) {
    throw new Error(`User '${principal.name}' not found in Identity Store '${identityStoreId}': ${error}`);
  }
}

/**
 * Returns the principal ID of the Group.
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
  try {
    const response = await throttlingBackOff(() =>
      idcClient.send(
        new GetGroupIdCommand({
          IdentityStoreId: identityStoreId,
          AlternateIdentifier: {
            UniqueAttribute: {
              AttributePath: 'displayName',
              AttributeValue: principal.name,
            },
          },
        }),
      ),
    );
    return response.GroupId;
  } catch (error) {
    throw new Error(`Group '${principal.name}' not found in Identity Store '${identityStoreId}': ${error}`);
  }
}
