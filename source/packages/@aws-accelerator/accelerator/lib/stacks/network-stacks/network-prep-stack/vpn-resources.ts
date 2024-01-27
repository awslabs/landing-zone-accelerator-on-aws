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

import { CustomerGatewayConfig, VpnConnectionConfig } from '@aws-accelerator/config';
import { CustomerGateway, VpnConnection } from '@aws-accelerator/constructs';
import { SsmResourceType } from '@aws-accelerator/utils/lib/ssm-parameter-path';
import * as cdk from 'aws-cdk-lib';
import { pascalCase } from 'pascal-case';
import { AcceleratorStackProps, NagSuppressionRuleIds } from '../../accelerator-stack';
import { LogLevel } from '../network-stack';
import { getTransitGatewayId } from '../utils/getter-utils';
import { isIpv4 } from '../utils/validation-utils';
import { NetworkPrepStack } from './network-prep-stack';

export class VpnResources {
  public readonly cgwMap: Map<string, string>;
  public readonly vpnMap: Map<string, string>;
  public readonly crossAccountCgwRole?: cdk.aws_iam.Role;
  public readonly crossAccountLogsRole?: cdk.aws_iam.Role;
  public readonly crossAccountTgwRoutesRole?: cdk.aws_iam.Role;
  public readonly crossAccountVpnRole?: cdk.aws_iam.Role;
  private stack: NetworkPrepStack;
  private transitGatewayMap: Map<string, string>;

  constructor(
    networkPrepStack: NetworkPrepStack,
    transitGatewayMap: Map<string, string>,
    props: AcceleratorStackProps,
  ) {
    // Set private properties
    this.stack = networkPrepStack;
    this.transitGatewayMap = transitGatewayMap;

    // Create CGWs and VPN connections
    const customResourceHandler = this.stack.advancedVpnTypes.includes('tgw')
      ? this.stack.createVpnOnEventHandler()
      : undefined;
    [this.cgwMap, this.vpnMap] = this.createVpnConnectionResources(props, customResourceHandler);

    // Create cross-account VPN roles, if needed
    const [hasCrossAcctVpn, hasCrossAcctTgwVpn] = this.hasCrossAccountVpn(props);
    if (hasCrossAcctVpn) {
      this.crossAccountCgwRole = this.createCrossAccountCgwRole();
      this.crossAccountLogsRole = this.createCrossAccountLogsRole();
      this.crossAccountVpnRole = this.createCrossAccountVpnRole();
    }

    // Create cross-account TGW VPN role, if needed
    if (hasCrossAcctTgwVpn) {
      this.crossAccountTgwRoutesRole = this.createCrossAccountTgwRoutesRole();
    }
  }

  /**
   * Create VPN connection resources
   * @param props
   */
  private createVpnConnectionResources(
    props: AcceleratorStackProps,
    customResourceHandler?: cdk.aws_lambda.IFunction,
  ): Map<string, string>[] {
    const cgwMap = new Map<string, string>();
    const vpnMap = new Map<string, string>();
    //
    // Generate Customer Gateways
    //
    for (const cgwItem of props.networkConfig.customerGateways ?? []) {
      const accountId = props.accountsConfig.getAccountId(cgwItem.account);
      if (this.stack.isTargetStack([accountId], [cgwItem.region]) && isIpv4(cgwItem.ipAddress)) {
        this.stack.addLogs(LogLevel.INFO, `Add Customer Gateway ${cgwItem.name} in ${cgwItem.region}`);
        const cgw = new CustomerGateway(this.stack, pascalCase(`${cgwItem.name}CustomerGateway`), {
          name: cgwItem.name,
          bgpAsn: cgwItem.asn,
          ipAddress: cgwItem.ipAddress,
          tags: cgwItem.tags,
        });
        cgwMap.set(cgwItem.name, cgw.customerGatewayId);

        this.stack.addSsmParameter({
          logicalId: pascalCase(`SsmParam${cgwItem.name}CustomerGateway`),
          parameterName: this.stack.getSsmPath(SsmResourceType.CGW, [cgwItem.name]),
          stringValue: cgw.customerGatewayId,
        });

        for (const vpnItem of cgwItem.vpnConnections ?? []) {
          // Make sure that VPN Connections are created for TGWs in this stack only.
          if (vpnItem.transitGateway) {
            const vpn = this.createVpnConnection(cgw, cgwItem, vpnItem, customResourceHandler);
            vpnMap.set(vpnItem.name, vpn.vpnConnectionId);
          }
        }
      }
    }
    return [cgwMap, vpnMap];
  }

