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

import {
  AseaResourceType,
  IpamConfig,
  OutpostsConfig,
  SubnetConfig,
  VpcConfig,
  VpcTemplatesConfig,
} from '@aws-accelerator/config';
import { PutSsmParameter, RouteTable, SsmParameterProps, Subnet, Vpc } from '@aws-accelerator/constructs';
import { getAvailabilityZoneMap } from '@aws-accelerator/utils/lib/regions';
import { SsmResourceType } from '@aws-accelerator/utils/lib/ssm-parameter-path';
import * as cdk from 'aws-cdk-lib';
import { pascalCase } from 'pascal-case';
import { LogLevel } from '../network-stack';
import { getRouteTable, getSubnet, getVpc } from '../utils/getter-utils';
import { NetworkVpcStack } from './network-vpc-stack';

export class SubnetResources {
  public readonly sharedParameterMap: Map<string, SsmParameterProps[]>;
  public readonly subnetMap: Map<string, Subnet>;
  private stack: NetworkVpcStack;

  constructor(
    networkVpcStack: NetworkVpcStack,
    vpcMap: Map<string, Vpc>,
    routeTableMap: Map<string, RouteTable>,
    outpostMap: Map<string, OutpostsConfig>,
    ipamConfig?: IpamConfig[],
  ) {
    this.stack = networkVpcStack;

    // Create subnets
    this.subnetMap = this.createSubnets(this.stack.vpcsInScope, vpcMap, routeTableMap, outpostMap, ipamConfig);
    // Create shared SSM parameters
    this.sharedParameterMap = this.createSharedParameters(this.stack.vpcsInScope, vpcMap, this.subnetMap);
  }

  /**
   * Function to create Subnet
   * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
   * @param subnetItem {@link SubnetConfig}
   * @param maps
   * @param index number
   * @param ipamConfig {@link IpamConfig} []
   * @returns
   */
  private createSubnet(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    subnetItem: SubnetConfig,
    maps: {
      vpcs: Map<string, Vpc>;
      routeTables: Map<string, RouteTable>;
      subnets: Map<string, Subnet>;
      ipamSubnets: Map<number, Subnet>;
      outposts: Map<string, OutpostsConfig>;
    },
    index: number,
    ipamConfig?: IpamConfig[],
  ): number {
    // Retrieve items required to create subnet
    const vpc = getVpc(maps.vpcs, vpcItem.name) as Vpc;
    const routeTable = subnetItem.routeTable
      ? (getRouteTable(maps.routeTables, vpcItem.name, subnetItem.routeTable) as RouteTable)
      : undefined;
    const basePool = subnetItem.ipamAllocation ? this.getBasePool(subnetItem, ipamConfig) : undefined;
    const outpost = subnetItem.outpost
      ? this.stack.getOutpost(maps.outposts, vpcItem.name, subnetItem.outpost)
      : undefined;
    const availabilityZone = this.setAvailabilityZone(subnetItem, outpost);

    // Create subnet
    const subnet = this.createSubnetItem(vpcItem, subnetItem, availabilityZone, vpc, routeTable, basePool, outpost);
    maps.subnets.set(`${vpcItem.name}_${subnetItem.name}`, subnet);

    // Need to ensure IPAM subnets are created one at a time to avoid duplicate allocations
    // Add dependency on previously-created IPAM subnet, if it exists
    if (subnetItem.ipamAllocation) {
      maps.ipamSubnets.set(index, subnet);

      if (index > 0) {
        const lastSubnet = maps.ipamSubnets.get(index - 1);

        if (!lastSubnet) {
          this.stack.addLogs(
            LogLevel.ERROR,
            `Error creating subnet ${subnetItem.name}: previous IPAM subnet undefined`,
          );
          throw new Error(`Configuration validation failed at runtime.`);
        }
        subnet.node.addDependency(lastSubnet);
      }
      index += 1;
    }

    return index;
  }

  /**
   * Create subnets for each VPC
   * @param vpcResources
   * @param vpcMap
   * @param routeTableMap
   * @param outpostMap
   * @param ipamConfig
   * @returns
   */
  private createSubnets(
    vpcResources: (VpcConfig | VpcTemplatesConfig)[],
    vpcMap: Map<string, Vpc>,
    routeTableMap: Map<string, RouteTable>,
    outpostMap: Map<string, OutpostsConfig>,
    ipamConfig?: IpamConfig[],
  ): Map<string, Subnet> {
    const subnetMap = new Map<string, Subnet>();

    for (const vpcItem of vpcResources) {
      // Create map and index to track IPAM subnets
      const ipamSubnetMap = new Map<number, Subnet>();
      let index = 0;

      for (const subnetItem of vpcItem.subnets ?? []) {
        index = this.createSubnet(
          vpcItem,
          subnetItem,
          {
            vpcs: vpcMap,
            routeTables: routeTableMap,
            subnets: subnetMap,
            ipamSubnets: ipamSubnetMap,
            outposts: outpostMap,
          },
          index,
          ipamConfig,
        );
      }
    }
    return subnetMap;
  }

