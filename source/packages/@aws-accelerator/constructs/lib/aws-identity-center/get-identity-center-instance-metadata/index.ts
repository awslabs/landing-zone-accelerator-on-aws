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
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import { ListInstancesCommand, SSOAdminClient } from '@aws-sdk/client-sso-admin';
/**
 * get-identity-center-instance-id - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string;
      Data: { identityStoreId: string; instanceArn: string } | undefined;
    }
  | undefined
> {
  const identityCenterClient = new SSOAdminClient({
    customUserAgent: process.env['SOLUTION_ID'],
    retryStrategy: setRetryStrategy(),
  });

  let data: { identityStoreId: string; instanceArn: string } | undefined;

  switch (event.RequestType) {
    case 'Create':
    case 'Update': {
      console.log('Checking for IdentityCenter Instance Id...');
      const response = await throttlingBackOff(() => identityCenterClient.send(new ListInstancesCommand({})));

      if (response.Instances && response.Instances.length === 1) {
        console.log(`IdentityCenter Instance Store Arn is -> ${response.Instances[0].InstanceArn!}`);
        console.log(`IdentityCenter Instance Store Id is -> ${response.Instances[0].IdentityStoreId!}`);
        data = {
          identityStoreId: response.Instances[0].IdentityStoreId!,
          instanceArn: response.Instances[0].InstanceArn!,
        };
        return {
          Status: 'SUCCESS',
          PhysicalResourceId: response.Instances[0].InstanceArn!,
          Data: data,
        };
      }

      console.log(`IdentityCenter Instance not found, api response is -> ${response}`);
      return { PhysicalResourceId: undefined, Status: 'Failure', Data: undefined };
    }

    case 'Delete':
      return {
        Status: 'SUCCESS',
        PhysicalResourceId: event.PhysicalResourceId,
        Data: undefined,
      };
  }
}
