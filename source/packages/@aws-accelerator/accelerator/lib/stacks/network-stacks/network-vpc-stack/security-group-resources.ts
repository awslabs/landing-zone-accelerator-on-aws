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
  NetworkConfigTypes,
  nonEmptyString,
  PrefixListSourceConfig,
  SecurityGroupConfig,
  SecurityGroupRuleConfig,
  SecurityGroupSourceConfig,
  SubnetSourceConfig,
  VpcConfig,
  VpcTemplatesConfig,
} from '@aws-accelerator/config';
import {
  PrefixList,
  SecurityGroup,
  SecurityGroupEgressRuleProps,
  SecurityGroupIngressRuleProps,
  Vpc,
} from '@aws-accelerator/constructs';
import { SsmResourceType } from '@aws-accelerator/utils';
import * as cdk from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import { pascalCase } from 'pascal-case';
import { LogLevel } from '../network-stack';
import { NetworkVpcStack } from './network-vpc-stack';

interface SecurityGroupRuleProps {
  ipProtocol: string;
  cidrIp?: string;
  cidrIpv6?: string;
  fromPort?: number;
  toPort?: number;
  targetSecurityGroup?: SecurityGroup;
  targetPrefixList?: PrefixList;
  description?: string;
}

const TCP_PROTOCOLS_PORT: { [key: string]: number } = {
  RDP: 3389,
  SSH: 22,
  HTTP: 80,
  HTTPS: 443,
  MSSQL: 1433,
  'MYSQL/AURORA': 3306,
  REDSHIFT: 5439,
  POSTGRESQL: 5432,
  'ORACLE-RDS': 1521,
};

export class SecurityGroupResources {
  public readonly securityGroupMap: Map<string, SecurityGroup>;
  private stack: NetworkVpcStack;

  constructor(networkVpcStack: NetworkVpcStack, vpcMap: Map<string, Vpc>, prefixListMap: Map<string, PrefixList>) {
    this.stack = networkVpcStack;

    // Create security groups
    this.securityGroupMap = this.createSecurityGroups(this.stack.vpcsInScope, vpcMap, prefixListMap);
  }

  /**
   * Create security group resources
   * @param vpcResources
   * @param vpcMap
   * @param prefixListMap
   * @returns
   */
  private createSecurityGroups(
    vpcResources: (VpcConfig | VpcTemplatesConfig)[],
    vpcMap: Map<string, Vpc>,
    prefixListMap: Map<string, PrefixList>,
  ): Map<string, SecurityGroup> {
    const securityGroupMap = new Map<string, SecurityGroup>();

    for (const vpcItem of vpcResources) {
      for (const securityGroupItem of vpcItem.securityGroups ?? []) {
        this.stack.addLogs(LogLevel.INFO, `Processing rules for ${securityGroupItem.name} in VPC ${vpcItem.name}`);

        // Process configured rules
        const processedIngressRules = this.setSecurityGroupIngressRules(securityGroupItem, prefixListMap);
        const allIngressRule = this.containsAllIngressRule(processedIngressRules);
        const processedEgressRules = this.setSecurityGroupEgressRules(securityGroupItem, prefixListMap);

        // Get VPC
        const vpc = this.stack.getVpc(vpcMap, vpcItem.name);

        // Create security group
        const securityGroup = this.createSecurityGroupItem(
          vpcItem,
          vpc,
          securityGroupItem,
          processedIngressRules,
          processedEgressRules,
          allIngressRule,
        );
        securityGroupMap.set(`${vpcItem.name}_${securityGroupItem.name}`, securityGroup);
      }
      // Create security group rules that reference other security groups
      this.createSecurityGroupSgIngressSources(vpcItem, prefixListMap, securityGroupMap);
      this.createSecurityGroupSgEgressSources(vpcItem, prefixListMap, securityGroupMap);
    }
    return securityGroupMap;
  }

  /**
   * Process and set security group ingress rules
   * @param securityGroupItem
   * @param prefixListMap
   * @returns
   */
  private setSecurityGroupIngressRules(securityGroupItem: SecurityGroupConfig, prefixListMap: Map<string, PrefixList>) {
    const processedIngressRules: SecurityGroupIngressRuleProps[] = [];

    for (const [ruleId, ingressRuleItem] of securityGroupItem.inboundRules.entries() ?? []) {
      this.stack.addLogs(LogLevel.INFO, `Adding ingress rule ${ruleId} to ${securityGroupItem.name}`);

      const ingressRules: SecurityGroupRuleProps[] = this.processSecurityGroupRules(ingressRuleItem, prefixListMap);

      this.stack.addLogs(LogLevel.INFO, `Adding ${ingressRules.length} ingress rules`);

      for (const ingressRule of ingressRules) {
        if (ingressRule.targetPrefixList) {
          processedIngressRules.push({
            description: ingressRule.description,
            fromPort: ingressRule.fromPort,
            ipProtocol: ingressRule.ipProtocol,
            sourcePrefixListId: ingressRule.targetPrefixList.prefixListId,
            toPort: ingressRule.toPort,
          });
        } else {
          processedIngressRules.push({ ...ingressRule });
        }
      }
    }
    return processedIngressRules;
  }

