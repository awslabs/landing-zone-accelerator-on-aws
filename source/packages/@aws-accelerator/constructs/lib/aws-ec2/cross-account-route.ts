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

interface CrossAccountRouteFrameworkProps {
  /**
   * Accelerator Prefix
   */
  readonly acceleratorPrefix: string;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly logGroupKmsKey: cdk.aws_kms.Key;

  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
}

export class CrossAccountRouteFramework extends cdk.Resource {
  public readonly provider: cdk.custom_resources.Provider;

  constructor(scope: Construct, id: string, props: CrossAccountRouteFrameworkProps) {
    super(scope, id);

    const onEventStsPolicy = new cdk.aws_iam.PolicyStatement({
      sid: 'StsAssumeRole',
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: ['sts:AssumeRole'],
      resources: [`arn:${cdk.Stack.of(this).partition}:iam::*:role/${props.acceleratorPrefix}*`],
    });

    const onEventRoutePolicy = new cdk.aws_iam.PolicyStatement({
      sid: 'EC2RouteCreateDelete',
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: ['ec2:CreateRoute', 'ec2:DeleteRoute'],
      resources: ['*'],
    });

    const onEvent = new cdk.aws_lambda.Function(this, 'CrossAccountRouteFunction', {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'cross-account-route/dist')),
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(15),
      description: 'Cross account EC2 route OnEvent handler',
      initialPolicy: [onEventStsPolicy, onEventRoutePolicy],
    });
    new cdk.aws_logs.LogGroup(this, `${onEvent.node.id}LogGroup`, {
      logGroupName: `/aws/lambda/${onEvent.functionName}`,
      retention: props.logRetentionInDays,
      encryptionKey: props.logGroupKmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.provider = new cdk.custom_resources.Provider(this, 'CrossAccountRouteProvider', {
      onEventHandler: onEvent,
    });
  }
}

interface CrossAccountRouteProps {
  /**
   * The owner account of the route table
   */
  readonly ownerAccount: string;

  /**
   * The region of the owner account
   */
  readonly ownerRegion: string;

  /**
   * The partition of the owner account
   */
  readonly partition: string;

  /**
   * The custom resource provider
   */
  readonly provider: cdk.custom_resources.Provider;

  /**
   * The role name to assume
   */
  readonly roleName: string;

  /**
   * The ID of the route table for the route
   */
  readonly routeTableId: string;

  /**
   * The ID of a carrier gateway
   */
  readonly carrierGatewayId?: string;

  /**
   * The destination CIDR
   */
  readonly destination?: string;

  /**
   * The destination prefix list ID
   */
  readonly destinationPrefixListId?: string;

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

export class CrossAccountRoute extends cdk.Resource {
  private roleArn?: string;

  constructor(scope: Construct, id: string, props: CrossAccountRouteProps) {
    super(scope, id);

    const CROSS_ACCOUNT_ROUTE_TYPE = 'Custom::CrossAccountRoute';
    this.roleArn =
      cdk.Stack.of(this).account !== props.ownerAccount
        ? `arn:${props.partition}:iam::${props.ownerAccount}:role/${props.roleName}`
        : undefined;

    new cdk.CustomResource(this, 'Resource', {
      resourceType: CROSS_ACCOUNT_ROUTE_TYPE,
      serviceToken: props.provider.serviceToken,
      properties: {
        region: props.ownerRegion,
        roleArn: this.roleArn,
        routeDefinition: {
          DestinationCidrBlock: props.destination,
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
  }
}
