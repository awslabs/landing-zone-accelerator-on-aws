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

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

import { createLogger } from '@aws-accelerator/utils/lib/logger';

import * as t from './common';
import * as i from './models/network-config';
import * as CustomizationsConfig from './customizations-config';
import { ReplacementsConfig } from './replacements-config';

const logger = createLogger(['network-config']);

export class DefaultVpcsConfig implements i.IDefaultVpcsConfig {
  readonly delete = false;
  readonly excludeAccounts: string[] | undefined = [];
  readonly excludeRegions: t.Region[] | undefined = undefined;
}

export class TransitGatewayRouteTableVpcEntryConfig implements i.ITransitGatewayRouteTableVpcEntryConfig {
  readonly account: string = '';
  readonly vpcName: string = '';
}

export class TransitGatewayRouteTableDxGatewayEntryConfig implements i.ITransitGatewayRouteTableDxGatewayEntryConfig {
  readonly directConnectGatewayName: string = '';
}

export class TransitGatewayRouteTableVpnEntryConfig implements i.ITransitGatewayRouteTableVpnEntryConfig {
  readonly vpnConnectionName: string = '';
}

export class TransitGatewayRouteTableTgwPeeringEntryConfig implements i.ITransitGatewayRouteTableTgwPeeringEntryConfig {
  readonly transitGatewayPeeringName: string = '';
}

export class TransitGatewayRouteEntryConfig implements i.ITransitGatewayRouteEntryConfig {
  readonly destinationCidrBlock: string | undefined = undefined;
  readonly destinationPrefixList: string | undefined = undefined;
  readonly blackhole: boolean | undefined = undefined;
  readonly attachment:
    | TransitGatewayRouteTableVpcEntryConfig
    | TransitGatewayRouteTableDxGatewayEntryConfig
    | TransitGatewayRouteTableVpnEntryConfig
    | TransitGatewayRouteTableTgwPeeringEntryConfig
    | undefined = undefined;
}

export class TransitGatewayRouteTableConfig implements i.ITransitGatewayRouteTableConfig {
  readonly name: string = '';
  readonly tags: t.Tag[] | undefined = undefined;
  readonly routes: TransitGatewayRouteEntryConfig[] = [];
}

export class TransitGatewayPeeringRequesterConfig implements i.ITransitGatewayPeeringRequesterConfig {
  readonly transitGatewayName: string = '';
  readonly account: string = '';
  readonly region: t.Region = 'us-east-1';
  readonly routeTableAssociations: string = '';
  readonly tags: t.Tag[] | undefined = undefined;
}

export class TransitGatewayPeeringAccepterConfig implements i.ITransitGatewayPeeringAccepterConfig {
  readonly transitGatewayName: string = '';
  readonly account: string = '';
  readonly region: t.Region = 'us-east-1';
  readonly routeTableAssociations: string = '';
  readonly autoAccept: boolean | undefined = undefined;
  readonly applyTags: boolean | undefined = undefined;
}

export class TransitGatewayPeeringConfig implements i.ITransitGatewayPeeringConfig {
  readonly name: string = '';
  readonly requester = new TransitGatewayPeeringRequesterConfig();
  readonly accepter = new TransitGatewayPeeringAccepterConfig();
}

export class TransitGatewayConfig implements i.ITransitGatewayConfig {
  readonly name: string = '';
  readonly account: string = '';
  readonly region: t.Region = 'us-east-1';
  readonly shareTargets: t.ShareTargets | undefined = undefined;
  readonly asn: number = 65521;
  readonly dnsSupport: t.EnableDisable = 'enable';
  readonly vpnEcmpSupport: t.EnableDisable = 'enable';
  readonly defaultRouteTableAssociation: t.EnableDisable = 'enable';
  readonly defaultRouteTablePropagation: t.EnableDisable = 'enable';
  readonly autoAcceptSharingAttachments: t.EnableDisable = 'disable';
  readonly routeTables: TransitGatewayRouteTableConfig[] = [];
  readonly transitGatewayCidrBlocks: t.NonEmptyString[] | undefined = undefined;
  readonly transitGatewayIpv6CidrBlocks: t.NonEmptyString[] | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
}

export class DxVirtualInterfaceConfig implements i.IDxVirtualInterfaceConfig {
  readonly name: string = '';
  readonly connectionId: string = '';
  readonly customerAsn: number = 64512;
  readonly interfaceName: string = '';
  readonly ownerAccount: string = '';
  readonly region: t.Region = 'us-east-1';
  readonly type: i.DxVirtualInterfaceType = 'transit';
  readonly vlan: number = 1;
  readonly addressFamily: i.IpVersionType | undefined = undefined;
  readonly authKey: string | undefined = undefined;
  readonly amazonAddress: string | undefined = undefined;
  readonly customerAddress: string | undefined = undefined;
  readonly enableSiteLink: boolean | undefined = undefined;
  readonly jumboFrames: boolean | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
}

export class DxTransitGatewayAssociationConfig implements i.IDxTransitGatewayAssociationConfig {
  readonly name: string = '';
  readonly account: string = '';
  readonly allowedPrefixes: string[] = [];
  readonly routeTableAssociations: string[] | undefined = undefined;
  readonly routeTablePropagations: string[] | undefined = undefined;
}

export class DxGatewayConfig implements i.IDxGatewayConfig {
  readonly name: string = '';
  readonly account: string = '';
  readonly asn: number = 64512;
  readonly gatewayName: string = '';
  readonly virtualInterfaces: DxVirtualInterfaceConfig[] | undefined = undefined;
  readonly transitGatewayAssociations: DxTransitGatewayAssociationConfig[] | undefined = undefined;
}

