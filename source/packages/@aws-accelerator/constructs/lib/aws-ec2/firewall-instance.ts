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
import { Firewall, FirewallProps, IFirewall } from './firewall';
import { NetworkInterfaceItemConfig } from '@aws-accelerator/config';

export interface IFirewallInstance extends IFirewall {
  /**
   * The underlying EC2 instance for the firewall
   */
  readonly ec2Instance: cdk.aws_ec2.CfnInstance;
  /**
   * The instance ID of the firewall instance
   */
  readonly instanceId: string;
  /**
   * VPN connections associated with this firewall instance
   */
  readonly vpnConnections: { name: string; id: string }[];
}

interface FirewallInstanceProps extends FirewallProps {
  /**
   * Enable detailed monitoring for the firewall instance
   */
  readonly detailedMonitoring?: boolean;
  /**
   * Enable termination protection for the firewall instance
   */
  readonly terminationProtection?: boolean;
}

export interface FirewallVpnProps {
  /**
   * The name of the VPN connection
   */
  readonly name: string;
  /**
   * AWS BGP ASN
   */
  readonly awsBgpAsn: number;
  /**
   * Customer gateway BGP ASN
   */
  readonly cgwBgpAsn: number;
  /**
   * The customer gateway outside IP address
   */
  readonly cgwOutsideIp: string;
  /**
   * The VPN connection ID
   */
  readonly id: string;
  /**
   * The owning account ID, if different than the invoking account
   */
  readonly owningAccountId?: string;
  /**
   * The owning region, if different from the invoking region
   */
  readonly owningRegion?: string;
}

export class FirewallInstance extends Firewall implements IFirewallInstance {
  public readonly ec2Instance: cdk.aws_ec2.CfnInstance;
  public readonly instanceId: string;
  public readonly vpnConnections: FirewallVpnProps[] = [];
  constructor(scope: Construct, id: string, props: FirewallInstanceProps) {
    super(scope, id, props);

    // Create instance
    this.ec2Instance = new cdk.aws_ec2.CfnInstance(this, 'Resource', {
      launchTemplate: {
        launchTemplateId: this.launchTemplate.launchTemplateId,
        version: this.launchTemplate.version,
      },
      disableApiTermination: props.terminationProtection,
      monitoring: props.detailedMonitoring,
      tags: props.tags,
    });
    cdk.Tags.of(this.ec2Instance).add('Name', this.name);

    this.instanceId = this.ec2Instance.ref;
  }

  /**
   * Public accessor method for retrieving the public IP address of a firewall interface
   * @param deviceIndex
   * @returns
   */
  public getPublicIpAddress(deviceIndex: number): string {
    const ipAddress = this.publicIpAddresses.get(deviceIndex);
    if (!ipAddress) {
      throw new Error(`No public IP address for firewall instance ${this.name} device index ${deviceIndex}`);
    }
    return ipAddress;
  }

  /**
   * Public accessor method for retrieving the network interfaces of a firewall interface
   * @param deviceIndex
   * @returns
   */
  public getNetworkInterface(deviceIndex: number): NetworkInterfaceItemConfig {
    const networkInterface = this.networkInterfaces.find(eni => eni.deviceIndex! === deviceIndex);
    if (!networkInterface) {
      throw new Error(`No network interface for firewall instance ${this.name} at device index ${deviceIndex}`);
    }
    return networkInterface;
  }
}
