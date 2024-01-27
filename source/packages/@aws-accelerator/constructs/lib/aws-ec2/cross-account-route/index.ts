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
 * aws-ec2-cross-account-route - lambda handler
 *
 * @param event
 * @returns
 */

import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import { CreateRouteCommand, DeleteRouteCommand, EC2Client } from '@aws-sdk/client-ec2';
import { STSClient } from '@aws-sdk/client-sts';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { setRetryStrategy, getStsCredentials } from '@aws-accelerator/utils/lib/common-functions';

export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string;
      Status: string | undefined;
    }
  | undefined
> {
  interface RouteProps {
    readonly RouteTableId: string;
    readonly CarrierGatewayId?: string;
    readonly DestinationCidrBlock?: string;
    readonly DestinationPrefixListId?: string;
    readonly DestinationIpv6CidrBlock?: string;
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
  const region: string = event.ResourceProperties['region'];
  const solutionId = process.env['SOLUTION_ID'];
  const roleArn: string | undefined = event.ResourceProperties['roleArn'];
  const resourceId = setResourceId(props);

  const ec2Client = await setClient(solutionId, region, roleArn);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      await throttlingBackOff(() => ec2Client.send(new CreateRouteCommand(props)));

      return {
        PhysicalResourceId: resourceId,
        Status: 'SUCCESS',
      };

    case 'Delete':
      await throttlingBackOff(() =>
        ec2Client.send(
          new DeleteRouteCommand({
            DestinationCidrBlock: props.DestinationCidrBlock,
            DestinationPrefixListId: props.DestinationPrefixListId,
            DestinationIpv6CidrBlock: props.DestinationIpv6CidrBlock,
            RouteTableId: props.RouteTableId,
          }),
        ),
      );

      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }

  /**
   * Set physical resource ID based on event input
   * @param props
   * @returns string
   */
  function setResourceId(props: RouteProps): string {
    if (props.DestinationCidrBlock) {
      return `${props.DestinationCidrBlock}${props.RouteTableId}`;
    } else if (props.DestinationIpv6CidrBlock) {
      return `${props.DestinationIpv6CidrBlock}${props.RouteTableId}`;
    } else {
      return `${props.DestinationPrefixListId}${props.RouteTableId}`;
    }
  }

  /**
   * Set EC2 client
   * @param solutionId string | undefined
   * @param region string | undefined
   * @param roleArn string | undefined
   * @returns Promise<EC2Client>
   */
  async function setClient(solutionId?: string, region?: string, roleArn?: string): Promise<EC2Client> {
    if (roleArn) {
      const stsClient = new STSClient({ customUserAgent: solutionId, region, retryStrategy: setRetryStrategy() });

      return new EC2Client({
        customUserAgent: solutionId,
        region,
        retryStrategy: setRetryStrategy(),
        credentials: await getStsCredentials(stsClient, roleArn),
      });
    } else {
      return new EC2Client({ customUserAgent: solutionId, region, retryStrategy: setRetryStrategy() });
    }
  }
}
