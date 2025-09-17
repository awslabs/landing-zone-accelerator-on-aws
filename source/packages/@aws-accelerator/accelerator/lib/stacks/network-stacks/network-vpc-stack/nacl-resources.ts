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
  isNetworkType,
  NetworkAclConfig,
  NetworkAclSubnetSelection,
  NonEmptyString,
  VpcConfig,
  VpcTemplatesConfig,
  AseaResourceType,
  NetworkAclOutboundRuleConfig,
  NetworkAclInboundRuleConfig,
} from '@aws-accelerator/config';
import { NetworkAcl, Subnet, Vpc } from '@aws-accelerator/constructs';
import { SsmResourceType, MetadataKeys } from '@aws-accelerator/utils';
import { NagSuppressions } from 'cdk-nag';
import { pascalCase } from 'pascal-case';
import { LogLevel } from '../network-stack';
import { getSubnet, getSubnetConfig, getVpc, getVpcConfig } from '../utils/getter-utils';
import { isIpv6Cidr } from '../utils/validation-utils';
import { NetworkVpcStack } from './network-vpc-stack';
import * as cdk from 'aws-cdk-lib';
import { LZAResourceLookup, LZAResourceLookupType } from '../../../../utils/lza-resource-lookup';

export class NaclResources {
  public readonly naclMap: Map<string, NetworkAcl>;
  private stack: NetworkVpcStack;
  private lzaLookup: LZAResourceLookup;

  constructor(networkVpcStack: NetworkVpcStack, vpcMap: Map<string, Vpc>, subnetMap: Map<string, Subnet>) {
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

    // Create NACLs
    this.naclMap = this.createNacls(this.stack.vpcsInScope, vpcMap, subnetMap);
  }

  private createNacls(
    vpcResources: (VpcConfig | VpcTemplatesConfig)[],
    vpcMap: Map<string, Vpc>,
    subnetMap: Map<string, Subnet>,
  ): Map<string, NetworkAcl> {
    const naclMap = new Map<string, NetworkAcl>();

    for (const vpcItem of vpcResources) {
      for (const naclItem of vpcItem.networkAcls ?? []) {
        // Retrieve VPC from map
        const vpc = getVpc(vpcMap, vpcItem.name) as Vpc;
        if (
          !vpc ||
          !this.lzaLookup.resourceExists({
            resourceType: LZAResourceLookupType.NETWORK_ACL,
            lookupValues: { vpcName: vpcItem.name, naclName: naclItem.name },
          })
        ) {
          continue;
        }

        // Create NACL
        this.stack.addLogs(LogLevel.INFO, `Adding Network ACL ${naclItem.name} in VPC ${vpcItem.name}`);

        const networkAcl = new NetworkAcl(
          this.stack,
          `${pascalCase(vpcItem.name)}Vpc${pascalCase(naclItem.name)}Nacl`,
          {
            networkAclName: naclItem.name,
            vpc,
            tags: naclItem.tags,
          },
        );
        const resource = networkAcl.node.defaultChild as cdk.CfnResource;
        resource.addMetadata(MetadataKeys.LZA_LOOKUP, {
          vpcName: vpcItem.name,
          naclName: naclItem.name,
        });
        naclMap.set(`${vpcItem.name}_${naclItem.name}`, networkAcl);

        // Suppression for AwsSolutions-VPC3: A Network ACL or Network ACL entry has been implemented.
        NagSuppressions.addResourceSuppressions(
          networkAcl,
          [{ id: 'AwsSolutions-VPC3', reason: 'NACL added to VPC' }],
          true,
        );

        this.stack.addSsmParameter({
          logicalId: pascalCase(`SsmParam${pascalCase(vpcItem.name)}${pascalCase(naclItem.name)}Nacl`),
          parameterName: this.stack.getSsmPath(SsmResourceType.NACL, [vpcItem.name, naclItem.name]),
          stringValue: networkAcl.networkAclId,
        });

        // Create subnet associations
        this.createNaclSubnetAssociations(vpcItem, naclItem, networkAcl, subnetMap);
        // Create NACL entries
        this.createNaclEntries(vpcItem, naclItem, networkAcl, subnetMap);
      }
    }
    return naclMap;
  }

