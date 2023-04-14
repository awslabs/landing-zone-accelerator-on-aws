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
  PrefixListSourceConfig,
  SecurityGroupConfig,
  SecurityGroupRuleConfig,
  SecurityGroupSourceConfig,
  SubnetSourceConfig,
  VpcConfig,
  VpcTemplatesConfig,
  nonEmptyString,
} from '@aws-accelerator/config';
import {
  IIpamSubnet,
  PrefixList,
  SecurityGroup,
  SecurityGroupEgressRuleProps,
  SecurityGroupIngressRuleProps,
  Subnet,
} from '@aws-accelerator/constructs';
import { createLogger } from '@aws-accelerator/utils';
import * as cdk from 'aws-cdk-lib';
import { getPrefixList, getSecurityGroup, getSubnet, getSubnetConfig, getVpcConfig } from './getter-utils';

/**
 * Security group rule properties
 */
interface SecurityGroupRuleProps {
  ipProtocol: string;
  cidrIp?: string;
  cidrIpv6?: string;
  fromPort?: number;
  toPort?: number;
  targetSecurityGroup?: SecurityGroup;
  targetPrefixList?: string;
  description?: string;
}

/**
 * Security group application TCP port mapping
 */
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

/**
 * A logger for the utility functions
 */
const logger = createLogger(['security-group-utils']);

/**
 * Function to set IPAM subnets for a given array of VPC resources
 * @param vpcResources
 * @param subnetMap
 */
export function setIpamSubnetSourceArray(
  allVpcResources: (VpcConfig | VpcTemplatesConfig)[],
  vpcResources: (VpcConfig | VpcTemplatesConfig)[],
): string[] {
  const ipamSubnets: string[] = [];

  for (const vpcItem of vpcResources) {
    for (const sgItem of vpcItem.securityGroups ?? []) {
      ipamSubnets.push(...setSgItemIpamSubnets(allVpcResources, sgItem));
    }
  }
  return [...new Set(ipamSubnets)];
}

/**
 * Sets an array of IPAM subnets for a single security group config item
 * @param allVpcResources
 * @param sgItem
 * @returns
 */
function setSgItemIpamSubnets(
  allVpcResources: (VpcConfig | VpcTemplatesConfig)[],
  sgItem: SecurityGroupConfig,
): string[] {
  const ipamSubnets: string[] = [];

  for (const ruleItem of [...sgItem.inboundRules, ...sgItem.outboundRules]) {
    for (const source of ruleItem.sources) {
      if (NetworkConfigTypes.subnetSourceConfig.is(source)) {
        ipamSubnets.push(...parseSubnetConfigs(allVpcResources, source.vpc, source.account, source.subnets));
      }
    }
  }
  return ipamSubnets;
}

/**
 * Parse individual subnet configurations to determine if they are IPAM subnets
 * @param allVpcResources
 * @param vpcName
 * @param accountName
 * @param subnets
 * @returns
 */
function parseSubnetConfigs(
  allVpcResources: (VpcConfig | VpcTemplatesConfig)[],
  vpcName: string,
  accountName: string,
  subnets: string[],
): string[] {
  const ipamSubnets: string[] = [];

  for (const subnet of subnets) {
    const vpcConfig = getVpcConfig(allVpcResources, vpcName);
    const subnetConfig = getSubnetConfig(vpcConfig, subnet);
    const key = `${vpcConfig.name}_${accountName}_${subnetConfig.name}`;

    if (subnetConfig.ipamAllocation && !ipamSubnets.includes(key)) {
      ipamSubnets.push(key);
    }
  }
  return ipamSubnets;
}

/**
 * Process and set security group ingress rules
 * @param vpcResources
 * @param securityGroupItem
 * @param subnetMap
 * @param prefixListMap
 * @returns
 */
