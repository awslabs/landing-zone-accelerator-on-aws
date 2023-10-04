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

import {
  OutpostsConfig,
  RouteTableConfig,
  RouteTableEntryConfig,
  VpcConfig,
  VpcTemplatesConfig,
} from '@aws-accelerator/config';
import {
  INatGateway,
  ITransitGatewayAttachment,
  PrefixList,
  PrefixListRoute,
  RouteTable,
  Subnet,
} from '@aws-accelerator/constructs';
import * as cdk from 'aws-cdk-lib';
import { pascalCase } from 'pascal-case';
import { LogLevel } from '../network-stack';
import { getPrefixList, getRouteTable, getSubnet, getTransitGatewayId } from '../utils/getter-utils';
import { NetworkVpcStack } from './network-vpc-stack';

export class RouteEntryResources {
  public readonly routeTableEntryMap: Map<string, cdk.aws_ec2.CfnRoute | PrefixListRoute>;
  private stack: NetworkVpcStack;

  constructor(
    networkVpcStack: NetworkVpcStack,
    routeTableMap: Map<string, RouteTable>,
    transitGatewayIds: Map<string, string>,
    tgwAttachmentMap: Map<string, ITransitGatewayAttachment>,
    subnetMap: Map<string, Subnet>,
    natGatewayMap: Map<string, INatGateway>,
    prefixListMap: Map<string, PrefixList>,
    outpostMap: Map<string, OutpostsConfig>,
  ) {
    this.stack = networkVpcStack;

    // Create route table entries
    this.routeTableEntryMap = this.createRouteEntries(
      this.stack.vpcsInScope,
      routeTableMap,
      transitGatewayIds,
      tgwAttachmentMap,
      subnetMap,
      natGatewayMap,
      prefixListMap,
      outpostMap,
    );
  }

  /**
   * Create route table entries
   * @param vpcResources
   * @param routeTableMap
   * @param transitGatewayIds
   * @param tgwAttachmentMap
   * @param subnetMap
   * @param natGatewayMap
   * @param prefixListMap
   * @returns
   */
  private createRouteEntries(
    vpcResources: (VpcConfig | VpcTemplatesConfig)[],
    routeTableMap: Map<string, RouteTable>,
    transitGatewayIds: Map<string, string>,
    tgwAttachmentMap: Map<string, ITransitGatewayAttachment>,
    subnetMap: Map<string, Subnet>,
    natGatewayMap: Map<string, INatGateway>,
    prefixListMap: Map<string, PrefixList>,
    outpostMap: Map<string, OutpostsConfig>,
  ): Map<string, cdk.aws_ec2.CfnRoute | PrefixListRoute> {
    const routeTableEntryMap = new Map<string, cdk.aws_ec2.CfnRoute | PrefixListRoute>();

    for (const vpcItem of vpcResources) {
      for (const routeTableItem of vpcItem.routeTables ?? []) {
        const routeTable = getRouteTable(routeTableMap, vpcItem.name, routeTableItem.name) as RouteTable;
        const routeTableItemEntryMap = this.createRouteTableItemEntries(vpcItem, routeTableItem, routeTable, {
          transitGatewayIds: transitGatewayIds,
          tgwAttachments: tgwAttachmentMap,
          subnets: subnetMap,
          natGateways: natGatewayMap,
          prefixLists: prefixListMap,
          outposts: outpostMap,
        });
        routeTableItemEntryMap.forEach((value, key) => routeTableEntryMap.set(key, value));
      }
    }
    return routeTableEntryMap;
  }