  /**
   * Create VPN connection item
   * @param cgw CustomerGateway
   * @param cgwItem CustomerGatewayConfig
   * @param vpnConnectItem VpnConnectionConfig
   * @param customResourceHandler cdk.aws_lambda.IFunction | undefined
   */
  private createVpnConnection(
    cgw: CustomerGateway,
    cgwItem: CustomerGatewayConfig,
    vpnItem: VpnConnectionConfig,
    customResourceHandler?: cdk.aws_lambda.IFunction,
  ): VpnConnection {
    // Get the Transit Gateway ID
    const transitGatewayId = getTransitGatewayId(this.transitGatewayMap, vpnItem.transitGateway!);

    this.stack.addLogs(
      LogLevel.INFO,
      `Attaching Customer Gateway ${cgwItem.name} to ${vpnItem.transitGateway} in ${cgwItem.region}`,
    );
    const vpnConnection = new VpnConnection(
      this.stack,
      pascalCase(`${vpnItem.name}VpnConnection`),
      this.stack.setVpnProps({
        vpnItem,
        customerGatewayId: cgw.customerGatewayId,
        customResourceHandler,
        transitGatewayId,
      }),
    );

    this.stack.addSsmParameter({
      logicalId: pascalCase(`SsmParam${vpnItem.name}VpnConnection`),
      parameterName: this.stack.getSsmPath(SsmResourceType.TGW_VPN, [vpnItem.name]),
      stringValue: vpnConnection.vpnConnectionId,
    });

    return vpnConnection;
  }

  /**
   * Returns true in the home region if there are CGWs referencing a firewall instance deployed to a different account
   * than the CGW's target account
   * @param props AcceleratorStackProps
   * @returns boolean[]
   */
  private hasCrossAccountVpn(props: AcceleratorStackProps): boolean[] {
    let [hasCrossAcctVpn, hasCrossAcctTgwVpn] = [false, false];

    for (const cgw of props.networkConfig.customerGateways ?? []) {
      const cgwAccountId = props.accountsConfig.getAccountId(cgw.account);
      if (
        this.stack.isTargetStack([cgwAccountId], [props.globalConfig.homeRegion]) &&
        !isIpv4(cgw.ipAddress) &&
        !this.firewallVpcInAccount(cgw, props)
      ) {
        hasCrossAcctVpn = true;
        //
        // Check if the CGW has VPNs to a transit gateway
        if (cgw.vpnConnections?.find(vpn => vpn.transitGateway)) {
          hasCrossAcctTgwVpn = true;
        }
      }
    }
    return [hasCrossAcctVpn, hasCrossAcctTgwVpn];
  }

  /**
   * Returns a boolean indicating if the VPC a given firewall is deployed to
   * is in the same account as the customer gateway
   * @param customerGateway CustomerGatewayConfig
   * @returns boolean
   */
  private firewallVpcInAccount(customerGateway: CustomerGatewayConfig, props: AcceleratorStackProps): boolean {
    const cgwAccountId = props.accountsConfig.getAccountId(customerGateway.account);
    const firewallVpcConfig = this.stack.getFirewallVpcConfig(customerGateway);
    const vpcAccountIds = this.stack.getVpcAccountIds(firewallVpcConfig);

    return vpcAccountIds.includes(cgwAccountId);
  }

