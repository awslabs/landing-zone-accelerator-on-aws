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

import { AseaResourceType, VpcConfig, VpcTemplatesConfig } from '@aws-accelerator/config';
import { INatGateway, NatGateway, Subnet } from '@aws-accelerator/constructs';
import { SsmResourceType, MetadataKeys } from '@aws-accelerator/utils';
import { pascalCase } from 'pascal-case';
import { LogLevel } from '../network-stack';
import { getSubnet } from '../utils/getter-utils';
import { NetworkVpcStack } from './network-vpc-stack';
import { CfnResource } from 'aws-cdk-lib/core';
import { LZAResourceLookup, LZAResourceLookupType } from '../../../../utils/lza-resource-lookup';

export class NatGwResources {
  public readonly natGatewayMap: Map<string, INatGateway>;
  private stack: NetworkVpcStack;
  private lzaLookup: LZAResourceLookup;

  constructor(networkVpcStack: NetworkVpcStack, subnetMap: Map<string, Subnet>) {
    this.stack = networkVpcStack;

    this.lzaLookup = new LZAResourceLookup({
      accountId: this.stack.account,
      region: this.stack.region,
      aseaResourceList: this.stack.props.globalConfig.externalLandingZoneResources?.resourceList ?? [],
      enableV2Stacks: this.stack.props.globalConfig.useV2Stacks,
      externalLandingZoneResources:
        this.stack.props.globalConfig.externalLandingZoneResources?.importExternalLandingZoneResources,
      stackName: this.stack.stackName,
    });

    // Create NAT gateways
    this.natGatewayMap = this.createNatGateways(this.stack.vpcsInScope, subnetMap);
  }

  /**
   * Create NAT gateways for the current stack context
   * @param vpcResources
   * @param subnetMap
   * @returns
   */
  private createNatGateways(
    vpcResources: (VpcConfig | VpcTemplatesConfig)[],
    subnetMap: Map<string, Subnet>,
  ): Map<string, INatGateway> {
    const natGatewayMap = new Map<string, INatGateway>();

    for (const vpcItem of vpcResources) {
      for (const natGatewayItem of vpcItem.natGateways ?? []) {
        if (
          !this.lzaLookup.resourceExists({
            resourceType: LZAResourceLookupType.NAT_GATEWAY,
            lookupValues: { vpcName: vpcItem.name, natGatewayName: natGatewayItem.name },
          })
        ) {
          continue;
        }
        const subnet = getSubnet(subnetMap, vpcItem.name, natGatewayItem.subnet) as Subnet;

        this.stack.addLogs(
          LogLevel.INFO,
          `Adding NAT Gateway ${natGatewayItem.name} to VPC ${vpcItem.name} subnet ${natGatewayItem.subnet}`,
        );
        let natGateway;
        if (this.stack.isManagedByAsea(AseaResourceType.NAT_GATEWAY, `${vpcItem.name}/${natGatewayItem.name}`)) {
          const natGatewayId = this.stack.getExternalResourceParameter(
            this.stack.getSsmPath(SsmResourceType.NAT_GW, [vpcItem.name, natGatewayItem.name]),
          );
          natGateway = NatGateway.fromAttributes(
            this.stack,
            pascalCase(`${vpcItem.name}Vpc`) + pascalCase(`${natGatewayItem.name}NatGateway`),
            {
              natGatewayId,
              natGatewayName: natGatewayItem.name,
            },
          );
        } else {
          natGateway = new NatGateway(
            this.stack,
            pascalCase(`${vpcItem.name}Vpc`) + pascalCase(`${natGatewayItem.name}NatGateway`),
            {
              name: natGatewayItem.name,
              allocationId: natGatewayItem.allocationId,
              private: natGatewayItem.private,
              subnet,
              tags: natGatewayItem.tags,
            },
          );
          const resource = natGateway.node.defaultChild as CfnResource;
          resource.addMetadata(MetadataKeys.LZA_LOOKUP, {
            vpcName: vpcItem.name,
            natGatewayName: natGatewayItem.name,
          });

          this.stack.addSsmParameter({
            logicalId: pascalCase(`SsmParam${pascalCase(vpcItem.name) + pascalCase(natGatewayItem.name)}NatGatewayId`),
            parameterName: this.stack.getSsmPath(SsmResourceType.NAT_GW, [vpcItem.name, natGatewayItem.name]),
            stringValue: natGateway.natGatewayId,
          });
        }
        natGatewayMap.set(`${vpcItem.name}_${natGatewayItem.name}`, natGateway);
      }
    }
    return natGatewayMap;
  }
}
