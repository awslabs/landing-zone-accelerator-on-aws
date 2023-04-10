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

import { RouteTableConfig, VpcConfig, VpcTemplatesConfig } from '@aws-accelerator/config';
import {
  NatGateway,
  PrefixList,
  PrefixListRoute,
  RouteTable,
  TransitGatewayAttachment,
} from '@aws-accelerator/constructs';
import * as cdk from 'aws-cdk-lib';
import { pascalCase } from 'pascal-case';
import { LogLevel } from '../network-stack';
import { getPrefixList, getRouteTable, getTransitGatewayId } from '../utils/getter-utils';
import { NetworkVpcStack } from './network-vpc-stack';

export class RouteEntryResources {
  public readonly routeTableEntryMap: Map<string, cdk.aws_ec2.CfnRoute | PrefixListRoute>;
  private stack: NetworkVpcStack;

  constructor(
    networkVpcStack: NetworkVpcStack,
    routeTableMap: Map<string, RouteTable>,
    transitGatewayIds: Map<string, string>,
    tgwAttachmentMap: Map<string, TransitGatewayAttachment>,
    natGatewayMap: Map<string, NatGateway>,
    prefixListMap: Map<string, PrefixList>,
  ) {
    this.stack = networkVpcStack;

    // Create route table entries
    this.routeTableEntryMap = this.createRouteEntries(
      this.stack.vpcsInScope,
      routeTableMap,
      transitGatewayIds,
      tgwAttachmentMap,
      natGatewayMap,
      prefixListMap,
    );
  }

  /**
   * Create route table entiries
   * @param vpcResources
   * @param routeTableMap
   * @param transitGatewayIds
   * @param tgwAttachmentMap
   * @param natGatewayMap
   * @param prefixListMap
   * @returns
   */
  private createRouteEntries(
    vpcResources: (VpcConfig | VpcTemplatesConfig)[],
    routeTableMap: Map<string, RouteTable>,
    transitGatewayIds: Map<string, string>,
    tgwAttachmentMap: Map<string, TransitGatewayAttachment>,
    natGatewayMap: Map<string, NatGateway>,
    prefixListMap: Map<string, PrefixList>,
  ): Map<string, cdk.aws_ec2.CfnRoute | PrefixListRoute> {
    const routeTableEntryMap = new Map<string, cdk.aws_ec2.CfnRoute | PrefixListRoute>();

    for (const vpcItem of vpcResources) {
      for (const routeTableItem of vpcItem.routeTables ?? []) {
        const routeTable = getRouteTable(routeTableMap, vpcItem.name, routeTableItem.name) as RouteTable;
        const routeTableItemEntryMap = this.createRouteTableItemEntries(
          vpcItem,
          routeTableItem,
          routeTable,
          transitGatewayIds,
          tgwAttachmentMap,
          natGatewayMap,
          prefixListMap,
        );
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
   * @param natGatewayMap
   * @param prefixListMap
   * @returns
   */
  private createRouteTableItemEntries(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    routeTableItem: RouteTableConfig,
    routeTable: RouteTable,
    transitGatewayIds: Map<string, string>,
    tgwAttachmentMap: Map<string, TransitGatewayAttachment>,
    natGatewayMap: Map<string, NatGateway>,
    prefixListMap: Map<string, PrefixList>,
  ): Map<string, cdk.aws_ec2.CfnRoute | PrefixListRoute> {
    const routeTableItemEntryMap = new Map<string, cdk.aws_ec2.CfnRoute | PrefixListRoute>();

    for (const routeTableEntryItem of routeTableItem.routes ?? []) {
      const routeId =
        pascalCase(`${vpcItem.name}Vpc`) +
        pascalCase(`${routeTableItem.name}RouteTable`) +
        pascalCase(routeTableEntryItem.name);
      const entryTypes = ['transitGateway', 'internetGateway', 'natGateway', 'virtualPrivateGateway'];

      // Check if using a prefix list or CIDR as the destination
      if (routeTableEntryItem.type && entryTypes.includes(routeTableEntryItem.type)) {
        let destination: string | undefined = undefined;
        let destinationPrefixListId: string | undefined = undefined;
        if (routeTableEntryItem.destinationPrefixList) {
          // Get PL ID from map
          const prefixList = getPrefixList(prefixListMap, routeTableEntryItem.destinationPrefixList) as PrefixList;
          destinationPrefixListId = prefixList.prefixListId;
        } else {
          destination = routeTableEntryItem.destination;
        }

        // Route: Transit Gateway
        if (routeTableEntryItem.type === 'transitGateway') {
          this.stack.addLogs(LogLevel.INFO, `Adding Transit Gateway Route Table Entry ${routeTableEntryItem.name}`);

          const transitGatewayId = getTransitGatewayId(transitGatewayIds, routeTableEntryItem.target!);
          const transitGatewayAttachment = this.stack.getTgwAttachment(
            tgwAttachmentMap,
            vpcItem.name,
            routeTableEntryItem.target!,
          );

          const tgwRoute = routeTable.addTransitGatewayRoute(
            routeId,
            transitGatewayId,
            transitGatewayAttachment.node.defaultChild as cdk.aws_ec2.CfnTransitGatewayAttachment,
            destination,
            destinationPrefixListId,
            this.stack.cloudwatchKey,
            this.stack.logRetention,
          );
          routeTableItemEntryMap.set(`${vpcItem.name}_${routeTableItem.name}_${routeTableEntryItem.name}`, tgwRoute);
        }

        // Route: NAT Gateway
        if (routeTableEntryItem.type === 'natGateway') {
          this.stack.addLogs(LogLevel.INFO, `Adding NAT Gateway Route Table Entry ${routeTableEntryItem.name}`);

          const natGateway = this.stack.getNatGateway(natGatewayMap, vpcItem.name, routeTableEntryItem.target!);

          const natRoute = routeTable.addNatGatewayRoute(
            routeId,
            natGateway.natGatewayId,
            destination,
            destinationPrefixListId,
            this.stack.cloudwatchKey,
            this.stack.logRetention,
          );
          routeTableItemEntryMap.set(`${vpcItem.name}_${routeTableItem.name}_${routeTableEntryItem.name}`, natRoute);
        }

        // Route: Internet Gateway
        if (routeTableEntryItem.type === 'internetGateway') {
          this.stack.addLogs(LogLevel.INFO, `Adding Internet Gateway Route Table Entry ${routeTableEntryItem.name}`);
          const igwRoute = routeTable.addInternetGatewayRoute(
            routeId,
            destination,
            destinationPrefixListId,
            this.stack.cloudwatchKey,
            this.stack.logRetention,
          );
          routeTableItemEntryMap.set(`${vpcItem.name}_${routeTableItem.name}_${routeTableEntryItem.name}`, igwRoute);
        }

        // Route: Virtual Private Gateway
        if (routeTableEntryItem.type === 'virtualPrivateGateway') {
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
        }
      }
    }
    return routeTableItemEntryMap;
  }
}
