/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { AseaResourceType, CustomerGatewayConfig, TransitGatewayConfig } from '@aws-accelerator/config';
import {
  PutSsmParameter,
  SsmParameterProps,
  TransitGateway,
  TransitGatewayRouteTable,
} from '@aws-accelerator/constructs';
import { SsmResourceType } from '@aws-accelerator/utils/lib/ssm-parameter-path';
import * as cdk from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import { pascalCase } from 'pascal-case';
import { AcceleratorStackProps } from '../../accelerator-stack';
import { LogLevel } from '../network-stack';
import { getTgwConfig, getTgwRouteTableId, getTransitGatewayId } from '../utils/getter-utils';
import { isIpv4 } from '../utils/validation-utils';
import { NetworkPrepStack } from './network-prep-stack';

export class TgwResources {
  public readonly sharedParameterMap: Map<string, SsmParameterProps[]>;
  public readonly tgwRouteTableMap: Map<string, string>;
  public readonly transitGatewayMap: Map<string, string>;
  public readonly ssmRole?: cdk.aws_iam.Role;

  private stack: NetworkPrepStack;

  constructor(networkPrepStack: NetworkPrepStack, props: AcceleratorStackProps) {
    // Set private stack property
    this.stack = networkPrepStack;
    // Create transit gateways
    [this.transitGatewayMap, this.tgwRouteTableMap] = this.createTransitGateways(this.stack.tgwsInScope);
    // Create TGW peering role
    this.ssmRole = this.createTransitGatewayPeeringRole(props);
    // Put cross-account/cross-region parameters
    this.sharedParameterMap = this.createSharedParameters(
      this.stack.tgwsInScope,
      this.transitGatewayMap,
      this.tgwRouteTableMap,
      props.networkConfig.customerGateways,
    );
  }

  /**
   * Create transit gateways
   * @param props
   */
  private createTransitGateways(transitGateways: TransitGatewayConfig[]): Map<string, string>[] {
    const transitGatewayMap = new Map<string, string>();
    const tgwRouteTableMap = new Map<string, string>();

    for (const tgwItem of transitGateways) {
      const tgw = this.createTransitGatewayItem(tgwItem);
      transitGatewayMap.set(tgwItem.name, tgw.transitGatewayId);
      const routeTables = this.createOrImportTgwRouteTables(tgwItem, tgw.transitGatewayId);
      routeTables.forEach((routeTableId, routeTableName) => tgwRouteTableMap.set(routeTableName, routeTableId));
    }
    return [transitGatewayMap, tgwRouteTableMap];
  }

  /**
   * Create transit gateway
   * @param tgwItem
   */
  private createTransitGatewayItem(tgwItem: TransitGatewayConfig): TransitGateway {
    this.stack.addLogs(LogLevel.INFO, `Add Transit Gateway ${tgwItem.name}`);
    let tgw;
    if (this.stack.isManagedByAsea(AseaResourceType.TRANSIT_GATEWAY, tgwItem.name)) {
      const tgwId = this.stack.getExternalResourceParameter(this.stack.getSsmPath(SsmResourceType.TGW, [tgwItem.name]));
      tgw = TransitGateway.fromTransitGatewayAttributes(this.stack, pascalCase(`${tgwItem.name}TransitGateway`), {
        transitGatewayId: tgwId,
        transitGatewayName: tgwItem.name,
      });
    } else {
      // Handle case where partition doesn't support TGW Cidr Blocks
      let transitGatewayCidrBlocks: string[] | undefined = undefined;
      if (tgwItem.transitGatewayCidrBlocks || tgwItem.transitGatewayIpv6CidrBlocks) {
        transitGatewayCidrBlocks = [
          ...(tgwItem.transitGatewayCidrBlocks ?? []),
          ...(tgwItem.transitGatewayIpv6CidrBlocks ?? []),
        ];
      } else {
        transitGatewayCidrBlocks = undefined;
      }
      // Create TGW
      tgw = new TransitGateway(this.stack, pascalCase(`${tgwItem.name}TransitGateway`), {
        name: tgwItem.name,
        amazonSideAsn: tgwItem.asn,
        autoAcceptSharedAttachments: tgwItem.autoAcceptSharingAttachments,
        defaultRouteTableAssociation: tgwItem.defaultRouteTableAssociation,
        defaultRouteTablePropagation: tgwItem.defaultRouteTablePropagation,
        dnsSupport: tgwItem.dnsSupport,
        vpnEcmpSupport: tgwItem.vpnEcmpSupport,
        transitGatewayCidrBlocks: transitGatewayCidrBlocks,
        tags: tgwItem.tags,
      });

      this.stack.addSsmParameter({
        logicalId: pascalCase(`SsmParam${tgwItem.name}TransitGatewayId`),
        parameterName: this.stack.getSsmPath(SsmResourceType.TGW, [tgwItem.name]),
        stringValue: tgw.transitGatewayId,
      });
    }

    if (tgwItem.shareTargets) {
      this.stack.addLogs(LogLevel.INFO, `Share transit gateway ${tgwItem.name}`);
      this.stack.addResourceShare(tgwItem, `${tgwItem.name}_TransitGatewayShare`, [tgw.transitGatewayArn]);
    }
    return tgw;
  }

