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

import { DeleteDefaultSecurityGroupRules, DeleteDefaultVpc, Vpc, VpnConnection } from '@aws-accelerator/constructs';
import { AcceleratorStackProps } from '../../accelerator-stack';
import { LogLevel, NetworkStack } from '../network-stack';
import * as cdk from 'aws-cdk-lib';
import { DefaultVpcsConfig, VpcConfig, VpcFlowLogsConfig, VpcTemplatesConfig } from '@aws-accelerator/config';
import { NagSuppressions } from 'cdk-nag';
import { pascalCase } from 'pascal-case';
import { SsmResourceType } from '@aws-accelerator/utils';

export class VpcResources {
  public readonly deleteDefaultVpc: boolean;
  public readonly vpcMap: Map<string, Vpc>;
  public readonly vpnMap: Map<string, string>;
  public readonly centralEndpointRole?: cdk.aws_iam.Role;
  public readonly vpcPeeringRole?: cdk.aws_iam.Role;

  private stack: NetworkStack;

  constructor(
    networkStack: NetworkStack,
    ipamPoolMap: Map<string, string>,
    dhcpOptionsIds: Map<string, string>,
    props: AcceleratorStackProps,
  ) {
    this.stack = networkStack;

    // Delete default VPC
    this.deleteDefaultVpc = this.deleteDefaultVpcMethod(props.networkConfig.defaultVpc);
    // Create central endpoints role
    this.centralEndpointRole = this.createCentralEndpointRole(props);
    // Create VPC peering role
    this.vpcPeeringRole = this.createVpcPeeringRole(props);
    // Create VPCs
    this.vpcMap = this.createVpcs(this.stack.vpcsInScope, ipamPoolMap, dhcpOptionsIds, props);
    // Create VPN connections
    this.vpnMap = this.createVpnConnections(this.vpcMap, props);
  }

  /**
   * Delete default VPC in the current account+region
   * @param props
   * @returns
   */
  private deleteDefaultVpcMethod(defaultVpc: DefaultVpcsConfig): boolean {
    const accountExcluded = defaultVpc.excludeAccounts && this.stack.isAccountExcluded(defaultVpc.excludeAccounts);

    if (defaultVpc.delete && !accountExcluded) {
      this.stack.addLogs(LogLevel.INFO, 'Add DeleteDefaultVpc');
      new DeleteDefaultVpc(this.stack, 'DeleteDefaultVpc', {
        kmsKey: this.stack.cloudwatchKey,
        logRetentionInDays: this.stack.logRetention,
      });
      return true;
    }
    return false;
  }

  /**
   * Create a cross-account role to assume if useCentralEndpoints VPC
   * does not reside in the same account as the central endpoints VPC
   * @param props
   * @returns
   */
  private createCentralEndpointRole(props: AcceleratorStackProps): cdk.aws_iam.Role | undefined {
    if (this.useCentralEndpoints(this.stack.vpcsInScope, props.partition)) {
      const centralEndpointVpc = this.getCentralEndpointVpc(props);

      if (!centralEndpointVpc) {
        this.stack.addLogs(LogLevel.ERROR, `useCentralEndpoints set to true, but no central endpoint VPC detected`);
        throw new Error(`Configuration validation failed at runtime.`);
      } else {
        const centralEndpointVpcAccountId = props.accountsConfig.getAccountId(centralEndpointVpc.account);
        if (centralEndpointVpcAccountId !== cdk.Stack.of(this.stack).account) {
          this.stack.addLogs(
            LogLevel.INFO,
            'Central endpoints VPC is in an external account, create a role to enable central endpoints',
          );
          const role = new cdk.aws_iam.Role(this.stack, 'EnableCentralEndpointsRole', {
            roleName: `${props.prefixes.accelerator}-EnableCentralEndpointsRole-${cdk.Stack.of(this.stack).region}`,
            assumedBy: new cdk.aws_iam.AccountPrincipal(centralEndpointVpcAccountId),
            inlinePolicies: {
              default: new cdk.aws_iam.PolicyDocument({
                statements: [
                  new cdk.aws_iam.PolicyStatement({
                    effect: cdk.aws_iam.Effect.ALLOW,
                    actions: ['ec2:DescribeVpcs', 'route53:AssociateVPCWithHostedZone'],
                    resources: ['*'],
                  }),
                ],
              }),
            },
          });

          // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
          // rule suppression with evidence for this permission.
          NagSuppressions.addResourceSuppressionsByPath(
            this.stack,
            `${this.stack.stackName}/EnableCentralEndpointsRole/Resource/Resource`,
            [
              {
                id: 'AwsSolutions-IAM5',
                reason: 'EnableCentralEndpointsRole needs access to every describe every VPC in the account ',
              },
            ],
          );
          return role;
        }
      }
    }
    return undefined;
  }

