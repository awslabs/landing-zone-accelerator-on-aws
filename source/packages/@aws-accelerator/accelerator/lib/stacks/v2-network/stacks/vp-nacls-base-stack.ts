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
import { NagSuppressions } from 'cdk-nag';
import { pascalCase } from 'pascal-case';
import { Construct } from 'constructs';
import { AcceleratorStack } from '../../accelerator-stack';
import { V2NetworkResourceListType, V2NetworkStacksBaseProps } from '../utils/types';
import { VpcDetails } from '../constructs/vpc-details';
import { isNetworkType } from '@aws-accelerator/config/lib/common/parse';
import { NetworkAclConfig, NetworkAclSubnetSelection } from '@aws-accelerator/config/lib/network-config';
import { NonEmptyString } from '@aws-accelerator/config/lib/common/types';
import { isIpv6Cidr } from '../../network-stacks/utils/validation-utils';
import { SsmResourceType } from '@aws-accelerator/utils/lib/ssm-parameter-path';
import { isV2Resource } from '../utils/functions';
import { V2StackComponentsList } from '../utils/enums';

export class VpcNaclsBaseStack extends AcceleratorStack {
  private v2StackProps: V2NetworkStacksBaseProps;
  private vpcDetails: VpcDetails;
  private vpcId: string;
  constructor(scope: Construct, id: string, props: V2NetworkStacksBaseProps) {
    super(scope, id, props);

    this.v2StackProps = props;
    this.vpcDetails = new VpcDetails(this, 'VpcDetails', this.v2StackProps);
    this.vpcId = this.vpcDetails.id!;

    //
    // Manage NetworkAcls
    //
    this.manageNetworkAcls();

    //
    // Create SSM Parameters
    //
    this.createSsmParameters();
  }

  /**
   * Function to manage Network ACLs
   */
  private manageNetworkAcls(): void {
    for (const networkAcl of this.vpcDetails.networkAcls) {
      const networkAclId = this.getNetworkAclId(networkAcl);
      this.createNetworkAclSubnetAssociations(networkAcl, networkAclId);
      this.createNetworkAclEntries(networkAcl, networkAclId);
    }
  }

  /**
   * Function to get Network ACL Id
   * @param networkAclItem {@link NetworkAclConfig}
   * @returns
   */
  private getNetworkAclId(networkAclItem: NetworkAclConfig): string {
    if (
      isV2Resource(
        this.v2StackProps.v2NetworkResources,
        this.vpcDetails.name,
        V2StackComponentsList.NETWORK_ACL,
        networkAclItem.name,
      )
    ) {
      return this.createNetworkAcl(networkAclItem);
    }

    this.logger.info(`Using existing Network ACL ${networkAclItem.name} for vpc ${this.vpcDetails.name}`);

    return cdk.aws_ssm.StringParameter.valueForStringParameter(
      this,
      this.getSsmPath(SsmResourceType.NACL, [this.vpcDetails.name, networkAclItem.name]),
    );
  }

  /**
   * Function to create Network ACL
   * @param networkAclItem {@link NetworkAclConfig}
   * @returns
   */
  private createNetworkAcl(networkAclItem: NetworkAclConfig): string {
    const cfnNetworkAcl = new cdk.aws_ec2.CfnNetworkAcl(
      this,
      `${pascalCase(this.vpcDetails.name)}Vpc${pascalCase(networkAclItem.name)}Nacl`,
      {
        vpcId: this.vpcId,
        tags: [{ key: 'Name', value: networkAclItem.name }, ...(networkAclItem.tags ?? [])],
      },
    );

    // Suppression for AwsSolutions-VPC3: A Network ACL or Network ACL entry has been implemented.
    NagSuppressions.addResourceSuppressions(
      cfnNetworkAcl,
      [{ id: 'AwsSolutions-VPC3', reason: 'NACL added to VPC' }],
      true,
    );

    const networkAclId = cfnNetworkAcl.ref;

    this.addSsmParameter({
      logicalId: pascalCase(`SsmParam${pascalCase(this.vpcDetails.name)}${pascalCase(networkAclItem.name)}Nacl`),
      parameterName: this.getSsmPath(SsmResourceType.NACL, [this.vpcDetails.name, networkAclItem.name]),
      stringValue: networkAclId,
    });

    return networkAclId;
  }

