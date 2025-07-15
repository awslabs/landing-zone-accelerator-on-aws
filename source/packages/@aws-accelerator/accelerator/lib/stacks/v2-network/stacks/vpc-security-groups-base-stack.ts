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

import * as cdk from 'aws-cdk-lib';
import { pascalCase } from 'pascal-case';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import { AcceleratorStack } from '../../accelerator-stack';
import {
  SecurityGroupSourceDetailsType,
  V2NetworkStacksBaseProps,
  V2SecurityGroupEgressRuleProps,
  V2SecurityGroupIngressRuleProps,
} from '../utils/types';
import { VpcDetails } from '../constructs/vpc-details';
import {
  PrefixListConfig,
  PrefixListSourceConfig,
  SecurityGroupConfig,
  SecurityGroupRuleConfig,
  SecurityGroupSourceConfig,
  SubnetSourceConfig,
} from '@aws-accelerator/config/lib/network-config';
import { SsmResourceType } from '@aws-accelerator/utils/lib/ssm-parameter-path';
import { NetworkStackGeneration, SecurityGroupRules, V2StackComponentsList } from '../utils/enums';
import { isNetworkType } from '@aws-accelerator/config/lib/common/parse';
import { NonEmptyString } from '@aws-accelerator/config/lib/common/types';
import { isIpv6Cidr } from '../../network-stacks/utils/validation-utils';
import {
  SecurityGroupEgressRuleProps,
  SecurityGroupIngressRuleProps,
} from '@aws-accelerator/constructs/lib/aws-ec2/vpc';
import { TCP_PROTOCOLS_PORT } from '../../network-stacks/utils/security-group-utils';
import { isV2Resource } from '../utils/functions';
import { MetadataKeys } from '@aws-accelerator/utils/lib/common-types';

interface SecurityGroupCache {
  vpcName: string;
  securityGroupName: string;
  securityGroupId: string;
}

export class VpcSecurityGroupsBaseStack extends AcceleratorStack {
  private v2StackProps: V2NetworkStacksBaseProps;
  private vpcDetails: VpcDetails;
  private vpcId: string;
  private securityGroupCache: SecurityGroupCache[] = [];
  constructor(scope: Construct, id: string, props: V2NetworkStacksBaseProps) {
    super(scope, id, props);

    //
    // Add Stack metadata
    //
    this.addMetadata(MetadataKeys.LZA_LOOKUP, {
      accountName: this.props.accountsConfig.getAccountNameById(this.account),
      region: cdk.Stack.of(this).region,
      stackGeneration: NetworkStackGeneration.V2,
    });

    this.v2StackProps = props;
    this.vpcDetails = new VpcDetails(this, 'VpcDetails', props);
    this.vpcId = this.vpcDetails.id!;

    //
    // Create Security groups
    //
    this.createSecurityGroups();

    //
    // Create SSM Parameters
    //
    this.createSsmParameters();
  }

  private createSecurityGroups(): void {
    for (const securityGroupItem of this.vpcDetails.securityGroups) {
      const ingressRules = this.getIngressRules(securityGroupItem);
      const egressRules = this.getEgressRules(securityGroupItem);

      const securityGroupId = this.getSecurityGroupId(securityGroupItem, ingressRules, egressRules);

      const securityGroupSourcesIngressRules = this.getSecurityGroupSourcesIngressRules(securityGroupItem);
      const securityGroupSourcesEgressRules = this.getSecurityGroupSourcesEgressRules(securityGroupItem);

      this.addSecurityGroupRules(
        securityGroupItem.name,
        securityGroupId,
        securityGroupSourcesIngressRules,
        securityGroupSourcesEgressRules,
      );
    }
  }

  /**
   * Function to get Security group id
   * @param securityGroupItem {@link SecurityGroupConfig}
   * @param ingressRules {@link SecurityGroupIngressRuleProps}[]
   * @param egressRules {@link SecurityGroupEgressRuleProps}[]
   * @returns
   */
  private getSecurityGroupId(
    securityGroupItem: SecurityGroupConfig,
    ingressRules: SecurityGroupIngressRuleProps[],
    egressRules: SecurityGroupEgressRuleProps[],
  ): string {
    if (
      isV2Resource(
        this.v2StackProps.v2NetworkResources,
        this.vpcDetails.name,
        V2StackComponentsList.SECURITY_GROUP,
        securityGroupItem.name,
      )
    ) {
      return this.createSecurityGroup(securityGroupItem, ingressRules, egressRules);
    }

    this.logger.info(`Using existing security group for ${securityGroupItem.name}`);
    const securityGroupId = cdk.aws_ssm.StringParameter.valueForStringParameter(
      this,
      this.getSsmPath(SsmResourceType.SECURITY_GROUP, [this.vpcDetails.name, securityGroupItem.name]),
    );

    // Add to cache
    this.securityGroupCache.push({
      vpcName: this.vpcDetails.name,
      securityGroupName: securityGroupItem.name,
      securityGroupId,
    });

    return securityGroupId;
  }

