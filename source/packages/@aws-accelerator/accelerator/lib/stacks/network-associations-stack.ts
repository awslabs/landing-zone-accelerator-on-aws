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
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';

import { VpcConfig } from '@aws-accelerator/config';
import {
  AssociateHostedZones,
  KeyLookup,
  QueryLoggingConfigAssociation,
  ResolverFirewallRuleGroupAssociation,
  ResolverRuleAssociation,
  ResourceShare,
  ResourceShareItem,
  ResourceShareOwner,
  SsmParameter,
  SsmParameterType,
  TransitGatewayAttachment,
  TransitGatewayRouteTableAssociation,
  TransitGatewayRouteTablePropagation,
  TransitGatewayStaticRoute,
  VpcPeering,
} from '@aws-accelerator/constructs';

import { Logger } from '../logger';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';
import { KeyStack } from './key-stack';

interface Peering {
  name: string;
  requester: VpcConfig;
  accepter: VpcConfig;
  tags: cdk.CfnTag[] | undefined;
}

export class NetworkAssociationsStack extends AcceleratorStack {
  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    const key = new KeyLookup(this, 'AcceleratorKeyLookup', {
      accountId: props.accountsConfig.getAuditAccountId(),
      roleName: KeyStack.CROSS_ACCOUNT_ACCESS_ROLE_NAME,
      keyArnParameterName: KeyStack.ACCELERATOR_KEY_ARN_PARAMETER_NAME,
      logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
    }).getKey();

    // Build Transit Gateway Maps
    const transitGateways = new Map<string, string>();
    const transitGatewayRouteTables = new Map<string, string>();
    const transitGatewayAttachments = new Map<{ account: string; vpc: string }, string>();
    for (const tgwItem of props.networkConfig.transitGateways ?? []) {
      const accountId = props.accountsConfig.getAccountId(tgwItem.account);
      if (accountId === cdk.Stack.of(this).account && tgwItem.region == cdk.Stack.of(this).region) {
        const transitGatewayId = ssm.StringParameter.valueForStringParameter(
          this,
          `/accelerator/network/transitGateways/${tgwItem.name}/id`,
        );
        transitGateways.set(tgwItem.name, transitGatewayId);

        for (const routeTableItem of tgwItem.routeTables ?? []) {
          const transitGatewayRouteTableId = ssm.StringParameter.valueForStringParameter(
            this,
            `/accelerator/network/transitGateways/${tgwItem.name}/routeTables/${routeTableItem.name}/id`,
          );
          const key = `${tgwItem.name}_${routeTableItem.name}`;
          transitGatewayRouteTables.set(key, transitGatewayRouteTableId);
        }
      }
    }