export class IpamScopeConfig implements i.IIpamScopeConfig {
  readonly name: string = '';
  readonly description: string | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
}

export class IpamPoolConfig implements i.IIpamPoolConfig {
  readonly addressFamily: i.IpVersionType | undefined = 'ipv4';
  readonly name: string = '';
  readonly scope: string | undefined = undefined;
  readonly allocationDefaultNetmaskLength: number | undefined = undefined;
  readonly allocationMaxNetmaskLength: number | undefined = undefined;
  readonly allocationMinNetmaskLength: number | undefined = undefined;
  readonly allocationResourceTags: t.Tag[] | undefined = undefined;
  readonly autoImport: boolean | undefined = undefined;
  readonly description: string | undefined = undefined;
  readonly locale: t.Region | undefined = undefined;
  readonly provisionedCidrs: string[] | undefined = undefined;
  readonly publiclyAdvertisable: boolean | undefined = undefined;
  readonly shareTargets: t.ShareTargets = new t.ShareTargets();
  readonly sourceIpamPool: string | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
}

export class IpamConfig implements i.IIpamConfig {
  readonly name: string = '';
  readonly region: t.Region = 'us-east-1';
  readonly description: string | undefined = undefined;
  readonly operatingRegions: t.Region[] | undefined = undefined;
  readonly scopes: IpamScopeConfig[] | undefined = undefined;
  readonly pools: IpamPoolConfig[] | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
}

export class RouteTableEntryConfig implements i.IRouteTableEntryConfig {
  readonly name: string = '';
  readonly destination: string | undefined = undefined;
  readonly destinationPrefixList: string | undefined = undefined;
  readonly ipv6Destination: string | undefined = undefined;
  readonly type: i.RouteTableEntryType | undefined = undefined;
  readonly target: string | undefined = undefined;
  readonly targetAvailabilityZone: string | number | undefined = undefined;
}

export class RouteTableConfig implements i.IRouteTableConfig {
  readonly name: string = '';
  readonly gatewayAssociation: i.GatewayRouteTableType | undefined = undefined;
  readonly routes: RouteTableEntryConfig[] | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
}

export class SubnetPrivateDnsConfig implements i.ISubnetPrivateDnsConfig {
  readonly enableDnsAAAARecord: boolean | undefined = undefined;
  readonly enableDnsARecord: boolean | undefined = undefined;
  readonly hostnameType: 'ip-name' | 'resource-name' | undefined = undefined;
}

export class SubnetConfig implements i.ISubnetConfig {
  readonly name: string = '';
  readonly assignIpv6OnCreation: boolean | undefined = undefined;
  readonly availabilityZone: string | number | undefined = undefined;
  readonly enableDns64: boolean | undefined = undefined;
  readonly routeTable: string | undefined = undefined;
  readonly ipamAllocation: IpamAllocationConfig | undefined = undefined;
  readonly ipv4CidrBlock: string | undefined = undefined;
  readonly ipv6CidrBlock: string | undefined = undefined;
  readonly localZone?: string | undefined = undefined;
  readonly mapPublicIpOnLaunch: boolean | undefined = undefined;
  readonly privateDnsOptions: SubnetPrivateDnsConfig | undefined = undefined;
  readonly shareTargets: t.ShareTargets | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
  readonly outpost: string | undefined = undefined;
}

export class NatGatewayConfig implements i.INatGatewayConfig {
  readonly name: string = '';
  readonly subnet: string = '';
  readonly allocationId: string | undefined = undefined;
  readonly private: boolean | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
}

export class TransitGatewayAttachmentTargetConfig implements i.ITransitGatewayAttachmentTargetConfig {
  readonly name: string = '';
  readonly account: string = '';
}

export class TransitGatewayAttachmentOptionsConfig implements i.ITransitGatewayAttachmentOptionsConfig {
  readonly applianceModeSupport: t.EnableDisable | undefined = undefined;
  readonly dnsSupport: t.EnableDisable | undefined = undefined;
  readonly ipv6Support: t.EnableDisable | undefined = undefined;
}

export class LocalGatewayRouteTableConfig implements i.ILocalGatewayRouteTableConfig {
  readonly name: string = '';
  readonly id: string = '';
}

export class LocalGatewayConfig implements i.ILocalGatewayConfig {
  readonly name: string = '';
  readonly id: string = '';
  readonly routeTables: LocalGatewayRouteTableConfig[] = [];
}

export class OutpostsConfig implements i.IOutpostsConfig {
  readonly name: string = '';
  readonly arn: string = '';
  readonly availabilityZone: string | number = '';
  readonly localGateway: LocalGatewayConfig | undefined = undefined;
}

export class TransitGatewayAttachmentConfig implements i.ITransitGatewayAttachmentConfig {
  readonly name: string = '';
  readonly transitGateway: TransitGatewayAttachmentTargetConfig = new TransitGatewayAttachmentTargetConfig();
  readonly subnets: string[] = [];
  readonly routeTableAssociations: string[] | undefined = undefined;
  readonly routeTablePropagations: string[] | undefined = undefined;
  readonly options: TransitGatewayAttachmentOptionsConfig | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
}

