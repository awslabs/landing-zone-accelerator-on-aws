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
import { v4 as uuidv4 } from 'uuid';

import { TransitGatewayAttachmentOptionsConfig } from '@aws-accelerator/config';

const path = require('path');

export interface ITransitGatewayRouteTableAssociation extends cdk.IResource {
  readonly transitGatewayAttachmentId: string;
  readonly transitGatewayRouteTableId: string;
}

export interface TransitGatewayRouteTableAssociationProps {
  readonly transitGatewayAttachmentId: string;
  readonly transitGatewayRouteTableId: string;
}

export class TransitGatewayRouteTableAssociation extends cdk.Resource implements ITransitGatewayRouteTableAssociation {
  readonly transitGatewayAttachmentId: string;
  readonly transitGatewayRouteTableId: string;

  constructor(scope: Construct, id: string, props: TransitGatewayRouteTableAssociationProps) {
    super(scope, id);

    this.transitGatewayAttachmentId = props.transitGatewayAttachmentId;
    this.transitGatewayRouteTableId = props.transitGatewayRouteTableId;

    new cdk.aws_ec2.CfnTransitGatewayRouteTableAssociation(this, 'Resource', {
      transitGatewayAttachmentId: props.transitGatewayAttachmentId,
      transitGatewayRouteTableId: props.transitGatewayRouteTableId,
    });
  }
}

export interface ITransitGatewayRouteTablePropagation extends cdk.IResource {
  readonly transitGatewayAttachmentId: string;
  readonly transitGatewayRouteTableId: string;
}

export interface TransitGatewayRouteTablePropagationProps {
  readonly transitGatewayAttachmentId: string;
  readonly transitGatewayRouteTableId: string;
}

export class TransitGatewayRouteTablePropagation extends cdk.Resource implements ITransitGatewayRouteTablePropagation {
  readonly transitGatewayAttachmentId: string;
  readonly transitGatewayRouteTableId: string;

  constructor(scope: Construct, id: string, props: TransitGatewayRouteTablePropagationProps) {
    super(scope, id);

    this.transitGatewayAttachmentId = props.transitGatewayAttachmentId;
    this.transitGatewayRouteTableId = props.transitGatewayRouteTableId;

    new cdk.aws_ec2.CfnTransitGatewayRouteTablePropagation(this, 'Resource', {
      transitGatewayAttachmentId: props.transitGatewayAttachmentId,
      transitGatewayRouteTableId: props.transitGatewayRouteTableId,
    });
  }
}

export interface ITransitGatewayAttachment extends cdk.IResource {
  readonly transitGatewayAttachmentId: string;
  readonly transitGatewayAttachmentName: string;
}

export interface TransitGatewayAttachmentProps {
  readonly name: string;
  readonly partition: string;
  readonly transitGatewayId: string;
  readonly subnetIds: string[];
  readonly vpcId: string;
  readonly options?: TransitGatewayAttachmentOptionsConfig;
  readonly tags?: cdk.CfnTag[];
}

export enum TransitGatewayAttachmentType {
  DXGW = 'direct-connect-gateway',
  PEERING = 'peering',
  VPC = 'vpc',
  VPN = 'vpn',
}

export interface TransitGatewayAttachmentLookupOptions {
  readonly name: string;
  readonly owningAccountId: string;
  readonly transitGatewayId: string;
  readonly type: TransitGatewayAttachmentType;
  readonly roleName?: string;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey: cdk.aws_kms.Key;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
}

