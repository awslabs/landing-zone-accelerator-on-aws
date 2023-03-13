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
  DnsFirewallRuleGroupConfig,
  DnsQueryLogsConfig,
  IpamPoolConfig,
  NetworkAclSubnetSelection,
  NfwFirewallPolicyConfig,
  NfwRuleGroupConfig,
  ResolverRuleConfig,
  SubnetConfig,
  TransitGatewayConfig,
  VpcConfig,
  VpcTemplatesConfig,
} from '@aws-accelerator/config';
import {
  IResourceShareItem,
  ResourceShare,
  ResourceShareItem,
  ResourceShareOwner,
  SsmParameterLookup,
} from '@aws-accelerator/constructs';
import { SsmResourceType } from '@aws-accelerator/utils';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { pascalCase } from 'pascal-case';
import { AcceleratorStack, AcceleratorStackProps } from '../accelerator-stack';

// Resource share type for RAM resource shares
type ResourceShareType =
  | DnsFirewallRuleGroupConfig
  | DnsQueryLogsConfig
  | IpamPoolConfig
  | NfwRuleGroupConfig
  | NfwFirewallPolicyConfig
  | SubnetConfig
  | ResolverRuleConfig
  | TransitGatewayConfig;

// Enum for log levle
export enum LogLevel {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Abstract class definition and methods for network stacks
 */
export abstract class NetworkStack extends AcceleratorStack {
  public readonly cloudwatchKey: cdk.aws_kms.Key;
  public readonly logRetention: number;
  public readonly vpcResources: (VpcConfig | VpcTemplatesConfig)[];

  protected constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    // Set protected properties
    this.logRetention = props.globalConfig.cloudwatchLogRetentionInDays;
    this.vpcResources = [...props.networkConfig.vpcs, ...(props.networkConfig.vpcTemplates ?? [])];

