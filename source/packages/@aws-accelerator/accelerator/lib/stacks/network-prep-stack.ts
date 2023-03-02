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
import * as fs from 'fs';

import {
  AccountsConfig,
  CustomerGatewayConfig,
  DnsFirewallRuleGroupConfig,
  DnsQueryLogsConfig,
  DxGatewayConfig,
  IpamConfig,
  NfwFirewallPolicyConfig,
  NfwRuleGroupConfig,
  NfwRuleGroupRuleConfig,
  TransitGatewayConfig,
  VpnConnectionConfig,
} from '@aws-accelerator/config';
import {
  CustomerGateway,
  DirectConnectGateway,
  FirewallPolicyProperty,
  FMSNotificationChannel,
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
  VpnConnection,
} from '@aws-accelerator/constructs';

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
  private transitGatewayMap: Map<string, string>;
  private cloudwatchKey: cdk.aws_kms.Key;
  private logRetention: number;
  organizationId: string | undefined;

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
    this.transitGatewayMap = this.createTransitGateways(props);

    //
    // Create Transit Gateway Peering Role
    //
    this.createTransitGatewayPeeringRole();

    //
    // Create Managed active directory accept share role
    //
    this.createManagedActiveDirectoryShareAcceptRole();

    //
    // Create Site-to-Site VPN connections
    //
    this.createVpnConnectionResources(props);

    //
    // Create Direct Connect Gateways and virtual interfaces
    //
    this.createDirectConnectResources(props);

    //
    // Central network services
    //
    this.createCentralNetworkResources(props);

    //
    // Create SSM Parameters
    //
    this.createSsmParameters();

    // FMS Notification Channel
    //
    this.createFMSNotificationChannels();
    this.logger.info('Completed stack synthesis');
  }

  /**
   * Create transit gateways
   * @param props
   */
  private createTransitGateways(props: AcceleratorStackProps): Map<string, string> {
    const transitGatewayMap = new Map<string, string>();
    for (const tgwItem of props.networkConfig.transitGateways ?? []) {
      const accountId = this.accountsConfig.getAccountId(tgwItem.account);

      if (accountId === cdk.Stack.of(this).account && tgwItem.region == cdk.Stack.of(this).region) {
        const tgw = this.createTransitGatewayItem(tgwItem);
        transitGatewayMap.set(tgwItem.name, tgw.transitGatewayId);
      }
    }
    return transitGatewayMap;
  }

  /**
   * Create transit gateway
   * @param tgwItem
   */
  private createTransitGatewayItem(tgwItem: TransitGatewayConfig): TransitGateway {
    this.logger.info(`Add Transit Gateway ${tgwItem.name}`);

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
      this.logger.info(`Add Transit Gateway Route Tables ${routeTableItem.name}`);

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
      this.logger.info(`Share transit gateway`);
      this.addResourceShare(tgwItem, `${tgwItem.name}_TransitGatewayShare`, [tgw.transitGatewayArn]);
    }
    return tgw;
  }

  /**
   * Function to create TGW peering role. This role is used to access acceptor TGW information.
   * This role will be assumed by requestor to complete acceptance of peering request.
   * This role is created only if account is used as accepter in TGW peering.
   * This role gets created only in home region
   * @returns
   */
  private createTransitGatewayPeeringRole() {
    for (const transitGatewayPeeringItem of this.props.networkConfig.transitGatewayPeering ?? []) {
      const accepterAccountId = this.props.accountsConfig.getAccountId(transitGatewayPeeringItem.accepter.account);

      if (
        accepterAccountId === cdk.Stack.of(this).account &&
        this.props.globalConfig.homeRegion === cdk.Stack.of(this).region
      ) {
        const principals: cdk.aws_iam.PrincipalBase[] = [];

        const requestorAccounts = this.props.networkConfig.getTgwRequestorAccountNames(
          transitGatewayPeeringItem.accepter.account,
        );

        requestorAccounts.forEach(item => {
          principals.push(new cdk.aws_iam.AccountPrincipal(this.props.accountsConfig.getAccountId(item)));
        });

        new cdk.aws_iam.Role(this, 'TgwPeeringRole', {
          roleName: AcceleratorStack.ACCELERATOR_TGW_PEERING_ROLE_NAME,
          assumedBy: new cdk.aws_iam.CompositePrincipal(...principals),
          inlinePolicies: {
            default: new cdk.aws_iam.PolicyDocument({
              statements: [
                new cdk.aws_iam.PolicyStatement({
                  effect: cdk.aws_iam.Effect.ALLOW,
                  actions: ['ssm:GetParameters', 'ssm:GetParameter', 'ssm:PutParameter'],
                  resources: [
                    `arn:${cdk.Aws.PARTITION}:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter/accelerator/network/transitGateways/*`,
                  ],
                }),
                new cdk.aws_iam.PolicyStatement({
                  effect: cdk.aws_iam.Effect.ALLOW,
                  actions: [
                    'ec2:DescribeTransitGatewayPeeringAttachments',
                    'ec2:AcceptTransitGatewayPeeringAttachment',
                    'ec2:AssociateTransitGatewayRouteTable',
                    'ec2:DisassociateTransitGatewayRouteTable',
                    'ec2:DescribeTransitGatewayAttachments',
                    'ec2:CreateTags',
                  ],
                  resources: ['*'],
                }),
              ],
            }),
          },
        });

        // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
        // rule suppression with evidence for this permission.
        NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/TgwPeeringRole/Resource`, [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'TgwPeeringRole needs access to create peering connections for TGWs in the account ',
          },
        ]);

        return; // So that same env (account & region) do not try to create duplicate role, if there is multiple tgw peering for same account
      }
    }
  }

  /**
   * Function to create Managed active directory share accept role. This role is used to assume by MAD account to auto accept share request
   * This role is created only if account is a shared target for MAD.
   * This role gets created only in home region
   * @returns
   */
  private createManagedActiveDirectoryShareAcceptRole() {
    for (const managedActiveDirectory of this.props.iamConfig.managedActiveDirectories ?? []) {
      const madAccountId = this.props.accountsConfig.getAccountId(managedActiveDirectory.account);
      const sharedAccountNames = this.props.iamConfig.getManageActiveDirectorySharedAccountNames(
        managedActiveDirectory.name,
        this.props.configDirPath,
      );

      const sharedAccountIds: string[] = [];
      for (const account of sharedAccountNames) {
        sharedAccountIds.push(this.props.accountsConfig.getAccountId(account));
      }

      // Create role in shared account home region only
      if (
        sharedAccountIds.includes(cdk.Stack.of(this).account) &&
        cdk.Stack.of(this).region === this.props.globalConfig.homeRegion
      ) {
        new cdk.aws_iam.Role(this, 'MadShareAcceptRole', {
          roleName: AcceleratorStack.ACCELERATOR_MAD_SHARE_ACCEPT_ROLE_NAME,
          assumedBy: new cdk.aws_iam.PrincipalWithConditions(new cdk.aws_iam.AccountPrincipal(madAccountId), {
            ArnLike: {
              'aws:PrincipalARN': [`arn:${cdk.Stack.of(this).partition}:iam::${madAccountId}:role/AWSAccelerator-*`],
            },
          }),
          inlinePolicies: {
            default: new cdk.aws_iam.PolicyDocument({
              statements: [
                new cdk.aws_iam.PolicyStatement({
                  effect: cdk.aws_iam.Effect.ALLOW,
                  actions: ['ds:AcceptSharedDirectory'],
                  resources: ['*'],
                }),
              ],
            }),
          },
        });

        // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
        // rule suppression with evidence for this permission.
        NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/MadShareAcceptRole/Resource`, [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'MAD share accept role needs access to directory for acceptance ',
          },
        ]);
      }
    }
  }

  /**
   * Create VPN connection resources
   * @param props
   */
  private createVpnConnectionResources(props: AcceleratorStackProps) {
    //
    // Generate Customer Gateways
    //
    for (const cgwItem of props.networkConfig.customerGateways ?? []) {
      const accountId = this.accountsConfig.getAccountId(cgwItem.account);
      if (accountId === cdk.Stack.of(this).account && cgwItem.region == cdk.Stack.of(this).region) {
        this.logger.info(`Add Customer Gateway ${cgwItem.name} in ${cgwItem.region}`);
        const cgw = new CustomerGateway(this, pascalCase(`${cgwItem.name}CustomerGateway`), {
          name: cgwItem.name,
          bgpAsn: cgwItem.asn,
          ipAddress: cgwItem.ipAddress,
          tags: cgwItem.tags,
        });

        new ssm.StringParameter(this, pascalCase(`SsmParam${cgwItem.name}CustomerGateway`), {
          parameterName: `/accelerator/network/customerGateways/${cgwItem.name}/id`,
          stringValue: cgw.customerGatewayId,
        });

        for (const vpnConnectItem of cgwItem.vpnConnections ?? []) {
          // Make sure that VPN Connections are created for TGWs in this stack only.
          if (vpnConnectItem.transitGateway) {
            this.createVpnConnection(cgw, cgwItem, vpnConnectItem);
          }
        }
      }
    }
  }

  /**
   * Create VPN connection item
   * @param cgw
   * @param cgwItem
   * @param vpnConnectItem
   */
  private createVpnConnection(
    cgw: CustomerGateway,
    cgwItem: CustomerGatewayConfig,
    vpnConnectItem: VpnConnectionConfig,
  ) {
    // Get the Transit Gateway ID
    const transitGatewayId = this.transitGatewayMap.get(vpnConnectItem.transitGateway!);
    if (!transitGatewayId) {
      this.logger.error(`Transit Gateway ${vpnConnectItem.transitGateway} not found`);
      throw new Error(`Configuration validation failed at runtime.`);
    }

    this.logger.info(
      `Attaching Customer Gateway ${cgwItem.name} to ${vpnConnectItem.transitGateway} in ${cgwItem.region}`,
    );
    const vpnConnection = new VpnConnection(this, pascalCase(`${vpnConnectItem.name}VpnConnection`), {
      name: vpnConnectItem.name,
      customerGatewayId: cgw.customerGatewayId,
      staticRoutesOnly: vpnConnectItem.staticRoutesOnly,
      tags: vpnConnectItem.tags,
      transitGatewayId: transitGatewayId,
      vpnTunnelOptionsSpecifications: vpnConnectItem.tunnelSpecifications,
    });

    new ssm.StringParameter(this, pascalCase(`SsmParam${vpnConnectItem.name}VpnConnection`), {
      parameterName: `/accelerator/network/vpnConnection/${vpnConnectItem.name}/id`,
      stringValue: vpnConnection.vpnConnectionId,
    });
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
      this.logger.info(`Creating Direct Connect Gateway ${dxgwItem.name}`);
      const dxGateway = new DirectConnectGateway(this, pascalCase(`${dxgwItem.name}DxGateway`), {
        gatewayName: dxgwItem.gatewayName,
        asn: dxgwItem.asn,
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.logRetention,
      });
      this.ssmParameters.push({
        logicalId: pascalCase(`SsmParam${dxgwItem.name}DirectConnectGateway`),
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
        this.logger.info(
          `Creating virtual interface allocation ${vifItem.name} to Direct Connect Gateway ${dxgwItem.name}`,
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
        this.logger.info(`Creating virtual interface ${vifItem.name} to Direct Connect Gateway ${dxgwItem.name}`);
        createVif = true;
        const directConnectGatewayId = this.dxGatewayMap.get(dxgwItem.name);
        if (!directConnectGatewayId) {
          this.logger.error(`Unable to locate Direct Connect Gateway ${dxgwItem.name}`);
          throw new Error(`Configuration validation failed at runtime.`);
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
      this.logger.error(`Create virtual interfaces: unable to process properties for virtual interface ${vifName}`);
      throw new Error(`Configuration validation failed at runtime.`);
    }
    const virtualInterface = new VirtualInterface(this, vifLogicalId, vifProps);
    this.ssmParameters.push({
      logicalId: pascalCase(`SsmParam${dxgwName}${vifName}VirtualInterface`),
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
          this.logger.error(`Unable to locate transit gateway ${associationItem.name}`);
          throw new Error(`Configuration validation failed at runtime.`);
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
        this.logger.info(`Direct Connect Gateway: Create IAM cross-account access role`);

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

  private createIpamSsmRole(ipamItem: IpamConfig, delegatedAdminAccountId: string, organizationId: string): void {
    if (ipamItem.region !== cdk.Stack.of(this).region && cdk.Stack.of(this).account === delegatedAdminAccountId) {
      this.logger.info(`IPAM Pool: Create IAM role for SSM Parameter pulls`);
      const role = new cdk.aws_iam.Role(this, `Get${pascalCase(ipamItem.name)}SsmParamRole`, {
        roleName: `AWSAccelerator-GetAcceleratorIpamSsmParamRole-${cdk.Stack.of(this).region}`,
        assumedBy: this.getOrgPrincipals(organizationId),
        inlinePolicies: {
          default: new cdk.aws_iam.PolicyDocument({
            statements: [
              new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                actions: ['ssm:GetParameter', 'ssm:GetParameters'],
                resources: [
                  `arn:${cdk.Aws.PARTITION}:ssm:${ipamItem.region}:${cdk.Aws.ACCOUNT_ID}:parameter/accelerator/network/ipam/pools/*/id`,
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

  /**
   * Create central network resources
   */
  private createCentralNetworkResources(props: AcceleratorStackProps) {
    if (props.networkConfig.centralNetworkServices) {
      const centralConfig = props.networkConfig.centralNetworkServices;
      const delegatedAdminAccountId = this.accountsConfig.getAccountId(centralConfig.delegatedAdminAccount);
      const organizationId = new Organization(this, 'IpamOrgID').id;

      //
      // Generate IPAMs
      //
      for (const ipamItem of centralConfig.ipams ?? []) {
        this.createIpam(delegatedAdminAccountId, ipamItem);
        this.createIpamSsmRole(ipamItem, delegatedAdminAccountId, organizationId);
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
   * Creates FMS Notification Channels
   */
  private createFMSNotificationChannels() {
    const fmsConfiguration = this.props.networkConfig.firewallManagerService;
    // Exit if Notification channels don't exist.
    if (!fmsConfiguration?.notificationChannels || fmsConfiguration.notificationChannels.length === 0) {
      return;
    }
    const accountId = this.accountsConfig.getAccountId(fmsConfiguration.delegatedAdminAccount);
    const auditAccountId = this.props.accountsConfig.getAuditAccountId();
    const roleArn = `arn:${cdk.Stack.of(this).partition}:iam::${
      cdk.Stack.of(this).account
    }:role/AWSAccelerator-FMS-Notifications`;

    for (const notificationChannel of fmsConfiguration.notificationChannels) {
      const snsTopicName = notificationChannel.snsTopic;
      if (accountId === cdk.Stack.of(this).account && notificationChannel.region === cdk.Stack.of(this).region) {
        const snsTopicsSecurity =
          this.props.securityConfig.centralSecurityServices.snsSubscriptions?.map(
            snsSubscription => snsSubscription.level,
          ) || [];
        const snsTopicsGlobal = this.props.globalConfig.snsTopics?.topics.map(snsTopic => snsTopic.name) || [];
        const snsTopics = [...snsTopicsSecurity, ...snsTopicsGlobal];
        if (!snsTopics.includes(snsTopicName)) {
          this.logger.error(`SNS Topic level ${snsTopicName} does not exist in the security config SNS Topics`);
          throw new Error(`Configuration validation failed at runtime.`);
        }
        let snsTopicArn = `arn:${cdk.Stack.of(this).partition}:sns:${cdk.Stack.of(this).region}:${
          cdk.Stack.of(this).account
        }:aws-accelerator-${snsTopicName}`;

        if (snsTopicsSecurity.includes(snsTopicName)) {
          snsTopicArn = `arn:${cdk.Stack.of(this).partition}:sns:${
            cdk.Stack.of(this).region
          }:${auditAccountId}:aws-accelerator-${snsTopicName}Notifications`;
        }
        this.logger.info(
          `Adding FMS notification channel for ${fmsConfiguration.delegatedAdminAccount} in region ${notificationChannel.region} to topic ${snsTopicArn}`,
        );

        new FMSNotificationChannel(this, `fmsNotification-${this.account}-${this.region}`, {
          snsTopicArn,
          snsRoleArn: roleArn,
        });

        this.logger.info(`Created FMS notification Channel`);
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
      this.logger.info(`Add IPAM ${ipamItem.name}`);

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
        this.logger.info(`Add IPAM scope ${scopeItem.name}`);
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
          this.logger.info(`Add IPAM top-level pool ${poolItem.name}`);
          let poolScope: string | undefined;

          if (poolItem.scope) {
            poolScope = scopeMap.get(poolItem.scope)?.ipamScopeId;

            if (!poolScope) {
              this.logger.error(`Unable to locate IPAM scope ${poolItem.scope} for pool ${poolItem.name}`);
              throw new Error(`Configuration validation failed at runtime.`);
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
            this.logger.info(`Share IPAM pool ${poolItem.name}`);
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
                this.logger.error(
                  `Unable to locate source IPAM pool ${poolItem.sourceIpamPool} for pool ${poolItem.name}`,
                );
                throw new Error(`Configuration validation failed at runtime.`);
              }
              // Skip iteration if source pool exists but has not yet been created
              continue;
            }

            // Check if this item has already been created
            const poolExists = poolMap.get(poolItem.name);

            if (sourcePool && !poolExists) {
              this.logger.info(`Add IPAM nested pool ${poolItem.name}`);
              let poolScope: string | undefined;

              if (poolItem.scope) {
                poolScope = scopeMap.get(poolItem.scope)?.ipamScopeId;

                if (!poolScope) {
                  this.logger.error(`Unable to locate IPAM scope ${poolItem.scope} for pool ${poolItem.name}`);
                  throw new Error(`Configuration validation failed at runtime.`);
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
                this.logger.info(`Share IPAM pool ${poolItem.name}`);
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
          this.logger.error(`Only one of customDomainList or managedDomainList may be defined for ${ruleItem.name}`);
          throw new Error(`Configuration validation failed at runtime.`);
        } else if (ruleItem.customDomainList) {
          domainListType = ResolverFirewallDomainListType.CUSTOM;
          filePath = path.join(this.props.configDirPath, ruleItem.customDomainList);
          try {
            listName = ruleItem.customDomainList.split('/')[1].split('.')[0];
            if (!this.domainMap.has(listName)) {
              this.logger.info(`Creating DNS firewall custom domain list ${listName}`);
            }
          } catch (e) {
            this.logger.error(`Error creating DNS firewall domain list: ${e}`);
            throw new Error(`Configuration validation failed at runtime.`);
          }
        } else if (ruleItem.managedDomainList) {
          domainListType = ResolverFirewallDomainListType.MANAGED;
          listName = ruleItem.managedDomainList;
          if (!this.domainMap.has(listName)) {
            this.logger.info(`Looking up DNS firewall managed domain list ${listName}`);
          }
        } else {
          this.logger.error(`One of customDomainList or managedDomainList must be defined for ${ruleItem.name}`);
          throw new Error(`Configuration validation failed at runtime.`);
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
            this.logger.error(`Error parsing list name from ${ruleItem.customDomainList}`);
            throw new Error(`Configuration validation failed at runtime.`);
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
          this.logger.error(`Domain list ${domainListName} not found in domain map`);
          throw new Error(`Configuration validation failed at runtime.`);
        }
      }

      this.logger.info(`Creating DNS firewall rule group ${firewallItem.name}`);
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
        this.logger.info(`Share DNS firewall rule group ${firewallItem.name}`);
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
      this.logger.info(`Create DNS query log ${logItem.name}-s3 for central S3 destination`);
      const centralLogsBucket = cdk.aws_s3.Bucket.fromBucketName(
        this,
        'CentralLogsBucket',
        `${
          AcceleratorStack.ACCELERATOR_CENTRAL_LOGS_BUCKET_NAME_PREFIX
        }-${this.accountsConfig.getLogArchiveAccountId()}-${this.props.centralizedLoggingRegion}`,
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
        this.logger.info(`Share DNS query log config ${logItem.name}-s3`);
        this.addResourceShare(logItem, `${logItem.name}-s3_QueryLogConfigShare`, [s3QueryLogConfig.logArn]);
      }
    }

    if (logItem.destinations.includes('cloud-watch-logs')) {
      this.logger.info(`Create DNS query log ${logItem.name}-cwl for central CloudWatch logs destination`);
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
        this.logger.info(`Share DNS query log config ${logItem.name}-cwl`);
        this.addResourceShare(logItem, `${logItem.name}-cwl_QueryLogConfigShare`, [cwlQueryLogConfig.logArn]);
      }
    }
  }

  /**
   * Function to read suricata rule file and get rule definition
   * @param fileName
   * @param fileContent
   * @returns
   */
  private getSuricataRules(fileName: string, fileContent: string): string {
    const rules: string[] = [];
    // Suricata supported action type list
    // @link https://suricata.readthedocs.io/en/suricata-6.0.2/rules/intro.html#action
    const suricataRuleActionType = ['alert', 'pass', 'drop', 'reject', 'rejectsrc', 'rejectdst', 'rejectboth'];
    fileContent.split(/\r?\n/).forEach(line => {
      const ruleAction = line.split(' ')[0];
      if (suricataRuleActionType.includes(ruleAction)) {
        rules.push(line);
      }
    });

    if (rules.length > 0) {
      return rules.join('\n');
    } else {
      this.logger.error(`No rule definition found in suricata rules file ${fileName}`);
      throw new Error(`Configuration validation failed at runtime.`);
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
      this.logger.info(`Create network firewall rule group ${ruleItem.name}`);
      let nfwRuleGroupRuleConfig: NfwRuleGroupRuleConfig | undefined;

      //
      // When suricata rule files used
      if (ruleItem.ruleGroup?.rulesSource.rulesFile) {
        nfwRuleGroupRuleConfig = {
          rulesSource: {
            rulesString: this.getSuricataRules(
              ruleItem.ruleGroup?.rulesSource.rulesFile,
              fs.readFileSync(path.join(this.props.configDirPath, ruleItem.ruleGroup?.rulesSource.rulesFile), 'utf8'),
            ),
            rulesSourceList: undefined,
            statefulRules: undefined,
            statelessRulesAndCustomActions: undefined,
            rulesFile: undefined,
          },
          ruleVariables: ruleItem.ruleGroup?.ruleVariables,
          statefulRuleOptions: ruleItem.ruleGroup.statefulRuleOptions,
        };
      } else {
        nfwRuleGroupRuleConfig = ruleItem.ruleGroup;
      }
      const rule = new NetworkFirewallRuleGroup(this, pascalCase(`${ruleItem.name}NetworkFirewallRuleGroup`), {
        capacity: ruleItem.capacity,
        name: ruleItem.name,
        type: ruleItem.type,
        description: ruleItem.description,
        ruleGroup: nfwRuleGroupRuleConfig,
        tags: ruleItem.tags ?? [],
      });
      this.nfwRuleMap.set(ruleItem.name, rule.groupArn);
      new ssm.StringParameter(this, pascalCase(`SsmParam${ruleItem.name}NetworkFirewallRuleGroup`), {
        parameterName: `/accelerator/network/networkFirewall/ruleGroups/${ruleItem.name}/arn`,
        stringValue: rule.groupArn,
      });

      if (ruleItem.shareTargets) {
        this.logger.info(`Share Network Firewall rule group ${ruleItem.name}`);
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
          this.logger.error(`Rule group ${group.name} not found in rule map`);
          throw new Error(`Configuration validation failed at runtime.`);
        }
      }

      for (const group of policyItem.firewallPolicy.statelessRuleGroups ?? []) {
        if (this.nfwRuleMap.has(group.name)) {
          statelessGroups.push({ priority: group.priority, resourceArn: this.nfwRuleMap.get(group.name)! });
        } else {
          this.logger.error(`Rule group ${group.name} not found in rule map`);
          throw new Error(`Configuration validation failed at runtime.`);
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
      this.logger.info(`Create network firewall policy ${policyItem.name}`);
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
        this.logger.info(`Share Network Firewall policy ${policyItem.name}`);
        this.addResourceShare(policyItem, `${policyItem.name}_NetworkFirewallPolicyShare`, [policy.policyArn]);
      }
    }
  }
}
