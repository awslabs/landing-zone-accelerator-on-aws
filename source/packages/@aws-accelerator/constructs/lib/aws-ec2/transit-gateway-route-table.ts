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

import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as cdk from 'aws-cdk-lib';
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';

export interface TransitGatewayRouteTableProps {
  /**
   * The name of the transit gateway route table. Will be assigned to the Name tag
   */
  readonly name: string;

  /**
   * The ID of the transit gateway.
   */
  readonly transitGatewayId: string;

  /**
   * The tags that will be attached to the transit gateway route table.
   */
  readonly tags?: cdk.CfnTag[];
}

/**
 * Creates a Transit Gateway Route Table
 */
export class TransitGatewayRouteTable extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: TransitGatewayRouteTableProps) {
    super(scope, id);

    const routeTable = new ec2.CfnTransitGatewayRouteTable(this, pascalCase(`${props.name}TransitGatewayRouteTable`), {
      transitGatewayId: props.transitGatewayId,
      tags: props.tags,
    });
    cdk.Tags.of(this).add('Name', props.name);

    this.id = routeTable.ref;
  }
}