export function processSecurityGroupIngressRules(
  vpcResources: (VpcConfig | VpcTemplatesConfig)[],
  securityGroupItem: SecurityGroupConfig,
  subnetMap: Map<string, Subnet> | Map<string, IIpamSubnet>,
  prefixListMap: Map<string, PrefixList> | Map<string, string>,
) {
  const processedIngressRules: SecurityGroupIngressRuleProps[] = [];

  for (const [ruleId, ingressRuleItem] of securityGroupItem.inboundRules.entries() ?? []) {
    logger.info(`Adding ingress rule ${ruleId} to ${securityGroupItem.name}`);

    const ingressRules: SecurityGroupRuleProps[] = processSecurityGroupRules(
      vpcResources,
      ingressRuleItem,
      subnetMap,
      prefixListMap,
    );
    processedIngressRules.push(...setSecurityGroupIngressRules(ingressRules));
  }
  return processedIngressRules;
}

/**
 * Sets ingress rules based on type
 * @param ingressRules
 * @returns
 */
function setSecurityGroupIngressRules(ingressRules: SecurityGroupRuleProps[]): SecurityGroupIngressRuleProps[] {
  const processedIngressRules: SecurityGroupIngressRuleProps[] = [];
  logger.info(`Adding ${ingressRules.length} ingress rules`);

  for (const ingressRule of ingressRules) {
    if (ingressRule.targetPrefixList) {
      processedIngressRules.push({
        description: ingressRule.description,
        fromPort: ingressRule.fromPort,
        ipProtocol: ingressRule.ipProtocol,
        sourcePrefixListId: ingressRule.targetPrefixList,
        toPort: ingressRule.toPort,
      });
    } else {
      processedIngressRules.push({ ...ingressRule });
    }
  }
  return processedIngressRules;
}

/**
 * Returns true if any ingress rules contain an all ingress rule
 * @param ingressRules
 * @returns
 */