  /**
   * Function to create Network ACL Subnet Association
   * @param networkAclItem {@link NetworkAclConfig}
   * @param networkAclId string
   */
  private createNetworkAclSubnetAssociations(networkAclItem: NetworkAclConfig, networkAclId: string): void {
    for (const subnetName of networkAclItem.subnetAssociations) {
      if (
        !isV2Resource(
          this.v2StackProps.v2NetworkResources,
          this.vpcDetails.name,
          V2StackComponentsList.NETWORK_ACL_SUBNET_ASSOCIATION,
          `${networkAclItem.name}|${this.vpcDetails.name}|${subnetName}`,
        )
      ) {
        continue;
      }

      new cdk.aws_ec2.CfnSubnetNetworkAclAssociation(
        this,
        `${pascalCase(this.vpcDetails.name)}Vpc${pascalCase(networkAclItem.name)}NaclAssociate${pascalCase(
          subnetName,
        )}`,
        {
          networkAclId,
          subnetId: cdk.aws_ssm.StringParameter.valueForStringParameter(
            this,
            this.getSsmPath(SsmResourceType.SUBNET, [this.vpcDetails.name, subnetName]),
          ),
        },
      );
    }
  }

  /**
   * Function to create Network ACL Entries
   * @param networkAclItem {@link NetworkAclConfig}
   * @param networkAclId string
   */
  private createNetworkAclEntries(networkAclItem: NetworkAclConfig, networkAclId: string): void {
    for (const inboundRuleItem of networkAclItem.inboundRules ?? []) {
      this.createNetworkAclEntry(networkAclItem, networkAclId, inboundRuleItem.source, 'Inbound', {
        protocol: inboundRuleItem.protocol,
        ruleAction: inboundRuleItem.action,
        ruleNumber: inboundRuleItem.rule,
        icmp: inboundRuleItem.icmp,
        portRange: {
          from: inboundRuleItem.fromPort,
          to: inboundRuleItem.toPort,
        },
      });
    }

    for (const outboundRuleItem of networkAclItem.outboundRules ?? []) {
      this.createNetworkAclEntry(networkAclItem, networkAclId, outboundRuleItem.destination, 'Outbound', {
        protocol: outboundRuleItem.protocol,
        ruleAction: outboundRuleItem.action,
        ruleNumber: outboundRuleItem.rule,
        icmp: outboundRuleItem.icmp,
        portRange: {
          from: outboundRuleItem.fromPort,
          to: outboundRuleItem.toPort,
        },
      });
    }
  }

  /**
   * Function to create Network ACL Entry
   * @param networkAclItem {@link NetworkAclConfig}
   * @param networkAclId string
   * @param target string | {@link NetworkAclSubnetSelection}
   * @param type 'Inbound' | 'Outbound'
   * @param props
   */
  private createNetworkAclEntry(
    networkAclItem: NetworkAclConfig,
    networkAclId: string,
    target: string | NetworkAclSubnetSelection,
    type: 'Inbound' | 'Outbound',
    props: {
      protocol: number;
      ruleAction: string;
      ruleNumber: number;
      icmp?:
        | {
            code?: number;
            type?: number;
          }
        | undefined;
      portRange?: cdk.IResolvable | cdk.aws_ec2.CfnNetworkAclEntry.PortRangeProperty | undefined;
    },
  ): void {
    let v2Resource: V2NetworkResourceListType | undefined;
    if (type === 'Inbound') {
      v2Resource = isV2Resource(
        this.v2StackProps.v2NetworkResources,
        this.vpcDetails.name,
        V2StackComponentsList.NETWORK_ACL_INBOUND_ENTRY,
        `${networkAclItem.name}|${this.vpcDetails.name}|${props.ruleNumber}|ingressRule`,
      );
    } else {
      v2Resource = isV2Resource(
        this.v2StackProps.v2NetworkResources,
        this.vpcDetails.name,
        V2StackComponentsList.NETWORK_ACL_OUTBOUND_ENTRY,
        `${networkAclItem.name}|${this.vpcDetails.name}|${props.ruleNumber}|egressRule`,
      );
    }

    if (!this.iNetworkAclSourceCrossAccount(target) && v2Resource) {
      const aclTargetProps: { cidrBlock?: string; ipv6CidrBlock?: string } = this.processNetworkAclTarget(
        networkAclItem,
        target,
        props.ruleNumber,
      );
      this.logger.info(`Create ${type} rule ${props.ruleNumber} for ${networkAclItem.name} to ${target}`);
      const cfnNetworkAclEntry = new cdk.aws_ec2.CfnNetworkAclEntry(
        this,
        `${pascalCase(this.vpcDetails.name)}Vpc${pascalCase(networkAclItem.name)}-${type}-${props.ruleNumber}`,
        {
          egress: type === 'Outbound',
          networkAclId,
          ...props,
          ...aclTargetProps,
        },
      );

      // Suppression for AwsSolutions-VPC3: A Network ACL or Network ACL entry has been implemented.
      NagSuppressions.addResourceSuppressions(
        cfnNetworkAclEntry,
        [{ id: 'AwsSolutions-VPC3', reason: 'NACL entry added to VPC' }],
        true,
      );
    }
  }

