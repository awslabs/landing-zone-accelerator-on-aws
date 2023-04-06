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

import { TransitGatewayConfig } from '@aws-accelerator/config';
import { TransitGateway, TransitGatewayRouteTable } from '@aws-accelerator/constructs';
import { SsmResourceType } from '@aws-accelerator/utils';
import * as cdk from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import { pascalCase } from 'pascal-case';
import { AcceleratorStackProps } from '../../accelerator-stack';
import { LogLevel } from '../network-stack';
import { NetworkPrepStack } from './network-prep-stack';

export class TgwResources {
  public readonly transitGatewayMap: Map<string, string>;
  public readonly ssmRole?: cdk.aws_iam.Role;

  private stack: NetworkPrepStack;

  constructor(networkPrepStack: NetworkPrepStack, props: AcceleratorStackProps) {
    // Set private stack property
    this.stack = networkPrepStack;
    // Create transit gateways
    this.transitGatewayMap = this.createTransitGateways(props);
    // Create TGW peering role
    this.ssmRole = this.createTransitGatewayPeeringRole(props);
  }

  /**
   * Create transit gateways
   * @param props
   */
  private createTransitGateways(props: AcceleratorStackProps): Map<string, string> {
    const transitGatewayMap = new Map<string, string>();
    for (const tgwItem of props.networkConfig.transitGateways ?? []) {
      const accountId = props.accountsConfig.getAccountId(tgwItem.account);

      if (this.stack.isTargetStack([accountId], [tgwItem.region])) {
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
    this.stack.addLogs(LogLevel.INFO, `Add Transit Gateway ${tgwItem.name}`);
    // Create TGW
    const tgw = new TransitGateway(this.stack, pascalCase(`${tgwItem.name}TransitGateway`), {
      name: tgwItem.name,
      amazonSideAsn: tgwItem.asn,
      autoAcceptSharedAttachments: tgwItem.autoAcceptSharingAttachments,
      defaultRouteTableAssociation: tgwItem.defaultRouteTableAssociation,
      defaultRouteTablePropagation: tgwItem.defaultRouteTablePropagation,
      dnsSupport: tgwItem.dnsSupport,
      vpnEcmpSupport: tgwItem.vpnEcmpSupport,
      tags: tgwItem.tags,
    });

    this.stack.addSsmParameter({
      logicalId: pascalCase(`SsmParam${tgwItem.name}TransitGatewayId`),
      parameterName: this.stack.getSsmPath(SsmResourceType.TGW, [tgwItem.name]),
      stringValue: tgw.transitGatewayId,
    });

    // Creaet TGW route tables
    for (const routeTableItem of tgwItem.routeTables ?? []) {
      this.stack.addLogs(LogLevel.INFO, `Add Transit Gateway Route Table ${routeTableItem.name}`);

      const routeTable = new TransitGatewayRouteTable(
        this.stack,
        pascalCase(`${routeTableItem.name}TransitGatewayRouteTable`),
        {
          transitGatewayId: tgw.transitGatewayId,
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

    if (tgwItem.shareTargets) {
      this.stack.addLogs(LogLevel.INFO, `Share transit gateway ${tgwItem.name}`);
      this.stack.addResourceShare(tgwItem, `${tgwItem.name}_TransitGatewayShare`, [tgw.transitGatewayArn]);
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
                    `arn:${cdk.Aws.PARTITION}:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter${props.prefixes.ssmParamName}/network/transitGateways/*`,
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
}
