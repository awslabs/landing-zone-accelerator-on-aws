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
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import {
  DisableIpamOrganizationAdminAccountCommand,
  EC2Client,
  EnableIpamOrganizationAdminAccountCommand,
} from '@aws-sdk/client-ec2';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';

/**
 * enable-ipam-organization-admin-account - lambda handler
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
  const accountId = event.ResourceProperties['accountId'];
  const region = event.ResourceProperties['region'];
  const solutionId = process.env['SOLUTION_ID'];
  const ec2Client = new EC2Client({
    region,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log(`Enabling IPAM delegated administration for account ${accountId}`);
      await throttlingBackOff(() =>
        ec2Client.send(
          new EnableIpamOrganizationAdminAccountCommand({
            DelegatedAdminAccountId: accountId,
          }),
        ),
      );

      return {
        PhysicalResourceId: accountId,
        Status: 'SUCCESS',
      };

    case 'Delete':
      console.log(`Removing IPAM delegated administration from account ${event.PhysicalResourceId}`);
      await throttlingBackOff(() =>
        ec2Client.send(
          new DisableIpamOrganizationAdminAccountCommand({
            DelegatedAdminAccountId: event.PhysicalResourceId,
          }),
        ),
      );

      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}