export class TransitGatewayConnectConfig implements i.ITransitGatewayConnectConfig {
  readonly name: string = '';
  readonly region: string = '';
  readonly transitGateway: TransitGatewayAttachmentTargetConfig = new TransitGatewayAttachmentTargetConfig();
  readonly vpc?: i.ITransitGatewayConnectVpcConfig | undefined;
  readonly directConnect?: string = '';
  readonly options: TransitGatewayConnectOptionsConfig | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
}

export class TransitGatewayConnectOptionsConfig implements i.ITransitGatewayConnectOptionsConfig {
  readonly protocol: i.TransitGatewayConnectProtocol = 'gre';
}

export class TransitGatewayConnectVpcConfig implements i.ITransitGatewayConnectVpcConfig {
  readonly vpcName: string = '';
  readonly vpcAttachment: string = '';
}

export class GatewayEndpointServiceConfig implements i.IGatewayEndpointServiceConfig {
  readonly service: i.GatewayEndpointType = 's3';
  readonly policy: string | undefined = undefined;
  readonly applyPolicy: boolean = true;
  readonly serviceName: string | undefined = undefined;
}

export class GatewayEndpointConfig implements i.IGatewayEndpointConfig {
  readonly defaultPolicy: string = '';
  readonly endpoints: GatewayEndpointServiceConfig[] = [];
}

export class InterfaceEndpointServiceConfig implements i.IInterfaceEndpointServiceConfig {
  readonly service: string = '';
  readonly serviceName: string | undefined = undefined;
  readonly policy: string | undefined = undefined;
  readonly applyPolicy: boolean | undefined = true;
  readonly securityGroup: string | undefined = undefined;
}

export class InterfaceEndpointConfig implements i.IInterfaceEndpointConfig {
  readonly defaultPolicy: string = '';
  readonly endpoints: InterfaceEndpointServiceConfig[] = [new InterfaceEndpointServiceConfig()];
  readonly subnets: string[] = [];
  readonly central: boolean | undefined = undefined;
  readonly allowedCidrs: string[] | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
}
export class SubnetSourceConfig implements i.ISubnetSourceConfig {
  readonly account: string = '';
  readonly vpc: string = '';
  readonly subnets: string[] = [];
  /**
   * (OPTIONAL) Indicates whether to target the IPv6 CIDR associated with a subnet.
   *
   * @remarks
   * Leave this property undefined or set to `false` to target a subnet's IPv4 CIDR.
   */
  readonly ipv6: boolean | undefined = undefined;
}

export class SecurityGroupSourceConfig implements i.ISecurityGroupSourceConfig {
  readonly securityGroups: string[] = [];
}

export class PrefixListSourceConfig implements i.IPrefixListSourceConfig {
  readonly prefixLists: string[] = [];
}

export class PrefixListConfig implements i.IPrefixListConfig {
  readonly name: string = '';
  readonly accounts: string[] | undefined = undefined;
  readonly regions: t.Region[] | undefined = undefined;
  readonly deploymentTargets: t.DeploymentTargets | undefined = undefined;
  readonly addressFamily: i.IpAddressFamilyType = 'IPv4';
  readonly maxEntries: number = 1;
  readonly entries: string[] = [];
  readonly tags: t.Tag[] | undefined = undefined;
}

export class SecurityGroupRuleConfig implements i.ISecurityGroupRuleConfig {
  readonly description: string = '';
  readonly types: i.SecurityGroupRuleType[] | undefined = undefined;
  readonly tcpPorts: number[] | undefined = undefined;
  readonly udpPorts: number[] | undefined = undefined;
  readonly fromPort: number | undefined = undefined;
  readonly toPort: number | undefined = undefined;
  readonly sources: (t.NonEmptyString | SubnetSourceConfig | SecurityGroupSourceConfig | PrefixListSourceConfig)[] = [];
  readonly ipProtocols: string[] = [];
}

export class SecurityGroupConfig implements i.ISecurityGroupConfig {
  readonly name: string = '';
  readonly description: string | undefined = undefined;
  readonly inboundRules: SecurityGroupRuleConfig[] = [];
  readonly outboundRules: SecurityGroupRuleConfig[] = [];
  readonly tags: t.Tag[] | undefined = undefined;
}

export class NetworkAclSubnetSelection implements i.INetworkAclSubnetSelection {
  readonly account: string = '';
  readonly vpc: string = '';
  readonly subnet: string = '';
  readonly ipv6: boolean | undefined = undefined;
  readonly region: t.Region | undefined = undefined;
}

export class NetworkAclInboundRuleConfig implements i.INetworkAclInboundRuleConfig {
  readonly rule: number = 100;
  readonly protocol: number = -1;
  readonly fromPort: number = -1;
  readonly toPort: number = -1;
  readonly action: t.AllowDeny = 'allow';
  readonly source: string | NetworkAclSubnetSelection = '';
}

export class NetworkAclOutboundRuleConfig implements i.INetworkAclOutboundRuleConfig {
  readonly rule: number = 100;
  readonly protocol: number = -1;
  readonly fromPort: number = -1;
  readonly toPort: number = -1;
  readonly action: t.AllowDeny = 'allow';
  readonly destination: string | NetworkAclSubnetSelection = '';
}

export class NetworkAclConfig implements i.INetworkAclConfig {
  readonly name: string = '';
  readonly subnetAssociations: string[] = [];
  readonly inboundRules: NetworkAclInboundRuleConfig[] | undefined = undefined;
  readonly outboundRules: NetworkAclOutboundRuleConfig[] | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
}

export class IpamAllocationConfig implements i.IIpamAllocationConfig {
  readonly ipamPoolName: string = '';
  readonly netmaskLength: number = 24;
}

