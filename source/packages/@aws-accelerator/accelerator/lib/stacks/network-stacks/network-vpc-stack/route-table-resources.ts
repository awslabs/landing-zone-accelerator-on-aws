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

import { NetworkConfigTypes, VpcConfig, VpcTemplatesConfig } from '@aws-accelerator/config';
import { RouteTable, Vpc } from '@aws-accelerator/constructs';
import { SsmResourceType } from '@aws-accelerator/utils';
import * as cdk from 'aws-cdk-lib';
import { pascalCase } from 'pascal-case';
import { getVpc } from '../utils/getter-utils';
import { NetworkVpcStack } from './network-vpc-stack';

export class RouteTableResources {
  public readonly routeTableMap: Map<string, RouteTable>;
  private stack: NetworkVpcStack;

  constructor(networkVpcStack: NetworkVpcStack, vpcMap: Map<string, Vpc>) {
    this.stack = networkVpcStack;

    // Create route table resources
    this.routeTableMap = this.createRouteTableResources(this.stack.vpcsInScope, vpcMap);
  }

  /**
   * Create route tables
   * @param vpcResources
   * @param vpcMap
   * @param props
   */
  private createRouteTableResources(
    vpcResources: (VpcConfig | VpcTemplatesConfig)[],
    vpcMap: Map<string, Vpc>,
  ): Map<string, RouteTable> {
    const routeTableMap = new Map<string, RouteTable>();

    for (const vpcItem of vpcResources) {
      const vpc = getVpc(vpcMap, vpcItem.name) as Vpc;
      //
      // Create outpost route tables
      //
      const outpostRouteTableMap = this.associateOutpostRouteTables(vpc, vpcItem);
      outpostRouteTableMap.forEach((value, key) => routeTableMap.set(key, value));
      //
      // Create VPC route tables
      //
      const vpcRouteTableMap = this.createRouteTables(vpc, vpcItem);
      vpcRouteTableMap.forEach((value, key) => routeTableMap.set(key, value));
    }
    return routeTableMap;
  }

  /**
   * Creates local route table associations and returns
   * a map of outpost route tables for a given VPC
   * @param vpc
   * @param vpcItem
   */
  private associateOutpostRouteTables(vpc: Vpc, vpcItem: VpcConfig | VpcTemplatesConfig) {
    let outpostRouteTableMap = new Map<string, RouteTable>();
    if (NetworkConfigTypes.vpcConfig.is(vpcItem)) {
      outpostRouteTableMap = this.getOutpostRouteTables(vpc, vpcItem);
      this.associateLocalGatewayRouteTablesToVpc({
        vpcAccountName: vpcItem.account,
        routeTables: outpostRouteTableMap,
        vpcId: vpc.vpcId,
        vpcName: vpcItem.name,
      });
    }
    return outpostRouteTableMap;
  }

  /**
   * Returns a map of outpost route tables for a given VPC
   * @param vpcItem
   * @param vpc
   * @returns
   */
  private getOutpostRouteTables(vpc: Vpc, vpcItem: VpcConfig): Map<string, RouteTable> {
    const outpostRouteTableMap = new Map<string, RouteTable>();
    for (const outpost of vpcItem.outposts ?? []) {
      for (const routeTableItem of outpost.localGateway?.routeTables ?? []) {
        const outpostRouteTable = { routeTableId: routeTableItem.id, vpc } as RouteTable;
        outpostRouteTableMap.set(`${vpcItem.name}_${routeTableItem.name}`, outpostRouteTable);

        this.stack.addSsmParameter({
          logicalId: pascalCase(`SsmParam${pascalCase(vpcItem.name)}${pascalCase(routeTableItem.name)}RouteTableId`),
          parameterName: this.stack.getSsmPath(SsmResourceType.ROUTE_TABLE, [vpcItem.name, routeTableItem.name]),
          stringValue: outpostRouteTable.routeTableId,
        });
      }
    }

    return outpostRouteTableMap;
  }

  /**
   * Associates local route tables to a given VPC
   * @param localGateway
   */
  private associateLocalGatewayRouteTablesToVpc(localGateway: {
    vpcAccountName: string;
    vpcName: string;
    vpcId: string;
    routeTables: Map<string, RouteTable>;
  }): void {
    for (const [name, routeTable] of localGateway.routeTables) {
      new cdk.aws_ec2.CfnLocalGatewayRouteTableVPCAssociation(
        this.stack,
        `${name}-${localGateway.vpcName}-${localGateway.vpcAccountName}`,
        {
          vpcId: localGateway.vpcId,
          localGatewayRouteTableId: routeTable.routeTableId,
        },
      );
    }
  }

  /**
   * Create route tables for a given VPC
   * @param vpcItem
   * @param vpc
   * @returns
   */
  private createRouteTables(vpc: Vpc, vpcItem: VpcConfig | VpcTemplatesConfig): Map<string, RouteTable> {
    const routeTableMap = new Map<string, RouteTable>();
    for (const routeTableItem of vpcItem.routeTables ?? []) {
      const routeTable = new RouteTable(
        this.stack,
        pascalCase(`${vpcItem.name}Vpc`) + pascalCase(`${routeTableItem.name}RouteTable`),
        {
          name: routeTableItem.name,
          vpc,
          tags: routeTableItem.tags,
        },
      );
      // Add gateway association if configured
      if (routeTableItem.gatewayAssociation) {
        routeTable.addGatewayAssociation(routeTableItem.gatewayAssociation);
      }
      routeTableMap.set(`${vpcItem.name}_${routeTableItem.name}`, routeTable);

      this.stack.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(vpcItem.name)}${pascalCase(routeTableItem.name)}RouteTableId`),
        parameterName: this.stack.getSsmPath(SsmResourceType.ROUTE_TABLE, [vpcItem.name, routeTableItem.name]),
        stringValue: routeTable.routeTableId,
      });
    }
    return routeTableMap;
  }
}