  /**
   * Function to create Security group
   * @param securityGroupItem {@link SecurityGroupConfig}
   * @param ingressRules {@link SecurityGroupIngressRuleProps}[]
   * @param egressRules {@link SecurityGroupEgressRuleProps}[]
   * @returns securityGroupId string
   */
  private createSecurityGroup(
    securityGroupItem: SecurityGroupConfig,
    ingressRules: SecurityGroupIngressRuleProps[],
    egressRules: SecurityGroupEgressRuleProps[],
  ): string {
    const allIngressRule = this.containsAllIngressRule(ingressRules);
    const cfnSecurityGroup = new cdk.aws_ec2.CfnSecurityGroup(
      this,
      pascalCase(`${this.vpcDetails.name}Vpc`) + pascalCase(`${securityGroupItem.name}Sg`),
      {
        groupDescription: securityGroupItem.description ?? '',
        securityGroupEgress: egressRules,
        securityGroupIngress: ingressRules,
        groupName: securityGroupItem.name,
        vpcId: this.vpcId,
        tags: [{ key: 'Name', value: securityGroupItem.name }, ...(securityGroupItem.tags ?? [])],
      },
    );

    const securityGroupId = cfnSecurityGroup.ref;

    // Add to cache
    this.securityGroupCache.push({
      vpcName: this.vpcDetails.name,
      securityGroupName: securityGroupItem.name,
      securityGroupId,
    });

    this.addSsmParameter({
      logicalId: pascalCase(
        `SsmParam${pascalCase(this.vpcDetails.name) + pascalCase(securityGroupItem.name)}SecurityGroup`,
      ),
      parameterName: this.getSsmPath(SsmResourceType.SECURITY_GROUP, [this.vpcDetails.name, securityGroupItem.name]),
      stringValue: securityGroupId,
    });

    // AwsSolutions-EC23: The Security Group allows for 0.0.0.0/0 or ::/0 inbound access.
    if (allIngressRule) {
      NagSuppressions.addResourceSuppressions(cfnSecurityGroup, [
        { id: 'AwsSolutions-EC23', reason: `User defined an all ${SecurityGroupRules.INGRESS} rule in configuration.` },
      ]);
    }

    cfnSecurityGroup.addMetadata(MetadataKeys.LZA_LOOKUP, {
      resourceType: V2StackComponentsList.SECURITY_GROUP,
      vpcName: this.vpcDetails.name,
      securityGroupName: securityGroupItem.name,
    });

    return securityGroupId;
  }

  /**
   * Function to get prefix list targets
   * @param prefixListItem {@link PrefixListConfig}
   * @returns
   */
  private getPrefixListTargets(prefixListItem: PrefixListConfig): { accountIds: string[]; regions: string[] } {
    // Check if the set belongs in this account/region
    if (prefixListItem.accounts && prefixListItem.deploymentTargets) {
      this.logger.error(
        `prefix list ${prefixListItem.name} has both accounts and deploymentTargets defined. Please use deploymentTargets only.`,
      );
      throw new Error(`Configuration validation failed at runtime.`);
    }

    const accountIds = [];
    const regions = [];
    if (prefixListItem.accounts && prefixListItem.regions) {
      // Check if the set belongs in this account/region
      accountIds.push(
        ...prefixListItem.accounts.map(item => {
          return this.props.accountsConfig.getAccountId(item);
        }),
      );
      regions.push(
        ...prefixListItem.regions.map(item => {
          return item.toString();
        }),
      );
    }
    if (prefixListItem.deploymentTargets) {
      accountIds.push(...this.getAccountIdsFromDeploymentTargets(prefixListItem.deploymentTargets));
      regions.push(...this.getRegionsFromDeploymentTarget(prefixListItem.deploymentTargets));
    }
    if (accountIds.length === 0) {
      throw new Error(`No account targets specified for prefix list ${prefixListItem.name}`);
    }
    if (regions.length === 0) {
      throw new Error(`No region targets specified for prefix list ${prefixListItem.name}`);
    }

    return { accountIds, regions };
  }