export function containsAllIngressRule(ingressRules: SecurityGroupIngressRuleProps[]): boolean {
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
 * @param vpcResources
 * @param securityGroupItem
 * @param subnetMap
 * @param prefixListMap
 * @returns
 */
export function processSecurityGroupEgressRules(
  vpcResources: (VpcConfig | VpcTemplatesConfig)[],
  securityGroupItem: SecurityGroupConfig,
  subnetMap: Map<string, Subnet> | Map<string, IIpamSubnet>,
  prefixListMap: Map<string, PrefixList> | Map<string, string>,
) {
  const processedEgressRules: SecurityGroupEgressRuleProps[] = [];

  for (const [ruleId, egressRuleItem] of securityGroupItem.outboundRules.entries() ?? []) {
    logger.info(`Adding egress rule ${ruleId} to ${securityGroupItem.name}`);

    const egressRules: SecurityGroupRuleProps[] = processSecurityGroupRules(
      vpcResources,
      egressRuleItem,
      subnetMap,
      prefixListMap,
    );

    processedEgressRules.push(...setSecurityGroupEgressRules(egressRules));
  }
  return processedEgressRules;
}

/**
 * Sets egress rules based on type
 * @param egressRules
 * @returns
 */
function setSecurityGroupEgressRules(egressRules: SecurityGroupRuleProps[]): SecurityGroupEgressRuleProps[] {
  const processedEgressRules: SecurityGroupEgressRuleProps[] = [];
  logger.info(`Adding ${egressRules.length} egress rules`);

  for (const egressRule of egressRules) {
    if (egressRule.targetPrefixList) {
      processedEgressRules.push({
        description: egressRule.description,
        destinationPrefixListId: egressRule.targetPrefixList,
        fromPort: egressRule.fromPort,
        ipProtocol: egressRule.ipProtocol,
        toPort: egressRule.toPort,
      });
    } else {
      processedEgressRules.push({ ...egressRule });
    }
  }
  return processedEgressRules;
}

/**
 * Returns true if any rule contains a security group source
 * @param rule
 * @returns
 */
function includesSecurityGroupSource(rule: SecurityGroupRuleConfig): boolean {
  for (const source of rule.sources) {
    if (NetworkConfigTypes.securityGroupSourceConfig.is(source)) {
      return true;
    }
  }
  return false;
}

/**
 * Create security group ingress rules that reference other security groups
 * @param vpcResources
 * @param vpcItem
 * @param subnetMap
 * @param prefixListMap
 * @param securityGroupMap
 */
export function processSecurityGroupSgIngressSources(
  vpcResources: (VpcConfig | VpcTemplatesConfig)[],
  vpcItem: VpcConfig | VpcTemplatesConfig,
  securityGroupItem: SecurityGroupConfig,
  subnetMap: Map<string, Subnet> | Map<string, IIpamSubnet>,
  prefixListMap: Map<string, PrefixList> | Map<string, string>,
  securityGroupMap: Map<string, SecurityGroup>,
): { logicalId: string; rule: SecurityGroupRuleProps }[] {
  const securityGroupSources: { logicalId: string; rule: SecurityGroupRuleProps }[] = [];

  for (const [ruleId, ingressRuleItem] of securityGroupItem.inboundRules.entries() ?? []) {
    // Add security group sources if they exist
    if (includesSecurityGroupSource(ingressRuleItem)) {
      const ingressRules: SecurityGroupRuleProps[] = processSecurityGroupRules(
        vpcResources,
        ingressRuleItem,
        subnetMap,
        prefixListMap,
        securityGroupMap,
        vpcItem.name,
      );
      securityGroupSources.push(...setSecurityGroupSgIngressSources(securityGroupItem, ingressRules, ruleId));
    }
  }
  return securityGroupSources;
}

/**
 * Sets ingress rules for security group sources
 * @param ingressRules
 * @returns
 */
function setSecurityGroupSgIngressSources(
  securityGroupItem: SecurityGroupConfig,
  ingressRules: SecurityGroupRuleProps[],
  ruleId: number,
): { logicalId: string; rule: SecurityGroupRuleProps }[] {
  const securityGroupSources: { logicalId: string; rule: SecurityGroupRuleProps }[] = [];

  for (const [ingressRuleIndex, ingressRule] of ingressRules.entries()) {
    if (ingressRule.targetSecurityGroup) {
      securityGroupSources.push({
        logicalId: `${securityGroupItem.name}-Ingress-${ruleId}-${ingressRuleIndex}`,
        rule: ingressRule,
      });
    }
  }
  return securityGroupSources;
}

/**
 * Create security group egress rules that reference other security groups
 * @param vpcResources
 * @param vpcItem
 * @param subnetMap
 * @param prefixListMap
 * @param securityGroupMap
 */
export function processSecurityGroupSgEgressSources(
  vpcResources: (VpcConfig | VpcTemplatesConfig)[],
  vpcItem: VpcConfig | VpcTemplatesConfig,
  securityGroupItem: SecurityGroupConfig,
  subnetMap: Map<string, Subnet> | Map<string, IIpamSubnet>,
  prefixListMap: Map<string, PrefixList> | Map<string, string>,
  securityGroupMap: Map<string, SecurityGroup>,
): { logicalId: string; rule: SecurityGroupRuleProps }[] {
  const securityGroupSources: { logicalId: string; rule: SecurityGroupRuleProps }[] = [];

  for (const [ruleId, egressRuleItem] of securityGroupItem.outboundRules.entries() ?? []) {
    // Add security group sources if they exist
    if (includesSecurityGroupSource(egressRuleItem)) {
      const egressRules: SecurityGroupRuleProps[] = processSecurityGroupRules(
        vpcResources,
        egressRuleItem,
        subnetMap,
        prefixListMap,
        securityGroupMap,
        vpcItem.name,
      );
      securityGroupSources.push(...setSecurityGroupSgEgressSources(securityGroupItem, egressRules, ruleId));
    }
  }
  return securityGroupSources;
}

/**
 * Set egress rules for security group sources
 * @param securityGroupItem
 * @param egressRules
 * @param ruleId
 * @returns
 */
function setSecurityGroupSgEgressSources(
  securityGroupItem: SecurityGroupConfig,
  egressRules: SecurityGroupRuleProps[],
  ruleId: number,
): { logicalId: string; rule: SecurityGroupRuleProps }[] {
  const securityGroupSources: { logicalId: string; rule: SecurityGroupRuleProps }[] = [];

  for (const [egressRuleIndex, egressRule] of egressRules.entries()) {
    if (egressRule.targetSecurityGroup) {
      securityGroupSources.push({
        logicalId: `${securityGroupItem.name}-Egress-${ruleId}-${egressRuleIndex}`,
        rule: egressRule,
      });
    }
  }
  return securityGroupSources;
}

/**
 * Process security group rules based on configured type
 * @param vpcResources
 * @param item
 * @param subnetMap
 * @param prefixListMap
 * @param securityGroupMap
 * @returns
 */
function processSecurityGroupRules(
  vpcResources: (VpcConfig | VpcTemplatesConfig)[],
  item: SecurityGroupRuleConfig,
  subnetMap: Map<string, Subnet> | Map<string, IIpamSubnet>,
  prefixListMap: Map<string, PrefixList> | Map<string, string>,
  securityGroupMap?: Map<string, SecurityGroup>,
  vpcName?: string,
): SecurityGroupRuleProps[] {
  const rules: SecurityGroupRuleProps[] = [];

  if (!item.types) {
    rules.push(
      ...processTcpSources(vpcResources, item, subnetMap, prefixListMap, securityGroupMap, vpcName),
      ...processUdpSources(vpcResources, item, subnetMap, prefixListMap, securityGroupMap, vpcName),
    );
  } else {
    rules.push(...processTypeSources(vpcResources, item, subnetMap, prefixListMap, securityGroupMap, vpcName));
  }
  return rules;
}

/**
 * Process TCP ports for security group rules
 * @param vpcResources
 * @param securityGroupRuleItem
 * @param subnetMap
 * @param prefixListMap
 * @param securityGroupMap
 * @param vpcName
 * @returns
 */
function processTcpSources(
  vpcResources: (VpcConfig | VpcTemplatesConfig)[],
  securityGroupRuleItem: SecurityGroupRuleConfig,
  subnetMap: Map<string, Subnet> | Map<string, IIpamSubnet>,
  prefixListMap: Map<string, PrefixList> | Map<string, string>,
  securityGroupMap?: Map<string, SecurityGroup>,
  vpcName?: string,
): SecurityGroupRuleProps[] {
  const tcpRules: SecurityGroupRuleProps[] = [];

  for (const tcpPort of securityGroupRuleItem.tcpPorts ?? []) {
    logger.info(`Evaluate TCP Port ${tcpPort}`);
    tcpRules.push(
      ...processSecurityGroupRuleSources(
        vpcResources,
        securityGroupRuleItem.sources,
        subnetMap,
        prefixListMap,
        {
          ipProtocol: cdk.aws_ec2.Protocol.TCP,
          fromPort: tcpPort,
          toPort: tcpPort,
          description: securityGroupRuleItem.description,
        },
        securityGroupMap,
        vpcName,
      ),
    );
  }
  return tcpRules;
}

/**
 * Process UDP ports for security group rules
 * @param vpcResources
 * @param securityGroupRuleItem
 * @param subnetMap
 * @param prefixListMap
 * @param securityGroupMap
 * @param vpcName
 * @returns
 */
function processUdpSources(
  vpcResources: (VpcConfig | VpcTemplatesConfig)[],
  securityGroupRuleItem: SecurityGroupRuleConfig,
  subnetMap: Map<string, Subnet> | Map<string, IIpamSubnet>,
  prefixListMap: Map<string, PrefixList> | Map<string, string>,
  securityGroupMap?: Map<string, SecurityGroup>,
  vpcName?: string,
): SecurityGroupRuleProps[] {
  const udpRules: SecurityGroupRuleProps[] = [];

  for (const udpPort of securityGroupRuleItem.udpPorts ?? []) {
    logger.info(`Evaluate UDP Port ${udpPort}`);
    udpRules.push(
      ...processSecurityGroupRuleSources(
        vpcResources,
        securityGroupRuleItem.sources,
        subnetMap,
        prefixListMap,
        {
          ipProtocol: cdk.aws_ec2.Protocol.UDP,
          fromPort: udpPort,
          toPort: udpPort,
          description: securityGroupRuleItem.description,
        },
        securityGroupMap,
        vpcName,
      ),
    );
  }
  return udpRules;
}

/**
 * Process security group rules based on configured type
 * @param vpcResources
 * @param securityGroupRuleItem
 * @param subnetMap
 * @param prefixListMap
 * @param securityGroupMap
 * @param vpcName
 * @returns
 */
function processTypeSources(
  vpcResources: (VpcConfig | VpcTemplatesConfig)[],
  securityGroupRuleItem: SecurityGroupRuleConfig,
  subnetMap: Map<string, Subnet> | Map<string, IIpamSubnet>,
  prefixListMap: Map<string, PrefixList> | Map<string, string>,
  securityGroupMap?: Map<string, SecurityGroup>,
  vpcName?: string,
): SecurityGroupRuleProps[] {
  const typeRules: SecurityGroupRuleProps[] = [];

  for (const type of securityGroupRuleItem.types ?? []) {
    logger.info(`Evaluate Type ${type}`);
    if (type === 'ALL') {
      typeRules.push(
        ...processSecurityGroupRuleSources(
          vpcResources,
          securityGroupRuleItem.sources,
          subnetMap,
          prefixListMap,
          {
            ipProtocol: cdk.aws_ec2.Protocol.ALL,
            description: securityGroupRuleItem.description,
          },
          securityGroupMap,
          vpcName,
        ),
      );
    } else if (Object.keys(TCP_PROTOCOLS_PORT).includes(type)) {
      typeRules.push(
        ...processSecurityGroupRuleSources(
          vpcResources,
          securityGroupRuleItem.sources,
          subnetMap,
          prefixListMap,
          {
            ipProtocol: cdk.aws_ec2.Protocol.TCP,
            fromPort: TCP_PROTOCOLS_PORT[type],
            toPort: TCP_PROTOCOLS_PORT[type],
            description: securityGroupRuleItem.description,
          },
          securityGroupMap,
          vpcName,
        ),
      );
    } else {
      typeRules.push(
        ...processSecurityGroupRuleSources(
          vpcResources,
          securityGroupRuleItem.sources,
          subnetMap,
          prefixListMap,
          {
            ipProtocol: type,
            fromPort: securityGroupRuleItem.fromPort,
            toPort: securityGroupRuleItem.toPort,
            description: securityGroupRuleItem.description,
          },
          securityGroupMap,
          vpcName,
        ),
      );
    }
  }
  return typeRules;
}

/**
 * Processes individual security group source references.
 * @param vpcResources
 * @param sources
 * @param subnetMap
 * @param prefixListMap
 * @param securityGroupMap
 * @param props
 * @returns
 */
function processSecurityGroupRuleSources(
  vpcResources: (VpcConfig | VpcTemplatesConfig)[],
  sources: string[] | SecurityGroupSourceConfig[] | PrefixListSourceConfig[] | SubnetSourceConfig[],
  subnetMap: Map<string, Subnet> | Map<string, IIpamSubnet>,
  prefixListMap: Map<string, PrefixList> | Map<string, string>,
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
        rules.push(processIpSource(source, props));
      }
      //
      // Subnet source
      //
      if (NetworkConfigTypes.subnetSourceConfig.is(source)) {
        rules.push(...processSubnetSource(vpcResources, subnetMap, source, props));
      }
      //
      // Prefix List Source
      //
      if (NetworkConfigTypes.prefixListSourceConfig.is(source)) {
        rules.push(...processPrefixListSource(prefixListMap, source, props));
      }
    } else {
      //
      // Security Group Source
      //
      if (NetworkConfigTypes.securityGroupSourceConfig.is(source) && vpcName) {
        rules.push(...processSecurityGroupSource(securityGroupMap, vpcName, source, props));
      }
    }
  }
  return rules;
}