  /**
   * Create network ACL subnet associations
   * @param vpcItem
   * @param naclItem
   * @param networkAcl
   * @param subnetMap
   */
  private createNaclSubnetAssociations(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    naclItem: NetworkAclConfig,
    networkAcl: NetworkAcl,
    subnetMap: Map<string, Subnet>,
  ) {
    for (const subnetItem of naclItem.subnetAssociations) {
      const naclSubnetAssociation = `${vpcItem.name}/${subnetItem}`;
      if (this.stack.isManagedByAsea(AseaResourceType.EC2_NACL_SUBNET_ASSOCIATION, naclSubnetAssociation)) {
        this.stack.addLogs(LogLevel.INFO, `Nacl Subnet Association ${naclSubnetAssociation} is managed by ASEA`);
        continue;
      }
      if (
        !this.lzaLookup.resourceExists({
          resourceType: LZAResourceLookupType.SUBNET_NETWORK_ACL_ASSOCIATION,
          lookupValues: { vpcName: vpcItem.name, naclName: naclItem.name, subnetName: subnetItem },
        })
      ) {
        continue;
      }

      this.stack.addLogs(LogLevel.INFO, `Associate ${naclItem.name} to subnet ${subnetItem}`);
      const subnet = getSubnet(subnetMap, vpcItem.name, subnetItem) as Subnet;
      const resource = networkAcl.associateSubnet(
        `${pascalCase(vpcItem.name)}Vpc${pascalCase(naclItem.name)}NaclAssociate${pascalCase(subnetItem)}`,
        {
          subnet,
        },
      );
      resource.addMetadata(MetadataKeys.LZA_LOOKUP, {
        vpcName: vpcItem.name,
        naclName: naclItem.name,
        subnetName: subnetItem,
      });
    }
  }

  /**
   * Create NACL inbound and outbound entries
   * @param vpcItem
   * @param naclItem
   * @param networkAcl
   */
  private createNaclEntries(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    naclItem: NetworkAclConfig,
    networkAcl: NetworkAcl,
    subnetMap: Map<string, Subnet>,
  ) {
    for (const inboundRuleItem of naclItem.inboundRules ?? []) {
      const metadata = this.getMetadata(vpcItem.name, naclItem.name, inboundRuleItem);
      if (
        !this.lzaLookup.resourceExists({
          resourceType: LZAResourceLookupType.NETWORK_ACL_ENTRY,
          lookupValues: metadata,
        })
      ) {
        continue;
      }

      // If logic to determine if the VPC is not IPAM-based
      if (!this.stack.isIpamCrossAccountNaclSource(inboundRuleItem.source)) {
        this.stack.addLogs(LogLevel.INFO, `Adding inbound rule ${inboundRuleItem.rule} to ${naclItem.name}`);

        const inboundAclTargetProps: { cidrBlock?: string; ipv6CidrBlock?: string } = this.processNetworkAclTarget(
          inboundRuleItem.source,
          subnetMap,
        );

        const entry = networkAcl.addEntry(
          `${pascalCase(vpcItem.name)}Vpc${pascalCase(naclItem.name)}-Inbound-${inboundRuleItem.rule}`,
          {
            egress: false,
            protocol: inboundRuleItem.protocol,
            ruleAction: inboundRuleItem.action,
            ruleNumber: inboundRuleItem.rule,
            icmp: inboundRuleItem.icmp!,
            portRange: {
              from: inboundRuleItem.fromPort,
              to: inboundRuleItem.toPort,
            },
            ...inboundAclTargetProps,
          },
        );
        entry.addMetadata(MetadataKeys.LZA_LOOKUP, metadata);

        // Suppression for AwsSolutions-VPC3: A Network ACL or Network ACL entry has been implemented.
        NagSuppressions.addResourceSuppressionsByPath(
          this.stack,
          `${this.stack.stackName}/${pascalCase(vpcItem.name)}Vpc${pascalCase(naclItem.name)}Nacl/${pascalCase(
            vpcItem.name,
          )}Vpc${pascalCase(naclItem.name)}-Inbound-${inboundRuleItem.rule}`,
          [{ id: 'AwsSolutions-VPC3', reason: 'NACL added to VPC' }],
        );
      }
    }

    for (const outboundRuleItem of naclItem.outboundRules ?? []) {
      const metadata = this.getMetadata(vpcItem.name, naclItem.name, outboundRuleItem);
      if (
        !this.lzaLookup.resourceExists({
          resourceType: LZAResourceLookupType.NETWORK_ACL_ENTRY,
          lookupValues: metadata,
        })
      ) {
        continue;
      }

      if (!this.stack.isIpamCrossAccountNaclSource(outboundRuleItem.destination)) {
        this.stack.addLogs(LogLevel.INFO, `Adding outbound rule ${outboundRuleItem.rule} to ${naclItem.name}`);

        const outboundAclTargetProps: { cidrBlock?: string; ipv6CidrBlock?: string } = this.processNetworkAclTarget(
          outboundRuleItem.destination,
          subnetMap,
        );

        const entry = networkAcl.addEntry(
          `${pascalCase(vpcItem.name)}Vpc${pascalCase(naclItem.name)}-Outbound-${outboundRuleItem.rule}`,
          {
            egress: true,
            protocol: outboundRuleItem.protocol,
            ruleAction: outboundRuleItem.action,
            ruleNumber: outboundRuleItem.rule,
            icmp: outboundRuleItem.icmp!,
            portRange: {
              from: outboundRuleItem.fromPort,
              to: outboundRuleItem.toPort,
            },
            ...outboundAclTargetProps,
          },
        );
        entry.addMetadata(MetadataKeys.LZA_LOOKUP, metadata);
      }
      // Suppression for AwsSolutions-VPC3: A Network ACL or Network ACL entry has been implemented.
      NagSuppressions.addResourceSuppressionsByPath(
        this.stack,
        `${this.stack.stackName}/${pascalCase(vpcItem.name)}Vpc${pascalCase(naclItem.name)}Nacl/${pascalCase(
          vpcItem.name,
        )}Vpc${pascalCase(naclItem.name)}-Outbound-${outboundRuleItem.rule}`,
        [{ id: 'AwsSolutions-VPC3', reason: 'NACL added to VPC' }],
      );
    }
  }