  /**
   * Function to get subnet type source cidrs
   * @param securityGroupItem {@link SecurityGroupConfig}
   * @param source {@link SubnetSourceConfig}
   * @returns
   */
  private getSubnetTypeSourceCidrs(
    securityGroupItem: SecurityGroupConfig,
    source: SubnetSourceConfig,
  ): SecurityGroupSourceDetailsType[] {
    const securityGroupSourceDetails: SecurityGroupSourceDetailsType[] = [];
    this.logger.info(`Evaluate Subnet Source account:${source.account} vpc:${source.vpc} subnets:[${source.subnets}]`);
    // Locate the VPC
    const vpcItem = this.props.networkConfig.vpcs.find(
      vpcConfig => vpcConfig.account === source.account && vpcConfig.name === source.vpc,
    );

    if (!vpcItem) {
      this.logger.error(
        `SecurityGroup ${securityGroupItem.name} source vpc ${source.vpc} not found in network config.`,
      );
      throw new Error(
        `Configuration validation failed at runtime. SecurityGroup ${securityGroupItem.name} source vpc ${source.vpc} not found in network config.`,
      );
    }
    for (const subnetName of source.subnets) {
      // Locate the Subnet
      const subnetConfigItem = vpcItem.subnets?.find(subnetConfig => subnetConfig.name === subnetName);

      if (!subnetConfigItem) {
        this.logger.error(
          `SecurityGroup ${securityGroupItem.name} source subnet ${subnetName} for vpc ${source.vpc} not found in network config.`,
        );
        throw new Error(
          `Configuration validation failed at runtime. SecurityGroup ${securityGroupItem.name} source subnet ${subnetName} for vpc ${source.vpc} not found in network config.`,
        );
      }

      if (subnetConfigItem.ipamAllocation) {
        securityGroupSourceDetails.push({
          cidrIp: cdk.aws_ssm.StringParameter.valueForStringParameter(
            this,
            this.getSsmPath(SsmResourceType.SUBNET_IPV4_CIDR_BLOCK, [source.vpc, subnetName]),
          ),
        });
      } else {
        source.ipv6
          ? securityGroupSourceDetails.push({ cidrIpv6: subnetConfigItem.ipv6CidrBlock })
          : securityGroupSourceDetails.push({ cidrIp: subnetConfigItem.ipv4CidrBlock });
      }
    }

    return securityGroupSourceDetails;
  }

  /**
   * Function to get prefix list type source ids
   * @param securityGroupItem {@link SecurityGroupConfig}
   * @param source {@link PrefixListSourceConfig}
   * @param type {@link SecurityGroupRules}
   * @returns
   */
  private getPrefixListTypeSourceIds(
    securityGroupItem: SecurityGroupConfig,
    source: PrefixListSourceConfig,
    type: SecurityGroupRules,
  ): SecurityGroupSourceDetailsType[] {
    const securityGroupSourceDetails: SecurityGroupSourceDetailsType[] = [];
    this.logger.info(`Evaluate Prefix List Source prefixLists:[${source.prefixLists}]`);
    const prefixLists = this.props.networkConfig.prefixLists ?? [];
    if (prefixLists.length < 1) {
      this.logger.error(
        `SecurityGroup ${securityGroupItem.name} source prefix list ${source.prefixLists} not found in network config.`,
      );
      throw new Error(
        `Configuration validation failed at runtime. SecurityGroup ${securityGroupItem.name} source prefix list ${source.prefixLists} not found in network config.`,
      );
    }

    for (const prefixList of source.prefixLists ?? []) {
      const prefixListItem = prefixLists.find(item => item.name === prefixList);

      if (!prefixListItem) {
        this.logger.error(
          `SecurityGroup ${securityGroupItem.name} source prefix list ${prefixList} not found in network config.`,
        );
        throw new Error(
          `Configuration validation failed at runtime. SecurityGroup ${securityGroupItem.name} source prefix list ${prefixList} not found in network config.`,
        );
      }

      const prefixListTargets = this.getPrefixListTargets(prefixListItem);
      // Check for cross account/region prefix
      if (
        prefixListTargets.accountIds.indexOf(cdk.Stack.of(this).account) === -1 ||
        prefixListTargets.regions.indexOf(cdk.Stack.of(this).region) === -1
      ) {
        this.logger.error(
          `SecurityGroup ${securityGroupItem.name} source prefix list ${prefixList} is not in the target account/region.`,
        );
        throw new Error(
          `Configuration validation failed at runtime. SecurityGroup ${securityGroupItem.name} source prefix list ${prefixList} is not in the target account/region.`,
        );
      } else {
        securityGroupSourceDetails.push(
          type === SecurityGroupRules.INGRESS
            ? {
                sourcePrefixListId: cdk.aws_ssm.StringParameter.valueForStringParameter(
                  this,
                  this.getSsmPath(SsmResourceType.PREFIX_LIST, [prefixListItem.name]),
                ),
              }
            : {
                destinationPrefixListId: cdk.aws_ssm.StringParameter.valueForStringParameter(
                  this,
                  this.getSsmPath(SsmResourceType.PREFIX_LIST, [prefixListItem.name]),
                ),
              },
        );
      }
    }

    return securityGroupSourceDetails;
  }

