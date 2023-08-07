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

import { CustomerGatewayConfig, VpnConnectionConfig } from '@aws-accelerator/config';
import { CustomerGateway, LzaLambda, VpnConnection } from '@aws-accelerator/constructs';
import { SsmResourceType } from '@aws-accelerator/utils';
import * as cdk from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import { pascalCase } from 'pascal-case';
import { AcceleratorStackProps } from '../../accelerator-stack';
import { LogLevel } from '../network-stack';
import { getTransitGatewayId } from '../utils/getter-utils';
import { NetworkPrepStack } from './network-prep-stack';

export class VpnResources {
  public readonly cgwMap: Map<string, string>;
  public readonly vpnMap: Map<string, string>;
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
    const customResourceHandler = this.stack.containsAdvancedVpn ? this.createVpnOnEventHandler() : undefined;
    [this.cgwMap, this.vpnMap] = this.createVpnConnectionResources(props, customResourceHandler);
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
      if (this.stack.isTargetStack([accountId], [cgwItem.region])) {
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
   * Creates a custom resource onEventHandler for VPN connections
   * requiring advanced configuration parameters
   * @param props AcceleratorStackProps
   * @returns cdk.aws_lambda.IFunction
   */
  private createVpnOnEventHandler(): cdk.aws_lambda.IFunction {
    const lambdaExecutionPolicy = cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
      'service-role/AWSLambdaBasicExecutionRole',
    );

    const managedVpnPolicy = new cdk.aws_iam.ManagedPolicy(this.stack, 'VpnOnEventHandlerPolicy', {
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
    NagSuppressions.addResourceSuppressions(managedVpnPolicy, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'Managed policy allows access for VPN CRUD operations',
      },
    ]);
    //
    // Create event handler role
    const vpnRole = new cdk.aws_iam.Role(this.stack, 'VpnRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal(`lambda.${this.stack.urlSuffix}`),
      description: 'Landing Zone Accelerator site-to-site VPN custom resource access role',
      managedPolicies: [managedVpnPolicy, lambdaExecutionPolicy],
    });
    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    // rule suppression with evidence for this permission.
    NagSuppressions.addResourceSuppressions(vpnRole, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'IAM Role for lambda needs AWS managed policy',
      },
    ]);
    //
    // Create Lambda handler
    return new LzaLambda(this.stack, 'VpnOnEventHandler', {
      assetPath: '../constructs/lib/aws-ec2/custom-vpn-connection/dist',
      environmentEncryptionKmsKey: this.stack.lambdaKey,
      cloudWatchLogKmsKey: this.stack.cloudwatchKey,
      cloudWatchLogRetentionInDays: this.stack.logRetention,
      description: 'Custom resource onEvent handler for site-to-site VPN',
      functionName: `${this.stack.acceleratorPrefix}-${this.stack.account}-VpnOnEventHandler`,
      role: vpnRole,
      timeOut: cdk.Duration.minutes(15),
      nagSuppressionPrefix: 'VpnOnEventHandler',
    }).resource;
  }
}
