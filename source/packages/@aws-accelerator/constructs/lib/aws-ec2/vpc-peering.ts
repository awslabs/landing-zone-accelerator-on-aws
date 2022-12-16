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

import { CrossAccountRoute } from './cross-account-route';
import { PrefixListRoute } from './prefix-list-route';

export interface IVpcPeering extends cdk.IResource {
  /**
   * The name of the peering connection.
   */
  readonly name: string;

  /**
   * The ID of the VPC peering connection.
   */
  readonly peeringId: string;
}

export interface VpcPeeringProps {
  /**
   * The name of the peering connection.
   */
  readonly name: string;
  /**
   * The AWS account ID of the owner of the accepter VPC.
   */
  readonly peerOwnerId: string;

  /**
   * The Region code for the accepter VPC, if the accepter VPC is
   * located in a Region other than the Region in which you make the request.
   */
  readonly peerRegion: string;
  /**
   * The ID of the VPC with which you are creating the VPC peering connection.
   */
  readonly peerVpcId: string;

  /**
   * The ID of the VPC creating the connection request.
   */
  readonly vpcId: string;

  /**
   * The name of the VPC peer role for the
   * peering connection in another AWS account.
   */
  readonly peerRoleName?: string;

  /**
   * An optional list of CloudFormation tags.
   */
  readonly tags?: cdk.CfnTag[];
}

export class VpcPeering extends cdk.Resource implements IVpcPeering {
  public readonly name: string;
  public readonly peeringId: string;
  private roleArn?: string;

  constructor(scope: Construct, id: string, props: VpcPeeringProps) {
    super(scope, id);

    // Set name tag
    this.name = props.name;
    props.tags?.push({ key: 'Name', value: this.name });

    // Set role ARN
    if (props.peerRoleName) {
      this.roleArn = `arn:${cdk.Stack.of(this).partition}:iam::${props.peerOwnerId}:role/${props.peerRoleName}`;
    }

    const resource = new cdk.aws_ec2.CfnVPCPeeringConnection(this, 'Resource', {
      peerOwnerId: props.peerOwnerId,
      peerRegion: props.peerRegion,
      peerVpcId: props.peerVpcId,
      vpcId: props.vpcId,
      peerRoleArn: this.roleArn,
      tags: props.tags,
    });

    this.peeringId = resource.ref;
  }

  public addPeeringRoute(
    id: string,
    routeTableId: string,
    destination?: string,
    destinationPrefixListId?: string,
    logGroupKmsKey?: cdk.aws_kms.Key,
    logRetentionInDays?: number,
  ): void {
    if (destinationPrefixListId) {
      if (!logGroupKmsKey) {
        throw new Error('Attempting to add prefix list route without specifying log group KMS key');
      }
      if (!logRetentionInDays) {
        throw new Error('Attempting to add prefix list route without specifying log group retention period');
      }

      new PrefixListRoute(this, id, {
        routeTableId,
        destinationPrefixListId,
        logGroupKmsKey,
        logRetentionInDays,
        vpcPeeringConnectionId: this.peeringId,
      });
    } else {
      if (!destination) {
        throw new Error('Attempting to add CIDR route without specifying destination');
      }

      new cdk.aws_ec2.CfnRoute(this, id, {
        routeTableId: routeTableId,
        destinationCidrBlock: destination,
        vpcPeeringConnectionId: this.peeringId,
      });
    }
  }

  public addCrossAcctPeeringRoute(props: {
    id: string;
    ownerAccount: string;
    ownerRegion: string;
    partition: string;
    provider: cdk.custom_resources.Provider;
    roleName: string;
    routeTableId: string;
    destination?: string;
    destinationPrefixListId?: string;
  }): void {
    new CrossAccountRoute(this, props.id, {
      ownerAccount: props.ownerAccount,
      ownerRegion: props.ownerRegion,
      partition: props.partition,
      provider: props.provider,
      roleName: props.roleName,
      routeTableId: props.routeTableId,
      destination: props.destination,
      destinationPrefixListId: props.destinationPrefixListId,
      vpcPeeringConnectionId: this.peeringId,
    });
  }
}