    for (const vpcItem of props.networkConfig.vpcs ?? []) {
      if (vpcItem.region == cdk.Stack.of(this).region) {
        for (const tgwAttachmentItem of vpcItem.transitGatewayAttachments ?? []) {
          const accountId = props.accountsConfig.getAccountId(tgwAttachmentItem.transitGateway.account);
          if (accountId === cdk.Stack.of(this).account) {
            const owningAccountId = props.accountsConfig.getAccountId(vpcItem.account);

            // Get the Transit Gateway ID
            const transitGatewayId = transitGateways.get(tgwAttachmentItem.transitGateway.name);
            if (transitGatewayId === undefined) {
              throw new Error(`Transit Gateway ${tgwAttachmentItem.transitGateway.name} not found`);
            }

            // Get the Transit Gateway Attachment ID
            let transitGatewayAttachmentId;
            if (accountId === owningAccountId) {
              Logger.info(
                `[network-associations-stack] Update route tables for attachment ${tgwAttachmentItem.name} from local account ${owningAccountId}`,
              );
              transitGatewayAttachmentId = ssm.StringParameter.valueForStringParameter(
                this,
                `/accelerator/network/vpc/${vpcItem.name}/transitGatewayAttachment/${tgwAttachmentItem.name}/id`,
              );
            } else {
              Logger.info(
                `[network-associations-stack] Update route tables for attachment ${tgwAttachmentItem.name} from external account ${owningAccountId}`,
              );

              const transitGatewayAttachment = TransitGatewayAttachment.fromLookup(
                this,
                pascalCase(`${tgwAttachmentItem.name}VpcTransitGatewayAttachment`),
                {
                  name: tgwAttachmentItem.name,
                  owningAccountId,
                  transitGatewayId,
                  roleName: `AWSAccelerator-DescribeTgwAttachRole-${cdk.Stack.of(this).region}`,
                  kmsKey: key,
                  logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
                },
              );
              // Build Transit Gateway Attachment Map
              transitGatewayAttachmentId = transitGatewayAttachment.transitGatewayAttachmentId;
              transitGatewayAttachments.set(
                { account: vpcItem.account, vpc: vpcItem.name },
                transitGatewayAttachmentId,
              );
            }

            // Evaluating TGW Routes

            // Evaluate Route Table Associations
            for (const routeTableItem of tgwAttachmentItem.routeTableAssociations ?? []) {
              const key = `${tgwAttachmentItem.transitGateway.name}_${routeTableItem}`;

              const transitGatewayRouteTableId = transitGatewayRouteTables.get(key);
              if (transitGatewayRouteTableId === undefined) {
                throw new Error(`Transit Gateway Route Table ${key} not found`);
              }

              new TransitGatewayRouteTableAssociation(
                this,
                `${pascalCase(tgwAttachmentItem.name)}${pascalCase(routeTableItem)}Association`,
                {
                  transitGatewayAttachmentId,
                  transitGatewayRouteTableId,
                },
              );
            }

            // Evaluate Route Table Propagations
            for (const routeTableItem of tgwAttachmentItem.routeTablePropagations ?? []) {
              const key = `${tgwAttachmentItem.transitGateway.name}_${routeTableItem}`;

              const transitGatewayRouteTableId = transitGatewayRouteTables.get(key);
              if (transitGatewayRouteTableId === undefined) {
                throw new Error(`Transit Gateway Route Table ${key} not found`);
              }

              new TransitGatewayRouteTablePropagation(
                this,
                `${pascalCase(tgwAttachmentItem.name)}${pascalCase(routeTableItem)}Propagation`,
                {
                  transitGatewayAttachmentId,
                  transitGatewayRouteTableId,
                },
              );
            }
          }
        }
      }
    }

    // Evaluate Transit Gateway Static Routes
    for (const tgwItem of props.networkConfig.transitGateways ?? []) {
      if (
        cdk.Stack.of(this).account === props.accountsConfig.getAccountId(tgwItem.account) &&
        cdk.Stack.of(this).region === tgwItem.region
      ) {
        for (const routeTableItem of tgwItem.routeTables ?? []) {
          for (const routeItem of routeTableItem.routes ?? []) {
            // Throw exception when a blackhole route and a VPC attachment is presented.
            if (routeItem.blackhole && routeItem.attachment) {
              throw new Error('Cannot specify blackhole route and an attachment!');
            }
            // Build a static route when a route is being blackholed.
            if (routeItem.blackhole) {
              Logger.info(
                `[network-associations-stack] Adding blackhole route ${routeItem.destinationCidrBlock} to TGW ${tgwItem.name} for TGW Route Table ${routeTableItem.name} in account: ${tgwItem.account}`,
              );
              new TransitGatewayStaticRoute(
                this,
                `${routeTableItem.name}-${routeItem.destinationCidrBlock}-blackhole`,
                {
                  transitGatewayRouteTableId: cdk.aws_ssm.StringParameter.valueForStringParameter(
                    this,
                    `/accelerator/network/transitGateways/${tgwItem.name}/routeTables/${routeTableItem.name}/id`,
                  ),
                  blackhole: routeItem.blackhole,
                  destinationCidrBlock: routeItem.destinationCidrBlock,
                },
              );
            } else if (routeItem.attachment) {
              Logger.info(
                `[network-associations-stack] Adding attachment route ${routeItem.destinationCidrBlock} to TGW ${tgwItem.name} for TGW Route Table ${routeTableItem.name} to VPC attachment ${routeItem.attachment.vpcName} for account ${routeItem.attachment.account}`,
              );
              new TransitGatewayStaticRoute(
                this,
                `${routeTableItem.name}-${routeItem.destinationCidrBlock}-${routeItem.attachment.vpcName}-${routeItem.attachment.account}`,
                {
                  transitGatewayRouteTableId: cdk.aws_ssm.StringParameter.valueForStringParameter(
                    this,
                    `/accelerator/network/transitGateways/${tgwItem.name}/routeTables/${routeTableItem.name}/id`,
                  ),
                  destinationCidrBlock: routeItem.destinationCidrBlock,
                  transitGatewayAttachmentId: transitGatewayAttachments.get({
                    account: routeItem.attachment.account,
                    vpc: routeItem.attachment.vpcName,
                  }),
                },
              );
            }
          }
        }
      }
    }

