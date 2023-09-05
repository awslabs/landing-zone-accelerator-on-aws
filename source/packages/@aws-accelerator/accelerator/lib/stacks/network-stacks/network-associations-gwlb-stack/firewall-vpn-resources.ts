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
import {
  CustomerGateway,
  FirewallInstance,
  FirewallVpnProps,
  LzaLambda,
  VpnConnection,
} from '@aws-accelerator/constructs';
import { SsmResourceType } from '@aws-accelerator/utils';
import * as cdk from 'aws-cdk-lib';
import { pascalCase } from 'pascal-case';
import { AcceleratorStackProps, NagSuppressionRuleIds } from '../../accelerator-stack';
import { getTgwConfig, getVpcConfig } from '../utils/getter-utils';
import { hasAdvancedVpnOptions, isIpv4 } from '../utils/validation-utils';
import { NetworkAssociationsGwlbStack } from './network-associations-gwlb-stack';

export class FirewallVpnResources {
  public readonly cgwMap: Map<string, string>;
  public readonly vpnMap: Map<string, string>;
  private stack: NetworkAssociationsGwlbStack;

  constructor(
    networkAssociationsGwlbStack: NetworkAssociationsGwlbStack,
    props: AcceleratorStackProps,
    instanceMap: Map<string, FirewallInstance>,
  ) {
    this.stack = networkAssociationsGwlbStack;

    //
    // Filter customer gateways to those in scope
    const customerGatewaysInScope = this.setCgwsInScope(props, instanceMap);
    //
    // Create the custom resource handlers if needed
    const requiresCrossAccountVpn = this.requiresCrossAccountVpn(props, customerGatewaysInScope);
    const hasAdvancedFirewallVpn = this.hasAdvancedFirewallVpn(customerGatewaysInScope);
    const cgwCustomResourceHandler = requiresCrossAccountVpn ? this.createCgwOnEventHandler() : undefined;
    const vpnCustomResourceHandler =
      requiresCrossAccountVpn || hasAdvancedFirewallVpn ? this.stack.createVpnOnEventHandler() : undefined;
    //
    // Create customer gateways
    [this.cgwMap, this.vpnMap] = this.createCustomerGateways(
      customerGatewaysInScope,
      instanceMap,
      props,
      cgwCustomResourceHandler,
      vpnCustomResourceHandler,
    );
  }

  /**
   * Set customer gateways referencing firewall instances
   * that exist in this stack context
   * @param props AcceleratorStackProps
   * @param instanceMap Map<string, FirewallInstance>
   * @returns CustomerGatewayConfig[]
   */
  private setCgwsInScope(
    props: AcceleratorStackProps,
    instanceMap: Map<string, FirewallInstance>,
  ): CustomerGatewayConfig[] {
    const customerGatewaysInScope: CustomerGatewayConfig[] = [];
    for (const cgw of props.networkConfig.customerGateways ?? []) {
      if (!isIpv4(cgw.ipAddress) && this.cgwInScope(cgw, instanceMap)) {
        customerGatewaysInScope.push(cgw);
      }
    }
    return customerGatewaysInScope;
  }

  /**
   * Determines if a cross-account VPN exists in the stack context
   * @param props AcceleratorStackProps
   * @param customerGateways CustomerGatewayConfig[]
   * @returns boolean
   */
  private requiresCrossAccountVpn(props: AcceleratorStackProps, customerGateways: CustomerGatewayConfig[]): boolean {
    for (const cgw of customerGateways) {
      const cgwAccountId = props.accountsConfig.getAccountId(cgw.account);
      if (!this.stack.isTargetStack([cgwAccountId], [cgw.region])) {
        return true;
      }
    }
    return false;
  }

