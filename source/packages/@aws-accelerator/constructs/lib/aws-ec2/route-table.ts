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

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { PrefixListRoute } from './prefix-list-route';
import { ITransitGatewayAttachment } from './transit-gateway';
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

export interface ImportRouteTableProps extends Omit<RouteTableProps, 'tags' | 'name'> {
  routeTableId: string;
}

export abstract class RouteTableBase extends cdk.Resource implements IRouteTable {
  public abstract readonly routeTableId: string;
  public abstract readonly vpc: Vpc;

  public addTransitGatewayRoute(
    id: string,
    transitGatewayId: string,
    transitGatewayAttachment: ITransitGatewayAttachment,
    destination?: string,
    destinationPrefixListId?: string,
    ipv6Destination?: string,
    logGroupKmsKey?: cdk.aws_kms.IKey,
    logRetentionInDays?: number,
  ): cdk.aws_ec2.CfnRoute | PrefixListRoute {
    let route: cdk.aws_ec2.CfnRoute | PrefixListRoute;

    if (destinationPrefixListId) {
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
      if (!destination && !ipv6Destination) {
        throw new Error('Attempting to add CIDR route without specifying destination');
      }

      route = new cdk.aws_ec2.CfnRoute(this, id, {
        routeTableId: this.routeTableId,
        destinationCidrBlock: destination,
        destinationIpv6CidrBlock: ipv6Destination,
        transitGatewayId: transitGatewayId,
      });
    }

    transitGatewayAttachment.addDependency(route);
    return route;
  }

  public addNatGatewayRoute(
    id: string,
    natGatewayId: string,
    destination?: string,
    destinationPrefixListId?: string,
    ipv6Destination?: string,
    logGroupKmsKey?: cdk.aws_kms.IKey,
    logRetentionInDays?: number,
  ): cdk.aws_ec2.CfnRoute | PrefixListRoute {
    let route: cdk.aws_ec2.CfnRoute | PrefixListRoute;

    if (destinationPrefixListId) {
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
      if (!destination && !ipv6Destination) {
        throw new Error('Attempting to add CIDR route without specifying destination');
      }

      route = new cdk.aws_ec2.CfnRoute(this, id, {
        routeTableId: this.routeTableId,
        destinationCidrBlock: destination,
        destinationIpv6CidrBlock: ipv6Destination,
        natGatewayId: natGatewayId,
      });
    }
    return route;
  }

  public addLocalGatewayRoute(
    id: string,
    localGatewayId: string,
    destination?: string,
    destinationPrefixListId?: string,
    ipv6Destination?: string,
    logGroupKmsKey?: cdk.aws_kms.IKey,
    logRetentionInDays?: number,
  ): cdk.aws_ec2.CfnRoute | PrefixListRoute {
    let route: cdk.aws_ec2.CfnRoute | PrefixListRoute;

    if (destinationPrefixListId) {
      if (!logRetentionInDays) {
        throw new Error('Attempting to add prefix list route without specifying log group retention period');
      }

      route = new PrefixListRoute(this, id, {
        routeTableId: this.routeTableId,
        destinationPrefixListId,
        logGroupKmsKey,
        logRetentionInDays,
        localGatewayId,
      });
    } else {
      if (!destination && !ipv6Destination) {
        throw new Error('Attempting to add CIDR route without specifying destination');
      }

      route = new cdk.aws_ec2.CfnRoute(this, id, {
        routeTableId: this.routeTableId,
        destinationCidrBlock: destination,
        destinationIpv6CidrBlock: ipv6Destination,
        localGatewayId: localGatewayId,
      });
    }
    return route;
  }

  public addInternetGatewayRoute(
    id: string,
    destination?: string,
    destinationPrefixListId?: string,
    ipv6Destination?: string,
    logGroupKmsKey?: cdk.aws_kms.IKey,
    logRetentionInDays?: number,
  ): cdk.aws_ec2.CfnRoute | PrefixListRoute {
    if (!this.vpc.internetGatewayId) {
      throw new Error('Attempting to add Internet Gateway route without an IGW defined.');
    }

    let route: cdk.aws_ec2.CfnRoute | PrefixListRoute;

    if (destinationPrefixListId) {
      if (!logRetentionInDays) {
        throw new Error('Attempting to add prefix list route without specifying log group retention period');
      }

      route = new PrefixListRoute(this, id, {
        routeTableId: this.routeTableId,
        destinationPrefixListId,
        logGroupKmsKey,
        logRetentionInDays,
        gatewayId: this.vpc.internetGatewayId,
      });
    } else {
      if (!destination && !ipv6Destination) {
        throw new Error('Attempting to add CIDR route without specifying destination');
      }

      route = new cdk.aws_ec2.CfnRoute(this, id, {
        routeTableId: this.routeTableId,
        destinationCidrBlock: destination,
        destinationIpv6CidrBlock: ipv6Destination,
        gatewayId: this.vpc.internetGatewayId,
      });
    }

    // Need to add depends on for the attachment, as IGW needs to be part of
    // the network (vpc)
    // To avoid explicit dependency setting, create addInternetGatewayRoute in VPC similar to how CDK implements
    this.vpc.addInternetGatewayDependent(route);
    return route;
  }

