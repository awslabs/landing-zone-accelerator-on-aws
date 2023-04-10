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
  NetworkAclConfig,
  NetworkAclSubnetSelection,
  NetworkConfigTypes,
  nonEmptyString,
  VpcConfig,
  VpcTemplatesConfig,
} from '@aws-accelerator/config';
import { NetworkAcl, Subnet, Vpc } from '@aws-accelerator/constructs';
import { SsmResourceType } from '@aws-accelerator/utils';
import { NagSuppressions } from 'cdk-nag';
import { pascalCase } from 'pascal-case';
import { LogLevel } from '../network-stack';
import { getSubnet, getVpc } from '../utils/getter-utils';
import { NetworkVpcStack } from './network-vpc-stack';

export class NaclResources {
  public readonly naclMap: Map<string, NetworkAcl>;
  private stack: NetworkVpcStack;

  constructor(networkVpcStack: NetworkVpcStack, vpcMap: Map<string, Vpc>, subnetMap: Map<string, Subnet>) {
    this.stack = networkVpcStack;

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
      this.stack.addLogs(LogLevel.INFO, `Associate ${naclItem.name} to subnet ${subnetItem}`);
      const subnet = getSubnet(subnetMap, vpcItem.name, subnetItem) as Subnet;

      networkAcl.associateSubnet(
        `${pascalCase(vpcItem.name)}Vpc${pascalCase(naclItem.name)}NaclAssociate${pascalCase(subnetItem)}`,
        {
          subnet,
        },
      );
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
      // If logic to determine if the VPC is not IPAM-based
      if (!this.stack.isIpamCrossAccountNaclSource(inboundRuleItem.source)) {
        this.stack.addLogs(LogLevel.INFO, `Adding inbound rule ${inboundRuleItem.rule} to ${naclItem.name}`);

        const inboundAclTargetProps: { cidrBlock?: string; ipv6CidrBlock?: string } = this.processNetworkAclTarget(
          inboundRuleItem.source,
          subnetMap,
        );

        networkAcl.addEntry(
          `${pascalCase(vpcItem.name)}Vpc${pascalCase(naclItem.name)}-Inbound-${inboundRuleItem.rule}`,
          {
            egress: false,
            protocol: inboundRuleItem.protocol,
            ruleAction: inboundRuleItem.action,
            ruleNumber: inboundRuleItem.rule,
            portRange: {
              from: inboundRuleItem.fromPort,
              to: inboundRuleItem.toPort,
            },
            ...inboundAclTargetProps,
          },
        );

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
      if (!this.stack.isIpamCrossAccountNaclSource(outboundRuleItem.destination)) {
        this.stack.addLogs(LogLevel.INFO, `Adding outbound rule ${outboundRuleItem.rule} to ${naclItem.name}`);

        const outboundAclTargetProps: { cidrBlock?: string; ipv6CidrBlock?: string } = this.processNetworkAclTarget(
          outboundRuleItem.destination,
          subnetMap,
        );

        networkAcl.addEntry(
          `${pascalCase(vpcItem.name)}Vpc${pascalCase(naclItem.name)}-Outbound-${outboundRuleItem.rule}`,
          {
            egress: true,
            protocol: outboundRuleItem.protocol,
            ruleAction: outboundRuleItem.action,
            ruleNumber: outboundRuleItem.rule,
            portRange: {
              from: outboundRuleItem.fromPort,
              to: outboundRuleItem.toPort,
            },
            ...outboundAclTargetProps,
          },
        );
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
    if (nonEmptyString.is(target)) {
      this.stack.addLogs(LogLevel.INFO, `Evaluate IP Target ${target}`);
      if (target.includes('::')) {
        return { ipv6CidrBlock: target };
      } else {
        return { cidrBlock: target };
      }
    }

    //
    // Subnet Source target
    //
    if (NetworkConfigTypes.networkAclSubnetSelection.is(target)) {
      this.stack.addLogs(
        LogLevel.INFO,
        `Evaluate Subnet Source account:${target.account} vpc:${target.vpc} subnets:[${target.subnet}]`,
      );

      // Locate the VPC
      const vpcItem = this.stack.vpcResources.find(item => item.name === target.vpc);
      if (!vpcItem) {
        this.stack.addLogs(LogLevel.ERROR, `Specified VPC ${target.vpc} not defined`);
        throw new Error(`Configuration validation failed at runtime.`);
      }

      // Locate the Subnet
      const subnetConfigItem = vpcItem.subnets?.find(item => item.name === target.subnet);
      if (!subnetConfigItem) {
        this.stack.addLogs(LogLevel.ERROR, `Specified subnet ${target.subnet} not defined`);
        throw new Error(`Configuration validation failed at runtime.`);
      }

      if (subnetConfigItem.ipamAllocation) {
        const subnetItem = getSubnet(subnetMap, vpcItem.name, subnetConfigItem.name) as Subnet;
        return { cidrBlock: subnetItem.ipv4CidrBlock };
      } else {
        return { cidrBlock: subnetConfigItem.ipv4CidrBlock };
      }
    }

    this.stack.addLogs(LogLevel.ERROR, `Invalid input to processNetworkAclTargets`);
    throw new Error(`Configuration validation failed at runtime.`);
  }
}