/**
 * Process IP address source
 * @param source
 * @param props
 * @returns
 */
function processIpSource(
  source: string,
  props: { ipProtocol: string; fromPort?: number; toPort?: number; description?: string },
): SecurityGroupRuleProps {
  logger.info(`Evaluate IP Source ${source}`);
  if (source.includes('::')) {
    return {
      cidrIpv6: source,
      ...props,
    };
  }
  return {
    cidrIp: source,
    ...props,
  };
}

/**
 * Process Subnet source
 * @param vpcResources
 * @param subnetMap
 * @param source
 * @param props
 * @returns
 */
function processSubnetSource(
  vpcResources: (VpcConfig | VpcTemplatesConfig)[],
  subnetMap: Map<string, Subnet> | Map<string, IIpamSubnet>,
  source: SubnetSourceConfig,
  props: { ipProtocol: string; fromPort?: number; toPort?: number; description?: string },
): SecurityGroupRuleProps[] {
  const subnetRules: SecurityGroupRuleProps[] = [];
  logger.info(`Evaluate Subnet Source account:${source.account} vpc:${source.vpc} subnets:[${source.subnets}]`);

  // Locate the VPC
  const vpcItem = getVpcConfig(vpcResources, source.vpc);

  for (const subnet of source.subnets) {
    // Locate the Subnet
    const subnetConfigItem = getSubnetConfig(vpcItem, subnet);

    if (subnetConfigItem.ipamAllocation) {
      const subnetItem = getSubnet(subnetMap, vpcItem.name, subnetConfigItem.name);
      subnetRules.push({
        cidrIp: subnetItem.ipv4CidrBlock,
        ...props,
      });
    } else {
      subnetRules.push({
        cidrIp: subnetConfigItem.ipv4CidrBlock,
        ...props,
      });
    }
  }
  return subnetRules;
}