export class DhcpOptsConfig implements i.IDhcpOptsConfig {
  readonly name: string = '';
  readonly accounts: string[] = [''];
  readonly regions: t.Region[] = ['us-east-1'];
  readonly domainName: string | undefined = undefined;
  readonly domainNameServers: string[] | undefined = undefined;
  readonly netbiosNameServers: string[] | undefined = undefined;
  readonly netbiosNodeType: i.NetbiosNodeType | undefined = undefined;
  readonly ntpServers: string[] | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
}

export class EndpointPolicyConfig implements i.IEndpointPolicyConfig {
  readonly name: string = '';
  readonly document: string = '';
}

export class VpnLoggingConfig implements i.IVpnLoggingConfig {
  readonly enable: boolean | undefined = undefined;
  readonly logGroupName: string | undefined = undefined;
  readonly outputFormat: i.VpnLoggingOutputFormatType | undefined = undefined;
}

export class Phase1Config implements i.IPhase1Config {
  readonly dhGroups: i.Phase1DhGroupType[] | undefined = undefined;
  readonly encryptionAlgorithms: i.EncryptionAlgorithmType[] | undefined = undefined;
  readonly integrityAlgorithms: i.IntegrityAlgorithmType[] | undefined = undefined;
  readonly lifetimeSeconds: number | undefined = undefined;
}

export class Phase2Config implements i.IPhase2Config {
  readonly dhGroups: i.Phase2DhGroupType[] | undefined = undefined;
  readonly encryptionAlgorithms: i.EncryptionAlgorithmType[] | undefined = undefined;
  readonly integrityAlgorithms: i.IntegrityAlgorithmType[] | undefined = undefined;
  readonly lifetimeSeconds: number | undefined = undefined;
}

export class VpnTunnelOptionsSpecificationsConfig implements i.IVpnTunnelOptionsSpecificationsConfig {
  readonly dpdTimeoutAction: i.DpdTimeoutActionType | undefined = undefined;
  readonly dpdTimeoutSeconds: number | undefined = undefined;
  readonly ikeVersions: i.IkeVersionType[] | undefined = undefined;
  readonly logging: VpnLoggingConfig | undefined = undefined;
  readonly phase1: Phase1Config | undefined = undefined;
  readonly phase2: Phase2Config | undefined = undefined;
  readonly preSharedKey: string | undefined = undefined;
  readonly rekeyFuzzPercentage: number | undefined = undefined;
  readonly rekeyMarginTimeSeconds: number | undefined = undefined;
  readonly replayWindowSize: number | undefined = undefined;
  readonly startupAction: i.StartupActionType | undefined = undefined;
  readonly tunnelInsideCidr: string | undefined = undefined;
  readonly tunnelLifecycleControl: boolean | undefined = undefined;
}

export class VpnConnectionConfig implements i.IVpnConnectionConfig {
  readonly name: string = '';
  readonly amazonIpv4NetworkCidr: string | undefined = undefined;
  readonly customerIpv4NetworkCidr: string | undefined = undefined;
  readonly enableVpnAcceleration: boolean | undefined = undefined;
  readonly transitGateway: string | undefined = undefined;
  readonly vpc: string | undefined = undefined;
  readonly routeTableAssociations: string[] | undefined = undefined;
  readonly routeTablePropagations: string[] | undefined = undefined;
  readonly staticRoutesOnly: boolean | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
  readonly tunnelSpecifications: VpnTunnelOptionsSpecificationsConfig[] | undefined = undefined;
}

export class CustomerGatewayConfig implements i.ICustomerGatewayConfig {
  readonly name: string = '';
  readonly account: string = '';
  readonly region: t.Region = 'us-east-1';
  readonly ipAddress: string = '';
  readonly asn: number = 65000;
  readonly tags: t.Tag[] | undefined = undefined;
  readonly vpnConnections: VpnConnectionConfig[] | undefined = undefined;
}

export class LoadBalancersConfig implements i.ILoadBalancersConfig {
  readonly applicationLoadBalancers: CustomizationsConfig.ApplicationLoadBalancerConfig[] | undefined = undefined;
  readonly networkLoadBalancers: CustomizationsConfig.NetworkLoadBalancerConfig[] | undefined = undefined;
}

export class VirtualPrivateGatewayConfig implements i.IVirtualPrivateGatewayConfig {
  readonly asn: number = 65000;
}

export class VpcIpv6Config implements i.IVpcIpv6Config {
  readonly amazonProvided: boolean | undefined = undefined;
  readonly cidrBlock: string | undefined = undefined;
  readonly byoipPoolId: string | undefined = undefined;
}

