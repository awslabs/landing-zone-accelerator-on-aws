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

export interface responseData {
  identityCenterInstanceId: string | undefined;
}
/**
 * get-identity-center-instance-id - lambda handler
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
  const identityCenterClient = new AWS.SSOAdmin();
  let organizationsClient = new AWS.Organizations();
  const identityCenterServicePrincipal = 'sso.amazonaws.com';
  const partition = event.ResourceProperties['partition'];
  if (partition === 'aws-us-gov') {
    organizationsClient = new AWS.Organizations({ region: 'us-gov-west-1' });
  } else if (partition === 'aws-cn') {
    organizationsClient = new AWS.Organizations({ region: 'cn-northwest-1' });
  } else {
    organizationsClient = new AWS.Organizations({ region: 'us-east-1' });
  }

  const currentIdentityCenterDelegatedAdmin = await getCurrentDelegatedAdminAccount(
    organizationsClient,
    identityCenterServicePrincipal,
  );

  console.log(
    `Current Identity Center Delegated Admin Account: ${currentIdentityCenterDelegatedAdmin || 'No account found'}`,
  );

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log('Checking for IdentityCenter Instance Id...');
      const listInstanceResponse = await throttlingBackOff(() => identityCenterClient.listInstances().promise());
      const identityCenterInstanceIdList = listInstanceResponse.Instances;
      let identityCenterInstance;
      if (identityCenterInstanceIdList) {
        for (const identityCenterInstanceId of identityCenterInstanceIdList) {
          identityCenterInstance = identityCenterInstanceId.InstanceArn;
        }
      }
      const responseData = { identityCenterInstanceId: identityCenterInstance };
      console.log(responseData);

      return { Status: 'Success', Data: responseData, StatusCode: 200 };

    case 'Delete':
      return { Status: 'Success', StatusCode: 200 };
  }
}

async function getCurrentDelegatedAdminAccount(
  organizationsClient: AWS.Organizations,
  identityCenterServicePrincipal: string,
) {
  console.log('Getting delegated Administrator for Identity Center');
  const delegatedAdmins = await throttlingBackOff(() =>
    organizationsClient.listDelegatedAdministrators({ ServicePrincipal: identityCenterServicePrincipal }).promise(),
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
    console.log(`Current Delegated Admins for ${identityCenterServicePrincipal} is account: ${delegatedAdmin}`);
  }

  return delegatedAdmin;
}
