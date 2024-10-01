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

import {
  CustomerGatewayConfig,
  TransitGatewayConfig,
  TransitGatewayRouteEntryConfig,
  TransitGatewayRouteTableConfig,
  TransitGatewayRouteTableVpnEntryConfig,
  VpnConnectionConfig,
  isNetworkType,
} from '@aws-accelerator/config';
import {
  CustomerGateway,
  FirewallInstance,
  FirewallVpnProps,
  LzaLambda,
  TransitGatewayAttachment,
  TransitGatewayAttachmentType,
  TransitGatewayPrefixListReference,
  TransitGatewayRouteTableAssociation,
  TransitGatewayRouteTablePropagation,
  TransitGatewayStaticRoute,
  VpnConnection,
} from '@aws-accelerator/constructs';
import { SsmResourceType } from '@aws-accelerator/utils/lib/ssm-parameter-path';
import * as cdk from 'aws-cdk-lib';
import { pascalCase } from 'pascal-case';
import { AcceleratorStackProps, NagSuppressionRuleIds } from '../../accelerator-stack';
import { LogLevel } from '../network-stack';
import {
  getCustomerGatewayName,
  getTgwConfig,
  getTgwVpnConnection,
  getVpcConfig,
  getVpnAttachmentId,
} from '../utils/getter-utils';
import { hasAdvancedVpnOptions, isIpv4 } from '../utils/validation-utils';
import { NetworkAssociationsGwlbStack } from './network-associations-gwlb-stack';

