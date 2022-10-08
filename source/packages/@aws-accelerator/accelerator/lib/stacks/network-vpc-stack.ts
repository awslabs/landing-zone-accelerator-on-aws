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

import * as cdk from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';

import {
  AccountsConfig,
  GwlbConfig,
  NetworkAclSubnetSelection,
  NetworkConfigTypes,
  nonEmptyString,
  OutpostsConfig,
  PrefixListSourceConfig,
  SecurityGroupRuleConfig,
  SecurityGroupSourceConfig,
  SubnetSourceConfig,
  VpcConfig,
  VpcFlowLogsConfig,
  VpcTemplatesConfig,
} from '@aws-accelerator/config';
import {
  DeleteDefaultVpc,
  DhcpOptions,
  GatewayLoadBalancer,
  NatGateway,
  NetworkAcl,
  PrefixList,
  RouteTable,
  SecurityGroup,
  SecurityGroupEgressRuleProps,
  SecurityGroupIngressRuleProps,
  Subnet,
  TransitGatewayAttachment,
  Vpc,
} from '@aws-accelerator/constructs';

import { Logger } from '../logger';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';

export interface SecurityGroupRuleProps {
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

export class NetworkVpcStack extends AcceleratorStack {
  private accountsConfig: AccountsConfig;
  private ipamPoolMap: Map<string, string>;
  private logRetention: number;
  readonly cloudwatchKey: cdk.aws_kms.Key;

  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    // Set private properties
    this.accountsConfig = props.accountsConfig;
    this.logRetention = props.globalConfig.cloudwatchLogRetentionInDays;

    this.cloudwatchKey = cdk.aws_kms.Key.fromKeyArn(
      this,
      'AcceleratorGetCloudWatchKey',
      cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        AcceleratorStack.ACCELERATOR_CLOUDWATCH_LOG_KEY_ARN_PARAMETER_NAME,
      ),
    ) as cdk.aws_kms.Key;

    //
    // Set IPAM map
    //
    this.ipamPoolMap = this.setIpamPoolMap(props);

    //
    // Delete Default VPCs
    //
    if (
      props.networkConfig.defaultVpc?.delete &&
      !this.isAccountExcluded(props.networkConfig.defaultVpc.excludeAccounts)
    ) {
      Logger.info('[network-vpc-stack] Add DeleteDefaultVpc');
      new DeleteDefaultVpc(this, 'DeleteDefaultVpc', {
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
      });
    }

    // Build map of Transit Gateways. We need to know the transit gateway ids so
    // we can create attachments against them. Transit gateways that were
    // generated outside this account should have been shared during the
    // previous stack phase
    const transitGatewayIds = new Map<string, string>();

    // Keep track of all the external accounts that will need to be able to list
    // the generated transit gateway attachments
    const transitGatewayAccountIds: string[] = [];
    for (const vpcItem of [...props.networkConfig.vpcs, ...(props.networkConfig.vpcTemplates ?? [])] ?? []) {
      // Get account IDs
      const vpcAccountIds = this.getVpcAccountIds(vpcItem);

      if (vpcAccountIds.includes(cdk.Stack.of(this).account) && vpcItem.region === cdk.Stack.of(this).region) {
        for (const attachment of vpcItem.transitGatewayAttachments ?? []) {
          Logger.info(`[network-vpc-stack] Evaluating Transit Gateway key ${attachment.transitGateway.name}`);

          // Keep looking if already entered
          if (transitGatewayIds.has(attachment.transitGateway.name)) {
            Logger.info(`[network-vpc-stack] Transit Gateway ${attachment.transitGateway.name} already in dictionary`);
            continue;
          }

          Logger.info(
            `[network-vpc-stack] Transit Gateway key ${attachment.transitGateway.name} is not in map, add resources to look up`,
          );
          const owningAccountId = this.accountsConfig.getAccountId(attachment.transitGateway.account);

          // If owning account is this account, transit gateway id can be
          // retrieved from ssm parameter store
          if (owningAccountId === cdk.Stack.of(this).account) {
            const transitGatewayId = cdk.aws_ssm.StringParameter.valueForStringParameter(
              this,
              `/accelerator/network/transitGateways/${attachment.transitGateway.name}/id`,
            );

            Logger.info(
              `[network-vpc-stack] Adding [${attachment.transitGateway.name}]: ${transitGatewayId} to transitGatewayIds Map`,
            );
            transitGatewayIds.set(attachment.transitGateway.name, transitGatewayId);
          }
          // Else, need to get the transit gateway from the resource shares
          else {
            // Add to transitGatewayAccountIds list so we can create a cross
            // account access role to list the created attachments
            if (transitGatewayAccountIds.indexOf(owningAccountId) == -1) {
              transitGatewayAccountIds.push(owningAccountId);
            }

            // Get the resource share related to the transit gateway
            const tgwId = this.getResourceShare(
              `${attachment.transitGateway.name}_TransitGatewayShare`,
              'ec2:TransitGateway',
              owningAccountId,
              this.cloudwatchKey,
            ).resourceShareItemId;

            Logger.info(
              `[network-vpc-stack] Adding [${attachment.transitGateway.name}]: ${tgwId} to transitGatewayIds Map`,
            );
            transitGatewayIds.set(attachment.transitGateway.name, tgwId);
          }
        }
      }
    }