  /**
   * Get base IPAM pool CIDR ranges for a given subnet
   * @param subnetItem
   * @param ipamConfig
   * @returns
   */
  private getBasePool(subnetItem: SubnetConfig, ipamConfig?: IpamConfig[]): string[] {
    let basePool: string[] | undefined;

    for (const ipam of ipamConfig ?? []) {
      const pool = ipam.pools?.find(item => item.name === subnetItem.ipamAllocation!.ipamPoolName);
      basePool = pool?.provisionedCidrs;
    }

    if (!basePool) {
      this.stack.addLogs(
        LogLevel.ERROR,
        `Error creating subnet ${subnetItem.name}: IPAM pool ${subnetItem.ipamAllocation!.ipamPoolName} not defined`,
      );
      throw new Error(`Configuration validation failed at runtime.`);
    }
    return basePool;
  }

  /**
   * Set availability zone for a given subnet item
   * @param subnetItem
   * @param outpost
   * @returns
   */
  private setAvailabilityZone(subnetItem: SubnetConfig, outpost?: OutpostsConfig): string {
    let availabilityZone = outpost?.availabilityZone ? outpost.availabilityZone : subnetItem.availabilityZone;

    if (!availabilityZone && !subnetItem.localZone) {
      this.stack.addLogs(
        LogLevel.ERROR,
        `Error creating subnet ${subnetItem.name}: Neither Local Zone or Availability Zone are defined.`,
      );
      throw new Error(`Configuration validation failed at runtime.`);
    }

    if (subnetItem.localZone) {
      return (availabilityZone = `${cdk.Stack.of(this.stack).region}-${subnetItem.localZone}`);
    }

    return (availabilityZone =
      typeof availabilityZone === 'string'
        ? `${cdk.Stack.of(this.stack).region}${availabilityZone}`
        : `${getAvailabilityZoneMap(cdk.Stack.of(this.stack).region)}${availabilityZone}`);
  }

