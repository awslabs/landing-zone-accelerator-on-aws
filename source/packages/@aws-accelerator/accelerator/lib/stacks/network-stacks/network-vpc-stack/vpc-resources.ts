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
  AseaResourceType,
  CustomerGatewayConfig,
  DefaultVpcsConfig,
  Ec2FirewallInstanceConfig,
  VpcConfig,
  VpcFlowLogsConfig,
  VpcTemplatesConfig,
} from '@aws-accelerator/config';
import {
  DeleteDefaultSecurityGroupRules,
  DeleteDefaultVpc,
  PutSsmParameter,
  SsmParameterProps,
  Vpc,
  VpnConnection,
} from '@aws-accelerator/constructs';
import { SsmResourceType } from '@aws-accelerator/utils';
import * as cdk from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import { pascalCase } from 'pascal-case';
import { AcceleratorStackProps } from '../../accelerator-stack';
import { LogLevel, NetworkStack } from '../network-stack';
import { getVpc, getVpcConfig } from '../utils/getter-utils';
import { isIpv4 } from '../utils/validation-utils';

export class VpcResources {
  public readonly deleteDefaultVpc?: DeleteDefaultVpc;
  public readonly sharedParameterMap: Map<string, SsmParameterProps[]>;
  public readonly vpcMap: Map<string, Vpc>;
  public readonly vpnMap: Map<string, string>;
  public readonly centralEndpointRole?: cdk.aws_iam.Role;

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
    // Create VPCs
    this.vpcMap = this.createVpcs(this.stack.vpcsInScope, ipamPoolMap, dhcpOptionsIds, props);
    // Create cross-account route role
    this.createCrossAccountRouteRole(props);
    //
    // Create VPN custom resource handler if needed
    const customResourceHandler = this.stack.advancedVpnTypes.includes('vpc')
      ? this.stack.createVpnOnEventHandler()
      : undefined;
    //
    // Create VPN connections
    this.vpnMap = this.createVpnConnections(this.vpcMap, props, customResourceHandler);
    //
    // Create cross-account/cross-region SSM parameters
    this.sharedParameterMap = this.createSharedParameters(
      this.stack.vpcsInScope,
      this.vpcMap,
      props.networkConfig.customerGateways,
    );
  }

  /**
   * Delete default VPC in the current account+region
   * @param props
   * @returns
   */
  private deleteDefaultVpcMethod(defaultVpc: DefaultVpcsConfig): DeleteDefaultVpc | undefined {
    const accountExcluded = defaultVpc.excludeAccounts && this.stack.isAccountExcluded(defaultVpc.excludeAccounts);
    const regionExcluded = defaultVpc.excludeRegions && this.stack.isRegionExcluded(defaultVpc.excludeRegions);

    if (defaultVpc.delete && !accountExcluded && !regionExcluded) {
      this.stack.addLogs(LogLevel.INFO, 'Add DeleteDefaultVpc');
      return new DeleteDefaultVpc(this.stack, 'DeleteDefaultVpc', {
        kmsKey: this.stack.cloudwatchKey,
        logRetentionInDays: this.stack.logRetention,
      });
    }
    return;
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
   * Add necessary permissions to cross-account role if VPC peering is implemented
   * @param props
   */
  private getCrossAccountRoutePolicies(peeringAccountIds: string[], ssmPrefix: string) {
    const policyStatements = [
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['ec2:CreateRoute', 'ec2:DeleteRoute'],
        resources: [`arn:${cdk.Aws.PARTITION}:ec2:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:route-table/*`],
      }),
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['ssm:GetParameter'],
        resources: [
          `arn:${cdk.Aws.PARTITION}:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter${ssmPrefix}/network/*`,
        ],
      }),
    ];

    if (peeringAccountIds.length > 0) {
      policyStatements.push(
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
      );
    }
    return policyStatements;
  }

  /**
   * Create cross-account route role if target ENIs exist in external account(s) or peering connections defined
   * @param props
   */
  private createCrossAccountRouteRole(props: AcceleratorStackProps): cdk.aws_iam.Role | undefined {
    const crossAccountEniAccountIds = this.getCrossAccountEniAccountIds(props);
    const vpcPeeringAccountIds = this.getVpcPeeringAccountIds(props);
    const policyList = this.getCrossAccountRoutePolicies(vpcPeeringAccountIds, props.prefixes.ssmParamName);

    //
    // Create cross account route role
    //
    const accountIdSet = [...new Set([...(crossAccountEniAccountIds ?? []), ...(vpcPeeringAccountIds ?? [])])];
    if (accountIdSet.length > 0) {
      this.stack.addLogs(
        LogLevel.INFO,
        `Creating cross-account role for the creation of VPC peering connections and routes targeting ENIs`,
      );

      const principals: cdk.aws_iam.PrincipalBase[] = [];
      for (const accountId of accountIdSet) {
        principals.push(new cdk.aws_iam.AccountPrincipal(accountId));
      }

      const role = new cdk.aws_iam.Role(this.stack, 'VpcPeeringRole', {
        roleName: `${props.prefixes.accelerator}-VpcPeeringRole-${cdk.Stack.of(this.stack).region}`,
        assumedBy: new cdk.aws_iam.CompositePrincipal(...principals),
        inlinePolicies: {
          default: new cdk.aws_iam.PolicyDocument({
            statements: policyList,
          }),
        },
      });

      // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
      // rule suppression with evidence for this permission.
      NagSuppressions.addResourceSuppressionsByPath(this.stack, `${this.stack.stackName}/VpcPeeringRole/Resource`, [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'VpcPeeringRole needs access to create routes for VPCs in the account',
        },
      ]);
      return role;
    }
    return undefined;
  }

  /**
   * Return an array of cross-account ENI target account IDs
   * if a VPC containing relevant route table exists in this account+region
   * @param props
   * @returns
   */
  private getCrossAccountEniAccountIds(props: AcceleratorStackProps): string[] {
    const firewallTargetAccountIds: string[] = [];

    for (const firewallInstance of [
      ...(props.customizationsConfig.firewalls?.instances ?? []),
      ...(props.customizationsConfig.firewalls?.managerInstances ?? []),
    ]) {
      // check for potential targets
      if (this.isFirewallOwnedByDifferentAccount(props, firewallInstance)) {
        const vpcConfig = getVpcConfig(this.stack.vpcResources, firewallInstance.vpc);
        for (const routeTable of vpcConfig.routeTables ?? []) {
          for (const route of routeTable.routes ?? []) {
            if (route.type === 'networkInterface' && route?.target?.includes(firewallInstance.name)) {
              const firewallOwner = props.accountsConfig.getAccountId(firewallInstance.account!);
              firewallTargetAccountIds.push(firewallOwner);
            }
          }
        }
      }
    }
    return firewallTargetAccountIds;
  }

  /**
   * Check the account and vpc property of an EC2 firewall to determine if it is owned by a different account and deployed in a VPC owned by this account
   * @param props
   * @returns
   */
  private isFirewallOwnedByDifferentAccount(
    props: AcceleratorStackProps,
    firewallConfig: Ec2FirewallInstanceConfig,
  ): boolean {
    // Check that firewall has account specified that is not this account
    if (firewallConfig.account && props.accountsConfig.getAccountId(firewallConfig.account) !== this.stack.account) {
      // Check that the firewall's target VPC is deployed in this account
      if (this.vpcMap.has(firewallConfig.vpc)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Return an array of VPC peering requester account IDs
   * if an accepter VPC exists in this account+region
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
    // Create or import VPC
    const vpc = this.createOrImportVpc({
      vpcItem,
      dhcpOptionsIds,
      cidr,
      poolId,
      poolNetmask,
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
    //
    // Add dependency on default VPC deletion
    //
    this.addDefaultVpcDependency(vpc, vpcItem);
    return vpc;
  }

  /**
   * Create or import the configured VPC
   * @param options
   * @returns Vpc
   */
  private createOrImportVpc(options: {
    vpcItem: VpcConfig | VpcTemplatesConfig;
    dhcpOptionsIds: Map<string, string>;
    cidr?: string;
    poolId?: string;
    poolNetmask?: number;
  }): Vpc {
    let vpc: Vpc;

    if (this.stack.isManagedByAsea(AseaResourceType.EC2_VPC, options.vpcItem.name)) {
      //
      // Import VPC
      //
      const vpcId = this.stack.getExternalResourceParameter(
        this.stack.getSsmPath(SsmResourceType.VPC, [options.vpcItem.name]),
      );
      const internetGatewayId = this.stack.getExternalResourceParameter(
        this.stack.getSsmPath(SsmResourceType.IGW, [options.vpcItem.name]),
      );
      const virtualPrivateGatewayId = this.stack.getExternalResourceParameter(
        this.stack.getSsmPath(SsmResourceType.VPN_GW, [options.vpcItem.name]),
      );
      vpc = Vpc.fromVpcAttributes(this.stack, pascalCase(`${options.vpcItem.name}Vpc`), {
        name: options.vpcItem.name,
        vpcId,
        internetGatewayId,
        virtualPrivateGatewayId,
      });
      if (options.vpcItem.internetGateway && !internetGatewayId) {
        vpc.addInternetGateway();
      }
      if (options.vpcItem.virtualPrivateGateway && !virtualPrivateGatewayId) {
        vpc.addVirtualPrivateGateway(options.vpcItem.virtualPrivateGateway.asn);
      }
      if (options.vpcItem.dhcpOptions) {
        vpc.setDhcpOptions(options.vpcItem.dhcpOptions);
      }
    } else {
      //
      // Create VPC
      //
      vpc = new Vpc(this.stack, pascalCase(`${options.vpcItem.name}Vpc`), {
        name: options.vpcItem.name,
        ipv4CidrBlock: options.cidr,
        internetGateway: options.vpcItem.internetGateway,
        dhcpOptions: options.dhcpOptionsIds.get(options.vpcItem.dhcpOptions ?? ''),
        enableDnsHostnames: options.vpcItem.enableDnsHostnames ?? true,
        enableDnsSupport: options.vpcItem.enableDnsSupport ?? true,
        instanceTenancy: options.vpcItem.instanceTenancy ?? 'default',
        ipv4IpamPoolId: options.poolId,
        ipv4NetmaskLength: options.poolNetmask,
        tags: options.vpcItem.tags,
        virtualPrivateGateway: options.vpcItem.virtualPrivateGateway,
      });
      this.stack.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(options.vpcItem.name)}VpcId`),
        parameterName: this.stack.getSsmPath(SsmResourceType.VPC, [options.vpcItem.name]),
        stringValue: vpc.vpcId,
      });

      if (vpc.virtualPrivateGatewayId) {
        this.stack.addSsmParameter({
          logicalId: pascalCase(`SsmParam${pascalCase(options.vpcItem.name)}VpnGatewayId`),
          parameterName: this.stack.getSsmPath(SsmResourceType.VPN_GW, [options.vpcItem.name]),
          stringValue: vpc.virtualPrivateGatewayId!,
        });
      }
    }
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
        if (this.stack.isManagedByAsea(AseaResourceType.EC2_VPC_CIDR, `${vpcItem.name}-${vpcCidr}`)) {
          // CIDR is created by external source. Skipping creation
          continue;
        }
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
      this.createVpcFlowLogs(vpc, vpcFlowLogs, props.useExistingRoles, props.prefixes.accelerator);
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
  private createVpcFlowLogs(
    vpc: Vpc,
    vpcFlowLogs: VpcFlowLogsConfig,
    useExistingRoles: boolean,
    acceleratorPrefix: string,
  ) {
    let logFormat: string | undefined = undefined;
    let destinationBucketArn: string | undefined;
    let overrideS3LogPath: string | undefined = undefined;

    if (vpcFlowLogs.destinations.includes('s3')) {
      destinationBucketArn = cdk.aws_ssm.StringParameter.valueForStringParameter(
        this.stack,
        this.stack.acceleratorResourceNames.parameters.flowLogsDestinationBucketArn,
      );

      if (vpcFlowLogs.destinationsConfig?.s3?.overrideS3LogPath) {
        overrideS3LogPath = vpcFlowLogs.destinationsConfig?.s3?.overrideS3LogPath;
      }
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
      useExistingRoles,
      acceleratorPrefix,
      overrideS3LogPath,
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
   * Add dependency on deleting the default VPC to reduce risk of exceeding service limits
   * @param vpc
   * @param vpcItem
   * @returns
   */
  private addDefaultVpcDependency(vpc: Vpc, vpcItem: VpcConfig | VpcTemplatesConfig): void {
    if (this.deleteDefaultVpc) {
      this.stack.addLogs(LogLevel.INFO, `Adding dependency on deletion of the default VPC for ${vpcItem.name}`);
      vpc.node.addDependency(this.deleteDefaultVpc);
    }
  }

  /**
   * Create a VPC connection for a given VPC
   * @param vpcMap Map<string, Vpc>
   * @param props AcceleratorStackProps
   * @param customResourceHandler cdk.aws_lambda.IFunction | undefined
   * @returns Map<string, string>
   */
  private createVpnConnections(
    vpcMap: Map<string, Vpc>,
    props: AcceleratorStackProps,
    customResourceHandler?: cdk.aws_lambda.IFunction,
  ): Map<string, string> {
    const vpnMap = new Map<string, string>();
    const ipv4Cgws = props.networkConfig.customerGateways?.filter(cgw => isIpv4(cgw.ipAddress));

    for (const cgw of ipv4Cgws ?? []) {
      for (const vpnItem of cgw.vpnConnections ?? []) {
        if (vpnItem.vpc && vpcMap.has(vpnItem.vpc)) {
          //
          // Get CGW ID and VPC
          const customerGatewayId = cdk.aws_ssm.StringParameter.valueForStringParameter(
            this.stack,
            this.stack.getSsmPath(SsmResourceType.CGW, [cgw.name]),
          );
          const vpc = getVpc(vpcMap, vpnItem.vpc) as Vpc;

          this.stack.addLogs(
            LogLevel.INFO,
            `Creating Vpn Connection with Customer Gateway ${cgw.name} to the VPC ${vpnItem.vpc}`,
          );
          const vpn = new VpnConnection(
            this.stack,
            this.setVgwVpnLogicalId(vpc, vpnItem.name),
            this.stack.setVpnProps({
              vpnItem,
              customerGatewayId,
              customResourceHandler,
              virtualPrivateGateway: vpc.virtualPrivateGatewayId,
            }),
          );
          vpnMap.set(`${vpc.name}_${vpnItem.name}`, vpn.vpnConnectionId);
          vpc.vpnConnections.push(vpn);
        }
      }
    }
    return vpnMap;
  }

  /**
   * Sets the logical ID of the VGW VPN.
   * Required for backward compatibility with previous versions --
   * takes into account the possibility of multiple VPNs to the same VGW.
   * @param vpc
   * @param vpnName
   * @returns
   */
  private setVgwVpnLogicalId(vpc: Vpc, vpnName: string): string {
    if (vpc.vpnConnections.length === 0) {
      return pascalCase(`${vpc.name}-VgwVpnConnection`);
    } else {
      return pascalCase(`${vpc.name}${vpnName}-VgwVpnConnection`);
    }
  }

  /**
   * Create cross-account/cross-region SSM parameters for site-to-site VPN connections
   * that must reference the TGW/TGW route table in cross-account VPN scenarios
   * @param vpcResources (VpcConfig | VpcTemplatesConfig)[]
   * @param vpcMap Map<string, Vpc>
   * @param customerGateways CustomerGatewayConfig[]
   * @returns Map<string, SsmParameterProps[]>
   */
  private createSharedParameters(
    vpcResources: (VpcConfig | VpcTemplatesConfig)[],
    vpcMap: Map<string, Vpc>,
    customerGateways?: CustomerGatewayConfig[],
  ): Map<string, SsmParameterProps[]> {
    const sharedParameterMap = new Map<string, SsmParameterProps[]>();
    const vpcNames = vpcResources.map(vpc => vpc.name);
    const vgwVpnCustomerGateways = customerGateways
      ? customerGateways.filter(cgw => cgw.vpnConnections?.filter(vpn => vpcNames.includes(vpn.vpc ?? '')))
      : [];
    const crossAcctFirewallReferenceCgws = vgwVpnCustomerGateways.filter(
      cgw => !isIpv4(cgw.ipAddress) && !this.stack.firewallVpcInScope(cgw),
    );

    for (const crossAcctCgw of crossAcctFirewallReferenceCgws) {
      const firewallVpcConfig = this.stack.getFirewallVpcConfig(crossAcctCgw);
      const accountIds = this.stack.getVpcAccountIds(firewallVpcConfig);
      const parameters = this.setCrossAccountSsmParameters(crossAcctCgw, vpcResources, vpcMap);

      if (parameters.length > 0) {
        console.log(`Putting cross-account/cross-region SSM parameters for VPC ${firewallVpcConfig.name}`);
        // Put SSM parameters
        new PutSsmParameter(this.stack, pascalCase(`${crossAcctCgw.name}VgwVpnSharedParameters`), {
          accountIds,
          region: firewallVpcConfig.region,
          roleName: this.stack.acceleratorResourceNames.roles.crossAccountSsmParameterShare,
          kmsKey: this.stack.cloudwatchKey,
          logRetentionInDays: this.stack.logRetention,
          parameters,
          invokingAccountId: this.stack.account,
          acceleratorPrefix: this.stack.acceleratorPrefix,
        });
        sharedParameterMap.set(crossAcctCgw.name, parameters);
      }
    }
    return sharedParameterMap;
  }

  /**
   * Returns an array of SSM parameters for cross-account VGW VPN connections
   * @param cgw CustomerGatewayConfig
   * @param vpcResources (VpcConfig | VpcTemplatesConfig)[]
   * @param vpcMap Map<string, Vpc>
   * @returns SsmParameterProps[]
   */
  private setCrossAccountSsmParameters(
    cgw: CustomerGatewayConfig,
    vpcResources: (VpcConfig | VpcTemplatesConfig)[],
    vpcMap: Map<string, Vpc>,
  ) {
    const ssmParameters: SsmParameterProps[] = [];

    for (const vpnItem of cgw.vpnConnections ?? []) {
      if (vpnItem.vpc && vpcMap.has(vpnItem.vpc)) {
        //
        // Set VGW ID
        const vpcConfig = getVpcConfig(vpcResources, vpnItem.vpc);
        const vpc = getVpc(vpcMap, vpnItem.vpc) as Vpc;
        ssmParameters.push({
          name: this.stack.getSsmPath(SsmResourceType.CROSS_ACCOUNT_VGW, [cgw.name, vpcConfig.name]),
          value: vpc.virtualPrivateGatewayId ?? '',
        });
      }
    }
    return [...new Set(ssmParameters)];
  }
}
