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

import { PrefixListRoute } from './prefix-list-route';
import { Vpc } from './vpc';

export interface IRouteTable extends cdk.IResource {
  /**
   * The identifier of the route table
   *
   * @attribute
   */
  readonly routeTableId: string;

  /**
   * The VPC associated with the route table
   *
   * @attribute
   */
  readonly vpc: Vpc;
}

export interface RouteTableProps {
  readonly name: string;
  readonly vpc: Vpc;
  readonly tags?: cdk.CfnTag[];
}

export class RouteTable extends cdk.Resource implements IRouteTable {
  public readonly routeTableId: string;

  public readonly vpc: Vpc;

  constructor(scope: Construct, id: string, props: RouteTableProps) {
    super(scope, id);

    this.vpc = props.vpc;

    const resource = new cdk.aws_ec2.CfnRouteTable(this, 'Resource', {
      vpcId: props.vpc.vpcId,
      tags: props.tags,
    });
    cdk.Tags.of(this).add('Name', props.name);

    this.routeTableId = resource.ref;
  }

  public addTransitGatewayRoute(
    id: string,
    transitGatewayId: string,
    transitGatewayAttachment: cdk.CfnResource,
    destination?: string,
    destinationPrefixListId?: string,
    logGroupKmsKey?: cdk.aws_kms.Key,
    logRetentionInDays?: number,
  ): cdk.aws_ec2.CfnRoute | PrefixListRoute {
    let route: cdk.aws_ec2.CfnRoute | PrefixListRoute;

    if (destinationPrefixListId) {
      if (!logGroupKmsKey) {
        throw new Error('Attempting to add prefix list route without specifying log group KMS key');
      }
      if (!logRetentionInDays) {
        throw new Error('Attempting to add prefix list route without specifying log group retention period');
      }

      route = new PrefixListRoute(this, id, {
        routeTableId: this.routeTableId,
        destinationPrefixListId,
        logGroupKmsKey,
        logRetentionInDays,
        transitGatewayId,
      });
    } else {
      if (!destination) {
        throw new Error('Attempting to add CIDR route without specifying destination');
      }

      route = new cdk.aws_ec2.CfnRoute(this, id, {
        routeTableId: this.routeTableId,
        destinationCidrBlock: destination,
        transitGatewayId: transitGatewayId,
      });
    }

    route.node.addDependency(transitGatewayAttachment);
    return route;
  }

  public addNatGatewayRoute(
    id: string,
    natGatewayId: string,
    destination?: string,
    destinationPrefixListId?: string,
    logGroupKmsKey?: cdk.aws_kms.Key,
    logRetentionInDays?: number,
  ): cdk.aws_ec2.CfnRoute | PrefixListRoute {
    let route: cdk.aws_ec2.CfnRoute | PrefixListRoute;

    if (destinationPrefixListId) {
      if (!logGroupKmsKey) {
        throw new Error('Attempting to add prefix list route without specifying log group KMS key');
      }
      if (!logRetentionInDays) {
        throw new Error('Attempting to add prefix list route without specifying log group retention period');
      }

      route = new PrefixListRoute(this, id, {
        routeTableId: this.routeTableId,
        destinationPrefixListId,
        logGroupKmsKey,
        logRetentionInDays,
        natGatewayId,
      });
    } else {
      if (!destination) {
        throw new Error('Attempting to add CIDR route without specifying destination');
      }

      route = new cdk.aws_ec2.CfnRoute(this, id, {
        routeTableId: this.routeTableId,
        destinationCidrBlock: destination,
        natGatewayId: natGatewayId,
      });
    }
    return route;
  }

  public addInternetGatewayRoute(
    id: string,
    destination?: string,
    destinationPrefixListId?: string,
    logGroupKmsKey?: cdk.aws_kms.Key,
    logRetentionInDays?: number,
  ): cdk.aws_ec2.CfnRoute | PrefixListRoute {
    if (!this.vpc.internetGateway) {
      throw new Error('Attempting to add Internet Gateway route without an IGW defined.');
    }

    if (!this.vpc.internetGatewayAttachment) {
      throw new Error('Attempting to add Internet Gateway route without an IGW attached.');
    }

    let route: cdk.aws_ec2.CfnRoute | PrefixListRoute;

    if (destinationPrefixListId) {
      if (!logGroupKmsKey) {
        throw new Error('Attempting to add prefix list route without specifying log group KMS key');
      }
      if (!logRetentionInDays) {
        throw new Error('Attempting to add prefix list route without specifying log group retention period');
      }

      route = new PrefixListRoute(this, id, {
        routeTableId: this.routeTableId,
        destinationPrefixListId,
        logGroupKmsKey,
        logRetentionInDays,
        gatewayId: this.vpc.internetGateway.ref,
      });
    } else {
      if (!destination) {
        throw new Error('Attempting to add CIDR route without specifying destination');
      }

      route = new cdk.aws_ec2.CfnRoute(this, id, {
        routeTableId: this.routeTableId,
        destinationCidrBlock: destination,
        gatewayId: this.vpc.internetGateway.ref,
      });
    }

    // Need to add depends on for the attachment, as IGW needs to be part of
    // the network (vpc)
    route.node.addDependency(this.vpc.internetGatewayAttachment);
    return route;
  }

  public addVirtualPrivateGatewayRoute(
    id: string,
    destination?: string,
    destinationPrefixListId?: string,
    logGroupKmsKey?: cdk.aws_kms.Key,
    logRetentionInDays?: number,
  ): cdk.aws_ec2.CfnRoute | PrefixListRoute {
    if (!this.vpc.virtualPrivateGateway) {
      throw new Error('Attempting to add Virtual Private Gateway route without an VGW defined.');
    }
    let route: cdk.aws_ec2.CfnRoute | PrefixListRoute;

    if (destinationPrefixListId) {
      if (!logGroupKmsKey) {
        throw new Error('Attempting to add prefix list route without specifying log group KMS key');
      }
      if (!logRetentionInDays) {
        throw new Error('Attempting to add prefix list route without specifying log group retention period');
      }
      route = new PrefixListRoute(this, id, {
        routeTableId: this.routeTableId,
        destinationPrefixListId,
        logGroupKmsKey,
        logRetentionInDays,
        gatewayId: this.vpc.virtualPrivateGateway.gatewayId,
      });
    } else {
      if (!destination) {
        throw new Error('Attempting to add CIDR route without specifying destination');
      }

      route = new cdk.aws_ec2.CfnRoute(this, id, {
        routeTableId: this.routeTableId,
        destinationCidrBlock: destination,
        gatewayId: this.vpc.virtualPrivateGateway.gatewayId,
      });
    }

    // Need to add depends on for the attachment, as VGW needs to be part of
    // the network (vpc)
    route.node.addDependency(this.vpc.virtualPrivateGatewayAttachment!);
    return route;
  }

  public addGatewayAssociation(type: string): void {
    if (type === 'internetGateway') {
      const association = new cdk.aws_ec2.CfnGatewayRouteTableAssociation(this, 'GatewayAssociation', {
        routeTableId: this.routeTableId,
        gatewayId: this.vpc.internetGateway!.ref,
      });
      association.node.addDependency(this.vpc.internetGatewayAttachment!);
    }

    if (type === 'virtualPrivateGateway') {
      const association = new cdk.aws_ec2.CfnGatewayRouteTableAssociation(this, 'VirtualPrivateGatewayAssociation', {
        routeTableId: this.routeTableId,
        gatewayId: this.vpc.virtualPrivateGateway!.gatewayId,
      });
      association.node.addDependency(this.vpc.virtualPrivateGatewayAttachment!);
    }
  }
}
