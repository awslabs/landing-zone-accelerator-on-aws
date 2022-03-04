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
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';

import {
  NetworkAclSubnetSelection,
  NetworkConfigTypes,
  nonEmptyString,
  SecurityGroupRuleConfig,
  SecurityGroupSourceConfig,
  SubnetSourceConfig,
  VpcConfig,
} from '@aws-accelerator/config';
import {
  DeleteDefaultVpc,
  DhcpOptions,
  HostedZone,
  NatGateway,
  NetworkAcl,
  Organization,
  RecordSet,
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

export interface SecurityGroupRuleProps {
  ipProtocol: string;
  cidrIp?: string;
  cidrIpv6?: string;
  fromPort?: number;
  toPort?: number;
  targetSecurityGroup?: SecurityGroup;
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
  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    // Get the organization object, used by Data Protection
    const organization = new Organization(this, 'Organization');

    //
    // Delete Default VPCs
    //
    if (props.networkConfig.defaultVpc?.delete) {
      Logger.info('[network-vpc-stack] Add DeleteDefaultVpc');
      new DeleteDefaultVpc(this, 'DeleteDefaultVpc');
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
      const accountId = props.accountsConfig.getAccountId(vpcItem.account);
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
          const owningAccountId = props.accountsConfig.getAccountId(attachment.transitGateway.account);

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
            const resourceShare = ResourceShare.fromLookup(
              this,
              pascalCase(`${attachment.transitGateway.name}TransitGatewayShare`),
              {
                resourceShareOwner: ResourceShareOwner.OTHER_ACCOUNTS,
                resourceShareName: `${attachment.transitGateway.name}_TransitGatewayShare`,
                owningAccountId,
              },
            );

            // Represents the transit gateway resource
            const tgw = ResourceShareItem.fromLookup(
              this,
              pascalCase(`${attachment.transitGateway.name}TransitGateway`),
              {
                resourceShare,
                resourceShareItemType: 'ec2:TransitGateway',
              },
            );

            Logger.info(
              `[network-vpc-stack] Adding [${attachment.transitGateway.name}]: ${tgw.resourceShareItemId} to transitGatewayIds Map`,
            );
            transitGatewayIds.set(attachment.transitGateway.name, tgw.resourceShareItemId);
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
    }

    // Get the CentralLogsBucket, if needed to send vpc flow logs to
    let centralLogsBucketArn: string | undefined = undefined;
    if (props.networkConfig.vpcFlowLogs.destinations.includes('s3')) {
      Logger.info(`[network-vpc-stack] S3 destination for VPC flow log detected, obtain the CentralLogsBucket`);

      const centralLogsBucket = cdk.aws_s3.Bucket.fromBucketName(
        this,
        'CentralLogsBucket',
        `aws-accelerator-central-logs-${props.accountsConfig.getLogArchiveAccountId()}-${
          props.globalConfig.homeRegion
        }`,
      );
      centralLogsBucketArn = centralLogsBucket.bucketArn;
    }

    let flowLogsCmk: cdk.aws_kms.Key | undefined = undefined;
    if (props.networkConfig.vpcFlowLogs.destinations.includes('cloud-watch-logs')) {
      Logger.info(`[network-vpc-stack] cwl destination for VPC flow log detected, create a cmk to be used by cwl`);

      flowLogsCmk = new cdk.aws_kms.Key(this, 'FlowLogsCmk', {
        enableKeyRotation: true,
        description: 'AWS Accelerator Cloud Watch Logs CMK for VPC Flow Logs',
        alias: 'accelerator/vpc-flow-logs/cloud-watch-logs',
      });

      flowLogsCmk.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: 'Enable IAM User Permissions',
          principals: [new cdk.aws_iam.AccountRootPrincipal()],
          actions: ['kms:*'],
          resources: ['*'],
        }),
      );

      flowLogsCmk.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: 'Allow Cloud Watch Logs access',
          principals: [new cdk.aws_iam.ServicePrincipal(`logs.${cdk.Stack.of(this).region}.amazonaws.com`)],
          actions: ['kms:Encrypt*', 'kms:Decrypt*', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:Describe*'],
          resources: ['*'],
          conditions: {
            ArnLike: {
              'kms:EncryptionContext:aws:logs:arn': `arn:${cdk.Stack.of(this).partition}:logs:${
                cdk.Stack.of(this).region
              }:${cdk.Stack.of(this).account}:*`,
            },
          },
        }),
      );
    }

    //
    // Check to see if useCentralEndpoints is enabled for any other VPC within
    // this account and region. If so, we will need to create a cross account
    // access role (if we're in a different account)
    //
    let useCentralEndpoints = false;
    for (const vpcItem of props.networkConfig.vpcs ?? []) {
      const accountId = props.accountsConfig.getAccountId(vpcItem.account);
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
      const centralEndpointVpcAccountId = props.accountsConfig.getAccountId(centralEndpointVpc.account);
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
      }
    }

    //
    // Create DHCP options
    //
    // Create map to store DHCP options
    const dhcpOptionsIds = new Map<string, string>();

    for (const dhcpItem of props.networkConfig.dhcpOptions ?? []) {
      // Check if the set belongs in this account/region
      const accountIds = dhcpItem.accounts.map(item => {
        return props.accountsConfig.getAccountId(item);
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
    // Evaluate VPC entries
    //
    for (const vpcItem of props.networkConfig.vpcs ?? []) {
      const accountId = props.accountsConfig.getAccountId(vpcItem.account);
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
            props.accountsConfig.getAccountId(centralEndpointVpc.account),
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
          encryptionKey: flowLogsCmk,
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

            // Build a list of principals to share to
            const principals: string[] = [];

            // Loop through all the defined OUs
            for (const ouItem of subnetItem.shareTargets.organizationalUnits ?? []) {
              let ouArn = props.organizationConfig.getOrganizationalUnitArn(ouItem);
              // AWS::RAM::ResourceShare expects the organizations ARN if
              // sharing with the entire org (Root)
              if (ouItem === 'Root') {
                ouArn = ouArn.substring(0, ouArn.lastIndexOf('/')).replace('root', 'organization');
              }
              Logger.info(
                `[network-vpc-stack] Share Subnet ${subnetItem.name} with Organizational Unit ${ouItem}: ${ouArn}`,
              );
              principals.push(ouArn);
            }

            // Loop through all the defined accounts
            for (const account of subnetItem.shareTargets.accounts ?? []) {
              const accountId = props.accountsConfig.getAccountId(account);
              Logger.info(`[network-vpc-stack] Share Subnet ${subnetItem.name} with Account ${account}: ${accountId}`);
              principals.push(accountId);
            }

            // Create the Resource Share
            new ResourceShare(this, `${pascalCase(subnetItem.name)}SubnetShare`, {
              name: `${subnetItem.name}_SubnetShare`,
              principals,
              resourceArns: [subnet.subnetArn],
            });
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
            );

            Logger.info(`[network-vpc-stack] Adding ${ingressRules.length} ingress rules`);

            for (const [index, ingressRule] of ingressRules.entries()) {
              securityGroup.addIngressRule(`${securityGroupItem.name}-Ingress-${ruleId}-${index}`, {
                sourceSecurityGroup: ingressRule.targetSecurityGroup,
                ...ingressRule,
              });
            }
          }

          // Add egress rules
          for (const [ruleId, egressRuleItem] of securityGroupItem.outboundRules.entries() ?? []) {
            Logger.info(`[network-vpc-stack] Adding egress rule ${ruleId} to ${securityGroupItem.name}`);

            const egressRules: SecurityGroupRuleProps[] = this.processSecurityGroupRules(
              egressRuleItem,
              securityGroupMap,
            );

            Logger.info(`[network-vpc-stack] Adding ${egressRules.length} egress rules`);

            for (const [index, egressRule] of egressRules.entries()) {
              securityGroup.addEgressRule(`${securityGroupItem.name}-Egress-${ruleId}-${index}`, {
                destinationSecurityGroup: egressRule.targetSecurityGroup,
                ...egressRule,
              });
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
      }
    }
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
  ): SecurityGroupRuleProps[] {
    const rules: SecurityGroupRuleProps[] = [];

    Logger.info(`[network-vpc-stack] processSecurityGroupRules`);

    if (!item.types) {
      Logger.info(`[network-vpc-stack] types not defined, expecting tcpPorts and udpPorts to be set`);
      for (const port of item.tcpPorts ?? []) {
        Logger.debug(`[network-vpc-stack] Adding TCP port ${port}`);
        rules.push(
          ...this.processSecurityGroupRuleSources(item.sources, securityGroupMap, {
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
          ...this.processSecurityGroupRuleSources(item.sources, securityGroupMap, {
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
          ...this.processSecurityGroupRuleSources(item.sources, securityGroupMap, {
            ipProtocol: cdk.aws_ec2.Protocol.ALL,
            description: item.description,
          }),
        );
      } else if (Object.keys(TCP_PROTOCOLS_PORT).includes(type)) {
        rules.push(
          ...this.processSecurityGroupRuleSources(item.sources, securityGroupMap, {
            ipProtocol: cdk.aws_ec2.Protocol.TCP,
            fromPort: TCP_PROTOCOLS_PORT[type],
            toPort: TCP_PROTOCOLS_PORT[type],
            description: item.description,
          }),
        );
      } else {
        rules.push(
          ...this.processSecurityGroupRuleSources(item.sources, securityGroupMap, {
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
    sources: string[] | SecurityGroupSourceConfig[] | SubnetSourceConfig[],
    securityGroupMap: Map<string, SecurityGroup>,
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
}