  /**
   * Create or import transit gateway route tables
   * @param tgwItem TransitGatewayConfig
   * @param transitGatewayId string
   * @returns Map<string, string>
   */
  private createOrImportTgwRouteTables(tgwItem: TransitGatewayConfig, transitGatewayId: string): Map<string, string> {
    const routeTables = new Map<string, string>();

    for (const routeTableItem of tgwItem.routeTables ?? []) {
      this.stack.addLogs(LogLevel.INFO, `Add Transit Gateway Route Table ${routeTableItem.name}`);
      let routeTable;
      if (
        this.stack.isManagedByAsea(
          AseaResourceType.TRANSIT_GATEWAY_ROUTE_TABLE,
          `${tgwItem.name}/${routeTableItem.name}`,
        )
      ) {
        const routeTableId = this.stack.getExternalResourceParameter(
          this.stack.getSsmPath(SsmResourceType.TGW_ROUTE_TABLE, [tgwItem.name, routeTableItem.name]),
        );
        routeTable = TransitGatewayRouteTable.fromRouteTableId(
          this.stack,
          pascalCase(`${routeTableItem.name}TransitGatewayRouteTable`),
          routeTableId,
        );
      } else {
        routeTable = new TransitGatewayRouteTable(
          this.stack,
          pascalCase(`${routeTableItem.name}TransitGatewayRouteTable`),
          {
            transitGatewayId,
            name: routeTableItem.name,
            tags: routeTableItem.tags,
          },
        );

        this.stack.addSsmParameter({
          logicalId: pascalCase(`SsmParam${tgwItem.name}${routeTableItem.name}TransitGatewayRouteTableId`),
          parameterName: this.stack.getSsmPath(SsmResourceType.TGW_ROUTE_TABLE, [tgwItem.name, routeTableItem.name]),
          stringValue: routeTable.id,
        });
      }
      routeTables.set(`${tgwItem.name}_${routeTableItem.name}`, routeTable.id);
    }
    return routeTables;
  }