export class VpcConfig implements i.IVpcConfig {
  readonly name: string = '';
  readonly account: string = '';
  readonly region: t.Region = 'us-east-1';
  readonly cidrs: string[] | undefined = undefined;
  readonly defaultSecurityGroupRulesDeletion: boolean | undefined = false;
  readonly dhcpOptions: string | undefined = undefined;
  readonly dnsFirewallRuleGroups: i.IVpcDnsFirewallAssociationConfig[] | undefined = undefined;
  readonly egressOnlyIgw: boolean | undefined = undefined;
  readonly internetGateway: boolean | undefined = undefined;
  readonly enableDnsHostnames: boolean | undefined = true;
  readonly enableDnsSupport: boolean | undefined = true;
  readonly instanceTenancy: i.InstanceTenancyType | undefined = 'default';
  readonly ipamAllocations: IpamAllocationConfig[] | undefined = undefined;
  readonly ipv6Cidrs: VpcIpv6Config[] | undefined = undefined;
  readonly queryLogs: string[] | undefined = undefined;
  readonly resolverRules: string[] | undefined = undefined;
  readonly routeTables: RouteTableConfig[] | undefined = undefined;
  readonly subnets: SubnetConfig[] | undefined = undefined;
  readonly natGateways: NatGatewayConfig[] | undefined = undefined;
  readonly transitGatewayAttachments: TransitGatewayAttachmentConfig[] | undefined = undefined;
  readonly outposts: OutpostsConfig[] | undefined = undefined;
  readonly gatewayEndpoints: GatewayEndpointConfig | undefined = undefined;
  readonly interfaceEndpoints: InterfaceEndpointConfig | undefined = undefined;
  readonly useCentralEndpoints: boolean | undefined = false;
  readonly securityGroups: SecurityGroupConfig[] | undefined = undefined;
  readonly networkAcls: NetworkAclConfig[] | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
  readonly virtualPrivateGateway: VirtualPrivateGatewayConfig | undefined = undefined;
  readonly vpcFlowLogs: t.VpcFlowLogsConfig | undefined = undefined;
  readonly loadBalancers: LoadBalancersConfig | undefined = undefined;
  readonly targetGroups: CustomizationsConfig.TargetGroupItemConfig[] | undefined = undefined;
  readonly vpcRoute53Resolver: VpcResolverConfig | undefined = undefined;
}

export class VpcTemplatesConfig implements i.IVpcTemplatesConfig {
  readonly name: string = '';
  readonly region: t.Region = 'us-east-1';
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  readonly cidrs: string[] | undefined = undefined;
  readonly ipamAllocations: IpamAllocationConfig[] | undefined = undefined;
  readonly defaultSecurityGroupRulesDeletion: boolean | undefined = false;
  readonly dhcpOptions: string | undefined = undefined;
  readonly dnsFirewallRuleGroups: i.IVpcDnsFirewallAssociationConfig[] | undefined = undefined;
  readonly egressOnlyIgw: boolean | undefined = undefined;
  readonly internetGateway: boolean | undefined = undefined;
  readonly enableDnsHostnames: boolean | undefined = true;
  readonly enableDnsSupport: boolean | undefined = true;
  readonly instanceTenancy: i.InstanceTenancyType | undefined = 'default';
  readonly ipv6Cidrs: VpcIpv6Config[] | undefined = undefined;
  readonly queryLogs: string[] | undefined = undefined;
  readonly resolverRules: string[] | undefined = undefined;
  readonly routeTables: RouteTableConfig[] | undefined = undefined;
  readonly subnets: SubnetConfig[] | undefined = undefined;
  readonly natGateways: NatGatewayConfig[] | undefined = undefined;
  readonly transitGatewayAttachments: TransitGatewayAttachmentConfig[] | undefined = undefined;
  readonly gatewayEndpoints: GatewayEndpointConfig | undefined = undefined;
  readonly interfaceEndpoints: InterfaceEndpointConfig | undefined = undefined;
  readonly useCentralEndpoints: boolean | undefined = false;
  readonly securityGroups: SecurityGroupConfig[] | undefined = undefined;
  readonly networkAcls: NetworkAclConfig[] | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
  readonly virtualPrivateGateway: VirtualPrivateGatewayConfig | undefined = undefined;
  readonly vpcFlowLogs: t.VpcFlowLogsConfig | undefined = undefined;
  readonly loadBalancers: LoadBalancersConfig | undefined = undefined;
  readonly targetGroups: CustomizationsConfig.TargetGroupItemConfig[] | undefined = undefined;
}

export class ResolverRuleConfig implements i.IResolverRuleConfig {
  readonly name: string = '';
  readonly domainName: string = '';
  readonly excludedRegions: t.Region[] | undefined = undefined;
  readonly inboundEndpointTarget: string | undefined = undefined;
  readonly ruleType: i.RuleType | undefined = 'FORWARD';
  readonly shareTargets: t.ShareTargets | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
  readonly targetIps: i.IRuleTargetIps[] | undefined = undefined;
}

export class ResolverEndpointConfig implements i.IResolverEndpointConfig {
  readonly name: string = '';
  readonly type: i.ResolverEndpointType = 'INBOUND';
  readonly vpc: string = '';
  readonly subnets: string[] = [];
  readonly allowedCidrs: string[] | undefined = undefined;
  readonly rules: ResolverRuleConfig[] | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
}

export class DnsQueryLogsConfig implements i.IDnsQueryLogsConfig {
  readonly name: string = '';
  readonly destinations: t.LogDestinationType[] = ['s3'];
  readonly shareTargets: t.ShareTargets | undefined = undefined;
  readonly excludedRegions: t.Region[] | undefined = undefined;
}

export class DnsFirewallRulesConfig implements i.IDnsFirewallRulesConfig {
  readonly name: string = '';
  readonly action: i.DnsFirewallRuleActionType = 'ALERT';
  readonly priority: number = 100;
  readonly blockOverrideDomain: string | undefined = undefined;
  readonly blockOverrideTtl: number | undefined = undefined;
  readonly blockResponse: i.DnsFirewallBlockResponseType | undefined = undefined;
  readonly customDomainList: string | undefined = undefined;
  readonly managedDomainList: i.DnsFirewallManagedDomainListsType | undefined = undefined;
}

