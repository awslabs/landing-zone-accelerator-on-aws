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
import {
  DnsFirewallRuleGroupConfig,
  DnsQueryLogsConfig,
  IpamPoolConfig,
  NfwFirewallPolicyConfig,
  NfwRuleGroupConfig,
  ResolverRuleConfig,
  RouteTableEntryConfig,
  SubnetConfig,
  TransitGatewayConfig,
  VpcConfig,
  VpcTemplatesConfig,
} from '@aws-accelerator/config';
import { AcceleratorStackProps } from '../../accelerator-stack';
import {
  SecurityGroupEgressRuleProps,
  SecurityGroupIngressRuleProps,
} from '@aws-accelerator/constructs/lib/aws-ec2/vpc';

/**
 * V2 network stack properties
 */
export interface V2NetworkStacksBaseProps extends AcceleratorStackProps {
  /**
   * VPC configuration details from network config
   */
  readonly vpcConfig: VpcConfig | VpcTemplatesConfig;
  /**
   * Flag indicates weather current stack is V2 VPC stack
   */
  readonly vpcStack: boolean;
  /**
   * List of V2 VPC resources
   */
  readonly v2NetworkResources: V2NetworkResourceListType[];
}

/**
 * Resource share type for RAM resource shares
 */
export type ResourceShareType =
  | DnsFirewallRuleGroupConfig
  | DnsQueryLogsConfig
  | IpamPoolConfig
  | NfwRuleGroupConfig
  | NfwFirewallPolicyConfig
  | SubnetConfig
  | ResolverRuleConfig
  | TransitGatewayConfig;

export type RouteTableDetailsType = {
  cfnRouteTable?: cdk.aws_ec2.CfnRouteTable;
  name: string;
  id: string;
  routes: RouteTableEntryConfig[];
};

export type RouteEntryPropertiesType = {
  cfnRouteTable?: cdk.aws_ec2.CfnRouteTable;
  routeTableName: string;
  routeEntryResourceName: string;
  routeTableId: string;
  targetId: string;
  logRetentionInDays: number;
  logGroupKmsKey?: cdk.aws_kms.IKey;
  destination?: string;
  destinationPrefixListId?: string;
  ipv6Destination?: string;
};

export type ipamPoolIdType = {
  name: string;
  id: string;
};

/**
 * V2 Network resource list type
 */
export type V2NetworkResourceListType = { vpcName: string; resourceType: string; resourceName?: string };

/**
 * Ipam Cidrs Map type
 */
export type IpamCidrsMapType = { [key: string]: number };

/**
 * V2 Network resource environment type
 */
export type V2NetworkResourceEnvironmentType = { accountId: string; region: string; stackName: string };

/**
 * Security Group Source Details Type
 */
export type SecurityGroupSourceDetailsType = {
  cidrIp?: string;
  cidrIpv6?: string;
  sourcePrefixListId?: string;
  sourceSecurityGroupId?: string;
  destinationPrefixListId?: string;
  destinationSecurityGroupName?: string;
  destinationSecurityGroupId?: string;
};

/**
 * V2 Security group Ingress rule props
 */
export interface V2SecurityGroupIngressRuleProps extends SecurityGroupIngressRuleProps {
  destinationSecurityGroupName?: string;
}

/**
 * V2 Security group Egress rule props
 */
export interface V2SecurityGroupEgressRuleProps extends SecurityGroupEgressRuleProps {
  destinationSecurityGroupName?: string;
}
