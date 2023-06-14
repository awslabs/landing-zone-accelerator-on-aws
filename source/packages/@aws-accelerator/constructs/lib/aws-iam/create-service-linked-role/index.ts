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

import { GetRoleCommand, IAMClient, CreateServiceLinkedRoleCommand, NoSuchEntityException } from '@aws-sdk/client-iam';

/**
 * create-service-linked-role - lambda handler
 *
 * @param event
 * @returns
 */

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      Status: string;
      Data: { roleArn: string; roleName: string } | undefined;
    }
  | undefined
> {
  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const iamClient = new IAMClient({ customUserAgent: process.env['SOLUTION_ID'] });
      //check if role exists if it does return success
      if (!(await isRoleExists(iamClient, event.ResourceProperties['roleName']))) {
        // role needs to be created
        return await createServiceLinkedRole(
          iamClient,
          event.ResourceProperties['serviceName'],
          event.ResourceProperties['description'] ?? undefined,
        );
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
  try {
    const command = new CreateServiceLinkedRoleCommand({ AWSServiceName: serviceName, Description: description });
    const resp = await iamClient.send(command);
    // wait for role to be created
    await delay(15000);
    // check if role is created
    if (resp.Role) {
      // this function will try 10 times for 15 attempts before going to the next step
      await checkRoleStatus(iamClient, resp.Role.RoleName!);

      return {
        Status: 'SUCCESS',
        Data: { roleArn: resp.Role.Arn!, roleName: resp.Role.RoleName! },
      };
    } else {
      throw new Error(`Response did not have Role. ${JSON.stringify(resp)}`);
    }
  } catch (error) {
    throw new Error(`There was an error in service linked role creation: ${JSON.stringify(error)}`);
  }
}

export async function isRoleExists(iamClient: IAMClient, roleName: string): Promise<boolean> {
  try {
    await iamClient.send(new GetRoleCommand({ RoleName: roleName }));
    return true;
  } catch (error) {
    // if role does not exist, create one
    if (error instanceof NoSuchEntityException) {
      console.log(`Role: ${roleName} does not exist in the account. Will create one.`);
      return false;
    } else {
      // throwing error so it will be sent back to cloudformation stack and message will help troubleshoot
      throw new Error(
        `Encountered an error when attempting to retrieve the status of service-linked role ${roleName}.`,
      );
    }
  }
}

export async function checkRoleStatus(iamClient: IAMClient, roleName: string) {
  let attempts = 0;

  while (attempts < 10) {
    try {
      const command = new GetRoleCommand({ RoleName: roleName });
      // if this api passes, it means role exists
      await iamClient.send(command);
      break;
    } catch (error) {
      // this is the only exception to look for. If its not this error then break and throw exception
      if (error instanceof NoSuchEntityException) {
        attempts = attempts + 1;
      } else {
        const msg = `There was an error in checking status of role: ${roleName}`;
        throw new Error(msg);
      }
    }
  }
}
function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