export class FirewallVpnResources {
  public readonly cgwMap: Map<string, string>;
  public readonly vpnMap: Map<string, VpnConnection>;
  public readonly vpnAttachmentMap: Map<string, string>;
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
    const hasCrossAccountTgwVpns = this.hasCrossAccountTgwVpns(props, customerGatewaysInScope);
    const cgwCustomResourceHandler = requiresCrossAccountVpn ? this.createCgwOnEventHandler() : undefined;
    const vpnCustomResourceHandler =
      requiresCrossAccountVpn || hasAdvancedFirewallVpn ? this.stack.createVpnOnEventHandler() : undefined;
    const [
      tgwAssociationCustomResourceHandler,
      tgwPropagationCustomResourceHandler,
      tgwStaticRouteCustomResourceHandler,
    ] = hasCrossAccountTgwVpns ? this.createTgwRouteResourceHandlers() : [undefined, undefined, undefined];
    //
    // Create customer gateways
    [this.cgwMap, this.vpnMap] = this.createCustomerGateways(
      customerGatewaysInScope,
      instanceMap,
      props,
      cgwCustomResourceHandler,
      vpnCustomResourceHandler,
    );
    //
    // Create TGW VPN associations/propagations
    this.vpnAttachmentMap = this.setVpnAttachmentMap(props, customerGatewaysInScope);
    this.createTgwAssociationsAndPropagations(
      props,
      customerGatewaysInScope,
      tgwAssociationCustomResourceHandler,
      tgwPropagationCustomResourceHandler,
    );
    //
    // Create TGW VPN static routes
    this.createTgwStaticRoutes(props, customerGatewaysInScope, tgwStaticRouteCustomResourceHandler);
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
   * Returns true if there are transit gateway VPNs attached to the CGWs in scope
   * @param customerGateways CustomerGatewayConfig[]
   * @returns boolean
   */
  private hasCrossAccountTgwVpns(props: AcceleratorStackProps, customerGateways: CustomerGatewayConfig[]): boolean {
    for (const cgw of customerGateways) {
      for (const vpnItem of cgw.vpnConnections ?? []) {
        if (vpnItem.transitGateway && this.requiresCrossAccountVpn(props, [cgw])) {
          return true;
        }
      }
    }
    return false;
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
      assumedBy: new cdk.aws_iam.ServicePrincipal(`lambda.amazonaws.com`),
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
  ): [Map<string, string>, Map<string, VpnConnection>] {
    const cgwMap = new Map<string, string>();
    const vpnMap = new Map<string, VpnConnection>();

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
      this.stack.addLogs(
        LogLevel.INFO,
        `Creating customer gateway ${cgwItem.name} for EC2 firewall instance ${firewallInstance.name}`,
      );
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
        const vpnKey = vpnItem.transitGateway ? `${vpnItem.transitGateway}_${vpnItem.name}` : vpnItem.name;
        vpnMap.set(vpnKey, vpn);
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
      ? this.getTgwSsmParameter(cgw.name, vpnItem.transitGateway, requiresCrossAccountVpn)
      : undefined;
    const virtualPrivateGateway = vpnItem.vpc
      ? this.getVgwSsmParameter(cgw.name, vpnItem.vpc, requiresCrossAccountVpn)
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

    this.stack.addLogs(
      LogLevel.INFO,
      `Creating VPN connection ${vpnItem.name} to EC2 firewall instance ${firewallInstance.name}`,
    );
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
   * Returns the TGW SSM parameter value for the given TGW name
   * @param cgwName string
   * @param tgwName string
   * @param requiresCrossAccountVpn boolean
   * @returns string
   */
  private getTgwSsmParameter(cgwName: string, tgwName: string, requiresCrossAccountVpn: boolean): string {
    if (requiresCrossAccountVpn) {
      return cdk.aws_ssm.StringParameter.valueForStringParameter(
        this.stack,
        this.stack.getSsmPath(SsmResourceType.CROSS_ACCOUNT_TGW, [cgwName, tgwName]),
      );
    } else {
      return cdk.aws_ssm.StringParameter.valueForStringParameter(
        this.stack,
        this.stack.getSsmPath(SsmResourceType.TGW, [tgwName]),
      );
    }
  }

  /**
   * Returns the VGW SSM parameter value for the given VPC name
   * @param cgwName string
   * @param vpcName string
   * @param requiresCrossAccountVpn boolean
   * @returns string
   */
  private getVgwSsmParameter(cgwName: string, vpcName: string, requiresCrossAccountVpn: boolean): string {
    if (requiresCrossAccountVpn) {
      return cdk.aws_ssm.StringParameter.valueForStringParameter(
        this.stack,
        this.stack.getSsmPath(SsmResourceType.CROSS_ACCOUNT_VGW, [cgwName, vpcName]),
      );
    } else {
      return cdk.aws_ssm.StringParameter.valueForStringParameter(
        this.stack,
        this.stack.getSsmPath(SsmResourceType.VPN_GW, [vpcName]),
      );
    }
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

  /**
   * Create custom resource onEvent handlers for TGW routes and route table associations
   * @returns cdk.aws_lambda.IFunction[]
   */
  private createTgwRouteResourceHandlers(): cdk.aws_lambda.IFunction[] {
    return [
      this.createTgwAssociationOnEventHandler(),
      this.createTgwPropagationOnEventHandler(),
      this.createTgwStaticRouteOnEventHandler(),
    ];
  }

  /**
   * Create TGW association custom resource handler
   * @returns cdk.aws_lambda.IFunction
   */
  private createTgwAssociationOnEventHandler(): cdk.aws_lambda.IFunction {
    const lambdaExecutionPolicy = cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
      'service-role/AWSLambdaBasicExecutionRole',
    );

    const managedTgwAssociationPolicy = new cdk.aws_iam.ManagedPolicy(
      this.stack,
      'TgwAssociationOnEventHandlerPolicy',
      {
        statements: [
          new cdk.aws_iam.PolicyStatement({
            sid: 'TgwAssociationAssumeRole',
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['sts:AssumeRole'],
            resources: [
              `arn:${this.stack.partition}:iam::*:role/${this.stack.acceleratorResourceNames.roles.crossAccountTgwRouteRoleName}`,
            ],
          }),
          new cdk.aws_iam.PolicyStatement({
            sid: 'TgwAssociationCRUD',
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['ec2:AssociateTransitGatewayRouteTable', 'ec2:DisassociateTransitGatewayRouteTable'],
            resources: ['*'],
          }),
        ],
      },
    );
    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission
    // rule suppression with evidence for this permission.
    this.stack.addNagSuppression({
      id: NagSuppressionRuleIds.IAM5,
      details: [
        {
          path: managedTgwAssociationPolicy.node.path,
          reason: 'Managed policy allows access for TGW association CRUD operations',
        },
      ],
    });
    //
    // Create event handler role
    const tgwAssociationRole = new cdk.aws_iam.Role(this.stack, 'TgwAssociationRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal(`lambda.amazonaws.com`),
      description: 'Landing Zone Accelerator TGW route table association access role',
      managedPolicies: [managedTgwAssociationPolicy, lambdaExecutionPolicy],
    });
    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    // rule suppression with evidence for this permission.
    this.stack.addNagSuppression({
      id: NagSuppressionRuleIds.IAM4,
      details: [
        {
          path: tgwAssociationRole.node.path,
          reason: 'IAM Role for lambda needs AWS managed policy',
        },
      ],
    });
    //
    // Create Lambda handler
    return new LzaLambda(this.stack, 'TgwAssociationOnEventHandler', {
      assetPath: '../constructs/lib/aws-ec2/transit-gateway-association/dist',
      environmentEncryptionKmsKey: this.stack.lambdaKey,
      cloudWatchLogKmsKey: this.stack.cloudwatchKey,
      cloudWatchLogRetentionInDays: this.stack.logRetention,
      description: 'Custom resource onEvent handler for transit gateway route table associations',
      role: tgwAssociationRole,
      timeOut: cdk.Duration.seconds(15),
      nagSuppressionPrefix: 'TgwAssociationOnEventHandler',
    }).resource;
  }