/**
 * Process Prefix List source
 * @param prefixListMap
 * @param source
 * @param props
 * @returns
 */
function processPrefixListSource(
  prefixListMap: Map<string, PrefixList> | Map<string, string>,
  source: PrefixListSourceConfig,
  props: { ipProtocol: string; fromPort?: number; toPort?: number; description?: string },
): SecurityGroupRuleProps[] {
  const prefixListRules: SecurityGroupRuleProps[] = [];
  logger.info(`Evaluate Prefix List Source prefixLists:[${source.prefixLists}]`);

  for (const prefixList of source.prefixLists ?? []) {
    const targetPrefixList = getPrefixList(prefixListMap, prefixList);
    prefixListRules.push({
      targetPrefixList: typeof targetPrefixList === 'string' ? targetPrefixList : targetPrefixList.prefixListId,
      ...props,
    });
  }
  return prefixListRules;
}

/**
 * Process Security Group source
 * @param securityGroupMap
 * @param source
 * @param props
 */
function processSecurityGroupSource(
  securityGroupMap: Map<string, SecurityGroup>,
  vpcName: string,
  source: SecurityGroupSourceConfig,
  props: {
    ipProtocol: string;
    fromPort?: number;
    toPort?: number;
    description?: string;
  },
): SecurityGroupRuleProps[] {
  const sgRules: SecurityGroupRuleProps[] = [];
  logger.info(`Evaluate Security Group Source securityGroups:[${source.securityGroups}]`);

  for (const securityGroup of source.securityGroups ?? []) {
    const targetSecurityGroup = getSecurityGroup(securityGroupMap, vpcName, securityGroup) as SecurityGroup;
    sgRules.push({
      targetSecurityGroup,
      ...props,
    });
  }
  return sgRules;
}
