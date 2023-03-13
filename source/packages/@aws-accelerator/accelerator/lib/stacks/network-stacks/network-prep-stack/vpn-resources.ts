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

import { CustomerGatewayConfig, VpnConnectionConfig } from '@aws-accelerator/config';
import { CustomerGateway, VpnConnection } from '@aws-accelerator/constructs';
import { SsmResourceType } from '@aws-accelerator/utils';
import { pascalCase } from 'pascal-case';
import { AcceleratorStackProps } from '../../accelerator-stack';
import { LogLevel } from '../network-stack';
import { NetworkPrepStack } from './network-prep-stack';

export class VpnResources {
  public readonly cgwMap: Map<string, string>;
  public readonly vpnMap: Map<string, string>;
  private stack: NetworkPrepStack;
  private transitGatewayMap: Map<string, string>;

  constructor(
    networkPrepStack: NetworkPrepStack,
    transitGatewayMap: Map<string, string>,
    props: AcceleratorStackProps,
  ) {
    // Set private properties
    this.stack = networkPrepStack;
    this.transitGatewayMap = transitGatewayMap;

    // Create CGWs and VPN connections
    [this.cgwMap, this.vpnMap] = this.createVpnConnectionResources(props);
  }

  /**
   * Create VPN connection resources
   * @param props
   */
  private createVpnConnectionResources(props: AcceleratorStackProps): Map<string, string>[] {
    const cgwMap = new Map<string, string>();
    const vpnMap = new Map<string, string>();
    //
    // Generate Customer Gateways
    //
    for (const cgwItem of props.networkConfig.customerGateways ?? []) {
      const accountId = props.accountsConfig.getAccountId(cgwItem.account);
      if (this.stack.isTargetStack([accountId], [cgwItem.region])) {
        this.stack.addLogs(LogLevel.INFO, `Add Customer Gateway ${cgwItem.name} in ${cgwItem.region}`);
        const cgw = new CustomerGateway(this.stack, pascalCase(`${cgwItem.name}CustomerGateway`), {
          name: cgwItem.name,
          bgpAsn: cgwItem.asn,
          ipAddress: cgwItem.ipAddress,
          tags: cgwItem.tags,
        });
        cgwMap.set(cgwItem.name, cgw.customerGatewayId);

        this.stack.addSsmParameter({
          logicalId: pascalCase(`SsmParam${cgwItem.name}CustomerGateway`),
          parameterName: this.stack.getSsmPath(SsmResourceType.CGW, [cgwItem.name]),
          stringValue: cgw.customerGatewayId,
        });

        for (const vpnConnectItem of cgwItem.vpnConnections ?? []) {
          // Make sure that VPN Connections are created for TGWs in this stack only.
          if (vpnConnectItem.transitGateway) {
            const vpn = this.createVpnConnection(cgw, cgwItem, vpnConnectItem);
            vpnMap.set(vpnConnectItem.name, vpn.vpnConnectionId);
          }
        }
      }
    }
    return [cgwMap, vpnMap];
  }

  /**
   * Create VPN connection item
   * @param cgw
   * @param cgwItem
   * @param vpnConnectItem
   */
  private createVpnConnection(
    cgw: CustomerGateway,
    cgwItem: CustomerGatewayConfig,
    vpnConnectItem: VpnConnectionConfig,
  ): VpnConnection {
    // Get the Transit Gateway ID
    const transitGatewayId = this.transitGatewayMap.get(vpnConnectItem.transitGateway!);
    if (!transitGatewayId) {
      this.stack.addLogs(LogLevel.ERROR, `Transit Gateway ${vpnConnectItem.transitGateway} not found`);
      throw new Error(`Configuration validation failed at runtime.`);
    }

    this.stack.addLogs(
      LogLevel.INFO,
      `Attaching Customer Gateway ${cgwItem.name} to ${vpnConnectItem.transitGateway} in ${cgwItem.region}`,
    );
    const vpnConnection = new VpnConnection(this.stack, pascalCase(`${vpnConnectItem.name}VpnConnection`), {
      name: vpnConnectItem.name,
      customerGatewayId: cgw.customerGatewayId,
      staticRoutesOnly: vpnConnectItem.staticRoutesOnly,
      tags: vpnConnectItem.tags,
      transitGatewayId: transitGatewayId,
      vpnTunnelOptionsSpecifications: vpnConnectItem.tunnelSpecifications,
    });

    this.stack.addSsmParameter({
      logicalId: pascalCase(`SsmParam${vpnConnectItem.name}VpnConnection`),
      parameterName: this.stack.getSsmPath(SsmResourceType.TGW_VPN, [vpnConnectItem.name]),
      stringValue: vpnConnection.vpnConnectionId,
    });

    return vpnConnection;
  }
}