    // Create cross account access role to read transit gateway attachments if
    // there are other accounts in the list
    if (transitGatewayAccountIds.length > 0) {
      Logger.info(`[network-vpc-stack] Create IAM Cross Account Access Role`);

      const principals: cdk.aws_iam.PrincipalBase[] = [];
      transitGatewayAccountIds.forEach(accountId => {
        principals.push(new cdk.aws_iam.AccountPrincipal(accountId));
      });
      new cdk.aws_iam.Role(this, 'DescribeTgwAttachRole', {
        roleName: `AWSAccelerator-DescribeTgwAttachRole-${cdk.Stack.of(this).region}`,
        assumedBy: new cdk.aws_iam.CompositePrincipal(...principals),
        inlinePolicies: {
          default: new cdk.aws_iam.PolicyDocument({
            statements: [
              new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                actions: ['ec2:DescribeTransitGatewayAttachments'],
                resources: ['*'],
              }),
            ],
          }),
        },
      });

      // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
      // rule suppression with evidence for this permission.
      NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/DescribeTgwAttachRole/Resource`, [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'DescribeTgwAttachRole needs access to every describe each transit gateway attachment in the account',
        },
      ]);
    }

    //
    // Check to see if useCentralEndpoints is enabled for any other VPC within
    // this account and region. If so, we will need to create a cross account
    // access role (if we're in a different account)
    //
    let useCentralEndpoints = false;
    for (const vpcItem of [...props.networkConfig.vpcs, ...(props.networkConfig.vpcTemplates ?? [])] ?? []) {
      // Get account IDs
      const vpcAccountIds = this.getVpcAccountIds(vpcItem);

      if (vpcAccountIds.includes(cdk.Stack.of(this).account) && vpcItem.region === cdk.Stack.of(this).region) {
        if (vpcItem.useCentralEndpoints) {
          if (props.partition !== 'aws' && props.partition !== 'aws-cn') {
            throw new Error(
              'useCentralEndpoints set to true, but AWS Partition is not commercial. Please change it to false.',
            );
          }

          useCentralEndpoints = true;
        }
      }
    }

    //
    // Find and validate the central endpoints vpc
    //
    let centralEndpointVpc = undefined;
    if (useCentralEndpoints) {
      Logger.info('[network-vpc-stack] VPC found in this account with useCentralEndpoints set to true');

      // Find the central endpoints vpc (should only be one)
      const centralEndpointVpcs = props.networkConfig.vpcs.filter(
        item => item.interfaceEndpoints?.central && item.region === cdk.Stack.of(this).region,
      );
      if (centralEndpointVpcs.length === 0) {
        throw new Error('useCentralEndpoints set to true, but no central endpoint vpc detected, should be exactly one');
      }
      if (centralEndpointVpcs.length > 1) {
        throw new Error(
          'useCentralEndpoints set to true, but multiple central endpoint vpcs detected, should only be one',
        );
      }
      centralEndpointVpc = centralEndpointVpcs[0];
    }

    //
    // Using central endpoints, create a cross account access role, if in
    // external account
    //
    if (centralEndpointVpc) {
      const centralEndpointVpcAccountId = this.accountsConfig.getAccountId(centralEndpointVpc.account);
      if (centralEndpointVpcAccountId !== cdk.Stack.of(this).account) {
        Logger.info(
          '[network-vpc-stack] Central Endpoints VPC is in an external account, create a role to enable central endpoints',
        );
        new cdk.aws_iam.Role(this, 'EnableCentralEndpointsRole', {
          roleName: `AWSAccelerator-EnableCentralEndpointsRole-${cdk.Stack.of(this).region}`,
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
          this,
          `${this.stackName}/EnableCentralEndpointsRole/Resource/Resource`,
          [
            {
              id: 'AwsSolutions-IAM5',
              reason: 'EnableCentralEndpointsRole needs access to every describe every VPC in the account ',
            },
          ],
        );
      }
    }

    //
    // Loop through VPC peering entries. Determine if accepter VPC is in external account.
    // Add VPC peering role to external account IDs if necessary
    //
    const vpcPeeringAccountIds: string[] = [];
    for (const peering of props.networkConfig.vpcPeering ?? []) {
      // Check to ensure only two VPCs are defined
      if (peering.vpcs.length > 2) {
        throw new Error(`[network-vpc-stack] VPC peering connection ${peering.name} has more than two VPCs defined`);
      }

      // Get requester and accepter VPC configurations
      const requesterVpc = props.networkConfig.vpcs.filter(item => item.name === peering.vpcs[0]);
      const accepterVpc = props.networkConfig.vpcs.filter(item => item.name === peering.vpcs[1]);

      if (requesterVpc.length === 1 && accepterVpc.length === 1) {
        const requesterAccountId = props.accountsConfig.getAccountId(requesterVpc[0].account);
        const accepterAccountId = props.accountsConfig.getAccountId(accepterVpc[0].account);

        // Check for different account peering -- only add IAM role to accepter account
        if (cdk.Stack.of(this).account === accepterAccountId && cdk.Stack.of(this).region === accepterVpc[0].region) {
          if (requesterAccountId !== accepterAccountId && !vpcPeeringAccountIds.includes(requesterAccountId)) {
            vpcPeeringAccountIds.push(requesterAccountId);
          }
        }
      } else if (requesterVpc.length === 0) {
        throw new Error(`[network-vpc-stack] Requester VPC ${peering.vpcs[0]} is undefined`);
      } else if (accepterVpc.length === 0) {
        throw new Error(`[network-vpc-stack] Accepter VPC ${peering.vpcs[1]} is undefined`);
      } else {
        throw new Error(`[network-vpc-stack] network-config.yaml cannot contain VPCs with the same name`);
      }
    }

    //
    // Create VPC peering role
    //
    if (vpcPeeringAccountIds.length > 0) {
      Logger.info(`[network-vpc-stack] Create cross-account IAM role for VPC peering`);

      const principals: cdk.aws_iam.PrincipalBase[] = [];
      vpcPeeringAccountIds.forEach(accountId => {
        principals.push(new cdk.aws_iam.AccountPrincipal(accountId));
      });
      new cdk.aws_iam.Role(this, 'VpcPeeringRole', {
        roleName: `AWSAccelerator-VpcPeeringRole-${cdk.Stack.of(this).region}`,
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
                actions: ['ssm:DeleteParameter', 'ssm:PutParameter'],
                resources: [
                  `arn:${cdk.Aws.PARTITION}:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter/accelerator/network/vpcPeering/*`,
                ],
              }),
              new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                actions: ['ssm:GetParameter'],
                resources: [
                  `arn:${cdk.Aws.PARTITION}:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter/accelerator/network/vpc/*`,
                ],
              }),
            ],
          }),
        },
      });

      // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
      // rule suppression with evidence for this permission.
      NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/VpcPeeringRole/Resource`, [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'VpcPeeringRole needs access to create peering connections for VPCs in the account ',
        },
      ]);
    }

    //
    // Create DHCP options
    //
    // Create map to store DHCP options
    const dhcpOptionsIds = new Map<string, string>();

    for (const dhcpItem of props.networkConfig.dhcpOptions ?? []) {
      // Check if the set belongs in this account/region
      const accountIds = dhcpItem.accounts.map(item => {
        return this.accountsConfig.getAccountId(item);
      });
      const regions = dhcpItem.regions.map(item => {
        return item.toString();
      });

      if (accountIds.includes(cdk.Stack.of(this).account) && regions.includes(cdk.Stack.of(this).region)) {
        Logger.info(`[network-vpc-stack] Adding DHCP options set ${dhcpItem.name}`);

        const optionSet = new DhcpOptions(this, pascalCase(`${dhcpItem.name}DhcpOpts`), {
          name: dhcpItem.name,
          domainName: dhcpItem.domainName,
          domainNameServers: dhcpItem.domainNameServers,
          netbiosNameServers: dhcpItem.netbiosNameServers,
          netbiosNodeType: dhcpItem.netbiosNodeType,
          ntpServers: dhcpItem.ntpServers,
          tags: dhcpItem.tags ?? [], //Default passing an empty array for name tag
        });
        dhcpOptionsIds.set(optionSet.name, optionSet.dhcpOptionsId);
      }
    }

    //
    // Create Prefix Lists
    //
    // Create map to store Prefix List
    const prefixListMap = new Map<string, PrefixList>();

    for (const prefixListItem of props.networkConfig.prefixLists ?? []) {
      // Check if the set belongs in this account/region
      const accountIds = prefixListItem.accounts.map(item => {
        return this.accountsConfig.getAccountId(item);
      });
      const regions = prefixListItem.regions.map(item => {
        return item.toString();
      });

      if (accountIds.includes(cdk.Stack.of(this).account) && regions.includes(cdk.Stack.of(this).region)) {
        Logger.info(`[network-vpc-stack] Adding Prefix List ${prefixListItem.name}`);

        const prefixList = new PrefixList(this, pascalCase(`${prefixListItem.name}PrefixList`), {
          name: prefixListItem.name,
          addressFamily: prefixListItem.addressFamily,
          maxEntries: prefixListItem.maxEntries,
          entries: prefixListItem.entries,
          tags: prefixListItem.tags ?? [],
        });

        prefixListMap.set(prefixListItem.name, prefixList);

        new cdk.aws_ssm.StringParameter(this, pascalCase(`SsmParam${pascalCase(prefixListItem.name)}PrefixList`), {
          parameterName: `/accelerator/network/prefixList/${prefixListItem.name}/id`,
          stringValue: prefixList.prefixListId,
        });
      }
    }

    //
    // Evaluate VPC entries
    //

    for (const vpcItem of [...props.networkConfig.vpcs, ...(props.networkConfig.vpcTemplates ?? [])] ?? []) {
      // Get account IDs
      const vpcAccountIds = this.getVpcAccountIds(vpcItem);

      if (vpcAccountIds.includes(cdk.Stack.of(this).account) && vpcItem.region === cdk.Stack.of(this).region) {
        Logger.info(`[network-vpc-stack] Adding VPC ${vpcItem.name}`);

        //
        // Determine if using IPAM or manual CIDRs
        //
        let cidr: string | undefined = undefined;
        let poolId: string | undefined = undefined;
        let poolNetmask: number | undefined = undefined;
        if (NetworkConfigTypes.vpcConfig.is(vpcItem)) {
          // Get first CIDR in array
          if (vpcItem.cidrs) {
            cidr = vpcItem.cidrs[0];
          }
        }

        // Get IPAM details
        if (vpcItem.ipamAllocations) {
          poolId = this.ipamPoolMap.get(vpcItem.ipamAllocations[0].ipamPoolName);
          if (!poolId) {
            throw new Error(
              `[network-vpc-stack] ${vpcItem.name}: unable to locate IPAM pool ${vpcItem.ipamAllocations[0].ipamPoolName}`,
            );
          }
          poolNetmask = vpcItem.ipamAllocations[0].netmaskLength;
        }

        //
        // Create the VPC
        //
        const vpc = new Vpc(this, pascalCase(`${vpcItem.name}Vpc`), {
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
        });
        new cdk.aws_ssm.StringParameter(this, pascalCase(`SsmParam${pascalCase(vpcItem.name)}VpcId`), {
          parameterName: `/accelerator/network/vpc/${vpcItem.name}/id`,
          stringValue: vpc.vpcId,
        });

        // Create additional CIDRs or IPAM allocations as needed
        if (NetworkConfigTypes.vpcConfig.is(vpcItem)) {
          if (vpcItem.cidrs && vpcItem.cidrs.length > 1) {
            for (const vpcCidr of vpcItem.cidrs.slice(1)) {
              Logger.info(`[network-vpc-stack] Adding secondary CIDR ${vpcCidr} to VPC ${vpcItem.name}`);
              vpc.addCidr({ cidrBlock: vpcCidr });
            }
          }
        }

        if (vpcItem.ipamAllocations && vpcItem.ipamAllocations.length > 1) {
          for (const alloc of vpcItem.ipamAllocations.slice(1)) {
            Logger.info(
              `[network-vpc-stack] Adding secondary IPAM allocation with netmask ${alloc.netmaskLength} to VPC ${vpcItem.name}`,
            );
            poolId = this.ipamPoolMap.get(alloc.ipamPoolName);
            if (!poolId) {
              throw new Error(`[network-vpc-stack] ${vpcItem.name}: unable to locate IPAM pool ${alloc.ipamPoolName}`);
            }
            vpc.addCidr({ ipv4IpamPoolId: poolId, ipv4NetmaskLength: alloc.netmaskLength });
          }
        }

        //
        // Tag the VPC if central endpoints are enabled. These tags are used to
        // identify which VPCs in a target account to create private hosted zone
        // associations for.
        //
        if (vpcItem.useCentralEndpoints && props.partition !== 'aws' && props.partition !== 'aws-cn') {
          throw new Error(
            'useCentralEndpoints set to true, but AWS Partition is not commercial. No tags will be added',
          );
        }

        if (vpcItem.useCentralEndpoints) {
          if (!centralEndpointVpc) {
            throw new Error('Attempting to use central endpoints with no Central Endpoints defined');
          }
          cdk.Tags.of(vpc).add('accelerator:use-central-endpoints', 'true');
          cdk.Tags.of(vpc).add(
            'accelerator:central-endpoints-account-id',
            this.accountsConfig.getAccountId(centralEndpointVpc.account),
          );
        }

        //
        // Create VPC Flow Log
        //
        this.createVpcFlowLogs(vpcItem, vpc);

        // Get Outpost Info
        let outpostMap = new Map<string, OutpostsConfig>();
        let outpostRouteTableMap = new Map<string, RouteTable>();
        if (NetworkConfigTypes.vpcConfig.is(vpcItem)) {
          outpostMap = this.getOutpostMap(vpcItem);
          outpostRouteTableMap = this.getOutpostRouteTables(vpcItem, vpc);
          this.associateLocalGatewayRouteTablesToVpc({
            vpcAccountName: vpcItem.account,
            routeTables: outpostRouteTableMap,
            vpcId: vpc.vpcId,
            vpcName: vpcItem.name,
          });
        }
        //
        // Create Route Tables
        //
        const routeTableMap = this.createRouteTables(vpcItem, vpc);
        //
        // Add outposts route tables to route table map and associate route tables to VPC
        //
        for (const [key, value] of outpostRouteTableMap) {
          routeTableMap.set(key, value);
        }

        //
        // Create Route Table SSM Parameters
        //
        for (const [routeTableName, routeTableInfo] of routeTableMap) {
          new cdk.aws_ssm.StringParameter(
            this,
            pascalCase(`SsmParam${pascalCase(vpcItem.name)}${pascalCase(routeTableName)}RouteTableId`),
            {
              parameterName: `/accelerator/network/vpc/${vpcItem.name}/routeTable/${routeTableName}/id`,
              stringValue: routeTableInfo.routeTableId,
            },
          );
        }

        //
        // Create Subnets
        //

        const subnetMap = new Map<string, Subnet>();
        const ipamSubnetMap = new Map<number, Subnet>();

        let index = 0;

        for (const subnetItem of vpcItem.subnets ?? []) {
          if (subnetItem.ipv4CidrBlock && subnetItem.ipamAllocation) {
            throw new Error(
              `[network-vpc-stack] Subnet ${subnetItem.name} includes ipv4CidrBlock and ipamAllocation properties. Please choose only one.`,
            );
          }
          Logger.info(`[network-vpc-stack] Adding subnet ${subnetItem.name}`);

          // Get route table for subnet association
          const routeTable = routeTableMap.get(subnetItem.routeTable);
          if (!routeTable) {
            throw new Error(
              `[network-vpc-stack] Error creating subnet ${subnetItem.name}: route table ${subnetItem.routeTable} not defined`,
            );
          }
          const outpost = outpostMap.get(subnetItem.outpost || '');

          // Set the AZ

          let availabilityZone;
          if (subnetItem.availabilityZone) {
            availabilityZone = `${cdk.Stack.of(this).region}${subnetItem.availabilityZone}`;
          } else if (outpost?.availabilityZone) {
            availabilityZone = outpost.availabilityZone;
          }

          if (!availabilityZone) {
            throw new Error(
              `[network-vpc-stack] Error creating subnet ${subnetItem.name}: Availability Zone not defined.`,
            );
          }
          // Check for base IPAM pool CIDRs in config
          let basePool: string[] | undefined = undefined;
          if (subnetItem.ipamAllocation) {
            for (const ipam of props.networkConfig.centralNetworkServices!.ipams!) {
              const pool = ipam.pools?.find(item => item.name === subnetItem.ipamAllocation!.ipamPoolName);
              basePool = pool?.provisionedCidrs;
            }

            if (!basePool) {
              throw new Error(
                `[network-vpc-stack] Error creating subnet ${subnetItem.name}: IPAM pool ${subnetItem.ipamAllocation.ipamPoolName} not defined`,
              );
            }
          }

          // Create subnet
          const subnet = new Subnet(this, pascalCase(`${vpcItem.name}Vpc`) + pascalCase(`${subnetItem.name}Subnet`), {
            name: subnetItem.name,
            availabilityZone,
            basePool,
            ipamAllocation: subnetItem.ipamAllocation,
            ipv4CidrBlock: subnetItem.ipv4CidrBlock,
            kmsKey: this.cloudwatchKey,
            logRetentionInDays: this.logRetention,
            mapPublicIpOnLaunch: subnetItem.mapPublicIpOnLaunch,
            routeTable,
            vpc,
            tags: subnetItem.tags,
            outpost,
          });

          subnetMap.set(subnetItem.name, subnet);
          new cdk.aws_ssm.StringParameter(
            this,
            pascalCase(`SsmParam${pascalCase(vpcItem.name) + pascalCase(subnetItem.name)}SubnetId`),
            {
              parameterName: `/accelerator/network/vpc/${vpcItem.name}/subnet/${subnetItem.name}/id`,
              stringValue: subnet.subnetId,
            },
          );

          // Need to ensure IPAM subnets are created one at a time to avoid duplicate allocations
          // Add dependency on previously-created IPAM subnet, if it exists
          if (subnetItem.ipamAllocation) {
            ipamSubnetMap.set(index, subnet);

            if (index > 0) {
              const lastSubnet = ipamSubnetMap.get(index - 1);

              if (!lastSubnet) {
                throw new Error(
                  `[network-vpc-stack] Error creating subnet ${subnetItem.name}: previous IPAM subnet undefined`,
                );
              }
              subnet.node.addDependency(lastSubnet);
            }
            index += 1;
          }

          if (subnetItem.shareTargets) {
            Logger.info(`[network-vpc-stack] Share subnet`);
            this.addResourceShare(subnetItem, `${subnetItem.name}_SubnetShare`, [subnet.subnetArn]);
          }
        }

        //
        // Create NAT Gateways
        //
        const natGatewayMap = new Map<string, NatGateway>();
        for (const natGatewayItem of vpcItem.natGateways ?? []) {
          Logger.info(`[network-vpc-stack] Adding NAT Gateway ${natGatewayItem.name}`);

          const subnet = subnetMap.get(natGatewayItem.subnet);
          if (subnet === undefined) {
            throw new Error(`Subnet ${natGatewayItem.subnet} not defined`);
          }

          const natGateway = new NatGateway(
            this,
            pascalCase(`${vpcItem.name}Vpc`) + pascalCase(`${natGatewayItem.name}NatGateway`),
            {
              name: natGatewayItem.name,
              subnet,
              tags: natGatewayItem.tags,
            },
          );
          natGatewayMap.set(natGatewayItem.name, natGateway);
          new cdk.aws_ssm.StringParameter(
            this,
            pascalCase(`SsmParam${pascalCase(vpcItem.name) + pascalCase(natGatewayItem.name)}NatGatewayId`),
            {
              parameterName: `/accelerator/network/vpc/${vpcItem.name}/natGateway/${natGatewayItem.name}/id`,
              stringValue: natGateway.natGatewayId,
            },
          );
        }

        //
        // Create Transit Gateway Attachments
        //
        const transitGatewayAttachments = new Map<string, TransitGatewayAttachment>();
        for (const tgwAttachmentItem of vpcItem.transitGatewayAttachments ?? []) {
          Logger.info(
            `[network-vpc-stack] Adding Transit Gateway Attachment for ${tgwAttachmentItem.transitGateway.name}`,
          );

          const transitGatewayId = transitGatewayIds.get(tgwAttachmentItem.transitGateway.name);
          if (transitGatewayId === undefined) {
            throw new Error(`Transit Gateway ${tgwAttachmentItem.transitGateway.name} not found`);
          }

          const subnetIds: string[] = [];
          for (const subnetItem of tgwAttachmentItem.subnets ?? []) {
            const subnet = subnetMap.get(subnetItem);
            if (subnet === undefined) {
              throw new Error(`Subnet ${subnetItem} not defined`);
            }
            subnetIds.push(subnet.subnetId);
          }

          const attachment = new TransitGatewayAttachment(
            this,
            pascalCase(`${tgwAttachmentItem.name}VpcTransitGatewayAttachment`),
            {
              name: tgwAttachmentItem.name,
              partition: this.props.partition,
              transitGatewayId,
              subnetIds,
              vpcId: vpc.vpcId,
              options: tgwAttachmentItem.options,
              tags: tgwAttachmentItem.tags,
            },
          );
          transitGatewayAttachments.set(tgwAttachmentItem.transitGateway.name, attachment);
          new cdk.aws_ssm.StringParameter(
            this,
            pascalCase(
              `SsmParam${pascalCase(vpcItem.name) + pascalCase(tgwAttachmentItem.name)}TransitGatewayAttachmentId`,
            ),
            {
              parameterName: `/accelerator/network/vpc/${vpcItem.name}/transitGatewayAttachment/${tgwAttachmentItem.name}/id`,
              stringValue: attachment.transitGatewayAttachmentId,
            },
          );
        }

        //
        // Create Route Table Entries.
        //
        for (const routeTableItem of vpcItem.routeTables ?? []) {
          const routeTable = routeTableMap.get(routeTableItem.name);

          if (routeTable === undefined) {
            throw new Error(`Route Table ${routeTableItem.name} not found`);
          }

          for (const routeTableEntryItem of routeTableItem.routes ?? []) {
            const routeId =
              pascalCase(`${vpcItem.name}Vpc`) +
              pascalCase(`${routeTableItem.name}RouteTable`) +
              pascalCase(routeTableEntryItem.name);
            const entryTypes = ['transitGateway', 'internetGateway', 'natGateway'];

            // Check if using a prefix list or CIDR as the destination
            if (routeTableEntryItem.type && entryTypes.includes(routeTableEntryItem.type)) {
              let destination: string | undefined = undefined;
              let destinationPrefixListId: string | undefined = undefined;
              if (routeTableEntryItem.destinationPrefixList) {
                // Get PL ID from map
                const prefixList = prefixListMap.get(routeTableEntryItem.destinationPrefixList);
                if (!prefixList) {
                  throw new Error(
                    `[network-vpc-stack] Prefix list ${routeTableEntryItem.destinationPrefixList} not found`,
                  );
                }
                destinationPrefixListId = prefixList.prefixListId;
              } else {
                destination = routeTableEntryItem.destination;
              }

              // Route: Transit Gateway
              if (routeTableEntryItem.type === 'transitGateway') {
                Logger.info(`[network-vpc-stack] Adding Transit Gateway Route Table Entry ${routeTableEntryItem.name}`);

                const transitGatewayId = transitGatewayIds.get(routeTableEntryItem.target!);
                if (transitGatewayId === undefined) {
                  throw new Error(`Transit Gateway ${routeTableEntryItem.target} not found`);
                }

                const transitGatewayAttachment = transitGatewayAttachments.get(routeTableEntryItem.target!);
                if (transitGatewayAttachment === undefined) {
                  throw new Error(`Transit Gateway Attachment ${routeTableEntryItem.target} not found`);
                }

                routeTable.addTransitGatewayRoute(
                  routeId,
                  transitGatewayId,
                  transitGatewayAttachment.node.defaultChild as cdk.aws_ec2.CfnTransitGatewayAttachment,
                  destination,
                  destinationPrefixListId,
                  this.cloudwatchKey,
                  this.logRetention,
                );
              }

              // Route: NAT Gateway
              if (routeTableEntryItem.type === 'natGateway') {
                Logger.info(`[network-vpc-stack] Adding NAT Gateway Route Table Entry ${routeTableEntryItem.name}`);

                const natGateway = natGatewayMap.get(routeTableEntryItem.target!);
                if (natGateway === undefined) {
                  throw new Error(`NAT Gateway ${routeTableEntryItem.target} not found`);
                }

                routeTable.addNatGatewayRoute(
                  routeId,
                  natGateway.natGatewayId,
                  destination,
                  destinationPrefixListId,
                  this.cloudwatchKey,
                  this.logRetention,
                );
              }

              // Route: Internet Gateway
              if (routeTableEntryItem.type === 'internetGateway') {
                Logger.info(
                  `[network-vpc-stack] Adding Internet Gateway Route Table Entry ${routeTableEntryItem.name}`,
                );
                routeTable.addInternetGatewayRoute(
                  routeId,
                  destination,
                  destinationPrefixListId,
                  this.cloudwatchKey,
                  this.logRetention,
                );
              }
            }
          }
        }

        //
        // Add Security Groups
        //
        const securityGroupMap = new Map<string, SecurityGroup>();

        for (const securityGroupItem of vpcItem.securityGroups ?? []) {
          const processedIngressRules: SecurityGroupIngressRuleProps[] = [];
          const processedEgressRules: SecurityGroupEgressRuleProps[] = [];

          Logger.info(`[network-vpc-stack] Adding rules to ${securityGroupItem.name}`);

          // Add ingress rules
          for (const [ruleId, ingressRuleItem] of securityGroupItem.inboundRules.entries() ?? []) {
            Logger.info(`[network-vpc-stack] Adding ingress rule ${ruleId} to ${securityGroupItem.name}`);

            const ingressRules: SecurityGroupRuleProps[] = this.processSecurityGroupRules(
              ingressRuleItem,
              prefixListMap,
            );

            Logger.info(`[network-vpc-stack] Adding ${ingressRules.length} ingress rules`);

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

          // Add egress rules
          for (const [ruleId, egressRuleItem] of securityGroupItem.outboundRules.entries() ?? []) {
            Logger.info(`[network-vpc-stack] Adding egress rule ${ruleId} to ${securityGroupItem.name}`);

            const egressRules: SecurityGroupRuleProps[] = this.processSecurityGroupRules(egressRuleItem, prefixListMap);

            Logger.info(`[network-vpc-stack] Adding ${egressRules.length} egress rules`);

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

          // Create security group
          Logger.info(`[network-vpc-stack] Adding Security Group ${securityGroupItem.name}`);
          const securityGroup = new SecurityGroup(
            this,
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
          securityGroupMap.set(securityGroupItem.name, securityGroup);

          new cdk.aws_ssm.StringParameter(
            this,
            pascalCase(`SsmParam${pascalCase(vpcItem.name) + pascalCase(securityGroupItem.name)}SecurityGroup`),
            {
              parameterName: `/accelerator/network/vpc/${vpcItem.name}/securityGroup/${securityGroupItem.name}/id`,
              stringValue: securityGroup.securityGroupId,
            },
          );
        }

        // Add security group references
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
              const securityGroup = securityGroupMap.get(securityGroupItem.name);

              if (!securityGroup) {
                throw new Error(`[network-vpc-stack] Unable to locate security group ${securityGroupItem.name}`);
              }

              const ingressRules: SecurityGroupRuleProps[] = this.processSecurityGroupRules(
                ingressRuleItem,
                prefixListMap,
                securityGroupMap,
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

          for (const [ruleId, egressRuleItem] of securityGroupItem.outboundRules.entries() ?? []) {
            // Check if rule destinations include a security group reference
            let includesSecurityGroupSource = false;
            for (const source of egressRuleItem.sources) {
              if (NetworkConfigTypes.securityGroupSourceConfig.is(source)) {
                includesSecurityGroupSource = true;
              }
            }

            // Add security group sources if they exist
            if (includesSecurityGroupSource) {
              const securityGroup = securityGroupMap.get(securityGroupItem.name);

              if (!securityGroup) {
                throw new Error(`[network-vpc-stack] Unable to locate security group ${securityGroupItem.name}`);
              }

              const egressRules: SecurityGroupRuleProps[] = this.processSecurityGroupRules(
                egressRuleItem,
                prefixListMap,
                securityGroupMap,
              );

              for (const [egressRulesIndex, egressRule] of egressRules.entries()) {
                if (egressRule.targetSecurityGroup) {
                  securityGroup.addEgressRule(`${securityGroupItem.name}-Egress-${ruleId}-${egressRulesIndex}`, {
                    destinationSecurityGroup: egressRule.targetSecurityGroup,
                    ...egressRule,
                  });
                }
              }
            }
          }
        }
        //
        // Create NACLs
        //
        for (const naclItem of vpcItem.networkAcls ?? []) {
          Logger.info(`[network-vpc-stack] Adding Network ACL ${naclItem.name}`);

          const networkAcl = new NetworkAcl(this, `${pascalCase(vpcItem.name)}Vpc${pascalCase(naclItem.name)}Nacl`, {
            networkAclName: naclItem.name,
            vpc,
            tags: naclItem.tags,
          });
          // Suppression for AwsSolutions-VPC3: A Network ACL or Network ACL entry has been implemented.
          NagSuppressions.addResourceSuppressions(
            networkAcl,
            [{ id: 'AwsSolutions-VPC3', reason: 'NACL added to VPC' }],
            true,
          );

          new cdk.aws_ssm.StringParameter(
            this,
            pascalCase(`SsmParam${pascalCase(vpcItem.name)}${pascalCase(naclItem.name)}Nacl`),
            {
              parameterName: `/accelerator/network/vpc/${vpcItem.name}/networkAcl/${naclItem.name}/id`,
              stringValue: networkAcl.networkAclId,
            },
          );

          for (const subnetItem of naclItem.subnetAssociations) {
            Logger.info(`[network-vpc-stack] Associate ${naclItem.name} to subnet ${subnetItem}`);
            const subnet = subnetMap.get(subnetItem);
            if (subnet === undefined) {
              throw new Error(`Subnet ${subnetItem} not defined`);
            }
            networkAcl.associateSubnet(
              `${pascalCase(vpcItem.name)}Vpc${pascalCase(naclItem.name)}NaclAssociate${pascalCase(subnetItem)}`,
              {
                subnet,
              },
            );
          }

          for (const inboundRuleItem of naclItem.inboundRules ?? []) {
            Logger.info(`[network-vpc-stack] Adding inbound rule ${inboundRuleItem.rule} to ${naclItem.name}`);
            const inboundAclTargetProps: { cidrBlock?: string; ipv6CidrBlock?: string } = this.processNetworkAclTarget(
              inboundRuleItem.source,
            );

            Logger.info(`[network-vpc-stack] Adding inbound entries`);
            networkAcl.addEntry(
              `${pascalCase(vpcItem.name)}Vpc${pascalCase(naclItem.name)}-Inbound-${inboundRuleItem.rule}`,
              {
                egress: false,
                protocol: inboundRuleItem.protocol,
                ruleAction: inboundRuleItem.action,
                ruleNumber: inboundRuleItem.rule,
                portRange: {
                  from: inboundRuleItem.fromPort,
                  to: inboundRuleItem.toPort,
                },
                ...inboundAclTargetProps,
              },
            );
            // Suppression for AwsSolutions-VPC3: A Network ACL or Network ACL entry has been implemented.
            NagSuppressions.addResourceSuppressionsByPath(
              this,
              `${this.stackName}/${pascalCase(vpcItem.name)}Vpc${pascalCase(naclItem.name)}Nacl/${pascalCase(
                vpcItem.name,
              )}Vpc${pascalCase(naclItem.name)}-Inbound-${inboundRuleItem.rule}`,
              [{ id: 'AwsSolutions-VPC3', reason: 'NACL added to VPC' }],
            );
          }

          for (const outboundRuleItem of naclItem.outboundRules ?? []) {
            Logger.info(`[network-vpc-stack] Adding outbound rule ${outboundRuleItem.rule} to ${naclItem.name}`);
            const outboundAclTargetProps: { cidrBlock?: string; ipv6CidrBlock?: string } = this.processNetworkAclTarget(
              outboundRuleItem.destination,
            );

            Logger.info(`[network-vpc-stack] Adding outbound entries`);
            networkAcl.addEntry(
              `${pascalCase(vpcItem.name)}Vpc${pascalCase(naclItem.name)}-Outbound-${outboundRuleItem.rule}`,
              {
                egress: true,
                protocol: outboundRuleItem.protocol,
                ruleAction: outboundRuleItem.action,
                ruleNumber: outboundRuleItem.rule,
                portRange: {
                  from: outboundRuleItem.fromPort,
                  to: outboundRuleItem.toPort,
                },
                ...outboundAclTargetProps,
              },
            );
            // Suppression for AwsSolutions-VPC3: A Network ACL or Network ACL entry has been implemented.
            NagSuppressions.addResourceSuppressionsByPath(
              this,
              `${this.stackName}/${pascalCase(vpcItem.name)}Vpc${pascalCase(naclItem.name)}Nacl/${pascalCase(
                vpcItem.name,
              )}Vpc${pascalCase(naclItem.name)}-Outbound-${outboundRuleItem.rule}`,
              [{ id: 'AwsSolutions-VPC3', reason: 'NACL added to VPC' }],
            );
          }
        }

        //
        // Create Gateway Load Balancers
        //
        for (const loadBalancerItem of props.networkConfig.centralNetworkServices?.gatewayLoadBalancers ?? []) {
          if (vpcItem.name === loadBalancerItem.vpc) {
            const delegatedAdminAccountId = this.accountsConfig.getAccountId(
              props.networkConfig.centralNetworkServices!.delegatedAdminAccount,
            );
            if (cdk.Stack.of(this).account !== delegatedAdminAccountId) {
              throw new Error(
                `[network-vpc-stack] Attempting to deploy Gateway Load Balancer ${loadBalancerItem.name} to a VPC outside of the delegated administrator account`,
              );
            }

            this.createGatewayLoadBalancer(loadBalancerItem, subnetMap);
          }
        }
      }
    }
    Logger.info('[network-vpc-stack] Completed stack synthesis');
  }

  private processNetworkAclTarget(target: string | NetworkAclSubnetSelection): {
    cidrBlock?: string;
    ipv6CidrBlock?: string;
  } {
    Logger.info(`[network-vpc-stack] processNetworkAclRules`);

    //
    // IP target
    //
    if (nonEmptyString.is(target)) {
      Logger.info(`[network-vpc-stack] Evaluate IP Target ${target}`);
      if (target.includes('::')) {
        return { ipv6CidrBlock: target };
      } else {
        return { cidrBlock: target };
      }
    }

    //
    // Subnet Source target
    //
    if (NetworkConfigTypes.networkAclSubnetSelection.is(target)) {
      Logger.info(
        `[network-vpc-stack] Evaluate Subnet Source account:${target.account} vpc:${target.vpc} subnets:[${target.subnet}]`,
      );

      // Locate the VPC
      const vpcItem = this.props.networkConfig.vpcs?.find(
        item => item.account === target.account && item.name === target.vpc,
      );
      if (vpcItem === undefined) {
        throw new Error(`Specified VPC ${target.vpc} not defined`);
      }

      // Locate the Subnet
      const subnetItem = vpcItem.subnets?.find(item => item.name === target.subnet);
      if (subnetItem === undefined) {
        throw new Error(`Specified subnet ${target.subnet} not defined`);
      }
      return { cidrBlock: subnetItem.ipv4CidrBlock };
    }

    throw new Error(`Invalid input to processNetworkAclTargets`);
  }

  private processSecurityGroupRules(
    item: SecurityGroupRuleConfig,
    prefixListMap: Map<string, PrefixList>,
    securityGroupMap?: Map<string, SecurityGroup>,
  ): SecurityGroupRuleProps[] {
    const rules: SecurityGroupRuleProps[] = [];

    Logger.info(`[network-vpc-stack] processSecurityGroupRules`);

    if (!item.types) {
      Logger.info(`[network-vpc-stack] types not defined, expecting tcpPorts and udpPorts to be set`);
      for (const port of item.tcpPorts ?? []) {
        Logger.debug(`[network-vpc-stack] Adding TCP port ${port}`);
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
          ),
        );
      }

      for (const port of item.udpPorts ?? []) {
        Logger.debug(`[network-vpc-stack] Adding UDP port ${port}`);
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
          ),
        );
      }
    }

    for (const type of item.types ?? []) {
      Logger.info(`[network-vpc-stack] Adding type ${type}`);
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
  ): SecurityGroupRuleProps[] {
    const rules: SecurityGroupRuleProps[] = [];

    Logger.info(`[network-vpc-stack] processSecurityGroupRuleSources`);

    for (const source of sources ?? []) {
      // Conditional to only process non-security group sources
      if (!securityGroupMap) {
        //
        // IP source
        //
        if (nonEmptyString.is(source)) {
          Logger.info(`[network-vpc-stack] Evaluate IP Source ${source}`);
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
          Logger.info(
            `[network-vpc-stack] Evaluate Subnet Source account:${source.account} vpc:${source.vpc} subnets:[${source.subnets}]`,
          );

          // Locate the VPC
          const vpcItem = this.props.networkConfig.vpcs?.find(
            item => item.account === source.account && item.name === source.vpc,
          );
          if (!vpcItem) {
            throw new Error(`Specified VPC ${source.vpc} not defined`);
          }

          // Loop through all subnets to add
          for (const subnet of source.subnets) {
            // Locate the Subnet
            const subnetItem = vpcItem.subnets?.find(item => item.name === subnet);
            if (!subnetItem) {
              throw new Error(`Specified subnet ${subnet} not defined`);
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
          Logger.info(`[network-vpc-stack] Evaluate Prefix List Source prefixLists:[${source.prefixLists}]`);

          for (const prefixList of source.prefixLists ?? []) {
            const targetPrefixList = prefixListMap.get(prefixList);
            if (!targetPrefixList) {
              throw new Error(`Specified Prefix List ${prefixList} not defined`);
            }
            rules.push({
              targetPrefixList,
              ...props,
            });
          }
        }
      }

      if (securityGroupMap) {
        //
        // Security Group Source
        //
        if (NetworkConfigTypes.securityGroupSourceConfig.is(source)) {
          Logger.info(`[network-vpc-stack] Evaluate Security Group Source securityGroups:[${source.securityGroups}]`);

          for (const securityGroup of source.securityGroups ?? []) {
            const targetSecurityGroup = securityGroupMap.get(securityGroup);
            if (!targetSecurityGroup) {
              throw new Error(`Specified Security Group ${securityGroup} not defined`);
            }
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

  private createGatewayLoadBalancer(loadBalancerItem: GwlbConfig, subnetMap: Map<string, Subnet>): void {
    const allowedPrincipals: string[] = [];
    const subnets: string[] = [];

    // Set account principals
    for (const endpointItem of loadBalancerItem.endpoints) {
      const accountId = this.accountsConfig.getAccountId(endpointItem.account);
      if (!allowedPrincipals.includes(accountId)) {
        allowedPrincipals.push(accountId);
      }
    }

    // Create cross-account role
    if (allowedPrincipals.length > 0) {
      const principals: cdk.aws_iam.PrincipalBase[] = [];
      allowedPrincipals.forEach(accountId => {
        principals.push(new cdk.aws_iam.AccountPrincipal(accountId));
      });
      const role = new cdk.aws_iam.Role(this, `Get${pascalCase(loadBalancerItem.name)}SsmParamRole`, {
        roleName: `AWSAccelerator-Get${pascalCase(loadBalancerItem.name)}SsmParamRole-${cdk.Stack.of(this).region}`,
        assumedBy: new cdk.aws_iam.CompositePrincipal(...principals),
        inlinePolicies: {
          default: new cdk.aws_iam.PolicyDocument({
            statements: [
              new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                actions: ['ssm:GetParameter'],
                resources: [
                  `arn:${cdk.Aws.PARTITION}:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter/accelerator/network/gwlb/${loadBalancerItem.name}/*`,
                ],
              }),
            ],
          }),
        },
      });
      // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
      NagSuppressions.addResourceSuppressions(role, [
        { id: 'AwsSolutions-IAM5', reason: 'Allow cross-account resources to get SSM parameters under this path.' },
      ]);
    }

    // Set subnets
    for (const subnetItem of loadBalancerItem.subnets) {
      const subnet = subnetMap.get(subnetItem);

      if (!subnet) {
        throw new Error(
          `[network-vpc-stack] Create Gateway Load Balancer: unable to find subnet ${subnetItem} in VPC ${loadBalancerItem.vpc}`,
        );
      }

      if (!subnets.includes(subnet.subnetId)) {
        subnets.push(subnet.subnetId);
      }
    }

    // Create GWLB
    Logger.info(
      `[network-vpc-stack] Add Gateway Load Balancer ${loadBalancerItem.name} to VPC ${loadBalancerItem.vpc}`,
    );
    const loadBalancer = new GatewayLoadBalancer(this, `${pascalCase(loadBalancerItem.name)}GatewayLoadBalancer`, {
      name: loadBalancerItem.name,
      allowedPrincipals,
      subnets,
      crossZoneLoadBalancing: loadBalancerItem.crossZoneLoadBalancing,
      deletionProtection: loadBalancerItem.deletionProtection,
      tags: loadBalancerItem.tags,
    });
    new cdk.aws_ssm.StringParameter(this, pascalCase(`SsmParam${pascalCase(loadBalancerItem.name)}GwlbServiceId`), {
      parameterName: `/accelerator/network/gwlb/${loadBalancerItem.name}/endpointService/id`,
      stringValue: loadBalancer.endpointServiceId,
    });

    // AwsSolutions-ELB2: The ELB does not have access logs enabled.
    NagSuppressions.addResourceSuppressions(loadBalancer, [
      { id: 'AwsSolutions-ELB2', reason: 'Gateway Load Balancers do not support access logging.' },
    ]);
  }

  private createRouteTables(vpcItem: VpcConfig | VpcTemplatesConfig, vpc: Vpc): Map<string, RouteTable> {
    const routeTableMap = new Map<string, RouteTable>();
    for (const routeTableItem of vpcItem.routeTables ?? []) {
      const routeTable = new RouteTable(
        this,
        pascalCase(`${vpcItem.name}Vpc`) + pascalCase(`${routeTableItem.name}RouteTable`),
        {
          name: routeTableItem.name,
          vpc,
          tags: routeTableItem.tags,
        },
      );

      // Add gateway association if configured
      if (routeTableItem.gatewayAssociation) {
        routeTable.addGatewayAssociation(routeTableItem.gatewayAssociation);
      }

      routeTableMap.set(routeTableItem.name, routeTable);
    }

    return routeTableMap;
  }

  /**
   * Get outpost route tables
   */
  private getOutpostRouteTables(vpcItem: VpcConfig, vpc: Vpc): Map<string, RouteTable> {
    const outpostRouteTableMap = new Map<string, RouteTable>();
    for (const outpost of vpcItem.outposts ?? []) {
      for (const routeTableItem of outpost.localGateway?.routeTables ?? []) {
        const outpostRouteTable = { routeTableId: routeTableItem.id, vpc } as RouteTable;
        outpostRouteTableMap.set(routeTableItem.name, outpostRouteTable);
      }
    }

    return outpostRouteTableMap;
  }

  private getOutpostMap(vpcItem: VpcConfig): Map<string, OutpostsConfig> {
    const outpostsMap = new Map<string, OutpostsConfig>();
    for (const outpost of vpcItem.outposts ?? []) {
      outpostsMap.set(outpost.name, outpost);
    }

    return outpostsMap;
  }

  private associateLocalGatewayRouteTablesToVpc(localGateway: {
    vpcAccountName: string;
    vpcName: string;
    vpcId: string;
    routeTables: Map<string, RouteTable>;
  }): void {
    for (const [name, routeTable] of localGateway.routeTables) {
      new cdk.aws_ec2.CfnLocalGatewayRouteTableVPCAssociation(
        this,
        `${name}-${localGateway.vpcName}-${localGateway.vpcAccountName}`,
        {
          vpcId: localGateway.vpcId,
          localGatewayRouteTableId: routeTable.routeTableId,
        },
      );
    }
  }

  /**
   * Function to create VPC flow logs
   * @param vpcItem
   * @param vpc
   */
  private createVpcFlowLogs(vpcItem: VpcConfig | VpcTemplatesConfig, vpc: Vpc) {
    let logFormat: string | undefined = undefined;
    let vpcFlowLogs: VpcFlowLogsConfig;
    let destinationBucketArn: string | undefined;

    if (vpcItem.vpcFlowLogs) {
      vpcFlowLogs = vpcItem.vpcFlowLogs;
    } else {
      vpcFlowLogs = this.props.networkConfig.vpcFlowLogs;
    }

    if (vpcFlowLogs.destinations.includes('s3')) {
      destinationBucketArn = cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        AcceleratorStack.ACCELERATOR_VPC_FLOW_LOGS_DESTINATION_S3_BUCKET_ARN_PARAMETER_NAME,
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
      logRetentionInDays: vpcFlowLogs.destinationsConfig?.cloudWatchLogs?.retentionInDays ?? this.logRetention,
      encryptionKey: this.cloudwatchKey,
      bucketArn: destinationBucketArn,
    });
  }

  /**
   * Set IPAM pool map
   * @param props
   * @returns
   */
  private setIpamPoolMap(props: AcceleratorStackProps) {
    const poolMap = new Map<string, string>();

    if (props.networkConfig.centralNetworkServices?.ipams) {
      const delegatedAdminAccountId = this.accountsConfig.getAccountId(
        props.networkConfig.centralNetworkServices!.delegatedAdminAccount,
      );

      for (const vpcItem of [...props.networkConfig.vpcs, ...(props.networkConfig.vpcTemplates ?? [])] ?? []) {
        // Get account IDs
        const vpcAccountIds = this.getVpcAccountIds(vpcItem);

        if (vpcAccountIds.includes(cdk.Stack.of(this).account) && vpcItem.region === cdk.Stack.of(this).region) {
          for (const alloc of vpcItem.ipamAllocations ?? []) {
            if (!poolMap.has(alloc.ipamPoolName)) {
              let poolId: string;
              if (delegatedAdminAccountId === cdk.Stack.of(this).account) {
                poolId = cdk.aws_ssm.StringParameter.valueForStringParameter(
                  this,
                  `/accelerator/network/ipam/pools/${alloc.ipamPoolName}/id`,
                );
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
}
