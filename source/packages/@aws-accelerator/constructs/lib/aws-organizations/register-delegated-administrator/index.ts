/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import {
  DeregisterDelegatedAdministratorCommand,
  OrganizationsClient,
  RegisterDelegatedAdministratorCommand,
} from '@aws-sdk/client-organizations';

/**
 * register-delegated-administrator - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string;
    }
  | undefined
> {
  const servicePrincipal: string = event.ResourceProperties['servicePrincipal'];
  const accountId: string = event.ResourceProperties['accountId'];

  const organizationsClient = new OrganizationsClient({});

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      try {
        await throttlingBackOff(() =>
          organizationsClient.send(
            new RegisterDelegatedAdministratorCommand({
              ServicePrincipal: servicePrincipal,
              AccountId: accountId,
            }),
          ),
        );
      } catch (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        e: any
      ) {
        if (e.name === 'AccountAlreadyRegisteredException') {
          console.warn(e.name + ': ' + e.message);
          return;
        }
      }

      return {
        PhysicalResourceId: servicePrincipal,
        Status: 'SUCCESS',
      };

    case 'Delete':
      await throttlingBackOff(() =>
        organizationsClient.send(
          new DeregisterDelegatedAdministratorCommand({
            ServicePrincipal: servicePrincipal,
            AccountId: accountId,
          }),
        ),
      );

      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}