  /**
   * Function to check Network ACL entry source or destination has cross account reference
   * @param networkAclItem {@link NetworkAclSubnetSelection}
   * @returns
   */
  public iNetworkAclSourceCrossAccount(networkAclItem: string | NetworkAclSubnetSelection): boolean {
    if (typeof networkAclItem === 'string') {
      return false;
    }
    const accountId = cdk.Stack.of(this).account;
    const naclAccount = networkAclItem.account
      ? this.props.accountsConfig.getAccountId(networkAclItem.account)
      : accountId;
    const region = cdk.Stack.of(this).region;
    const naclRegion = networkAclItem.region;

    const crossAccountCondition = naclRegion
      ? accountId !== naclAccount || region !== naclRegion
      : accountId !== naclAccount;

    if (crossAccountCondition) {
      const targetVpcConfig = this.props.networkConfig.vpcs.find(vpcItem => vpcItem.name === networkAclItem.vpc);
      if (!targetVpcConfig) {
        this.logger.error(`Specified VPC ${networkAclItem.vpc} not defined in network config.`);
        throw new Error(
          `Configuration validation failed at runtime. Specified VPC ${networkAclItem.vpc} not defined in network config`,
        );
      }

      const subnetItem = targetVpcConfig.subnets?.find(item => item.name === networkAclItem.subnet);
      if (!subnetItem) {
        this.logger.error(
          `Specified subnet ${networkAclItem.subnet} not defined for vpc ${targetVpcConfig.name} in network config.`,
        );
        throw new Error(
          `Configuration validation failed at runtime. Specified subnet ${networkAclItem.subnet} not defined for vpc ${targetVpcConfig.name} in network config.`,
        );
      }

      if (subnetItem.ipamAllocation) {
        return true;
      } else {
        return false;
      }
    } else {
      return false;
    }
  }

  /**
   * Function to process Network ACL Rules
   * @param networkAclItem {@link NetworkAclConfig}
   * @param target string | {@link NetworkAclSubnetSelection}
   * @param rule number
   * @returns
   */
  private processNetworkAclTarget(
    networkAclItem: NetworkAclConfig,
    target: string | NetworkAclSubnetSelection,
    rule: number,
  ): {
    cidrBlock?: string;
    ipv6CidrBlock?: string;
  } {
    //
    // IP target
    //
    if (isNetworkType<NonEmptyString>('NonEmptyString', target)) {
      this.logger.info(`Evaluate IP Target ${target}`);
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
      this.logger.info(`Evaluate Subnet Source account:${target.account} vpc:${target.vpc} subnets:[${target.subnet}]`);
      //
      // Locate the VPC
      const targetVpcConfig = this.props.networkConfig.vpcs.find(
        vpcItem => vpcItem.account === target.account && vpcItem.name === target.vpc,
      );

      if (!targetVpcConfig) {
        this.logger.error(
          `Network ACL item ${networkAclItem.name} rule ${rule} target VPC ${target.vpc} not found in network config.`,
        );
        throw new Error(
          `Configuration validation failed at runtime. Network ACL item ${networkAclItem.name} rule ${rule} target VPC ${target.vpc} not found in network config.`,
        );
      }

      const targetVpcSubnets = targetVpcConfig.subnets ?? [];

      if (targetVpcSubnets.length < 1) {
        this.logger.error(
          `Network ACL item ${networkAclItem.name} rule ${rule} target VPC ${target.vpc} has no subnets defined.`,
        );
        throw new Error(
          `Configuration validation failed at runtime. Network ACL item ${networkAclItem.name} rule ${rule} target VPC ${target.vpc} has no subnets defined.`,
        );
      }

      //
      // Locate the Subnet

      const targetSubnetConfig = targetVpcSubnets.find(subnet => subnet.name === target.subnet);

      if (!targetSubnetConfig) {
        this.logger.error(
          `Network ACL item ${networkAclItem.name} rule ${rule} target subnet ${target.subnet} not found in VPC ${target.vpc}.`,
        );
        throw new Error(
          `Configuration validation failed at runtime. Network ACL item ${networkAclItem.name} rule ${rule} target subnet ${target.subnet} not found in VPC ${target.vpc}.`,
        );
      }

      if (targetSubnetConfig.ipamAllocation) {
        return { cidrBlock: targetSubnetConfig.ipv4CidrBlock };
      } else {
        return target.ipv6
          ? { ipv6CidrBlock: targetSubnetConfig.ipv6CidrBlock }
          : { cidrBlock: targetSubnetConfig.ipv4CidrBlock };
      }
    }

    this.logger.error(`Unknown Network ACL rule target ${target}`);
    throw new Error(`Configuration validation failed at runtime. Unknown Network ACL rule target ${target}`);
  }
}