    //
    // Get the Central Endpoints VPC, there should only be one.
    // Only care if the VPC is defined within this account and region
    //
    let centralEndpointVpc = undefined;
    const centralEndpointVpcs = props.networkConfig.vpcs.filter(
      item =>
        item.interfaceEndpoints?.central &&
        props.accountsConfig.getAccountId(item.account) === cdk.Stack.of(this).account &&
        item.region === cdk.Stack.of(this).region,
    );
    if (centralEndpointVpcs.length > 1) {
      throw new Error(`multiple (${centralEndpointVpcs.length}) central endpoint vpcs detected, should only be one`);
    }
    centralEndpointVpc = centralEndpointVpcs[0];

    if (centralEndpointVpc) {
      Logger.info(
        '[network-associations-stack] Central endpoints VPC detected, share private hosted zone with member VPCs',
      );

      // Generate list of accounts with VPCs that needed to set up share
      const accountIds: string[] = [];
      for (const vpcItem of props.networkConfig.vpcs ?? []) {
        if (vpcItem.region == cdk.Stack.of(this).region) {
          const accountId = props.accountsConfig.getAccountId(vpcItem.account);
          if (!accountIds.includes(accountId)) {
            accountIds.push(accountId);
          }
        }
      }

      // Create list of hosted zone ids from SSM Params
      const hostedZoneIds: string[] = [];
      for (const endpointItem of centralEndpointVpc.interfaceEndpoints?.endpoints ?? []) {
        const hostedZoneId = cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          `/accelerator/network/vpc/${centralEndpointVpc.name}/route53/hostedZone/${endpointItem}/id`,
        );
        hostedZoneIds.push(hostedZoneId);
      }

