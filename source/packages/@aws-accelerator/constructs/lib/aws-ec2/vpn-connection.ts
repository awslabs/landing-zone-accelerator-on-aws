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

export interface VpnConnectionProps {
  /**
   * Name of the VPN Connection
   */
  readonly name: string;
  /**
   * Identifier of the Customer Gateway
   */
  readonly customerGatewayId: string;
  /**
   * Amazon-side IPv4 CIDR
   */
  readonly amazonIpv4NetworkCidr?: string;
  /**
   * Customer-side IPv4 CIDR
   */
  readonly customerIpv4NetworkCidr?: string;
  /**
   * If advanced VPN options are enabled, a custom resource handler to
   * maintain the resource
   */
  readonly customResourceHandler?: cdk.aws_lambda.IFunction;
  /**
   * Enable VPN acceleration
   */
  readonly enableVpnAcceleration?: boolean;
  /**
   * The owning account ID, if the VPN tunnel needs to be created cross-account
   */
  readonly owningAccountId?: string;
  /**
   * The owning region, if the VPN tunnel needs to be created cross-region
   */
  readonly owningRegion?: string;
  /**
   * The role name to assume if creating a cross-account VPN
   */
  readonly roleName?: string;
  /**
   * The name of the Transit Gateway to terminate the VPN Connection.
   */
  readonly transitGatewayId?: string;
  /**
   * The name of the Virtual Private Gateway to terminate the VPN Connection.
   */
  readonly virtualPrivateGateway?: string;
  /**
   * Determine if static routes will be used or dynamic for the VPN Connection.
   */
  readonly staticRoutesOnly?: boolean;
  /**
   * The optional configuration of the VPN Tunnels of a VPN Connection
   */
  readonly vpnTunnelOptionsSpecifications?: VpnTunnelOptionsSpecifications[];
  /**
   * The array of tag values to add onto the VPN Connection.
   */
  readonly tags?: cdk.CfnTag[];
}

export interface VpnTunnelOptionsSpecifications {
  /**
   * DPD timeout action
   */
  readonly dpdTimeoutAction?: string;
  /**
   * DPD timeout in seconds
   */
  readonly dpdTimeoutSeconds?: number;
  /**
   * IKE versions
   */
  readonly ikeVersions?: number[];
  /**
   * VPN tunnel logging
   */
  readonly logging?: {
    readonly enable?: boolean;
    readonly logGroupArn?: string;
    readonly outputFormat?: string;
  };
  /**
   * Phase 1 config
   */
  readonly phase1?: {
    readonly dhGroups?: number[];
    readonly encryptionAlgorithms?: string[];
    readonly integrityAlgorithms?: string[];
    readonly lifetimeSeconds?: number;
  };
  /**
   * Phase 2 config
   */
  readonly phase2?: {
    readonly dhGroups?: number[];
    readonly encryptionAlgorithms?: string[];
    readonly integrityAlgorithms?: string[];
    readonly lifetimeSeconds?: number;
  };
  /**
   * A Secrets Manager secret name
   */
  readonly preSharedKey?: string;
  /**
   * IKE rekey fuzz percentage
   */
  readonly rekeyFuzzPercentage?: number;
  /**
   * IKE rekey margin time in seconds
   */
  readonly rekeyMarginTimeSeconds?: number;
  /**
   * IKE replay window size
   */
  readonly replayWindowSize?: number;
  /**
   * The startup action for the VPN connection
   */
  readonly startupAction?: string;
  /**
   * An IP address that is a size /30 CIDR block from the 169.254.0.0/16.
   */
  readonly tunnelInsideCidr?: string;
  /**
   * Enable tunnel lifecycle control
   */
  readonly tunnelLifecycleControl?: boolean;
}

interface IVpnConnection extends cdk.IResource {
  /**
   * The identifier of the VPN Connection
   *
   * @attribute
   */
  readonly vpnConnectionId: string;
}

/**
 * Class for VPN Connection
 */

export class VpnConnection extends cdk.Resource implements IVpnConnection {
  public readonly vpnConnectionId: string;
  public readonly name: string;

  constructor(scope: Construct, id: string, props: VpnConnectionProps) {
    super(scope, id);
    this.name = props.name;

    let resource: cdk.aws_ec2.CfnVPNConnection | cdk.CustomResource;

    if (!props.customResourceHandler) {
      resource = new cdk.aws_ec2.CfnVPNConnection(this, 'VpnConnection', {
        customerGatewayId: props.customerGatewayId,
        type: 'ipsec.1',
        staticRoutesOnly: props.staticRoutesOnly,
        tags: props.tags,
        transitGatewayId: props.transitGatewayId,
        vpnGatewayId: props.virtualPrivateGateway,
        vpnTunnelOptionsSpecifications: props.vpnTunnelOptionsSpecifications,
      });
      cdk.Tags.of(this).add('Name', props.name);
    } else {
      // Convert tags to EC2 API format
      const tags =
        props.tags?.map(tag => {
          return { Key: tag.key, Value: tag.value };
        }) ?? [];
      tags.push({ Key: 'Name', Value: props.name });

      resource = new LzaCustomResource(this, 'CustomResource', {
        resource: {
          name: 'CustomResource',
          parentId: id,
          properties: [
            {
              amazonIpv4NetworkCidr: props.amazonIpv4NetworkCidr,
              customerIpv4NetworkCidr: props.customerIpv4NetworkCidr,
              enableVpnAcceleration: props.enableVpnAcceleration,
              customerGatewayId: props.customerGatewayId,
              owningAccountId: props.owningAccountId,
              owningRegion: props.owningRegion,
              roleName: props.roleName,
              staticRoutesOnly: props.staticRoutesOnly,
              transitGatewayId: props.transitGatewayId,
              vpnGatewayId: props.virtualPrivateGateway,
              vpnTunnelOptions: props.vpnTunnelOptionsSpecifications,
              tags,
            },
          ],
          onEventHandler: props.customResourceHandler,
        },
      }).resource;
    }
    this.vpnConnectionId = resource.ref;
  }
}
