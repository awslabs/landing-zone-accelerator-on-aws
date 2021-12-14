/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import * as core from 'aws-cdk-lib';
import { v4 as uuidv4 } from 'uuid';
import { Construct } from 'constructs';

const path = require('path');

export interface ITransitGatewayRouteTableAssociation extends core.IResource {
  readonly transitGatewayAttachmentId: string; // TODO: change to ITransitGatewayAttachment
  readonly transitGatewayRouteTableId: string; // TODO: change to ITransitGatewayRouteTable
}

export interface TransitGatewayRouteTableAssociationProps {
  readonly transitGatewayAttachmentId: string;
  readonly transitGatewayRouteTableId: string;
}

export class TransitGatewayRouteTableAssociation extends core.Resource implements ITransitGatewayRouteTableAssociation {
  readonly transitGatewayAttachmentId: string;
  readonly transitGatewayRouteTableId: string;

  constructor(scope: Construct, id: string, props: TransitGatewayRouteTableAssociationProps) {
    super(scope, id);

    this.transitGatewayAttachmentId = props.transitGatewayAttachmentId;
    this.transitGatewayRouteTableId = props.transitGatewayRouteTableId;

    new ec2.CfnTransitGatewayRouteTableAssociation(this, 'Resource', {
      transitGatewayAttachmentId: props.transitGatewayAttachmentId,
      transitGatewayRouteTableId: props.transitGatewayRouteTableId,
    });
  }
}

export interface ITransitGatewayRouteTablePropagation extends core.IResource {
  readonly transitGatewayAttachmentId: string; // TODO: change to ITransitGatewayAttachment
  readonly transitGatewayRouteTableId: string; // TODO: change to ITransitGatewayRouteTable
}

export interface TransitGatewayRouteTablePropagationProps {
  readonly transitGatewayAttachmentId: string;
  readonly transitGatewayRouteTableId: string;
}

export class TransitGatewayRouteTablePropagation extends core.Resource implements ITransitGatewayRouteTablePropagation {
  readonly transitGatewayAttachmentId: string;
  readonly transitGatewayRouteTableId: string;

  constructor(scope: Construct, id: string, props: TransitGatewayRouteTablePropagationProps) {
    super(scope, id);

    this.transitGatewayAttachmentId = props.transitGatewayAttachmentId;
    this.transitGatewayRouteTableId = props.transitGatewayRouteTableId;

    new ec2.CfnTransitGatewayRouteTablePropagation(this, 'Resource', {
      transitGatewayAttachmentId: props.transitGatewayAttachmentId,
      transitGatewayRouteTableId: props.transitGatewayRouteTableId,
    });
  }
}

export interface ITransitGatewayAttachment extends core.IResource {
  readonly transitGatewayAttachmentId: string;
  readonly transitGatewayAttachmentName: string;
}

export interface TransitGatewayAttachmentProps {
  readonly name: string;
  readonly transitGatewayId: string;
  readonly subnetIds: string[];
  readonly vpcId: string;
}

export interface TransitGatewayAttachmentLookupOptions {
  readonly name: string;
  readonly owningAccountId: string;
  readonly transitGatewayId: string; // TODO: change to ITransitGateway
  readonly roleName?: string;
}

export class TransitGatewayAttachment extends core.Resource implements ITransitGatewayAttachment {
  public static fromLookup(
    scope: Construct,
    id: string,
    options: TransitGatewayAttachmentLookupOptions,
  ): ITransitGatewayAttachment {
    class Import extends core.Resource implements ITransitGatewayAttachment {
      public readonly transitGatewayAttachmentId: string;
      public readonly transitGatewayAttachmentName = options.name;
      constructor(scope: Construct, id: string) {
        super(scope, id);

        const GET_TRANSIT_GATEWAY_ATTACHMENT = 'Custom::GetTransitGatewayAttachment';

        const cr = core.CustomResourceProvider.getOrCreateProvider(this, GET_TRANSIT_GATEWAY_ATTACHMENT, {
          codeDirectory: path.join(__dirname, 'get-transit-gateway-attachment/dist'),
          runtime: core.CustomResourceProviderRuntime.NODEJS_14_X,
          policyStatements: [
            {
              Effect: 'Allow',
              Action: ['sts:AssumeRole'],
              Resource: '*',
            },
          ],
        });

        const resource = new core.CustomResource(this, 'Resource', {
          resourceType: GET_TRANSIT_GATEWAY_ATTACHMENT,
          serviceToken: cr.serviceToken,
          properties: {
            name: options.name,
            transitGatewayId: options.transitGatewayId,
            roleArn: core.Stack.of(this).formatArn({
              service: 'iam',
              region: '',
              account: options.owningAccountId,
              resource: 'role',
              arnFormat: core.ArnFormat.SLASH_RESOURCE_NAME,
              resourceName: options.roleName,
            }),
            uuid: uuidv4(), // Generates a new UUID to force the resource to update
          },
        });

        this.transitGatewayAttachmentId = resource.ref;
      }
    }
    return new Import(scope, id);
  }