  /**
   * Create cross-account CGW role to allow CGW CRUD operations
   * @returns cdk.aws_iam.Role
   */
  private createCrossAccountCgwRole(): cdk.aws_iam.Role {
    const managedCgwPolicy = new cdk.aws_iam.ManagedPolicy(this.stack, 'CrossAccountCgwPolicy', {
      statements: [
        new cdk.aws_iam.PolicyStatement({
          sid: 'CGWCRUD',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['ec2:CreateCustomerGateway', 'ec2:CreateTags', 'ec2:DeleteCustomerGateway', 'ec2:DeleteTags'],
          resources: ['*'],
        }),
      ],
    });
    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission
    // rule suppression with evidence for this permission.
    this.stack.addNagSuppression({
      id: NagSuppressionRuleIds.IAM5,
      details: [
        {
          path: managedCgwPolicy.node.path,
          reason: 'Cross account policy allows access for CGW CRUD operations',
        },
      ],
    });

    const crossAccountCgwRole = new cdk.aws_iam.Role(this.stack, 'CrossAccountCgwRole', {
      assumedBy: this.stack.getOrgPrincipals(this.stack.organizationId, true),
      managedPolicies: [managedCgwPolicy],
      roleName: this.stack.acceleratorResourceNames.roles.crossAccountCustomerGatewayRoleName,
    });
    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    // rule suppression with evidence for this permission.
    this.stack.addNagSuppression({
      id: NagSuppressionRuleIds.IAM4,
      details: [
        {
          path: crossAccountCgwRole.node.path,
          reason: 'IAM Role for lambda needs AWS managed policy',
        },
      ],
    });
    return crossAccountCgwRole;
  }

  /**
   * Create cross-account CloudWatch Logs role
   * @returns cdk.aws_iam.Role
   */
  private createCrossAccountLogsRole(): cdk.aws_iam.Role {
    const managedLogsPolicy = new cdk.aws_iam.ManagedPolicy(this.stack, 'CrossAccountLogsPolicy', {
      statements: [
        new cdk.aws_iam.PolicyStatement({
          sid: 'LogsList',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['kms:DescribeKey', 'kms:ListKeys', 'logs:DescribeLogGroups'],
          resources: ['*'],
        }),
        new cdk.aws_iam.PolicyStatement({
          sid: 'LogsCRUD',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['logs:AssociateKmsKey', 'logs:CreateLogGroup', 'logs:DeleteLogGroup', 'logs:PutRetentionPolicy'],
          resources: [
            `arn:${this.stack.partition}:logs:*:${this.stack.account}:log-group:${this.stack.acceleratorPrefix}*`,
          ],
        }),
      ],
    });
    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission
    // rule suppression with evidence for this permission.
    this.stack.addNagSuppression({
      id: NagSuppressionRuleIds.IAM5,
      details: [
        {
          path: managedLogsPolicy.node.path,
          reason: 'Cross account policy allows access for Logs CRUD operations',
        },
      ],
    });

    const crossAccountLogsRole = new cdk.aws_iam.Role(this.stack, 'CrossAccountLogsRole', {
      assumedBy: this.stack.getOrgPrincipals(this.stack.organizationId, true),
      managedPolicies: [managedLogsPolicy],
      roleName: this.stack.acceleratorResourceNames.roles.crossAccountLogsRoleName,
    });
    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    // rule suppression with evidence for this permission.
    this.stack.addNagSuppression({
      id: NagSuppressionRuleIds.IAM4,
      details: [
        {
          path: crossAccountLogsRole.node.path,
          reason: 'IAM Role for lambda needs AWS managed policy',
        },
      ],
    });
    return crossAccountLogsRole;
  }