  /**
   * Returns true if any ingress rules contain an all ingress rule
   * @param ingressRules
   * @returns
   */
  private containsAllIngressRule(ingressRules: SecurityGroupIngressRuleProps[]): boolean {
    let allIngressRule = false;

    for (const ingressRule of ingressRules) {
      if (ingressRule.cidrIp && ingressRule.cidrIp === '0.0.0.0/0') {
        allIngressRule = true;
      }
    }
    return allIngressRule;
  }

  /**
   * Process and set security group ingress rules
   * @param securityGroupItem
   * @param prefixListMap
   * @returns
   */
  private setSecurityGroupEgressRules(securityGroupItem: SecurityGroupConfig, prefixListMap: Map<string, PrefixList>) {
    const processedEgressRules: SecurityGroupEgressRuleProps[] = [];

    for (const [ruleId, egressRuleItem] of securityGroupItem.outboundRules.entries() ?? []) {
      this.stack.addLogs(LogLevel.INFO, `Adding egress rule ${ruleId} to ${securityGroupItem.name}`);

      const egressRules: SecurityGroupRuleProps[] = this.processSecurityGroupRules(egressRuleItem, prefixListMap);

      this.stack.addLogs(LogLevel.INFO, `Adding ${egressRules.length} egress rules`);

      for (const egressRule of egressRules) {
        if (egressRule.targetPrefixList) {
          processedEgressRules.push({
            description: egressRule.description,
            destinationPrefixListId: egressRule.targetPrefixList.prefixListId,
            fromPort: egressRule.fromPort,
            ipProtocol: egressRule.ipProtocol,
            toPort: egressRule.toPort,
          });
        } else {
          processedEgressRules.push({ ...egressRule });
        }
      }
    }
    return processedEgressRules;
  }

  /**
   * Create security group ingress rules that reference other security groups
   * @param vpcItem
   * @param prefixListMap
   * @param securityGroupMap
   */
  private createSecurityGroupSgIngressSources(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    prefixListMap: Map<string, PrefixList>,
    securityGroupMap: Map<string, SecurityGroup>,
  ) {
    for (const securityGroupItem of vpcItem.securityGroups ?? []) {
      for (const [ruleId, ingressRuleItem] of securityGroupItem.inboundRules.entries() ?? []) {
        // Check if rule sources include a security group reference
        let includesSecurityGroupSource = false;
        for (const source of ingressRuleItem.sources) {
          if (NetworkConfigTypes.securityGroupSourceConfig.is(source)) {
            includesSecurityGroupSource = true;
          }
        }

        // Add security group sources if they exist
        if (includesSecurityGroupSource) {
          const securityGroup = this.stack.getSecurityGroup(securityGroupMap, vpcItem.name, securityGroupItem.name);

          const ingressRules: SecurityGroupRuleProps[] = this.processSecurityGroupRules(
            ingressRuleItem,
            prefixListMap,
            securityGroupMap,
            vpcItem.name,
          );

          for (const [ingressRuleIndex, ingressRule] of ingressRules.entries()) {
            if (ingressRule.targetSecurityGroup) {
              securityGroup.addIngressRule(`${securityGroupItem.name}-Ingress-${ruleId}-${ingressRuleIndex}`, {
                sourceSecurityGroup: ingressRule.targetSecurityGroup,
                ...ingressRule,
              });
            }
          }
        }
      }
    }
  }

