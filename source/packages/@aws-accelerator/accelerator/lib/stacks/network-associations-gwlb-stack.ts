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
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';

import {
  GwlbConfig,
  GwlbEndpointConfig,
  RouteTableEntryConfig,
  VpcConfig,
  VpcTemplatesConfig,
} from '@aws-accelerator/config';
import { SsmParameterLookup, VpcEndpoint, VpcEndpointType } from '@aws-accelerator/constructs';

import { Logger } from '../logger';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';

export class NetworkAssociationsGwlbStack extends AcceleratorStack {
  private cloudwatchKey: cdk.aws_kms.Key;
  private logRetention: number;
  private routeTableMap: Map<string, string>;
  private subnetMap: Map<string, string>;
  private vpcMap: Map<string, string>;

  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    // Set initial private properties
    [this.routeTableMap, this.subnetMap, this.vpcMap] = this.setInitialMaps(props);
    this.logRetention = props.globalConfig.cloudwatchLogRetentionInDays;

    this.cloudwatchKey = cdk.aws_kms.Key.fromKeyArn(
      this,
      'AcceleratorGetCloudWatchKey',
      cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        AcceleratorStack.ACCELERATOR_CLOUDWATCH_LOG_KEY_ARN_PARAMETER_NAME,
      ),
    ) as cdk.aws_kms.Key;

    //
    // Create Gateway Load Balancer resources
    //
    this.createGwlbResources(props);

    Logger.info('[network-associations-gwlb-stack] Completed stack synthesis');
  }

  /**
   * Set route table, subnet, and VPC maps for this stack's account and region
   * @param props
   * @returns
   */
  private setInitialMaps(props: AcceleratorStackProps): Map<string, string>[] {
    const routeTableMap = new Map<string, string>();
    const subnetMap = new Map<string, string>();
    const vpcMap = new Map<string, string>();

    for (const vpcItem of [...props.networkConfig.vpcs, ...(props.networkConfig.vpcTemplates ?? [])] ?? []) {
      // Get account IDs
      const vpcAccountIds = this.getVpcAccountIds(vpcItem);

      if (vpcAccountIds.includes(cdk.Stack.of(this).account) && vpcItem.region === cdk.Stack.of(this).region) {
        // Set VPC ID
        const vpcId = cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          `/accelerator/network/vpc/${vpcItem.name}/id`,
        );
        vpcMap.set(vpcItem.name, vpcId);

        // Set subnet IDs
        for (const subnetItem of vpcItem.subnets ?? []) {
          const subnetId = cdk.aws_ssm.StringParameter.valueForStringParameter(
            this,
            `/accelerator/network/vpc/${vpcItem.name}/subnet/${subnetItem.name}/id`,
          );
          subnetMap.set(`${vpcItem.name}_${subnetItem.name}`, subnetId);
        }

        // Set route table IDs
        for (const routeTableItem of vpcItem.routeTables ?? []) {
          const routeTableId = cdk.aws_ssm.StringParameter.valueForStringParameter(
            this,
            `/accelerator/network/vpc/${vpcItem.name}/routeTable/${routeTableItem.name}/id`,
          );
          routeTableMap.set(`${vpcItem.name}_${routeTableItem.name}`, routeTableId);
        }
      }
    }
    return [routeTableMap, subnetMap, vpcMap];
  }

  /**
   * Create Gateway Load Balancer resources.
   * @param props
   */
  private createGwlbResources(props: AcceleratorStackProps): void {
    for (const vpcItem of [...props.networkConfig.vpcs, ...(props.networkConfig.vpcTemplates ?? [])] ?? []) {
      // Get account IDs
      const vpcAccountIds = this.getVpcAccountIds(vpcItem);

      if (vpcAccountIds.includes(cdk.Stack.of(this).account) && vpcItem.region === cdk.Stack.of(this).region) {
        const vpcId = this.vpcMap.get(vpcItem.name);
        if (!vpcId) {
          throw new Error(`[network-associations-gwlb-stack] Unable to locate VPC ${vpcItem.name}`);
        }
        // Create GWLB endpoints and set map
        const gwlbEndpointMap = this.createGwlbEndpoints(props, vpcItem, vpcId);

        // Create GWLB route table entries
        this.createGwlbRouteTableEntries(vpcItem, gwlbEndpointMap);
      }
    }
  }

  /**
   * Create GWLB endpoints for this stack's account ID and region
   * @param props
   * @param vpcItem
   * @param vpcId
   * @returns
   */
  private createGwlbEndpoints(
    props: AcceleratorStackProps,
    vpcItem: VpcConfig | VpcTemplatesConfig,
    vpcId: string,
  ): Map<string, VpcEndpoint> {
    const gwlbEndpointMap = new Map<string, VpcEndpoint>();
    if (props.networkConfig.centralNetworkServices?.gatewayLoadBalancers) {
      const loadBalancers = props.networkConfig.centralNetworkServices.gatewayLoadBalancers;
      const delegatedAdminAccountId = this.props.accountsConfig.getAccountId(
        props.networkConfig.centralNetworkServices.delegatedAdminAccount,
      );

      // Create GWLB endpoints and add them to a map
      for (const loadBalancerItem of loadBalancers) {
        const lbItemEndpointMap = this.createGwlbEndpointMap(
          vpcId,
          vpcItem,
          loadBalancerItem,
          delegatedAdminAccountId,
          props.partition,
        );
        lbItemEndpointMap.forEach((endpoint, name) => gwlbEndpointMap.set(name, endpoint));
      }
    }
    return gwlbEndpointMap;
  }

  /**
   * Create Gateway Load Balancer endpoint map.
   * @param vpcId
   * @param vpcItem
   * @param loadBalancerItem
   * @param delegatedAdminAccountId
   * @returns
   */
  private createGwlbEndpointMap(
    vpcId: string,
    vpcItem: VpcConfig | VpcTemplatesConfig,
    loadBalancerItem: GwlbConfig,
    delegatedAdminAccountId: string,
    partition: string,
  ): Map<string, VpcEndpoint> {
    const endpointMap = new Map<string, VpcEndpoint>();
    let endpointServiceId: string | undefined = undefined;
    for (const endpointItem of loadBalancerItem.endpoints) {
      if (endpointItem.vpc === vpcItem.name) {
        // Get endpoint service ID
        if (!endpointServiceId) {
          if (delegatedAdminAccountId !== cdk.Stack.of(this).account) {
            endpointServiceId = new SsmParameterLookup(this, pascalCase(`SsmParamLookup${loadBalancerItem.name}`), {
              name: `/accelerator/network/gwlb/${loadBalancerItem.name}/endpointService/id`,
              accountId: delegatedAdminAccountId,
              parameterRegion: cdk.Stack.of(this).region,
              roleName: `AWSAccelerator-Get${pascalCase(loadBalancerItem.name)}SsmParamRole-${
                cdk.Stack.of(this).region
              }`,
              kmsKey: this.cloudwatchKey,
              logRetentionInDays: this.logRetention,
            }).value;
          } else {
            endpointServiceId = cdk.aws_ssm.StringParameter.valueForStringParameter(
              this,
              `/accelerator/network/gwlb/${loadBalancerItem.name}/endpointService/id`,
            );
          }
        }

        // Create endpoint and add to map
        const endpoint = this.createGwlbEndpointItem(endpointItem, vpcId, endpointServiceId, partition);
        endpointMap.set(endpointItem.name, endpoint);
      }
    }
    return endpointMap;
  }

  /**
   * Create Gateway Load Balancer endpoint item.
   *
   * @param endpointItem
   * @param vpcId
   * @param endpointServiceId
   */
  private createGwlbEndpointItem(
    endpointItem: GwlbEndpointConfig,
    vpcId: string,
    endpointServiceId: string,
    partition: string,
  ): VpcEndpoint {
    const subnetKey = `${endpointItem.vpc}_${endpointItem.subnet}`;
    const subnet = this.subnetMap.get(subnetKey);

    if (!subnet) {
      throw new Error(
        `[network-associations-gwlb-stack] Create Gateway Load Balancer endpoint: subnet ${endpointItem.subnet} not found in VPC ${endpointItem.vpc}`,
      );
    }

    // Create endpoint
    Logger.info(
      `[network-associations-gwlb-stack] Add Gateway Load Balancer endpoint ${endpointItem.name} to VPC ${endpointItem.vpc} subnet ${endpointItem.subnet}`,
    );
    return new VpcEndpoint(this, `${pascalCase(endpointItem.vpc)}Vpc${pascalCase(endpointItem.name)}GwlbEp`, {
      service: endpointServiceId,
      vpcEndpointType: VpcEndpointType.GWLB,
      vpcId,
      subnets: [subnet],
      partition: partition,
    });
  }

  /**
   * Create GWLB endpoint route table entries.
   * @param vpcItem
   * @param gwlbEndpointMap
   */
  private createGwlbRouteTableEntries(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    gwlbEndpointMap: Map<string, VpcEndpoint>,
  ): void {
    for (const routeTableItem of vpcItem.routeTables ?? []) {
      for (const routeTableEntryItem of routeTableItem.routes ?? []) {
        this.createGwlbRouteTableEntryItem(vpcItem.name, routeTableItem.name, routeTableEntryItem, gwlbEndpointMap);
      }
    }
  }

  /**
   * Create GWLB route table entry item.
   * @param vpcName
   * @param routeTableName
   * @param routeTableEntryItem
   * @param gwlbEndpointMap
   */
  private createGwlbRouteTableEntryItem(
    vpcName: string,
    routeTableName: string,
    routeTableEntryItem: RouteTableEntryConfig,
    gwlbEndpointMap: Map<string, VpcEndpoint>,
  ): void {
    const endpointRouteId =
      pascalCase(`${vpcName}Vpc`) + pascalCase(`${routeTableName}RouteTable`) + pascalCase(routeTableEntryItem.name);

    if (routeTableEntryItem.type && routeTableEntryItem.type === 'gatewayLoadBalancerEndpoint') {
      // Get endpoint and route table items
      const gwlbEndpoint = gwlbEndpointMap.get(routeTableEntryItem.target!);
      const routeTableId = this.routeTableMap.get(`${vpcName}_${routeTableName}`);

      // Check if route table exists im map
      if (!routeTableId) {
        throw new Error(`[network-associations-gwlb-stack] Unable to locate route table ${routeTableName}`);
      }

      if (!gwlbEndpoint) {
        throw new Error(`[network-associations-gwlb-stack] Unable to locate endpoint ${routeTableEntryItem.target}`);
      }
      // Add route
      Logger.info(
        `[network-associations-gwlb-stack] Adding Gateway Load Balancer endpoint Route Table Entry ${routeTableEntryItem.name}`,
      );
      gwlbEndpoint.createEndpointRoute(endpointRouteId, routeTableEntryItem.destination!, routeTableId);
    }
  }
}