      // Custom resource to associate hosted zones
      new AssociateHostedZones(this, 'AssociateHostedZones', {
        accountIds,
        hostedZoneIds,
        hostedZoneAccountId: cdk.Stack.of(this).account,
        roleName: `AWSAccelerator-EnableCentralEndpointsRole-${cdk.Stack.of(this).region}`,
        tagFilters: [
          {
            key: 'accelerator:use-central-endpoints',
            value: 'true',
          },
          {
            key: 'accelerator:central-endpoints-account-id',
            value: props.accountsConfig.getAccountId(centralEndpointVpc.account),
          },
        ],
        kmsKey: key,
        logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
      });
    }

    //
    // Route 53 Resolver associations
    //
    const dnsFirewallMap = new Map<string, string>();
    const queryLogMap = new Map<string, string>();
    const resolverRuleMap = new Map<string, string>();
    const centralNetworkConfig = props.networkConfig.centralNetworkServices;

    for (const vpcItem of props.networkConfig.vpcs ?? []) {
      const accountId = props.accountsConfig.getAccountId(vpcItem.account);
      // Only care about VPCs to be created in the current account and region
      if (accountId === cdk.Stack.of(this).account && vpcItem.region == cdk.Stack.of(this).region) {
        // DNS firewall rule group associations
        for (const firewallItem of vpcItem.dnsFirewallRuleGroups ?? []) {
          // Get VPC ID
          const vpcId = cdk.aws_ssm.StringParameter.valueForStringParameter(
            this,
            `/accelerator/network/vpc/${vpcItem.name}/id`,
          );

          // Skip lookup if already added to map
          if (dnsFirewallMap.has(firewallItem.name)) {
            continue;
          }

          if (centralNetworkConfig?.delegatedAdminAccount) {
            const owningAccountId = props.accountsConfig.getAccountId(centralNetworkConfig.delegatedAdminAccount);

            // Get SSM parameter if this is the owning account
            if (owningAccountId === cdk.Stack.of(this).account) {
              const ruleId = cdk.aws_ssm.StringParameter.valueForStringParameter(
                this,
                `/accelerator/network/route53Resolver/firewall/ruleGroups/${firewallItem.name}/id`,
              );
              Logger.info(`[network-associations-stack] Adding [${firewallItem.name}]: ${ruleId} to dnsFirewallMap`);
              dnsFirewallMap.set(firewallItem.name, ruleId);
            } else {
              // Get ID from the resource share
              const resourceShare = ResourceShare.fromLookup(
                this,
                pascalCase(`${firewallItem.name}ResolverFirewallRuleGroupShare`),
                {
                  resourceShareOwner: ResourceShareOwner.OTHER_ACCOUNTS,
                  resourceShareName: `${firewallItem.name}_ResolverFirewallRuleGroupShare`,
                  owningAccountId,
                },
              );

              // Represents the rule group
              const rule = ResourceShareItem.fromLookup(
                this,
                pascalCase(`${firewallItem.name}ResolverFirewallRuleGroup`),
                {
                  resourceShare,
                  resourceShareItemType: 'route53resolver:FirewallRuleGroup',
                  kmsKey: key,
                  logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
                },
              );
              dnsFirewallMap.set(firewallItem.name, rule.resourceShareItemId);
            }
          }

          // Create association
          if (!dnsFirewallMap.get(firewallItem.name)) {
            throw new Error(
              `[network-associations-stack] Could not find existing DNS firewall rule group ${firewallItem.name}`,
            );
          }
          Logger.info(
            `[network-associations-stack] Add DNS firewall rule group ${firewallItem.name} to ${vpcItem.name}`,
          );

          new ResolverFirewallRuleGroupAssociation(
            this,
            pascalCase(`${vpcItem.name}${firewallItem.name}RuleGroupAssociation`),
            {
              firewallRuleGroupId: dnsFirewallMap.get(firewallItem.name)!,
              priority: firewallItem.priority,
              vpcId: vpcId,
              mutationProtection: firewallItem.mutationProtection,
              tags: firewallItem.tags,
            },
          );
        }

        //
        // Route 53 query logging configuration associations
        //
        for (const configItem of vpcItem.queryLogs ?? []) {
          // Get VPC ID
          const vpcId = cdk.aws_ssm.StringParameter.valueForStringParameter(
            this,
            `/accelerator/network/vpc/${vpcItem.name}/id`,
          );

          // Skip lookup if already added to map
          if (queryLogMap.has(configItem)) {
            continue;
          }

          if (centralNetworkConfig?.delegatedAdminAccount) {
            const owningAccountId = props.accountsConfig.getAccountId(centralNetworkConfig.delegatedAdminAccount);

            // Determine query log destination(s)
            const configNames: string[] = [];
            if (centralNetworkConfig.route53Resolver?.queryLogs?.destinations.includes('s3')) {
              configNames.push(`${configItem}-s3`);
            }
            if (centralNetworkConfig.route53Resolver?.queryLogs?.destinations.includes('cloud-watch-logs')) {
              configNames.push(`${configItem}-cwl`);
            }

            // Get SSM parameter if this is the owning account
            for (const nameItem of configNames) {
              if (owningAccountId === cdk.Stack.of(this).account) {
                const configId = cdk.aws_ssm.StringParameter.valueForStringParameter(
                  this,
                  `/accelerator/network/route53Resolver/queryLogConfigs/${nameItem}/id`,
                );
                Logger.info(`[network-associations-stack] Adding [${nameItem}]: ${configId} to queryLogMap`);
                queryLogMap.set(nameItem, configId);
              } else {
                // Get ID from the resource share
                const resourceShare = ResourceShare.fromLookup(
                  this,
                  pascalCase(`${vpcItem.name}${nameItem}ResolverQueryLogConfigShare`),
                  {
                    resourceShareOwner: ResourceShareOwner.OTHER_ACCOUNTS,
                    resourceShareName: `${nameItem}_QueryLogConfigShare`,
                    owningAccountId,
                  },
                );

                // Represents the rule group
                const config = ResourceShareItem.fromLookup(
                  this,
                  pascalCase(`${vpcItem}${nameItem}ResolverQueryLogConfig`),
                  {
                    resourceShare,
                    resourceShareItemType: 'route53resolver:ResolverQueryLogConfig',
                    kmsKey: key,
                    logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
                  },
                );
                queryLogMap.set(nameItem, config.resourceShareItemId);
              }
            }

            // Create association
            for (const nameItem of configNames) {
              if (!queryLogMap.get(nameItem)) {
                throw new Error(
                  `[network-associations-stack] Could not find existing DNS query log config ${nameItem}`,
                );
              }
              Logger.info(`[network-associations-stack] Add DNS query log config ${nameItem} to ${vpcItem.name}`);
              new QueryLoggingConfigAssociation(this, pascalCase(`${vpcItem.name}${nameItem}QueryLogAssociation`), {
                resolverQueryLogConfigId: queryLogMap.get(nameItem),
                vpcId: vpcId,
              });
            }
          }
        }

        //
        // Route 53 resolver rule associations
        //
        for (const ruleItem of vpcItem.resolverRules ?? []) {
          // Get VPC ID
          const vpcId = cdk.aws_ssm.StringParameter.valueForStringParameter(
            this,
            `/accelerator/network/vpc/${vpcItem.name}/id`,
          );

          // Skip lookup if already added to map
          if (resolverRuleMap.has(ruleItem)) {
            continue;
          }

          if (centralNetworkConfig?.delegatedAdminAccount) {
            const owningAccountId = props.accountsConfig.getAccountId(centralNetworkConfig.delegatedAdminAccount);

            // Get SSM parameter if this is the owning account
            if (owningAccountId === cdk.Stack.of(this).account) {
              const ruleId = cdk.aws_ssm.StringParameter.valueForStringParameter(
                this,
                `/accelerator/network/route53Resolver/rules/${ruleItem}/id`,
              );
              Logger.info(`[network-associations-stack] Adding [${ruleItem}]: ${ruleId} to resolverRuleMap`);
              resolverRuleMap.set(ruleItem, ruleId);
            } else {
              // Get ID from the resource share
              const resourceShare = ResourceShare.fromLookup(
                this,
                pascalCase(`${vpcItem.name}${ruleItem}ResolverRuleShare`),
                {
                  resourceShareOwner: ResourceShareOwner.OTHER_ACCOUNTS,
                  resourceShareName: `${ruleItem}_ResolverRule`,
                  owningAccountId,
                },
              );

              // Represents the rule group
              const rule = ResourceShareItem.fromLookup(this, pascalCase(`${ruleItem}ResolverRule`), {
                resourceShare,
                resourceShareItemType: 'route53resolver:ResolverRule',
                kmsKey: key,
                logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
              });
              resolverRuleMap.set(ruleItem, rule.resourceShareItemId);
            }
          }

          // Create association
          if (!resolverRuleMap.get(ruleItem)) {
            throw new Error(`[network-associations-stack] Could not find existing Route 53 Resolver rule ${ruleItem}`);
          }
          Logger.info(`[network-associations-stack] Add Route 53 Resolver rule ${ruleItem} to ${vpcItem.name}`);
          new ResolverRuleAssociation(this, pascalCase(`${vpcItem.name}${ruleItem}RuleAssociation`), {
            resolverRuleId: resolverRuleMap.get(ruleItem)!,
            vpcId: vpcId,
          });
        }
      }
    }

    //
    // Check for VPC peering connections
    //
    const peeringList: Peering[] = [];
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

        // Check if requester VPC is in this account and region
        if (cdk.Stack.of(this).account === requesterAccountId && cdk.Stack.of(this).region === requesterVpc[0].region) {
          peeringList.push({
            name: peering.name,
            requester: requesterVpc[0],
            accepter: accepterVpc[0],
            tags: peering.tags,
          });
        }
      }
    }

    // Create VPC peering connections
    for (const peering of peeringList ?? []) {
      // Get account IDs
      const requesterAccountId = props.accountsConfig.getAccountId(peering.requester.account);
      const accepterAccountId = props.accountsConfig.getAccountId(peering.accepter.account);

      // Get SSM parameters
      const requesterVpcId = cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        `/accelerator/network/vpc/${peering.requester.name}/id`,
      );

      let accepterVpcId: string;
      let accepterRoleName: string | undefined = undefined;
      if (requesterAccountId !== accepterAccountId) {
        accepterVpcId = new SsmParameter(this, pascalCase(`SsmParamLookup${peering.name}`), {
          region: peering.accepter.region,
          partition: cdk.Stack.of(this).partition,
          parameter: {
            name: `/accelerator/network/vpc/${peering.accepter.name}/id`,
            accountId: accepterAccountId,
            roleName: `AWSAccelerator-VpcPeeringRole-${peering.accepter.region}`,
          },
          invokingAccountID: cdk.Stack.of(this).account,
          type: SsmParameterType.GET,
        }).value;

        accepterRoleName = `AWSAccelerator-VpcPeeringRole-${peering.accepter.region}`;
      } else {
        accepterVpcId = cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          `/accelerator/network/vpc/${peering.accepter.name}/id`,
        );
      }

      // Create VPC peering
      Logger.info(
        `[network-associations-stack] Create VPC peering ${peering.name} between ${peering.requester.name} and ${peering.accepter.name}`,
      );
      const vpcPeering = new VpcPeering(this, `${peering.name}VpcPeering`, {
        name: peering.name,
        peerOwnerId: accepterAccountId,
        peerRegion: peering.accepter.region,
        peerVpcId: accepterVpcId,
        peerRoleName: accepterRoleName,
        vpcId: requesterVpcId,
        tags: peering.tags ?? [],
      });
      new cdk.aws_ssm.StringParameter(this, pascalCase(`SsmParam${pascalCase(peering.name)}VpcPeering`), {
        parameterName: `/accelerator/network/vpcPeering/${peering.name}/id`,
        stringValue: vpcPeering.peeringId,
      });

      // Put cross-account SSM parameter if necessary
      if (requesterAccountId !== accepterAccountId) {
        new SsmParameter(this, pascalCase(`CrossAcctSsmParam${pascalCase(peering.name)}VpcPeering`), {
          region: peering.accepter.region,
          partition: cdk.Stack.of(this).partition,
          parameter: {
            name: `/accelerator/network/vpcPeering/${peering.name}/id`,
            accountId: accepterAccountId,
            roleName: `AWSAccelerator-VpcPeeringRole-${peering.accepter.region}`,
            value: vpcPeering.peeringId,
          },
          invokingAccountID: cdk.Stack.of(this).account,
          type: SsmParameterType.PUT,
        });
      }
    }
  }
}