  public addEgressOnlyIgwRoute(
    id: string,
    destination?: string,
    destinationPrefixListId?: string,
    ipv6Destination?: string,
    logGroupKmsKey?: cdk.aws_kms.IKey,
    logRetentionInDays?: number,
  ): cdk.aws_ec2.CfnRoute | PrefixListRoute {
    if (!this.vpc.egressOnlyIgwId) {
      throw new Error('Attempting to add Egress-only Internet Gateway route without an EIGW defined.');
    }

    let route: cdk.aws_ec2.CfnRoute | PrefixListRoute;

    if (destinationPrefixListId) {
      if (!logRetentionInDays) {
        throw new Error('Attempting to add prefix list route without specifying log group retention period');
      }

      route = new PrefixListRoute(this, id, {
        routeTableId: this.routeTableId,
        destinationPrefixListId,
        logGroupKmsKey,
        logRetentionInDays,
        egressOnlyInternetGatewayId: this.vpc.egressOnlyIgwId,
      });
    } else {
      if (!destination && !ipv6Destination) {
        throw new Error('Attempting to add CIDR route without specifying destination');
      }

      route = new cdk.aws_ec2.CfnRoute(this, id, {
        routeTableId: this.routeTableId,
        destinationCidrBlock: destination,
        destinationIpv6CidrBlock: ipv6Destination,
        egressOnlyInternetGatewayId: this.vpc.egressOnlyIgwId,
      });
    }
    return route;
  }

  public addVirtualPrivateGatewayRoute(
    id: string,
    destination?: string,
    destinationPrefixListId?: string,
    ipv6Destination?: string,
    logGroupKmsKey?: cdk.aws_kms.IKey,
    logRetentionInDays?: number,
  ): cdk.aws_ec2.CfnRoute | PrefixListRoute {
    if (!this.vpc.virtualPrivateGatewayId) {
      throw new Error('Attempting to add Virtual Private Gateway route without an VGW defined.');
    }
    let route: cdk.aws_ec2.CfnRoute | PrefixListRoute;

    if (destinationPrefixListId) {
      if (!logRetentionInDays) {
        throw new Error('Attempting to add prefix list route without specifying log group retention period');
      }
      route = new PrefixListRoute(this, id, {
        routeTableId: this.routeTableId,
        destinationPrefixListId,
        logGroupKmsKey,
        logRetentionInDays,
        gatewayId: this.vpc.virtualPrivateGatewayId,
      });
    } else {
      if (!destination && !ipv6Destination) {
        throw new Error('Attempting to add CIDR route without specifying destination');
      }

      route = new cdk.aws_ec2.CfnRoute(this, id, {
        routeTableId: this.routeTableId,
        destinationCidrBlock: destination,
        destinationIpv6CidrBlock: ipv6Destination,
        gatewayId: this.vpc.virtualPrivateGatewayId,
      });
    }

    // Need to add depends on for the attachment, as VGW needs to be part of
    // the network (vpc)
    // To avoid explicit dependency setting, create addVirtualPrivateGatewayRoute in VPC similar to how CDK implements
    this.vpc.addVirtualPrivateGatewayDependent(route);
    return route;
  }

  public addGatewayAssociation(type: string): void {
    if (type === 'internetGateway') {
      const association = new cdk.aws_ec2.CfnGatewayRouteTableAssociation(this, 'GatewayAssociation', {
        routeTableId: this.routeTableId,
        gatewayId: this.vpc.internetGatewayId!,
      });
      this.vpc.addInternetGatewayDependent(association);
    }

    if (type === 'virtualPrivateGateway') {
      const association = new cdk.aws_ec2.CfnGatewayRouteTableAssociation(this, 'VirtualPrivateGatewayAssociation', {
        routeTableId: this.routeTableId,
        gatewayId: this.vpc.virtualPrivateGatewayId!,
      });
      this.vpc.addVirtualPrivateGatewayDependent(association);
    }
  }
}

export class ImportedRouteTable extends RouteTableBase {
  public readonly routeTableId: string;
  public readonly vpc: Vpc;

  constructor(scope: Construct, id: string, props: ImportRouteTableProps) {
    super(scope, id);
    this.routeTableId = props.routeTableId;
    this.vpc = props.vpc;
  }
}

export class RouteTable extends RouteTableBase {
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

  static fromRouteTableAttributes(scope: Construct, id: string, props: ImportRouteTableProps) {
    return new ImportedRouteTable(scope, id, props);
  }
}