  /**
   * Function to create TGW peering role. This role is used to access acceptor TGW information.
   * This role will be assumed by requestor to complete acceptance of peering request.
   * This role is created only if account is used as accepter in TGW peering.
   * This role gets created only in home region
   * @returns
   */
  private createTransitGatewayPeeringRole(props: AcceleratorStackProps): cdk.aws_iam.Role | undefined {
    for (const transitGatewayPeeringItem of props.networkConfig.transitGatewayPeering ?? []) {
      const accepterAccountId = props.accountsConfig.getAccountId(transitGatewayPeeringItem.accepter.account);

      if (this.stack.isTargetStack([accepterAccountId], [props.globalConfig.homeRegion])) {
        const principals: cdk.aws_iam.PrincipalBase[] = [];

        const requestorAccounts = props.networkConfig.getTgwRequestorAccountNames(
          transitGatewayPeeringItem.accepter.account,
        );

        requestorAccounts.forEach(item => {
          principals.push(new cdk.aws_iam.AccountPrincipal(props.accountsConfig.getAccountId(item)));
        });

        const role = new cdk.aws_iam.Role(this.stack, 'TgwPeeringRole', {
          roleName: this.stack.acceleratorResourceNames.roles.tgwPeering,
          assumedBy: new cdk.aws_iam.CompositePrincipal(...principals),
          inlinePolicies: {
            default: new cdk.aws_iam.PolicyDocument({
              statements: [
                new cdk.aws_iam.PolicyStatement({
                  effect: cdk.aws_iam.Effect.ALLOW,
                  actions: ['ssm:GetParameters', 'ssm:GetParameter'],
                  resources: [
                    `arn:${cdk.Aws.PARTITION}:ssm:*:${cdk.Aws.ACCOUNT_ID}:parameter${props.prefixes.ssmParamName}/network/transitGateways/*`,
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
        NagSuppressions.addResourceSuppressionsByPath(this.stack, `${this.stack.stackName}/TgwPeeringRole/Resource`, [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'TgwPeeringRole needs access to create peering connections for TGWs in the account ',
          },
        ]);

        return role; // So that same env (account & region) do not try to create duplicate role, if there is multiple tgw peering for same account
      }
    }
    return undefined;
  }

  /**
   * Create cross-account/cross-region SSM parameters for site-to-site VPN connections
   * that must reference the TGW/TGW route table in cross-account VPN scenarios
   * @param transitGateways TransitGatewayConfig[]
   * @param transitGatewayMap Map<string, string>
   * @param tgwRouteTableMap Map<string, string>
   * @param customerGateways CustomerGatewayConfig[]
   * @returns Map<string, SsmParameterProps[]>
   */
  private createSharedParameters(
    transitGateways: TransitGatewayConfig[],
    transitGatewayMap: Map<string, string>,
    tgwRouteTableMap: Map<string, string>,
    customerGateways?: CustomerGatewayConfig[],
  ): Map<string, SsmParameterProps[]> {
    const sharedParameterMap = new Map<string, SsmParameterProps[]>();
    const tgwNames = transitGateways.map(tgw => tgw.name);
    const tgwVpnCustomerGateways = customerGateways
      ? customerGateways.filter(cgw => cgw.vpnConnections?.filter(vpn => tgwNames.includes(vpn.transitGateway ?? '')))
      : [];
    const crossAcctFirewallReferenceCgws = tgwVpnCustomerGateways.filter(
      cgw => !isIpv4(cgw.ipAddress) && !this.stack.firewallVpcInScope(cgw),
    );

    for (const crossAcctCgw of crossAcctFirewallReferenceCgws) {
      const firewallVpcConfig = this.stack.getFirewallVpcConfig(crossAcctCgw);
      const accountIds = this.stack.getVpcAccountIds(firewallVpcConfig);
      const parameters = this.setCrossAccountSsmParameters(
        crossAcctCgw,
        transitGateways,
        transitGatewayMap,
        tgwRouteTableMap,
      );

      if (parameters.length > 0) {
        // Put SSM parameters
        new PutSsmParameter(this.stack, pascalCase(`${crossAcctCgw.name}TgwVpnSharedParameters`), {
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
   * Returns an array of SSM parameters for cross-account TGW VPN connections
   * @param cgw CustomerGatewayConfig
   * @param transitGateways TransitGatewayConfig[]
   * @param transitGatewayMap Map<string, string>
   * @param tgwRouteTableMap Map<string, string>
   * @returns SsmParameterProps[]
   */
  private setCrossAccountSsmParameters(
    cgw: CustomerGatewayConfig,
    transitGateways: TransitGatewayConfig[],
    transitGatewayMap: Map<string, string>,
    tgwRouteTableMap: Map<string, string>,
  ) {
    const ssmParameters: SsmParameterProps[] = [];

    for (const vpnItem of cgw.vpnConnections ?? []) {
      if (vpnItem.transitGateway && transitGatewayMap.has(vpnItem.transitGateway)) {
        //
        // Set TGW ID
        const tgwConfig = getTgwConfig(transitGateways, vpnItem.transitGateway);
        ssmParameters.push({
          name: this.stack.getSsmPath(SsmResourceType.CROSS_ACCOUNT_TGW, [cgw.name, tgwConfig.name]),
          value: getTransitGatewayId(transitGatewayMap, tgwConfig.name),
        });
        //
        // Set TGW Route Table IDs
        for (const routeTableItem of tgwConfig.routeTables ?? []) {
          ssmParameters.push({
            name: this.stack.getSsmPath(SsmResourceType.CROSS_ACCOUNT_TGW_ROUTE_TABLE, [
              cgw.name,
              tgwConfig.name,
              routeTableItem.name,
            ]),
            value: getTgwRouteTableId(tgwRouteTableMap, tgwConfig.name, routeTableItem.name),
          });
        }
      }
    }
    return [...new Set(ssmParameters)];
  }
}
