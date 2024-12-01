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

import { Construct } from 'constructs';

import { OutpostsConfig, VpcConfig, VpcTemplatesConfig } from '@aws-accelerator/config';
import {
  INatGateway,
  ITransitGatewayAttachment,
  IVpc,
  PutSsmParameter,
  SsmParameterProps,
  ISubnet,
} from '@aws-accelerator/constructs';

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
import { pascalCase } from 'pascal-case';
import { SsmResourceType } from '@aws-accelerator/utils';
import { getVpcConfig } from '../utils/getter-utils';
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

    const vpcResources = new VpcResources(
      this,
      ipamPoolMap,
      dhcpResources.dhcpOptionsIds,
      this.vpcResources,
      {
        acceleratorPrefix: props.prefixes.accelerator,
        managementAccountAccessRole: props.globalConfig.managementAccountAccessRole,
        ssmParamName: props.prefixes.ssmParamName,
        partition: props.partition,
        useExistingRoles: props.useExistingRoles,
      },
      {
        defaultVpcsConfig: props.networkConfig.defaultVpc,
        centralEndpointVpc: props.networkConfig.vpcs.find(vpc => vpc.interfaceEndpoints?.central),
        vpcFlowLogsConfig: props.networkConfig.vpcFlowLogs,
        customerGatewayConfigs: props.networkConfig.customerGateways,
        vpcPeeringConfigs: props.networkConfig.vpcPeering,
        firewalls: this.getFirewallInfo(props, this.vpcResources),
      },
    );
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
    // Create route table entries
    //
    new RouteEntryResources(
      this,
      routeTableResources.routeTableMap,
      transitGatewayIds,
      tgwResources.tgwAttachmentMap,
      subnetResources.subnetMap,
      natGatewayResources.natGatewayMap,
      plResources.prefixListMap,
      outpostMap,
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
    // Create Stack resource SSM Parameters
    //
    this.createStackResourceParameters(vpcResources.vpcMap, subnetResources.subnetMap);
    //
    // Create SSM Parameters
    //
    this.createSsmParameters();
    //
    // Add nag suppressions
    //
    this.addResourceSuppressionsByPath();

    this.logger.info('Completed stack synthesis');
  }

  /**
   * Creates SSM Parameters for stack
   *
   * * Creates SSM Parameters for VPC and Subnet CIDR Blocks
   */
  private createStackResourceParameters(vpcMap: Map<string, IVpc>, subnetMap: Map<string, ISubnet>) {
    const parameters: SsmParameterProps[] = [];
    vpcMap.forEach((vpc, key) => {
      parameters.push({
        name: this.getSsmPath(SsmResourceType.VPC_IPV4_CIDR_BLOCK, [key]),
        value: vpc.cidrBlock,
      });
    });
    for (const vpcItem of this.vpcsInScope) {
      for (const subnetItem of vpcItem.subnets ?? []) {
        const subnet = subnetMap.get(`${vpcItem.name}_${subnetItem.name}`)!;
        if (subnet.ipv4CidrBlock) {
          parameters.push({
            name: this.getSsmPath(SsmResourceType.SUBNET_IPV4_CIDR_BLOCK, [vpcItem.name, subnetItem.name]),
            value: subnet.ipv4CidrBlock,
          });
        }
      }
    }
    if (parameters.length === 0) return;
    new PutSsmParameter(this, pascalCase(`PutNetworkVPCStackResourceParameters`), {
      accountIds: [this.account],
      region: this.region,
      roleName: this.acceleratorResourceNames.roles.crossAccountSsmParameterShare,
      kmsKey: this.cloudwatchKey,
      logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
      parameters,
      invokingAccountId: this.account,
      acceleratorPrefix: this.props.prefixes.accelerator,
    });
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
    tgwAttachmentMap: Map<string, ITransitGatewayAttachment>,
    vpcName: string,
    transitGatewayName: string,
  ): ITransitGatewayAttachment {
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
  public getNatGateway(natGatewayMap: Map<string, INatGateway>, vpcName: string, natGatewayName: string): INatGateway {
    const key = `${vpcName}_${natGatewayName}`;

    if (!natGatewayMap.get(key)) {
      this.logger.error(`VPC ${vpcName} NAT gateway ${natGatewayName} does not exist in map`);
      throw new Error(`Configuration validation failed at runtime.`);
    }

    return natGatewayMap.get(key)!;
  }

  /**
   * Returns a Local gateway object from a given map if it exists
   * Requires iterating over all outposts
   * @param outpostMap
   * @param vpcName
   * @param localGatewayName
   * @returns
   */
  public getLocalGatewayFromOutpostMap(
    outpostMap: Map<string, OutpostsConfig>,
    vpcName: string,
    localGatewayName: string,
  ): string {
    let localGatewayId = undefined;

    for (const outpost of outpostMap.values()) {
      if (outpost.localGateway && outpost.localGateway.name === localGatewayName) {
        localGatewayId = outpost.localGateway.id;
      }
    }

    if (!localGatewayId) {
      this.logger.error(`VPC ${vpcName} Local Gateway ${localGatewayName} does not exist in map`);
      throw new Error(`Configuration validation failed at runtime.`);
    }
    return localGatewayId;
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

  /**
   * Return an array of cross-account ENI target account IDs
   * if a VPC containing relevant route table exists in this account+region
   * @param props
   * @returns
   */
  private getFirewallInfo(
    props: AcceleratorStackProps,
    vpcResourcesToDeploy: (VpcConfig | VpcTemplatesConfig)[],
  ): { accountId: string; firewallVpc: VpcConfig | VpcTemplatesConfig }[] {
    const firewallAccountInfo: { accountId: string; firewallVpc: VpcConfig | VpcTemplatesConfig }[] = [];

    for (const firewallInstance of [
      ...(props.customizationsConfig.firewalls?.instances ?? []),
      ...(props.customizationsConfig.firewalls?.managerInstances ?? []),
    ]) {
      // check for potential targets

      const vpcConfig = getVpcConfig(vpcResourcesToDeploy, firewallInstance.vpc);
      for (const routeTable of vpcConfig.routeTables ?? []) {
        for (const route of routeTable.routes ?? []) {
          if (
            route.type === 'networkInterface' &&
            route?.target?.includes(firewallInstance.name) &&
            firewallInstance.account
          ) {
            const firewallOwner = props.accountsConfig.getAccountId(firewallInstance.account);
            firewallAccountInfo.push({ accountId: firewallOwner, firewallVpc: vpcConfig });
          }
        }
      }
    }
    return firewallAccountInfo;
  }
}
