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
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';

import {
  AccountsConfig,
  DxGatewayConfig,
  DxTransitGatewayAssociationConfig,
  NetworkConfigTypes,
  ShareTargets,
  TransitGatewayConfig,
  TransitGatewayRouteEntryConfig,
  TransitGatewayRouteTableConfig,
  VpcConfig,
  VpcTemplatesConfig,
} from '@aws-accelerator/config';
import {
  AssociateHostedZones,
  DirectConnectGatewayAssociation,
  DirectConnectGatewayAssociationProps,
  PutSsmParameter,
  QueryLoggingConfigAssociation,
  ResolverFirewallRuleGroupAssociation,
  ResolverRuleAssociation,
  ShareSubnetTags,
  SsmParameterLookup,
  TransitGatewayAttachment,
  TransitGatewayPrefixListReference,
  TransitGatewayRouteTableAssociation,
  TransitGatewayRouteTablePropagation,
  TransitGatewayStaticRoute,
  VpcPeering,
} from '@aws-accelerator/constructs';

import { Logger } from '../logger';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';

interface Peering {
  name: string;
  requester: VpcConfig;
  accepter: VpcConfig;
  tags: cdk.CfnTag[] | undefined;
}

export class NetworkAssociationsStack extends AcceleratorStack {
  private accountsConfig: AccountsConfig;
  private cloudwatchKey: cdk.aws_kms.Key;
  private logRetention: number;
  private dnsFirewallMap: Map<string, string>;
  private dxGatewayMap: Map<string, string>;
  private prefixListMap: Map<string, string>;
  private queryLogMap: Map<string, string>;
  private resolverRuleMap: Map<string, string>;
  private transitGateways: Map<string, string>;
  private transitGatewayRouteTables: Map<string, string>;
  private transitGatewayAttachments: Map<string, string>;

  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    // Set private properties
    this.accountsConfig = props.accountsConfig;
    this.logRetention = props.globalConfig.cloudwatchLogRetentionInDays;
    this.dnsFirewallMap = new Map<string, string>();
    this.dxGatewayMap = new Map<string, string>();
    this.prefixListMap = new Map<string, string>();
    this.queryLogMap = new Map<string, string>();
    this.resolverRuleMap = new Map<string, string>();
    this.transitGateways = new Map<string, string>();
    this.transitGatewayAttachments = new Map<string, string>();
    this.transitGatewayRouteTables = new Map<string, string>();

