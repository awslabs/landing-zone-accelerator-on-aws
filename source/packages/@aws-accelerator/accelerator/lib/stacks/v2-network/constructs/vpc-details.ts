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
import { Construct } from 'constructs';

import { V2NetworkStacksBaseProps } from '../utils/types';
import { isNetworkType } from '@aws-accelerator/config/lib/common/parse';
import {
  IpamAllocationConfig,
  IpamConfig,
  NatGatewayConfig,
  NetworkAclConfig,
  OutpostsConfig,
  RouteTableConfig,
  SecurityGroupConfig,
  SubnetConfig,
  TransitGatewayAttachmentConfig,
  VirtualPrivateGatewayConfig,
  VpcConfig,
  VpcIpv6Config,
  VpcTemplatesConfig,
  VpnConnectionConfig,
} from '@aws-accelerator/config/lib/network-config';
import { SsmParameterPath, SsmResourceType } from '@aws-accelerator/utils/lib/ssm-parameter-path';
import { InstanceTenancyType } from '@aws-accelerator/config/lib/models/network-config';
import { DeploymentTargets, VpcFlowLogsConfig } from '@aws-accelerator/config/lib/common';
import { hasAdvancedVpnOptions, isIpv4 } from '../../network-stacks/utils/validation-utils';
import {
  ApplicationLoadBalancerConfig,
  NetworkLoadBalancerConfig,
  TargetGroupItemConfig,
} from '@aws-accelerator/config/lib/customizations-config';

/**
 * A construct to get VP details for V2 stacks
 */
export class VpcDetails extends Construct {
  /**
   * Vpc configuration from network config
   */
  public readonly vpcConfig: VpcConfig | VpcTemplatesConfig;
  /**
   * Is VPC from template
   */
  public fromTemplate = false;
  /**
   * List of AWS Account names only for non-template VPCs
   */
  public nonTemplateVpcAccountName: string | undefined;
  /**
   * Template VPC deployment target configuration
   */
  public templateVpcDeploymentTarget: DeploymentTargets | undefined;
  /**
   * Friendly name of the VPC from network config file
   */
  public readonly name: string;
  /**
   * VPC Id
   */
  public id?: string;
  /**
   * List of VPC CIDR
   */
  public readonly cidrs: string[] | undefined;
  /**
   * VPC primary CIDR
   */
  public readonly primaryCidr: string | undefined;
  /**
   * Flag indicating DNS hostnames enabled
   */
  public readonly enableDnsHostnames: boolean;
  /**
   * Flag indicating DNS support enabled
   */
  public readonly enableDnsSupport: boolean;
  /**
   * Instance tenancy type
   */
  public readonly instanceTenancy: InstanceTenancyType;
  /**
   * Flag indicating VPC has internet gateway
   */
  public readonly internetGateway: boolean;
  /**
   * VPC virtual private gateway detail
   */
  public readonly virtualPrivateGateway: VirtualPrivateGatewayConfig | undefined;
  /**
   * VPC subnets detail
   */
  public readonly subnets: SubnetConfig[];
  /**
   * VPC route tables detail
   */
  public readonly routeTables: RouteTableConfig[];
  /**
   * Flag indicating VPC has egress only gateway
   */
  public readonly egressOnlyIgw: boolean;
  /**
   * VPC outposts detail
   */
  public readonly outposts: OutpostsConfig[];
  /**
   * VPC IPAM allocation detail
   */
  public readonly ipamAllocations: IpamAllocationConfig[];
  /**
   * VPC IPAM detail
   */
  public readonly ipamConfigs: IpamConfig[];
  /**
   * VPC tags
   */
  public readonly tags: cdk.CfnTag[] | undefined;
  /**
   * Dhcp option name
   */
  public readonly dhcpOptionName: string | undefined;

  /**
   * IPV6 cidr configurations
   */
  public ipv6Cidrs: VpcIpv6Config[];
  /**
   * Flag indicating VPC has use central endpoints
   */
  public useCentralEndpoints: boolean;
  /**
   * Central Endpoint VPC config
   */
  public readonly centralEndpointVpc: VpcConfig | undefined;
  /**
   * VPC flow logs configuration
   */
  public readonly vpcFlowLogsConfig: VpcFlowLogsConfig | undefined;
  /**
   * Flag indicating VPC has delete default security group
   */
  public readonly deleteDefaultSecurityGroup: boolean | undefined;
  /**
   * Advanced VPN types that exist in the current stack context
   */
  public readonly advancedVpnTypes: string[] = [];
  /**
   * NAT Gateway configurations
   */
  public readonly natGateways: NatGatewayConfig[] = [];
  /**
   * Transit Gateway Attachments
   */
  public readonly transitGatewayAttachments: TransitGatewayAttachmentConfig[] = [];
  /**
   * Network ACL configurations
   */
  public readonly networkAcls: NetworkAclConfig[] = [];
  /**
   * Application load balancer configurations
   */
  public readonly applicationLoadBalancers: ApplicationLoadBalancerConfig[] = [];
  /**
   * Network Load balancer configurations
   */
  public readonly networkLoadBalancers: NetworkLoadBalancerConfig[] = [];
  /**
   * Target group configurations
   */
  public readonly targetGroups: TargetGroupItemConfig[] = [];
  /**
   * VPC Security group configuration
   */
  public readonly securityGroups: SecurityGroupConfig[] = [];

