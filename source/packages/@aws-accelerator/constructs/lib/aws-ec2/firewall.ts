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
import { LaunchTemplate } from './create-launch-template';
import { LaunchTemplateConfig, NetworkInterfaceItemConfig } from '@aws-accelerator/config';
import * as path from 'path';

export interface IFirewall extends cdk.IResource {
  /**
   * The friendly name of the firewall instance
   */
  readonly name: string;
}

export interface FirewallProps {
  /**
   * The friendly name of the firewall instance
   */
  readonly name: string;
  /**
   * The configuration directory path
   */
  readonly configDir: string;
  /**
   * The launch template for the firewall instance
   */
  readonly launchTemplate: LaunchTemplateConfig;
  /**
   * The name of the VPC to deploy the instance to
   */
  readonly vpc: string;
  /**
   * An array of CloudFormation tags
   */
  readonly tags?: cdk.CfnTag[];
}

export class Firewall extends cdk.Resource implements IFirewall {
  public readonly name: string;
  protected launchTemplate: LaunchTemplate;
  protected networkInterfaces: NetworkInterfaceItemConfig[];
  protected props: FirewallProps;

  constructor(scope: Construct, id: string, props: FirewallProps) {
    super(scope, id);
    this.name = props.name;
    this.props = props;

    // Create interfaces with elastic IPs, if needed
    this.networkInterfaces = this.setNetworkInterfaceProps();
    // Create launch template
    this.launchTemplate = this.createLaunchTemplate();
  }

  /**
   * Create a launch template for the firewall
   * @returns
   */
  private createLaunchTemplate(): LaunchTemplate {
    return new LaunchTemplate(this, 'LaunchTemplate', {
      appName: this.props.name,
      name: this.props.launchTemplate.name,
      vpc: this.props.vpc,
      blockDeviceMappings: this.props.launchTemplate.blockDeviceMappings,
      userData: this.props.launchTemplate.userData
        ? path.join(this.props.configDir, this.props.launchTemplate.userData)
        : undefined,
      securityGroups: this.props.launchTemplate.securityGroups,
      networkInterfaces: this.networkInterfaces,
      instanceType: this.props.launchTemplate.instanceType,
      keyPair: this.props.launchTemplate.keyPair,
      iamInstanceProfile: this.props.launchTemplate.iamInstanceProfile,
      imageId: this.props.launchTemplate.imageId,
      enforceImdsv2: this.props.launchTemplate.enforceImdsv2,
    });
  }

  /**
   * Set network interface properties for the launch template
   * @returns
   */
  private setNetworkInterfaceProps(): NetworkInterfaceItemConfig[] {
    const networkInterfaces: NetworkInterfaceItemConfig[] = [];
    let deviceIndex = 0;
    for (const networkInterface of this.props.launchTemplate.networkInterfaces ?? []) {
      // Create interface with elastic IP
      if (networkInterface.associateElasticIp) {
        networkInterfaces.push(
          this.createEipInterface(
            networkInterface,
            networkInterface.deviceIndex !== undefined ? networkInterface.deviceIndex : deviceIndex,
          ),
        );
        deviceIndex += 1;
        continue;
      }

      // Create interface with source/dest check disabled
      if (!networkInterface.associateElasticIp && networkInterface.sourceDestCheck === false) {
        networkInterfaces.push(
          this.createRouterInterface(
            networkInterface,
            networkInterface.deviceIndex !== undefined ? networkInterface.deviceIndex : deviceIndex,
          ),
        );
        deviceIndex += 1;
        continue;
      }

      networkInterfaces.push({
        associateCarrierIpAddress: networkInterface.associateCarrierIpAddress,
        associateElasticIp: undefined,
        associatePublicIpAddress: networkInterface.associatePublicIpAddress,
        deleteOnTermination: networkInterface.deleteOnTermination,
        description: networkInterface.description,
        deviceIndex: networkInterface.deviceIndex,
        groups: networkInterface.groups,
        interfaceType: networkInterface.interfaceType,
        networkCardIndex: networkInterface.networkCardIndex,
        networkInterfaceId: networkInterface.networkInterfaceId,
        privateIpAddress: networkInterface.privateIpAddress,
        privateIpAddresses: networkInterface.privateIpAddresses,
        secondaryPrivateIpAddressCount: networkInterface.secondaryPrivateIpAddressCount,
        sourceDestCheck: undefined,
        subnetId: networkInterface.subnetId,
      });
      deviceIndex += 1;
    }
    return networkInterfaces;
  }

  /**
   * Create and associate an EIP with a network interface
   * @param networkInterface
   * @param deviceIndex
   * @returns
   */
  private createEipInterface(
    networkInterface: NetworkInterfaceItemConfig,
    deviceIndex: number,
  ): NetworkInterfaceItemConfig {
    // Create EIP
    const eip = new cdk.aws_ec2.CfnEIP(this, `ElasticIp${deviceIndex}`, {
      domain: 'vpc',
    });

    // Create interface
    const eipInterface = new cdk.aws_ec2.CfnNetworkInterface(this, `NetworkInterface${deviceIndex}`, {
      description: networkInterface.description,
      groupSet: networkInterface.groups,
      interfaceType: networkInterface.interfaceType,
      privateIpAddress: networkInterface.privateIpAddress,
      privateIpAddresses: networkInterface.privateIpAddresses
        ? (networkInterface.privateIpAddresses as cdk.aws_ec2.CfnNetworkInterface.PrivateIpAddressSpecificationProperty[])
        : undefined,
      secondaryPrivateIpAddressCount: networkInterface.secondaryPrivateIpAddressCount,
      sourceDestCheck: networkInterface.sourceDestCheck,
      subnetId: networkInterface.subnetId!,
    });

    // Associate EIP
    new cdk.aws_ec2.CfnEIPAssociation(this, `EipAssociation${deviceIndex}`, {
      allocationId: eip.attrAllocationId,
      networkInterfaceId: eipInterface.ref,
    });

    return {
      deviceIndex: deviceIndex,
      networkInterfaceId: eipInterface.ref,
    } as NetworkInterfaceItemConfig;
  }

  /**
   * Create a network interface with source/dest checks disabled
   * @param networkInterface
   * @param deviceIndex
   * @returns
   */
  private createRouterInterface(
    networkInterface: NetworkInterfaceItemConfig,
    deviceIndex: number,
  ): NetworkInterfaceItemConfig {
    // Create interface
    const routerInterface = new cdk.aws_ec2.CfnNetworkInterface(this, `NetworkInterface${deviceIndex}`, {
      description: networkInterface.description,
      groupSet: networkInterface.groups,
      interfaceType: networkInterface.interfaceType,
      privateIpAddress: networkInterface.privateIpAddress,
      privateIpAddresses: networkInterface.privateIpAddresses
        ? (networkInterface.privateIpAddresses as cdk.aws_ec2.CfnNetworkInterface.PrivateIpAddressSpecificationProperty[])
        : undefined,
      secondaryPrivateIpAddressCount: networkInterface.secondaryPrivateIpAddressCount,
      sourceDestCheck: networkInterface.sourceDestCheck,
      subnetId: networkInterface.subnetId!,
    });

    return {
      deviceIndex: deviceIndex,
      networkInterfaceId: routerInterface.ref,
    } as NetworkInterfaceItemConfig;
  }
}