  /**
   * Function to get non security group source details
   * @param securityGroupItem {@link SecurityGroupConfig}
   * @param source {@link NonEmptyString} | {@link PrefixListSourceConfig} | {@link SubnetSourceConfig}
   * @param type {@link SecurityGroupRules}
   * @returns
   */
  private getNonSecurityGroupSourceDetails(
    securityGroupItem: SecurityGroupConfig,
    source: string | PrefixListSourceConfig | SubnetSourceConfig,
    type: SecurityGroupRules,
  ): SecurityGroupSourceDetailsType[] {
    const securityGroupSourceDetails: SecurityGroupSourceDetailsType[] = [];

    //
    // IP source
    //
    if (isNetworkType<NonEmptyString>('NonEmptyString', source)) {
      this.logger.info(`Evaluate IP Source ${source}`);
      if (isIpv6Cidr(source)) {
        securityGroupSourceDetails.push({ cidrIpv6: source });
      } else {
        securityGroupSourceDetails.push({ cidrIp: source });
      }
    }

    //
    // Subnet source
    //
    if (isNetworkType<SubnetSourceConfig>('ISubnetSourceConfig', source)) {
      securityGroupSourceDetails.push(...this.getSubnetTypeSourceCidrs(securityGroupItem, source));
    }

    //
    // Prefix List Source
    //
    if (isNetworkType<PrefixListSourceConfig>('IPrefixListSourceConfig', source)) {
      securityGroupSourceDetails.push(...this.getPrefixListTypeSourceIds(securityGroupItem, source, type));
    }

    return securityGroupSourceDetails;
  }

  /**
   * Function to get IP protocols security groups rules
   * @param securityGroupRuleItem {@link SecurityGroupRuleConfig}
   * @param sourceDetails {@link SecurityGroupSourceDetailsType}[]
   * @returns
   */
  private getIpProtocolsSecurityGroupRules(
    securityGroupRuleItem: SecurityGroupRuleConfig,
    sourceDetails: SecurityGroupSourceDetailsType[],
  ): SecurityGroupIngressRuleProps[] | SecurityGroupEgressRuleProps[] {
    const rules: SecurityGroupIngressRuleProps[] | SecurityGroupEgressRuleProps[] = [];
    for (const ipProtocol of securityGroupRuleItem.ipProtocols ?? []) {
      rules.push(
        ...this.getSecurityGroupRulesBySourceCiders(securityGroupRuleItem, sourceDetails, {
          ipProtocol: cdk.aws_ec2.Protocol[ipProtocol as keyof typeof cdk.aws_ec2.Protocol],
          fromPort: securityGroupRuleItem.fromPort,
          toPort: securityGroupRuleItem.toPort,
        }),
      );
    }

    return rules;
  }

  /**
   * Function to get types security group rules
   * @param securityGroupRuleItem {@link SecurityGroupRuleConfig}
   * @param sourceDetails {@link SecurityGroupSourceDetailsType}[]
   * @returns
   */
  private getTypesSecurityGroupRules(
    securityGroupRuleItem: SecurityGroupRuleConfig,
    sourceDetails: SecurityGroupSourceDetailsType[],
  ): SecurityGroupIngressRuleProps[] | SecurityGroupEgressRuleProps[] {
    const rules: SecurityGroupIngressRuleProps[] | SecurityGroupEgressRuleProps[] = [];
    for (const type of securityGroupRuleItem.types ?? []) {
      if (type === 'ALL') {
        rules.push(
          ...this.getSecurityGroupRulesBySourceCiders(securityGroupRuleItem, sourceDetails, {
            ipProtocol: cdk.aws_ec2.Protocol.ALL,
          }),
        );
      } else if (Object.keys(TCP_PROTOCOLS_PORT).includes(type)) {
        rules.push(
          ...this.getSecurityGroupRulesBySourceCiders(securityGroupRuleItem, sourceDetails, {
            ipProtocol: cdk.aws_ec2.Protocol.TCP,
            fromPort: TCP_PROTOCOLS_PORT[type],
            toPort: TCP_PROTOCOLS_PORT[type],
          }),
        );
      } else {
        rules.push(
          ...this.getSecurityGroupRulesBySourceCiders(securityGroupRuleItem, sourceDetails, {
            ipProtocol: type,
            fromPort: securityGroupRuleItem.fromPort,
            toPort: securityGroupRuleItem.toPort,
          }),
        );
      }
    }

    return rules;
  }

