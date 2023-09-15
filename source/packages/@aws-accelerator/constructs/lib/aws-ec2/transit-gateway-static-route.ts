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
import { LzaCustomResource } from '../lza-custom-resource';

export interface TransitGatewayStaticRouteProps {
  /**
   * The CIDR block for the route.
   */
  readonly destinationCidrBlock: string;
  /**
   * The ID of the transit gateway route table.
   */
  readonly transitGatewayRouteTableId: string;
  /**
   * Determines if route is blackholed.
   */
  readonly blackhole?: boolean;
  /**
   * Custom resource handler for cross-account TGW associations
   */
  readonly customResourceHandler?: cdk.aws_lambda.IFunction;
  /**
   * Owning account ID for cross-account TGW associations
   */
  readonly owningAccountId?: string;
  /**
   * Owning region for cross-account TGW associations
   */
  readonly owningRegion?: string;
  /**
   * Role name for cross-account TGW associations
   */
  readonly roleName?: string;
  /**
   * The identifier of the Transit Gateway Attachment
   */
  readonly transitGatewayAttachmentId?: string;
}

/**
 * Creates a Transit Gateway Static Route
 */
export class TransitGatewayStaticRoute extends Construct {
  constructor(scope: Construct, id: string, props: TransitGatewayStaticRouteProps) {
    super(scope, id);

    if (!props.customResourceHandler) {
      new cdk.aws_ec2.CfnTransitGatewayRoute(this, 'StaticRoute', {
        transitGatewayRouteTableId: props.transitGatewayRouteTableId,
        blackhole: props.blackhole,
        destinationCidrBlock: props.destinationCidrBlock,
        transitGatewayAttachmentId: props.transitGatewayAttachmentId,
      });
    } else {
      new LzaCustomResource(this, 'CustomResource', {
        resource: {
          name: 'CustomResource',
          parentId: id,
          properties: [
            {
              destinationCidrBlock: props.destinationCidrBlock,
              transitGatewayRouteTableId: props.transitGatewayRouteTableId,
              blackhole: props.blackhole,
              transitGatewayAttachmentId: props.transitGatewayAttachmentId,
              owningAccountId: props.owningAccountId,
              owningRegion: props.owningRegion,
              roleName: props.roleName,
            },
          ],
          onEventHandler: props.customResourceHandler,
        },
      });
    }
  }
}
