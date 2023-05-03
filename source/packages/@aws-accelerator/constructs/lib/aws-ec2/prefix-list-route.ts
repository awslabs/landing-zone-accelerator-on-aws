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

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';

export interface PrefixListRouteProps {
  /**
   * The destination prefix list ID of the route
   */
  readonly destinationPrefixListId: string;

  /**
   * Custom resource lambda log group encryption key
   */
  readonly logGroupKmsKey: cdk.aws_kms.Key;

  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;

  /**
   * The ID of the route table for the route
   */
  readonly routeTableId: string;

  /**
   * The ID of a carrier gateway
   */
  readonly carrierGatewayId?: string;

  /**
   * The ID of an egress-only Internet gateway
   */
  readonly egressOnlyInternetGatewayId?: string;

  /**
   * The ID of an Internet Gateway or Virtual Private Gateway
   */
  readonly gatewayId?: string;

  /**
   * The ID of an instance
   */
  readonly instanceId?: string;

  /**
   * The ID of a local gateway
   */
  readonly localGatewayId?: string;

  /**
   * The ID of a NAT gateway
   */
  readonly natGatewayId?: string;

  /**
   * The ID of a network interface
   */
  readonly networkInterfaceId?: string;

  /**
   * The ID of a transit gateway
   */
  readonly transitGatewayId?: string;

  /**
   * The ID of a VPC endpoint
   */
  readonly vpcEndpointId?: string;

  /**
   * The ID of a VPC peering connection
   */
  readonly vpcPeeringConnectionId?: string;
}

export class PrefixListRoute extends cdk.Resource {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: PrefixListRouteProps) {
    super(scope, id);

    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, 'Custom::PrefixListRoute', {
      codeDirectory: path.join(__dirname, 'prefix-list-route/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      policyStatements: [
        {
          Sid: 'AllowModifyRoutes',
          Effect: 'Allow',
          Action: ['ec2:CreateRoute', 'ec2:DeleteRoute'],
          Resource: '*',
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: 'Custom::PrefixListRoute',
      serviceToken: provider.serviceToken,
      properties: {
        routeDefinition: {
          DestinationPrefixListId: props.destinationPrefixListId,
          RouteTableId: props.routeTableId,
          CarrierGatewayId: props.carrierGatewayId,
          EgressOnlyInternetGatewayId: props.egressOnlyInternetGatewayId,
          GatewayId: props.gatewayId,
          InstanceId: props.instanceId,
          LocalGatewayId: props.localGatewayId,
          NatGatewayId: props.natGatewayId,
          NetworkInterfaceId: props.networkInterfaceId,
          TransitGatewayId: props.transitGatewayId,
          VpcEndpointId: props.vpcEndpointId,
          VpcPeeringConnectionId: props.vpcPeeringConnectionId,
        },
      },
    });

    /**
     * Singleton pattern to define the log group for the singleton function
     * in the stack
     */
    const stack = cdk.Stack.of(scope);
    const logGroup =
      (stack.node.tryFindChild(`${provider.node.id}LogGroup`) as cdk.aws_logs.LogGroup) ??
      new cdk.aws_logs.LogGroup(stack, `${provider.node.id}LogGroup`, {
        logGroupName: `/aws/lambda/${(provider.node.findChild('Handler') as cdk.aws_lambda.CfnFunction).ref}`,
        retention: props.logRetentionInDays,
        encryptionKey: props.logGroupKmsKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
    resource.node.addDependency(logGroup);

    this.id = resource.ref;
  }
}