  /**
   * Function to get TCP security group rules
   * @param securityGroupRuleItem {@link SecurityGroupRuleConfig}
   * @param sourceDetails {@link SecurityGroupSourceDetailsType}[]
   * @returns
   */
  private getTcpSecurityGroupRules(
    securityGroupRuleItem: SecurityGroupRuleConfig,
    sourceDetails: SecurityGroupSourceDetailsType[],
  ): SecurityGroupIngressRuleProps[] | SecurityGroupEgressRuleProps[] {
    const rules: SecurityGroupIngressRuleProps[] | SecurityGroupEgressRuleProps[] = [];
    for (const tcpPort of securityGroupRuleItem.tcpPorts ?? []) {
      rules.push(
        ...this.getSecurityGroupRulesBySourceCiders(securityGroupRuleItem, sourceDetails, {
          ipProtocol: cdk.aws_ec2.Protocol.TCP,
          fromPort: tcpPort,
          toPort: tcpPort,
        }),
      );
    }

    return rules;
  }

  /**
   * Function to get UDP security group rules
   * @param securityGroupRuleItem {@link SecurityGroupRuleConfig}
   * @param sourceCidrs {@link SecurityGroupSourceDetailsType}[]
   * @returns
   */
  private getUdpSecurityGroupRules(
    securityGroupRuleItem: SecurityGroupRuleConfig,
    sourceCidrs: SecurityGroupSourceDetailsType[],
  ): SecurityGroupIngressRuleProps[] | SecurityGroupEgressRuleProps[] {
    const rules: SecurityGroupIngressRuleProps[] | SecurityGroupEgressRuleProps[] = [];
    for (const udpPort of securityGroupRuleItem.udpPorts ?? []) {
      rules.push(
        ...this.getSecurityGroupRulesBySourceCiders(securityGroupRuleItem, sourceCidrs, {
          ipProtocol: cdk.aws_ec2.Protocol.UDP,
          fromPort: udpPort,
          toPort: udpPort,
        }),
      );
    }

    return rules;
  }

  /**
   * Function to get security group rules by source cidrs
   * @param securityGroupRuleItem {@link SecurityGroupRuleConfig}
   * @param sourceDetails {@link SecurityGroupSourceDetailsType}[]
   * @param props {@link SecurityGroupRuleProps}
   * @returns
   */
  private getSecurityGroupRulesBySourceCiders(
    securityGroupRuleItem: SecurityGroupRuleConfig,
    sourceDetails: SecurityGroupSourceDetailsType[],
    props: {
      ipProtocol: string;
      fromPort?: number;
      toPort?: number;
    },
  ): SecurityGroupIngressRuleProps[] | SecurityGroupEgressRuleProps[] {
    const rules: SecurityGroupIngressRuleProps[] | SecurityGroupEgressRuleProps[] = [];
    for (const sourceDetail of sourceDetails) {
      if (props.fromPort && props.toPort) {
        const rule: SecurityGroupIngressRuleProps | SecurityGroupEgressRuleProps = {
          description: securityGroupRuleItem.description,
          ipProtocol: props.ipProtocol,
          fromPort: props.fromPort,
          toPort: props.toPort,
          ...sourceDetail,
        };
        rules.push(rule);
      } else {
        const rule: SecurityGroupIngressRuleProps | SecurityGroupEgressRuleProps = {
          description: securityGroupRuleItem.description,
          ipProtocol: props.ipProtocol,
          ...sourceDetail,
        };
        rules.push(rule);
      }
    }

    return rules;
  }