export class DnsFirewallRuleGroupConfig implements i.IDnsFirewallRuleGroupConfig {
  readonly name: string = '';
  readonly regions: t.Region[] = ['us-east-1'];
  readonly rules: DnsFirewallRulesConfig[] = [];
  readonly shareTargets: t.ShareTargets | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
}

export class LocalResolverConfig implements i.IResolverConfig {
  readonly endpoints: ResolverEndpointConfig[] | undefined = undefined;
  readonly queryLogs: DnsQueryLogsConfig | undefined = undefined;
}

export class VpcResolverConfig implements i.IResolverConfig {
  readonly endpoints: ResolverEndpointConfig[] | undefined = undefined;
  readonly queryLogs: DnsQueryLogsConfig | undefined = undefined;
}
export class ResolverConfig implements i.IResolverConfig {
  readonly endpoints: ResolverEndpointConfig[] | undefined = undefined;
  readonly firewallRuleGroups: DnsFirewallRuleGroupConfig[] | undefined = undefined;
  readonly queryLogs: DnsQueryLogsConfig | undefined = undefined;
  readonly rules: ResolverRuleConfig[] | undefined = undefined;
}

export class NfwRuleSourceListConfig implements i.INfwRuleSourceListConfig {
  readonly generatedRulesType: i.NfwGeneratedRulesType = 'DENYLIST';
  readonly targets: string[] = [];
  readonly targetTypes: i.NfwTargetType[] = ['TLS_SNI'];
}

export class NfwRuleSourceStatefulRuleHeaderConfig implements i.INfwRuleSourceStatefulRuleHeaderConfig {
  readonly destination: string = '';
  readonly destinationPort: string = '';
  readonly direction: i.NfwStatefulRuleDirectionType = 'ANY';
  readonly protocol: i.NfwStatefulRuleProtocolType = 'IP';
  readonly source: string = '';
  readonly sourcePort: string = '';
}

export class NfwRuleSourceStatefulRuleOptionsConfig implements i.INfwRuleSourceStatefulRuleOptionsConfig {
  readonly keyword: string = '';
  readonly settings: string[] | undefined = undefined;
}

export class NfwRuleSourceStatefulRuleConfig implements i.INfwRuleSourceStatefulRuleConfig {
  readonly action: i.NfwStatefulRuleActionType = 'DROP';
  readonly header: NfwRuleSourceStatefulRuleHeaderConfig = new NfwRuleSourceStatefulRuleHeaderConfig();
  readonly ruleOptions: NfwRuleSourceStatefulRuleOptionsConfig[] = [new NfwRuleSourceStatefulRuleOptionsConfig()];
}

export class NfwRuleSourceCustomActionDimensionConfig implements i.INfwRuleSourceCustomActionDimensionConfig {
  readonly dimensions: string[] = [];
}

export class NfwRuleSourceCustomActionDefinitionConfig implements i.INfwRuleSourceCustomActionDefinitionConfig {
  readonly publishMetricAction: NfwRuleSourceCustomActionDimensionConfig =
    new NfwRuleSourceCustomActionDimensionConfig();
}

export class NfwRuleSourceCustomActionConfig implements i.INfwRuleSourceCustomActionConfig {
  readonly actionDefinition: NfwRuleSourceCustomActionDefinitionConfig =
    new NfwRuleSourceCustomActionDefinitionConfig();
  readonly actionName: string = '';
}

export class NfwRuleSourceStatelessPortRangeConfig implements i.INfwRuleSourceStatelessPortRangeConfig {
  readonly fromPort: number = 123;
  readonly toPort: number = 123;
}

export class NfwRuleSourceStatelessTcpFlagsConfig implements i.INfwRuleSourceStatelessTcpFlagsConfig {
  readonly flags: i.NfwStatelessRuleTcpFlagType[] = [];
  readonly masks: i.NfwStatelessRuleTcpFlagType[] = [];
}

export class NfwRuleSourceStatelessMatchAttributesConfig implements i.INfwRuleSourceStatelessMatchAttributesConfig {
  readonly destinationPorts: NfwRuleSourceStatelessPortRangeConfig[] | undefined = undefined;
  readonly destinations: string[] | undefined = undefined;
  readonly protocols: number[] | undefined = undefined;
  readonly sourcePorts: NfwRuleSourceStatelessPortRangeConfig[] | undefined = undefined;
  readonly sources: string[] | undefined = undefined;
  readonly tcpFlags: NfwRuleSourceStatelessTcpFlagsConfig[] | undefined = undefined;
}

export class NfwRuleSourceStatelessRuleDefinitionConfig implements i.INfwRuleSourceStatelessRuleDefinitionConfig {
  readonly actions: i.NfwStatelessRuleActionType[] | string[] = ['aws:drop'];
  readonly matchAttributes: NfwRuleSourceStatelessMatchAttributesConfig =
    new NfwRuleSourceStatelessMatchAttributesConfig();
}

export class NfwRuleSourceStatelessRuleConfig implements i.INfwRuleSourceStatelessRuleConfig {
  readonly priority: number = 123;
  readonly ruleDefinition: NfwRuleSourceStatelessRuleDefinitionConfig =
    new NfwRuleSourceStatelessRuleDefinitionConfig();
}

export class NfwStatelessRulesAndCustomActionsConfig implements i.INfwStatelessRulesAndCustomActionsConfig {
  readonly statelessRules: NfwRuleSourceStatelessRuleConfig[] = [new NfwRuleSourceStatelessRuleConfig()];
  readonly customActions: NfwRuleSourceCustomActionConfig[] | undefined = undefined;
}

