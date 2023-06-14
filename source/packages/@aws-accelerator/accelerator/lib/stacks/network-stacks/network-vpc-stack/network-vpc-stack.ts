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

import { Construct } from 'constructs';

import { OutpostsConfig, VpcConfig } from '@aws-accelerator/config';
import { NatGateway, TransitGatewayAttachment } from '@aws-accelerator/constructs';

import { AcceleratorStackProps } from '../../accelerator-stack';
import { NetworkStack } from '../network-stack';
import { AcmResources } from './acm-resources';
import { DhcpResources } from './dhcp-resources';
import { IpamResources } from './ipam-resources';
import { LoadBalancerResources } from './load-balancer-resources';
import { NaclResources } from './nacl-resources';
import { NatGwResources } from './nat-gw-resources';
import { PrefixListResources } from './prefix-list-resources';
import { RouteEntryResources } from './route-entry-resources';
import { RouteTableResources } from './route-table-resources';
import { SecurityGroupResources } from './security-group-resources';
import { SubnetResources } from './subnet-resources';
import { TgwResources } from './tgw-resources';
import { VpcResources } from './vpc-resources';

export class NetworkVpcStack extends NetworkStack {
  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);
    //
    // Create ACM Certificates
    //
    new AcmResources(this, props);
    //
    // Create DHCP options sets
    //
    const dhcpResources = new DhcpResources(this, props);
    //
    // Create prefix lists
    //
    const plResources = new PrefixListResources(this, props);
    //
    // Create VPC resources
    //
    const ipamPoolMap = this.setIpamPoolMap(props);
    const vpcResources = new VpcResources(this, ipamPoolMap, dhcpResources.dhcpOptionsIds, props);
    //
    // Create VPC and outpost route table resources
    //
    const routeTableResources = new RouteTableResources(this, vpcResources.vpcMap);
    //
    // Create subnet resources
    //
    const outpostMap = this.setOutpostsMap(props.networkConfig.vpcs);
    const subnetResources = new SubnetResources(
      this,
      vpcResources.vpcMap,
      routeTableResources.routeTableMap,
      outpostMap,
      props.networkConfig.centralNetworkServices?.ipams,
    );
    //
    // Create NAT gateway resources
    //
    const natGatewayResources = new NatGwResources(this, subnetResources.subnetMap);
    //
    // Create transit gateway resources
    //
    const transitGatewayIds = this.setVpcTransitGatewayMap(this.vpcsInScope);
    const tgwResources = new TgwResources(
      this,
      transitGatewayIds,
      vpcResources.vpcMap,
      subnetResources.subnetMap,
      props,
    );
    //
    // Create route table entires
    //
    new RouteEntryResources(
      this,
      routeTableResources.routeTableMap,
      transitGatewayIds,
      tgwResources.tgwAttachmentMap,
      natGatewayResources.natGatewayMap,
      plResources.prefixListMap,
    );
    //
    // Create security groups
    //
    const sgResources = new SecurityGroupResources(
      this,
      vpcResources.vpcMap,
      subnetResources.subnetMap,
      plResources.prefixListMap,
    );
    //
    // Create NACLs
    //
    new NaclResources(this, vpcResources.vpcMap, subnetResources.subnetMap);
    //
    // Create load balancer resources
    //
    new LoadBalancerResources(this, subnetResources.subnetMap, sgResources.securityGroupMap, props);
    //
    // Create Get IPAM Cidr Role
    //
    new IpamResources(this, props.globalConfig.homeRegion, this.organizationId);
    //
    // Create SSM Parameters
    //
    this.createSsmParameters();

    this.logger.info('Completed stack synthesis');
  }

  /**
   * Returns a map of outpost configurations for the current stack context
   * @param vpcs
   * @returns
   */
  private setOutpostsMap(vpcs: VpcConfig[]): Map<string, OutpostsConfig> {
    const outpostMap = new Map<string, OutpostsConfig>();

    for (const vpcItem of vpcs) {
      const vpcAccountIds = this.getVpcAccountIds(vpcItem);

      if (this.isTargetStack(vpcAccountIds, [vpcItem.region])) {
        for (const outpost of vpcItem.outposts ?? []) {
          outpostMap.set(`${vpcItem.name}_${outpost.name}`, outpost);
        }
      }
    }
    return outpostMap;
  }

  /**
   * Returns a transit gateway attachment object from a given map if it exists
   * @param tgwAttachmentMap
   * @param vpcName
   * @param transitGatewayName
   * @returns
   */
  public getTgwAttachment(
    tgwAttachmentMap: Map<string, TransitGatewayAttachment>,
    vpcName: string,
    transitGatewayName: string,
  ): TransitGatewayAttachment {
    const key = `${vpcName}_${transitGatewayName}`;

    if (!tgwAttachmentMap.get(key)) {
      this.logger.error(`VPC ${vpcName} attachment for TGW ${transitGatewayName} does not exist in map`);
      throw new Error(`Configuration validation failed at runtime.`);
    }

    return tgwAttachmentMap.get(key)!;
  }

  /**
   * Returns a NAT gateway object from a given map if it exists
   * @param natGatewayMap
   * @param vpcName
   * @param natGatewayName
   * @returns
   */
  public getNatGateway(natGatewayMap: Map<string, NatGateway>, vpcName: string, natGatewayName: string): NatGateway {
    const key = `${vpcName}_${natGatewayName}`;

    if (!natGatewayMap.get(key)) {
      this.logger.error(`VPC ${vpcName} NAT gateway ${natGatewayName} does not exist in map`);
      throw new Error(`Configuration validation failed at runtime.`);
    }

    return natGatewayMap.get(key)!;
  }

  /**
   * Returns an outpost object from a given map if it exists
   * @param outpostMap
   * @param vpcName
   * @param outpostName
   * @returns
   */
  public getOutpost(outpostMap: Map<string, OutpostsConfig>, vpcName: string, outpostName: string): OutpostsConfig {
    const key = `${vpcName}_${outpostName}`;

    if (!outpostMap.get(key)) {
      this.logger.error(`VPC ${vpcName} Outpost ${outpostName} does not exist in map`);
      throw new Error(`Configuration validation failed at runtime.`);
    }

    return outpostMap.get(key)!;
  }
}