  /**
   * Create security group egress rules that reference other security groups
   * @param vpcItem
   * @param prefixListMap
   * @param securityGroupMap
   */
  private createSecurityGroupSgEgressSources(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    prefixListMap: Map<string, PrefixList>,
    securityGroupMap: Map<string, SecurityGroup>,
  ) {
    for (const securityGroupItem of vpcItem.securityGroups ?? []) {
      for (const [ruleId, egressRuleItem] of securityGroupItem.outboundRules.entries() ?? []) {
        // Check if rule sources include a security group reference
        let includesSecurityGroupSource = false;
        for (const source of egressRuleItem.sources) {
          if (NetworkConfigTypes.securityGroupSourceConfig.is(source)) {
            includesSecurityGroupSource = true;
          }
        }

        // Add security group sources if they exist
        if (includesSecurityGroupSource) {
          const securityGroup = this.stack.getSecurityGroup(securityGroupMap, vpcItem.name, securityGroupItem.name);

          const egressRules: SecurityGroupRuleProps[] = this.processSecurityGroupRules(
            egressRuleItem,
            prefixListMap,
            securityGroupMap,
            vpcItem.name,
          );

          for (const [egressRuleIndex, egressRule] of egressRules.entries()) {
            if (egressRule.targetSecurityGroup) {
              securityGroup.addEgressRule(`${securityGroupItem.name}-Egress-${ruleId}-${egressRuleIndex}`, {
                destinationSecurityGroup: egressRule.targetSecurityGroup,
                ...egressRule,
              });
            }
          }
        }
      }
    }
  }

  /**
   * Process security group rules based on configured type
   * @param item
   * @param prefixListMap
   * @param securityGroupMap
   * @returns
   */
  private processSecurityGroupRules(
    item: SecurityGroupRuleConfig,
    prefixListMap: Map<string, PrefixList>,
    securityGroupMap?: Map<string, SecurityGroup>,
    vpcName?: string,
  ): SecurityGroupRuleProps[] {
    const rules: SecurityGroupRuleProps[] = [];

    if (!item.types) {
      for (const port of item.tcpPorts ?? []) {
        this.stack.addLogs(LogLevel.INFO, `Adding TCP port ${port}`);
        rules.push(
          ...this.processSecurityGroupRuleSources(
            item.sources,
            prefixListMap,
            {
              ipProtocol: cdk.aws_ec2.Protocol.TCP,
              fromPort: port,
              toPort: port,
              description: item.description,
            },
            securityGroupMap,
            vpcName,
          ),
        );
      }

      for (const port of item.udpPorts ?? []) {
        this.stack.addLogs(LogLevel.INFO, `Adding UDP port ${port}`);
        rules.push(
          ...this.processSecurityGroupRuleSources(
            item.sources,
            prefixListMap,
            {
              ipProtocol: cdk.aws_ec2.Protocol.UDP,
              fromPort: port,
              toPort: port,
              description: item.description,
            },
            securityGroupMap,
            vpcName,
          ),
        );
      }
    }

    for (const type of item.types ?? []) {
      this.stack.addLogs(LogLevel.INFO, `Adding type ${type}`);
      if (type === 'ALL') {
        rules.push(
          ...this.processSecurityGroupRuleSources(
            item.sources,
            prefixListMap,
            {
              ipProtocol: cdk.aws_ec2.Protocol.ALL,
              description: item.description,
            },
            securityGroupMap,
            vpcName,
          ),
        );
      } else if (Object.keys(TCP_PROTOCOLS_PORT).includes(type)) {
        rules.push(
          ...this.processSecurityGroupRuleSources(
            item.sources,
            prefixListMap,
            {
              ipProtocol: cdk.aws_ec2.Protocol.TCP,
              fromPort: TCP_PROTOCOLS_PORT[type],
              toPort: TCP_PROTOCOLS_PORT[type],
              description: item.description,
            },
            securityGroupMap,
            vpcName,
          ),
        );
      } else {
        rules.push(
          ...this.processSecurityGroupRuleSources(
            item.sources,
            prefixListMap,
            {
              ipProtocol: type,
              fromPort: item.fromPort,
              toPort: item.toPort,
              description: item.description,
            },
            securityGroupMap,
            vpcName,
          ),
        );
      }
    }
    return rules;
  }