export class NfwRuleSourceConfig implements i.INfwRuleSourceConfig {
  readonly rulesSourceList: NfwRuleSourceListConfig | undefined = undefined;
  readonly rulesString: string | undefined = undefined;
  readonly statefulRules: NfwRuleSourceStatefulRuleConfig[] | undefined = undefined;
  readonly statelessRulesAndCustomActions: NfwStatelessRulesAndCustomActionsConfig | undefined = undefined;
  readonly rulesFile: string | undefined = undefined;
}

export class NfwRuleVariableDefinitionConfig implements i.INfwRuleVariableDefinitionConfig {
  readonly name: string = '';
  readonly definition: string[] = [];
}

export class NfwRuleVariableConfig implements i.INfwRuleVariableConfig {
  readonly ipSets: NfwRuleVariableDefinitionConfig | NfwRuleVariableDefinitionConfig[] = [
    new NfwRuleVariableDefinitionConfig(),
  ];
  readonly portSets: NfwRuleVariableDefinitionConfig | NfwRuleVariableDefinitionConfig[] = [
    new NfwRuleVariableDefinitionConfig(),
  ];
}

export class NfwRuleGroupRuleConfig implements i.INfwRuleGroupRuleConfig {
  readonly rulesSource: NfwRuleSourceConfig = new NfwRuleSourceConfig();
  readonly ruleVariables: NfwRuleVariableConfig | undefined = undefined;
  readonly statefulRuleOptions: i.NfwStatefulRuleOptionsType | undefined = undefined;
}

export class NfwRuleGroupConfig implements i.INfwRuleGroupConfig {
  readonly name: string = '';
  readonly regions: t.Region[] = [];
  readonly capacity: number = 123;
  readonly type: i.NfwRuleType = 'STATEFUL';
  readonly description: string | undefined = undefined;
  readonly ruleGroup: NfwRuleGroupRuleConfig | undefined = undefined;
  readonly shareTargets: t.ShareTargets | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
}

export class NfwStatefulRuleGroupReferenceConfig implements i.INfwStatefulRuleGroupReferenceConfig {
  readonly name: string = '';
  readonly priority: number | undefined = undefined;
}

export class NfwStatelessRuleGroupReferenceConfig implements i.INfwStatelessRuleGroupReferenceConfig {
  readonly name: string = '';
  readonly priority: number = 123;
}

export class NfwFirewallPolicyPolicyConfig implements i.INfwFirewallPolicyPolicyConfig {
  readonly statelessDefaultActions: string[] | i.NfwStatelessRuleActionType[] = [];
  readonly statelessFragmentDefaultActions: string[] | i.NfwStatelessRuleActionType[] = [];
  readonly statefulDefaultActions: i.NfwStatefulDefaultActionType[] | undefined = undefined;
  readonly statefulEngineOptions: i.NfwStatefulRuleOptionsType | undefined = undefined;
  readonly statefulRuleGroups: NfwStatefulRuleGroupReferenceConfig[] | undefined = undefined;
  readonly statelessCustomActions: NfwRuleSourceCustomActionConfig[] | undefined = undefined;
  readonly statelessRuleGroups: NfwStatelessRuleGroupReferenceConfig[] | undefined = undefined;
}

export class NfwFirewallPolicyConfig implements i.INfwFirewallPolicyConfig {
  readonly name: string = '';
  readonly firewallPolicy: NfwFirewallPolicyPolicyConfig = new NfwFirewallPolicyPolicyConfig();
  readonly regions: t.Region[] = [];
  readonly description: string | undefined = undefined;
  readonly shareTargets: t.ShareTargets | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
}

export class NfwLoggingConfig implements i.INfwLoggingConfig {
  readonly destination: t.LogDestinationType = 's3';
  readonly type: i.NfwLogType = 'ALERT';
}

export class NfwFirewallConfig implements i.INfwFirewallConfig {
  readonly name: string = '';
  readonly firewallPolicy: string = '';
  readonly subnets: string[] = [];
  readonly vpc: string = '';
  readonly deleteProtection: boolean | undefined = undefined;
  readonly description: string | undefined = undefined;
  readonly firewallPolicyChangeProtection: boolean | undefined = undefined;
  readonly subnetChangeProtection: boolean | undefined = undefined;
  readonly loggingConfiguration: NfwLoggingConfig[] | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
}

export class NfwConfig implements i.INfwConfig {
  readonly firewalls: NfwFirewallConfig[] = [];
  readonly policies: NfwFirewallPolicyConfig[] = [];
  readonly rules: NfwRuleGroupConfig[] = [];
}

export class GwlbEndpointConfig implements i.IGwlbEndpointConfig {
  readonly name: string = '';
  readonly account: string = '';
  readonly subnet: string = '';
  readonly vpc: string = '';
}

export class GwlbConfig implements i.IGwlbConfig {
  readonly name: string = '';
  readonly endpoints: GwlbEndpointConfig[] = [];
  readonly subnets: string[] = [];
  readonly vpc: string = '';
  readonly account: string | undefined = undefined;
  readonly crossZoneLoadBalancing: boolean | undefined = undefined;
  readonly deletionProtection: boolean | undefined = undefined;
  readonly targetGroup: string | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
}