  /**
   * Create subnet item
   * @param vpcItem
   * @param subnetItem
   * @param availabilityZone
   * @param routeTable
   * @param vpc
   * @param ipamSubnetMap
   * @param index
   * @param basePool
   * @param outpost
   * @returns
   */
  private createSubnetItem(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    subnetItem: SubnetConfig,
    availabilityZone: string,
    vpc: Vpc,
    routeTable?: RouteTable,
    basePool?: string[],
    outpost?: OutpostsConfig,
  ): Subnet {
    this.stack.addLogs(LogLevel.INFO, `Adding subnet ${subnetItem.name} to VPC ${vpcItem.name}`);

    const isAvailabilityZoneId = !availabilityZone.includes(cdk.Stack.of(this.stack).region);
    let subnet;
    if (this.stack.isManagedByAsea(AseaResourceType.EC2_SUBNET, `${vpcItem.name}/${subnetItem.name}`)) {
      const subnetId = this.stack.getExternalResourceParameter(
        this.stack.getSsmPath(SsmResourceType.SUBNET, [vpcItem.name, subnetItem.name]),
      );
      subnet = Subnet.fromSubnetAttributes(
        this.stack,
        pascalCase(`${vpcItem.name}Vpc`) + pascalCase(`${subnetItem.name}Subnet`),
        {
          subnetId,
          routeTable,
          name: subnetItem.name,
          ipv4CidrBlock: subnetItem.ipv4CidrBlock ?? '', // Import Subnet is only supported for static cidr configuration
        },
      );
    } else {
      subnet = new Subnet(this.stack, pascalCase(`${vpcItem.name}Vpc`) + pascalCase(`${subnetItem.name}Subnet`), {
        name: subnetItem.name,
        assignIpv6OnCreation: subnetItem.assignIpv6OnCreation,
        availabilityZone: isAvailabilityZoneId ? undefined : availabilityZone,
        availabilityZoneId: isAvailabilityZoneId ? availabilityZone : undefined,
        basePool,
        enableDns64: subnetItem.enableDns64,
        ipamAllocation: subnetItem.ipamAllocation,
        ipv4CidrBlock: subnetItem.ipv4CidrBlock,
        ipv6CidrBlock: subnetItem.ipv6CidrBlock,
        kmsKey: this.stack.cloudwatchKey,
        logRetentionInDays: this.stack.logRetention,
        mapPublicIpOnLaunch: subnetItem.mapPublicIpOnLaunch,
        privateDnsOptions: subnetItem.privateDnsOptions,
        routeTable,
        vpc,
        tags: subnetItem.tags,
        outpost,
      });

      this.stack.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(vpcItem.name) + pascalCase(subnetItem.name)}SubnetId`),
        parameterName: this.stack.getSsmPath(SsmResourceType.SUBNET, [vpcItem.name, subnetItem.name]),
        stringValue: subnet.subnetId,
      });
      // If the VPC has additional CIDR blocks, depend on those CIDRs to be associated
      for (const cidr of [...vpc.cidrs.ipv4, ...vpc.cidrs.ipv6]) {
        subnet.node.addDependency(cidr);
      }
    }
    if (subnetItem.shareTargets) {
      this.stack.addLogs(LogLevel.INFO, `Share subnet ${subnetItem.name}`);
      this.stack.addResourceShare(subnetItem, `${subnetItem.name}_SubnetShare`, [subnet.subnetArn]);
    }
    return subnet;
  }

  /**
   * Create SSM parameters in shared subnet accounts
   * @param vpcResources
   * @param vpcMap
   * @param subnetMap
   * @returns
   */
  private createSharedParameters(
    vpcResources: (VpcConfig | VpcTemplatesConfig)[],
    vpcMap: Map<string, Vpc>,
    subnetMap: Map<string, Subnet>,
  ): Map<string, SsmParameterProps[]> {
    const sharedParameterMap = new Map<string, SsmParameterProps[]>();

    for (const vpcItem of vpcResources) {
      const accountIds: string[] = [];
      const parameters: SsmParameterProps[] = [];
      const vpc = getVpc(vpcMap, vpcItem.name) as Vpc;
      const sharedSubnets = vpcItem.subnets ? vpcItem.subnets.filter(subnet => subnet.shareTargets) : [];

      // Add VPC to parameters
      if (sharedSubnets.length > 0) {
        parameters.push({
          name: this.stack.getSsmPath(SsmResourceType.VPC, [vpcItem.name]),
          value: vpc.vpcId,
        });

        // Add shared subnet parameters and account IDs
        this.setSharedSubnetParameters(vpcItem, sharedSubnets, subnetMap, parameters, accountIds);

        // Put SSM parameters
        new PutSsmParameter(this.stack, pascalCase(`${vpcItem.name}VpcSharedParameters`), {
          accountIds,
          region: cdk.Stack.of(this.stack).region,
          roleName: this.stack.acceleratorResourceNames.roles.crossAccountSsmParameterShare,
          kmsKey: this.stack.cloudwatchKey,
          logRetentionInDays: this.stack.logRetention,
          parameters,
          invokingAccountId: cdk.Stack.of(this.stack).account,
          acceleratorPrefix: this.stack.acceleratorPrefix,
        });
        sharedParameterMap.set(vpcItem.name, parameters);
      }
    }
    return sharedParameterMap;
  }

  /**
   * Set shared subnet parameters and account IDs
   * @param vpcItem
   * @param sharedSubnets
   * @param subnetMap
   * @param parameters
   * @param accountIds
   */
  private setSharedSubnetParameters(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    sharedSubnets: SubnetConfig[],
    subnetMap: Map<string, Subnet>,
    parameters: SsmParameterProps[],
    accountIds: string[],
  ) {
    for (const subnetItem of sharedSubnets) {
      // Add subnet to parameters
      const subnet = getSubnet(subnetMap, vpcItem.name, subnetItem.name) as Subnet;
      parameters.push({
        name: this.stack.getSsmPath(SsmResourceType.SUBNET, [vpcItem.name, subnetItem.name]),
        value: subnet.subnetId,
      });
      if (subnet.ipv4CidrBlock) {
        parameters.push({
          name: this.stack.getSsmPath(SsmResourceType.SUBNET_IPV4_CIDR_BLOCK, [vpcItem.name, subnetItem.name]),
          value: subnet.ipv4CidrBlock,
        });
      }

      // Retrieve accounts to share parameters with
      const subnetAccountIds = this.stack.getAccountIdsFromShareTarget(subnetItem.shareTargets!);
      subnetAccountIds.forEach(accountId => {
        // Only add account IDs not already in the array and are not for this account
        // SSM parameters for this account are managed by native SSM resources
        if (!accountIds.includes(accountId) && accountId !== cdk.Stack.of(this.stack).account) {
          accountIds.push(accountId);
        }
      });
    }
  }
}
