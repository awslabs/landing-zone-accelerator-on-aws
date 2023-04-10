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

import { SecurityGroupConfig, VpcConfig, VpcTemplatesConfig } from '@aws-accelerator/config';
import {
  PrefixList,
  SecurityGroup,
  SecurityGroupEgressRuleProps,
  SecurityGroupIngressRuleProps,
  Subnet,
  Vpc,
} from '@aws-accelerator/constructs';
import { SsmResourceType } from '@aws-accelerator/utils';
import { NagSuppressions } from 'cdk-nag';
import { pascalCase } from 'pascal-case';
import { LogLevel } from '../network-stack';
import { getSecurityGroup, getVpc } from '../utils/getter-utils';
import {
  containsAllIngressRule,
  processSecurityGroupEgressRules,
  processSecurityGroupIngressRules,
  processSecurityGroupSgEgressSources,
  processSecurityGroupSgIngressSources,
} from '../utils/security-group-utils';
import { NetworkVpcStack } from './network-vpc-stack';

export class SecurityGroupResources {
  public readonly securityGroupMap: Map<string, SecurityGroup>;
  private stack: NetworkVpcStack;

  constructor(
    networkVpcStack: NetworkVpcStack,
    vpcMap: Map<string, Vpc>,
    subnetMap: Map<string, Subnet>,
    prefixListMap: Map<string, PrefixList>,
  ) {
    this.stack = networkVpcStack;

    // Create security groups
    this.securityGroupMap = this.createSecurityGroups(this.stack.vpcsInScope, vpcMap, subnetMap, prefixListMap);
  }

  /**
   * Create security group resources
   * @param vpcResources
   * @param vpcMap
   * @param subnetMap
   * @param prefixListMap
   * @returns
   */
  private createSecurityGroups(
    vpcResources: (VpcConfig | VpcTemplatesConfig)[],
    vpcMap: Map<string, Vpc>,
    subnetMap: Map<string, Subnet>,
    prefixListMap: Map<string, PrefixList>,
  ): Map<string, SecurityGroup> {
    const securityGroupMap = new Map<string, SecurityGroup>();

    for (const vpcItem of vpcResources) {
      for (const securityGroupItem of vpcItem.securityGroups ?? []) {
        this.stack.addLogs(LogLevel.INFO, `Processing rules for ${securityGroupItem.name} in VPC ${vpcItem.name}`);

        // Process configured rules
        const processedIngressRules = processSecurityGroupIngressRules(
          this.stack.vpcResources,
          securityGroupItem,
          subnetMap,
          prefixListMap,
        );
        const allIngressRule = containsAllIngressRule(processedIngressRules);
        const processedEgressRules = processSecurityGroupEgressRules(
          this.stack.vpcResources,
          securityGroupItem,
          subnetMap,
          prefixListMap,
        );

        // Get VPC
        const vpc = getVpc(vpcMap, vpcItem.name) as Vpc;

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
      this.createSecurityGroupSgSources(vpcItem, subnetMap, prefixListMap, securityGroupMap);
    }
    return securityGroupMap;
  }

  /**
   * Create security group rules that reference other security groups
   * @param vpcItem
   * @param subnetMap
   * @param prefixListMap
   * @param securityGroupMap
   */
  private createSecurityGroupSgSources(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    subnetMap: Map<string, Subnet>,
    prefixListMap: Map<string, PrefixList>,
    securityGroupMap: Map<string, SecurityGroup>,
  ) {
    for (const securityGroupItem of vpcItem.securityGroups ?? []) {
      const securityGroup = getSecurityGroup(securityGroupMap, vpcItem.name, securityGroupItem.name) as SecurityGroup;
      const ingressRules = processSecurityGroupSgIngressSources(
        this.stack.vpcResources,
        vpcItem,
        securityGroupItem,
        subnetMap,
        prefixListMap,
        securityGroupMap,
      );
      const egressRules = processSecurityGroupSgEgressSources(
        this.stack.vpcResources,
        vpcItem,
        securityGroupItem,
        subnetMap,
        prefixListMap,
        securityGroupMap,
      );

      // Create ingress rules
      ingressRules.forEach(ingressRule => {
        securityGroup.addIngressRule(ingressRule.logicalId, {
          sourceSecurityGroup: ingressRule.rule.targetSecurityGroup,
          ...ingressRule.rule,
        });
      });

      // Create egress rules
      egressRules.forEach(egressRule => {
        securityGroup.addEgressRule(egressRule.logicalId, {
          destinationSecurityGroup: egressRule.rule.targetSecurityGroup,
          ...egressRule.rule,
        });
      });
    }
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