  /**
   * Process target source/destination for NACL
   * @param target
   * @returns
   */
  private processNetworkAclTarget(
    target: string | NetworkAclSubnetSelection,
    subnetMap: Map<string, Subnet>,
  ): {
    cidrBlock?: string;
    ipv6CidrBlock?: string;
  } {
    //
    // IP target
    //
    if (isNetworkType<NonEmptyString>('NonEmptyString', target)) {
      this.stack.addLogs(LogLevel.INFO, `Evaluate IP Target ${target}`);
      if (isIpv6Cidr(target)) {
        return { ipv6CidrBlock: target };
      } else {
        return { cidrBlock: target };
      }
    }
    //
    // Subnet Source target
    //
    if (isNetworkType<NetworkAclSubnetSelection>('INetworkAclSubnetSelection', target)) {
      this.stack.addLogs(
        LogLevel.INFO,
        `Evaluate Subnet Source account:${target.account} vpc:${target.vpc} subnets:[${target.subnet}]`,
      );
      //
      // Locate the VPC
      const vpcConfigItem = getVpcConfig(this.stack.vpcResources, target.vpc);
      //
      // Locate the Subnet
      const subnetConfigItem = getSubnetConfig(vpcConfigItem, target.subnet);

      if (subnetConfigItem.ipamAllocation) {
        const subnetItem = getSubnet(subnetMap, vpcConfigItem.name, subnetConfigItem.name) as Subnet;
        return { cidrBlock: subnetItem.ipv4CidrBlock };
      } else {
        return target.ipv6
          ? { ipv6CidrBlock: subnetConfigItem.ipv6CidrBlock }
          : { cidrBlock: subnetConfigItem.ipv4CidrBlock };
      }
    }

    this.stack.addLogs(LogLevel.ERROR, `Invalid input to processNetworkAclTargets`);
    throw new Error(`Configuration validation failed at runtime.`);
  }

  private getMetadata(
    vpcName: string,
    naclName: string,
    rule: NetworkAclInboundRuleConfig | NetworkAclOutboundRuleConfig,
  ) {
    let type: string;
    let config: string | NetworkAclSubnetSelection;
    if (isNetworkType('INetworkAclInboundRuleConfig', rule)) {
      type = 'ingress';
      config = (rule as NetworkAclInboundRuleConfig).source;
    } else {
      type = 'egress';
      config = (rule as NetworkAclOutboundRuleConfig).destination;
    }

    // Base metadata with default values for all possible properties
    const metadata = {
      vpcName,
      naclName,
      ruleNumber: rule.rule,
      type,
    };

    // Add appropriate properties based on config type
    if (typeof config === 'string') {
      return {
        ...metadata,
        cidr: config,
      };
    } else {
      return {
        ...metadata,
        ...config,
      };
    }
  }
}
