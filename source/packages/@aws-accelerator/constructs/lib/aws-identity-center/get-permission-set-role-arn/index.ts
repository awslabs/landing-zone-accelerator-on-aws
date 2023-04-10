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

const iamClient = new AWS.IAM();
const ssoRolePrefix = '/aws-reserved/sso.amazonaws.com/';

export interface responseData {
  roleArn: string | undefined;
}
/**
 * get-identity-center-permission-set-role-arn - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      Status: string | undefined;
      StatusCode: number | undefined;
      Data?: responseData | undefined;
    }
  | undefined
> {
  console.log(JSON.stringify(event, null, 4));
  const permissionSetName = event.ResourceProperties['permissionSetName'];

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log('Getting Role ARN for Permission Set...');
      const roleArn = await getPermissionSetRoleArn(permissionSetName);

      if (roleArn) {
        const responseData = { roleArn: roleArn };
        console.log(responseData);
        return { Status: 'Success', Data: responseData, StatusCode: 200 };
      } else {
        throw new Error(`No Permission Set with name ${permissionSetName} found`);
      }

    case 'Delete':
      return { Status: 'Success', StatusCode: 200 };
  }
}

async function getPermissionSetRoleArn(permissionSetName: string) {
  const iamRoleList = await getIamRoleList();
  const roleArn = iamRoleList.find(role => {
    const regex = new RegExp(`AWSReservedSSO_${permissionSetName}_([0-9a-fA-F]{16})`);
    const match = regex.test(role.RoleName);
    console.log(`Test ${role} for pattern ${regex} result: ${match}`);
    return match;
  })?.Arn;

  if (roleArn) {
    console.log(`Found provisioned role for permission set ${permissionSetName} with ARN: ${roleArn}`);
  } else {
    console.log(`Permission set with name ${permissionSetName} not found`);
  }

  return roleArn;
}

async function getIamRoleList() {
  const roleList = [];
  let hasNext = true;
  let marker: string | undefined = undefined;

  while (hasNext) {
    const response = await throttlingBackOff(() =>
      iamClient.listRoles({ PathPrefix: ssoRolePrefix, Marker: marker }).promise(),
    );

    // Add roles returned in this paged response
    roleList.push(...response.Roles);

    marker = response.Marker;
    hasNext = !!marker;
  }
  return roleList;
}
