/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
  NetworkAclSubnetSelection,
  NetworkConfigTypes,
  NfwFirewallConfig,
  nonEmptyString,
  OrganizationConfig,
  PrefixListSourceConfig,
  ResolverEndpointConfig,
  ResolverRuleConfig,
  SecurityGroupRuleConfig,
  SecurityGroupSourceConfig,
  SubnetConfig,
  SubnetSourceConfig,
  VpcConfig,
} from '@aws-accelerator/config';
import {
  DeleteDefaultVpc,
  DhcpOptions,
  HostedZone,
  IResourceShareItem,
  KeyLookup,
  NatGateway,
  NetworkAcl,
  NetworkFirewall,
  Organization,
  PrefixList,
  RecordSet,
  ResolverEndpoint,
  ResolverRule,
  ResourceShare,
  ResourceShareItem,
  ResourceShareOwner,
  RouteTable,
  SecurityGroup,
  Subnet,
  TransitGatewayAttachment,
  Vpc,
  VpcEndpoint,
} from '@aws-accelerator/constructs';

import { Logger } from '../logger';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';
import { KeyStack } from './key-stack';

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

type ResourceShareType = SubnetConfig | ResolverRuleConfig;

export class NetworkVpcStack extends AcceleratorStack {
  private accountsConfig: AccountsConfig;
  private orgConfig: OrganizationConfig;
  private logRetention: number;
  readonly acceleratorKey: cdk.aws_kms.Key;

  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    // Set private properties
    this.accountsConfig = props.accountsConfig;
    this.orgConfig = props.organizationConfig;
    this.logRetention = props.globalConfig.cloudwatchLogRetentionInDays;

    this.acceleratorKey = new KeyLookup(this, 'AcceleratorKeyLookup', {
      accountId: props.accountsConfig.getAuditAccountId(),
      roleName: KeyStack.CROSS_ACCOUNT_ACCESS_ROLE_NAME,
      keyArnParameterName: KeyStack.ACCELERATOR_KEY_ARN_PARAMETER_NAME,
      logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
    }).getKey();

    // Get the organization object, used by Data Protection
    const organization = new Organization(this, 'Organization');

