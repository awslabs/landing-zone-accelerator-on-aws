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
 * aws-ec2-cross-account-route - lambda handler
 *
 * @param event
 * @returns
 */

import * as AWS from 'aws-sdk';

import { throttlingBackOff } from '@aws-accelerator/utils';

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
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

  let ec2: AWS.EC2;
  const props: RouteProps = event.ResourceProperties['routeDefinition'];
  const region: string = event.ResourceProperties['region'];
  const solutionId = process.env['SOLUTION_ID'];
  const resourceId = props.DestinationCidrBlock
    ? `${props.DestinationCidrBlock}${props.RouteTableId}`
    : `${props.DestinationPrefixListId}${props.RouteTableId}`;
  const roleArn: string | undefined = event.ResourceProperties['roleArn'];

  if (roleArn) {
    const stsClient = new AWS.STS({ customUserAgent: solutionId, region });
    const assumeRoleCredential = await throttlingBackOff(() =>
      stsClient
        .assumeRole({
          RoleArn: event.ResourceProperties['roleArn'],
          RoleSessionName: 'acceleratorAssumeRoleSession',
        })
        .promise(),
    );
    ec2 = new AWS.EC2({
      customUserAgent: solutionId,
      region,
      credentials: {
        accessKeyId: assumeRoleCredential.Credentials!.AccessKeyId,
        secretAccessKey: assumeRoleCredential.Credentials!.SecretAccessKey,
        sessionToken: assumeRoleCredential.Credentials!.SessionToken,
        expireTime: assumeRoleCredential.Credentials!.Expiration,
      },
    });
  } else {
    ec2 = new AWS.EC2({ customUserAgent: solutionId, region });
  }

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      await throttlingBackOff(() => ec2.createRoute(props).promise());

      return {
        PhysicalResourceId: resourceId,
        Status: 'SUCCESS',
      };

    case 'Delete':
      await throttlingBackOff(() =>
        ec2
          .deleteRoute({
            DestinationCidrBlock: props.DestinationCidrBlock,
            DestinationPrefixListId: props.DestinationPrefixListId,
            RouteTableId: props.RouteTableId,
          })
          .promise(),
      );

      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}