  public readonly transitGatewayAttachmentId: string;
  public readonly transitGatewayAttachmentName: string;

  constructor(scope: Construct, id: string, props: TransitGatewayAttachmentProps) {
    super(scope, id);

    const resource = new ec2.CfnTransitGatewayAttachment(this, 'Resource', {
      vpcId: props.vpcId,
      transitGatewayId: props.transitGatewayId,
      subnetIds: props.subnetIds,
      tags: [{ key: 'Name', value: props.name }],
    });

    this.transitGatewayAttachmentId = resource.ref;
    this.transitGatewayAttachmentName = props.name;
  }
}

export interface ITransitGateway extends core.IResource {
  /**
   * The identifier of the transit gateway
   *
   * @attribute
   */
  readonly transitGatewayId: string;

  /**
   * The name of the transit gateway
   *
   * @attribute
   */
  readonly transitGatewayName: string;

  /**
   * The ARN of the transit gateway
   *
   * @attribute
   */
  readonly transitGatewayArn: string;
}

export interface TransitGatewayProps {
  /**
   * The name of the transit gateway. Will be assigned to the Name tag
   */
  readonly name: string;

  /**
   * A private Autonomous System Number (ASN) for the Amazon side of a BGP session. The range is
   * 64512 to 65534 for 16-bit ASNs. The default is 64512.
   */
  readonly amazonSideAsn?: number;

  /**
   * Enable or disable automatic acceptance of attachment requests. Disabled by default.
   */
  readonly autoAcceptSharedAttachments?: string;

  /**
   * Enable or disable automatic association with the default association route table. Enabled by
   * default.
   */
  readonly defaultRouteTableAssociation?: string;

  /**
   * Enable or disable automatic propagation of routes to the default propagation route table.
   * Enabled by default.
   */
  readonly defaultRouteTablePropagation?: string;

  /**
   * The description of the transit gateway.
   */
  readonly description?: string;

  /**
   * Enable or disable DNS support. Enabled by default.
   */
  readonly dnsSupport?: string;

  /**
   * Indicates whether multicast is enabled on the transit gateway
   */
  readonly multicastSupport?: string;

  /**
   * Enable or disable Equal Cost Multipath Protocol support. Enabled by default.
   */
  readonly vpnEcmpSupport?: string;
}

/**
 * Creates a Transit Gateway
 */
export class TransitGateway extends core.Resource implements ITransitGateway {
  readonly transitGatewayId: string;

  readonly transitGatewayName: string;

  readonly transitGatewayArn: string;

  constructor(scope: Construct, id: string, props: TransitGatewayProps) {
    super(scope, id);

    const resource = new ec2.CfnTransitGateway(this, 'Resource', {
      amazonSideAsn: props.amazonSideAsn,
      autoAcceptSharedAttachments: props.autoAcceptSharedAttachments,
      defaultRouteTableAssociation: props.defaultRouteTableAssociation,
      defaultRouteTablePropagation: props.defaultRouteTablePropagation,
      dnsSupport: props.dnsSupport,
      vpnEcmpSupport: props.vpnEcmpSupport,
      tags: [{ key: 'Name', value: props.name }],
    });

    this.transitGatewayId = resource.ref;

    this.transitGatewayName = props.name;

    this.transitGatewayArn = core.Stack.of(this).formatArn({
      service: 'ec2',
      resource: 'transit-gateway',
      arnFormat: core.ArnFormat.SLASH_RESOURCE_NAME,
      resourceName: this.transitGatewayId,
    });
  }
}