  /**
   * Function to get security group rules by source cidrs
   * @param securityGroupRuleItem {@link SecurityGroupRuleConfig}
   * @param sourceCidrs {@link SecurityGroupSourceDetailsType}[]
   * @param props {@link SecurityGroupRuleProps}
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
   * Function to get security group rules by source cidrs
   * @param securityGroupItem {@link SecurityGroupConfig}
   * @returns
   */
  private getIngressRules(securityGroupItem: SecurityGroupConfig): V2SecurityGroupIngressRuleProps[] {
    const rules: V2SecurityGroupIngressRuleProps[] = [];
    this.logger.info(`Processing rules for ${securityGroupItem.name} in VPC ${this.vpcDetails.name}`);
    for (const [ruleId, ingressRuleItem] of securityGroupItem.inboundRules.entries() ?? []) {
      this.logger.info(`Adding ${SecurityGroupRules.INGRESS} rule ${ruleId} to ${securityGroupItem.name}`);

      const sourceDetails: SecurityGroupSourceDetailsType[] = [];
      for (const source of ingressRuleItem.sources ?? []) {
        if (!isNetworkType<SecurityGroupSourceConfig>('ISecurityGroupSourceConfig', source)) {
          sourceDetails.push(
            ...this.getNonSecurityGroupSourceDetails(securityGroupItem, source, SecurityGroupRules.INGRESS),
          );
        }
      }

      // Add IP Protocols rules
      rules.push(...this.getIpProtocolsSecurityGroupRules(ingressRuleItem, sourceDetails));

      // Add Types rules
      rules.push(...this.getTypesSecurityGroupRules(ingressRuleItem, sourceDetails));

      // TCP and UDP ports rules
      rules.push(...this.getTcpSecurityGroupRules(ingressRuleItem, sourceDetails));
      rules.push(...this.getUdpSecurityGroupRules(ingressRuleItem, sourceDetails));
    }

    return rules;
  }

  /**
   * Function to get Egress rules
   * @param securityGroupItem {@link SecurityGroupConfig}
   * @returns
   */
  private getEgressRules(securityGroupItem: SecurityGroupConfig): V2SecurityGroupEgressRuleProps[] {
    const rules: V2SecurityGroupEgressRuleProps[] = [];
    this.logger.info(`Processing rules for ${securityGroupItem.name} in VPC ${this.vpcDetails.name}`);
    for (const [ruleId, egressRuleItem] of securityGroupItem.outboundRules.entries() ?? []) {
      this.logger.info(`Adding ${SecurityGroupRules.EGRESS} rule ${ruleId} to ${securityGroupItem.name}`);

      const sourceDetails: SecurityGroupSourceDetailsType[] = [];
      for (const source of egressRuleItem.sources ?? []) {
        if (!isNetworkType<SecurityGroupSourceConfig>('ISecurityGroupSourceConfig', source)) {
          sourceDetails.push(
            ...this.getNonSecurityGroupSourceDetails(securityGroupItem, source, SecurityGroupRules.EGRESS),
          );
        }
      }

      // Add IP Protocols rules
      rules.push(...this.getIpProtocolsSecurityGroupRules(egressRuleItem, sourceDetails));

      // Add Types rules
      rules.push(...this.getTypesSecurityGroupRules(egressRuleItem, sourceDetails));

      // TCP and UDP ports rules
      rules.push(...this.getTcpSecurityGroupRules(egressRuleItem, sourceDetails));
      rules.push(...this.getUdpSecurityGroupRules(egressRuleItem, sourceDetails));
    }

    return rules;
  }

  /**
   * Function to generate rule logical id
   * @param securityGroupName string
   * @param ruleIndex number
   * @param type {@link SecurityGroupRules}
   * @param description string | undefined
   * @returns
   */
  private generateRuleLogicalId(
    securityGroupName: string,
    ruleIndex: number,
    type: SecurityGroupRules,
    description?: string,
  ): string {
    return pascalCase(`${this.vpcDetails.name}Vpc${securityGroupName}Sg${type}Rule-${description}-${ruleIndex}`);
  }

  /**
   * Function to get security group type source details
   * @param source {@link SecurityGroupSourceConfig}
   * @returns
   */
  private getSecurityGroupTypeSourceDetails(source: SecurityGroupSourceConfig): SecurityGroupSourceDetailsType[] {
    const sourceDetails: SecurityGroupSourceDetailsType[] = [];
    this.logger.info(`Evaluate Security Group Source securityGroups:[${source.securityGroups}]`);
    for (const securityGroup of source.securityGroups) {
      const sourceSecurityGroupId = this.getSourceSecurityGroupId(this.vpcDetails.name, securityGroup);
      sourceDetails.push({
        destinationSecurityGroupName: securityGroup,
        sourceSecurityGroupId,
      });
    }
    return sourceDetails;
  }