  /**
   * Determines if a firewall VPN exists that requires advanced VPN options
   * @param customerGateways CustomerGatewayConfig[]
   * @returns boolean
   */
  private hasAdvancedFirewallVpn(customerGateways: CustomerGatewayConfig[]) {
    for (const cgw of customerGateways) {
      for (const vpnItem of cgw.vpnConnections ?? []) {
        if (hasAdvancedVpnOptions(vpnItem)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Returns true if the firewall instance referenced in a customer gateway `ipAddress` property
   * is in scope of the stack context
   * @param customerGateway CustomerGatewayConfig
   * @param instanceMap Map<string, FirewallInstance>
   * @returns boolean
   */
  private cgwInScope(customerGateway: CustomerGatewayConfig, instanceMap: Map<string, FirewallInstance>): boolean {
    return instanceMap.has(this.parseFirewallName(customerGateway.ipAddress));
  }

  /**
   * Returns a FirewallInstance object if the firewall instance referenced in a customer gateway
   * is in scope of the stack context
   * @param customerGateway CustomerGatewayConfig
   * @param instanceMap Map<string, FirewallInstance>
   * @returns FirewallInstance
   */
  private getFirewallInstance(
    customerGateway: CustomerGatewayConfig,
    instanceMap: Map<string, FirewallInstance>,
  ): FirewallInstance {
    const instance = instanceMap.get(this.parseFirewallName(customerGateway.ipAddress));
    if (!instance) {
      throw new Error(
        `Unable to find firewall instance referenced in customer gateway reference variable "${customerGateway.ipAddress}"`,
      );
    }
    return instance;
  }

  /**
   * Returns the name of the firewall instance referenced in a customer gateway `ipAddress`
   * property.
   *
   * Example variable syntax: `${ACCEL_LOOKUP::EC2:ENI_0:accelerator-firewall}`
   * @param firewallReference
   * @returns string
   */
  private parseFirewallName(firewallReference: string): string {
    try {
      return firewallReference.split(':')[4].replace('}', '');
    } catch (e) {
      throw new Error(`Unable to parse firewall name from provided reference variable "${firewallReference}". ${e}`);
    }
  }

  /**
   * Create the CGW custom resource handler
   * @returns cdk.aws_lambda.IFunction
   */
  private createCgwOnEventHandler(): cdk.aws_lambda.IFunction {
    const lambdaExecutionPolicy = cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
      'service-role/AWSLambdaBasicExecutionRole',
    );

    const managedCgwPolicy = new cdk.aws_iam.ManagedPolicy(this.stack, 'CgwOnEventHandlerPolicy', {
      statements: [
        new cdk.aws_iam.PolicyStatement({
          sid: 'CGWAssumeRole',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['sts:AssumeRole'],
          resources: [
            `arn:${this.stack.partition}:iam::*:role/${this.stack.acceleratorResourceNames.roles.crossAccountCustomerGatewayRoleName}`,
          ],
        }),
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
          reason: 'Managed policy allows access for CGW CRUD operations',
        },
      ],
    });
    //
    // Create event handler role
    const cgwRole = new cdk.aws_iam.Role(this.stack, 'CgwRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal(`lambda.${this.stack.urlSuffix}`),
      description: 'Landing Zone Accelerator site-to-site VPN customer gateway access role',
      managedPolicies: [managedCgwPolicy, lambdaExecutionPolicy],
    });
    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    // rule suppression with evidence for this permission.
    this.stack.addNagSuppression({
      id: NagSuppressionRuleIds.IAM4,
      details: [
        {
          path: cgwRole.node.path,
          reason: 'IAM Role for lambda needs AWS managed policy',
        },
      ],
    });
    //
    // Create Lambda handler
    return new LzaLambda(this.stack, 'CgwOnEventHandler', {
      assetPath: '../constructs/lib/aws-ec2/cross-account-customer-gateway/dist',
      environmentEncryptionKmsKey: this.stack.lambdaKey,
      cloudWatchLogKmsKey: this.stack.cloudwatchKey,
      cloudWatchLogRetentionInDays: this.stack.logRetention,
      description: 'Custom resource onEvent handler for site-to-site VPN customer gateways',
      role: cgwRole,
      timeOut: cdk.Duration.seconds(30),
      nagSuppressionPrefix: 'CgwOnEventHandler',
    }).resource;
  }

  /**
   * Returns the referenced firewall instance public IP address
   * @param firewallInstance FirewallInstance
   * @param firewallReference string
   * @returns string
   */
  private getFirewallInstanceIpAddress(firewallInstance: FirewallInstance, firewallReference: string): string {
    try {
      const deviceIndex = Number(firewallReference.split(':')[3].split('_')[1]);
      return firewallInstance.getPublicIpAddress(deviceIndex);
    } catch (e) {
      throw new Error(`Unable to parse firewall reference variable "${firewallReference}". ${e}`);
    }
  }

  /**
   * Create customer gateways and VPN connections for a firewall instance
   * @param customerGateways CustomerGatewayConfig[]
   * @param instanceMap Map<string, FirewallInstance>
   * @param props AcceleratorStackProps
   * @param cgwCustomResourceHandler cdk.aws_lambda.IFunction | undefined
   * @param vpnCustomResourceHandler cdk.aws_lambda.IFunction | undefined
   * @returns Map<string, string>[]
   */
  private createCustomerGateways(
    customerGateways: CustomerGatewayConfig[],
    instanceMap: Map<string, FirewallInstance>,
    props: AcceleratorStackProps,
    cgwCustomResourceHandler?: cdk.aws_lambda.IFunction,
    vpnCustomResourceHandler?: cdk.aws_lambda.IFunction,
  ): Map<string, string>[] {
    const cgwMap = new Map<string, string>();
    const vpnMap = new Map<string, string>();

    for (const cgwItem of customerGateways) {
      //
      // Set custom resource props, if required
      const cgwAccountId = props.accountsConfig.getAccountId(cgwItem.account);
      const requiresCrossAccountVpn = this.requiresCrossAccountVpn(props, [cgwItem]);
      const cgwCustomResourceProps = requiresCrossAccountVpn
        ? {
            customResourceHandler: cgwCustomResourceHandler,
            owningAccountId: cgwAccountId !== this.stack.account ? cgwAccountId : undefined,
            owningRegion: cgwItem.region !== this.stack.region ? cgwItem.region : undefined,
            roleName: this.stack.acceleratorResourceNames.roles.crossAccountCustomerGatewayRoleName,
          }
        : {};
      //
      // Get firewall instance from map
      const firewallInstance = this.getFirewallInstance(cgwItem, instanceMap);
      const firewallIpAddress = this.getFirewallInstanceIpAddress(firewallInstance, cgwItem.ipAddress);
      //
      // Create customer gateway
      const cgw = new CustomerGateway(this.stack, pascalCase(`${cgwItem.name}CustomerGateway`), {
        name: cgwItem.name,
        bgpAsn: cgwItem.asn,
        ipAddress: firewallIpAddress,
        tags: cgwItem.tags,
        ...cgwCustomResourceProps,
      });
      cgwMap.set(cgwItem.name, cgw.customerGatewayId);
      //
      // Create VPN connections
      for (const vpnItem of cgwItem.vpnConnections ?? []) {
        const vpn = this.createVpnConnection(
          vpnItem,
          cgw,
          cgwAccountId,
          cgwItem.region,
          firewallInstance,
          requiresCrossAccountVpn,
          vpnCustomResourceHandler,
        );
        vpnMap.set(vpnItem.name, vpn.vpnConnectionId);
      }
    }
    return [cgwMap, vpnMap];
  }

  /**
   * Create a VPN connection
   * @param vpnItem VpnConnectionConfig
   * @param cgw CustomerGateway
   * @param cgwAccountId string
   * @param cgwRegion string
   * @param firewallInstance FirewallInstance
   * @param requiresCrossAccountVpn boolean
   * @param vpnCustomResourceHandler cdk.aws_lambda.IFunction | undefined
   * @returns VpnConnection
   */
  private createVpnConnection(
    vpnItem: VpnConnectionConfig,
    cgw: CustomerGateway,
    cgwAccountId: string,
    cgwRegion: string,
    firewallInstance: FirewallInstance,
    requiresCrossAccountVpn: boolean,
    vpnCustomResourceHandler?: cdk.aws_lambda.IFunction,
  ): VpnConnection {
    //
    // Get TGW or VGW ID
    const transitGatewayId = vpnItem.transitGateway
      ? cdk.aws_ssm.StringParameter.valueForStringParameter(
          this.stack,
          this.stack.getSsmPath(SsmResourceType.TGW, [vpnItem.transitGateway]),
        )
      : undefined;
    const virtualPrivateGateway = vpnItem.vpc
      ? cdk.aws_ssm.StringParameter.valueForStringParameter(
          this.stack,
          this.stack.getSsmPath(SsmResourceType.VPN_GW, [vpnItem.vpc]),
        )
      : undefined;
    //
    // Set cross-account resource props, if required
    const vpnCustomResourceProps =
      hasAdvancedVpnOptions(vpnItem) || requiresCrossAccountVpn
        ? {
            customResourceHandler: vpnCustomResourceHandler,
            owningAccountId: cgwAccountId !== this.stack.account ? cgwAccountId : undefined,
            owningRegion: cgwRegion !== this.stack.region ? cgwRegion : undefined,
          }
        : {};

    const vpn = new VpnConnection(
      this.stack,
      pascalCase(`${vpnItem.name}VpnConnection`),
      this.stack.setVpnProps({
        vpnItem,
        customerGatewayId: cgw.customerGatewayId,
        transitGatewayId,
        virtualPrivateGateway,
        ...vpnCustomResourceProps,
      }),
    );
    //
    // Add dependency to firewall instance.
    // We want the VPN to be created first so that
    // we can retrieve the VPN details when we perform
    // userdata replacements
    firewallInstance.ec2Instance.node.addDependency(vpn);
    firewallInstance.vpnConnections.push(this.processVpnConnectionDetails(vpn, vpnItem, cgw, cgwAccountId, cgwRegion));
    return vpn;
  }

  /**
   * Process firewall VPN connection details
   * @param vpn VpnConnection
   * @param vpnItem VpnConnectionConfig
   * @param cgw CustomerGateway
   * @param cgwAccountId string
   * @param cgwRegion string
   * @returns FirewallVpnProps
   */
  private processVpnConnectionDetails(
    vpn: VpnConnection,
    vpnItem: VpnConnectionConfig,
    cgw: CustomerGateway,
    cgwAccountId: string,
    cgwRegion: string,
  ): FirewallVpnProps {
    const tgwConfig = vpnItem.transitGateway
      ? getTgwConfig(this.stack.networkConfig.transitGateways, vpnItem.transitGateway)
      : undefined;
    const vpcConfig = vpnItem.vpc ? getVpcConfig(this.stack.vpcResources, vpnItem.vpc) : undefined;
    let awsBgpAsn: number;

    if (tgwConfig) {
      awsBgpAsn = tgwConfig.asn;
    } else if (vpcConfig) {
      if (!vpcConfig.virtualPrivateGateway?.asn) {
        throw new Error(`No ASN defined for VPC "${vpcConfig.name}" virtual private gateway`);
      }
      awsBgpAsn = vpcConfig.virtualPrivateGateway.asn;
    } else {
      awsBgpAsn = 65000;
    }

    return {
      name: vpnItem.name,
      awsBgpAsn,
      cgwBgpAsn: cgw.bgpAsn,
      cgwOutsideIp: cgw.ipAddress,
      id: vpn.vpnConnectionId,
      owningAccountId: cgwAccountId !== this.stack.account ? cgwAccountId : undefined,
      owningRegion: cgwRegion !== this.stack.region ? cgwRegion : undefined,
    };
  }
}