  /**
   * Processes individual security group source references.
   *
   * @param sources
   * @param prefixListMap
   * @param securityGroupMap
   * @param props
   * @returns
   */
  private processSecurityGroupRuleSources(
    sources: string[] | SecurityGroupSourceConfig[] | PrefixListSourceConfig[] | SubnetSourceConfig[],
    prefixListMap: Map<string, PrefixList>,
    props: {
      ipProtocol: string;
      fromPort?: number;
      toPort?: number;
      description?: string;
    },
    securityGroupMap?: Map<string, SecurityGroup>,
    vpcName?: string,
  ): SecurityGroupRuleProps[] {
    const rules: SecurityGroupRuleProps[] = [];

    for (const source of sources ?? []) {
      // Conditional to only process non-security group sources
      if (!securityGroupMap) {
        //
        // IP source
        //
        if (nonEmptyString.is(source)) {
          this.stack.addLogs(LogLevel.INFO, `Evaluate IP Source ${source}`);
          if (source.includes('::')) {
            rules.push({
              cidrIpv6: source,
              ...props,
            });
          } else {
            rules.push({
              cidrIp: source,
              ...props,
            });
          }
        }

        //
        // Subnet source
        //
        if (NetworkConfigTypes.subnetSourceConfig.is(source)) {
          this.stack.addLogs(
            LogLevel.INFO,
            `Evaluate Subnet Source account:${source.account} vpc:${source.vpc} subnets:[${source.subnets}]`,
          );

          // Locate the VPC
          const vpcItem = this.stack.vpcResources.find(item => item.name === source.vpc);
          if (!vpcItem) {
            this.stack.addLogs(LogLevel.INFO, `Specified VPC ${source.vpc} not defined`);
            throw new Error(`Configuration validation failed at runtime.`);
          }

          // Loop through all subnets to add
          for (const subnet of source.subnets) {
            // Locate the Subnet
            const subnetItem = vpcItem.subnets?.find(item => item.name === subnet);
            if (!subnetItem) {
              this.stack.addLogs(LogLevel.INFO, `Specified subnet ${subnet} not defined`);
              throw new Error(`Configuration validation failed at runtime.`);
            }
            rules.push({
              cidrIp: subnetItem.ipv4CidrBlock,
              ...props,
            });
          }
        }

        //
        // Prefix List Source
        //
        if (NetworkConfigTypes.prefixListSourceConfig.is(source)) {
          this.stack.addLogs(LogLevel.INFO, `Evaluate Prefix List Source prefixLists:[${source.prefixLists}]`);

          for (const prefixList of source.prefixLists ?? []) {
            const targetPrefixList = this.stack.getPrefixList(prefixListMap, prefixList);
            rules.push({
              targetPrefixList,
              ...props,
            });
          }
        }
      }

      if (securityGroupMap && vpcName) {
        //
        // Security Group Source
        //
        if (NetworkConfigTypes.securityGroupSourceConfig.is(source)) {
          this.stack.addLogs(LogLevel.INFO, `Evaluate Security Group Source securityGroups:[${source.securityGroups}]`);

          for (const securityGroup of source.securityGroups ?? []) {
            const targetSecurityGroup = this.stack.getSecurityGroup(securityGroupMap, vpcName, securityGroup);
            rules.push({
              targetSecurityGroup,
              ...props,
            });
          }
        }
      }
    }
    return rules;
  }

  /**
   * Create a security group item
   * @param vpcItem
   * @param vpc
   * @param securityGroupItem
   * @param processedIngressRules
   * @param processedEgressRules
   * @param allIngressRule
   * @returns
   */
  private createSecurityGroupItem(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    vpc: Vpc,
    securityGroupItem: SecurityGroupConfig,
    processedIngressRules: SecurityGroupIngressRuleProps[],
    processedEgressRules: SecurityGroupEgressRuleProps[],
    allIngressRule: boolean,
  ): SecurityGroup {
    this.stack.addLogs(LogLevel.INFO, `Adding Security Group ${securityGroupItem.name} in VPC ${vpcItem.name}`);
    const securityGroup = new SecurityGroup(
      this.stack,
      pascalCase(`${vpcItem.name}Vpc`) + pascalCase(`${securityGroupItem.name}Sg`),
      {
        securityGroupName: securityGroupItem.name,
        securityGroupEgress: processedEgressRules,
        securityGroupIngress: processedIngressRules,
        description: securityGroupItem.description,
        vpc,
        tags: securityGroupItem.tags,
      },
    );

    this.stack.addSsmParameter({
      logicalId: pascalCase(`SsmParam${pascalCase(vpcItem.name) + pascalCase(securityGroupItem.name)}SecurityGroup`),
      parameterName: this.stack.getSsmPath(SsmResourceType.SECURITY_GROUP, [vpcItem.name, securityGroupItem.name]),
      stringValue: securityGroup.securityGroupId,
    });

    // AwsSolutions-EC23: The Security Group allows for 0.0.0.0/0 or ::/0 inbound access.
    if (allIngressRule) {
      NagSuppressions.addResourceSuppressions(securityGroup, [
        { id: 'AwsSolutions-EC23', reason: 'User defined an all ingress rule in configuration.' },
      ]);
    }
    return securityGroup;
  }
}
