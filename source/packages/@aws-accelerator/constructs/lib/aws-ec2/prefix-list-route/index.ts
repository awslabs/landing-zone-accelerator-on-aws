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

/**
 * aws-ec2-prefix-list-route - lambda handler
 *
 * @param event
 * @returns
 */

import * as AWS from 'aws-sdk';

import { throttlingBackOff } from '@aws-accelerator/utils';

const ec2 = new AWS.EC2();
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
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

  const props: RouteProps = event.ResourceProperties['routeDefinition'];

  switch (event.RequestType) {
    case 'Create':
      await throttlingBackOff(() => ec2.createRoute(props).promise());

      return {
        Status: 'SUCCESS',
      };

    case 'Update':
      await throttlingBackOff(() => ec2.replaceRoute(props).promise());

      return {
        Status: 'SUCCESS',
      };

    case 'Delete':
      await throttlingBackOff(() =>
        ec2
          .deleteRoute({ DestinationPrefixListId: props.DestinationPrefixListId, RouteTableId: props.RouteTableId })
          .promise(),
      );

      return {
        Status: 'SUCCESS',
      };
  }
}