export class TransitGatewayAttachment extends cdk.Resource implements ITransitGatewayAttachment {
  public static fromLookup(
    scope: Construct,
    id: string,
    options: TransitGatewayAttachmentLookupOptions,
  ): ITransitGatewayAttachment {
    class Import extends cdk.Resource implements ITransitGatewayAttachment {
      public readonly transitGatewayAttachmentId: string;
      public readonly transitGatewayAttachmentName = options.name;

      constructor(scope: Construct, id: string) {
        super(scope, id);

        const GET_TRANSIT_GATEWAY_ATTACHMENT = 'Custom::GetTransitGatewayAttachment';

        const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, GET_TRANSIT_GATEWAY_ATTACHMENT, {
          codeDirectory: path.join(__dirname, 'get-transit-gateway-attachment/dist'),
          runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
          policyStatements: [
            {
              Effect: 'Allow',
              Action: ['sts:AssumeRole'],
              Resource: '*',
            },
            {
              Effect: 'Allow',
              Action: ['ec2:DescribeTransitGatewayAttachments', 'ec2:DescribeVpnConnections'],
              Resource: '*',
            },
          ],
        });

        // Construct role arn if this is a cross-account lookup
        let roleArn: string | undefined = undefined;
        if (options.roleName) {
          roleArn = cdk.Stack.of(this).formatArn({
            service: 'iam',
            region: '',
            account: options.owningAccountId,
            resource: 'role',
            arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
            resourceName: options.roleName,
          });
        }

        const resource = new cdk.CustomResource(this, 'Resource', {
          resourceType: GET_TRANSIT_GATEWAY_ATTACHMENT,
          serviceToken: provider.serviceToken,
          properties: {
            region: cdk.Stack.of(this).region,
            name: options.name,
            transitGatewayId: options.transitGatewayId,
            type: options.type,
            roleArn,
            uuid: uuidv4(), // Generates a new UUID to force the resource to update
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
            retention: options.logRetentionInDays,
            encryptionKey: options.kmsKey,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
          });
        resource.node.addDependency(logGroup);

        this.transitGatewayAttachmentId = resource.ref;
      }
    }
    return new Import(scope, id);
  }

  public readonly transitGatewayAttachmentId: string;
  public readonly transitGatewayAttachmentName: string;

  constructor(scope: Construct, id: string, props: TransitGatewayAttachmentProps) {
    super(scope, id);

    let resource: cdk.aws_ec2.CfnTransitGatewayVpcAttachment | cdk.aws_ec2.CfnTransitGatewayAttachment;
    switch (props.partition) {
      case 'aws':
        resource = new cdk.aws_ec2.CfnTransitGatewayVpcAttachment(this, 'Resource', {
          vpcId: props.vpcId,
          transitGatewayId: props.transitGatewayId,
          subnetIds: props.subnetIds,
          options: {
            ApplianceModeSupport: props.options?.applianceModeSupport ?? 'disable',
            DnsSupport: props.options?.dnsSupport ?? 'enable',
            Ipv6Support: props.options?.ipv6Support ?? 'disable',
          },
          tags: props.tags,
        });
        break;
      case 'aws-us-gov':
        resource = new cdk.aws_ec2.CfnTransitGatewayAttachment(this, 'Resource', {
          vpcId: props.vpcId,
          transitGatewayId: props.transitGatewayId,
          subnetIds: props.subnetIds,
          options: {
            ApplianceModeSupport: props.options?.applianceModeSupport ?? 'disable',
            DnsSupport: props.options?.dnsSupport ?? 'enable',
            Ipv6Support: props.options?.ipv6Support ?? 'disable',
          },
          tags: props.tags,
        });
        break;
      default:
        resource = new cdk.aws_ec2.CfnTransitGatewayAttachment(this, 'Resource', {
          vpcId: props.vpcId,
          transitGatewayId: props.transitGatewayId,
          subnetIds: props.subnetIds,
          tags: props.tags,
        });
        break;
    }
    // Add name tag
    cdk.Tags.of(this).add('Name', props.name);

    this.transitGatewayAttachmentId = resource.ref;
    this.transitGatewayAttachmentName = props.name;
  }
}

export interface ITransitGateway extends cdk.IResource {
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

  /**
   * Tags that will be attached to the transit gateway
   */
  readonly tags?: cdk.CfnTag[];
}

/**
 * Creates a Transit Gateway
 */
export class TransitGateway extends cdk.Resource implements ITransitGateway {
  readonly transitGatewayId: string;

  readonly transitGatewayName: string;

  readonly transitGatewayArn: string;

  constructor(scope: Construct, id: string, props: TransitGatewayProps) {
    super(scope, id);

    const resource = new cdk.aws_ec2.CfnTransitGateway(this, 'Resource', {
      amazonSideAsn: props.amazonSideAsn,
      autoAcceptSharedAttachments: props.autoAcceptSharedAttachments,
      defaultRouteTableAssociation: props.defaultRouteTableAssociation,
      defaultRouteTablePropagation: props.defaultRouteTablePropagation,
      dnsSupport: props.dnsSupport,
      vpnEcmpSupport: props.vpnEcmpSupport,
      tags: props.tags,
    });
    cdk.Tags.of(this).add('Name', props.name);

    this.transitGatewayId = resource.ref;

    this.transitGatewayName = props.name;

    this.transitGatewayArn = cdk.Stack.of(this).formatArn({
      service: 'ec2',
      resource: 'transit-gateway',
      arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
      resourceName: this.transitGatewayId,
    });
  }
}