export class CentralNetworkServicesConfig implements i.ICentralNetworkServicesConfig {
  readonly delegatedAdminAccount: string = '';
  readonly gatewayLoadBalancers: GwlbConfig[] | undefined = undefined;
  readonly ipams: IpamConfig[] | undefined = undefined;
  readonly route53Resolver: ResolverConfig | undefined = undefined;
  readonly networkFirewall: NfwConfig | undefined = undefined;
}

export class VpcPeeringConfig implements i.IVpcPeeringConfig {
  readonly name: string = '';
  readonly vpcs: string[] = [];
  readonly tags: t.Tag[] | undefined = undefined;
}

export class ElbAccountIdsConfig implements i.IElbAccountIdsConfig {
  readonly region: string = '';
  readonly accountId: string = '';
}

export class FirewallManagerNotificationChannelConfig implements i.IFirewallManagerNotificationChannelConfig {
  readonly region: string = '';
  readonly snsTopic: string = '';
}

export class CertificateConfig implements i.ICertificateConfig {
  readonly name: string = '';
  readonly type: i.CertificateConfigType = 'import';
  readonly privKey: string | undefined = undefined;
  readonly cert: string | undefined = undefined;
  readonly chain: string | undefined = undefined;
  readonly validation: i.CertificateValidationType = 'EMAIL';
  readonly domain: string | undefined = undefined;
  readonly san: string[] | undefined = undefined;
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
}

export class FirewallManagerConfig implements i.IFirewallManagerServiceConfig {
  readonly delegatedAdminAccount: string = '';
  readonly notificationChannels: FirewallManagerNotificationChannelConfig[] | undefined = undefined;
}

export class NetworkConfig implements i.INetworkConfig {
  /**
   * The name of the network configuration file.
   */
  static readonly FILENAME = 'network-config.yaml';

  readonly defaultVpc: DefaultVpcsConfig = new DefaultVpcsConfig();
  readonly transitGateways: TransitGatewayConfig[] = [];
  readonly transitGatewayConnects: TransitGatewayConnectConfig[] | undefined = undefined;
  readonly transitGatewayPeering: TransitGatewayPeeringConfig[] | undefined = undefined;
  readonly customerGateways: CustomerGatewayConfig[] | undefined = undefined;
  readonly endpointPolicies: EndpointPolicyConfig[] = [];
  readonly vpcs: VpcConfig[] = [];
  readonly vpcFlowLogs: t.VpcFlowLogsConfig | undefined = undefined;
  readonly dhcpOptions: DhcpOptsConfig[] | undefined = undefined;
  readonly centralNetworkServices: CentralNetworkServicesConfig | undefined = undefined;
  readonly directConnectGateways: DxGatewayConfig[] | undefined = undefined;
  readonly prefixLists: PrefixListConfig[] | undefined = undefined;
  readonly vpcPeering: VpcPeeringConfig[] | undefined = undefined;
  readonly vpcTemplates: VpcTemplatesConfig[] | undefined = undefined;
  readonly elbAccountIds: ElbAccountIdsConfig[] | undefined = undefined;
  readonly firewallManagerService: FirewallManagerConfig | undefined = undefined;
  readonly certificates: CertificateConfig[] | undefined = undefined;
  public accountVpcIds: Record<string, string[]> | undefined = undefined;
  public accountVpcEndpointIds: Record<string, string[]> | undefined = undefined;

  /**
   *
   * @param values
   */
  constructor(values?: i.INetworkConfig) {
    Object.assign(this, values);
  }

  /**
   * Function to get list of account names which will be used as account principal for TGE peering role
   * @param accepterAccountName
   * @returns
   */
  public getTgwRequestorAccountNames(accepterAccountName: string): string[] {
    const accountNames: string[] = [];

    for (const transitGatewayPeeringItem of this.transitGatewayPeering ?? []) {
      if (transitGatewayPeeringItem.accepter.account === accepterAccountName) {
        accountNames.push(transitGatewayPeeringItem.requester.account);
      }
    }
    return accountNames;
  }

  /**
   * Function to get requester or accepter config of tgw peering
   * @param peeringName
   * @param peerType
   * @returns
   */
  public getTgwPeeringRequesterAccepterConfig(
    peeringName: string,
    peerType: 'requester' | 'accepter',
  ): TransitGatewayPeeringRequesterConfig | TransitGatewayPeeringAccepterConfig | undefined {
    for (const transitGatewayPeering of this.transitGatewayPeering ?? []) {
      if (transitGatewayPeering.name === peeringName) {
        if (peerType === 'requester') {
          return transitGatewayPeering.requester;
        } else {
          return transitGatewayPeering.accepter;
        }
      }
    }

    logger.error(`Transit gateway peering ${peeringName} not found !!!`);
    throw new Error('configuration validation failed.');
  }

  /**
   *
   * @param dir
   * @returns
   */
  static load(dir: string, replacementsConfig?: ReplacementsConfig): NetworkConfig {
    const initialBuffer = fs.readFileSync(path.join(dir, NetworkConfig.FILENAME), 'utf8');
    const buffer = replacementsConfig ? replacementsConfig.preProcessBuffer(initialBuffer) : initialBuffer;
    const values = t.parseNetworkConfig(yaml.load(buffer));

    return new NetworkConfig(values);
  }

  /**
   * Load from string content
   * @param content
   */
  static loadFromString(content: string): NetworkConfig | undefined {
    try {
      const values = t.parseNetworkConfig(yaml.load(content));
      return new NetworkConfig(values);
    } catch (e) {
      logger.error('Error parsing input, network config undefined');
      logger.error(`${e}`);
      throw new Error('could not load configuration.');
    }
  }
}
