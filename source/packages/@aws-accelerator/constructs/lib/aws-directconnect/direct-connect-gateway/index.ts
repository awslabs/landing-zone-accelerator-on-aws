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
  DirectConnectClient,
  CreateDirectConnectGatewayCommand,
  UpdateDirectConnectGatewayCommand,
  DeleteDirectConnectGatewayCommand,
} from '@aws-sdk/client-direct-connect';

import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';

import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';

/**
 * direct-connect-gateway - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string;
      Status: string;
    }
  | undefined
> {
  // Set variables
  const directConnectGatewayName: string = event.ResourceProperties['gatewayName'];
  const amazonSideAsn = Number(event.ResourceProperties['asn']);
  const solutionId = process.env['SOLUTION_ID'];

  const dx = new DirectConnectClient({ customUserAgent: solutionId, retryStrategy: setRetryStrategy() });

  // Event handler
  switch (event.RequestType) {
    case 'Create':
      const response = await throttlingBackOff(() =>
        dx.send(new CreateDirectConnectGatewayCommand({ directConnectGatewayName, amazonSideAsn })),
      );

      if (!response.directConnectGateway?.directConnectGatewayId) {
        throw new Error(`Error creating Direct Connect Gateway; unable to retrieve ID value.`);
      }

      return {
        PhysicalResourceId: response.directConnectGateway.directConnectGatewayId,
        Status: 'SUCCESS',
      };

    case 'Update':
      if (event.OldResourceProperties['asn'] !== amazonSideAsn) {
        console.warn(
          `Cannot update Amazon side ASN for Direct Connect Gateways. Please delete and recreate the gateway instead.`,
        );
      }

      if (event.OldResourceProperties['gatewayName'] !== directConnectGatewayName) {
        console.log(
          `Updating Direct Connect Gateway ${event.PhysicalResourceId} name from ${event.OldResourceProperties['gatewayName']} to ${directConnectGatewayName}`,
        );
        await throttlingBackOff(() =>
          dx.send(
            new UpdateDirectConnectGatewayCommand({
              directConnectGatewayId: event.PhysicalResourceId,
              newDirectConnectGatewayName: directConnectGatewayName,
            }),
          ),
        );
      }

      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
    case 'Delete':
      await throttlingBackOff(() =>
        dx.send(new DeleteDirectConnectGatewayCommand({ directConnectGatewayId: event.PhysicalResourceId })),
      );

      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}
