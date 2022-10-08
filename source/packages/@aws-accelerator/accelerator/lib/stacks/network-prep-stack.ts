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
import { NagSuppressions } from 'cdk-nag';
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';
import * as path from 'path';

import {
  AccountsConfig,
  DnsFirewallRuleGroupConfig,
  DnsQueryLogsConfig,
  DxGatewayConfig,
  IpamConfig,
  NfwFirewallPolicyConfig,
  NfwRuleGroupConfig,
  TransitGatewayConfig,
} from '@aws-accelerator/config';
import {
  DirectConnectGateway,
  FirewallPolicyProperty,
  Ipam,
  IpamPool,
  IpamScope,
  NetworkFirewallPolicy,
  NetworkFirewallRuleGroup,
  Organization,
  QueryLoggingConfig,
  ResolverFirewallDomainList,
  ResolverFirewallDomainListType,
  ResolverFirewallRuleGroup,
  TransitGateway,
  TransitGatewayRouteTable,
  VirtualInterface,
  VirtualInterfaceProps,
} from '@aws-accelerator/constructs';

import { Logger } from '../logger';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';

interface ResolverFirewallRuleProps {
  action: string;
  firewallDomainListId: string;
  priority: number;
  blockOverrideDnsType?: string;
  blockOverrideDomain?: string;
  blockOverrideTtl?: number;
  blockResponse?: string;
}

export class NetworkPrepStack extends AcceleratorStack {
  private accountsConfig: AccountsConfig;
  private domainMap: Map<string, string>;
  private dxGatewayMap: Map<string, string>;
  private nfwRuleMap: Map<string, string>;
  private cloudwatchKey: cdk.aws_kms.Key;
  private logRetention: number;

  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    // Set private properties
    this.accountsConfig = props.accountsConfig;
    this.domainMap = new Map<string, string>();
    this.dxGatewayMap = new Map<string, string>();
    this.nfwRuleMap = new Map<string, string>();
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
    // Generate Transit Gateways
    //
    this.createTransitGateways(props);

    //
    // Create Direct Connect Gateways and virtual interfaces
    //
    this.createDirectConnectResources(props);

    //
    // Central network services
    //
    this.createCentralNetworkResources(props);

