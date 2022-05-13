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
import { Construct } from 'constructs';

export interface TransitGatewayStaticRouteProps {
  /**
   * The ID of the transit gateway route table.
   */
  readonly transitGatewayRouteTableId: string;

  /**
   * Determines if route is blackholed.
   */
  readonly blackhole?: boolean;

  /**
   * The CIDR block for the route.
   *
   */
  readonly destinationCidrBlock?: string;

  /**
   * The identifier of the Transit Gateway Attachment
   *
   */
  readonly transitGatewayAttachmentId?: string;
}

/**
 * Creates a Transit Gateway Static Route
 */
export class TransitGatewayStaticRoute extends Construct {
  constructor(scope: Construct, id: string, props: TransitGatewayStaticRouteProps) {
    super(scope, id);
    new ec2.CfnTransitGatewayRoute(this, 'StaticRoute', {
      transitGatewayRouteTableId: props.transitGatewayRouteTableId,
      blackhole: props.blackhole,
      destinationCidrBlock: props.destinationCidrBlock,
      transitGatewayAttachmentId: props.transitGatewayAttachmentId,
    });
  }
}