  /**
   * Create TGW propagation custom resource handler
   * @returns cdk.aws_lambda.IFunction
   */
  private createTgwPropagationOnEventHandler(): cdk.aws_lambda.IFunction {
    const lambdaExecutionPolicy = cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
      'service-role/AWSLambdaBasicExecutionRole',
    );

    const managedTgwPropagationPolicy = new cdk.aws_iam.ManagedPolicy(
      this.stack,
      'TgwPropagationOnEventHandlerPolicy',
      {
        statements: [
          new cdk.aws_iam.PolicyStatement({
            sid: 'TgwPropagationAssumeRole',
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['sts:AssumeRole'],
            resources: [
              `arn:${this.stack.partition}:iam::*:role/${this.stack.acceleratorResourceNames.roles.crossAccountTgwRouteRoleName}`,
            ],
          }),
          new cdk.aws_iam.PolicyStatement({
            sid: 'TgwPropagationCRUD',
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: [
              'ec2:EnableTransitGatewayRouteTablePropagation',
              'ec2:DisableTransitGatewayRouteTablePropagation',
            ],
            resources: ['*'],
          }),
        ],
      },
    );
    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission
    // rule suppression with evidence for this permission.
    this.stack.addNagSuppression({
      id: NagSuppressionRuleIds.IAM5,
      details: [
        {
          path: managedTgwPropagationPolicy.node.path,
          reason: 'Managed policy allows access for TGW association CRUD operations',
        },
      ],
    });
    //
    // Create event handler role
    const tgwPropagationRole = new cdk.aws_iam.Role(this.stack, 'TgwPropagationRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal(`lambda.amazonaws.com`),
      description: 'Landing Zone Accelerator TGW route table propagation access role',
      managedPolicies: [managedTgwPropagationPolicy, lambdaExecutionPolicy],
    });
    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    // rule suppression with evidence for this permission.
    this.stack.addNagSuppression({
      id: NagSuppressionRuleIds.IAM4,
      details: [
        {
          path: tgwPropagationRole.node.path,
          reason: 'IAM Role for lambda needs AWS managed policy',
        },
      ],
    });
    //
    // Create Lambda handler
    return new LzaLambda(this.stack, 'TgwPropagationOnEventHandler', {
      assetPath: '../constructs/lib/aws-ec2/transit-gateway-propagation/dist',
      environmentEncryptionKmsKey: this.stack.lambdaKey,
      cloudWatchLogKmsKey: this.stack.cloudwatchKey,
      cloudWatchLogRetentionInDays: this.stack.logRetention,
      description: 'Custom resource onEvent handler for transit gateway route table propagations',
      role: tgwPropagationRole,
      timeOut: cdk.Duration.seconds(15),
      nagSuppressionPrefix: 'TgwPropagationOnEventHandler',
    }).resource;
  }

  /**
   * Create TGW static route custom resource handler
   * @returns cdk.aws_lambda.IFunction
   */
  private createTgwStaticRouteOnEventHandler(): cdk.aws_lambda.IFunction {
    const lambdaExecutionPolicy = cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
      'service-role/AWSLambdaBasicExecutionRole',
    );

    const managedTgwStaticRoutePolicy = new cdk.aws_iam.ManagedPolicy(
      this.stack,
      'TgwStaticRouteOnEventHandlerPolicy',
      {
        statements: [
          new cdk.aws_iam.PolicyStatement({
            sid: 'TgwStaticRouteAssumeRole',
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['sts:AssumeRole'],
            resources: [
              `arn:${this.stack.partition}:iam::*:role/${this.stack.acceleratorResourceNames.roles.crossAccountTgwRouteRoleName}`,
            ],
          }),
          new cdk.aws_iam.PolicyStatement({
            sid: 'TgwStaticRouteCRUD',
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['ec2:CreateTransitGatewayRoute', 'ec2:DeleteTransitGatewayRoute'],
            resources: ['*'],
          }),
        ],
      },
    );
    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission
    // rule suppression with evidence for this permission.
    this.stack.addNagSuppression({
      id: NagSuppressionRuleIds.IAM5,
      details: [
        {
          path: managedTgwStaticRoutePolicy.node.path,
          reason: 'Managed policy allows access for TGW static route CRUD operations',
        },
      ],
    });
    //
    // Create event handler role
    const tgwStaticRouteRole = new cdk.aws_iam.Role(this.stack, 'TgwStaticRouteRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal(`lambda.amazonaws.com`),
      description: 'Landing Zone Accelerator TGW static route access role',
      managedPolicies: [managedTgwStaticRoutePolicy, lambdaExecutionPolicy],
    });
    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    // rule suppression with evidence for this permission.
    this.stack.addNagSuppression({
      id: NagSuppressionRuleIds.IAM4,
      details: [
        {
          path: tgwStaticRouteRole.node.path,
          reason: 'IAM Role for lambda needs AWS managed policy',
        },
      ],
    });
    //
    // Create Lambda handler
    return new LzaLambda(this.stack, 'TgwStaticRouteOnEventHandler', {
      assetPath: '../constructs/lib/aws-ec2/cross-account-transit-gateway-route/dist',
      environmentEncryptionKmsKey: this.stack.lambdaKey,
      cloudWatchLogKmsKey: this.stack.cloudwatchKey,
      cloudWatchLogRetentionInDays: this.stack.logRetention,
      description: 'Custom resource onEvent handler for transit gateway static routes',
      role: tgwStaticRouteRole,
      timeOut: cdk.Duration.seconds(15),
      nagSuppressionPrefix: 'TgwStaticRouteOnEventHandler',
    }).resource;
  }

  /**
   * Set VPN attachment map for VPNs in scope
   * @param props AcceleratorStackProps
   * @param customerGateways CustomerGatewayConfig[]
   * @returns Map<string, string>
   */
  private setVpnAttachmentMap(
    props: AcceleratorStackProps,
    customerGateways: CustomerGatewayConfig[],
  ): Map<string, string> {
    const vpnAttachmentMap = new Map<string, string>();

    for (const cgw of customerGateways) {
      const cgwAccountId = props.accountsConfig.getAccountId(cgw.account);
      const requiresCrossAccountRoutes = this.requiresCrossAccountVpn(props, [cgw]);

      for (const vpnItem of cgw.vpnConnections ?? []) {
        if (vpnItem.transitGateway) {
          vpnAttachmentMap.set(
            `${vpnItem.transitGateway}_${vpnItem.name}`,
            this.lookupVpnAttachment(vpnItem, cgwAccountId, cgw, requiresCrossAccountRoutes),
          );
        }
      }
    }
    return vpnAttachmentMap;
  }

  /**
   * Lookup EC2 firewall TGW VPN attachments
   * @param vpnItem VpnConnectionConfig
   * @param cgwAccountId string
   * @param cgwRegion string
   * @param requiresCrossAccountRoutes boolean
   * @returns string
   */
  private lookupVpnAttachment(
    vpnItem: VpnConnectionConfig,
    cgwAccountId: string,
    cgw: CustomerGatewayConfig,
    requiresCrossAccountRoutes: boolean,
  ): string {
    //
    // Set VPN lookup custom resource props
    const crossAccountVpnOptions = requiresCrossAccountRoutes
      ? {
          owningAccountId: cgwAccountId !== this.stack.account ? cgwAccountId : undefined,
          owningRegion: cgw.region !== this.stack.region ? cgw.region : undefined,
          roleName: this.stack.acceleratorResourceNames.roles.crossAccountTgwRouteRoleName,
        }
      : {};
    //
    // Get TGW ID and VPN connection construct
    const tgwId = this.getTgwSsmParameter(cgw.name, vpnItem.transitGateway!, requiresCrossAccountRoutes);
    const vpn = getTgwVpnConnection(this.vpnMap, vpnItem.transitGateway!, vpnItem.name);
    //
    // Lookup VPN attachment
    const attachmentLookup = TransitGatewayAttachment.fromLookup(
      this.stack,
      pascalCase(`${vpnItem.name}VpnTransitGatewayAttachment`),
      {
        name: vpnItem.name,
        owningAccountId: cgwAccountId,
        transitGatewayId: tgwId,
        type: TransitGatewayAttachmentType.VPN,
        kmsKey: this.stack.cloudwatchKey,
        logRetentionInDays: this.stack.logRetention,
        crossAccountVpnOptions,
      },
    );
    // Set dependency on VPN connection
    attachmentLookup.node.addDependency(vpn);

    return attachmentLookup.transitGatewayAttachmentId;
  }

  /**
   * Create TGW route table associations and propagations
   * @param props AcceleratorStackProps
   * @param customerGateways CustomerGatewayConfig[]
   * @param tgwAssociationCustomResourceHandler cdk.aws_lambda.IFunction | undefined
   * @param tgwPropagationCustomResourceHandler cdk.aws_lambda.IFunction | undefined
   */
  private createTgwAssociationsAndPropagations(
    props: AcceleratorStackProps,
    customerGateways: CustomerGatewayConfig[],
    tgwAssociationCustomResourceHandler?: cdk.aws_lambda.IFunction,
    tgwPropagationCustomResourceHandler?: cdk.aws_lambda.IFunction,
  ) {
    for (const cgw of customerGateways) {
      const cgwAccountId = props.accountsConfig.getAccountId(cgw.account);
      const requiresCrossAccountRoutes = this.requiresCrossAccountVpn(props, [cgw]);

      for (const vpnItem of cgw.vpnConnections ?? []) {
        this.createTransitGatewayAssociations(
          vpnItem,
          cgwAccountId,
          cgw,
          requiresCrossAccountRoutes,
          tgwAssociationCustomResourceHandler,
        );
        this.createTransitGatewayPropagations(
          vpnItem,
          cgwAccountId,
          cgw,
          requiresCrossAccountRoutes,
          tgwPropagationCustomResourceHandler,
        );
      }
    }
  }

  /**
   * Returns the TGW route table SSM parameter value for the given route table name
   * @param cgwName string
   * @param tgwName string
   * @param routeTableName string
   * @param requiresCrossAccountRoutes boolean
   * @returns string
   */
  private getTgwRouteTableSsmParameter(
    cgwName: string,
    tgwName: string,
    routeTableName: string,
    requiresCrossAccountRoutes: boolean,
  ): string {
    if (requiresCrossAccountRoutes) {
      return cdk.aws_ssm.StringParameter.valueForStringParameter(
        this.stack,
        this.stack.getSsmPath(SsmResourceType.CROSS_ACCOUNT_TGW_ROUTE_TABLE, [cgwName, tgwName, routeTableName]),
      );
    } else {
      return cdk.aws_ssm.StringParameter.valueForStringParameter(
        this.stack,
        this.stack.getSsmPath(SsmResourceType.TGW_ROUTE_TABLE, [tgwName, routeTableName]),
      );
    }
  }

  /**
   * Create TGW route table associations
   * @param vpnItem VpnConnectionConfig
   * @param cgwAccountId string
   * @param cgw CustomerGatewayConfig
   * @param requiresCrossAccountRoutes boolean
   * @param tgwAssociationCustomResourceHandler cdk.aws_lambda.IFunction | undefined
   */
  private createTransitGatewayAssociations(
    vpnItem: VpnConnectionConfig,
    cgwAccountId: string,
    cgw: CustomerGatewayConfig,
    requiresCrossAccountRoutes: boolean,
    tgwAssociationCustomResourceHandler?: cdk.aws_lambda.IFunction,
  ) {
    for (const associationItem of vpnItem.routeTableAssociations ?? []) {
      //
      // Set custom resource props
      const customResourceProps = requiresCrossAccountRoutes
        ? {
            customResourceHandler: tgwAssociationCustomResourceHandler,
            owningAccountId: cgwAccountId !== this.stack.account ? cgwAccountId : undefined,
            owningRegion: cgw.region !== this.stack.region ? cgw.region : undefined,
            roleName: this.stack.acceleratorResourceNames.roles.crossAccountTgwRouteRoleName,
          }
        : {};
      //
      // Get TGW route table and attachment IDs
      const transitGatewayRouteTableId = this.getTgwRouteTableSsmParameter(
        cgw.name,
        vpnItem.transitGateway!,
        associationItem,
        requiresCrossAccountRoutes,
      );
      const transitGatewayAttachmentId = getVpnAttachmentId(
        this.vpnAttachmentMap,
        vpnItem.transitGateway!,
        vpnItem.name,
      );
      //
      // Create TGW route table association
      this.stack.addLogs(
        LogLevel.INFO,
        `Associating TGW route table ${associationItem} with EC2 firewall VPN connection ${vpnItem.name}`,
      );
      new TransitGatewayRouteTableAssociation(
        this.stack,
        `${pascalCase(vpnItem.name)}${pascalCase(associationItem)}Association`,
        {
          transitGatewayAttachmentId,
          transitGatewayRouteTableId,
          ...customResourceProps,
        },
      );
    }
  }

  /**
   * Create TGW route table propagations
   * @param vpnItem VpnConnectionConfig
   * @param cgwAccountId string
   * @param cgw string
   * @param requiresCrossAccountRoutes boolean
   * @param tgwPropagationCustomResourceHandler cdk.aws_lambda.IFunction | undefined
   */
  private createTransitGatewayPropagations(
    vpnItem: VpnConnectionConfig,
    cgwAccountId: string,
    cgw: CustomerGatewayConfig,
    requiresCrossAccountRoutes: boolean,
    tgwPropagationCustomResourceHandler?: cdk.aws_lambda.IFunction,
  ) {
    for (const propagationItem of vpnItem.routeTablePropagations ?? []) {
      //
      // Set custom resource props
      const customResourceProps = requiresCrossAccountRoutes
        ? {
            customResourceHandler: tgwPropagationCustomResourceHandler,
            owningAccountId: cgwAccountId !== this.stack.account ? cgwAccountId : undefined,
            owningRegion: cgw.region !== this.stack.region ? cgw.region : undefined,
            roleName: this.stack.acceleratorResourceNames.roles.crossAccountTgwRouteRoleName,
          }
        : {};
      //
      // Get TGW route table and attachment IDs
      const transitGatewayRouteTableId = this.getTgwRouteTableSsmParameter(
        cgw.name,
        vpnItem.transitGateway!,
        propagationItem,
        requiresCrossAccountRoutes,
      );
      const transitGatewayAttachmentId = getVpnAttachmentId(
        this.vpnAttachmentMap,
        vpnItem.transitGateway!,
        vpnItem.name,
      );
      //
      // Create TGW route table propagation
      this.stack.addLogs(
        LogLevel.INFO,
        `Propagating EC2 firewall VPN connection ${vpnItem.name} to TGW route table ${propagationItem}`,
      );
      new TransitGatewayRouteTablePropagation(
        this.stack,
        `${pascalCase(vpnItem.name)}${pascalCase(propagationItem)}Propagation`,
        {
          transitGatewayAttachmentId,
          transitGatewayRouteTableId,
          ...customResourceProps,
        },
      );
    }
  }

  /**
   * Create TGW VPN static routes for EC2 firewall VPN connections
   * @param props AcceleratorStackProps
   * @param transitGateways TransitGatewayConfig[]
   * @param customerGateways CustomerGatewayConfig[]
   * @param tgwStaticRouteCustomResourceHandler
   */
  private createTgwStaticRoutes(
    props: AcceleratorStackProps,
    customerGateways: CustomerGatewayConfig[],
    tgwStaticRouteCustomResourceHandler?: cdk.aws_lambda.IFunction,
  ) {
    //
    // Set array of VPN names in scope
    const ec2FirewallVpnNames = this.setEc2FirewallVpnNames(customerGateways);

    for (const tgwItem of props.networkConfig.transitGateways) {
      const tgwAccountId = props.accountsConfig.getAccountId(tgwItem.account);
      for (const routeTableItem of tgwItem.routeTables) {
        //
        // Set an array of EC2 firewall VPN static routes
        const ec2FirewallVpnRoutes = routeTableItem.routes.filter(
          routeItem =>
            routeItem.attachment &&
            isNetworkType<TransitGatewayRouteTableVpnEntryConfig>(
              'ITransitGatewayRouteTableVpnEntryConfig',
              routeItem.attachment,
            ) &&
            ec2FirewallVpnNames.includes(routeItem.attachment.vpnConnectionName),
        );
        //
        // Create static routes
        this.createTgwStaticRouteItems(
          ec2FirewallVpnRoutes,
          customerGateways,
          tgwItem,
          tgwAccountId,
          routeTableItem,
          tgwStaticRouteCustomResourceHandler,
        );
      }
    }
  }

  /**
   * Returns an array of EC2 firewall VPN connection logical names
   * that are in scope of the stack context
   * @param customerGateways CustomerGatewayConfig[]
   * @returns string[]
   */
  private setEc2FirewallVpnNames(customerGateways: CustomerGatewayConfig[]): string[] {
    const vpnNames: string[] = [];

    for (const cgw of customerGateways) {
      for (const vpnItem of cgw.vpnConnections ?? []) {
        vpnNames.push(vpnItem.name);
      }
    }
    return vpnNames;
  }

  /**
   * Create TGW VPN static routes and prefix list references
   * @param ec2FirewallVpnRoutes TransitGatewayRouteEntryConfig[]
   * @param customerGateways CustomerGatewayConfig[]
   * @param tgwItem TransitGatewayConfig
   * @param tgwAccountId string
   * @param routeTableItem TransitGatewayRouteTableConfig
   * @param tgwStaticRouteCustomResourceHandler cdk.aws_lambda.IFunction | undefined
   */
  private createTgwStaticRouteItems(
    ec2FirewallVpnRoutes: TransitGatewayRouteEntryConfig[],
    customerGateways: CustomerGatewayConfig[],
    tgwItem: TransitGatewayConfig,
    tgwAccountId: string,
    routeTableItem: TransitGatewayRouteTableConfig,
    tgwStaticRouteCustomResourceHandler?: cdk.aws_lambda.IFunction,
  ) {
    for (const routeEntryItem of ec2FirewallVpnRoutes) {
      if (
        routeEntryItem.attachment &&
        isNetworkType<TransitGatewayRouteTableVpnEntryConfig>(
          'ITransitGatewayRouteTableVpnEntryConfig',
          routeEntryItem.attachment,
        )
      ) {
        //
        // Set custom resource props
        const requiresCrossAccountRoutes = tgwAccountId !== this.stack.account || tgwItem.region !== this.stack.region;
        const customResourceProps = requiresCrossAccountRoutes
          ? {
              customResourceHandler: tgwStaticRouteCustomResourceHandler,
              owningAccountId: tgwAccountId !== this.stack.account ? tgwAccountId : undefined,
              owningRegion: tgwItem.region !== this.stack.region ? tgwItem.region : undefined,
              roleName: this.stack.acceleratorResourceNames.roles.crossAccountTgwRouteRoleName,
            }
          : {};
        //
        // Get TGW route table and attachment ID
        const cgwName = getCustomerGatewayName(customerGateways, routeEntryItem.attachment.vpnConnectionName);
        const transitGatewayRouteTableId = this.getTgwRouteTableSsmParameter(
          cgwName,
          tgwItem.name,
          routeTableItem.name,
          requiresCrossAccountRoutes,
        );
        const transitGatewayAttachmentId = getVpnAttachmentId(
          this.vpnAttachmentMap,
          tgwItem.name,
          routeEntryItem.attachment.vpnConnectionName,
        );
        //
        // Create static route or prefix list reference
        if (routeEntryItem.destinationCidrBlock) {
          this.stack.addLogs(
            LogLevel.INFO,
            `Creating static route on TGW route table ${routeTableItem.name} for destination ${routeEntryItem.destinationCidrBlock} targeting VPN attachment ${routeEntryItem.attachment.vpnConnectionName}`,
          );
          new TransitGatewayStaticRoute(
            this.stack,
            pascalCase(
              `${routeTableItem.name}${routeEntryItem.destinationCidrBlock}${routeEntryItem.attachment.vpnConnectionName}`,
            ),
            {
              destinationCidrBlock: routeEntryItem.destinationCidrBlock,
              transitGatewayAttachmentId,
              transitGatewayRouteTableId,
              ...customResourceProps,
            },
          );
        }
        if (routeEntryItem.destinationPrefixList) {
          const prefixListId = this.getPrefixListSsmParameter(
            cgwName,
            routeEntryItem.destinationPrefixList,
            requiresCrossAccountRoutes,
          );
          this.stack.addLogs(
            LogLevel.INFO,
            `Creating prefix list reference on TGW route table ${routeTableItem.name} for destination prefix list ${routeEntryItem.destinationPrefixList} targeting VPN attachment ${routeEntryItem.attachment.vpnConnectionName}`,
          );
          new TransitGatewayPrefixListReference(
            this.stack,
            pascalCase(
              `${routeTableItem.name}${routeEntryItem.destinationPrefixList}${routeEntryItem.attachment.vpnConnectionName}`,
            ),
            {
              prefixListId,
              transitGatewayAttachmentId,
              transitGatewayRouteTableId,
              logGroupKmsKey: this.stack.cloudwatchKey,
              logRetentionInDays: this.stack.logRetention,
              ...customResourceProps,
            },
          );
        }
      }
    }
  }

  /**
   * Returns the prefix list SSM parameter value for the given prefix list name
   * @param cgwName string
   * @param prefixListName string
   * @param requiresCrossAccountRoutes boolean
   * @returns string
   */
  private getPrefixListSsmParameter(
    cgwName: string,
    prefixListName: string,
    requiresCrossAccountRoutes: boolean,
  ): string {
    if (requiresCrossAccountRoutes) {
      return cdk.aws_ssm.StringParameter.valueForStringParameter(
        this.stack,
        this.stack.getSsmPath(SsmResourceType.CROSS_ACCOUNT_PREFIX_LIST, [cgwName, prefixListName]),
      );
    } else {
      return cdk.aws_ssm.StringParameter.valueForStringParameter(
        this.stack,
        this.stack.getSsmPath(SsmResourceType.PREFIX_LIST, [prefixListName]),
      );
    }
  }
}
