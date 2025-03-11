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
import { getGlobalRegion, setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import {
  DisableAWSServiceAccessCommand,
  EnableAWSServiceAccessCommand,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';

/**
 * enable-aws-service-access - lambda handler
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
  const partition = event.ResourceProperties['partition'];
  const servicePrincipal: string = event.ResourceProperties['servicePrincipal'];
  const solutionId = process.env['SOLUTION_ID'];
  const globalRegion = getGlobalRegion(partition);
  const organizationsClient = new OrganizationsClient({
    region: globalRegion,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      await throttlingBackOff(() =>
        organizationsClient.send(new EnableAWSServiceAccessCommand({ ServicePrincipal: servicePrincipal })),
      );

      return {
        PhysicalResourceId: servicePrincipal,
        Status: 'SUCCESS',
      };

    case 'Delete':
      await throttlingBackOff(() =>
        organizationsClient.send(new DisableAWSServiceAccessCommand({ ServicePrincipal: servicePrincipal })),
      );
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}