  /**
   * Create route entries for a given route table item
   * @param vpcItem
   * @param routeTableItem
   * @param routeTable
   * @param transitGatewayIds
   * @param tgwAttachmentMap
   * @param subnetMap
   * @param natGatewayMap
   * @param prefixListMap
   * @returns
   */
  private createRouteTableItemEntries(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    routeTableItem: RouteTableConfig,
    routeTable: RouteTable,
    maps: {
      transitGatewayIds: Map<string, string>;
      tgwAttachments: Map<string, ITransitGatewayAttachment>;
      subnets: Map<string, Subnet>;
      natGateways: Map<string, INatGateway>;
      prefixLists: Map<string, PrefixList>;
      outposts: Map<string, OutpostsConfig>;
    },
  ): Map<string, cdk.aws_ec2.CfnRoute | PrefixListRoute> {
    const routeTableItemEntryMap = new Map<string, cdk.aws_ec2.CfnRoute | PrefixListRoute>();

    for (const routeTableEntryItem of routeTableItem.routes ?? []) {
      const routeId =
        pascalCase(`${vpcItem.name}Vpc`) +
        pascalCase(`${routeTableItem.name}RouteTable`) +
        pascalCase(routeTableEntryItem.name);
      const entryTypes = ['transitGateway', 'internetGateway', 'natGateway', 'virtualPrivateGateway', 'localGateway'];

      // Check if using a prefix list or CIDR as the destination
      if (routeTableEntryItem.type && entryTypes.includes(routeTableEntryItem.type)) {
        // Set destination type
        const [destination, destinationPrefixListId] = this.setRouteEntryDestination(
          routeTableEntryItem,
          maps.prefixLists,
          maps.subnets,
          vpcItem.name,
        );

        switch (routeTableEntryItem.type) {
          // Route: Transit Gateway
          case 'transitGateway':
            this.stack.addLogs(LogLevel.INFO, `Adding Transit Gateway Route Table Entry ${routeTableEntryItem.name}`);

            const transitGatewayId = getTransitGatewayId(maps.transitGatewayIds, routeTableEntryItem.target!);
            const transitGatewayAttachment = this.stack.getTgwAttachment(
              maps.tgwAttachments,
              vpcItem.name,
              routeTableEntryItem.target!,
            );

            const tgwRoute = routeTable.addTransitGatewayRoute(
              routeId,
              transitGatewayId,
              transitGatewayAttachment,
              destination,
              destinationPrefixListId,
              this.stack.cloudwatchKey,
              this.stack.logRetention,
            );
            routeTableItemEntryMap.set(`${vpcItem.name}_${routeTableItem.name}_${routeTableEntryItem.name}`, tgwRoute);
            break;
          case 'natGateway':
            // Route: NAT Gateway
            this.stack.addLogs(LogLevel.INFO, `Adding NAT Gateway Route Table Entry ${routeTableEntryItem.name}`);

            const natGateway = this.stack.getNatGateway(maps.natGateways, vpcItem.name, routeTableEntryItem.target!);

            const natRoute = routeTable.addNatGatewayRoute(
              routeId,
              natGateway.natGatewayId,
              destination,
              destinationPrefixListId,
              this.stack.cloudwatchKey,
              this.stack.logRetention,
            );
            routeTableItemEntryMap.set(`${vpcItem.name}_${routeTableItem.name}_${routeTableEntryItem.name}`, natRoute);
            break;
          // Route: Internet Gateway
          case 'internetGateway':
            this.stack.addLogs(LogLevel.INFO, `Adding Internet Gateway Route Table Entry ${routeTableEntryItem.name}`);
            const igwRoute = routeTable.addInternetGatewayRoute(
              routeId,
              destination,
              destinationPrefixListId,
              this.stack.cloudwatchKey,
              this.stack.logRetention,
            );
            routeTableItemEntryMap.set(`${vpcItem.name}_${routeTableItem.name}_${routeTableEntryItem.name}`, igwRoute);
            break;
          case 'virtualPrivateGateway':
            this.stack.addLogs(
              LogLevel.INFO,
              `Adding Virtual Private Gateway Route Table Entry ${routeTableEntryItem.name}`,
            );
            const vgwRoute = routeTable.addVirtualPrivateGatewayRoute(
              routeId,
              destination,
              destinationPrefixListId,
              this.stack.cloudwatchKey,
              this.stack.logRetention,
            );
            routeTableItemEntryMap.set(`${vpcItem.name}_${routeTableItem.name}_${routeTableEntryItem.name}`, vgwRoute);
            break;
          case 'localGateway':
            this.stack.addLogs(LogLevel.INFO, `Adding Local Gateway Route Table Entry ${routeTableEntryItem.name}`);

            const localGatewayId = this.stack.getLocalGatewayFromOutpostMap(
              maps.outposts,
              vpcItem.name,
              routeTableEntryItem.target!,
            );

            const lgwRoute = routeTable.addLocalGatewayRoute(
              routeId,
              localGatewayId,
              destination,
              destinationPrefixListId,
              this.stack.cloudwatchKey,
              this.stack.logRetention,
            );
            routeTableItemEntryMap.set(`${vpcItem.name}_${routeTableItem.name}_${routeTableEntryItem.name}`, lgwRoute);
            break;
        }
      }
    }
    return routeTableItemEntryMap;
  }

  /**
   * Determine whether to set prefix list, CIDR, or subnet reference for route destination
   * @param routeTableEntryItem
   * @param prefixListMap
   * @param subnetMap
   * @param vpcName
   * @returns
   */
  private setRouteEntryDestination(
    routeTableEntryItem: RouteTableEntryConfig,
    prefixListMap: Map<string, PrefixList>,
    subnetMap: Map<string, Subnet>,
    vpcName: string,
  ): [string | undefined, string | undefined] {
    let destination: string | undefined = undefined;
    let destinationPrefixListId: string | undefined = undefined;
    if (routeTableEntryItem.destinationPrefixList) {
      // Get PL ID from map
      const prefixList = getPrefixList(prefixListMap, routeTableEntryItem.destinationPrefixList) as PrefixList;
      destinationPrefixListId = prefixList.prefixListId;
    } else {
      const subnetKey = `${vpcName}_${routeTableEntryItem.destination}`;
      destination = subnetMap.get(subnetKey)
        ? getSubnet(subnetMap, vpcName, routeTableEntryItem.destination!).ipv4CidrBlock
        : routeTableEntryItem.destination;
    }
    return [destination, destinationPrefixListId];
  }
}