    Logger.info('[network-prep-stack] Completed stack synthesis');
  }

  /**
   * Create transit gateways
   * @param props
   */
  private createTransitGateways(props: AcceleratorStackProps) {
    for (const tgwItem of props.networkConfig.transitGateways ?? []) {
      this.createTransitGatewayItem(tgwItem);
    }
  }

  /**
   * Create transit gateway
   * @param tgwItem
   */
  private createTransitGatewayItem(tgwItem: TransitGatewayConfig): void {
    const accountId = this.accountsConfig.getAccountId(tgwItem.account);
    if (accountId === cdk.Stack.of(this).account && tgwItem.region == cdk.Stack.of(this).region) {
      Logger.info(`[network-prep-stack] Add Transit Gateway ${tgwItem.name}`);

      const tgw = new TransitGateway(this, pascalCase(`${tgwItem.name}TransitGateway`), {
        name: tgwItem.name,
        amazonSideAsn: tgwItem.asn,
        autoAcceptSharedAttachments: tgwItem.autoAcceptSharingAttachments,
        defaultRouteTableAssociation: tgwItem.defaultRouteTableAssociation,
        defaultRouteTablePropagation: tgwItem.defaultRouteTablePropagation,
        dnsSupport: tgwItem.dnsSupport,
        vpnEcmpSupport: tgwItem.vpnEcmpSupport,
        tags: tgwItem.tags,
      });

      new ssm.StringParameter(this, pascalCase(`SsmParam${tgwItem.name}TransitGatewayId`), {
        parameterName: `/accelerator/network/transitGateways/${tgwItem.name}/id`,
        stringValue: tgw.transitGatewayId,
      });

      for (const routeTableItem of tgwItem.routeTables ?? []) {
        Logger.info(`[network-prep-stack] Add Transit Gateway Route Tables ${routeTableItem.name}`);

        const routeTable = new TransitGatewayRouteTable(
          this,
          pascalCase(`${routeTableItem.name}TransitGatewayRouteTable`),
          {
            transitGatewayId: tgw.transitGatewayId,
            name: routeTableItem.name,
            tags: routeTableItem.tags,
          },
        );

        new ssm.StringParameter(
          this,
          pascalCase(`SsmParam${tgwItem.name}${routeTableItem.name}TransitGatewayRouteTableId`),
          {
            parameterName: `/accelerator/network/transitGateways/${tgwItem.name}/routeTables/${routeTableItem.name}/id`,
            stringValue: routeTable.id,
          },
        );
      }

      if (tgwItem.shareTargets) {
        Logger.info(`[network-prep-stack] Share transit gateway`);
        this.addResourceShare(tgwItem, `${tgwItem.name}_TransitGatewayShare`, [tgw.transitGatewayArn]);
      }
    }
  }

  /**
   * Create Direct Connect resources
   * @param props
   */
  private createDirectConnectResources(props: AcceleratorStackProps) {
    for (const dxgwItem of props.networkConfig.directConnectGateways ?? []) {
      this.createDirectConnectGatewayItem(dxgwItem);
      this.validateVirtualInterfaceProps(dxgwItem);
      this.createDxGatewaySsmRole(dxgwItem);
    }
  }

  /**
   * Create Direct Connect Gateway
   * @param dxgwItem
   */
  private createDirectConnectGatewayItem(dxgwItem: DxGatewayConfig): void {
    const accountId = this.accountsConfig.getAccountId(dxgwItem.account);

    // DXGW is a global object -- only create in home region
    if (accountId === cdk.Stack.of(this).account && this.props.globalConfig.homeRegion === cdk.Stack.of(this).region) {
      Logger.info(`[network-prep-stack] Creating Direct Connect Gateway ${dxgwItem.name}`);
      const dxGateway = new DirectConnectGateway(this, pascalCase(`${dxgwItem.name}DxGateway`), {
        gatewayName: dxgwItem.gatewayName,
        asn: dxgwItem.asn,
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.logRetention,
      });
      new cdk.aws_ssm.StringParameter(this, pascalCase(`SsmParam${dxgwItem.name}DirectConnectGateway`), {
        parameterName: `/accelerator/network/directConnectGateways/${dxgwItem.name}/id`,
        stringValue: dxGateway.directConnectGatewayId,
      });
      this.dxGatewayMap.set(dxgwItem.name, dxGateway.directConnectGatewayId);
    }
  }

  /**
   * Validate Direct Connect virtual interface properties
   * and create interfaces
   * @param dxgwItem
   */
  private validateVirtualInterfaceProps(dxgwItem: DxGatewayConfig): void {
    for (const vifItem of dxgwItem.virtualInterfaces ?? []) {
      const connectionOwnerAccountId = this.accountsConfig.getAccountId(vifItem.ownerAccount);
      let createVif = false;
      let vifLogicalId: string | undefined = undefined;
      let vifProps: VirtualInterfaceProps | undefined = undefined;

      // If DXGW and connection owner account do not match, create a VIF allocation
      if (
        dxgwItem.account !== vifItem.ownerAccount &&
        connectionOwnerAccountId === cdk.Stack.of(this).account &&
        this.props.globalConfig.homeRegion === cdk.Stack.of(this).region
      ) {
        Logger.info(
          `[network-prep-stack] Creating virtual interface allocation ${vifItem.name} to Direct Connect Gateway ${dxgwItem.name}`,
        );
        createVif = true;
        vifLogicalId = pascalCase(`${dxgwItem.name}${vifItem.name}VirtualInterfaceAllocation`);
        const vifOwnerAccountId = this.accountsConfig.getAccountId(dxgwItem.account);
        vifProps = {
          connectionId: vifItem.connectionId,
          customerAsn: vifItem.customerAsn,
          interfaceName: vifItem.interfaceName,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: this.logRetention,
          type: vifItem.type,
          region: vifItem.region,
          vlan: vifItem.vlan,
          addressFamily: vifItem.addressFamily,
          amazonAddress: vifItem.amazonAddress,
          customerAddress: vifItem.customerAddress,
          enableSiteLink: vifItem.enableSiteLink,
          jumboFrames: vifItem.jumboFrames,
          ownerAccount: vifOwnerAccountId,
          tags: vifItem.tags,
        };
      }

      // If DXGW and connection owner account do match, create a VIF
      if (
        dxgwItem.account === vifItem.ownerAccount &&
        connectionOwnerAccountId === cdk.Stack.of(this).account &&
        this.props.globalConfig.homeRegion === cdk.Stack.of(this).region
      ) {
        Logger.info(
          `[network-prep-stack] Creating virtual interface ${vifItem.name} to Direct Connect Gateway ${dxgwItem.name}`,
        );
        createVif = true;
        const directConnectGatewayId = this.dxGatewayMap.get(dxgwItem.name);
        if (!directConnectGatewayId) {
          throw new Error(`Unable to locate Direct Connect Gateway ${dxgwItem.name}`);
        }
        vifLogicalId = pascalCase(`${dxgwItem.name}${vifItem.name}VirtualInterface`);
        vifProps = {
          connectionId: vifItem.connectionId,
          customerAsn: vifItem.customerAsn,
          interfaceName: vifItem.interfaceName,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: this.logRetention,
          type: vifItem.type,
          region: vifItem.region,
          vlan: vifItem.vlan,
          addressFamily: vifItem.addressFamily,
          amazonAddress: vifItem.amazonAddress,
          customerAddress: vifItem.customerAddress,
          directConnectGatewayId,
          enableSiteLink: vifItem.enableSiteLink,
          jumboFrames: vifItem.jumboFrames,
          tags: vifItem.tags,
        };
      }

      // Create the VIF or VIF allocation
      if (createVif) {
        this.createVirtualInterface(dxgwItem.name, vifItem.name, vifLogicalId, vifProps);
      }
    }
  }

  /**
   * Create Direct connect virtual interface
   * @param dxgwName
   * @param vifName
   * @param vifLogicalId
   * @param vifProps
   */
  private createVirtualInterface(
    dxgwName: string,
    vifName: string,
    vifLogicalId?: string,
    vifProps?: VirtualInterfaceProps,
  ): void {
    if (!vifLogicalId || !vifProps) {
      throw new Error(`Create virtual interfaces: unable to process properties for virtual interface ${vifName}`);
    }
    const virtualInterface = new VirtualInterface(this, vifLogicalId, vifProps);
    new cdk.aws_ssm.StringParameter(this, pascalCase(`SsmParam${dxgwName}${vifName}VirtualInterface`), {
      parameterName: `/accelerator/network/directConnectGateways/${dxgwName}/virtualInterfaces/${vifName}/id`,
      stringValue: virtualInterface.virtualInterfaceId,
    });
  }

  private createDxGatewaySsmRole(dxgwItem: DxGatewayConfig): void {
    const accountIds: string[] = [];
    // DX Gateways are global resources; only create role in home region
    if (this.props.globalConfig.homeRegion === cdk.Stack.of(this).region) {
      for (const associationItem of dxgwItem.transitGatewayAssociations ?? []) {
        const tgw = this.props.networkConfig.transitGateways.find(
          item => item.name === associationItem.name && item.account === associationItem.account,
        );
        if (!tgw) {
          throw new Error(`[network-associations-stack] Unable to locate transit gateway ${associationItem.name}`);
        }
        const tgwAccountId = this.accountsConfig.getAccountId(tgw.account);

        // Add to accountIds if accounts do not match
        if (dxgwItem.account !== tgw.account && !accountIds.includes(tgwAccountId)) {
          accountIds.push(tgwAccountId);
        }
        // Add to accountIds if regions don't match
        if (tgw.region !== cdk.Stack.of(this).region && !accountIds.includes(tgwAccountId)) {
          accountIds.push(tgwAccountId);
        }
      }

      if (accountIds.length > 0) {
        Logger.info(`[network-prep-stack] Direct Connect Gateway: Create IAM cross-account access role`);

        const principals: cdk.aws_iam.PrincipalBase[] = [];
        accountIds.forEach(accountId => {
          principals.push(new cdk.aws_iam.AccountPrincipal(accountId));
        });
        const role = new cdk.aws_iam.Role(this, `Get${pascalCase(dxgwItem.name)}SsmParamRole`, {
          roleName: `AWSAccelerator-Get${pascalCase(dxgwItem.name)}SsmParamRole-${cdk.Stack.of(this).region}`,
          assumedBy: new cdk.aws_iam.CompositePrincipal(...principals),
          inlinePolicies: {
            default: new cdk.aws_iam.PolicyDocument({
              statements: [
                new cdk.aws_iam.PolicyStatement({
                  effect: cdk.aws_iam.Effect.ALLOW,
                  actions: ['ssm:GetParameter'],
                  resources: [
                    `arn:${cdk.Aws.PARTITION}:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter/accelerator/network/directConnectGateways/${dxgwItem.name}/*`,
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
    }
  }

  /**
   * Create central network resources
   */
  private createCentralNetworkResources(props: AcceleratorStackProps) {
    if (props.networkConfig.centralNetworkServices) {
      const centralConfig = props.networkConfig.centralNetworkServices;
      const delegatedAdminAccountId = this.accountsConfig.getAccountId(centralConfig.delegatedAdminAccount);

      //
      // Generate IPAMs
      //
      for (const ipamItem of centralConfig.ipams ?? []) {
        this.createIpam(delegatedAdminAccountId, ipamItem);
      }

      //
      // DNS firewall
      //
      for (const firewallItem of centralConfig.route53Resolver?.firewallRuleGroups ?? []) {
        this.createDnsFirewallRuleGroup(delegatedAdminAccountId, firewallItem);
      }

      //
      // Route53 Resolver query log configuration
      //
      if (centralConfig.route53Resolver?.queryLogs) {
        // Create query log configurations only in the delegated admin account
        if (delegatedAdminAccountId === cdk.Stack.of(this).account) {
          this.createResolverQueryLogs(centralConfig.route53Resolver.queryLogs);
        }
      }

      //
      // Network Firewall rule groups
      //
      for (const ruleItem of centralConfig.networkFirewall?.rules ?? []) {
        this.createNfwRuleGroup(delegatedAdminAccountId, ruleItem);
      }

      //
      // Network Firewall policies
      //
      for (const policyItem of centralConfig.networkFirewall?.policies ?? []) {
        this.createNfwPolicy(delegatedAdminAccountId, policyItem);
      }
    }
  }

  /**
   * Create IPAM
   * @param accountId
   * @param ipamItem
   */
  private createIpam(accountId: string, ipamItem: IpamConfig): void {
    const poolMap = new Map<string, IpamPool>();
    const scopeMap = new Map<string, IpamScope>();

    if (accountId === cdk.Stack.of(this).account && ipamItem.region === cdk.Stack.of(this).region) {
      Logger.info(`[network-prep-stack] Add IPAM ${ipamItem.name}`);

      // Create IPAM
      const ipam = new Ipam(this, pascalCase(`${ipamItem.name}Ipam`), {
        name: ipamItem.name,
        description: ipamItem.description,
        operatingRegions: ipamItem.operatingRegions,
        tags: ipamItem.tags,
      });
      new ssm.StringParameter(this, pascalCase(`SsmParam${ipamItem.name}IpamId`), {
        parameterName: `/accelerator/network/ipam/${ipamItem.name}/id`,
        stringValue: ipam.ipamId,
      });

      // Create scopes
      for (const scopeItem of ipamItem.scopes ?? []) {
        Logger.info(`[network-prep-stack] Add IPAM scope ${scopeItem.name}`);
        const ipamScope = new IpamScope(this, pascalCase(`${scopeItem.name}Scope`), {
          ipamId: ipam.ipamId,
          name: scopeItem.name,
          description: scopeItem.description,
          tags: scopeItem.tags ?? [],
        });
        scopeMap.set(scopeItem.name, ipamScope);
        new ssm.StringParameter(this, pascalCase(`SsmParam${scopeItem.name}ScopeId`), {
          parameterName: `/accelerator/network/ipam/scopes/${scopeItem.name}/id`,
          stringValue: ipamScope.ipamScopeId,
        });
      }

      // Create pools
      if (ipamItem.pools) {
        // Create base pools
        const basePools = ipamItem.pools.filter(item => {
          return !item.sourceIpamPool;
        });
        for (const poolItem of basePools ?? []) {
          Logger.info(`[network-prep-stack] Add IPAM top-level pool ${poolItem.name}`);
          let poolScope: string | undefined;

          if (poolItem.scope) {
            poolScope = scopeMap.get(poolItem.scope)?.ipamScopeId;

            if (!poolScope) {
              throw new Error(
                `[network-prep-stack] Unable to locate IPAM scope ${poolItem.scope} for pool ${poolItem.name}`,
              );
            }
          }

          const pool = new IpamPool(this, pascalCase(`${poolItem.name}Pool`), {
            addressFamily: poolItem.addressFamily ?? 'ipv4',
            ipamScopeId: poolScope ?? ipam.privateDefaultScopeId,
            name: poolItem.name,
            allocationDefaultNetmaskLength: poolItem.allocationDefaultNetmaskLength,
            allocationMaxNetmaskLength: poolItem.allocationMaxNetmaskLength,
            allocationMinNetmaskLength: poolItem.allocationMinNetmaskLength,
            allocationResourceTags: poolItem.allocationResourceTags,
            autoImport: poolItem.autoImport,
            description: poolItem.description,
            locale: poolItem.locale,
            provisionedCidrs: poolItem.provisionedCidrs,
            publiclyAdvertisable: poolItem.publiclyAdvertisable,
            tags: poolItem.tags,
          });
          poolMap.set(poolItem.name, pool);
          new ssm.StringParameter(this, pascalCase(`SsmParam${poolItem.name}PoolId`), {
            parameterName: `/accelerator/network/ipam/pools/${poolItem.name}/id`,
            stringValue: pool.ipamPoolId,
          });

          // Add resource shares
          if (poolItem.shareTargets) {
            Logger.info(`[network-prep-stack] Share IPAM pool ${poolItem.name}`);
            this.addResourceShare(poolItem, `${poolItem.name}_IpamPoolShare`, [pool.ipamPoolArn]);
          }
        }

        // Create nested pools
        const nestedPools = ipamItem.pools.filter(item => {
          return item.sourceIpamPool;
        });

        // Use while loop for iteration
        while (poolMap.size < ipamItem.pools.length) {
          for (const poolItem of nestedPools) {
            // Check if source pool name has been created or exists in the config array
            const sourcePool = poolMap.get(poolItem.sourceIpamPool!)?.ipamPoolId;
            if (!sourcePool) {
              // Check for case where the source pool hasn't been created yet
              const sourcePoolExists = nestedPools.find(item => item.name === poolItem.sourceIpamPool);
              if (!sourcePoolExists) {
                throw new Error(
                  `[network-prep-stack] Unable to locate source IPAM pool ${poolItem.sourceIpamPool} for pool ${poolItem.name}`,
                );
              }
              // Skip iteration if source pool exists but has not yet been created
              continue;
            }

            // Check if this item has already been created
            const poolExists = poolMap.get(poolItem.name);

            if (sourcePool && !poolExists) {
              Logger.info(`[network-prep-stack] Add IPAM nested pool ${poolItem.name}`);
              let poolScope: string | undefined;

              if (poolItem.scope) {
                poolScope = scopeMap.get(poolItem.scope)?.ipamScopeId;

                if (!poolScope) {
                  throw new Error(
                    `[network-prep-stack] Unable to locate IPAM scope ${poolItem.scope} for pool ${poolItem.name}`,
                  );
                }
              }

              const pool = new IpamPool(this, pascalCase(`${poolItem.name}Pool`), {
                addressFamily: poolItem.addressFamily ?? 'ipv4',
                ipamScopeId: poolScope ?? ipam.privateDefaultScopeId,
                name: poolItem.name,
                allocationDefaultNetmaskLength: poolItem.allocationDefaultNetmaskLength,
                allocationMaxNetmaskLength: poolItem.allocationMaxNetmaskLength,
                allocationMinNetmaskLength: poolItem.allocationMinNetmaskLength,
                allocationResourceTags: poolItem.allocationResourceTags,
                autoImport: poolItem.autoImport,
                description: poolItem.description,
                locale: poolItem.locale,
                provisionedCidrs: poolItem.provisionedCidrs,
                publiclyAdvertisable: poolItem.publiclyAdvertisable,
                sourceIpamPoolId: sourcePool,
                tags: poolItem.tags,
              });
              // Record item in pool map
              poolMap.set(poolItem.name, pool);
              new ssm.StringParameter(this, pascalCase(`SsmParam${poolItem.name}PoolId`), {
                parameterName: `/accelerator/network/ipam/pools/${poolItem.name}/id`,
                stringValue: pool.ipamPoolId,
              });

              // Add resource shares
              if (poolItem.shareTargets) {
                Logger.info(`[network-prep-stack] Share IPAM pool ${poolItem.name}`);
                this.addResourceShare(poolItem, `${poolItem.name}_IpamPoolShare`, [pool.ipamPoolArn]);
              }
            }
          }
        }
      }
    }
  }

  /**
   * Create DNS firewall rule groups
   * @param accountId
   * @param firewallItem
   */
  private createDnsFirewallRuleGroup(accountId: string, firewallItem: DnsFirewallRuleGroupConfig): void {
    const regions = firewallItem.regions.map(item => {
      return item.toString();
    });

    // Create regional rule groups in the delegated admin account
    if (accountId === cdk.Stack.of(this).account && regions.includes(cdk.Stack.of(this).region)) {
      for (const ruleItem of firewallItem.rules) {
        let domainListType: ResolverFirewallDomainListType;
        let filePath: string | undefined = undefined;
        let listName: string;
        // Check to ensure both types aren't defined
        if (ruleItem.customDomainList && ruleItem.managedDomainList) {
          throw new Error(
            `[network-prep-stack] Only one of customDomainList or managedDomainList may be defined for ${ruleItem.name}`,
          );
        } else if (ruleItem.customDomainList) {
          domainListType = ResolverFirewallDomainListType.CUSTOM;
          filePath = path.join(this.props.configDirPath, ruleItem.customDomainList);
          try {
            listName = ruleItem.customDomainList.split('/')[1].split('.')[0];
            if (!this.domainMap.has(listName)) {
              Logger.info(`[network-prep-stack] Creating DNS firewall custom domain list ${listName}`);
            }
          } catch (e) {
            throw new Error(`[network-prep-stack] Error creating DNS firewall domain list: ${e}`);
          }
        } else if (ruleItem.managedDomainList) {
          domainListType = ResolverFirewallDomainListType.MANAGED;
          listName = ruleItem.managedDomainList;
          if (!this.domainMap.has(listName)) {
            Logger.info(`[network-prep-stack] Looking up DNS firewall managed domain list ${listName}`);
          }
        } else {
          throw new Error(
            `[network-prep-stack] One of customDomainList or managedDomainList must be defined for ${ruleItem.name}`,
          );
        }

        // Create or look up domain list
        if (!this.domainMap.has(listName)) {
          const domainList = new ResolverFirewallDomainList(this, pascalCase(`${listName}DomainList`), {
            name: listName,
            path: filePath,
            tags: [],
            type: domainListType,
            kmsKey: this.cloudwatchKey,
            logRetentionInDays: this.logRetention,
          });
          this.domainMap.set(listName, domainList.listId);
        }
      }

      // Build new rule list with domain list ID
      const ruleList: ResolverFirewallRuleProps[] = [];
      let domainListName: string;
      for (const ruleItem of firewallItem.rules) {
        // Check the type of domain list
        if (ruleItem.customDomainList) {
          try {
            domainListName = ruleItem.customDomainList.split('/')[1].split('.')[0];
          } catch (e) {
            throw new Error(`[network-prep-stack] Error parsing list name from ${ruleItem.customDomainList}`);
          }
        } else {
          domainListName = ruleItem.managedDomainList!;
        }

        // Create the DNS firewall rule list

        if (this.domainMap.get(domainListName)) {
          if (ruleItem.action === 'BLOCK' && ruleItem.blockResponse === 'OVERRIDE') {
            ruleList.push({
              action: ruleItem.action.toString(),
              firewallDomainListId: this.domainMap.get(domainListName)!,
              priority: ruleItem.priority,
              blockOverrideDnsType: 'CNAME',
              blockOverrideDomain: ruleItem.blockOverrideDomain,
              blockOverrideTtl: ruleItem.blockOverrideTtl,
              blockResponse: ruleItem.blockResponse,
            });
          } else {
            ruleList.push({
              action: ruleItem.action.toString(),
              firewallDomainListId: this.domainMap.get(domainListName)!,
              priority: ruleItem.priority,
              blockResponse: ruleItem.blockResponse,
            });
          }
        } else {
          throw new Error(`Domain list ${domainListName} not found in domain map`);
        }
      }

      Logger.info(`[network-prep-stack] Creating DNS firewall rule group ${firewallItem.name}`);
      const ruleGroup = new ResolverFirewallRuleGroup(this, pascalCase(`${firewallItem.name}RuleGroup`), {
        firewallRules: ruleList,
        name: firewallItem.name,
        tags: firewallItem.tags ?? [],
      });
      new ssm.StringParameter(this, pascalCase(`SsmParam${firewallItem.name}RuleGroup`), {
        parameterName: `/accelerator/network/route53Resolver/firewall/ruleGroups/${firewallItem.name}/id`,
        stringValue: ruleGroup.groupId,
      });

      if (firewallItem.shareTargets) {
        Logger.info(`[network-prep-stack] Share DNS firewall rule group ${firewallItem.name}`);
        this.addResourceShare(firewallItem, `${firewallItem.name}_ResolverFirewallRuleGroupShare`, [
          ruleGroup.groupArn,
        ]);
      }
    }
  }

  /**
   * Create Route 53 Resolver query logs
   * @param logItem
   */
  private createResolverQueryLogs(logItem: DnsQueryLogsConfig): void {
    if (logItem.destinations.includes('s3')) {
      Logger.info(`[network-prep-stack] Create DNS query log ${logItem.name}-s3 for central S3 destination`);
      const centralLogsBucket = cdk.aws_s3.Bucket.fromBucketName(
        this,
        'CentralLogsBucket',
        `aws-accelerator-central-logs-${this.accountsConfig.getLogArchiveAccountId()}-${
          this.props.globalConfig.homeRegion
        }`,
      );

      const s3QueryLogConfig = new QueryLoggingConfig(this, pascalCase(`${logItem.name}S3QueryLogConfig`), {
        destination: centralLogsBucket,
        name: `${logItem.name}-s3`,
        partition: this.props.partition,
        logRetentionInDays: this.logRetention,
        kmsKey: this.cloudwatchKey,
      });
      new ssm.StringParameter(this, pascalCase(`SsmParam${logItem.name}S3QueryLogConfig`), {
        parameterName: `/accelerator/network/route53Resolver/queryLogConfigs/${logItem.name}-s3/id`,
        stringValue: s3QueryLogConfig.logId,
      });

      if (logItem.shareTargets) {
        Logger.info(`[network-prep-stack] Share DNS query log config ${logItem.name}-s3`);
        this.addResourceShare(logItem, `${logItem.name}-s3_QueryLogConfigShare`, [s3QueryLogConfig.logArn]);
      }
    }

    if (logItem.destinations.includes('cloud-watch-logs')) {
      Logger.info(
        `[network-prep-stack] Create DNS query log ${logItem.name}-cwl for central CloudWatch logs destination`,
      );
      const organization = new Organization(this, 'Organization');

      const logGroup = new cdk.aws_logs.LogGroup(this, 'QueryLogsLogGroup', {
        encryptionKey: this.cloudwatchKey,
        retention: this.logRetention,
      });

      const cwlQueryLogConfig = new QueryLoggingConfig(this, pascalCase(`${logItem.name}CwlQueryLogConfig`), {
        destination: logGroup,
        name: `${logItem.name}-cwl`,
        organizationId: organization.id,
        partition: this.props.partition,
        logRetentionInDays: this.logRetention,
        kmsKey: this.cloudwatchKey,
      });
      new ssm.StringParameter(this, pascalCase(`SsmParam${logItem.name}CwlQueryLogConfig`), {
        parameterName: `/accelerator/network/route53Resolver/queryLogConfigs/${logItem.name}-cwl/id`,
        stringValue: cwlQueryLogConfig.logId,
      });

      if (logItem.shareTargets) {
        Logger.info(`[network-prep-stack] Share DNS query log config ${logItem.name}-cwl`);
        this.addResourceShare(logItem, `${logItem.name}-cwl_QueryLogConfigShare`, [cwlQueryLogConfig.logArn]);
      }
    }
  }

  /**
   * Create AWS Network Firewall rule group
   * @param accountId
   * @param ruleItem
   */
  private createNfwRuleGroup(accountId: string, ruleItem: NfwRuleGroupConfig): void {
    const regions = ruleItem.regions.map(item => {
      return item.toString();
    });

    // Create regional rule groups in the delegated admin account
    if (accountId === cdk.Stack.of(this).account && regions.includes(cdk.Stack.of(this).region)) {
      Logger.info(`[network-prep-stack] Create network firewall rule group ${ruleItem.name}`);
      const rule = new NetworkFirewallRuleGroup(this, pascalCase(`${ruleItem.name}NetworkFirewallRuleGroup`), {
        capacity: ruleItem.capacity,
        name: ruleItem.name,
        type: ruleItem.type,
        description: ruleItem.description,
        ruleGroup: ruleItem.ruleGroup,
        tags: ruleItem.tags ?? [],
      });
      this.nfwRuleMap.set(ruleItem.name, rule.groupArn);
      new ssm.StringParameter(this, pascalCase(`SsmParam${ruleItem.name}NetworkFirewallRuleGroup`), {
        parameterName: `/accelerator/network/networkFirewall/ruleGroups/${ruleItem.name}/arn`,
        stringValue: rule.groupArn,
      });

      if (ruleItem.shareTargets) {
        Logger.info(`[network-prep-stack] Share Network Firewall rule group ${ruleItem.name}`);
        this.addResourceShare(ruleItem, `${ruleItem.name}_NetworkFirewallRuleGroupShare`, [rule.groupArn]);
      }
    }
  }

  /**
   * Create AWS Network Firewall policy
   * @param accountId
   * @param policyItem
   */
  private createNfwPolicy(accountId: string, policyItem: NfwFirewallPolicyConfig): void {
    const regions = policyItem.regions.map(item => {
      return item.toString();
    });

    // Create regional rule groups in the delegated admin account
    if (accountId === cdk.Stack.of(this).account && regions.includes(cdk.Stack.of(this).region)) {
      // Store rule group references to associate with policy
      const statefulGroups = [];
      const statelessGroups = [];

      for (const group of policyItem.firewallPolicy.statefulRuleGroups ?? []) {
        if (this.nfwRuleMap.has(group.name)) {
          statefulGroups.push({ priority: group.priority, resourceArn: this.nfwRuleMap.get(group.name)! });
        } else {
          throw new Error(`[network-prep-stack] Rule group ${group.name} not found in rule map`);
        }
      }

      for (const group of policyItem.firewallPolicy.statelessRuleGroups ?? []) {
        if (this.nfwRuleMap.has(group.name)) {
          statelessGroups.push({ priority: group.priority, resourceArn: this.nfwRuleMap.get(group.name)! });
        } else {
          throw new Error(`[network-prep-stack] Rule group ${group.name} not found in rule map`);
        }
      }

      // Create new firewall policy object with rule group references
      const firewallPolicy: FirewallPolicyProperty = {
        statelessDefaultActions: policyItem.firewallPolicy.statelessDefaultActions,
        statelessFragmentDefaultActions: policyItem.firewallPolicy.statelessFragmentDefaultActions,
        statefulDefaultActions: policyItem.firewallPolicy.statefulDefaultActions,
        statefulEngineOptions: policyItem.firewallPolicy.statefulEngineOptions,
        statefulRuleGroupReferences: statefulGroups,
        statelessCustomActions: policyItem.firewallPolicy.statelessCustomActions,
        statelessRuleGroupReferences: statelessGroups,
      };

      // Instantiate firewall policy construct
      Logger.info(`[network-prep-stack] Create network firewall policy ${policyItem.name}`);
      const policy = new NetworkFirewallPolicy(this, pascalCase(`${policyItem.name}NetworkFirewallPolicy`), {
        name: policyItem.name,
        firewallPolicy: firewallPolicy,
        description: policyItem.description,
        tags: policyItem.tags ?? [],
      });
      new ssm.StringParameter(this, pascalCase(`SsmParam${policyItem.name}NetworkFirewallPolicy`), {
        parameterName: `/accelerator/network/networkFirewall/policies/${policyItem.name}/arn`,
        stringValue: policy.policyArn,
      });

      if (policyItem.shareTargets) {
        Logger.info(`[network-prep-stack] Share Network Firewall policy ${policyItem.name}`);
        this.addResourceShare(policyItem, `${policyItem.name}_NetworkFirewallPolicyShare`, [policy.policyArn]);
      }
    }
  }
}