    this.cloudwatchKey = cdk.aws_kms.Key.fromKeyArn(
      this,
      'AcceleratorGetCloudWatchKey',
      cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        AcceleratorStack.ACCELERATOR_CLOUDWATCH_LOG_KEY_ARN_PARAMETER_NAME,
      ),
    ) as cdk.aws_kms.Key;

    //
    // Build prefix list map
    //
    this.setPrefixListMap(props);

    //
    // Create transit gateway route table associations, propagations,
    // for VPC attachments
    //
    this.createTransitGatewayResources(props);

    //
    // Create Route 53 private hosted zone associations
    //
    this.createHostedZoneAssociations();

    //
    // Create central network service VPC associations
    //
    this.createCentralNetworkAssociations(props);

    //
    // Create VPC peering connections
    //
    this.createVpcPeeringConnections();

    //
    // Create Direct Connect resources
    //
    this.createDirectConnectResources(props);

    //
    // Create transit gateway static routes, blackhole
    // routes, and prefix list references
    //
    this.createTransitGatewayStaticRoutes(props);

    //
    // Apply tags to shared VPC/subnet resources
    //
    this.shareSubnetTags();

    Logger.info('[network-associations-stack] Completed stack synthesis');
  }

  /**
   * Create a map of prefix list IDs
   * @param props
   */
  private setPrefixListMap(props: AcceleratorStackProps): void {
    for (const prefixListItem of props.networkConfig.prefixLists ?? []) {
      // Check if the set belongs in this account/region
      const accountIds = prefixListItem.accounts.map(item => {
        return this.accountsConfig.getAccountId(item);
      });
      const regions = prefixListItem.regions.map(item => {
        return item.toString();
      });

      if (accountIds.includes(cdk.Stack.of(this).account) && regions.includes(cdk.Stack.of(this).region)) {
        const prefixListId = cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          `/accelerator/network/prefixList/${prefixListItem.name}/id`,
        );
        this.prefixListMap.set(prefixListItem.name, prefixListId);
      }
    }
  }

  /**
   * Create transit gateway resources
   * @param props
   */
  private createTransitGatewayResources(props: AcceleratorStackProps) {
    //
    // Build Transit Gateway Maps
    //
    for (const tgwItem of props.networkConfig.transitGateways ?? []) {
      this.setTransitGatewayMap(tgwItem);
      this.setTransitGatewayRouteTableMap(tgwItem);
    }

    //
    // Create Transit Gateway route table associations and propagations
    // for VPC attachments
    //
    for (const vpcItem of [...props.networkConfig.vpcs, ...(props.networkConfig.vpcTemplates ?? [])] ?? []) {
      this.setTransitGatewayAttachmentsMap(vpcItem);
      this.createVpcTransitGatewayAssociations(vpcItem);
      this.createVpcTransitGatewayPropagations(vpcItem);
    }
  }

  /**
   * Set transit gateways map
   * @param tgwItem
   */
  private setTransitGatewayMap(tgwItem: TransitGatewayConfig): void {
    const accountId = this.accountsConfig.getAccountId(tgwItem.account);
    if (accountId === cdk.Stack.of(this).account && tgwItem.region == cdk.Stack.of(this).region) {
      const transitGatewayId = ssm.StringParameter.valueForStringParameter(
        this,
        `/accelerator/network/transitGateways/${tgwItem.name}/id`,
      );
      this.transitGateways.set(tgwItem.name, transitGatewayId);
    }
  }

  /**
   * Set transit gateway route table map
   * @param tgwItem
   */
  private setTransitGatewayRouteTableMap(tgwItem: TransitGatewayConfig): void {
    const accountId = this.accountsConfig.getAccountId(tgwItem.account);
    if (accountId === cdk.Stack.of(this).account && tgwItem.region == cdk.Stack.of(this).region) {
      for (const routeTableItem of tgwItem.routeTables ?? []) {
        const transitGatewayRouteTableId = ssm.StringParameter.valueForStringParameter(
          this,
          `/accelerator/network/transitGateways/${tgwItem.name}/routeTables/${routeTableItem.name}/id`,
        );
        const key = `${tgwItem.name}_${routeTableItem.name}`;
        this.transitGatewayRouteTables.set(key, transitGatewayRouteTableId);
      }
    }
  }

  /**
   * Get account names and excluded account IDs for transit gateway attachments
   * @param vpcItem
   * @returns
   */
  private getTransitGatewayAttachmentAccounts(vpcItem: VpcConfig | VpcTemplatesConfig): [string[], string[]] {
    let accountNames: string[];
    let excludedAccountIds: string[] = [];
    if (NetworkConfigTypes.vpcConfig.is(vpcItem)) {
      accountNames = [vpcItem.account];
    } else {
      accountNames = this.getAccountNamesFromDeploymentTarget(vpcItem.deploymentTargets);
      excludedAccountIds = this.getExcludedAccountIds(vpcItem.deploymentTargets);
    }
    return [accountNames, excludedAccountIds];
  }

  /**
   * Create a map of transit gateway attachments
   * @param vpcItem
   */
  private setTransitGatewayAttachmentsMap(vpcItem: VpcConfig | VpcTemplatesConfig) {
    // Get account names for attachment keys
    const [accountNames, excludedAccountIds] = this.getTransitGatewayAttachmentAccounts(vpcItem);

    if (vpcItem.region === cdk.Stack.of(this).region) {
      for (const tgwAttachmentItem of vpcItem.transitGatewayAttachments ?? []) {
        const accountId = this.accountsConfig.getAccountId(tgwAttachmentItem.transitGateway.account);
        if (accountId === cdk.Stack.of(this).account) {
          // Get the Transit Gateway ID
          const transitGatewayId = this.transitGateways.get(tgwAttachmentItem.transitGateway.name);
          if (!transitGatewayId) {
            throw new Error(`Transit Gateway ${tgwAttachmentItem.transitGateway.name} not found`);
          }

          // Get the Transit Gateway Attachment ID
          for (const owningAccount of accountNames) {
            let transitGatewayAttachmentId;
            const owningAccountId = this.accountsConfig.getAccountId(owningAccount);
            const attachmentKey = `${owningAccount}_${vpcItem.name}`;
            // Skip iteration if account is excluded
            if (excludedAccountIds.includes(owningAccountId)) {
              continue;
            }

            if (accountId === owningAccountId) {
              Logger.info(
                `[network-associations-stack] Update route tables for attachment ${tgwAttachmentItem.name} from local account ${owningAccountId}`,
              );
              transitGatewayAttachmentId = ssm.StringParameter.valueForStringParameter(
                this,
                `/accelerator/network/vpc/${vpcItem.name}/transitGatewayAttachment/${tgwAttachmentItem.name}/id`,
              );
              this.transitGatewayAttachments.set(attachmentKey, transitGatewayAttachmentId);
            } else {
              Logger.info(
                `[network-associations-stack] Update route tables for attachment ${tgwAttachmentItem.name} from external account ${owningAccountId}`,
              );

              const transitGatewayAttachment = TransitGatewayAttachment.fromLookup(
                this,
                pascalCase(`${tgwAttachmentItem.name}${owningAccount}VpcTransitGatewayAttachment`),
                {
                  name: tgwAttachmentItem.name,
                  owningAccountId,
                  transitGatewayId,
                  roleName: `AWSAccelerator-DescribeTgwAttachRole-${cdk.Stack.of(this).region}`,
                  kmsKey: this.cloudwatchKey,
                  logRetentionInDays: this.logRetention,
                },
              );
              // Build Transit Gateway Attachment Map
              transitGatewayAttachmentId = transitGatewayAttachment.transitGatewayAttachmentId;
              this.transitGatewayAttachments.set(attachmentKey, transitGatewayAttachmentId);
            }
          }
        }
      }
    }
  }

  /**
   * Create transit gateway route table associations for VPC attachments
   * @param vpcItem
   */
  private createVpcTransitGatewayAssociations(vpcItem: VpcConfig | VpcTemplatesConfig): void {
    // Get account names for attachment keys
    const [accountNames, excludedAccountIds] = this.getTransitGatewayAttachmentAccounts(vpcItem);

    if (vpcItem.region === cdk.Stack.of(this).region) {
      for (const tgwAttachmentItem of vpcItem.transitGatewayAttachments ?? []) {
        const accountId = this.accountsConfig.getAccountId(tgwAttachmentItem.transitGateway.account);
        if (accountId === cdk.Stack.of(this).account) {
          // Get the Transit Gateway Attachment ID
          for (const owningAccount of accountNames) {
            const owningAccountId = this.accountsConfig.getAccountId(owningAccount);
            const attachmentKey = `${owningAccount}_${vpcItem.name}`;
            // Skip iteration if account is excluded
            if (excludedAccountIds.includes(owningAccountId)) {
              continue;
            }

            // Get transit gateway attachment ID
            const transitGatewayAttachmentId = this.transitGatewayAttachments.get(attachmentKey);
            if (!transitGatewayAttachmentId) {
              throw new Error(`Transit Gateway attachment ${attachmentKey} not found`);
            }

            for (const routeTableItem of tgwAttachmentItem.routeTableAssociations ?? []) {
              const associationsKey = `${tgwAttachmentItem.transitGateway.name}_${routeTableItem}`;
              let associationId: string;
              if (NetworkConfigTypes.vpcConfig.is(vpcItem)) {
                associationId = `${pascalCase(tgwAttachmentItem.name)}${pascalCase(routeTableItem)}Association`;
              } else {
                associationId = `${pascalCase(tgwAttachmentItem.name)}${pascalCase(routeTableItem)}${pascalCase(
                  owningAccount,
                )}Association`;
              }

              const transitGatewayRouteTableId = this.transitGatewayRouteTables.get(associationsKey);
              if (transitGatewayRouteTableId === undefined) {
                throw new Error(`Transit Gateway Route Table ${associationsKey} not found`);
              }

              new TransitGatewayRouteTableAssociation(this, associationId, {
                transitGatewayAttachmentId,
                transitGatewayRouteTableId,
              });
            }
          }
        }
      }
    }
  }

  /**
   * Create transit gateway route table propagations for VPC attachments
   * @param vpcItem
   */
  private createVpcTransitGatewayPropagations(vpcItem: VpcConfig | VpcTemplatesConfig): void {
    // Get account names for attachment keys
    const [accountNames, excludedAccountIds] = this.getTransitGatewayAttachmentAccounts(vpcItem);

    if (vpcItem.region === cdk.Stack.of(this).region) {
      for (const tgwAttachmentItem of vpcItem.transitGatewayAttachments ?? []) {
        const accountId = this.accountsConfig.getAccountId(tgwAttachmentItem.transitGateway.account);
        if (accountId === cdk.Stack.of(this).account) {
          // Loop through attachment owner accounts
          for (const owningAccount of accountNames) {
            const owningAccountId = this.accountsConfig.getAccountId(owningAccount);
            const attachmentKey = `${owningAccount}_${vpcItem.name}`;
            // Skip iteration if account is excluded
            if (excludedAccountIds.includes(owningAccountId)) {
              continue;
            }

            // Get transit gateway attachment ID
            const transitGatewayAttachmentId = this.transitGatewayAttachments.get(attachmentKey);
            if (!transitGatewayAttachmentId) {
              throw new Error(`Transit Gateway attachment ${attachmentKey} not found`);
            }

            for (const routeTableItem of tgwAttachmentItem.routeTablePropagations ?? []) {
              const propagationsKey = `${tgwAttachmentItem.transitGateway.name}_${routeTableItem}`;
              let propagationId: string;
              if (NetworkConfigTypes.vpcConfig.is(vpcItem)) {
                propagationId = `${pascalCase(tgwAttachmentItem.name)}${pascalCase(routeTableItem)}Propagation`;
              } else {
                propagationId = `${pascalCase(tgwAttachmentItem.name)}${pascalCase(routeTableItem)}${pascalCase(
                  owningAccount,
                )}Propagation`;
              }

              const transitGatewayRouteTableId = this.transitGatewayRouteTables.get(propagationsKey);
              if (!transitGatewayRouteTableId) {
                throw new Error(`Transit Gateway Route Table ${propagationsKey} not found`);
              }

              new TransitGatewayRouteTablePropagation(this, propagationId, {
                transitGatewayAttachmentId,
                transitGatewayRouteTableId,
              });
            }
          }
        }
      }
    }
  }

  /**
   * Create Route 53 private hosted zone associations for centralized interface endpoints
   */
  private createHostedZoneAssociations(): void {
    let centralEndpointVpc = undefined;
    const centralEndpointVpcs = this.props.networkConfig.vpcs.filter(
      item =>
        item.interfaceEndpoints?.central &&
        this.props.accountsConfig.getAccountId(item.account) === cdk.Stack.of(this).account &&
        item.region === cdk.Stack.of(this).region,
    );

    if (this.props.partition !== 'aws' && this.props.partition !== 'aws-cn' && centralEndpointVpcs.length > 0) {
      throw new Error('Central Endpoint VPC is only possible in commercial regions');
    }

    if (centralEndpointVpcs.length > 1) {
      throw new Error(`multiple (${centralEndpointVpcs.length}) central endpoint vpcs detected, should only be one`);
    }
    centralEndpointVpc = centralEndpointVpcs[0];

    if (centralEndpointVpc) {
      Logger.info(
        '[network-associations-stack] Central endpoints VPC detected, share private hosted zone with member VPCs',
      );

      // Generate list of accounts with VPCs that needed to set up share
      const zoneAssociationAccountIds: string[] = [];
      for (const vpcItem of [...this.props.networkConfig.vpcs, ...(this.props.networkConfig.vpcTemplates ?? [])] ??
        []) {
        // Get account IDs
        const vpcAccountIds = this.getVpcAccountIds(vpcItem);

        if (vpcItem.region === cdk.Stack.of(this).region && vpcItem.useCentralEndpoints) {
          for (const accountId of vpcAccountIds) {
            if (!zoneAssociationAccountIds.includes(accountId)) {
              zoneAssociationAccountIds.push(accountId);
            }
          }
        }
      }

      // Create list of hosted zone ids from SSM Params
      const hostedZoneIds: string[] = [];
      for (const endpointItem of centralEndpointVpc.interfaceEndpoints?.endpoints ?? []) {
        const hostedZoneId = cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          `/accelerator/network/vpc/${centralEndpointVpc.name}/route53/hostedZone/${endpointItem.service}/id`,
        );
        hostedZoneIds.push(hostedZoneId);
      }

      // Custom resource to associate hosted zones
      new AssociateHostedZones(this, 'AssociateHostedZones', {
        accountIds: zoneAssociationAccountIds,
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
            value: this.props.accountsConfig.getAccountId(centralEndpointVpc.account),
          },
        ],
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.logRetention,
      });
    }
  }

  /**
   * Create central network service associations
   * @param props
   */
  private createCentralNetworkAssociations(props: AcceleratorStackProps) {
    //
    // Create Route 53 Resolver VPC associations
    //
    if (props.networkConfig.centralNetworkServices) {
      for (const vpcItem of [...props.networkConfig.vpcs, ...(props.networkConfig.vpcTemplates ?? [])] ?? []) {
        // Get account IDs
        const vpcAccountIds = this.getVpcAccountIds(vpcItem);
        const delegatedAdminAccountId = this.accountsConfig.getAccountId(
          props.networkConfig.centralNetworkServices.delegatedAdminAccount,
        );
        if (vpcAccountIds.includes(cdk.Stack.of(this).account) && vpcItem.region === cdk.Stack.of(this).region) {
          this.createDnsFirewallAssociations(vpcItem, delegatedAdminAccountId);
          this.createQueryLogConfigAssociations(vpcItem, delegatedAdminAccountId);
          this.createResolverRuleAssociations(vpcItem, delegatedAdminAccountId);
        }
      }
    }
  }

  /**
   * Create Route 53 Resolver DNS Firewall VPC associations
   * @param vpcItem
   * @param owningAccountId
   */
  private createDnsFirewallAssociations(vpcItem: VpcConfig | VpcTemplatesConfig, owningAccountId: string): void {
    for (const firewallItem of vpcItem.dnsFirewallRuleGroups ?? []) {
      // Get VPC ID
      const vpcId = cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        `/accelerator/network/vpc/${vpcItem.name}/id`,
      );

      // Skip lookup if already added to map
      if (!this.dnsFirewallMap.has(firewallItem.name)) {
        // Get SSM parameter if this is the owning account
        if (owningAccountId === cdk.Stack.of(this).account) {
          const ruleId = cdk.aws_ssm.StringParameter.valueForStringParameter(
            this,
            `/accelerator/network/route53Resolver/firewall/ruleGroups/${firewallItem.name}/id`,
          );
          this.dnsFirewallMap.set(firewallItem.name, ruleId);
        } else {
          // Get ID from the resource share
          const ruleId = this.getResourceShare(
            `${firewallItem.name}_ResolverFirewallRuleGroupShare`,
            'route53resolver:FirewallRuleGroup',
            owningAccountId,
            this.cloudwatchKey,
          ).resourceShareItemId;
          this.dnsFirewallMap.set(firewallItem.name, ruleId);
        }
      }

      // Create association
      if (!this.dnsFirewallMap.get(firewallItem.name)) {
        throw new Error(
          `[network-associations-stack] Could not find existing DNS firewall rule group ${firewallItem.name}`,
        );
      }
      Logger.info(`[network-associations-stack] Add DNS firewall rule group ${firewallItem.name} to ${vpcItem.name}`);

      new ResolverFirewallRuleGroupAssociation(
        this,
        pascalCase(`${vpcItem.name}${firewallItem.name}RuleGroupAssociation`),
        {
          firewallRuleGroupId: this.dnsFirewallMap.get(firewallItem.name)!,
          priority: firewallItem.priority,
          vpcId: vpcId,
          mutationProtection: firewallItem.mutationProtection,
          tags: firewallItem.tags,
        },
      );
    }
  }

  /**
   * Create Route 53 Resolver query log config VPC associations
   * @param vpcItem
   * @param owningAccountId
   */
  private createQueryLogConfigAssociations(vpcItem: VpcConfig | VpcTemplatesConfig, owningAccountId: string): void {
    for (const configItem of vpcItem.queryLogs ?? []) {
      // Get VPC ID
      const vpcId = cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        `/accelerator/network/vpc/${vpcItem.name}/id`,
      );

      // Determine query log destination(s)
      const centralNetworkConfig = this.props.networkConfig.centralNetworkServices!;
      const configNames: string[] = [];
      if (centralNetworkConfig.route53Resolver?.queryLogs?.destinations.includes('s3')) {
        configNames.push(`${configItem}-s3`);
      }
      if (centralNetworkConfig.route53Resolver?.queryLogs?.destinations.includes('cloud-watch-logs')) {
        configNames.push(`${configItem}-cwl`);
      }

      // Get SSM parameter if this is the owning account
      for (const nameItem of configNames) {
        // Skip lookup if already added to map
        if (!this.queryLogMap.has(nameItem)) {
          if (owningAccountId === cdk.Stack.of(this).account) {
            const configId = cdk.aws_ssm.StringParameter.valueForStringParameter(
              this,
              `/accelerator/network/route53Resolver/queryLogConfigs/${nameItem}/id`,
            );
            this.queryLogMap.set(nameItem, configId);
          } else {
            // Get ID from the resource share
            const configId = this.getResourceShare(
              `${nameItem}_QueryLogConfigShare`,
              'route53resolver:ResolverQueryLogConfig',
              owningAccountId,
              this.cloudwatchKey,
            ).resourceShareItemId;
            this.queryLogMap.set(nameItem, configId);
          }
        }
      }

      // Create association
      for (const nameItem of configNames) {
        if (!this.queryLogMap.get(nameItem)) {
          throw new Error(`[network-associations-stack] Could not find existing DNS query log config ${nameItem}`);
        }
        Logger.info(`[network-associations-stack] Add DNS query log config ${nameItem} to ${vpcItem.name}`);
        new QueryLoggingConfigAssociation(this, pascalCase(`${vpcItem.name}${nameItem}QueryLogAssociation`), {
          resolverQueryLogConfigId: this.queryLogMap.get(nameItem),
          vpcId: vpcId,
          partition: this.props.partition,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: this.logRetention,
        });
      }
    }
  }

  /**
   * Create Route 53 Resolver rule VPC associations
   * @param vpcItem
   * @param owningAccountId
   */
  private createResolverRuleAssociations(vpcItem: VpcConfig | VpcTemplatesConfig, owningAccountId: string): void {
    for (const ruleItem of vpcItem.resolverRules ?? []) {
      // Get VPC ID
      const vpcId = cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        `/accelerator/network/vpc/${vpcItem.name}/id`,
      );

      // Skip lookup if already added to map
      if (!this.resolverRuleMap.has(ruleItem)) {
        // Get SSM parameter if this is the owning account
        if (owningAccountId === cdk.Stack.of(this).account) {
          const ruleId = cdk.aws_ssm.StringParameter.valueForStringParameter(
            this,
            `/accelerator/network/route53Resolver/rules/${ruleItem}/id`,
          );
          this.resolverRuleMap.set(ruleItem, ruleId);
        } else {
          // Get ID from the resource share
          const ruleId = this.getResourceShare(
            `${ruleItem}_ResolverRule`,
            'route53resolver:ResolverRule',
            owningAccountId,
            this.cloudwatchKey,
          ).resourceShareItemId;
          this.resolverRuleMap.set(ruleItem, ruleId);
        }
      }

      // Create association
      if (!this.resolverRuleMap.get(ruleItem)) {
        throw new Error(`[network-associations-stack] Could not find existing Route 53 Resolver rule ${ruleItem}`);
      }
      Logger.info(`[network-associations-stack] Add Route 53 Resolver rule ${ruleItem} to ${vpcItem.name}`);
      new ResolverRuleAssociation(this, pascalCase(`${vpcItem.name}${ruleItem}RuleAssociation`), {
        resolverRuleId: this.resolverRuleMap.get(ruleItem)!,
        vpcId: vpcId,
      });
    }
  }

  /**
   * Create VPC peering connections
   */
  private createVpcPeeringConnections(): void {
    const peeringList: Peering[] = [];
    for (const peering of this.props.networkConfig.vpcPeering ?? []) {
      // Check to ensure only two VPCs are defined
      if (peering.vpcs.length > 2) {
        throw new Error(`[network-vpc-stack] VPC peering connection ${peering.name} has more than two VPCs defined`);
      }

      // Get requester and accepter VPC configurations
      const requesterVpc = this.props.networkConfig.vpcs.filter(item => item.name === peering.vpcs[0]);
      const accepterVpc = this.props.networkConfig.vpcs.filter(item => item.name === peering.vpcs[1]);

      if (requesterVpc.length === 1 && accepterVpc.length === 1) {
        const requesterAccountId = this.accountsConfig.getAccountId(requesterVpc[0].account);

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
      const requesterAccountId = this.accountsConfig.getAccountId(peering.requester.account);
      const accepterAccountId = this.accountsConfig.getAccountId(peering.accepter.account);

      // Get SSM parameters
      const requesterVpcId = cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        `/accelerator/network/vpc/${peering.requester.name}/id`,
      );

      let accepterVpcId: string;
      let accepterRoleName: string | undefined = undefined;
      if (requesterAccountId !== accepterAccountId) {
        accepterVpcId = new SsmParameterLookup(this, pascalCase(`SsmParamLookup${peering.name}`), {
          name: `/accelerator/network/vpc/${peering.accepter.name}/id`,
          accountId: accepterAccountId,
          parameterRegion: peering.accepter.region,
          roleName: `AWSAccelerator-VpcPeeringRole-${peering.accepter.region}`,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: this.logRetention,
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
        new PutSsmParameter(this, pascalCase(`CrossAcctSsmParam${pascalCase(peering.name)}VpcPeering`), {
          region: peering.accepter.region,
          partition: cdk.Stack.of(this).partition,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: this.logRetention,
          parameter: {
            name: `/accelerator/network/vpcPeering/${peering.name}/id`,
            accountId: accepterAccountId,
            roleName: `AWSAccelerator-VpcPeeringRole-${peering.accepter.region}`,
            value: vpcPeering.peeringId,
          },
          invokingAccountID: cdk.Stack.of(this).account,
        });
      }
    }
  }

  /**
   * Create Direct Connect resources
   * @param props
   */
  private createDirectConnectResources(props: AcceleratorStackProps) {
    for (const dxgwItem of props.networkConfig.directConnectGateways ?? []) {
      for (const associationItem of dxgwItem.transitGatewayAssociations ?? []) {
        const tgw = props.networkConfig.transitGateways.find(
          item => item.name === associationItem.name && item.account === associationItem.account,
        );
        if (!tgw) {
          throw new Error(`[network-associations-stack] Unable to locate transit gateway ${associationItem.name}`);
        }
        const tgwAccountId = this.accountsConfig.getAccountId(tgw.account);
        //
        // Set DX Gateway ID map
        //
        this.setDxGatewayMap(dxgwItem, tgw, tgwAccountId);
        //
        // Create DX Gateway associations to transit gateways
        //
        this.createDxGatewayTgwAssociations(dxgwItem, tgw, associationItem, tgwAccountId);
        //
        // Create transit gateway route table associations
        // and propagations for DX Gateway attachments
        //
        for (const routeTableAssociationItem of associationItem.routeTableAssociations ?? []) {
          this.createDxTgwRouteTableAssociations(dxgwItem, tgw, routeTableAssociationItem, tgwAccountId);
        }
        for (const routeTablePropagationItem of associationItem.routeTablePropagations ?? []) {
          this.createDxTgwRouteTablePropagations(dxgwItem, tgw, routeTablePropagationItem, tgwAccountId);
        }
      }
    }
  }

  /**
   * Set Direct Connect Gateway map
   * @param dxgwItem
   */
  private setDxGatewayMap(dxgwItem: DxGatewayConfig, tgw: TransitGatewayConfig, tgwAccountId: string): void {
    // If DX gateway and transit gateway accounts differ, get cross-account SSM parameter
    if (
      dxgwItem.account !== tgw.account &&
      tgwAccountId === cdk.Stack.of(this).account &&
      tgw.region === cdk.Stack.of(this).region
    ) {
      const directConnectGatewayOwnerAccount = this.accountsConfig.getAccountId(dxgwItem.account);
      const dxgwId = new SsmParameterLookup(this, pascalCase(`SsmParamLookup${dxgwItem.name}`), {
        name: `/accelerator/network/directConnectGateways/${dxgwItem.name}/id`,
        accountId: directConnectGatewayOwnerAccount,
        parameterRegion: this.props.globalConfig.homeRegion,
        roleName: `AWSAccelerator-Get${pascalCase(dxgwItem.name)}SsmParamRole-${this.props.globalConfig.homeRegion}`,
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.logRetention,
      }).value;
      this.dxGatewayMap.set(dxgwItem.name, dxgwId);
    }

    // If DX gateway and transit gateway accounts match, get local SSM parameter
    if (
      dxgwItem.account === tgw.account &&
      tgwAccountId === cdk.Stack.of(this).account &&
      tgw.region === cdk.Stack.of(this).region
    ) {
      if (tgw.region === this.props.globalConfig.homeRegion) {
        const dxgwId = cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          `/accelerator/network/directConnectGateways/${dxgwItem.name}/id`,
        );
        this.dxGatewayMap.set(dxgwItem.name, dxgwId);
      } else {
        const dxgwId = new SsmParameterLookup(this, pascalCase(`SsmParamLookup${dxgwItem.name}`), {
          name: `/accelerator/network/directConnectGateways/${dxgwItem.name}/id`,
          accountId: cdk.Stack.of(this).account,
          parameterRegion: this.props.globalConfig.homeRegion,
          roleName: `AWSAccelerator-Get${pascalCase(dxgwItem.name)}SsmParamRole-${this.props.globalConfig.homeRegion}`,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: this.logRetention,
        }).value;
        this.dxGatewayMap.set(dxgwItem.name, dxgwId);
      }
    }
  }

  /**
   * Create Direct Connect Gateway associations to transit gateways
   * @param dxgw
   * @param tgw
   * @param associationItem
   * @param tgwAccountId
   */
  private createDxGatewayTgwAssociations(
    dxgwItem: DxGatewayConfig,
    tgw: TransitGatewayConfig,
    associationItem: DxTransitGatewayAssociationConfig,
    tgwAccountId: string,
  ): void {
    // Condition-based variables
    let createAssociation = false;
    let associationLogicalId: string | undefined = undefined;
    let associationProps: DirectConnectGatewayAssociationProps | undefined = undefined;

    // If DX gateway and transit gateway accounts differ, create association proposal
    if (
      dxgwItem.account !== tgw.account &&
      tgwAccountId === cdk.Stack.of(this).account &&
      tgw.region === cdk.Stack.of(this).region
    ) {
      Logger.info(
        `[network-associations-stack] Creating association proposal between DX Gateway ${dxgwItem.name} and transit gateway ${tgw.name}`,
      );
      createAssociation = true;
      const directConnectGatewayId = this.dxGatewayMap.get(dxgwItem.name);
      const directConnectGatewayOwnerAccount = this.accountsConfig.getAccountId(dxgwItem.account);
      associationLogicalId = pascalCase(`${dxgwItem.name}${tgw.name}DxGatewayAssociationProposal`);
      const gatewayId = this.transitGateways.get(tgw.name);

      if (!directConnectGatewayId) {
        throw new Error(
          `[network-associations-stack] Create DX Gateway associations: unable to locate DX Gateway ID for ${dxgwItem.name}`,
        );
      }
      if (!gatewayId) {
        throw new Error(
          `[network-associations-stack] Create DX Gateway associations: unable to locate transit gateway ID for ${tgw.name}`,
        );
      }

      associationProps = {
        allowedPrefixes: associationItem.allowedPrefixes,
        directConnectGatewayId,
        directConnectGatewayOwnerAccount,
        gatewayId,
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.logRetention,
      };
    }

    // If DX gateway and transit gateway accounts match, create association
    if (
      dxgwItem.account === tgw.account &&
      tgwAccountId === cdk.Stack.of(this).account &&
      tgw.region === cdk.Stack.of(this).region
    ) {
      Logger.info(
        `[network-associations-stack] Creating association between DX Gateway ${dxgwItem.name} and transit gateway ${tgw.name}`,
      );
      createAssociation = true;
      const directConnectGatewayId = this.dxGatewayMap.get(dxgwItem.name);
      associationLogicalId = pascalCase(`${dxgwItem.name}${tgw.name}DxGatewayAssociation`);
      const gatewayId = this.transitGateways.get(tgw.name);

      if (!directConnectGatewayId) {
        throw new Error(
          `[network-associations-stack] Create DX Gateway associations: unable to locate DX Gateway ID for ${dxgwItem.name}`,
        );
      }
      if (!gatewayId) {
        throw new Error(
          `[network-associations-stack] Create DX Gateway associations: unable to locate transit gateway ID for ${tgw.name}`,
        );
      }

      associationProps = {
        allowedPrefixes: associationItem.allowedPrefixes,
        directConnectGatewayId,
        gatewayId,
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.logRetention,
      };
    }

    if (createAssociation) {
      if (!associationLogicalId || !associationProps) {
        throw new Error(
          `[network-associations-stack] Create DX Gateway associations: unable to process properties for association between DX Gateway ${dxgwItem.name} and transit gateway ${tgw.name}`,
        );
      }
      const association = new DirectConnectGatewayAssociation(this, associationLogicalId, associationProps);
      // Add attachment ID to map if exists
      if (association.transitGatewayAttachmentId) {
        this.transitGatewayAttachments.set(`${dxgwItem.name}_${tgw.name}`, association.transitGatewayAttachmentId);
      }
    }
  }

  /**
   * Create transit gateway route table associations for DX Gateway attachments
   * @param dxgwItem
   * @param tgw
   * @param tgwRouteTableName
   * @param tgwAccountId
   */
  private createDxTgwRouteTableAssociations(
    dxgwItem: DxGatewayConfig,
    tgw: TransitGatewayConfig,
    tgwRouteTableName: string,
    tgwAccountId: string,
  ): void {
    if (tgwAccountId === cdk.Stack.of(this).account && tgw.region === cdk.Stack.of(this).region) {
      const transitGatewayAttachmentId = this.transitGatewayAttachments.get(`${dxgwItem.name}_${tgw.name}`);
      const transitGatewayRouteTableId = this.transitGatewayRouteTables.get(`${tgw.name}_${tgwRouteTableName}`);

      if (!transitGatewayAttachmentId) {
        throw new Error(
          `[network-associations-stack] Create DX TGW route table associations: unable to locate attachment ${dxgwItem.name}_${tgw.name}`,
        );
      }
      if (!transitGatewayRouteTableId) {
        throw new Error(
          `[network-associations-stack] Create DX TGW route table associations: unable to locate route table ${tgw.name}_${tgwRouteTableName}`,
        );
      }

      // Create association
      Logger.info(
        `[network-associations-stack] Creating TGW route table association to ${tgwRouteTableName} for DX Gateway ${dxgwItem.name}`,
      );
      new TransitGatewayRouteTableAssociation(this, pascalCase(`${dxgwItem.name}${tgwRouteTableName}Association`), {
        transitGatewayAttachmentId,
        transitGatewayRouteTableId,
      });
    }
  }

  /**
   * Create transit gateway route table propagations for DX Gateway attachments
   * @param dxgwItem
   * @param tgw
   * @param tgwRouteTableName
   * @param tgwAccountId
   */
  private createDxTgwRouteTablePropagations(
    dxgwItem: DxGatewayConfig,
    tgw: TransitGatewayConfig,
    tgwRouteTableName: string,
    tgwAccountId: string,
  ): void {
    if (tgwAccountId === cdk.Stack.of(this).account && tgw.region === cdk.Stack.of(this).region) {
      const transitGatewayAttachmentId = this.transitGatewayAttachments.get(`${dxgwItem.name}_${tgw.name}`);
      const transitGatewayRouteTableId = this.transitGatewayRouteTables.get(`${tgw.name}_${tgwRouteTableName}`);

      if (!transitGatewayAttachmentId) {
        throw new Error(
          `[network-associations-stack] Create DX TGW route table associations: unable to locate attachment ${dxgwItem.name}_${tgw.name}`,
        );
      }
      if (!transitGatewayRouteTableId) {
        throw new Error(
          `[network-associations-stack] Create DX TGW route table associations: unable to locate route table ${tgw.name}_${tgwRouteTableName}`,
        );
      }

      // Create association
      Logger.info(
        `[network-associations-stack] Creating TGW route table propagation for DX Gateway ${dxgwItem.name} to route table ${tgwRouteTableName}`,
      );
      new TransitGatewayRouteTablePropagation(this, pascalCase(`${dxgwItem.name}${tgwRouteTableName}Propagation`), {
        transitGatewayAttachmentId,
        transitGatewayRouteTableId,
      });
    }
  }

  /**
   * Create transit gateway static routes, blackhole routes,
   * and prefix list references for VPC and DX Gateway attachments
   * @param props
   */
  private createTransitGatewayStaticRoutes(props: AcceleratorStackProps) {
    for (const tgwItem of props.networkConfig.transitGateways ?? []) {
      const accountId = this.accountsConfig.getAccountId(tgwItem.account);
      if (accountId === cdk.Stack.of(this).account && tgwItem.region === cdk.Stack.of(this).region) {
        for (const routeTableItem of tgwItem.routeTables ?? []) {
          // Get TGW route table ID
          const routeTableKey = `${tgwItem.name}_${routeTableItem.name}`;
          const transitGatewayRouteTableId = this.transitGatewayRouteTables.get(routeTableKey);

          if (!transitGatewayRouteTableId) {
            throw new Error(`[network-associations-stack] Transit Gateway route table ${routeTableKey} not found`);
          }

          for (const routeItem of routeTableItem.routes ?? []) {
            this.createTransitGatewayStaticRouteItem(tgwItem, routeTableItem, routeItem, transitGatewayRouteTableId);
          }
        }
      }
    }
  }

  /**
   * Create transit gateway static routes, blackhole routes, and prefix list references
   * @param tgwItem
   * @param routeTableItem
   * @param routeItem
   * @param transitGatewayRouteTableId
   */
  private createTransitGatewayStaticRouteItem(
    tgwItem: TransitGatewayConfig,
    routeTableItem: TransitGatewayRouteTableConfig,
    routeItem: TransitGatewayRouteEntryConfig,
    transitGatewayRouteTableId: string,
  ): void {
    // Throw exception when a blackhole route and a VPC attachment is presented.
    if (routeItem.blackhole && routeItem.attachment) {
      throw new Error(
        `[network-associations-stack] Transit gateway route specifies both blackhole and attachment target. Please choose only one.`,
      );
    }

    if (routeItem.destinationCidrBlock && routeItem.destinationPrefixList) {
      throw new Error(
        `[network-associations-stack] Transit gateway route using destination and destinationPrefixList. Please choose only one destination type`,
      );
    }

    //
    // Create static routes
    //
    if (routeItem.destinationCidrBlock) {
      let routeId = '';
      let transitGatewayAttachmentId: string | undefined = undefined;
      if (routeItem.blackhole) {
        Logger.info(
          `[network-associations-stack] Adding blackhole route ${routeItem.destinationCidrBlock} to TGW route table ${routeTableItem.name} for TGW ${tgwItem.name} in account: ${tgwItem.account}`,
        );
        routeId = `${routeTableItem.name}-${routeItem.destinationCidrBlock}-blackhole`;
      }

      if (routeItem.attachment && NetworkConfigTypes.transitGatewayRouteTableVpcEntryConfig.is(routeItem.attachment)) {
        Logger.info(
          `[network-associations-stack] Adding route ${routeItem.destinationCidrBlock} to TGW route table ${routeTableItem.name} for TGW ${tgwItem.name} in account: ${tgwItem.account}`,
        );
        routeId = `${routeTableItem.name}-${routeItem.destinationCidrBlock}-${routeItem.attachment.vpcName}-${routeItem.attachment.account}`;

        // Get TGW attachment ID
        transitGatewayAttachmentId = this.transitGatewayAttachments.get(
          `${routeItem.attachment.account}_${routeItem.attachment.vpcName}`,
        );
      }

      if (
        routeItem.attachment &&
        NetworkConfigTypes.transitGatewayRouteTableDxGatewayEntryConfig.is(routeItem.attachment)
      ) {
        Logger.info(
          `[network-associations-stack] Adding route ${routeItem.destinationCidrBlock} to TGW route table ${routeTableItem.name} for TGW ${tgwItem.name} in account: ${tgwItem.account}`,
        );
        routeId = `${routeTableItem.name}-${routeItem.destinationCidrBlock}-${routeItem.attachment.directConnectGatewayName}`;

        // Get TGW attachment ID
        transitGatewayAttachmentId = this.transitGatewayAttachments.get(
          `${routeItem.attachment.directConnectGatewayName}_${tgwItem.name}`,
        );
      }

      if (routeItem.attachment && !transitGatewayAttachmentId) {
        throw new Error(
          `[network-associations-stack] Unable to locate transit gateway attachment ID for route table item ${routeTableItem.name}`,
        );
      }

      // Create static route
      new TransitGatewayStaticRoute(this, routeId, {
        transitGatewayRouteTableId,
        blackhole: routeItem.blackhole,
        destinationCidrBlock: routeItem.destinationCidrBlock,
        transitGatewayAttachmentId,
      });
    }

    //
    // Create prefix list references
    //
    if (routeItem.destinationPrefixList) {
      // Get PL ID from map
      const prefixListId = this.prefixListMap.get(routeItem.destinationPrefixList);
      if (!prefixListId) {
        throw new Error(`[network-associations-stack] Prefix list ${routeItem.destinationPrefixList} not found`);
      }

      let plRouteId = '';
      let transitGatewayAttachmentId: string | undefined = undefined;
      if (routeItem.blackhole) {
        Logger.info(
          `[network-associations-stack] Adding blackhole prefix list reference ${routeItem.destinationPrefixList} to TGW route table ${routeTableItem.name} for TGW ${tgwItem.name} in account: ${tgwItem.account}`,
        );
        plRouteId = pascalCase(`${routeTableItem.name}${routeItem.destinationPrefixList}Blackhole`);
      }
      if (routeItem.attachment && NetworkConfigTypes.transitGatewayRouteTableVpcEntryConfig.is(routeItem.attachment)) {
        Logger.info(
          `[network-associations-stack] Adding prefix list reference ${routeItem.destinationPrefixList} to TGW route table ${routeTableItem.name} for TGW ${tgwItem.name} in account: ${tgwItem.account}`,
        );
        plRouteId = pascalCase(
          `${routeTableItem.name}${routeItem.destinationPrefixList}${routeItem.attachment.vpcName}${routeItem.attachment.account}`,
        );

        // Get TGW attachment ID
        transitGatewayAttachmentId = this.transitGatewayAttachments.get(
          `${routeItem.attachment.account}_${routeItem.attachment.vpcName}`,
        );
      }

      if (
        routeItem.attachment &&
        NetworkConfigTypes.transitGatewayRouteTableDxGatewayEntryConfig.is(routeItem.attachment)
      ) {
        Logger.info(
          `[network-associations-stack] Adding prefix list reference ${routeItem.destinationPrefixList} to TGW route table ${routeTableItem.name} for TGW ${tgwItem.name} in account: ${tgwItem.account}`,
        );
        plRouteId = pascalCase(
          `${routeTableItem.name}${routeItem.destinationPrefixList}${routeItem.attachment.directConnectGatewayName}`,
        );

        // Get TGW attachment ID
        transitGatewayAttachmentId = this.transitGatewayAttachments.get(
          `${routeItem.attachment.directConnectGatewayName}_${tgwItem.name}`,
        );
      }

      if (routeItem.attachment && !transitGatewayAttachmentId) {
        throw new Error(
          `[network-associations-stack] Unable to locate transit gateway attachment ID for route table item ${routeTableItem.name}`,
        );
      }

      // Create prefix list reference
      new TransitGatewayPrefixListReference(this, plRouteId, {
        prefixListId,
        blackhole: routeItem.blackhole,
        transitGatewayAttachmentId,
        transitGatewayRouteTableId,
        logGroupKmsKey: this.cloudwatchKey,
        logRetentionInDays: this.logRetention,
      });
    }
  }

  /**
   * Check if resource is shared with stack.
   *
   * @param shareTargets
   */
  private checkResourceShare(shareTargets: ShareTargets): boolean {
    let included = false;
    included = this.isOrganizationalUnitIncluded(shareTargets.organizationalUnits);

    if (included) {
      return included;
    }

    included = this.isAccountIncluded(shareTargets.accounts);

    return included;
  }

  private shareSubnetTags() {
    for (const vpc of this.props.networkConfig.vpcs) {
      const owningAccountId = this.accountsConfig.getAccountId(vpc.account);
      if (owningAccountId !== cdk.Stack.of(this).account && vpc.region === cdk.Stack.of(this).region) {
        for (const subnet of vpc.subnets ?? []) {
          //only get the shared subnets that have tags configured
          if (subnet.shareTargets && subnet.tags) {
            const shared = this.checkResourceShare(subnet.shareTargets);
            if (shared) {
              const sharedSubnet = this.getResourceShare(
                `${subnet.name}_SubnetShare`,
                'ec2:Subnet',
                owningAccountId,
                this.cloudwatchKey,
                vpc.name,
              );
              const vpcTags = vpc.tags;
              const subnetTags = subnet.tags;
              const sharedSubnetId = sharedSubnet.resourceShareItemId;
              Logger.info('[network-associations-stack] Applying subnet and vpc tags for RAM shared resources');
              new ShareSubnetTags(this, `ShareSubnetTags${vpc.account}-${subnet.name}`, {
                vpcTags,
                subnetTags,
                sharedSubnetId,
                owningAccountId,
                resourceLoggingKmsKey: this.cloudwatchKey,
                logRetentionInDays: this.logRetention,
              });
            }
          }
        }
      }
    }
  }
}
