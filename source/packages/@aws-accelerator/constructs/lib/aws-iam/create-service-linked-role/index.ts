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

import {
  GetRoleCommand,
  IAMClient,
  CreateServiceLinkedRoleCommand,
  NoSuchEntityException,
  InvalidInputException,
  type CreateServiceLinkedRoleCommandOutput,
} from '@aws-sdk/client-iam';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';

const ROLE_STATUS_MAX_ATTEMPTS = 10;
const ROLE_STATUS_POLL_INTERVAL_MS = 15000;

/**
 * create-service-linked-role - lambda handler
 *
 * @param event
 * @returns
 */

export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      Status: string;
      Data: { roleArn: string; roleName: string } | undefined;
    }
  | undefined
> {
  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const iamClient = new IAMClient({
        customUserAgent: process.env['SOLUTION_ID'],
        retryStrategy: setRetryStrategy(),
      });
      //check if role exists if it does return success
      if (!(await isRoleExists(iamClient, event.ResourceProperties['roleName']))) {
        // role needs to be created
        const createServiceLinkedRoleResponse = await createServiceLinkedRole(
          iamClient,
          event.ResourceProperties['serviceName'],
          event.ResourceProperties['description'] ?? undefined,
        );

        // Delay to allow service linked role to propagate after creation of SLR
        await delay(60000);
        return createServiceLinkedRoleResponse;
      } else {
        //role does not need to be created
        return {
          Status: 'SUCCESS',
          Data: undefined,
        };
      }

    case 'Delete':
      // Do Nothing
      return {
        Status: 'SUCCESS',
        Data: undefined,
      };
  }
}

/**
 * Function to create service linked role.
 * After the call is made, check is run every 15s to see if the role is present in IAM
 */
export async function createServiceLinkedRole(
  iamClient: IAMClient,
  serviceName: string,
  description: string | undefined,
): Promise<
  | {
      Status: string;
      Data: { roleArn: string; roleName: string } | undefined;
    }
  | undefined
> {
  let resp: CreateServiceLinkedRoleCommandOutput;
  try {
    const command = new CreateServiceLinkedRoleCommand({ AWSServiceName: serviceName, Description: description });
    resp = await throttlingBackOff(() => iamClient.send(command));
  } catch (error) {
    if (error instanceof InvalidInputException && error.message.includes('has been taken in this account')) {
      //role does not need to be created
      return {
        Status: 'SUCCESS',
        Data: undefined,
      };
    }
    console.error(error);
    throw new Error(`There was an error in service linked role creation: ${describeError(error)}`, { cause: error });
  }

  if (!resp.Role?.RoleName || !resp.Role.Arn) {
    throw new Error(`Response did not have Role. ${JSON.stringify(resp)}`);
  }

  // wait for the role to become visible to GetRole before reporting success
  await checkRoleStatus(iamClient, resp.Role.RoleName);

  return {
    Status: 'SUCCESS',
    Data: { roleArn: resp.Role.Arn, roleName: resp.Role.RoleName },
  };
}

export async function isRoleExists(iamClient: IAMClient, roleName: string): Promise<boolean> {
  try {
    // throttlingBackOff retries transient errors (throttling, internal, network) but not NoSuchEntityException,
    // so an intermittent status-retrieval failure is retried before it is surfaced to CloudFormation
    await throttlingBackOff(() => iamClient.send(new GetRoleCommand({ RoleName: roleName })));
    return true;
  } catch (error) {
    // if role does not exist, create one
    if (error instanceof NoSuchEntityException) {
      console.log(`Role: ${roleName} does not exist in the account. Will create one.`);
      return false;
    } else {
      // throwing error so it will be sent back to cloudformation stack and message will help troubleshoot
      console.error(error);
      throw new Error(
        `Encountered an error when attempting to retrieve the status of service-linked role ${roleName}: ${describeError(
          error,
        )}`,
        { cause: error },
      );
    }
  }
}

export async function checkRoleStatus(iamClient: IAMClient, roleName: string): Promise<void> {
  for (let attempt = 1; attempt <= ROLE_STATUS_MAX_ATTEMPTS; attempt++) {
    try {
      // if this api passes, it means role exists. throttlingBackOff retries transient errors but not
      // NoSuchEntityException, which is still handled below to keep polling while the role propagates
      await throttlingBackOff(() => iamClient.send(new GetRoleCommand({ RoleName: roleName })));
      return;
    } catch (error) {
      // this is the only exception to look for. If its not this error then throw exception
      if (!(error instanceof NoSuchEntityException)) {
        console.error(error);
        throw new Error(`There was an error in checking status of role: ${roleName}: ${describeError(error)}`, {
          cause: error,
        });
      }
      if (attempt < ROLE_STATUS_MAX_ATTEMPTS) {
        await delay(ROLE_STATUS_POLL_INTERVAL_MS);
      }
    }
  }

  // CreateServiceLinkedRole already succeeded and the handler waits further for propagation, so an unconfirmed
  // status is logged rather than thrown to avoid failing a deployment that is still likely to converge
  console.warn(`Role ${roleName} was not visible to GetRole after ${ROLE_STATUS_MAX_ATTEMPTS} attempts.`);
}

/**
 * JSON.stringify drops name and message from SDK exceptions because they are non-enumerable.
 */
function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