  /**
   * Determine if any VPCs in the current stack context have useCentralEndpoints enabled
   * @param vpcResources
   * @param partition
   */
  private useCentralEndpoints(vpcResources: (VpcConfig | VpcTemplatesConfig)[], partition: string): boolean {
    for (const vpcItem of vpcResources) {
      if (vpcItem.useCentralEndpoints) {
        if (partition !== 'aws' && partition !== 'aws-cn') {
          this.stack.addLogs(
            LogLevel.ERROR,
            'useCentralEndpoints set to true, but AWS Partition is not commercial. Please change it to false.',
          );
          throw new Error(`Configuration validation failed at runtime.`);
        }

        return true;
      }
    }
    return false;
  }

  /**
   * Returns a central endpoint VPC config if one exists in this stack context
   * @param props
   * @returns
   */
  private getCentralEndpointVpc(props: AcceleratorStackProps): VpcConfig | undefined {
    return props.networkConfig.vpcs.find(
      vpc => vpc.interfaceEndpoints?.central && vpc.region === cdk.Stack.of(this.stack).region,
    );
  }

  /**
   * Create VPC peering role if requester VPCs exist in external account(s)
   * @param props
   */
  private createVpcPeeringRole(props: AcceleratorStackProps): cdk.aws_iam.Role | undefined {
    const vpcPeeringAccountIds = this.getVpcPeeringAccountIds(props);
    //
    // Create VPC peering role
    //
    if (vpcPeeringAccountIds.length > 0) {
      this.stack.addLogs(LogLevel.INFO, `Create cross-account IAM role for VPC peering`);

      const principals: cdk.aws_iam.PrincipalBase[] = [];
      vpcPeeringAccountIds.forEach(accountId => {
        principals.push(new cdk.aws_iam.AccountPrincipal(accountId));
      });
      const role = new cdk.aws_iam.Role(this.stack, 'VpcPeeringRole', {
        roleName: `${props.prefixes.accelerator}-VpcPeeringRole-${cdk.Stack.of(this.stack).region}`,
        assumedBy: new cdk.aws_iam.CompositePrincipal(...principals),
        inlinePolicies: {
          default: new cdk.aws_iam.PolicyDocument({
            statements: [
              new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                actions: [
                  'ec2:AcceptVpcPeeringConnection',
                  'ec2:CreateVpcPeeringConnection',
                  'ec2:DeleteVpcPeeringConnection',
                ],
                resources: [
                  `arn:${cdk.Aws.PARTITION}:ec2:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:vpc/*`,
                  `arn:${cdk.Aws.PARTITION}:ec2:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:vpc-peering-connection/*`,
                ],
              }),
              new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                actions: ['ec2:CreateRoute', 'ec2:DeleteRoute'],
                resources: [`arn:${cdk.Aws.PARTITION}:ec2:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:route-table/*`],
              }),
              new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                actions: ['ssm:GetParameter'],
                resources: [
                  `arn:${cdk.Aws.PARTITION}:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter${props.prefixes.ssmParamName}/network/*`,
                ],
              }),
            ],
          }),
        },
      });

      // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
      // rule suppression with evidence for this permission.
      NagSuppressions.addResourceSuppressionsByPath(this.stack, `${this.stack.stackName}/VpcPeeringRole/Resource`, [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'VpcPeeringRole needs access to create peering connections for VPCs in the account ',
        },
      ]);
      return role;
    }
    return undefined;
  }

  /**
   * Return an array of VPC peering requester account IDs
   * if an accepeter VPC exists in this account+region
   * @param props
   * @returns
   */
  private getVpcPeeringAccountIds(props: AcceleratorStackProps): string[] {
    //
    // Loop through VPC peering entries. Determine if accepter VPC is in external account.
    //
    const vpcPeeringAccountIds: string[] = [];
    for (const peering of props.networkConfig.vpcPeering ?? []) {
      // Get requester and accepter VPC configurations
      const requesterVpc = props.networkConfig.vpcs.filter(item => item.name === peering.vpcs[0]);
      const accepterVpc = props.networkConfig.vpcs.filter(item => item.name === peering.vpcs[1]);
      const requesterAccountId = props.accountsConfig.getAccountId(requesterVpc[0].account);
      const accepterAccountId = props.accountsConfig.getAccountId(accepterVpc[0].account);
      const crossAccountCondition =
        accepterAccountId !== requesterAccountId || accepterVpc[0].region !== requesterVpc[0].region;

      // Check for different account peering -- only add IAM role to accepter account
      if (this.stack.isTargetStack([accepterAccountId], [accepterVpc[0].region])) {
        if (crossAccountCondition && !vpcPeeringAccountIds.includes(requesterAccountId)) {
          vpcPeeringAccountIds.push(requesterAccountId);
        }
      }
    }
    return vpcPeeringAccountIds;
  }

  /**
   * Create VPCs for this stack context
   * @param vpcResources
   * @param ipamPoolMap
   * @param dhcpOptionsIds
   * @param props
   */
  private createVpcs(
    vpcResources: (VpcConfig | VpcTemplatesConfig)[],
    ipamPoolMap: Map<string, string>,
    dhcpOptionsIds: Map<string, string>,
    props: AcceleratorStackProps,
  ): Map<string, Vpc> {
    const vpcMap = new Map<string, Vpc>();

    for (const vpcItem of vpcResources) {
      const vpc = this.createVpcItem(vpcItem, dhcpOptionsIds, ipamPoolMap, props);
      vpcMap.set(vpcItem.name, vpc);
    }
    return vpcMap;
  }

  /**
   * Create a VPC from a given configuration item
   * @param vpcItem
   * @param dhcpOptionsIds
   * @param ipamPoolMap
   * @param props
   * @returns
   */
  private createVpcItem(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    dhcpOptionsIds: Map<string, string>,
    ipamPoolMap: Map<string, string>,
    props: AcceleratorStackProps,
  ): Vpc {
    this.stack.addLogs(LogLevel.INFO, `Adding VPC ${vpcItem.name}`);
    //
    // Determine if using IPAM or manual CIDRs
    //
    let cidr: string | undefined = undefined;
    let poolId: string | undefined = undefined;
    let poolNetmask: number | undefined = undefined;
    // Get first CIDR in array
    if (vpcItem.cidrs) {
      cidr = vpcItem.cidrs[0];
    }

    // Get IPAM details
    if (vpcItem.ipamAllocations) {
      poolId = ipamPoolMap.get(vpcItem.ipamAllocations[0].ipamPoolName);
      if (!poolId) {
        this.stack.addLogs(
          LogLevel.ERROR,
          `${vpcItem.name}: unable to locate IPAM pool ${vpcItem.ipamAllocations[0].ipamPoolName}`,
        );
        throw new Error(`Configuration validation failed at runtime.`);
      }
      poolNetmask = vpcItem.ipamAllocations[0].netmaskLength;
    }

    //
    // Create VPC
    //
    const vpc = new Vpc(this.stack, pascalCase(`${vpcItem.name}Vpc`), {
      name: vpcItem.name,
      ipv4CidrBlock: cidr,
      internetGateway: vpcItem.internetGateway,
      dhcpOptions: dhcpOptionsIds.get(vpcItem.dhcpOptions ?? ''),
      enableDnsHostnames: vpcItem.enableDnsHostnames ?? true,
      enableDnsSupport: vpcItem.enableDnsSupport ?? true,
      instanceTenancy: vpcItem.instanceTenancy ?? 'default',
      ipv4IpamPoolId: poolId,
      ipv4NetmaskLength: poolNetmask,
      tags: vpcItem.tags,
      virtualPrivateGateway: vpcItem.virtualPrivateGateway,
    });

    this.stack.addSsmParameter({
      logicalId: pascalCase(`SsmParam${pascalCase(vpcItem.name)}VpcId`),
      parameterName: this.stack.getSsmPath(SsmResourceType.VPC, [vpcItem.name]),
      stringValue: vpc.vpcId,
    });
    //
    // Create additional CIDRs
    //
    this.createAdditionalCidrs(vpc, vpcItem, ipamPoolMap);
    //
    // Add central endpoint tags
    //
    this.addCentralEndpointTags(vpc, vpcItem, props);
    //
    // Add flow logs, if configured
    //
    this.getVpcFlowLogConfig(vpc, vpcItem, props);
    //
    // Delete default security group rules
    //
    this.deleteDefaultSgRules(vpc, vpcItem);
    return vpc;
  }

  /**
   * Create additional CIDR blocks for a given VPC
   * @param vpc
   * @param vpcItem
   * @param ipamPoolMap
   * @returns
   */
  private createAdditionalCidrs(
    vpc: Vpc,
    vpcItem: VpcConfig | VpcTemplatesConfig,
    ipamPoolMap: Map<string, string>,
  ): ({ cidrBlock: string } | { ipv4IpamPoolId: string; ipv4NetmaskLength: number })[] {
    const additionalCidrs: ({ cidrBlock: string } | { ipv4IpamPoolId: string; ipv4NetmaskLength: number })[] = [];

    if (vpcItem.cidrs && vpcItem.cidrs.length > 1) {
      for (const vpcCidr of vpcItem.cidrs.slice(1)) {
        this.stack.addLogs(LogLevel.INFO, `Adding secondary CIDR ${vpcCidr} to VPC ${vpcItem.name}`);
        vpc.addCidr({ cidrBlock: vpcCidr });
        additionalCidrs.push({ cidrBlock: vpcCidr });
      }
    }

    if (vpcItem.ipamAllocations && vpcItem.ipamAllocations.length > 1) {
      for (const alloc of vpcItem.ipamAllocations.slice(1)) {
        this.stack.addLogs(
          LogLevel.INFO,
          `Adding secondary IPAM allocation with netmask ${alloc.netmaskLength} to VPC ${vpcItem.name}`,
        );
        const poolId = ipamPoolMap.get(alloc.ipamPoolName);
        if (!poolId) {
          this.stack.addLogs(LogLevel.ERROR, `${vpcItem.name}: unable to locate IPAM pool ${alloc.ipamPoolName}`);
          throw new Error(`Configuration validation failed at runtime.`);
        }
        vpc.addCidr({ ipv4IpamPoolId: poolId, ipv4NetmaskLength: alloc.netmaskLength });
        additionalCidrs.push({ ipv4IpamPoolId: poolId, ipv4NetmaskLength: alloc.netmaskLength });
      }
    }
    return additionalCidrs;
  }

  /**
   * Add central endpoint tags to the given VPC if useCentralEndpoints is enabled
   * @param vpc
   * @param vpcItem
   * @param props
   * @returns
   */
  private addCentralEndpointTags(
    vpc: Vpc,
    vpcItem: VpcConfig | VpcTemplatesConfig,
    props: AcceleratorStackProps,
  ): boolean {
    if (vpcItem.useCentralEndpoints) {
      const centralEndpointVpc = this.getCentralEndpointVpc(props);
      if (!centralEndpointVpc) {
        this.stack.addLogs(LogLevel.INFO, 'Attempting to use central endpoints with no Central Endpoints defined');
        throw new Error(`Configuration validation failed at runtime.`);
      }
      cdk.Tags.of(vpc).add('accelerator:use-central-endpoints', 'true');
      cdk.Tags.of(vpc).add(
        'accelerator:central-endpoints-account-id',
        props.accountsConfig.getAccountId(centralEndpointVpc.account),
      );
      return true;
    }
    return false;
  }

  /**
   * Determines whether flow logs are created for a given VPC
   * @param vpc
   * @param vpcItem
   * @param props
   *
   */
  private getVpcFlowLogConfig(vpc: Vpc, vpcItem: VpcConfig | VpcTemplatesConfig, props: AcceleratorStackProps) {
    let vpcFlowLogs: VpcFlowLogsConfig | undefined;

    if (vpcItem.vpcFlowLogs) {
      vpcFlowLogs = vpcItem.vpcFlowLogs;
    } else {
      vpcFlowLogs = props.networkConfig.vpcFlowLogs;
    }

    if (vpcFlowLogs) {
      this.createVpcFlowLogs(vpc, vpcFlowLogs);
    } else {
      NagSuppressions.addResourceSuppressions(vpc, [
        { id: 'AwsSolutions-VPC7', reason: 'VPC does not have flow logs configured' },
      ]);
    }
  }

  /**
   * Function to create VPC flow logs
   * @param vpc
   * @param vpcItem
   * @param props
   *
   */
  private createVpcFlowLogs(vpc: Vpc, vpcFlowLogs: VpcFlowLogsConfig) {
    let logFormat: string | undefined = undefined;
    let destinationBucketArn: string | undefined;

    if (vpcFlowLogs.destinations.includes('s3')) {
      destinationBucketArn = cdk.aws_ssm.StringParameter.valueForStringParameter(
        this.stack,
        this.stack.acceleratorResourceNames.parameters.flowLogsDestinationBucketArn,
      );
    }

    if (!vpcFlowLogs.defaultFormat) {
      logFormat = vpcFlowLogs.customFields.map(c => `$\{${c}}`).join(' ');
    }

    vpc.addFlowLogs({
      destinations: vpcFlowLogs.destinations,
      trafficType: vpcFlowLogs.trafficType,
      maxAggregationInterval: vpcFlowLogs.maxAggregationInterval,
      logFormat,
      logRetentionInDays: vpcFlowLogs.destinationsConfig?.cloudWatchLogs?.retentionInDays ?? this.stack.logRetention,
      encryptionKey: this.stack.cloudwatchKey,
      bucketArn: destinationBucketArn,
    });
  }

  /**
   * Delete default security group rules for a given VPC
   * @param vpc
   * @param vpcItem
   * @returns
   */
  private deleteDefaultSgRules(vpc: Vpc, vpcItem: VpcConfig | VpcTemplatesConfig): boolean {
    if (vpcItem.defaultSecurityGroupRulesDeletion) {
      this.stack.addLogs(LogLevel.INFO, `Delete default security group ingress and egress rules for ${vpcItem.name}`);
      new DeleteDefaultSecurityGroupRules(this.stack, pascalCase(`DeleteSecurityGroupRules-${vpcItem.name}`), {
        vpcId: vpc.vpcId,
        kmsKey: this.stack.cloudwatchKey,
        logRetentionInDays: this.stack.logRetention,
      });
      return true;
    }
    return false;
  }

  /**
   * Create a VPC connection for a given VPC
   * @param vpc
   */
  private createVpnConnections(vpcMap: Map<string, Vpc>, props: AcceleratorStackProps): Map<string, string> {
    const vpnMap = new Map<string, string>();

    for (const cgw of props.networkConfig.customerGateways ?? []) {
      for (const vpnConnection of cgw.vpnConnections ?? []) {
        if (vpnConnection.vpc && vpcMap.has(vpnConnection.vpc)) {
          const customerGatewayId = cdk.aws_ssm.StringParameter.valueForStringParameter(
            this.stack,
            this.stack.getSsmPath(SsmResourceType.CGW, [cgw.name]),
          );
          const vpc = vpcMap.get(vpnConnection.vpc)!;
          const virtualPrivateGatewayId = vpc.virtualPrivateGateway!.gatewayId;
          this.stack.addLogs(
            LogLevel.INFO,
            `Creating Vpn Connection with Customer Gateway ${cgw.name} to the VPC ${vpnConnection.vpc}`,
          );
          const vpn = new VpnConnection(this.stack, pascalCase(`${vpnConnection.vpc}-VgwVpnConnection`), {
            name: vpnConnection.name,
            customerGatewayId: customerGatewayId,
            staticRoutesOnly: vpnConnection.staticRoutesOnly,
            tags: vpnConnection.tags,
            virtualPrivateGateway: virtualPrivateGatewayId,
            vpnTunnelOptionsSpecifications: vpnConnection.tunnelSpecifications,
          });
          vpnMap.set(`${vpc.name}_${vpnConnection.name}`, vpn.vpnConnectionId);
        }
      }
    }
    return vpnMap;
  }
}