    //
    // Delete Default VPCs
    //
    if (
      props.networkConfig.defaultVpc?.delete &&
      !this.isAccountExcluded(props.networkConfig.defaultVpc.excludeAccounts)
    ) {
      Logger.info('[network-vpc-stack] Add DeleteDefaultVpc');
      new DeleteDefaultVpc(this, 'DeleteDefaultVpc', {
        kmsKey: this.acceleratorKey,
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
    for (const vpcItem of props.networkConfig.vpcs ?? []) {
      const accountId = this.accountsConfig.getAccountId(vpcItem.account);
      // Only care about VPCs to be created in the current account and region
      if (accountId === cdk.Stack.of(this).account && vpcItem.region == cdk.Stack.of(this).region) {
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

    // Get the CentralLogsBucket, if needed to send vpc flow logs to
    let centralLogsBucketArn: string | undefined = undefined;
    if (props.networkConfig.vpcFlowLogs.destinations.includes('s3')) {
      Logger.info(`[network-vpc-stack] S3 destination for VPC flow log detected, obtain the CentralLogsBucket`);

      const centralLogsBucket = cdk.aws_s3.Bucket.fromBucketName(
        this,
        'CentralLogsBucket',
        `aws-accelerator-central-logs-${this.accountsConfig.getLogArchiveAccountId()}-${props.globalConfig.homeRegion}`,
      );
      centralLogsBucketArn = centralLogsBucket.bucketArn;
    }

    // let flowLogsCmk: cdk.aws_kms.Key | undefined = undefined;
    if (props.networkConfig.vpcFlowLogs.destinations.includes('cloud-watch-logs')) {
      Logger.info(`[network-vpc-stack] cwl destination for VPC flow log detected, create a cmk to be used by cwl`);

      // flowLogsCmk = new cdk.aws_kms.Key(this, 'FlowLogsCmk', {
      //   enableKeyRotation: true,
      //   description: 'AWS Accelerator Cloud Watch Logs CMK for VPC Flow Logs',
      //   alias: 'accelerator/vpc-flow-logs/cloud-watch-logs',
      // });

      // flowLogsCmk.addToResourcePolicy(
      //   new cdk.aws_iam.PolicyStatement({
      //     sid: 'Enable IAM User Permissions',
      //     principals: [new cdk.aws_iam.AccountRootPrincipal()],
      //     actions: ['kms:*'],
      //     resources: ['*'],
      //   }),
      // );

      // flowLogsCmk.addToResourcePolicy(
      //   new cdk.aws_iam.PolicyStatement({
      //     sid: 'Allow Cloud Watch Logs access',
      //     principals: [new cdk.aws_iam.ServicePrincipal(`logs.${cdk.Stack.of(this).region}.amazonaws.com`)],
      //     actions: ['kms:Encrypt*', 'kms:Decrypt*', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:Describe*'],
      //     resources: ['*'],
      //     conditions: {
      //       ArnLike: {
      //         'kms:EncryptionContext:aws:logs:arn': `arn:${cdk.Stack.of(this).partition}:logs:${
      //           cdk.Stack.of(this).region
      //         }:${cdk.Stack.of(this).account}:*`,
      //       },
      //     },
      //   }),
      // );
    }

    //
    // Check to see if useCentralEndpoints is enabled for any other VPC within
    // this account and region. If so, we will need to create a cross account
    // access role (if we're in a different account)
    //
    let useCentralEndpoints = false;
    for (const vpcItem of props.networkConfig.vpcs ?? []) {
      const accountId = this.accountsConfig.getAccountId(vpcItem.account);
      if (accountId === cdk.Stack.of(this).account && vpcItem.region == cdk.Stack.of(this).region) {
        if (vpcItem.useCentralEndpoints) {
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
    for (const vpcItem of props.networkConfig.vpcs ?? []) {
      const accountId = this.accountsConfig.getAccountId(vpcItem.account);
      if (accountId === cdk.Stack.of(this).account && vpcItem.region == cdk.Stack.of(this).region) {
        Logger.info(`[network-vpc-stack] Adding VPC ${vpcItem.name}`);

        //
        // Create the VPC
        //
        const vpc = new Vpc(this, pascalCase(`${vpcItem.name}Vpc`), {
          name: vpcItem.name,
          ipv4CidrBlock: vpcItem.cidrs[0],
          internetGateway: vpcItem.internetGateway,
          dhcpOptions: dhcpOptionsIds.get(vpcItem.dhcpOptions ?? ''),
          enableDnsHostnames: vpcItem.enableDnsHostnames ?? true,
          enableDnsSupport: vpcItem.enableDnsSupport ?? true,
          instanceTenancy: vpcItem.instanceTenancy ?? 'default',
          tags: vpcItem.tags,
        });
        new cdk.aws_ssm.StringParameter(this, pascalCase(`SsmParam${pascalCase(vpcItem.name)}VpcId`), {
          parameterName: `/accelerator/network/vpc/${vpcItem.name}/id`,
          stringValue: vpc.vpcId,
        });

        //
        // Tag the VPC if central endpoints are enabled. These tags are used to
        // identify which VPCs in a target account to create private hosted zone
        // associations for.
        //
        if (vpcItem.useCentralEndpoints) {
          if (centralEndpointVpc === undefined) {
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
        let logFormat: string | undefined = undefined;
        if (!props.networkConfig.vpcFlowLogs.defaultFormat) {
          logFormat = props.networkConfig.vpcFlowLogs.customFields.map(c => `$\{${c}}`).join(' ');
        }
        vpc.addFlowLogs({
          destinations: props.networkConfig.vpcFlowLogs.destinations,
          trafficType: props.networkConfig.vpcFlowLogs.trafficType,
          maxAggregationInterval: props.networkConfig.vpcFlowLogs.maxAggregationInterval,
          logFormat,
          logRetentionInDays: this.logRetention,
          encryptionKey: this.acceleratorKey,
          bucketArn: centralLogsBucketArn,
        });

        //
        // Create Route Tables
        //
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
          routeTableMap.set(routeTableItem.name, routeTable);
          new cdk.aws_ssm.StringParameter(
            this,
            pascalCase(`SsmParam${pascalCase(vpcItem.name) + pascalCase(routeTableItem.name)}RouteTableId`),
            {
              parameterName: `/accelerator/network/vpc/${vpcItem.name}/routeTable/${routeTableItem.name}/id`,
              stringValue: routeTable.routeTableId,
            },
          );
        }

        //
        // Create Subnets
        //
        const subnetMap = new Map<string, Subnet>();
        for (const subnetItem of vpcItem.subnets ?? []) {
          Logger.info(`[network-vpc-stack] Adding subnet ${subnetItem.name}`);

          const routeTable = routeTableMap.get(subnetItem.routeTable);
          if (routeTable === undefined) {
            throw new Error(`Route table ${subnetItem.routeTable} not defined`);
          }

          const subnet = new Subnet(this, pascalCase(`${vpcItem.name}Vpc`) + pascalCase(`${subnetItem.name}Subnet`), {
            name: subnetItem.name,
            availabilityZone: `${cdk.Stack.of(this).region}${subnetItem.availabilityZone}`,
            ipv4CidrBlock: subnetItem.ipv4CidrBlock,
            mapPublicIpOnLaunch: subnetItem.mapPublicIpOnLaunch,
            routeTable,
            vpc,
            tags: subnetItem.tags,
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
              transitGatewayId,
              subnetIds,
              vpcId: vpc.vpcId,
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
        // Create Network Firewalls
        //
        const firewallMap = new Map<string, NetworkFirewall>();
        if (props.networkConfig.centralNetworkServices?.networkFirewall?.firewalls) {
          const firewalls = props.networkConfig.centralNetworkServices.networkFirewall.firewalls;
          let firewallLogBucket: cdk.aws_s3.IBucket | undefined;

          for (const firewallItem of firewalls) {
            if (vpcItem.name === firewallItem.vpc) {
              const firewallSubnets: string[] = [];
              const delegatedAdminAccountId = this.accountsConfig.getAccountId(
                props.networkConfig.centralNetworkServices.delegatedAdminAccount,
              );
              let owningAccountId: string | undefined = undefined;

              // Check if this is not the delegated network admin account
              if (delegatedAdminAccountId !== cdk.Stack.of(this).account) {
                owningAccountId = delegatedAdminAccountId;
              }

              // Check if VPC has matching subnets
              for (const subnetItem of firewallItem.subnets) {
                if (subnetMap.has(subnetItem)) {
                  firewallSubnets.push(subnetMap.get(subnetItem)!.subnetId);
                } else {
                  throw new Error(
                    `[network-vpc-stack] Create Network Firewall: subnet not found in VPC ${vpcItem.name}`,
                  );
                }
              }

              // Create firewall
              if (firewallSubnets.length > 0) {
                const nfw = this.createNetworkFirewall(
                  firewallItem,
                  vpc.vpcId,
                  vpcItem,
                  firewallSubnets,
                  owningAccountId,
                );
                firewallMap.set(firewallItem.name, nfw);

                // Check for logging configurations
                const destinationConfigs: cdk.aws_networkfirewall.CfnLoggingConfiguration.LogDestinationConfigProperty[] =
                  [];
                for (const logItem of firewallItem.loggingConfiguration ?? []) {
                  if (logItem.destination === 'cloud-watch-logs') {
                    // Create log group and log configuration
                    Logger.info(
                      `[network-vpc-stack] Add CloudWatch ${logItem.type} logs for Network Firewall ${firewallItem.name}`,
                    );
                    const logGroup = new cdk.aws_logs.LogGroup(
                      this,
                      pascalCase(`${firewallItem.name}${logItem.type}LogGroup`),
                      {
                        encryptionKey: this.acceleratorKey,
                        retention: this.logRetention,
                      },
                    );
                    destinationConfigs.push({
                      logDestination: {
                        logGroup: logGroup.logGroupName,
                      },
                      logDestinationType: 'CloudWatchLogs',
                      logType: logItem.type,
                    });
                  }

                  if (logItem.destination === 's3') {
                    Logger.info(
                      `[network-vpc-stack] Add S3 ${logItem.type} logs for Network Firewall ${firewallItem.name}`,
                    );

                    if (!firewallLogBucket) {
                      firewallLogBucket = cdk.aws_s3.Bucket.fromBucketName(
                        this,
                        'FirewallLogsBucket',
                        `aws-accelerator-central-logs-${props.accountsConfig.getLogArchiveAccountId()}-${
                          props.globalConfig.homeRegion
                        }`,
                      );
                    }

                    destinationConfigs.push({
                      logDestination: {
                        bucketName: firewallLogBucket.bucketName,
                      },
                      logDestinationType: 'S3',
                      logType: logItem.type,
                    });
                  }
                }

                // Add logging configuration
                const config = {
                  logDestinationConfigs: destinationConfigs,
                };
                nfw.addLogging(config);
              }
            }
          }
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
            const id =
              pascalCase(`${vpcItem.name}Vpc`) +
              pascalCase(`${routeTableItem.name}RouteTable`) +
              pascalCase(routeTableEntryItem.name);

            // Route: Transit Gateway
            if (routeTableEntryItem.type === 'transitGateway') {
              Logger.info(`[network-vpc-stack] Adding Transit Gateway Route Table Entry ${routeTableEntryItem.name}`);

              const transitGatewayId = transitGatewayIds.get(routeTableEntryItem.target);
              if (transitGatewayId === undefined) {
                throw new Error(`Transit Gateway ${routeTableEntryItem.target} not found`);
              }

              const transitGatewayAttachment = transitGatewayAttachments.get(routeTableEntryItem.target);
              if (transitGatewayAttachment === undefined) {
                throw new Error(`Transit Gateway Attachment ${routeTableEntryItem.target} not found`);
              }

              routeTable.addTransitGatewayRoute(
                id,
                routeTableEntryItem.destination,
                transitGatewayId,
                // TODO: Implement correct dependency relationships without need for escape hatch
                transitGatewayAttachment.node.defaultChild as cdk.aws_ec2.CfnTransitGatewayAttachment,
              );
            }

            // Route: NAT Gateway
            if (routeTableEntryItem.type === 'natGateway') {
              Logger.info(`[network-vpc-stack] Adding NAT Gateway Route Table Entry ${routeTableEntryItem.name}`);

              const natGateway = natGatewayMap.get(routeTableEntryItem.target);
              if (natGateway === undefined) {
                throw new Error(`NAT Gateway ${routeTableEntryItem.target} not found`);
              }

              routeTable.addNatGatewayRoute(id, routeTableEntryItem.destination, natGateway.natGatewayId);
            }

            // Route: Internet Gateway
            if (routeTableEntryItem.type === 'internetGateway') {
              Logger.info(`[network-vpc-stack] Adding Internet Gateway Route Table Entry ${routeTableEntryItem.name}`);
              routeTable.addInternetGatewayRoute(id, routeTableEntryItem.destination);
            }

            // Route: Network Firewall
            if (routeTableEntryItem.type === 'networkFirewall') {
              // Check for AZ input
              if (!routeTableEntryItem.targetAvailabilityZone) {
                throw new Error(
                  `[network-vpc-stack] Network Firewall route table entry ${routeTableEntryItem.name} must specify a target availability zone`,
                );
              }

              // Get Network Firewall and SSM parameter storing endpoint values
              const firewallArn = firewallMap.get(routeTableEntryItem.target)?.firewallArn;
              const endpointAz = `${cdk.Stack.of(this).region}${routeTableEntryItem.targetAvailabilityZone}`;

              if (firewallArn) {
                // Add route
                Logger.info(
                  `[network-vpc-stack] Adding Network Firewall Route Table Entry ${routeTableEntryItem.name}`,
                );
                const routeOptions = {
                  id: id,
                  destination: routeTableEntryItem.destination,
                  endpointAz: endpointAz,
                  firewallArn: firewallArn,
                  kmsKey: this.acceleratorKey,
                  logRetention: this.logRetention,
                };
                routeTable.addNetworkFirewallRoute(routeOptions);
              } else {
                throw new Error(`[network-vpc-stack] Unable to locate Network Firewall ${routeTableEntryItem.target}`);
              }
            }
          }
        }

        //
        // Add Gateway Endpoints (AWS Services)
        //
        this.createGatewayEndpoints(vpcItem, vpc, routeTableMap, organization.id);

        //
        // Create Interface Endpoints (AWS Services)
        //
        this.createInterfaceEndpoints(vpcItem, vpc, subnetMap, organization.id);

        //
        // Add Security Groups
        //
        const securityGroupMap = new Map<string, SecurityGroup>();

        // Build all security groups first, then add rules so we can reference
        // the created security groups by id
        for (const securityGroupItem of vpcItem.securityGroups ?? []) {
          Logger.info(`[network-vpc-stack] Adding Security Group ${securityGroupItem.name}`);
          const securityGroup = new SecurityGroup(
            this,
            pascalCase(`${vpcItem.name}Vpc`) + pascalCase(`${securityGroupItem.name}Sg`),
            {
              securityGroupName: securityGroupItem.name,
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

        for (const securityGroupItem of vpcItem.securityGroups ?? []) {
          const securityGroup = securityGroupMap.get(securityGroupItem.name);
          if (!securityGroup) {
            throw new Error(`${securityGroupItem.name} not in map`);
          }
          Logger.info(`[network-vpc-stack] Adding rules to ${securityGroupItem.name}`);

          // Add ingress rules
          for (const [ruleId, ingressRuleItem] of securityGroupItem.inboundRules.entries() ?? []) {
            Logger.info(`[network-vpc-stack] Adding ingress rule ${ruleId} to ${securityGroupItem.name}`);

            const ingressRules: SecurityGroupRuleProps[] = this.processSecurityGroupRules(
              ingressRuleItem,
              securityGroupMap,
              prefixListMap,
            );

            Logger.info(`[network-vpc-stack] Adding ${ingressRules.length} ingress rules`);

            for (const [index, ingressRule] of ingressRules.entries()) {
              if (ingressRule.targetSecurityGroup) {
                securityGroup.addIngressRule(`${securityGroupItem.name}-Ingress-${ruleId}-${index}`, {
                  sourceSecurityGroup: ingressRule.targetSecurityGroup,
                  ...ingressRule,
                });
              }
              if (ingressRule.targetPrefixList) {
                securityGroup.addIngressRule(`${securityGroupItem.name}-Ingress-${ruleId}-${index}`, {
                  sourcePrefixList: ingressRule.targetPrefixList,
                  ...ingressRule,
                });
              }
            }
          }

          // Add egress rules
          for (const [ruleId, egressRuleItem] of securityGroupItem.outboundRules.entries() ?? []) {
            Logger.info(`[network-vpc-stack] Adding egress rule ${ruleId} to ${securityGroupItem.name}`);

            const egressRules: SecurityGroupRuleProps[] = this.processSecurityGroupRules(
              egressRuleItem,
              securityGroupMap,
              prefixListMap,
            );

            Logger.info(`[network-vpc-stack] Adding ${egressRules.length} egress rules`);

            for (const [index, egressRule] of egressRules.entries()) {
              if (egressRule.targetSecurityGroup) {
                securityGroup.addEgressRule(`${securityGroupItem.name}-Egress-${ruleId}-${index}`, {
                  destinationSecurityGroup: egressRule.targetSecurityGroup,
                  ...egressRule,
                });
              }
              if (egressRule.targetPrefixList) {
                securityGroup.addEgressRule(`${securityGroupItem.name}-Egress-${ruleId}-${index}`, {
                  destinationPrefixList: egressRule.targetPrefixList,
                  ...egressRule,
                });
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
            const props: { cidrBlock?: string; ipv6CidrBlock?: string } = this.processNetworkAclTarget(
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
                ...props,
              },
            );
          }

          for (const outboundRuleItem of naclItem.outboundRules ?? []) {
            Logger.info(`[network-vpc-stack] Adding outbound rule ${outboundRuleItem.rule} to ${naclItem.name}`);
            const props: { cidrBlock?: string; ipv6CidrBlock?: string } = this.processNetworkAclTarget(
              outboundRuleItem.destination,
            );

            Logger.info(`[network-vpc-stack] Adding outbound entries`);
            networkAcl.addEntry(
              `${pascalCase(vpcItem.name)}Vpc${pascalCase(naclItem.name)}-Outbound-${outboundRuleItem.rule}`,
              {
                egress: false,
                protocol: outboundRuleItem.protocol,
                ruleAction: outboundRuleItem.action,
                ruleNumber: outboundRuleItem.rule,
                portRange: {
                  from: outboundRuleItem.fromPort,
                  to: outboundRuleItem.toPort,
                },
                ...props,
              },
            );
          }
        }

        //
        // Create Route 53 Resolver Endpoints
        //
        if (props.networkConfig.centralNetworkServices?.route53Resolver?.endpoints) {
          const delegatedAdminAccountId = this.accountsConfig.getAccountId(
            props.networkConfig.centralNetworkServices.delegatedAdminAccount,
          );
          const vpcAccountId = this.accountsConfig.getAccountId(vpcItem.account);
          const endpoints = props.networkConfig.centralNetworkServices?.route53Resolver?.endpoints;
          const endpointMap = new Map<string, ResolverEndpoint>();

          // Check if the VPC has matching subnets
          for (const endpointItem of endpoints) {
            if (vpcItem.name === endpointItem.vpc) {
              const r53Subnets: string[] = [];

              for (const subnetItem of endpointItem.subnets) {
                if (subnetMap.has(subnetItem)) {
                  r53Subnets.push(subnetMap.get(subnetItem)!.subnetId);
                } else {
                  throw new Error(
                    `[network-vpc-stack] Create Route 53 Resolver endpoint: subnet not found in VPC ${vpcItem.name}`,
                  );
                }
              }
              // Create endpoint
              if (r53Subnets.length > 0 && vpcAccountId === delegatedAdminAccountId) {
                const endpoint = this.createResolverEndpoint(endpointItem, endpointMap, vpc, r53Subnets);
                endpointMap.set(endpointItem.name, endpoint);
              } else {
                throw new Error(
                  '[network-vpc-stack] VPC for Route 53 Resolver endpoints must be located in the delegated network administrator account',
                );
              }
            }
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
    securityGroupMap: Map<string, SecurityGroup>,
    prefixListMap: Map<string, PrefixList>,
  ): SecurityGroupRuleProps[] {
    const rules: SecurityGroupRuleProps[] = [];

    Logger.info(`[network-vpc-stack] processSecurityGroupRules`);

    if (!item.types) {
      Logger.info(`[network-vpc-stack] types not defined, expecting tcpPorts and udpPorts to be set`);
      for (const port of item.tcpPorts ?? []) {
        Logger.debug(`[network-vpc-stack] Adding TCP port ${port}`);
        rules.push(
          ...this.processSecurityGroupRuleSources(item.sources, securityGroupMap, prefixListMap, {
            ipProtocol: cdk.aws_ec2.Protocol.TCP,
            fromPort: port,
            toPort: port,
            description: item.description,
          }),
        );
      }

      for (const port of item.udpPorts ?? []) {
        Logger.debug(`[network-vpc-stack] Adding UDP port ${port}`);
        rules.push(
          ...this.processSecurityGroupRuleSources(item.sources, securityGroupMap, prefixListMap, {
            ipProtocol: cdk.aws_ec2.Protocol.UDP,
            fromPort: port,
            toPort: port,
            description: item.description,
          }),
        );
      }
    }

    for (const type of item.types) {
      Logger.info(`[network-vpc-stack] Adding type ${type}`);
      if (type === 'ALL') {
        rules.push(
          ...this.processSecurityGroupRuleSources(item.sources, securityGroupMap, prefixListMap, {
            ipProtocol: cdk.aws_ec2.Protocol.ALL,
            description: item.description,
          }),
        );
      } else if (Object.keys(TCP_PROTOCOLS_PORT).includes(type)) {
        rules.push(
          ...this.processSecurityGroupRuleSources(item.sources, securityGroupMap, prefixListMap, {
            ipProtocol: cdk.aws_ec2.Protocol.TCP,
            fromPort: TCP_PROTOCOLS_PORT[type],
            toPort: TCP_PROTOCOLS_PORT[type],
            description: item.description,
          }),
        );
      } else {
        rules.push(
          ...this.processSecurityGroupRuleSources(item.sources, securityGroupMap, prefixListMap, {
            ipProtocol: type,
            fromPort: item.fromPort,
            toPort: item.toPort,
            description: item.description,
          }),
        );
      }
    }

    return rules;
  }

  private processSecurityGroupRuleSources(
    sources: string[] | SecurityGroupSourceConfig[] | PrefixListSourceConfig[] | SubnetSourceConfig[],
    securityGroupMap: Map<string, SecurityGroup>,
    prefixListMap: Map<string, PrefixList>,
    props: {
      ipProtocol: string;
      fromPort?: number;
      toPort?: number;
      description?: string;
    },
  ): SecurityGroupRuleProps[] {
    const rules: SecurityGroupRuleProps[] = [];

    Logger.info(`[network-vpc-stack] processSecurityGroupRuleSources`);

    for (const source of sources ?? []) {
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
        if (vpcItem === undefined) {
          throw new Error(`Specified VPC ${source.vpc} not defined`);
        }

        // Loop through all subnets to add
        for (const subnet of source.subnets) {
          // Locate the Subnet
          const subnetItem = vpcItem.subnets?.find(item => item.name === subnet);
          if (subnetItem === undefined) {
            throw new Error(`Specified subnet ${subnet} not defined`);
          }
          rules.push({
            // TODO: Add support for dynamic IP lookup
            cidrIp: subnetItem.ipv4CidrBlock,
            ...props,
          });
        }
      }

      //
      // Security Group Source
      //
      if (NetworkConfigTypes.securityGroupSourceConfig.is(source)) {
        Logger.info(`[network-vpc-stack] Evaluate Security Group Source securityGroups:[${source.securityGroups}]`);

        for (const securityGroup of source.securityGroups ?? []) {
          const targetSecurityGroup = securityGroupMap.get(securityGroup);
          if (targetSecurityGroup === undefined) {
            throw new Error(`Specified Security Group ${securityGroup} not defined`);
          }
          rules.push({
            targetSecurityGroup,
            ...props,
          });
        }
      }

      //
      // Prefix List Source
      //
      if (NetworkConfigTypes.prefixListSourceConfig.is(source)) {
        Logger.info(`[network-vpc-stack] Evaluate Security Group Source prefixLists:[${source.prefixLists}]`);

        for (const prefixList of source.prefixLists ?? []) {
          const targetPrefixList = prefixListMap.get(prefixList);
          if (targetPrefixList === undefined) {
            throw new Error(`Specified Prefix List ${prefixList} not defined`);
          }
          rules.push({
            targetPrefixList,
            ...props,
          });
        }
      }
    }

    return rules;
  }

  /**
   * Creates a cdk.aws_iam.PolicyDocument for the given endpoint.
   * @param service
   * @param organizationId
   * @returns
   */
  private createVpcEndpointPolicy(service: string, organizationId: string): cdk.aws_iam.PolicyDocument | undefined {
    // See https://docs.aws.amazon.com/vpc/latest/privatelink/integrated-services-vpce-list.html
    // for the services that integrates with AWS PrivateLink, but does not support VPC endpoint policies
    if (
      [
        'appmesh-envoy-management',
        'appstream.api',
        'appstream.streaming',
        'cloudformation',
        'cloudtrail',
        'codeguru-profiler',
        'codeguru-reviewer',
        'codepipeline',
        'datasync',
        'ebs',
      ].includes(service)
    ) {
      return undefined;
    }

    // Identify if data protection is specified, create policy
    let policyDocument: cdk.aws_iam.PolicyDocument | undefined = undefined;
    if (this.props.globalConfig.dataProtection?.enable) {
      Logger.info(`[network-vpc-stack] Data protection enabled, update default VPCE policies`);

      // Apply the Identity Perimeter controls for VPC Endpoints
      policyDocument = new cdk.aws_iam.PolicyDocument({
        statements: [
          new cdk.aws_iam.PolicyStatement({
            sid: 'AccessToTrustedPrincipalsAndResources',
            actions: ['*'],
            effect: cdk.aws_iam.Effect.ALLOW,
            resources: ['*'],
            principals: [new cdk.aws_iam.AnyPrincipal()],
            conditions: {
              StringEquals: {
                'aws:PrincipalOrgID': [organizationId],
              },
            },
          }),
        ],
      });

      if (service in ['s3']) {
        policyDocument.addStatements(
          new cdk.aws_iam.PolicyStatement({
            sid: 'AccessToAWSServicePrincipals',
            actions: ['s3:*'],
            effect: cdk.aws_iam.Effect.ALLOW,
            resources: ['*'],
            principals: [new cdk.aws_iam.AnyPrincipal()],
          }),
        );
      }
    }

    return policyDocument;
  }

  /**
   *
   * @param vpcItem
   * @param vpc
   * @param routeTableMap
   * @param organizationId
   */
  private createGatewayEndpoints(
    vpcItem: VpcConfig,
    vpc: Vpc,
    routeTableMap: Map<string, RouteTable>,
    organizationId: string,
  ) {
    // Create a list of related route tables that will need to be updated with the gateway routes
    const s3EndpointRouteTables: RouteTable[] = [];
    const dynamodbEndpointRouteTables: RouteTable[] = [];
    for (const routeTableItem of vpcItem.routeTables ?? []) {
      const routeTable = routeTableMap.get(routeTableItem.name);

      if (routeTable === undefined) {
        throw new Error(`Route Table ${routeTableItem.name} not found`);
      }

      for (const routeTableEntryItem of routeTableItem.routes ?? []) {
        // Route: S3 Gateway Endpoint
        if (routeTableEntryItem.target === 's3') {
          if (s3EndpointRouteTables.find(item => item.routeTableId === routeTable.routeTableId) === undefined) {
            s3EndpointRouteTables.push(routeTable);
          }
        }

        // Route: DynamoDb Gateway Endpoint
        if (routeTableEntryItem.target === 'dynamodb') {
          if (dynamodbEndpointRouteTables.find(item => item.routeTableId === routeTable.routeTableId) === undefined) {
            dynamodbEndpointRouteTables.push(routeTable);
          }
        }
      }
    }

    //
    // Add Gateway Endpoints (AWS Services)
    //
    for (const gatewayEndpointItem of vpcItem.gatewayEndpoints ?? []) {
      Logger.info(`[network-vpc-stack] Adding Gateway Endpoint for ${gatewayEndpointItem}`);

      if (gatewayEndpointItem === 's3') {
        new VpcEndpoint(this, pascalCase(`${vpcItem.name}Vpc`) + pascalCase(gatewayEndpointItem), {
          vpc,
          vpcEndpointType: cdk.aws_ec2.VpcEndpointType.GATEWAY,
          service: gatewayEndpointItem,
          routeTables: s3EndpointRouteTables,
          policyDocument: this.createVpcEndpointPolicy(gatewayEndpointItem, organizationId),
        });
      }
      if (gatewayEndpointItem === 'dynamodb') {
        new VpcEndpoint(this, pascalCase(`${vpcItem.name}Vpc`) + pascalCase(gatewayEndpointItem), {
          vpc,
          vpcEndpointType: cdk.aws_ec2.VpcEndpointType.GATEWAY,
          service: gatewayEndpointItem,
          routeTables: dynamodbEndpointRouteTables,
          policyDocument: this.createVpcEndpointPolicy(gatewayEndpointItem, organizationId),
        });
      }
    }
  }

  /**
   *
   * @param vpcItem
   * @param vpc
   * @param subnetMap
   * @param route53QueryLogGroup
   */
  private createInterfaceEndpoints(
    vpcItem: VpcConfig,
    vpc: Vpc,
    subnetMap: Map<string, Subnet>,
    organizationId: string,
  ) {
    //
    // Add Interface Endpoints (AWS Services)
    //
    if (vpcItem.interfaceEndpoints) {
      // Create list of subnet IDs for each interface endpoint
      const subnets: Subnet[] = [];
      for (const subnetItem of vpcItem.interfaceEndpoints.subnets ?? []) {
        const subnet = subnetMap.get(subnetItem);
        if (subnet) {
          subnets.push(subnet);
        } else {
          throw new Error(`Attempting to add interface endpoints to subnet that does not exist (${subnetItem})`);
        }
      }

      // Create the interface endpoint
      for (const endpointItem of vpcItem.interfaceEndpoints.endpoints ?? []) {
        Logger.info(`[network-vpc-stack] Adding Interface Endpoint for ${endpointItem}`);

        let ingressRuleIndex = 0; // Used increment ingressRule id

        // Create Security Group for each interfaceEndpoint
        Logger.info(`[network-vpc-stack] Adding Security Group for interface endpoint ${endpointItem}`);
        const securityGroup = new SecurityGroup(
          this,
          pascalCase(`${vpcItem.name}Vpc`) + pascalCase(`${endpointItem}EpSecurityGroup`),
          {
            securityGroupName: `ep_${endpointItem}_sg`,
            description: `AWS Private Endpoint Zone - ${endpointItem}`,
            vpc,
          },
        );

        for (const ingressCidr of vpcItem.interfaceEndpoints.allowedCidrs || ['0.0.0.0/0']) {
          let port = 443;
          if (endpointItem === 'cassandra') {
            port = 9142;
          }

          const ingressRuleId = `ep_${endpointItem}_sg-Ingress-${ingressRuleIndex++}`;
          Logger.info(`[network-vpc-stack] Adding ingress cidr ${ingressCidr} TPC:${port} to ${ingressRuleId}`);
          securityGroup.addIngressRule(ingressRuleId, {
            ipProtocol: cdk.aws_ec2.Protocol.TCP,
            fromPort: port,
            toPort: port,
            cidrIp: ingressCidr,
          });

          // AwsSolutions-EC23: The Security Group allows for 0.0.0.0/0 or ::/0 inbound access.
          // rule suppression with evidence for this permission.
          NagSuppressions.addResourceSuppressionsByPath(
            this,
            `${this.stackName}/${pascalCase(vpcItem.name)}Vpc${pascalCase(
              endpointItem,
            )}EpSecurityGroup/${ingressRuleId}`,
            [
              {
                id: 'AwsSolutions-EC23',
                reason: 'Allowed access for cassandra',
              },
            ],
          );
        }

        // Adding Egress '127.0.0.1/32' to avoid default Egress rule
        securityGroup.addEgressRule(`ep_${endpointItem}_sg-Egress`, {
          ipProtocol: cdk.aws_ec2.Protocol.ALL,
          cidrIp: '127.0.0.1/32',
        });

        // Create the interface endpoint
        const endpoint = new VpcEndpoint(this, `${pascalCase(vpcItem.name)}Vpc${pascalCase(endpointItem)}Ep`, {
          vpc,
          vpcEndpointType: cdk.aws_ec2.VpcEndpointType.INTERFACE,
          service: endpointItem,
          subnets,
          securityGroups: [securityGroup],
          privateDnsEnabled: false,
          policyDocument: this.createVpcEndpointPolicy(endpointItem, organizationId),
        });

        // Create the private hosted zone
        const hostedZoneName = HostedZone.getHostedZoneNameForService(endpointItem, cdk.Stack.of(this).region);
        const hostedZone = new HostedZone(
          this,
          `${pascalCase(vpcItem.name)}Vpc${pascalCase(endpointItem)}EpHostedZone`,
          {
            hostedZoneName,
            vpc,
          },
        );
        new cdk.aws_ssm.StringParameter(
          this,
          `SsmParam${pascalCase(vpcItem.name)}Vpc${pascalCase(endpointItem)}EpHostedZone`,
          {
            parameterName: `/accelerator/network/vpc/${vpcItem.name}/route53/hostedZone/${endpointItem}/id`,
            stringValue: hostedZone.hostedZoneId,
          },
        );

        // Create the record set
        let recordSetName = hostedZoneName;
        if (endpointItem in ['ecr.dkr']) {
          recordSetName = `*.${hostedZoneName}`;
        }
        new RecordSet(this, `${pascalCase(vpcItem.name)}Vpc${pascalCase(endpointItem)}EpRecordSet`, {
          type: 'A',
          name: recordSetName,
          hostedZone: hostedZone,
          dnsName: endpoint.dnsName,
          hostedZoneId: endpoint.hostedZoneId,
        });
      }
    }
  }

  //
  // Create Route 53 Resolver endpoints
  //
  private createResolverEndpoint(
    endpointItem: ResolverEndpointConfig,
    endpointMap: Map<string, ResolverEndpoint>,
    vpc: Vpc,
    subnets: string[],
  ) {
    // Validate there are no rules associated with an inbound endpoint
    if (endpointItem.type === 'INBOUND' && endpointItem.rules) {
      throw new Error('Route 53 Resolver inbound endpoints cannot have rules.');
    }

    // Create security group
    Logger.info(`[network-vpc-stack] Adding Security Group for Route 53 Resolver endpoint ${endpointItem.name}`);
    const securityGroup = new SecurityGroup(this, pascalCase(`${endpointItem.name}EpSecurityGroup`), {
      securityGroupName: `ep_${endpointItem.name}_sg`,
      description: `AWS Route 53 Resolver endpoint - ${endpointItem.name}`,
      vpc,
    });

    if (endpointItem.type === 'INBOUND') {
      let ingressRuleIndex = 0; // Used increment ingressRule id

      for (const ingressCidr of endpointItem.allowedCidrs || ['0.0.0.0/0']) {
        const port = 53;

        let ingressRuleId = `ep_${endpointItem.name}_sg-Ingress-${ingressRuleIndex++}`;
        Logger.info(`[network-vpc-stack] Adding ingress cidr ${ingressCidr} TCP:${port} to ${ingressRuleId}`);
        securityGroup.addIngressRule(ingressRuleId, {
          ipProtocol: cdk.aws_ec2.Protocol.TCP,
          fromPort: port,
          toPort: port,
          cidrIp: ingressCidr,
        });

        ingressRuleId = `ep_${endpointItem.name}_sg-Ingress-${ingressRuleIndex++}`;
        Logger.info(`[network-vpc-stack] Adding ingress cidr ${ingressCidr} UDP:${port} to ${ingressRuleId}`);
        securityGroup.addIngressRule(ingressRuleId, {
          ipProtocol: cdk.aws_ec2.Protocol.UDP,
          fromPort: port,
          toPort: port,
          cidrIp: ingressCidr,
        });

        // AwsSolutions-EC23: The Security Group allows for 0.0.0.0/0 or ::/0 inbound access.
        // rule suppression with evidence for this permission.
        NagSuppressions.addResourceSuppressionsByPath(
          this,
          `${this.stackName}/${pascalCase(endpointItem.name)}EpSecurityGroup/${ingressRuleId}`,
          [
            {
              id: 'AwsSolutions-EC23',
              reason: 'Allowed access for TCP and UDP',
            },
          ],
        );
      }

      // Adding Egress '127.0.0.1/32' to avoid default Egress rule
      securityGroup.addEgressRule(`ep_${endpointItem.name}_sg-Egress`, {
        ipProtocol: cdk.aws_ec2.Protocol.ALL,
        cidrIp: '127.0.0.1/32',
      });
    } else {
      let egressRuleIndex = 0;

      for (const egressCidr of endpointItem.allowedCidrs || ['0.0.0.0/0']) {
        const port = 53;

        let egressRuleId = `ep_${endpointItem.name}_sg-Egress-${egressRuleIndex++}`;
        Logger.info(`[network-vpc-stack] Adding egress cidr ${egressCidr} TCP:${port} to ${egressRuleId}`);
        securityGroup.addEgressRule(egressRuleId, {
          ipProtocol: cdk.aws_ec2.Protocol.TCP,
          fromPort: port,
          toPort: port,
          cidrIp: egressCidr,
        });

        egressRuleId = `ep_${endpointItem.name}_sg-Egress-${egressRuleIndex++}`;
        Logger.info(`[network-vpc-stack] Adding egress cidr ${egressCidr} UDP:${port} to ${egressRuleId}`);
        securityGroup.addEgressRule(egressRuleId, {
          ipProtocol: cdk.aws_ec2.Protocol.UDP,
          fromPort: port,
          toPort: port,
          cidrIp: egressCidr,
        });

        // AwsSolutions-EC23: The Security Group allows for 0.0.0.0/0 or ::/0 inbound access.
        // rule suppression with evidence for this permission.
        NagSuppressions.addResourceSuppressionsByPath(
          this,
          `${this.stackName}/ep_${endpointItem.name}_sg-Egress/${egressRuleId}`,
          [
            {
              id: 'AwsSolutions-EC23',
              reason: 'Allowed access for TCP and UDP',
            },
          ],
        );
      }
    }

    Logger.info(`[network-vpc-stack] Add Route 53 Resolver ${endpointItem.type} endpoint ${endpointItem.name}`);
    const endpoint = new ResolverEndpoint(this, `${pascalCase(endpointItem.name)}ResolverEndpoint`, {
      direction: endpointItem.type,
      ipAddresses: subnets,
      name: endpointItem.name,
      securityGroupIds: [securityGroup.securityGroupId],
      tags: endpointItem.tags ?? [],
    });
    new cdk.aws_ssm.StringParameter(this, pascalCase(`SsmParam${endpointItem.name}ResolverEndpoint`), {
      parameterName: `/accelerator/network/route53Resolver/endpoints/${endpointItem.name}/id`,
      stringValue: endpoint.endpointId,
    });

    // Create rules
    for (const ruleItem of endpointItem.rules ?? []) {
      Logger.info(`[network-vpc-stack] Add Route 53 Resolver rule ${ruleItem.name}`);

      // Check whether there is an inbound endpoint target
      let inboundTarget: ResolverEndpoint | undefined = undefined;
      if (ruleItem.inboundEndpointTarget) {
        inboundTarget = endpointMap.get(ruleItem.inboundEndpointTarget);
        if (!inboundTarget) {
          throw new Error(`[network-vpc-stack] Endpoint ${ruleItem.inboundEndpointTarget} not found in endpoint map`);
        }
      }

      // Create resolver rule and SSM parameter
      const rule = new ResolverRule(this, `${pascalCase(endpointItem.name)}ResolverRule${pascalCase(ruleItem.name)}`, {
        domainName: ruleItem.domainName,
        name: ruleItem.name,
        ruleType: ruleItem.ruleType,
        resolverEndpointId: endpoint.endpointId,
        targetIps: ruleItem.targetIps,
        tags: ruleItem.tags ?? [],
        targetInbound: inboundTarget,
        kmsKey: this.acceleratorKey,
        logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
      });
      new cdk.aws_ssm.StringParameter(this, pascalCase(`SsmParam${ruleItem.name}ResolverRule`), {
        parameterName: `/accelerator/network/route53Resolver/rules/${ruleItem.name}/id`,
        stringValue: rule.ruleId,
      });

      if (ruleItem.shareTargets) {
        Logger.info(`[network-vpc-stack] Share Route 53 Resolver rule ${ruleItem.name}`);
        this.addResourceShare(ruleItem, `${ruleItem.name}_ResolverRule`, [rule.ruleArn]);
      }
    }
    // Return endpoint object
    return endpoint;
  }

  /**
   * Create a Network Firewall in the specified VPC and subnets.
   *
   * @param firewallItem
   * @param vpcId
   * @param vpcItem
   * @param subnets
   * @param owningAccountId
   * @returns
   */
  private createNetworkFirewall(
    firewallItem: NfwFirewallConfig,
    vpcId: string,
    vpcItem: VpcConfig,
    subnets: string[],
    owningAccountId?: string,
  ): NetworkFirewall {
    // Get firewall policy ARN
    let policyArn: string;

    if (!owningAccountId) {
      policyArn = cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        `/accelerator/network/networkFirewall/policies/${firewallItem.firewallPolicy}/arn`,
      );
    } else {
      policyArn = this.getResourceShare(
        `${firewallItem.firewallPolicy}_NetworkFirewallPolicyShare`,
        'network-firewall:FirewallPolicy',
        owningAccountId,
      ).resourceShareItemArn;
    }

    Logger.info(`[network-vpc-stack] Add Network Firewall ${firewallItem.name} to VPC ${vpcItem.name}`);
    const nfw = new NetworkFirewall(this, pascalCase(`${vpcItem.name}${firewallItem.name}NetworkFirewall`), {
      firewallPolicyArn: policyArn,
      name: firewallItem.name,
      description: firewallItem.description,
      subnets: subnets,
      vpcId: vpcId,
      deleteProtection: firewallItem.deleteProtection,
      firewallPolicyChangeProtection: firewallItem.firewallPolicyChangeProtection,
      subnetChangeProtection: firewallItem.subnetChangeProtection,
      tags: firewallItem.tags ?? [],
    });
    // Create SSM parameters
    new cdk.aws_ssm.StringParameter(
      this,
      pascalCase(`SsmParam${pascalCase(vpcItem.name) + pascalCase(firewallItem.name)}FirewallArn`),
      {
        parameterName: `/accelerator/network/vpc/${vpcItem.name}/networkFirewall/${firewallItem.name}/arn`,
        stringValue: nfw.firewallArn,
      },
    );
    return nfw;
  }

  /**
   * Add RAM resource shares to the stack.
   *
   * @param item
   * @param resourceShareName
   * @param resourceArns
   */
  private addResourceShare(item: ResourceShareType, resourceShareName: string, resourceArns: string[]) {
    // Build a list of principals to share to
    const principals: string[] = [];

    // Loop through all the defined OUs
    for (const ouItem of item.shareTargets?.organizationalUnits ?? []) {
      let ouArn = this.orgConfig.getOrganizationalUnitArn(ouItem);
      // AWS::RAM::ResourceShare expects the organizations ARN if
      // sharing with the entire org (Root)
      if (ouItem === 'Root') {
        ouArn = ouArn.substring(0, ouArn.lastIndexOf('/')).replace('root', 'organization');
      }
      Logger.info(`[network-vpc-stack] Share ${resourceShareName} with Organizational Unit ${ouItem}: ${ouArn}`);
      principals.push(ouArn);
    }

    // Loop through all the defined accounts
    for (const account of item.shareTargets?.accounts ?? []) {
      const accountId = this.accountsConfig.getAccountId(account);
      Logger.info(`[network-vpc-stack] Share ${resourceShareName} with Account ${account}: ${accountId}`);
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
   * Get the resource ID from a RAM share.
   *
   * @param resourceShareName
   * @param itemType
   * @param owningAccountId
   */
  private getResourceShare(resourceShareName: string, itemType: string, owningAccountId: string): IResourceShareItem {
    // Generate a logical ID
    const resourceName = resourceShareName.split('_')[0];
    const logicalId = `${resourceName}${itemType.split(':')[1]}`;

    // Lookup resource share
    const resourceShare = ResourceShare.fromLookup(this, pascalCase(`${logicalId}Share`), {
      resourceShareOwner: ResourceShareOwner.OTHER_ACCOUNTS,
      resourceShareName: resourceShareName,
      owningAccountId,
    });

    // Represents the item shared by RAM
    const item = ResourceShareItem.fromLookup(this, pascalCase(`${logicalId}`), {
      resourceShare,
      resourceShareItemType: itemType,
      kmsKey: this.acceleratorKey,
      logRetentionInDays: this.logRetention,
    });
    return item;
  }
}