  /**
   * Function to get security group id from cache or SSM parameter
   * @param vpcName string
   * @param securityGroupName string
   * @returns securityGroupId string
   */
  private getSourceSecurityGroupId(vpcName: string, securityGroupName: string): string {
    // Try cache first, then SSM
    const cachedSecurityGroupId = this.securityGroupCache.find(
      item => item.vpcName === vpcName && item.securityGroupName === securityGroupName,
    )?.securityGroupId;

    return (
      cachedSecurityGroupId ??
      cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        this.getSsmPath(SsmResourceType.SECURITY_GROUP, [this.vpcDetails.name, securityGroupName]),
      )
    );
  }

  /**
   * Function to get security group sources ingress rules
   * @param securityGroupItem {@link SecurityGroupConfig}
   * @returns
   */
  private getSecurityGroupSourcesIngressRules(
    securityGroupItem: SecurityGroupConfig,
  ): V2SecurityGroupIngressRuleProps[] {
    const rules: V2SecurityGroupIngressRuleProps[] = [];
    this.logger.info(`Processing rules for ${securityGroupItem.name} in VPC ${this.vpcDetails.name}`);
    for (const [ruleId, ingressRuleItem] of securityGroupItem.inboundRules.entries() ?? []) {
      this.logger.info(`Adding ${SecurityGroupRules.INGRESS} rule ${ruleId} to ${securityGroupItem.name}`);

      const sourceDetails: SecurityGroupSourceDetailsType[] = [];
      for (const source of ingressRuleItem.sources ?? []) {
        if (isNetworkType<SecurityGroupSourceConfig>('ISecurityGroupSourceConfig', source)) {
          sourceDetails.push(...this.getSecurityGroupTypeSourceDetails(source));
        }
      }

      // Add IP Protocols rules
      rules.push(...this.getIpProtocolsSecurityGroupRules(ingressRuleItem, sourceDetails));

      // Add Types rules
      rules.push(...this.getTypesSecurityGroupRules(ingressRuleItem, sourceDetails));

      // TCP and UDP ports rules
      rules.push(...this.getTcpSecurityGroupRules(ingressRuleItem, sourceDetails));
      rules.push(...this.getUdpSecurityGroupRules(ingressRuleItem, sourceDetails));
    }

    return rules;
  }

  /**
   * Function to get security group sources egress rules
   * @param securityGroupItem {@link SecurityGroupConfig}
   * @returns
   */
  private getSecurityGroupSourcesEgressRules(securityGroupItem: SecurityGroupConfig): V2SecurityGroupEgressRuleProps[] {
    const rules: V2SecurityGroupEgressRuleProps[] = [];
    this.logger.info(`Processing rules for ${securityGroupItem.name} in VPC ${this.vpcDetails.name}`);
    for (const [ruleId, egressRuleItem] of securityGroupItem.outboundRules.entries() ?? []) {
      this.logger.info(`Adding ${SecurityGroupRules.EGRESS} rule ${ruleId} to ${securityGroupItem.name}`);

      const sourceDetails: SecurityGroupSourceDetailsType[] = [];
      for (const source of egressRuleItem.sources ?? []) {
        if (isNetworkType<SecurityGroupSourceConfig>('ISecurityGroupSourceConfig', source)) {
          sourceDetails.push(...this.getSecurityGroupTypeSourceDetails(source));
        }
      }

      // Add IP Protocols rules
      rules.push(...this.getIpProtocolsSecurityGroupRules(egressRuleItem, sourceDetails));

      // Add Types rules
      rules.push(...this.getTypesSecurityGroupRules(egressRuleItem, sourceDetails));

      // TCP and UDP ports rules
      rules.push(...this.getTcpSecurityGroupRules(egressRuleItem, sourceDetails));
      rules.push(...this.getUdpSecurityGroupRules(egressRuleItem, sourceDetails));
    }
    return rules;
  }

  /**
   * Function to add security group ingress rules
   * @param securityGroupName string
   * @param securityGroupId string
   * @param rules {@link V2SecurityGroupIngressRuleProps}[]
   */
  private addSecurityGroupIngressRules(
    securityGroupName: string,
    securityGroupId: string,
    rules: V2SecurityGroupIngressRuleProps[],
  ) {
    for (const [ruleIndex, rule] of rules.entries()) {
      if (
        !isV2Resource(
          this.v2StackProps.v2NetworkResources,
          this.vpcDetails.name,
          V2StackComponentsList.SECURITY_GROUP_INBOUND_RULE,
          `${cdk.Stack.of(this).account}|${cdk.Stack.of(this).region}|${this.vpcDetails.name}|${securityGroupName}|${
            rule.destinationSecurityGroupName
          }|${rule.ipProtocol}|${rule.fromPort}|${rule.toPort}`,
        )
      ) {
        continue;
      }

      const logicalId = this.generateRuleLogicalId(
        securityGroupName,
        ruleIndex,
        SecurityGroupRules.INGRESS,
        rule.description,
      );
      this.logger.info(`Adding ${SecurityGroupRules.INGRESS} rule ${logicalId} to ${securityGroupName}`);
      const props: cdk.aws_ec2.CfnSecurityGroupIngressProps = {
        groupId: securityGroupId,
        ipProtocol: rule.ipProtocol,
        sourceSecurityGroupId: rule.sourceSecurityGroup?.securityGroupId,
        description: rule.description,
        fromPort: rule.fromPort,
        toPort: rule.toPort,
      };

      const cfnSecurityGroupIngress = new cdk.aws_ec2.CfnSecurityGroupIngress(this, logicalId, props);
      cfnSecurityGroupIngress.addMetadata(MetadataKeys.LZA_LOOKUP, {
        resourceType: V2StackComponentsList.SECURITY_GROUP_INBOUND_RULE,
        vpcName: this.vpcDetails.name,
        vpcId: this.vpcId,
        securityGroupName,
        protocol: rule.ipProtocol,
        fromPort: rule.fromPort,
        toPort: rule.toPort,
        destinationSecurityGroupName: rule.destinationSecurityGroupName,
        ruleNumber: ruleIndex,
      });
    }
  }

  /**
   * Function to add security group egress rules
   * @param securityGroupName string
   * @param securityGroupId string
   * @param rules {@link V2SecurityGroupEgressRuleProps}[]
   */
  private addSecurityGroupEgressRules(
    securityGroupName: string,
    securityGroupId: string,
    rules: V2SecurityGroupEgressRuleProps[],
  ) {
    for (const [ruleIndex, rule] of rules.entries()) {
      if (
        !isV2Resource(
          this.v2StackProps.v2NetworkResources,
          this.vpcDetails.name,
          V2StackComponentsList.SECURITY_GROUP_OUTBOUND_RULE,
          `${cdk.Stack.of(this).account}|${cdk.Stack.of(this).region}|${this.vpcDetails.name}|${securityGroupName}|${
            rule.destinationSecurityGroupName
          }|${rule.ipProtocol}|${rule.fromPort}|${rule.toPort}`,
        )
      ) {
        continue;
      }

      const logicalId = this.generateRuleLogicalId(
        securityGroupName,
        ruleIndex,
        SecurityGroupRules.EGRESS,
        rule.description,
      );
      this.logger.info(`Adding ${SecurityGroupRules.EGRESS} rule ${logicalId} to ${securityGroupName}`);
      const props: cdk.aws_ec2.CfnSecurityGroupEgressProps = {
        groupId: securityGroupId,
        ipProtocol: rule.ipProtocol,
        destinationSecurityGroupId: rule.destinationSecurityGroup?.securityGroupId,
        description: rule.description,
        fromPort: rule.fromPort,
        toPort: rule.toPort,
      };
      const cfnSecurityGroupEgress = new cdk.aws_ec2.CfnSecurityGroupEgress(this, logicalId, props);

      cfnSecurityGroupEgress.addMetadata(MetadataKeys.LZA_LOOKUP, {
        resourceType: V2StackComponentsList.SECURITY_GROUP_OUTBOUND_RULE,
        vpcName: this.vpcDetails.name,
        vpcId: this.vpcId,
        securityGroupName,
        protocol: rule.ipProtocol,
        fromPort: rule.fromPort,
        toPort: rule.toPort,
        destinationSecurityGroupName: rule.destinationSecurityGroupName,
        ruleNumber: ruleIndex,
      });
    }
  }

  /**
   * Function to add security group rules
   * @param securityGroupName string
   * @param securityGroupId string
   * @param ingressRules {@link V2SecurityGroupIngressRuleProps}[]
   * @param egressRules {@link V2SecurityGroupEgressRuleProps}[]
   */
  private addSecurityGroupRules(
    securityGroupName: string,
    securityGroupId: string,
    ingressRules: V2SecurityGroupIngressRuleProps[],
    egressRules: V2SecurityGroupEgressRuleProps[],
  ): void {
    this.addSecurityGroupIngressRules(securityGroupName, securityGroupId, ingressRules);
    this.addSecurityGroupEgressRules(securityGroupName, securityGroupId, egressRules);
  }
}