  private readonly props: V2NetworkStacksBaseProps;

  constructor(scope: Construct, id: string, props: V2NetworkStacksBaseProps) {
    super(scope, id);
    this.props = props;

    this.vpcConfig = props.vpcConfig;
    this.name = this.props.vpcConfig.name;

    if (!props.vpcStack) {
      this.id = cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        this.getSsmPath(SsmResourceType.VPC, [this.props.vpcConfig.name]),
      );
    }
    this.cidrs = this.props.vpcConfig.cidrs;
    this.primaryCidr = this.props.vpcConfig.cidrs?.[0];

    this.enableDnsHostnames = this.props.vpcConfig.enableDnsHostnames ?? true;
    this.enableDnsSupport = this.props.vpcConfig.enableDnsSupport ?? true;
    this.instanceTenancy = this.props.vpcConfig.instanceTenancy ?? 'default';
    this.internetGateway = this.props.vpcConfig.internetGateway ?? false;
    this.virtualPrivateGateway = this.props.vpcConfig.virtualPrivateGateway;
    this.subnets = this.props.vpcConfig.subnets ?? [];
    this.routeTables = this.props.vpcConfig.routeTables ?? [];
    this.egressOnlyIgw = this.props.vpcConfig.egressOnlyIgw ?? false;
    this.outposts = this.getOutposts();
    this.ipamAllocations = this.props.vpcConfig.ipamAllocations ?? [];
    this.ipamConfigs = props.networkConfig.centralNetworkServices?.ipams ?? [];
    this.tags = this.props.vpcConfig.tags ?? [];
    this.dhcpOptionName = this.props.vpcConfig.dhcpOptions;
    this.ipv6Cidrs = this.props.vpcConfig.ipv6Cidrs ?? [];
    this.useCentralEndpoints = this.props.vpcConfig.useCentralEndpoints ?? false;
    this.centralEndpointVpc = this.props.networkConfig.vpcs.find(vpc => vpc.interfaceEndpoints?.central);
    this.vpcFlowLogsConfig = this.props.vpcConfig.vpcFlowLogs ?? this.props.networkConfig.vpcFlowLogs;
    this.deleteDefaultSecurityGroup = this.props.vpcConfig.defaultSecurityGroupRulesDeletion ?? false;
    this.natGateways = this.props.vpcConfig.natGateways ?? [];
    this.transitGatewayAttachments = this.props.vpcConfig.transitGatewayAttachments ?? [];
    this.networkAcls = this.props.vpcConfig.networkAcls ?? [];
    this.applicationLoadBalancers = this.props.vpcConfig.loadBalancers?.applicationLoadBalancers ?? [];
    this.networkLoadBalancers = this.props.vpcConfig.loadBalancers?.networkLoadBalancers ?? [];
    this.targetGroups = this.props.vpcConfig.targetGroups ?? [];
    this.securityGroups = this.props.vpcConfig.securityGroups ?? [];

    this.setNonTemplateVpcProperties();
    this.setAdvancedVpnFlag();
  }

  private isTargetStack(accountIds: string[], regions: string[]): boolean {
    return accountIds.includes(cdk.Stack.of(this).account) && regions.includes(cdk.Stack.of(this).region);
  }

  private setAdvancedVpnFlag(): boolean {
    for (const cgw of this.props.networkConfig.customerGateways ?? []) {
      const cgwAccount = this.props.accountsConfig.getAccountId(cgw.account);
      for (const vpnItem of cgw.vpnConnections ?? []) {
        if (this.isTargetStack([cgwAccount], [cgw.region]) && hasAdvancedVpnOptions(vpnItem) && isIpv4(cgw.ipAddress)) {
          this.setAdvancedVpnType(vpnItem);
          return true;
        }
      }
    }
    return false;
  }

  private setAdvancedVpnType(vpnItem: VpnConnectionConfig) {
    if (vpnItem.vpc && !this.advancedVpnTypes.includes('vpc')) {
      this.advancedVpnTypes.push('vpc');
    } else if (vpnItem.transitGateway && !this.advancedVpnTypes.includes('tgw')) {
      this.advancedVpnTypes.push('tgw');
    }
  }

  private setNonTemplateVpcProperties(): void {
    if (isNetworkType<VpcTemplatesConfig>('IVpcTemplatesConfig', this.props.vpcConfig)) {
      this.fromTemplate = true;
      this.templateVpcDeploymentTarget = this.props.vpcConfig.deploymentTargets;
    } else {
      this.nonTemplateVpcAccountName = this.props.vpcConfig.account;
    }
  }

  private getOutposts(): OutpostsConfig[] {
    if (isNetworkType<VpcConfig>('IVpcConfig', this.props.vpcConfig)) {
      return this.props.vpcConfig.outposts ?? [];
    }
    return [];
  }

  private getSsmPath(resourceType: SsmResourceType, replacements: string[]) {
    const ssmPrefix = this.props.prefixes.ssmParamName;
    return new SsmParameterPath(ssmPrefix, resourceType, replacements).parameterPath;
  }
}
