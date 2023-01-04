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

export interface CfnVpnConnectionProps {
  /**
   * Name of the VPN Connection
   */
  readonly name: string;

  /**
   * Identifier of the Customer Gateway
   */
  readonly customerGatewayId: string;

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

interface VpnTunnelOptionsSpecifications {
  /**
   * A Secrets Manager secret name
   */
  readonly preSharedKey?: string;

  /**
   * An IP address that is a size /30 CIDR block from the 169.254.0.0/16.
   */
  readonly tunnelInsideCidr?: string;
}

interface ICfnVpnConnection extends cdk.IResource {
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

export class VpnConnection extends cdk.Resource implements ICfnVpnConnection {
  public readonly vpnConnectionId: string;
  public readonly vpnConnectionName: string;
  public readonly name: string;

  constructor(scope: Construct, id: string, props: CfnVpnConnectionProps) {
    super(scope, id);
    this.name = props.name;

    const tunnelSpecifications: cdk.aws_ec2.CfnVPNConnection.VpnTunnelOptionsSpecificationProperty[] = [];

    for (const tunnelItem of props.vpnTunnelOptionsSpecifications ?? []) {
      let preSharedKeySecret;
      if (tunnelItem.preSharedKey)
        preSharedKeySecret = cdk.aws_secretsmanager.Secret.fromSecretNameV2(
          this,
          `preShareKeySecret-${tunnelItem.preSharedKey}-${tunnelItem.tunnelInsideCidr}`,
          tunnelItem.preSharedKey,
        ).secretValue.toString();
      tunnelSpecifications.push({
        preSharedKey: preSharedKeySecret,
        tunnelInsideCidr: tunnelItem.tunnelInsideCidr,
      });
    }
    const resource = new cdk.aws_ec2.CfnVPNConnection(this, 'VpnConnection', {
      customerGatewayId: props.customerGatewayId,
      type: 'ipsec.1',
      staticRoutesOnly: props.staticRoutesOnly,
      tags: props.tags,
      transitGatewayId: props.transitGatewayId,
      vpnGatewayId: props.virtualPrivateGateway,
      vpnTunnelOptionsSpecifications: tunnelSpecifications,
    });
    cdk.Tags.of(this).add('Name', props.name);

    this.vpnConnectionId = resource.ref;
    this.vpnConnectionName = props.name;
  }
}