    this.cloudwatchKey = cdk.aws_kms.Key.fromKeyArn(
      this,
      'AcceleratorGetCloudWatchKey',
      cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        AcceleratorStack.ACCELERATOR_CLOUDWATCH_LOG_KEY_ARN_PARAMETER_NAME,
      ),
    ) as cdk.aws_kms.Key;
  }

  /**
   * Returns true if provided account ID and region parameters match contextual values for the current stack
   * @param accountIds
   * @param regions
   * @returns
   */
  public isTargetStack(accountIds: string[], regions: string[]): boolean {
    return accountIds.includes(cdk.Stack.of(this).account) && regions.includes(cdk.Stack.of(this).region);
  }

  /**
   * Public accessor method to add SSM parameters
   * @param props
   */
  public addSsmParameter(props: { logicalId: string; parameterName: string; stringValue: string }) {
    this.ssmParameters.push({
      logicalId: props.logicalId,
      parameterName: props.parameterName,
      stringValue: props.stringValue,
    });
  }

  /**
   * Public accessor method to add logs to logger
   * @param logLevel
   * @param message
   */
  public addLogs(logLevel: LogLevel, message: string) {
    switch (logLevel) {
      case 'info':
        this.logger.info(message);
        break;

      case 'warn':
        this.logger.warn(message);
        break;

      case 'error':
        this.logger.error(message);
        break;
    }
  }

  /**
   * Returns a map of VPC IDs for the target stack
   * @param vpcResources
   * @returns
   */
  protected setVpcMap(vpcResources: (VpcConfig | VpcTemplatesConfig)[]): Map<string, string> {
    const vpcMap = new Map<string, string>();

    for (const vpcItem of vpcResources) {
      const vpcAccountIds = this.getVpcAccountIds(vpcItem);

      if (this.isTargetStack(vpcAccountIds, [vpcItem.region])) {
        const vpcId = cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          this.getSsmPath(SsmResourceType.VPC, [vpcItem.name]),
        );
        vpcMap.set(vpcItem.name, vpcId);
      }
    }
    return vpcMap;
  }

  /**
   * Returns a map of subnet IDs for the target stack
   * @param vpcResources
   * @returns
   */
  protected setSubnetMap(vpcResources: (VpcConfig | VpcTemplatesConfig)[]): Map<string, string> {
    const subnetMap = new Map<string, string>();

    for (const vpcItem of vpcResources) {
      const vpcAccountIds = this.getVpcAccountIds(vpcItem);

      if (this.isTargetStack(vpcAccountIds, [vpcItem.region])) {
        for (const subnetItem of vpcItem.subnets ?? []) {
          const subnetId = cdk.aws_ssm.StringParameter.valueForStringParameter(
            this,
            this.getSsmPath(SsmResourceType.SUBNET, [vpcItem.name, subnetItem.name]),
          );
          subnetMap.set(`${vpcItem.name}_${subnetItem.name}`, subnetId);
        }
      }
    }
    return subnetMap;
  }

  /**
   * Returns a map of route table IDs for the target stack
   * @param vpcResources
   * @returns
   */
  protected setRouteTableMap(vpcResources: (VpcConfig | VpcTemplatesConfig)[]): Map<string, string> {
    const routeTableMap = new Map<string, string>();

    for (const vpcItem of vpcResources) {
      const vpcAccountIds = this.getVpcAccountIds(vpcItem);

      if (this.isTargetStack(vpcAccountIds, [vpcItem.region])) {
        for (const routeTableItem of vpcItem.routeTables ?? []) {
          const routeTableId = cdk.aws_ssm.StringParameter.valueForStringParameter(
            this,
            this.getSsmPath(SsmResourceType.ROUTE_TABLE, [vpcItem.name, routeTableItem.name]),
          );
          routeTableMap.set(`${vpcItem.name}_${routeTableItem.name}`, routeTableId);
        }
      }
    }
    return routeTableMap;
  }

  /**
   * Returns a map of security group IDs for the target stack
   * @param vpcResources
   * @returns
   */
  protected setSecurityGroupMap(vpcResources: (VpcConfig | VpcTemplatesConfig)[]): Map<string, string> {
    const securityGroupMap = new Map<string, string>();

    for (const vpcItem of vpcResources) {
      const vpcAccountIds = this.getVpcAccountIds(vpcItem);

      if (this.isTargetStack(vpcAccountIds, [vpcItem.region])) {
        for (const securityGroupItem of vpcItem.securityGroups ?? []) {
          const securityGroupId = cdk.aws_ssm.StringParameter.valueForStringParameter(
            this,
            this.getSsmPath(SsmResourceType.SECURITY_GROUP, [vpcItem.name, securityGroupItem.name]),
          );
          securityGroupMap.set(`${vpcItem.name}_${securityGroupItem.name}`, securityGroupId);
        }
      }
    }
    return securityGroupMap;
  }

  /**
   * Returns maps of DNS zone details if central interface endpoint VPC is enabled in the target stack
   * @param vpcResources
   * @returns
   */
  protected setInterfaceEndpointDnsMap(vpcResources: (VpcConfig | VpcTemplatesConfig)[]): Map<string, string>[] {
    const endpointMap = new Map<string, string>();
    const zoneMap = new Map<string, string>();

    for (const vpcItem of vpcResources) {
      const vpcAccountIds = this.getVpcAccountIds(vpcItem);

      if (this.isTargetStack(vpcAccountIds, [vpcItem.region]) && vpcItem.interfaceEndpoints?.central) {
        // Set interface endpoint DNS names
        for (const endpointItem of vpcItem.interfaceEndpoints?.endpoints ?? []) {
          const endpointDns = cdk.aws_ssm.StringParameter.valueForStringParameter(
            this,
            this.getSsmPath(SsmResourceType.ENDPOINT_DNS, [vpcItem.name, endpointItem.service]),
          );
          const zoneId = cdk.aws_ssm.StringParameter.valueForStringParameter(
            this,
            this.getSsmPath(SsmResourceType.ENDPOINT_ZONE_ID, [vpcItem.name, endpointItem.service]),
          );
          endpointMap.set(`${vpcItem.name}_${endpointItem.service}`, endpointDns);
          zoneMap.set(`${vpcItem.name}_${endpointItem.service}`, zoneId);
        }
      }
    }
    return [endpointMap, zoneMap];
  }

  /**
   * Returns a map of Route 53 resolver endpoint IDs if enabled in the target stack
   * @param vpcResources
   */
  protected setResolverEndpointMap(vpcResources: (VpcConfig | VpcTemplatesConfig)[]): Map<string, string> {
    const endpointMap = new Map<string, string>();

    for (const vpcItem of vpcResources) {
      const vpcAccountIds = this.getVpcAccountIds(vpcItem);

      if (
        this.isTargetStack(vpcAccountIds, [vpcItem.region]) &&
        this.props.networkConfig.centralNetworkServices?.route53Resolver?.endpoints
      ) {
        const endpoints = this.props.networkConfig.centralNetworkServices?.route53Resolver?.endpoints;

        for (const endpointItem of endpoints) {
          // Only map endpoints for relevant VPCs
          if (endpointItem.vpc === vpcItem.name) {
            const endpointId = cdk.aws_ssm.StringParameter.valueForStringParameter(
              this,
              this.getSsmPath(SsmResourceType.RESOLVER_ENDPOINT, [endpointItem.name]),
            );
            endpointMap.set(`${vpcItem.name}_${endpointItem.name}`, endpointId);
          }
        }
      }
    }
    return endpointMap;
  }

  /**
   * Set Network Firewall policy map
   * @param props
   * @returns
   */
  protected setNfwPolicyMap(props: AcceleratorStackProps): Map<string, string> {
    const policyMap = new Map<string, string>();

    if (props.networkConfig.centralNetworkServices?.networkFirewall?.firewalls) {
      const delegatedAdminAccountId = this.props.accountsConfig.getAccountId(
        props.networkConfig.centralNetworkServices.delegatedAdminAccount,
      );
      const firewalls = props.networkConfig.centralNetworkServices?.networkFirewall?.firewalls;

      for (const vpcItem of this.vpcResources) {
        // Get account IDs
        const vpcAccountIds = this.getVpcAccountIds(vpcItem);

        if (this.isTargetStack(vpcAccountIds, [vpcItem.region])) {
          for (const firewallItem of firewalls ?? []) {
            if (firewallItem.vpc === vpcItem.name && !policyMap.has(firewallItem.firewallPolicy)) {
              // Get firewall policy ARN
              let policyArn: string;

              if (delegatedAdminAccountId === cdk.Stack.of(this).account) {
                policyArn = cdk.aws_ssm.StringParameter.valueForStringParameter(
                  this,
                  this.getSsmPath(SsmResourceType.NFW_POLICY, [firewallItem.firewallPolicy]),
                );
              } else {
                policyArn = this.getResourceShare(
                  `${firewallItem.firewallPolicy}_NetworkFirewallPolicyShare`,
                  'network-firewall:FirewallPolicy',
                  delegatedAdminAccountId,
                  this.cloudwatchKey,
                ).resourceShareItemArn;
              }
              policyMap.set(firewallItem.firewallPolicy, policyArn);
            }
          }
        }
      }
    }
    return policyMap;
  }

  /**
   * Get the resource ID from a RAM share.
   *
   * @param resourceShareName
   * @param itemType
   * @param owningAccountId
   */
  protected getResourceShare(
    resourceShareName: string,
    itemType: string,
    owningAccountId: string,
    kmsKey: cdk.aws_kms.Key,
    vpcName?: string,
  ): IResourceShareItem {
    // Generate a logical ID
    const resourceName = resourceShareName.split('_')[0];
    const logicalId = vpcName
      ? `${vpcName}${resourceName}${itemType.split(':')[1]}`
      : `${resourceName}${itemType.split(':')[1]}`;

    // Lookup resource share
    const resourceShare = ResourceShare.fromLookup(this, pascalCase(`${logicalId}Share`), {
      resourceShareOwner: ResourceShareOwner.OTHER_ACCOUNTS,
      resourceShareName: resourceShareName,
      owningAccountId,
    });

    // Represents the item shared by RAM
    return ResourceShareItem.fromLookup(this, pascalCase(`${logicalId}`), {
      resourceShare,
      resourceShareItemType: itemType,
      kmsKey,
      logRetentionInDays: this.logRetention,
    });
  }

  /**
   * Add RAM resource shares to the stack.
   *
   * @param item
   * @param resourceShareName
   * @param resourceArns
   */
  public addResourceShare(item: ResourceShareType, resourceShareName: string, resourceArns: string[]) {
    // Build a list of principals to share to
    const principals: string[] = [];

    // Loop through all the defined OUs
    for (const ouItem of item.shareTargets?.organizationalUnits ?? []) {
      let ouArn = this.props.organizationConfig.getOrganizationalUnitArn(ouItem);
      // AWS::RAM::ResourceShare expects the organizations ARN if
      // sharing with the entire org (Root)
      if (ouItem === 'Root') {
        ouArn = ouArn.substring(0, ouArn.lastIndexOf('/')).replace('root', 'organization');
      }
      this.logger.info(`Share ${resourceShareName} with Organizational Unit ${ouItem}: ${ouArn}`);
      principals.push(ouArn);
    }

    // Loop through all the defined accounts
    for (const account of item.shareTargets?.accounts ?? []) {
      const accountId = this.props.accountsConfig.getAccountId(account);
      this.logger.info(`Share ${resourceShareName} with Account ${account}: ${accountId}`);
      principals.push(accountId);
    }

    // Create the Resource Share
    new ResourceShare(this, `${pascalCase(resourceShareName)}ResourceShare`, {
      name: resourceShareName,
      principals,
      resourceArns: resourceArns,
    });
  }

  /**
   * Returns true if the NACL resource is referencing a cross-account subnet
   * @param naclItem
   * @returns
   */
  protected isCrossAccountNaclSource(naclItem: string | NetworkAclSubnetSelection): boolean {
    if (typeof naclItem === 'string') {
      return false;
    }
    const accountId = cdk.Stack.of(this).account;
    const naclAccount = this.props.accountsConfig.getAccountId(naclItem.account);
    const region = cdk.Stack.of(this).region;
    const naclRegion = naclItem.region;

    if (naclRegion && accountId === naclAccount && region === naclRegion) {
      return false;
    } else {
      return true;
    }
  }

  /**
   * Set IPAM pool map
   * @param props
   * @returns
   */
  protected setIpamPoolMap(props: AcceleratorStackProps): Map<string, string> {
    const poolMap = new Map<string, string>();

    if (props.networkConfig.centralNetworkServices?.ipams) {
      const delegatedAdminAccountId = props.accountsConfig.getAccountId(
        props.networkConfig.centralNetworkServices.delegatedAdminAccount,
      );

      for (const vpcItem of this.vpcResources) {
        // Get account IDs
        const vpcAccountIds = this.getVpcAccountIds(vpcItem);

        if (this.isTargetStack(vpcAccountIds, [vpcItem.region])) {
          for (const alloc of vpcItem.ipamAllocations ?? []) {
            const ipamPool = props.networkConfig.centralNetworkServices.ipams?.find(item =>
              item.pools?.find(item => item.name === alloc.ipamPoolName),
            );
            if (ipamPool === undefined) {
              this.logger.error(`Specified Ipam Pool not defined`);
              throw new Error(`Configuration validation failed at runtime.`);
            }
            if (!poolMap.has(alloc.ipamPoolName)) {
              let poolId: string;
              if (
                delegatedAdminAccountId === cdk.Stack.of(this).account &&
                ipamPool.region === cdk.Stack.of(this).region
              ) {
                poolId = cdk.aws_ssm.StringParameter.valueForStringParameter(
                  this,
                  this.getSsmPath(SsmResourceType.IPAM_POOL, [alloc.ipamPoolName]),
                );
              } else if (ipamPool.region !== cdk.Stack.of(this).region) {
                poolId = this.getCrossRegionPoolId(delegatedAdminAccountId, alloc.ipamPoolName, ipamPool.region);
              } else {
                poolId = this.getResourceShare(
                  `${alloc.ipamPoolName}_IpamPoolShare`,
                  'ec2:IpamPool',
                  delegatedAdminAccountId,
                  this.cloudwatchKey,
                ).resourceShareItemId;
              }
              poolMap.set(alloc.ipamPoolName, poolId);
            }
          }
        }
      }
    }
    return poolMap;
  }

  /**
   * Method to retrieve IPAM Pool ID from cross-region
   * @param delegatedAdminAccountId
   * @param poolName
   * @param ipamPoolRegion
   */
  private getCrossRegionPoolId(delegatedAdminAccountId: string, poolName: string, ipamPoolRegion: string): string {
    let poolId: string | undefined = undefined;
    if (delegatedAdminAccountId !== cdk.Stack.of(this).account) {
      poolId = new SsmParameterLookup(this, pascalCase(`SsmParamLookup${poolName}`), {
        name: this.getSsmPath(SsmResourceType.IPAM_POOL, [poolName]),
        accountId: delegatedAdminAccountId,
        parameterRegion: ipamPoolRegion,
        roleName: `AWSAccelerator-GetAcceleratorIpamSsmParamRole-${cdk.Stack.of(this).region}`,
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays ?? 365,
      }).value;
    } else {
      poolId = new SsmParameterLookup(this, pascalCase(`SsmParamLookup${poolName}`), {
        name: this.getSsmPath(SsmResourceType.IPAM_POOL, [poolName]),
        accountId: delegatedAdminAccountId,
        parameterRegion: ipamPoolRegion,
      }).value;
    }
    return poolId;
  }
}
