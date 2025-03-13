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

/**
 * aws-ec2-prefix-list-route - lambda handler
 *
 * @param event
 * @returns
 */

import { CreateRouteCommand, DeleteRouteCommand, EC2Client } from '@aws-sdk/client-ec2';

import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';

export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string;
      Status: string | undefined;
    }
  | undefined
> {
  interface RouteProps {
    readonly DestinationPrefixListId: string;
    readonly RouteTableId: string;
    readonly CarrierGatewayId?: string;
    readonly EgressOnlyInternetGatewayId?: string;
    readonly GatewayId?: string;
    readonly InstanceId?: string;
    readonly LocalGatewayId?: string;
    readonly NatGatewayId?: string;
    readonly NetworkInterfaceId?: string;
    readonly TransitGatewayId?: string;
    readonly VpcEndpointId?: string;
    readonly VpcPeeringConnectionId?: string;
  }

  const ec2 = new EC2Client({
    customUserAgent: process.env['SOLUTION_ID'],
    retryStrategy: setRetryStrategy(),
  });
  const props: RouteProps = event.ResourceProperties['routeDefinition'];
  const resourceId = `${props.DestinationPrefixListId}${props.RouteTableId}`;

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      await throttlingBackOff(() => ec2.send(new CreateRouteCommand(props)));

      return {
        PhysicalResourceId: resourceId,
        Status: 'SUCCESS',
      };

    case 'Delete':
      await throttlingBackOff(() =>
        ec2.send(
          new DeleteRouteCommand({
            DestinationPrefixListId: props.DestinationPrefixListId,
            RouteTableId: props.RouteTableId,
          }),
        ),
      );

      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}
