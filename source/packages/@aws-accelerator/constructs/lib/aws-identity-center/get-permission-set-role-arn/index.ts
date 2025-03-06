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

import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import { IAMClient, paginateListRoles, Role } from '@aws-sdk/client-iam';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';

export interface responseData {
  roleArn: string | undefined;
}
/**
 * get-identity-center-permission-set-role-arn - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      Status: string | undefined;
      StatusCode: number | undefined;
      Data?: responseData | undefined;
    }
  | undefined
> {
  console.log(JSON.stringify(event, null, 4));
  const permissionSetName = event.ResourceProperties['permissionSetName'];

  const client = new IAMClient({
    customUserAgent: process.env['SOLUTION_ID'],
    retryStrategy: setRetryStrategy(),
  });

  switch (event.RequestType) {
    case 'Create':
    case 'Update': {
      console.log('Getting Role ARN for Permission Set...');
      const roleArn = await getPermissionSetRoleArn(client, permissionSetName);

      if (roleArn) {
        const responseData = { roleArn: roleArn };
        console.log(responseData);
        return { Status: 'Success', Data: responseData, StatusCode: 200 };
      } else {
        throw new Error(`No Permission Set with name ${permissionSetName} found`);
      }
    }
    case 'Delete':
      return { Status: 'Success', StatusCode: 200 };
  }
}

async function getPermissionSetRoleArn(client: IAMClient, permissionSetName: string): Promise<string | undefined> {
  const iamRoleList = await getIamRoleList(client);
  const regex = new RegExp(`AWSReservedSSO_${permissionSetName}_([0-9a-fA-F]{16})`);
  for (const iamRole of iamRoleList) {
    if (iamRole.RoleName && iamRole.Arn) {
      const match = regex.test(iamRole.RoleName);
      if (match) {
        console.log(`Found provisioned role for permission set ${permissionSetName} with ARN: ${iamRole.Arn}`);
        return iamRole.Arn;
      }
    }
  }
  console.log(`Permission set with name ${permissionSetName} not found`);
  return undefined;
}

async function getIamRoleList(client: IAMClient): Promise<Role[]> {
  const ssoRolePrefix = '/aws-reserved/sso.amazonaws.com/';
  const roles: Role[] = [];
  const paginator = paginateListRoles({ client }, { PathPrefix: ssoRolePrefix });

  for await (const page of paginator) {
    if (page.Roles) {
      roles.push(...page.Roles);
    }
  }

  return roles;
}