  /**
   * Create cross-account VPN role
   * @returns cdk.aws_iam.Role
   */
  private createCrossAccountVpnRole(): cdk.aws_iam.Role {
    const managedVpnPolicy = new cdk.aws_iam.ManagedPolicy(this.stack, 'CrossAccountVpnPolicy', {
      statements: [
        new cdk.aws_iam.PolicyStatement({
          sid: 'S2SVPNCRUD',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: [
            'ec2:CreateTags',
            'ec2:CreateVpnConnection',
            'ec2:DeleteTags',
            'ec2:DeleteVpnConnection',
            'ec2:DescribeVpnConnections',
            'ec2:ModifyVpnConnectionOptions',
            'ec2:ModifyVpnTunnelOptions',
          ],
          resources: ['*'],
        }),
        new cdk.aws_iam.PolicyStatement({
          sid: 'LogDeliveryCRUD',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: [
            'logs:CreateLogDelivery',
            'logs:GetLogDelivery',
            'logs:UpdateLogDelivery',
            'logs:DeleteLogDelivery',
            'logs:ListLogDeliveries',
          ],
          resources: ['*'],
        }),
        new cdk.aws_iam.PolicyStatement({
          sid: 'S2SVPNLoggingCWL',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['logs:PutResourcePolicy', 'logs:DescribeResourcePolicies', 'logs:DescribeLogGroups'],
          resources: ['*'],
        }),
        new cdk.aws_iam.PolicyStatement({
          sid: 'SecretsManagerReadOnly',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['secretsmanager:GetSecretValue', 'kms:Decrypt'],
          resources: ['*'],
        }),
      ],
    });
    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission
    // rule suppression with evidence for this permission.
    this.stack.addNagSuppression({
      id: NagSuppressionRuleIds.IAM5,
      details: [
        {
          path: managedVpnPolicy.node.path,
          reason: 'Cross account policy allows access for VPN CRUD operations',
        },
      ],
    });
    const crossAccountVpnRole = new cdk.aws_iam.Role(this.stack, 'CrossAccountVpnRole', {
      assumedBy: this.stack.getOrgPrincipals(this.stack.organizationId, true),
      managedPolicies: [managedVpnPolicy],
      roleName: this.stack.acceleratorResourceNames.roles.crossAccountVpnRoleName,
    });
    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    // rule suppression with evidence for this permission.
    this.stack.addNagSuppression({
      id: NagSuppressionRuleIds.IAM4,
      details: [
        {
          path: crossAccountVpnRole.node.path,
          reason: 'IAM Role for lambda needs AWS managed policy',
        },
      ],
    });
    return crossAccountVpnRole;
  }

  /**
   * Create cross-account TGW routes role
   * @returns cdk.aws_iam.Role
   */
  private createCrossAccountTgwRoutesRole(): cdk.aws_iam.Role {
    const managedTgwRoutesPolicy = new cdk.aws_iam.ManagedPolicy(this.stack, 'CrossAccountTgwRoutesPolicy', {
      statements: [
        new cdk.aws_iam.PolicyStatement({
          sid: 'TGWRouteCRUD',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: [
            'ec2:AssociateTransitGatewayRouteTable',
            'ec2:CreateTransitGatewayRoute',
            'ec2:CreateTransitGatewayPrefixListReference',
            'ec2:DeleteTransitGatewayPrefixListReference',
            'ec2:DeleteTransitGatewayRoute',
            'ec2:DescribeTransitGatewayAttachments',
            'ec2:DescribeVpnConnections',
            'ec2:DisableTransitGatewayRouteTablePropagation',
            'ec2:DisassociateTransitGatewayRouteTable',
            'ec2:EnableTransitGatewayRouteTablePropagation',
            'ec2:ModifyTransitGatewayPrefixListReference',
          ],
          resources: ['*'],
        }),
      ],
    });
    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission
    // rule suppression with evidence for this permission.
    this.stack.addNagSuppression({
      id: NagSuppressionRuleIds.IAM5,
      details: [
        {
          path: managedTgwRoutesPolicy.node.path,
          reason: 'Cross account policy allows access for TGW route CRUD operations',
        },
      ],
    });
    const crossAccountTgwRoutesRole = new cdk.aws_iam.Role(this.stack, 'CrossAccountTgwRoutesRole', {
      assumedBy: this.stack.getOrgPrincipals(this.stack.organizationId, true),
      managedPolicies: [managedTgwRoutesPolicy],
      roleName: this.stack.acceleratorResourceNames.roles.crossAccountTgwRouteRoleName,
    });
    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    // rule suppression with evidence for this permission.
    this.stack.addNagSuppression({
      id: NagSuppressionRuleIds.IAM4,
      details: [
        {
          path: crossAccountTgwRoutesRole.node.path,
          reason: 'IAM Role for lambda needs AWS managed policy',
        },
      ],
    });
    return crossAccountTgwRoutesRole;
  }
}
