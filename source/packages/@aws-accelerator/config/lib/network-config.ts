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

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

import { createLogger } from '@aws-accelerator/utils';

import * as t from './common-types';
import * as CustomizationsConfig from './customizations-config';

const logger = createLogger(['network-config']);

/**
 * Network configuration items.
 */

export class NetworkConfigTypes {
  static readonly defaultVpcsConfig = t.interface({
    delete: t.boolean,
    excludeAccounts: t.optional(t.array(t.string)),
  });

  static readonly transitGatewayRouteTableVpcEntryConfig = t.interface({
    account: t.nonEmptyString,
    vpcName: t.nonEmptyString,
  });

  static readonly transitGatewayRouteTableDxGatewayEntryConfig = t.interface({
    directConnectGatewayName: t.nonEmptyString,
  });

  static readonly transitGatewayRouteTableVpnEntryConfig = t.interface({
    vpnConnectionName: t.nonEmptyString,
  });

  static readonly transitGatewayRouteTableTgwPeeringEntryConfig = t.interface({
    transitGatewayPeeringName: t.nonEmptyString,
  });

  static readonly transitGatewayRouteEntryConfig = t.interface({
    destinationCidrBlock: t.optional(t.nonEmptyString),
    destinationPrefixList: t.optional(t.nonEmptyString),
    blackhole: t.optional(t.boolean),
    attachment: t.optional(
      t.union([
        this.transitGatewayRouteTableVpcEntryConfig,
        this.transitGatewayRouteTableDxGatewayEntryConfig,
        this.transitGatewayRouteTableVpnEntryConfig,
        this.transitGatewayRouteTableTgwPeeringEntryConfig,
      ]),
    ),
  });

  static readonly transitGatewayRouteTableConfig = t.interface({
    name: t.nonEmptyString,
    tags: t.optional(t.array(t.tag)),
    routes: t.array(this.transitGatewayRouteEntryConfig),
  });

  static readonly transitGatewayPeeringRequesterConfig = t.interface({
    transitGatewayName: t.nonEmptyString,
    account: t.nonEmptyString,
    region: t.region,
    routeTableAssociations: t.nonEmptyString,
    tags: t.optional(t.array(t.tag)),
  });

  static readonly transitGatewayPeeringAccepterConfig = t.interface({
    transitGatewayName: t.nonEmptyString,
    account: t.nonEmptyString,
    region: t.region,
    routeTableAssociations: t.nonEmptyString,
    autoAccept: t.optional(t.boolean),
    applyTags: t.optional(t.boolean),
  });

  static readonly transitGatewayPeeringConfig = t.interface({
    name: t.nonEmptyString,
    requester: NetworkConfigTypes.transitGatewayPeeringRequesterConfig,
    accepter: NetworkConfigTypes.transitGatewayPeeringAccepterConfig,
  });

  static readonly transitGatewayConfig = t.interface({
    name: t.nonEmptyString,
    account: t.nonEmptyString,
    region: t.region,
    shareTargets: t.optional(t.shareTargets),
    asn: t.number,
    dnsSupport: t.enableDisable,
    vpnEcmpSupport: t.enableDisable,
    defaultRouteTableAssociation: t.enableDisable,
    defaultRouteTablePropagation: t.enableDisable,
    autoAcceptSharingAttachments: t.enableDisable,
    routeTables: t.array(this.transitGatewayRouteTableConfig),
    tags: t.optional(t.array(t.tag)),
  });

  static readonly dxVirtualInterfaceTypeEnum = t.enums(
    'DxVirtualInterfaceType',
    ['private', 'transit'],
    'Must be a DX virtual interface type.',
  );

  static readonly ipVersionEnum = t.enums('IpVersionType', ['ipv4', 'ipv6']);

  static readonly dxVirtualInterfaceConfig = t.interface({
    name: t.nonEmptyString,
    connectionId: t.nonEmptyString,
    customerAsn: t.number,
    interfaceName: t.nonEmptyString,
    ownerAccount: t.nonEmptyString,
    region: t.region,
    type: this.dxVirtualInterfaceTypeEnum,
    vlan: t.number,
    addressFamily: t.optional(this.ipVersionEnum),
    amazonAddress: t.optional(t.nonEmptyString),
    customerAddress: t.optional(t.nonEmptyString),
    enableSiteLink: t.optional(t.boolean),
    jumboFrames: t.optional(t.boolean),
    tags: t.optional(t.array(t.tag)),
  });

  static readonly dxTransitGatewayAssociationConfig = t.interface({
    name: t.nonEmptyString,
    account: t.nonEmptyString,
    allowedPrefixes: t.array(t.nonEmptyString),
    routeTableAssociations: t.optional(t.array(t.nonEmptyString)),
    routeTablePropagations: t.optional(t.array(t.nonEmptyString)),
  });

  static readonly dxGatewayConfig = t.interface({
    name: t.nonEmptyString,
    account: t.nonEmptyString,
    asn: t.number,
    gatewayName: t.nonEmptyString,
    virtualInterfaces: t.optional(t.array(this.dxVirtualInterfaceConfig)),
    transitGatewayAssociations: t.optional(t.array(this.dxTransitGatewayAssociationConfig)),
  });

  static readonly ipamScopeConfig = t.interface({
    name: t.nonEmptyString,
    description: t.optional(t.nonEmptyString),
    tags: t.optional(t.array(t.tag)),
  });

  static readonly ipamPoolConfig = t.interface({
    name: t.nonEmptyString,
    addressFamily: t.optional(this.ipVersionEnum),
    scope: t.optional(t.nonEmptyString),
    allocationDefaultNetmaskLength: t.optional(t.number),
    allocationMaxNetmaskLength: t.optional(t.number),
    allocationMinNetmaskLength: t.optional(t.number),
    allocationResourceTags: t.optional(t.array(t.tag)),
    autoImport: t.optional(t.boolean),
    description: t.optional(t.nonEmptyString),
    locale: t.optional(t.region),
    provisionedCidrs: t.optional(t.array(t.nonEmptyString)),
    publiclyAdvertisable: t.optional(t.boolean),
    shareTargets: t.optional(t.shareTargets),
    sourceIpamPool: t.optional(t.nonEmptyString),
    tags: t.optional(t.array(t.tag)),
  });

  static readonly ipamConfig = t.interface({
    name: t.nonEmptyString,
    region: t.region,
    description: t.optional(t.nonEmptyString),
    operatingRegions: t.optional(t.array(t.region)),
    scopes: t.optional(t.array(this.ipamScopeConfig)),
    pools: t.optional(t.array(this.ipamPoolConfig)),
    tags: t.optional(t.array(t.tag)),
  });

  static readonly routeTableEntryTypeEnum = t.enums(
    'Type',
    [
      'transitGateway',
      'natGateway',
      'internetGateway',
      'local',
      'localGateway',
      'gatewayEndpoint',
      'gatewayLoadBalancerEndpoint',
      'networkInterface',
      'networkFirewall',
      'virtualPrivateGateway',
      'vpcPeering',
    ],
    'Value should be a route table target type',
  );

  static readonly gatewayRouteTableTypeEnum = t.enums(
    'GatewayType',
    ['internetGateway', 'virtualPrivateGateway'],
    'Value should be a route table gateway type.',
  );

  static readonly routeTableEntryConfig = t.interface({
    name: t.nonEmptyString,
    destination: t.optional(t.nonEmptyString),
    destinationPrefixList: t.optional(t.nonEmptyString),
    type: t.optional(this.routeTableEntryTypeEnum),
    target: t.optional(t.nonEmptyString),
    targetAvailabilityZone: t.optional(t.nonEmptyString),
  });

  static readonly routeTableConfig = t.interface({
    name: t.nonEmptyString,
    gatewayAssociation: t.optional(this.gatewayRouteTableTypeEnum),
    routes: t.optional(t.array(this.routeTableEntryConfig)),
    tags: t.optional(t.array(t.tag)),
  });

  static readonly ipamAllocationConfig = t.interface({
    ipamPoolName: t.nonEmptyString,
    netmaskLength: t.number,
  });

  static readonly subnetConfig = t.interface({
    name: t.nonEmptyString,
    availabilityZone: t.optional(t.nonEmptyString),
    routeTable: t.nonEmptyString,
    ipv4CidrBlock: t.optional(t.nonEmptyString),
    mapPublicIpOnLaunch: t.optional(t.boolean),
    ipamAllocation: t.optional(this.ipamAllocationConfig),
    shareTargets: t.optional(t.shareTargets),
    tags: t.optional(t.array(t.tag)),
    outpost: t.optional(t.nonEmptyString),
  });

  static readonly natGatewayConfig = t.interface({
    name: t.nonEmptyString,
    subnet: t.nonEmptyString,
    allocationId: t.optional(t.nonEmptyString),
    private: t.optional(t.boolean),
    tags: t.optional(t.array(t.tag)),
  });

  static readonly transitGatewayAttachmentTargetConfig = t.interface({
    name: t.nonEmptyString,
    account: t.nonEmptyString,
  });

  static readonly transitGatewayAttachmentOptionsConfig = t.interface({
    dnsSupport: t.optional(t.enableDisable),
    ipv6Support: t.optional(t.enableDisable),
    applianceModeSupport: t.optional(t.enableDisable),
  });

  static readonly transitGatewayAttachmentConfig = t.interface({
    name: t.nonEmptyString,
    transitGateway: this.transitGatewayAttachmentTargetConfig,
    subnets: t.array(t.nonEmptyString),
    options: t.optional(this.transitGatewayAttachmentOptionsConfig),
    routeTableAssociations: t.optional(t.array(t.nonEmptyString)),
    routeTablePropagations: t.optional(t.array(t.nonEmptyString)),
    tags: t.optional(t.array(t.tag)),
  });

  static readonly ipAddressFamilyEnum = t.enums(
    'IP Address Family',
    ['IPv4', 'IPv6'],
    'Value should be an ip address family type',
  );

  static readonly prefixListConfig = t.interface({
    name: t.nonEmptyString,
    accounts: t.optional(t.array(t.nonEmptyString)),
    regions: t.optional(t.array(t.region)),
    deploymentTargets: t.optional(t.deploymentTargets),
    addressFamily: this.ipAddressFamilyEnum,
    maxEntries: t.number,
    entries: t.array(t.nonEmptyString),
    tags: t.optional(t.array(t.tag)),
  });

  static readonly gatewayEndpointEnum = t.enums(
    'GatewayEndpointType',
    ['s3', 'dynamodb'],
    'Value should be a gateway endpoint type',
  );

  static readonly gatewayEndpointServiceConfig = t.interface({
    service: this.gatewayEndpointEnum,
    policy: t.optional(t.nonEmptyString),
  });

  static readonly gatewayEndpointConfig = t.interface({
    defaultPolicy: t.nonEmptyString,
    endpoints: t.array(this.gatewayEndpointServiceConfig),
  });

  static readonly interfaceEndpointServiceConfig = t.interface({
    service: t.nonEmptyString,
    serviceName: t.optional(t.nonEmptyString),
    policy: t.optional(t.nonEmptyString),
  });

  static readonly interfaceEndpointConfig = t.interface({
    defaultPolicy: t.nonEmptyString,
    endpoints: t.array(this.interfaceEndpointServiceConfig),
    subnets: t.array(t.nonEmptyString),
    central: t.optional(t.boolean),
    allowedCidrs: t.optional(t.array(t.nonEmptyString)),
  });

  static readonly securityGroupRuleTypeEnum = t.enums(
    'SecurityGroupRuleType',
    [
      'RDP',
      'SSH',
      'HTTP',
      'HTTPS',
      'MSSQL',
      'MYSQL/AURORA',
      'REDSHIFT',
      'POSTGRESQL',
      'ORACLE-RDS',
      'TCP',
      'UDP',
      'ICMP',
      'ALL',
    ],
    'Value should be a security group rule type',
  );

  static readonly subnetSourceConfig = t.interface({
    account: t.nonEmptyString,
    vpc: t.nonEmptyString,
    subnets: t.array(t.nonEmptyString),
  });

  static readonly securityGroupSourceConfig = t.interface({
    securityGroups: t.array(t.nonEmptyString),
  });

  static readonly prefixListSourceConfig = t.interface({
    prefixLists: t.array(t.nonEmptyString),
  });

  static readonly securityGroupRuleConfig = t.interface({
    description: t.nonEmptyString,
    types: t.optional(t.array(this.securityGroupRuleTypeEnum)),
    tcpPorts: t.optional(t.array(t.number)),
    udpPorts: t.optional(t.array(t.number)),
    fromPort: t.optional(t.number),
    toPort: t.optional(t.number),
    sources: t.array(
      t.union([t.nonEmptyString, this.subnetSourceConfig, this.securityGroupSourceConfig, this.prefixListSourceConfig]),
    ),
  });

  static readonly securityGroupConfig = t.interface({
    name: t.nonEmptyString,
    description: t.optional(t.nonEmptyString),
    inboundRules: t.array(this.securityGroupRuleConfig),
    outboundRules: t.array(this.securityGroupRuleConfig),
    tags: t.optional(t.array(t.tag)),
  });

  static readonly instanceTenancyTypeEnum = t.enums(
    'InstanceTenancy',
    ['default', 'dedicated'],
    'Value should be an instance tenancy type',
  );

  static readonly networkAclSubnetSelection = t.interface({
    account: t.nonEmptyString,
    vpc: t.nonEmptyString,
    subnet: t.nonEmptyString,
    region: t.optional(t.region),
  });

  static readonly networkAclInboundRuleConfig = t.interface({
    rule: t.number,
    protocol: t.number,
    fromPort: t.number,
    toPort: t.number,
    action: t.allowDeny,
    source: t.union([t.nonEmptyString, this.networkAclSubnetSelection]),
  });

  static readonly networkAclOutboundRuleConfig = t.interface({
    rule: t.number,
    protocol: t.number,
    fromPort: t.number,
    toPort: t.number,
    action: t.allowDeny,
    destination: t.union([t.nonEmptyString, this.networkAclSubnetSelection]),
  });

  static readonly networkAclConfig = t.interface({
    name: t.nonEmptyString,
    subnetAssociations: t.array(t.nonEmptyString),
    inboundRules: t.optional(t.array(this.networkAclInboundRuleConfig)),
    outboundRules: t.optional(t.array(this.networkAclOutboundRuleConfig)),
    tags: t.optional(t.array(t.tag)),
  });

  static readonly netbiosNodeEnum = t.enums('NetbiosNodeTypeEnum', [1, 2, 4, 8]);

  static readonly dhcpOptsConfig = t.interface({
    name: t.nonEmptyString,
    accounts: t.array(t.nonEmptyString),
    regions: t.array(t.region),
    domainName: t.optional(t.nonEmptyString),
    domainNameServers: t.optional(t.array(t.nonEmptyString)),
    netbiosNameServers: t.optional(t.array(t.nonEmptyString)),
    netbiosNodeType: t.optional(this.netbiosNodeEnum),
    ntpServers: t.optional(t.array(t.nonEmptyString)),
    tags: t.optional(t.array(t.tag)),
  });

  static readonly mutationProtectionEnum = t.enums('MutationProtectionTypeEnum', ['ENABLED', 'DISABLED']);

  static readonly vpcDnsFirewallAssociationConfig = t.interface({
    name: t.nonEmptyString,
    priority: t.number,
    mutationProtection: t.optional(this.mutationProtectionEnum),
    tags: t.optional(t.array(t.tag)),
  });

  static readonly endpointPolicyConfig = t.interface({
    name: t.nonEmptyString,
    document: t.nonEmptyString,
  });

  static readonly localGatewayRouteTableConfig = t.interface({
    name: t.nonEmptyString,
    id: t.nonEmptyString,
  });

  static readonly localGatewayConfig = t.interface({
    name: t.nonEmptyString,
    id: t.nonEmptyString,
    routeTables: t.array(this.localGatewayRouteTableConfig),
  });

  static readonly outpostsConfig = t.interface({
    name: t.nonEmptyString,
    arn: t.nonEmptyString,
    availabilityZone: t.nonEmptyString,
    localGateway: t.optional(this.localGatewayConfig),
  });

  static readonly vpnTunnelOptionsSpecificationsConfig = t.interface({
    preSharedKey: t.optional(t.nonEmptyString),
    tunnelInsideCidr: t.optional(t.nonEmptyString),
  });

  static readonly vpnConnectionConfig = t.interface({
    name: t.nonEmptyString,
    transitGateway: t.optional(t.nonEmptyString),
    routeTableAssociations: t.optional(t.array(t.nonEmptyString)),
    routeTablePropagations: t.optional(t.array(t.nonEmptyString)),
    staticRoutesOnly: t.optional(t.boolean),
    vpc: t.optional(t.nonEmptyString),
    tunnelSpecifications: t.optional(t.array(this.vpnTunnelOptionsSpecificationsConfig)),
    tags: t.optional(t.array(t.tag)),
  });

  static readonly customerGatewayConfig = t.interface({
    name: t.nonEmptyString,
    account: t.nonEmptyString,
    region: t.region,
    ipAddress: t.nonEmptyString,
    asn: t.number,
    tags: t.optional(t.array(t.tag)),
    vpnConnections: t.optional(t.array(this.vpnConnectionConfig)),
  });

  static readonly virtualPrivateGatewayConfig = t.interface({
    asn: t.number,
  });

  static readonly loadBalancersConfig = t.interface({
    applicationLoadBalancers: t.optional(
      t.array(CustomizationsConfig.CustomizationsConfigTypes.applicationLoadBalancerConfig),
    ),
    networkLoadBalancers: t.optional(t.array(CustomizationsConfig.CustomizationsConfigTypes.networkLoadBalancerConfig)),
  });

  static readonly vpcConfig = t.interface({
    name: t.nonEmptyString,
    account: t.nonEmptyString,
    region: t.region,
    cidrs: t.optional(t.array(t.nonEmptyString)),
    defaultSecurityGroupRulesDeletion: t.optional(t.boolean),
    dhcpOptions: t.optional(t.nonEmptyString),
    dnsFirewallRuleGroups: t.optional(t.array(this.vpcDnsFirewallAssociationConfig)),
    enableDnsHostnames: t.optional(t.boolean),
    enableDnsSupport: t.optional(t.boolean),
    gatewayEndpoints: t.optional(this.gatewayEndpointConfig),
    instanceTenancy: t.optional(this.instanceTenancyTypeEnum),
    interfaceEndpoints: t.optional(this.interfaceEndpointConfig),
    internetGateway: t.optional(t.boolean),
    ipamAllocations: t.optional(t.array(this.ipamAllocationConfig)),
    natGateways: t.optional(t.array(this.natGatewayConfig)),
    useCentralEndpoints: t.optional(t.boolean),
    securityGroups: t.optional(t.array(this.securityGroupConfig)),
    networkAcls: t.optional(t.array(this.networkAclConfig)),
    queryLogs: t.optional(t.array(t.nonEmptyString)),
    resolverRules: t.optional(t.array(t.nonEmptyString)),
    routeTables: t.optional(t.array(this.routeTableConfig)),
    subnets: t.optional(t.array(this.subnetConfig)),
    transitGatewayAttachments: t.optional(t.array(this.transitGatewayAttachmentConfig)),
    tags: t.optional(t.array(t.tag)),
    outposts: t.optional(t.array(this.outpostsConfig)),
    virtualPrivateGateway: t.optional(this.virtualPrivateGatewayConfig),
    vpcFlowLogs: t.optional(t.vpcFlowLogsConfig),
    loadBalancers: t.optional(this.loadBalancersConfig),
    targetGroups: t.optional(t.array(CustomizationsConfig.CustomizationsConfigTypes.targetGroupItem)),
  });

  static readonly vpcTemplatesConfig = t.interface({
    name: t.nonEmptyString,
    region: t.region,
    deploymentTargets: t.deploymentTargets,
    cidrs: t.optional(t.array(t.nonEmptyString)),
    defaultSecurityGroupRulesDeletion: t.optional(t.boolean),
    dhcpOptions: t.optional(t.nonEmptyString),
    dnsFirewallRuleGroups: t.optional(t.array(this.vpcDnsFirewallAssociationConfig)),
    enableDnsHostnames: t.optional(t.boolean),
    enableDnsSupport: t.optional(t.boolean),
    gatewayEndpoints: t.optional(this.gatewayEndpointConfig),
    instanceTenancy: t.optional(this.instanceTenancyTypeEnum),
    interfaceEndpoints: t.optional(this.interfaceEndpointConfig),
    internetGateway: t.optional(t.boolean),
    ipamAllocations: t.optional(t.array(this.ipamAllocationConfig)),
    natGateways: t.optional(t.array(this.natGatewayConfig)),
    useCentralEndpoints: t.optional(t.boolean),
    securityGroups: t.optional(t.array(this.securityGroupConfig)),
    networkAcls: t.optional(t.array(this.networkAclConfig)),
    queryLogs: t.optional(t.array(t.nonEmptyString)),
    resolverRules: t.optional(t.array(t.nonEmptyString)),
    routeTables: t.optional(t.array(this.routeTableConfig)),
    subnets: t.optional(t.array(this.subnetConfig)),
    transitGatewayAttachments: t.optional(t.array(this.transitGatewayAttachmentConfig)),
    virtualPrivateGateway: t.optional(this.virtualPrivateGatewayConfig),
    tags: t.optional(t.array(t.tag)),
    vpcFlowLogs: t.optional(t.vpcFlowLogsConfig),
    loadBalancers: t.optional(this.loadBalancersConfig),
    targetGroups: t.optional(t.array(CustomizationsConfig.CustomizationsConfigTypes.targetGroupItem)),
  });

  static readonly ruleTypeEnum = t.enums('ResolverRuleType', ['FORWARD', 'RECURSIVE', 'SYSTEM']);

  static readonly ruleTargetIps = t.interface({
    ip: t.nonEmptyString,
    port: t.optional(t.nonEmptyString),
  });

  static readonly resolverRuleConfig = t.interface({
    name: t.nonEmptyString,
    domainName: t.nonEmptyString,
    excludedRegions: t.optional(t.array(t.region)),
    inboundEndpointTarget: t.optional(t.nonEmptyString),
    ruleType: t.optional(this.ruleTypeEnum),
    shareTargets: t.optional(t.shareTargets),
    targetIps: t.optional(t.array(this.ruleTargetIps)),
    tags: t.optional(t.array(t.tag)),
  });

  static readonly resolverEndpointTypeEnum = t.enums('ResolverEndpointType', ['INBOUND', 'OUTBOUND']);

  static readonly resolverEndpointConfig = t.interface({
    name: t.nonEmptyString,
    type: this.resolverEndpointTypeEnum,
    vpc: t.nonEmptyString,
    subnets: t.array(t.nonEmptyString),
    allowedCidrs: t.optional(t.array(t.nonEmptyString)),
    rules: t.optional(t.array(this.resolverRuleConfig)),
    tags: t.optional(t.array(t.tag)),
  });

  static readonly dnsQueryLogsConfig = t.interface({
    name: t.nonEmptyString,
    destinations: t.array(t.logDestinationTypeEnum),
    shareTargets: t.optional(t.shareTargets),
  });

  static readonly dnsFirewallRuleActionTypeEnum = t.enums('DnsFirewallRuleAction', ['ALLOW', 'ALERT', 'BLOCK']);

  static readonly dnsFirewallBlockResponseTypeEnum = t.enums('DnsFirewallBlockResponseType', [
    'NODATA',
    'NXDOMAIN',
    'OVERRIDE',
  ]);

  static readonly dnsFirewallManagedDomainListEnum = t.enums('DnsFirewallManagedDomainLists', [
    'AWSManagedDomainsBotnetCommandandControl',
    'AWSManagedDomainsMalwareDomainList',
  ]);

  static readonly dnsFirewallRulesConfig = t.interface({
    name: t.nonEmptyString,
    action: this.dnsFirewallRuleActionTypeEnum,
    priority: t.number,
    blockOverrideDomain: t.optional(t.nonEmptyString),
    blockOverrideTtl: t.optional(t.number),
    blockResponse: t.optional(this.dnsFirewallBlockResponseTypeEnum),
    customDomainList: t.optional(t.nonEmptyString),
    managedDomainList: t.optional(this.dnsFirewallManagedDomainListEnum),
  });

  static readonly dnsFirewallRuleGroupConfig = t.interface({
    name: t.nonEmptyString,
    regions: t.array(t.region),
    rules: t.array(this.dnsFirewallRulesConfig),
    shareTargets: t.optional(t.shareTargets),
    tags: t.optional(t.array(t.tag)),
  });

  static readonly resolverConfig = t.interface({
    endpoints: t.optional(t.array(this.resolverEndpointConfig)),
    firewallRuleGroups: t.optional(t.array(this.dnsFirewallRuleGroupConfig)),
    queryLogs: t.optional(this.dnsQueryLogsConfig),
    rules: t.optional(t.array(this.resolverRuleConfig)),
  });

  static readonly nfwRuleType = t.enums('NfwRuleType', ['STATEFUL', 'STATELESS']);

  static readonly nfwGeneratedRulesType = t.enums('NfwGeneratedRulesType', ['ALLOWLIST', 'DENYLIST']);

  static readonly nfwTargetType = t.enums('NfwTargetType', ['TLS_SNI', 'HTTP_HOST']);

  static readonly nfwStatefulRuleActionType = t.enums('NfwStatefulRuleActionType', ['ALERT', 'DROP', 'PASS']);

  static readonly nfwStatefulRuleDirectionType = t.enums('NfwStatefulRuleDirectionType', ['ANY', 'FORWARD']);

  static readonly nfwStatefulRuleProtocolType = t.enums('NfwStatefulRuleProtocolType', [
    'DCERPC',
    'DHCP',
    'DNS',
    'FTP',
    'HTTP',
    'ICMP',
    'IKEV2',
    'IMAP',
    'IP',
    'KRB5',
    'MSN',
    'NTP',
    'SMB',
    'SMTP',
    'SSH',
    'TCP',
    'TFTP',
    'TLS',
    'UDP',
  ]);

  static readonly nfwStatelessRuleActionType = t.enums('NfwStatelessRuleActionType', [
    'aws:pass',
    'aws:drop',
    'aws:forward_to_sfe',
  ]);

  static readonly nfwStatefulDefaultActionType = t.enums('NfwStatefulDefaultActionType', [
    'aws:drop_strict',
    'aws:drop_established',
    'aws:alert_strict',
    'aws:alert_established',
  ]);

  static readonly nfwStatelessRuleTcpFlagType = t.enums('NfwStatelessRuleTcpFlagType', [
    'FIN',
    'SYN',
    'RST',
    'PSH',
    'ACK',
    'URG',
    'ECE',
    'CWR',
  ]);

  static readonly nfwStatefulRuleOptionsType = t.enums('NfwStatefulRuleOptionsType', [
    'DEFAULT_ACTION_ORDER',
    'STRICT_ORDER',
  ]);

  static readonly nfwLogType = t.enums('NfwLogType', ['ALERT', 'FLOW']);

  static readonly nfwRuleSourceListConfig = t.interface({
    generatedRulesType: this.nfwGeneratedRulesType,
    targets: t.array(t.nonEmptyString),
    targetTypes: t.array(this.nfwTargetType),
  });

  static readonly nfwRuleSourceStatefulRuleHeaderConfig = t.interface({
    destination: t.nonEmptyString,
    destinationPort: t.nonEmptyString,
    direction: this.nfwStatefulRuleDirectionType,
    protocol: this.nfwStatefulRuleProtocolType,
    source: t.nonEmptyString,
    sourcePort: t.nonEmptyString,
  });

  static readonly nfwRuleSourceStatefulRuleOptionsConfig = t.interface({
    keyword: t.nonEmptyString,
    settings: t.optional(t.array(t.nonEmptyString)),
  });

  static readonly nfwRuleSourceStatefulRuleConfig = t.interface({
    action: this.nfwStatefulRuleActionType,
    header: this.nfwRuleSourceStatefulRuleHeaderConfig,
    ruleOptions: t.array(this.nfwRuleSourceStatefulRuleOptionsConfig),
  });

  static readonly nfwRuleSourceCustomActionDimensionConfig = t.interface({
    dimensions: t.array(t.nonEmptyString),
  });

  static readonly nfwRuleSourceCustomActionDefinitionConfig = t.interface({
    publishMetricAction: this.nfwRuleSourceCustomActionDimensionConfig,
  });

  static readonly nfwRuleSourceCustomActionConfig = t.interface({
    actionDefinition: this.nfwRuleSourceCustomActionDefinitionConfig,
    actionName: t.nonEmptyString,
  });

  static readonly nfwRuleSourceStatelessPortRangeConfig = t.interface({
    fromPort: t.number,
    toPort: t.number,
  });

  static readonly nfwRuleSourceStatelessTcpFlagsConfig = t.interface({
    flags: t.array(this.nfwStatelessRuleTcpFlagType),
    masks: t.array(this.nfwStatelessRuleTcpFlagType),
  });

  static readonly nfwRuleSourceStatelessMatchAttributesConfig = t.interface({
    destinationPorts: t.optional(t.array(this.nfwRuleSourceStatelessPortRangeConfig)),
    destinations: t.optional(t.array(t.nonEmptyString)),
    protocols: t.optional(t.array(t.number)),
    sourcePorts: t.optional(t.array(this.nfwRuleSourceStatelessPortRangeConfig)),
    sources: t.optional(t.array(t.nonEmptyString)),
    tcpFlags: t.optional(t.array(this.nfwRuleSourceStatelessTcpFlagsConfig)),
  });

  static readonly nfwRuleSourceStatelessRuleDefinitionConfig = t.interface({
    actions: t.array(t.union([t.nonEmptyString, this.nfwStatelessRuleActionType])),
    matchAttributes: this.nfwRuleSourceStatelessMatchAttributesConfig,
  });

  static readonly nfwRuleSourceStatelessRuleConfig = t.interface({
    priority: t.number,
    ruleDefinition: this.nfwRuleSourceStatelessRuleDefinitionConfig,
  });

  static readonly nfwStatelessRulesAndCustomActionsConfig = t.interface({
    statelessRules: t.array(this.nfwRuleSourceStatelessRuleConfig),
    customActions: t.optional(t.array(this.nfwRuleSourceCustomActionConfig)),
  });

  static readonly nfwRuleSourceConfig = t.interface({
    rulesSourceList: t.optional(this.nfwRuleSourceListConfig),
    rulesString: t.optional(t.nonEmptyString),
    statefulRules: t.optional(t.array(this.nfwRuleSourceStatefulRuleConfig)),
    statelessRulesAndCustomActions: t.optional(this.nfwStatelessRulesAndCustomActionsConfig),
    rulesFile: t.optional(t.nonEmptyString),
  });

  static readonly nfwRuleVariableDefinitionConfig = t.interface({
    name: t.nonEmptyString,
    definition: t.array(t.nonEmptyString),
  });

  static readonly nfwRuleVariableConfig = t.interface({
    ipSets: t.union([this.nfwRuleVariableDefinitionConfig, t.array(this.nfwRuleVariableDefinitionConfig)]),
    portSets: t.union([this.nfwRuleVariableDefinitionConfig, t.array(this.nfwRuleVariableDefinitionConfig)]),
  });

  static readonly nfwRuleGroupRuleConfig = t.interface({
    rulesSource: this.nfwRuleSourceConfig,
    ruleVariables: t.optional(this.nfwRuleVariableConfig),
    statefulRuleOptions: t.optional(this.nfwStatefulRuleOptionsType),
  });

  static readonly nfwRuleGroupConfig = t.interface({
    name: t.nonEmptyString,
    regions: t.array(t.region),
    capacity: t.number,
    type: this.nfwRuleType,
    description: t.optional(t.nonEmptyString),
    ruleGroup: t.optional(this.nfwRuleGroupRuleConfig),
    shareTargets: t.optional(t.shareTargets),
    tags: t.optional(t.array(t.tag)),
  });

  static readonly nfwStatefulRuleGroupReferenceConfig = t.interface({
    name: t.nonEmptyString,
    priority: t.optional(t.number),
  });

  static readonly nfwStatelessRuleGroupReferenceConfig = t.interface({
    name: t.nonEmptyString,
    priority: t.number,
  });

  static readonly nfwFirewallPolicyPolicyConfig = t.interface({
    statefulDefaultActions: t.optional(t.array(this.nfwStatefulDefaultActionType)),
    statefulEngineOptions: t.optional(this.nfwStatefulRuleOptionsType),
    statefulRuleGroups: t.optional(t.array(this.nfwStatefulRuleGroupReferenceConfig)),
    statelessCustomActions: t.optional(t.array(this.nfwRuleSourceCustomActionConfig)),
    statelessDefaultActions: t.array(t.union([this.nfwStatelessRuleActionType, t.nonEmptyString])),
    statelessFragmentDefaultActions: t.array(t.union([this.nfwStatelessRuleActionType, t.nonEmptyString])),
    statelessRuleGroups: t.optional(t.array(this.nfwStatelessRuleGroupReferenceConfig)),
  });

  static readonly nfwFirewallPolicyConfig = t.interface({
    name: t.nonEmptyString,
    firewallPolicy: this.nfwFirewallPolicyPolicyConfig,
    regions: t.array(t.region),
    description: t.optional(t.nonEmptyString),
    shareTargets: t.optional(t.shareTargets),
    tags: t.optional(t.array(t.tag)),
  });

  static readonly nfwLoggingConfig = t.interface({
    destination: t.logDestinationTypeEnum,
    type: this.nfwLogType,
  });

  static readonly nfwFirewallConfig = t.interface({
    name: t.nonEmptyString,
    firewallPolicy: t.nonEmptyString,
    subnets: t.array(t.nonEmptyString),
    vpc: t.nonEmptyString,
    deleteProtection: t.optional(t.boolean),
    description: t.optional(t.nonEmptyString),
    firewallPolicyChangeProtection: t.optional(t.boolean),
    subnetChangeProtection: t.optional(t.boolean),
    loggingConfiguration: t.optional(t.array(this.nfwLoggingConfig)),
    tags: t.optional(t.array(t.tag)),
  });

  static readonly nfwConfig = t.interface({
    firewalls: t.array(this.nfwFirewallConfig),
    policies: t.array(this.nfwFirewallPolicyConfig),
    rules: t.array(this.nfwRuleGroupConfig),
  });

  static readonly gwlbEndpointConfig = t.interface({
    name: t.nonEmptyString,
    account: t.nonEmptyString,
    subnet: t.nonEmptyString,
    vpc: t.nonEmptyString,
  });

  static readonly gwlbConfig = t.interface({
    name: t.nonEmptyString,
    endpoints: t.array(this.gwlbEndpointConfig),
    subnets: t.array(t.nonEmptyString),
    vpc: t.nonEmptyString,
    crossZoneLoadBalancing: t.optional(t.boolean),
    deletionProtection: t.optional(t.boolean),
    targetGroup: t.optional(t.nonEmptyString),
    tags: t.optional(t.array(t.tag)),
  });

  static readonly centralNetworkServicesConfig = t.interface({
    delegatedAdminAccount: t.nonEmptyString,
    gatewayLoadBalancers: t.optional(t.array(this.gwlbConfig)),
    ipams: t.optional(t.array(this.ipamConfig)),
    route53Resolver: t.optional(this.resolverConfig),
    networkFirewall: t.optional(this.nfwConfig),
  });

  static readonly vpcPeeringConfig = t.interface({
    name: t.nonEmptyString,
    vpcs: t.array(t.nonEmptyString),
    tags: t.optional(t.array(t.tag)),
  });

  static readonly elbAccountIdsConfig = t.interface({
    region: t.nonEmptyString,
    accountId: t.nonEmptyString,
  });

  static readonly firewallManagerNotificationChannelConfig = t.interface({
    snsTopic: t.nonEmptyString,
    region: t.nonEmptyString,
  });

  static readonly firewallManagerServiceConfig = t.interface({
    delegatedAdminAccount: t.nonEmptyString,
    notificationChannels: t.optional(t.array(this.firewallManagerNotificationChannelConfig)),
  });

  static readonly certificateConfigTypeEnum = t.enums('CertificateTypeEnum', ['import', 'request']);

  static readonly certificateValidationEnum = t.enums('CertificateRequestValidationEnum', ['EMAIL', 'DNS']);
  static readonly certificateConfig = t.interface({
    name: t.nonEmptyString,
    type: this.certificateConfigTypeEnum,
    privKey: t.optional(t.nonEmptyString),
    cert: t.optional(t.nonEmptyString),
    chain: t.optional(t.nonEmptyString),
    validation: t.optional(this.certificateValidationEnum),
    domain: t.optional(t.nonEmptyString),
    san: t.optional(t.array(t.nonEmptyString)),
    deploymentTargets: t.deploymentTargets,
  });

  static readonly networkConfig = t.interface({
    defaultVpc: this.defaultVpcsConfig,
    endpointPolicies: t.array(this.endpointPolicyConfig),
    transitGateways: t.array(this.transitGatewayConfig),
    transitGatewayPeering: t.optional(t.array(NetworkConfigTypes.transitGatewayPeeringConfig)),
    vpcs: t.array(this.vpcConfig),
    vpcFlowLogs: t.optional(t.vpcFlowLogsConfig),
    centralNetworkServices: t.optional(this.centralNetworkServicesConfig),
    customerGateways: t.optional(t.array(this.customerGatewayConfig)),
    dhcpOptions: t.optional(t.array(this.dhcpOptsConfig)),
    directConnectGateways: t.optional(t.array(this.dxGatewayConfig)),
    prefixLists: t.optional(t.array(this.prefixListConfig)),
    vpcPeering: t.optional(t.array(this.vpcPeeringConfig)),
    vpcTemplates: t.optional(t.array(this.vpcTemplatesConfig)),
    elbAccountIds: t.optional(t.array(this.elbAccountIdsConfig)),
    firewallManagerService: t.optional(this.firewallManagerServiceConfig),
    certificates: t.optional(t.array(this.certificateConfig)),
  });
}

/**
 * *{@link NetworkConfig} / {@link DefaultVpcsConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/default-vpc.html | Default Virtual Private Cloud (VPC)} configuration.
 * Use this configuration to delete default VPCs in your environment.
 *
 * @remarks
 * If there are resources with network interfaces (such as EC2 instances) in your default VPCs, enabling this option
 * will cause a core pipeline failure. Please clean up any dependencies before
 * enabling this option.
 *
 * @example
 * ```
 * defaultVpc:
 *   delete: true
 *   excludeAccounts: []
 * ```
 */
export class DefaultVpcsConfig implements t.TypeOf<typeof NetworkConfigTypes.defaultVpcsConfig> {
  /**
   * Enable to delete default VPCs.
   */
  readonly delete = false;
  /**
   * Include an array of friendly account names
   * to exclude from default VPC deletion.
   *
   * @remarks
   * Note: This is the logical name for accounts as defined in accounts-config.yaml.
   */
  readonly excludeAccounts: string[] | undefined = [];
}

/**
 * *{@link NetworkConfig} / {@link TransitGatewayConfig} / {@link TransitGatewayRouteTableConfig} / {@link TransitGatewayRouteEntryConfig} / {@link TransitGatewayRouteTableVpcEntryConfig}*
 *
 * Transit Gateway VPC static route entry configuration.
 * Use this configuration to define an account and VPC name as a target for Transit Gateway static route entries.
 *
 * @remarks
 * The targeted VPC must have a Transit Gateway attachment defined. @see {@link TransitGatewayAttachmentConfig}
 *
 * @example
 * ```
 * account: Network
 * vpcName: Network-Inspection
 * ```
 */
export class TransitGatewayRouteTableVpcEntryConfig
  implements t.TypeOf<typeof NetworkConfigTypes.transitGatewayRouteTableVpcEntryConfig>
{
  /**
   * The friendly name of the account where the VPC resides.
   *
   * @remarks
   * Note: This is the logical `name` property for the account as defined in accounts-config.yaml.
   */
  readonly account: string = '';
  /**
   * The friendly name of the VPC.
   *
   * @remarks
   * Note: This is the logical `name` property for the VPC as defined in network-config.yaml.
   */
  readonly vpcName: string = '';
}

/**
 * *{@link NetworkConfig} / {@link TransitGatewayConfig} / {@link TransitGatewayRouteTableConfig} / {@link TransitGatewayRouteEntryConfig} / {@link TransitGatewayRouteTableDxGatewayEntryConfig}*
 *
 * Transit Gateway Direct Connect Gateway static route entry configuration.
 * Use this configuration to define a Direct Connect Gateway attachment as a target for Transit
 * Gateway static routes.
 *
 * @remarks
 * The targeted Direct Connect Gateway must have a Transit Gateway association defined. @see {@link DxTransitGatewayAssociationConfig}
 *
 * @example
 * ```
 * directConnectGatewayName: Accelerator-DXGW
 * ```
 */
export class TransitGatewayRouteTableDxGatewayEntryConfig
  implements t.TypeOf<typeof NetworkConfigTypes.transitGatewayRouteTableDxGatewayEntryConfig>
{
  /**
   * The name of the Direct Connect Gateway
   *
   * @remarks
   * Note: This is the logical `name` property of the Direct Connect Gateway as defined in network-config.yaml. Do not use `gatewayName`.
   */
  readonly directConnectGatewayName: string = '';
}

/**
 * *{@link NetworkConfig} / {@link TransitGatewayConfig} / {@link TransitGatewayRouteTableConfig} / {@link TransitGatewayRouteEntryConfig} / {@link TransitGatewayRouteTableVpnEntryConfig}*
 *
 * Transit Gateway VPN static route entry configuration.
 * Use this configuration to define a VPN attachment as a target for Transit
 * Gateway static routes.
 *
 * @remarks
 * The targeted VPN must have a Transit Gateway attachment defined. @see {@link VpnConnectionConfig}
 *
 * @example
 * ```
 * vpnConnectionName: accelerator-vpc
 * ```
 */
export class TransitGatewayRouteTableVpnEntryConfig
  implements t.TypeOf<typeof NetworkConfigTypes.transitGatewayRouteTableVpnEntryConfig>
{
  /**
   * The name of the VPN connection
   *
   * @remarks
   * Note: This is the `name` property of the VPN connection as defined in network-config.yaml.
   */
  readonly vpnConnectionName: string = '';
}

/**
 * *{@link NetworkConfig} / {@link TransitGatewayConfig} / {@link TransitGatewayRouteTableConfig} / {@link TransitGatewayRouteEntryConfig} / {@link TransitGatewayRouteTableTgwPeeringEntryConfig}*
 *
 * Transit Gateway peering static route entry configuration.
 * Used to define a peering attachment as a target for Transit
 * Gateway static routes.
 *
 * @remarks
 * The targeted peering attachment must be defined in network-config.yaml. @see {@link TransitGatewayPeeringConfig}
 *
 * @example
 * ```
 * transitGatewayPeeringName: Accelerator-TGW-Peering
 * ```
 */
export class TransitGatewayRouteTableTgwPeeringEntryConfig
  implements t.TypeOf<typeof NetworkConfigTypes.transitGatewayRouteTableTgwPeeringEntryConfig>
{
  /**
   * The name of the Transit Gateway peering connection
   *
   * @remarks
   * Note: This is the logical `name` property of the Transit Gateway peering connection as defined in network-config.yaml.
   *
   * @see {@link TransitGatewayPeeringConfig}
   */
  readonly transitGatewayPeeringName: string = '';
}

/**
 * *{@link NetworkConfig} / {@link TransitGatewayConfig} / {@link TransitGatewayRouteTableConfig} / {@link TransitGatewayRouteEntryConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/tgw/how-transit-gateways-work.html#tgw-routing-overview | Transit Gateway static route entry} configuration.
 * Use this configuration to define static route entries in a Transit Gateway route table.
 *
 * @example
 * Destination CIDR:
 * ```
 * - destinationCidrBlock: 0.0.0.0/0
 *   attachment:
 *     account: Network
 *     vpcName: Network-Inspection
 * ```
 * Destination prefix list:
 * ```
 * - destinationPrefixList: accelerator-pl
 *   attachment:
 *     vpnConnectionName: accelerator-vpn
 * ```
 * Blackhole route:
 * ```
 * - destinationCidrBlock: 1.1.1.1/32
 *   blackhole: true
 * ```
 */
export class TransitGatewayRouteEntryConfig
  implements t.TypeOf<typeof NetworkConfigTypes.transitGatewayRouteEntryConfig>
{
  /**
   * The destination CIDR block for the route table entry.
   *
   * @remarks
   * Use CIDR notation, i.e. 10.0.0.0/16. Leave undefined if specifying a destination prefix list.
   *
   */
  readonly destinationCidrBlock: string | undefined = undefined;
  /**
   * The friendly name of a prefix list for the route table entry.
   *
   * @remarks
   * This is the logical `name` property of a prefix list as defined in network-config.yaml.
   * Leave undefined if specifying a CIDR destination.
   *
   * @see {@link PrefixListConfig}
   */
  readonly destinationPrefixList: string | undefined = undefined;
  /**
   * (OPTIONAL) Enable to create a blackhole for the destination CIDR.
   * Leave undefined if specifying a VPC destination.
   */
  readonly blackhole: boolean | undefined = undefined;
  /**
   * The target {@link https://docs.aws.amazon.com/vpc/latest/tgw/working-with-transit-gateways.html | Transit Gateway attachment} for the route table entry. Supported attachment types include:
   *
   * - VPC
   * - Direct Connect Gateway
   * - VPN
   * - Transit Gateway Peering
   *
   * @remarks
   * **CAUTION**: Changing the attachment type or target after initial deployment creates a new route table entry.
   * To avoid core pipeline failures, use multiple core pipeline runs to 1) delete the existing route entry and then 2) add the new route entry.
   *
   * Note: Leave undefined if specifying a blackhole destination.
   *
   * @see {@link TransitGatewayRouteTableVpcEntryConfig} {@link TransitGatewayRouteTableDxGatewayEntryConfig} {@link TransitGatewayRouteTableVpnEntryConfig}
   */
  readonly attachment:
    | TransitGatewayRouteTableVpcEntryConfig
    | TransitGatewayRouteTableDxGatewayEntryConfig
    | TransitGatewayRouteTableVpnEntryConfig
    | TransitGatewayRouteTableTgwPeeringEntryConfig
    | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link TransitGatewayConfig} / {@link TransitGatewayRouteTableConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/tgw/how-transit-gateways-work.html#tgw-routing-overview | Transit Gateway route table} configuration.
 * Use this configuration define route tables for your Transit Gateway. Route tables are used to configure
 * routing behaviors for your Transit Gateway.
 *
 * The following example creates a TGW route table called Network-Main-Shared with no static route entries:
 * @example
 * ```
 * - name: Network-Main-Shared
 *   routes: []
 * ```
 */
export class TransitGatewayRouteTableConfig
  implements t.TypeOf<typeof NetworkConfigTypes.transitGatewayRouteTableConfig>
{
  /**
   * A friendly name for the Transit Gateway route table.
   *
   * @remarks
   * **CAUTION**: Changing this property after initial deployment will cause a route table recreation.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: string = '';
  /**
   * (OPTIONAL) An array of tag objects for the Transit Gateway route table.
   */
  readonly tags: t.Tag[] | undefined = undefined;
  /**
   * An array of Transit Gateway route entry configuration objects.
   *
   * @see {@link TransitGatewayRouteEntryConfig}
   */
  readonly routes: TransitGatewayRouteEntryConfig[] = [];
}

/**
 * *{@link NetworkConfig} / {@link TransitGatewayPeeringConfig} / {@link TransitGatewayPeeringRequesterConfig}*
 *
 * Transit Gateway (TGW) peering requester configuration.
 * Use this configuration to define the requester side of the peering attachment.
 *
 * @example
 * ```
 * transitGatewayName: SharedServices-Main
 * account: SharedServices
 * region: us-west-2
 * routeTableAssociations: SharedServices-Main-Core
 * tags:
 *   - key: Name
 *     value: Network-Main-And-SharedServices-Main-Peering
 * ```
 */
export class TransitGatewayPeeringRequesterConfig
  implements t.TypeOf<typeof NetworkConfigTypes.transitGatewayPeeringRequesterConfig>
{
  /**
   * The friendly name of the requester transit gateway
   *
   * @remarks
   * This is the logical `name` property of the requester transit gateway as defined in network-config.yaml.
   *
   * **CAUTION**: Changing this property after initial deployment will cause the peering attachment to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * @see {@link TransitGatewayConfig}
   */
  readonly transitGatewayName: string = '';
  /**
   * The friendly name of the account of the requester transit gateway
   *
   * @remarks
   * This is the logical `account` property of the requester transit gateway as defined in network-config.yaml.
   *
   * @see {@link TransitGatewayConfig}
   */
  readonly account: string = '';
  /**
   * The name of the region the accepter transit gateway resides in
   *
   * @see {@link TransitGatewayConfig}
   */
  readonly region: t.Region = 'us-east-1';
  /**
   * The friendly name of TGW route table to associate with this peering attachment.
   *
   * @remarks
   * This is the logical `name` property of a route table for the requester TGW as defined in network-config.yaml.
   *
   * @see {@link TransitGatewayRouteTableConfig}
   */
  readonly routeTableAssociations: string = '';
  /**
   * (OPTIONAL) An array of tag objects for the Transit Gateway Peering.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link TransitGatewayPeeringConfig} / {@link TransitGatewayPeeringAccepterConfig}*
 *
 * Transit Gateway (TGW) peering accepter configuration.
 * Use this configuration to define the accepter side of the peering attachment.
 *
 * @example
 * ```
 * transitGatewayName: Network-Main
 * account: Network
 * region: us-east-1
 * routeTableAssociations: Network-Main-Core
 * autoAccept: true
 * applyTags: false
 * ```
 */
export class TransitGatewayPeeringAccepterConfig
  implements t.TypeOf<typeof NetworkConfigTypes.transitGatewayPeeringAccepterConfig>
{
  /**
   *  The friendly name of the accepter transit gateway
   *
   * @remarks
   * This is the logical `name` property of the accepter transit gateway as defined in network-config.yaml.
   *
   * **CAUTION**: Changing this property after initial deployment will cause the peering attachment to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * @see {@link TransitGatewayConfig}
   */
  readonly transitGatewayName: string = '';
  /**
   * The friendly name of the account of the accepter transit gateway
   *
   * @remarks
   * This is the logical `account` property of the accepter transit gateway as defined in network-config.yaml.
   *
   * @see {@link TransitGatewayConfig}
   */
  readonly account: string = '';
  /**
   * The name of the region the accepter transit gateway resides in
   *
   * @see {@link TransitGatewayConfig}
   */
  readonly region: t.Region = 'us-east-1';
  /**
   * The friendly name of TGW route table to associate with this peering attachment.
   *
   * @remarks
   * This is the logical `name` property of a route table for the accepter TGW as defined in network-config.yaml.
   *
   * @see {@link TransitGatewayRouteTableConfig}
   */
  readonly routeTableAssociations: string = '';
  /**
   * (OPTIONAL) Peering request auto accept flag.
   * Note: When this flag is set to `true`, the peering request will be automatically
   * accepted by the accelerator.
   */
  readonly autoAccept: boolean | undefined = undefined;
  /**
   * (OPTIONAL) Peering request apply tags flag.
   * Note: When this flag is set to `true`, the requester attachment tags are replicated
   * to the accepter attachment.
   */
  readonly applyTags: boolean | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link TransitGatewayPeeringConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/tgw/how-transit-gateways-work.html#tgw-route-table-peering | Transit Gateway (TGW) peering} configuration.
 * Use this configuration to define a peering attachment between two TGWs.
 *
 * @remarks
 * Use autoAccept `true` if you'd like the accelerator to automatically accept the peering attachment
 * Use applyTags `true' if you'd like the requester attachment tags to be replicated to the accepter attachment
 *
 * Note: accepter property autoAccept and applyTags are optional. Default value for autoAccept is `true` and applyTags is `false`.
 *
 * The following example creates a cross-account and cross-region peering connection
 * between a requester TGW named SharedServices-Main and accepter TGW named Network-Main:
 * @example
 * ```
 * transitGatewayPeering:
 *  - name: Network-Main-And-SharedServices-Main-Peering
 *    autoAccept: false
 *    requester:
 *      transitGatewayName: SharedServices-Main
 *      account: SharedServices
 *      region: us-west-2
 *      routeTableAssociations: SharedServices-Main-Core
 *      tags:
 *        - key: Name
 *          value: Network-Main-And-SharedServices-Main-Peering
 *    accepter:
 *      transitGatewayName: Network-Main
 *      account: Network
 *      region: us-east-1
 *      routeTableAssociations: Network-Main-Core
 *      autoAccept: true
 *      applyTags: false
 *
 * ```
 */
export class TransitGatewayPeeringConfig implements t.TypeOf<typeof NetworkConfigTypes.transitGatewayPeeringConfig> {
  /**
   * The friendly name of TGW peering.
   */
  readonly name: string = '';
  /**
   * Peering attachment requester configuration.
   *
   * @see {@link TransitGatewayPeeringRequesterConfig}
   */
  readonly requester = new TransitGatewayPeeringRequesterConfig();
  /**
   * Peering attachment accepter configuration
   *
   * @see {@link TransitGatewayPeeringAccepterConfig}
   */
  readonly accepter = new TransitGatewayPeeringAccepterConfig();
}

/**
 * *{@link NetworkConfig} / {@link TransitGatewayConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/tgw/what-is-transit-gateway.html | Transit Gateway (TGW)} configuration.
 * Use this configuration to define Transit Gateways for your environment.
 * A transit gateway acts as a virtual router for traffic flowing between your virtual private clouds (VPCs) and on-premises networks.
 *
 * The following example creates a TGW called Network-Main in the Network account in the us-east-1 region.
 * @example
 * ```
 * transitGateways:
 *   - name: Network-Main
 *     account: Network
 *     region: us-east-1
 *     shareTargets:
 *       organizationalUnits: []
 *     asn: 65000
 *     dnsSupport: enable
 *     vpnEcmpSupport: enable
 *     defaultRouteTableAssociation: disable
 *     defaultRouteTablePropagation: disable
 *     autoAcceptSharingAttachments: enable
 *     routeTables: []
 *     tags: []
 * ```
 */
export class TransitGatewayConfig implements t.TypeOf<typeof NetworkConfigTypes.transitGatewayConfig> {
  /**
   * A friendly name for the Transit Gateway.
   *
   * @remarks
   * **CAUTION**: Changing this value after initial deployment will cause the Transit Gateway to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: string = '';
  /**
   * The friendly name of the account to deploy the Transit Gateway.
   *
   * @remarks
   * This is the logical `name` property of the account as defined in accounts-config.yaml.
   */
  readonly account: string = '';
  /**
   * The region name to deploy the Transit Gateway.
   */
  readonly region: t.Region = 'us-east-1';
  /**
   * (OPTIONAL) Resource Access Manager (RAM) share targets.
   *
   * @remarks
   * Targets can be account names and/or organizational units.
   *
   * @see {@link ShareTargets}
   */
  readonly shareTargets: t.ShareTargets | undefined = undefined;
  /**
   * A Border Gateway Protocol (BGP) Autonomous System Number (ASN).
   *
   * @remarks
   * **CAUTION**: Changing this value after initial deployment will cause the Transit Gateway to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * The range is 64512 to 65534 for 16-bit ASNs.
   *
   * The range is 4200000000 to 4294967294 for 32-bit ASNs.
   */
  readonly asn: number = 65521;
  /**
   * Configure DNS support between VPCs.
   *
   * @remarks
   * Enable this option if you need the VPC to resolve public IPv4 DNS host names
   * to private IPv4 addresses when queried from instances in another VPC attached
   * to the transit gateway.
   */
  readonly dnsSupport: t.EnableDisable = 'enable';
  /**
   * Equal Cost Multipath (ECMP) routing support between VPN tunnels.
   *
   * @remarks
   * Enable this option if you need Equal Cost Multipath (ECMP) routing support between VPN tunnels.
   * If connections advertise the same CIDRs, the traffic is distributed equally between them.
   */
  readonly vpnEcmpSupport: t.EnableDisable = 'enable';
  /**
   * Configure default route table association.
   *
   * @remarks
   * Enable this option to automatically associate transit gateway attachments with the default
   * route table for the transit gateway.
   */
  readonly defaultRouteTableAssociation: t.EnableDisable = 'enable';
  /**
   * Configure default route table propagation.
   *
   * @remarks
   * Enable this option to automatically propagate transit gateway attachments to the default
   * route table for the transit gateway.
   */
  readonly defaultRouteTablePropagation: t.EnableDisable = 'enable';
  /**
   * Enable this option to automatically accept cross-account attachments.
   */
  readonly autoAcceptSharingAttachments: t.EnableDisable = 'disable';
  /**
   * An array of Transit Gateway route table configuration objects.
   *
   * @see {@link TransitGatewayRouteTableConfig}
   */
  readonly routeTables: TransitGatewayRouteTableConfig[] = [];
  /**
   * (OPTIONAL) An array of tag objects for the Transit Gateway.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link DxGatewayConfig} / {@link DxVirtualInterfaceConfig}*
 *
 * {@link https://docs.aws.amazon.com/directconnect/latest/UserGuide/Welcome.html#overview-components | Direct Connect (DX) virtual interface (VIF)} configuration.
 * Use this configuration to create a virtual interface to a DX Gateway. Virtual interfaces
 * enable access to your AWS services from your on-premises environment.
 *
 * The following example creates a transit VIF called Accelerator-VIF in the Network account
 * on a DX connection with resource ID dxcon-example:
 * @example
 * ```
 * - name: Accelerator-VIF
 *   region: us-east-1
 *   connectionId: dxcon-example
 *   customerAsn: 64512
 *   interfaceName: Accelerator-VIF
 *   ownerAccount: Network
 *   type: transit
 *   vlan: 100
 * ```
 */
export class DxVirtualInterfaceConfig implements t.TypeOf<typeof NetworkConfigTypes.dxVirtualInterfaceConfig> {
  /**
   * A friendly name for the virtual interface. This name
   * is used as a logical reference for the resource in
   * the accelerator.
   *
   * @remarks
   * **CAUTION**: Changing this value after initial deployment
   * will cause the virtual interface to be recreated.
   * Please be aware that any downstream dependencies may cause
   * this property update to fail.
   */
  readonly name: string = '';
  /**
   * The resource ID of the {@link https://docs.aws.amazon.com/directconnect/latest/UserGuide/Welcome.html#overview-components | DX connection}
   * the virtual interface will be created on
   *
   * @remarks
   * This is the resource ID of an existing DX connection in your environment. Resource IDs should be the the format `dxcon-xxxxxx`
   */
  readonly connectionId: string = '';
  /**
   * A Border Gateway Protocol (BGP) Autonomous System Number (ASN) for the customer side of the connection.
   *
   * @remarks
   * This ASN must be unique from the Amazon side ASN.
   * The ASN for the Amazon side is determined by the DX Gateway it is created on.
   *
   * Note: The valid values are 1 to 2147483647
   */
  readonly customerAsn: number = 64512;
  /**
   * The name of the virtual interface.
   * This name will show as the name of the resource
   * in the AWS console and API.
   *
   * @remarks
   * This name can be changed without replacing the physical resource.
   */
  readonly interfaceName: string = '';
  /**
   * The friendly name of the owning account of the DX connection.
   *
   * @remarks
   * Please note this is the owning account of the **physical** DX connection, not the virtual interface.
   *
   * If specifying an account that differs from the account of the Direct Connect Gateway, this will
   * create a {@link https://docs.aws.amazon.com/directconnect/latest/UserGuide/WorkingWithVirtualInterfaces.html#hosted-vif | hosted VIF allocation}
   *  from the connection owner account to the Direct Connect Gateway owner account.
   * Hosted VIFs must be manually confirmed before they can be used or updated by the accelerator.
   */
  readonly ownerAccount: string = '';
  /**
   * The region of the virtual interface.
   *
   * @remarks
   * Please note this region must match the region where the physical connection is hosted.
   */
  readonly region: t.Region = 'us-east-1';
  /**
   * The type of the virtual interface
   *
   * @remarks
   * `private` virtual interfaces can only be created on DX gateways associated with virtual private gateways.
   *
   * `transit` virtual interfaces can only be created on DX gateways associated with transit gateways.
   */
  readonly type: t.TypeOf<typeof NetworkConfigTypes.dxVirtualInterfaceTypeEnum> = 'transit';
  /**
   * The virtual local area network (VLAN) tag to use for this virtual interface.
   *
   * @remarks
   * This must be a unique VLAN tag that's not already in use on your connection.
   *
   * The value must be between 1 and 4094
   */
  readonly vlan: number = 1;
  /**
   * (OPTIONAL) The address family to use for this virtual interface.
   *
   * Default - ipv4
   */
  readonly addressFamily: t.TypeOf<typeof NetworkConfigTypes.ipVersionEnum> | undefined = undefined;
  /**
   * (OPTIONAL) The peer IP address to use for Amazon's side of the virtual interface.
   *
   * Default - randomly-generated by Amazon
   */
  readonly amazonAddress: string | undefined = undefined;
  /**
   * (OPTIONAL) The peer IP address to use for customer's side of the virtual interface.
   *
   * Default - randomly-generated by Amazon
   */
  readonly customerAddress: string | undefined = undefined;
  /**
   * (OPTIONAL) Enable SiteLink for this virtual interface.
   *
   * Default - false
   */
  readonly enableSiteLink: boolean | undefined = undefined;
  /**
   * (OPTIONAL) Enable jumbo frames for the virtual interface.
   *
   * Default - standard 1500 MTU frame size
   */
  readonly jumboFrames: boolean | undefined = undefined;
  /**
   * (OPTIONAL) An array of tags to apply to the virtual interface.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link DxGatewayConfig} / {@link DxTransitGatewayAssociationConfig}*
 *
 * {@link https://docs.aws.amazon.com/directconnect/latest/UserGuide/direct-connect-transit-gateways.html | Direct Connect Gateway transit gateway association} configuration.
 * Use this configuration to define transit gateway attachments for a DX gateway.
 *
 * @example
 * ```
 * - name: Network-Main
 *   account: Network
 *   allowedPrefixes:
 *     - 10.0.0.0/8
 *     - 192.168.0.0/24
 *   routeTableAssociations:
 *     - Network-Main-Core
 *   routeTablePropagations:
 *     - Network-Main-Core
 *     - Network-Main-Shared
 *     - Network-Main-Segregated
 * ```
 */
export class DxTransitGatewayAssociationConfig
  implements t.TypeOf<typeof NetworkConfigTypes.dxTransitGatewayAssociationConfig>
{
  /**
   * The friendly name of the transit gateway to associate.
   *
   * @remarks
   * This is the logical `name` property of the transit gateway as defined in network-config.yaml.
   */
  readonly name: string = '';
  /**
   * The friendly name of the account the transit gateway is deployed to.
   *
   * @remarks
   * This is the `account` property of the transit gateway as defined in network-config.yaml.
   *
   * If specifying an account that differs from the account of the Direct Connect Gateway, this will
   * create an {@link https://docs.aws.amazon.com/directconnect/latest/UserGuide/multi-account-associate-tgw.html | association proposal}
   * from the transit gateway owner account to the Direct Connect Gateway owner account.
   * Proposals must be manually approved. Proposal associations **cannot** also have configured transit gateway
   * route table associations or propagations.
   */
  readonly account: string = '';
  /**
   * An array of CIDR prefixes that are allowed to advertise over this transit gateway association.
   *
   * @remarks
   * Use CIDR notation, i.e. 10.0.0.0/16
   *
   * @see {@link https://docs.aws.amazon.com/directconnect/latest/UserGuide/allowed-to-prefixes.html}
   */
  readonly allowedPrefixes: string[] = [];
  /**
   * (OPTIONAL) The friendly name of TGW route table(s) to associate with this attachment.
   *
   * @remarks
   * This is the logical `name` property of the route table(s) as defined in network-config.yaml.
   * @see {@link TransitGatewayRouteTableConfig}
   */
  readonly routeTableAssociations: string[] | undefined = undefined;
  /**
   * (OPTIONAL) The friendly name of TGW route table(s) to propagate routes from this attachment.
   *
   * @remarks
   * This is the logical `name` property of the route table(s) as defined in network-config.yaml.
   * @see {@link TransitGatewayRouteTableConfig}
   */
  readonly routeTablePropagations: string[] | undefined = undefined;
}
/**
 * *{@link NetworkConfig} / {@link DxGatewayConfig}*
 *
 * {@link https://docs.aws.amazon.com/directconnect/latest/UserGuide/direct-connect-gateways-intro.html | Direct Connect Gateway (DXGW)} configuration.
 * Use this configuration to define DXGWs,
 * {@link https://docs.aws.amazon.com/directconnect/latest/UserGuide/Welcome.html#overview-components | virtual interfaces},
 * and {@link https://docs.aws.amazon.com/directconnect/latest/UserGuide/direct-connect-gateways.html | DXGW associations}.
 * A DXGW is a globally-available resource than can be used to connect your VPCs to your on-premise infrastructure.
 *
 * @example
 * ```
 * directConnectGateways:
 *   - name: Accelerator-DXGW
 *     account: Network
 *     asn: 64512
 *     gatewayName: Accelerator-DXGW
 *     virtualInterfaces: []
 *     transitGatewayAssociations: []
 * ```
 */
export class DxGatewayConfig implements t.TypeOf<typeof NetworkConfigTypes.dxGatewayConfig> {
  /**
   * A friendly name for the DX Gateway.
   * This name is used as a logical reference
   * for the resource in the accelerator.
   *
   * @remarks
   * **CAUTION**: Changing this value after initial deployment
   * will cause the DXGW to be recreated.
   * Please be aware that any downstream dependencies may cause
   * this property update to fail.
   */
  readonly name: string = '';
  /**
   * The friendly name of the account to deploy the DX Gateway.
   *
   * @remarks
   * This is the logical `name` property of the account as defined in accounts-config.yaml.
   */
  readonly account: string = '';
  /**
   * A Border Gateway Protocol (BGP) Autonomous System Number (ASN).
   *
   * @remarks
   * The range is 64512 to 65534 for 16-bit ASNs.
   *
   * The range is 4200000000 to 4294967294 for 32-bit ASNs.
   */
  readonly asn: number = 64512;
  /**
   * The name of the Direct Connect Gateway.
   * This name will show as the name of the resource
   * in the AWS console and API.
   *
   * @remarks
   * This name can be changed without replacing the physical resource.
   */
  readonly gatewayName: string = '';
  /**
   * (OPTIONAL) An array of virtual interface configurations. Creates virtual interfaces on the DX gateway.
   *
   * @see {@link DxVirtualInterfaceConfig}
   */
  readonly virtualInterfaces: DxVirtualInterfaceConfig[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of transit gateway association configurations. Creates transit gateway attachments for this DX gateway.
   *
   * @see {@link DxTransitGatewayAssociationConfig}
   */
  readonly transitGatewayAssociations: DxTransitGatewayAssociationConfig[] | undefined = undefined;
}
/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link IpamConfig} / {@link IpamScopeConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/ipam/add-scope-ipam.html | VPC IPAM scope} configuration.
 * Use this configuration to define custom private IPAM scopes for your VPCs.
 * An IPAM scope is the highest-level container for an IPAM. Within scopes, pools can be created.
 * Custom IPAM scopes can be used to create pools and manage resources that use the same IP space.
 *
 * @example
 * ```
 * - name: accelerator-scope
 *   description: Custom scope
 *   tags: []
 * ```
 */
export class IpamScopeConfig implements t.TypeOf<typeof NetworkConfigTypes.ipamScopeConfig> {
  /**
   * A friendly name for the IPAM scope.
   *
   * @remarks
   * **CAUTION**: Changing this value after initial deployment
   * will cause the scope to be recreated.
   * Please be aware that any downstream dependencies may cause
   * this property update to fail.
   */
  readonly name: string = '';
  /**
   * (OPTIONAL) Description for the IPAM scope.
   */
  readonly description: string | undefined = undefined;
  /**
   * (OPTIONAL) An array of tag objects for the IPAM scope.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link IpamConfig} / {@link IpamPoolConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/ipam/how-it-works-ipam.html | VPC IPAM pool} configuration.
 * Use this configuration to define custom IPAM pools for your VPCs. A pool is a collection of contiguous
 * IP address ranges. IPAM pools enable you to organize your IP addresses according to your routing and security needs.
 *
 * @example
 * Base pool:
 * ```
 * - name: accelerator-base-pool
 *   description: Base IPAM pool
 *   provisionedCidrs:
 *     - 10.0.0.0/16
 *   tags: []
 * ```
 * Regional pool:
 * ```
 * - name: accelerator-regional-pool
 *   description: Regional pool for us-east-1
 *   locale: us-east-1
 *   provisionedCidrs:
 *     - 10.0.0.0/24
 *   sourceIpamPool: accelerator-base-pool
 * ```
 */
export class IpamPoolConfig implements t.TypeOf<typeof NetworkConfigTypes.ipamPoolConfig> {
  /**
   * The address family for the IPAM pool.
   *
   * @remarks
   * The default value is `ipv4`.
   *
   * @see {@link NetworkConfigTypes.ipVersionEnum}
   */
  readonly addressFamily: t.TypeOf<typeof NetworkConfigTypes.ipVersionEnum> | undefined = 'ipv4';
  /**
   * A friendly name for the IPAM pool.
   *
   * @remarks
   * **CAUTION**: Changing this value after initial deployment
   * will cause the pool to be recreated.
   * Please be aware that any downstream dependencies may cause
   * this property update to fail.
   */
  readonly name: string = '';
  /**
   * (OPTIONAL) The friendly name of the IPAM scope to assign the IPAM pool to.
   *
   * @remarks
   * Note: This is the logical `name` property of the scope as defined in network-config.yaml.
   * Leave this property undefined to create the pool in the default private scope.
   *
   * @see {@link IpamScopeConfig}
   */
  readonly scope: string | undefined = undefined;
  /**
   * (OPTIONAL) The default netmask length of IPAM allocations for this pool.
   *
   * @remarks
   * Setting this property will enforce a default netmask length for all IPAM allocations in this pool.
   */
  readonly allocationDefaultNetmaskLength: number | undefined = undefined;
  /**
   * (OPTIONAL) The maximum netmask length of IPAM allocations for this pool.
   *
   * @remarks
   * Setting this property will enforce a maximum netmask length for all IPAM allocations in this pool.
   * This value must be larger than the `allocationMinNetmaskLength` value.
   */
  readonly allocationMaxNetmaskLength: number | undefined = undefined;
  /**
   * (OPTIONAL) The minimum netmask length of IPAM allocations for this pool.
   *
   * @remarks
   * Setting this property will enforce a minimum netmask length for all IPAM allocations in this pool.
   * This value must be less than the `allocationMaxNetmaskLength` value.
   */
  readonly allocationMinNetmaskLength: number | undefined = undefined;
  /**
   * (OPTIONAL) An array of tags that are required for resources that use CIDRs from this IPAM pool.
   *
   * @remarks
   * Resources that do not have these tags will not be allowed to allocate space from the pool.
   */
  readonly allocationResourceTags: t.Tag[] | undefined = undefined;
  /**
   * (OPTIONAL) If set to `true`, IPAM will continuously look for resources within the CIDR range of this pool
   * and automatically import them as allocations into your IPAM.
   */
  readonly autoImport: boolean | undefined = undefined;
  /**
   * (OPTIONAL) A description for the IPAM pool.
   */
  readonly description: string | undefined = undefined;
  /**
   * (OPTIONAL) The AWS Region where you want to make an IPAM pool available for allocations.
   *
   * @remarks
   * **CAUTION**: Changing this value after initial deployment
   * will cause the pool to be recreated.
   * Please be aware that any downstream dependencies may cause
   * this property update to fail.
   *
   * Only resources in the same Region as the locale of the pool can get IP address allocations from the pool.
   * A base (top-level) pool does not require a locale.
   * A regional pool requires a locale.
   */
  readonly locale: t.Region | undefined = undefined;
  /**
   * An array of CIDR ranges to provision for the IPAM pool.
   *
   * @remarks
   * **CAUTION**: Changing or removing an existing provisioned CIDR range after initial deployment may impact downstream VPC allocations.
   * Appending additional provisioned CIDR ranges does not impact downstream resources.
   *
   * Use CIDR notation, i.e. 10.0.0.0/16.
   * If defining a regional pool, the provisioned CIDRs must be a subset of the source IPAM pool's CIDR ranges.
   */
  readonly provisionedCidrs: string[] | undefined = undefined;
  /**
   * (OPTIONAL) Determines if a pool is publicly advertisable.
   *
   * @remarks
   * This option is not available for pools with AddressFamily set to ipv4.
   */
  readonly publiclyAdvertisable: boolean | undefined = undefined;
  /**
   * (OPTIONAL) Resource Access Manager (RAM) share targets.
   *
   * @remarks
   * Targets can be account names and/or organizational units.
   * Pools must be shared to any accounts/OUs that require IPAM allocations.
   * The pool does not need to be shared with the delegated administrator account.
   *
   * @see {@link ShareTargets}
   */
  readonly shareTargets: t.ShareTargets = new t.ShareTargets();
  /**
   * (OPTIONAL) The friendly name of the source IPAM pool to create this IPAM pool from.
   *
   * @remarks
   * Only define this value when creating regional IPAM pools. Leave undefined for top-level pools.
   */
  readonly sourceIpamPool: string | undefined = undefined;
  /**
   * (OPTIONAL) An array of tag objects for the IPAM pool.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link IpamConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/ipam/what-it-is-ipam.html | Virtual Private Cloud (VPC) IP Address Manager (IPAM)} configuration.
 * Use this configuration to define an AWS-managed VPC IPAM.
 * IPAM is a feature that makes it easier for you to plan, track, and monitor IP addresses for your AWS workloads.
 *
 * The following example defines an IPAM that is capable of operating in the us-east-1 and us-west-2 regions:
 * @example
 * ```
 * ipams:
 *   - name: accelerator-ipam
 *     region: us-east-1
 *     description: Accelerator IPAM
 *     operatingRegions:
 *       - us-east-1
 *       - us-west-2
 *     scopes: []
 *     pools: []
 *     tags: []
 * ```
 */
export class IpamConfig implements t.TypeOf<typeof NetworkConfigTypes.ipamConfig> {
  /**
   * A friendly name for the IPAM.
   *
   * @remarks
   * **CAUTION**: Changing this value after initial deployment will cause the IPAM to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: string = '';
  /**
   * The region to deploy the IPAM.
   *
   * @remarks
   * Note that IPAMs must be deployed to a single region but may be used to manage allocations in multiple regions.
   * Configure the `operatingRegions` property to define multiple regions to manage.
   */
  readonly region: t.Region = 'us-east-1';
  /**
   * (OPTIONAL) A description for the IPAM.
   */
  readonly description: string | undefined = undefined;
  /**
   * (OPTIONAL) An array of regions that the IPAM will manage.
   */
  readonly operatingRegions: t.Region[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of IPAM scope configurations to create under the IPAM.
   *
   * @see {@link IpamScopeConfig}
   */
  readonly scopes: IpamScopeConfig[] | undefined = undefined;
  /**
   * An optional array of IPAM pool configurations to create under the IPAM.
   *
   * @see {@link IpamPoolConfig}
   */
  readonly pools: IpamPoolConfig[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of tag objects for the IPAM.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link RouteTableConfig} / {@link RouteTableEntryConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Route_Tables.html | VPC route table} static route entry configuration.
 * Use this configuration to define static route entries in a VPC subnet or gateway route table.
 * Static routes are used determine traffic flow from your subnet to a defined destination address and target.
 *
 * @example
 * Transit Gateway Attachment
 * ```
 * - name: TgwRoute
 *   destination: 0.0.0.0/0
 *   type: transitGateway
 *   target: Network-Main
 * ```
 *
 * @example
 * NAT Gateway
 * ```
 * - name: NatRoute
 *   destination: 0.0.0.0/0
 *   type: natGateway
 *   target: Nat-A
 * ```
 *
 * @example
 * Internet Gateway
 * ```
 * - name: IgwRoute
 *   destination: 0.0.0.0/0
 *   type: internetGateway
 * ```
 *
 * @example
 * VPC Peering
 * ```
 * - name: PeerRoute
 *   destination: 10.0.0.0/16
 *   type: vpcPeering
 *   target: Peering
 * ```
 *
 * @example
 * Network Firewall
 * ```
 * - name: NfwRoute
 *   destination: 0.0.0.0/0
 *   type: networkFirewall
 *   target: accelerator-firewall
 *   targetAvailabilityZone: a
 * ```
 *
 * @example
 * Gateway Load Balancer Endpoint
 * ```
 * - name: GwlbRoute
 *   destination: 0.0.0.0/0
 *   type: gatewayLoadBalancerEndpoint
 *   target: Endpoint-A
 * ```
 */
export class RouteTableEntryConfig implements t.TypeOf<typeof NetworkConfigTypes.routeTableEntryConfig> {
  /**
   * A friendly name for the route table.
   *
   * @remarks
   * **CAUTION**: Changing this value after initial deployment will cause the route table to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   */
  readonly name: string = '';
  /**
   * (OPTIONAL) The destination CIDR block for the route table entry.
   *
   * @remarks
   * Use CIDR notation, i.e. 10.0.0.0/16
   *
   * Either `destination` or `destinationPrefixList` must be specified for the following route entry types:
   * `transitGateway`, `natGateway`, `internetGateway`, `networkInterface`, `vpcPeering`, `virtualPrivateGateway`.
   *
   * `destination` MUST be specified for route entry type `networkFirewall` or `gatewayLoadBalancerEndpoint`.
   *
   * Note: Leave undefined for route entry type `gatewayEndpoint`.
   */
  readonly destination: string | undefined = undefined;
  /**
   * The friendly name of the destination prefix list for the route table entry.
   *
   * @remarks
   * This is the logical `name` property of the prefix list as defined in network-config.yaml.
   *
   * Either `destination` or `destinationPrefixList` must be specified for the following route entry types:
   * `transitGateway`, `natGateway`, `internetGateway`, `networkInterface`, `vpcPeering`, `virtualPrivateGateway`.
   *
   * Cannot be specified for route entry type `networkFirewall` or `gatewayLoadBalancerEndpoint`. Use `destination` instead.
   *
   * Note: Leave undefined for route entry type `gatewayEndpoint`.
   *
   * @see {@link PrefixListConfig}
   */
  readonly destinationPrefixList: string | undefined = undefined;
  /**
   * The destination type of route table entry.
   *
   * @see {@link NetworkConfigTypes.routeTableEntryTypeEnum}
   */
  readonly type: t.TypeOf<typeof NetworkConfigTypes.routeTableEntryTypeEnum> | undefined = undefined;
  /**
   * The friendly name of the destination target.
   *
   * @remarks
   * Use `s3` or `dynamodb` as the string when specifying a route entry type of `gatewayEndpoint`.
   *
   * This is the logical `name` property of other target types as defined in network-config.yaml.
   *
   * Note: Leave undefined for route entry type `internetGateway` or `virtualPrivateGateway`.
   */
  readonly target: string | undefined = undefined;
  /**
   * The Availability Zone (AZ) the target resides in.
   *
   * @remarks
   * Include only the letter of the AZ name (i.e. 'a' for 'us-east-1a').
   *
   * Note: Leave undefined for targets of route entry types other than `networkFirewall`.
   */
  readonly targetAvailabilityZone: string | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link RouteTableConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Route_Tables.html | Virtual Private Cloud (VPC) route table} configuration.
 * Use this configuration to define custom route tables for your VPC.
 * Route tables contain a set of rules, called routes, to determine where network traffic from a subnet or gateway is directed.
 *
 * @example Subnet route table
 * ```
 * - name: SubnetRouteTable
 *   routes: []
 *   tags: []
 * ```
 * @example Gateway route table
 * ```
 * - name: GatewayRouteTable
 *   gatewayAssociation: internetGateway
 *   routes: []
 *   tags: []
 * ```
 */
export class RouteTableConfig implements t.TypeOf<typeof NetworkConfigTypes.routeTableConfig> {
  /**
   * A friendly name for the VPC route table.
   *
   * @remarks
   * **CAUTION**: Changing this value after initial deployment will cause the route table to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: string = '';
  /**
   * Designate a gateway to associate this route table with.
   *
   * @remarks
   * Note: Only define this property when creating a gateway route table. Leave undefined for subnet route tables.
   */
  readonly gatewayAssociation: t.TypeOf<typeof NetworkConfigTypes.gatewayRouteTableTypeEnum> | undefined = undefined;
  /**
   * An array of VPC route table entry configuration objects.
   *
   * @see {@link RouteTableEntryConfig}
   */
  readonly routes: RouteTableEntryConfig[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of tag objects for the VPC route table.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link SubnetConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/configure-subnets.html | Virtual Private Cloud (VPC) subnet} configuration.
 * Use this configuration to define subnets for your VPC.
 * A subnet is a range of IP addresses in your VPC that can be used to create AWS resources, such as EC2 instances.
 *
 * @example
 * Static CIDR:
 * ```
 * - name: accelerator-cidr-subnet-a
 *   availabilityZone: a
 *   routeTable: accelerator-cidr-subnet-a
 *   ipv4CidrBlock: 10.0.0.0/26
 *   tags: []
 * ```
 * IPAM allocation:
 * ```
 * - name: accelerator-ipam-subnet-a
 *   availabilityZone: a
 *   routeTable: accelerator-cidr-subnet-a
 *   ipamAllocation:
 *     ipamPoolName: accelerator-regional-pool
 *     netmaskLength: 26
 *   tags: []
 * ```
 */
export class SubnetConfig implements t.TypeOf<typeof NetworkConfigTypes.subnetConfig> {
  /**
   * A friendly name for the VPC subnet.
   *
   * @remarks
   * **CAUTION**: changing this property after initial deployment will cause a subnet recreation.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: string = '';
  /**
   * The Availability Zone (AZ) the subnet resides in.
   *
   * @remarks
   * **CAUTION**: changing this property after initial deployment will cause a subnet recreation.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * Include only the letter of the AZ name (i.e. 'a' for 'us-east-1a').
   * Note: Not needed if providing an outpost, otherwise required.
   */
  readonly availabilityZone: string | undefined = undefined;
  /**
   * The friendly name of the route table to associate with the subnet.
   */
  readonly routeTable: string = '';
  /**
   * The IPAM pool configuration for the subnet.
   *
   * @see {@link IpamAllocationConfig}
   *
   * @remarks
   * Must be using AWS-managed IPAM and allocate a CIDR to the VPC this subnet will be created in.
   * Define IPAM configuration in `centralNetworkServices`. @see {@link CentralNetworkServicesConfig}
   */
  readonly ipamAllocation: IpamAllocationConfig | undefined = undefined;
  /**
   * The IPv4 CIDR block to associate with the subnet.
   *
   * @remarks
   * **CAUTION**: changing this property after initial deployment will cause a subnet recreation.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * Use CIDR notation, i.e. 10.0.0.0/16
   */
  readonly ipv4CidrBlock: string | undefined = undefined;
  /**
   * (OPTIONAL) Configure automatic mapping of public IPs.
   *
   * @remarks
   * Enables you to configure the auto-assign IP settings to automatically request a public
   * IPv4 address for a new network interface in this subnet.
   */
  readonly mapPublicIpOnLaunch: boolean | undefined = undefined;
  /**
   * (OPTIONAL) Resource Access Manager (RAM) share targets.
   *
   * @remarks
   * NOTE: When sharing subnets, security groups created in this VPC will be automatically replicated
   * to the share target accounts. If tags are configured for the VPC and/or subnet, they are also replicated.
   *
   * @see {@link SecurityGroupConfig}
   *
   * Targets can be account names and/or organizational units.
   *
   * @see {@link ShareTargets}
   */
  readonly shareTargets: t.ShareTargets | undefined = undefined;
  /**
   * (OPTIONAL) An array of tag objects for the VPC subnet.
   */
  readonly tags: t.Tag[] | undefined = undefined;
  /**
   * (OPTIONAL) The friendly name for the outpost to attach to the subnet
   *
   * @remarks
   * This is the logical `name` of the outpost as defined in network-config.yaml.
   *
   * @see {@link OutpostsConfig}
   */
  readonly outpost: string | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link NatGatewayConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html | Network Address Translation (NAT) Gateway} configuration.
 * Use this configuration to define AWS-managed NAT Gateways for your VPC.
 * You can use a NAT gateway so that instances in a private subnet can connect to services outside your VPCs.
 *
 * @example
 * NAT gateway with accelerator-provisioned elastic IP
 * ```
 * - name: accelerator-nat-gw
 *   subnet: accelerator-cidr-subnet-a
 *   tags: []
 * ```
 *
 * NAT gateway with user-provided elastic IP allocation ID
 * ```
 * - name: accelerator-nat-gw
 *   allocationId: eipalloc-acbdefg123456
 *   subnet: accelerator-cidr-subnet-a
 *   tags: []
 * ```
 *
 * NAT gateway with private connectivity
 * ```
 * - name: accelerator-nat-gw
 *   private: true
 *   subnet: accelerator-cidr-subnet-a
 *   tags: []
 * ```
 */
export class NatGatewayConfig implements t.TypeOf<typeof NetworkConfigTypes.natGatewayConfig> {
  /**
   * A friendly name for the NAT Gateway.
   *
   * @remarks
   * **CAUTION**: changing this property after initial deployment will cause a NAT gateway recreation.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: string = '';
  /**
   * The friendly name of the subnet for the NAT Gateway to be deployed.
   *
   * @remarks
   * **CAUTION**: changing this property after initial deployment will cause a NAT gateway recreation.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly subnet: string = '';

  /**
   * (OPTIONAL) The allocation ID of the Elastic IP address that's associated with the NAT gateway.
   * This allocation ID must exist in the target account the NAT gateway is deployed to.
   *
   * @remarks
   * **CAUTION**: changing this property after initial deployment will cause a NAT gateway recreation.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * NOTE: Leaving this property undefined results in the accelerator provisioning a new elastic IP.
   *
   * To retrieve the `allocationId` of your Elastic IP address, perform the following:
   * 1. Open the Amazon VPC console at https://console.aws.amazon.com/vpc/.
   * 2. In the navigation pane, choose Elastic IPs.
   * 3. Select the Elastic IP address and reference the value in the `Allocation ID` column. The format
   * should be `eipalloc-abc123xyz`.
   */
  readonly allocationId: string | undefined = undefined;

  /**
   * (OPTIONAL) Set `true` to define a NAT gateway with private connectivity type
   *
   * @remarks
   * **CAUTION**: changing this property after initial deployment will cause a NAT gateway recreation.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * Set to `false` or leave undefined to create a public-facing NAT gateway
   */
  readonly private: boolean | undefined = undefined;

  /**
   * (OPTIONAL) An array of tag objects for the NAT Gateway.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link TransitGatewayAttachmentConfig} / {@link TransitGatewayAttachmentTargetConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/tgw/tgw-vpc-attachments.html | Transit Gateway attachment} target configuration.
 * Use this configuration to target a Transit Gateway when defining an attachment for your VPC.
 *
 * @example
 * ```
 * - name: Network-Main
 *   account: Network
 * ```
 */
export class TransitGatewayAttachmentTargetConfig
  implements t.TypeOf<typeof NetworkConfigTypes.transitGatewayAttachmentTargetConfig>
{
  /**
   * A friendly name for the attachment target Transit Gateway.
   *
   * @remarks
   * This is the logical `name` property of the Transit Gateway as defined in network-config.yaml.
   *
   * @see {@link TransitGatewayConfig}
   */
  readonly name: string = '';
  /**
   * The friendly name of the account for the attachment target Transit Gateway.
   *
   * @remarks
   * This is the logical `account` property of the Transit Gateway as defined in network-config.yaml.
   *
   * @see {@link TransitGatewayConfig}.
   */
  readonly account: string = '';
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link TransitGatewayAttachmentConfig} / {@link TransitGatewayAttachmentOptionsConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/tgw/tgw-vpc-attachments.html | Transit Gateway attachment} options configuration.
 * Used to specify advanced options for the VPC attachment.
 *
 * @example
 * ```
 * applianceModeSupport: enable
 * dnsSupport: enable
 * ipv6Support disable
 * ```
 */
export class TransitGatewayAttachmentOptionsConfig
  implements t.TypeOf<typeof NetworkConfigTypes.transitGatewayAttachmentOptionsConfig>
{
  /**
   * (OPTIONAL) Enable to configure appliance mode for the attachment. This option is disabled by default.
   *
   * @remarks
   * Appliance mode ensures only a single network interface is chosen for the entirety of a traffic flow,
   * enabling stateful deep packet inspection for the attached VPC.
   *
   * @see {@link https://docs.aws.amazon.com/vpc/latest/tgw/transit-gateway-appliance-scenario.html}
   */
  readonly applianceModeSupport: t.EnableDisable | undefined = undefined;
  /**
   * (OPTIONAL) Enable to configure DNS support for the attachment. This option is enabled by default.
   */
  readonly dnsSupport: t.EnableDisable | undefined = undefined;
  /**
   * (OPTIONAL) Enable to configure IPv6 support for the attachment. This option is disabled by default.
   */
  readonly ipv6Support: t.EnableDisable | undefined = undefined;
}
/**
 * *{@link NetworkConfig} / {@link VpcConfig} / {@link OutpostsConfig} / {@link LocalGatewayConfig} / {@link LocalGatewayRouteTableConfig}*
 *
 * {@link  https://docs.aws.amazon.com/outposts/latest/userguide/routing.html | Outposts Local Gateway route table} configuration.
 * Use this configuration to reference route tables for your Outposts local gateway.
 * Outpost subnet route tables on a rack can include a route to your on-premises network.
 * The local gateway routes this traffic for low latency routing to the on-premises network.
 *
 * @example
 * ```
 * - name: accelerator-local-gateway-rtb
 *   id: lgw-rtb-abcxyz
 * ```
 */
export class LocalGatewayRouteTableConfig implements t.TypeOf<typeof NetworkConfigTypes.localGatewayRouteTableConfig> {
  /**
   * A friendly name for the Route Table
   *
   * @remarks
   * This is a logical `name` property that can be used to reference the route table in subnet configurations.
   *
   * @see {@link SubnetConfig}
   */
  readonly name: string = '';
  /**
   * The id for the Route Table
   *
   * @remarks
   * This is an existing resource ID for the local gateway route table.
   * The local gateway route table must exist in the account and region
   * the accelerator-provisioned subnet is deployed to.
   *
   * To find the resource ID for the local gateway route table, please see the following instructions: {@link https://docs.aws.amazon.com/outposts/latest/userguide/routing.html#view-routes}
   */
  readonly id: string = '';
}
/**
 * *{@link NetworkConfig} / {@link VpcConfig} / {@link OutpostsConfig} / {@link LocalGatewayConfig}*
 *
 * {@link https://docs.aws.amazon.com/outposts/latest/userguide/outposts-local-gateways.html | Outposts Local Gateway} configuration.
 * Use this configuration to reference existing local gateways for your Outposts.
 * The local gateway for your Outpost rack enables connectivity from your Outpost subnets to
 * all AWS services that are available in the parent Region, in the same way that you access them from an Availability Zone subnet.
 *
 * @example
 * ```
 * name: accelerator-lgw
 * id: lgw-abcxyz
 * ```
 */
export class LocalGatewayConfig implements t.TypeOf<typeof NetworkConfigTypes.localGatewayConfig> {
  /**
   * A friendly name for the Local Gateway
   */
  readonly name: string = '';
  /**
   * The id for the Local Gateway
   *
   * @remarks
   * This is an existing resource ID for the local gateway.
   * The local gateway must exist in the account and region
   * the accelerator-provisioned subnet is deployed to.
   *
   * To find the resource ID for the local gateway, please see the following instructions: {@link https://docs.aws.amazon.com/outposts/latest/userguide/outposts-local-gateways.html#working-with-lgw}
   */
  readonly id: string = '';
  /**
   * The route tables for the Local Gateway
   */
  readonly routeTables: LocalGatewayRouteTableConfig[] = [];
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} / {@link OutpostsConfig}*
 *
 * {@link https://docs.aws.amazon.com/outposts/latest/userguide/what-is-outposts.html | AWS Outposts} configuration.
 * Use this configuration to reference Outposts that exist in your environment.
 * AWS Outposts enables customers to build and run applications on premises using the same
 * programming interfaces as in AWS Regions, while using local compute and storage resources
 * for lower latency and local data processing needs.
 *
 * @example
 * ```
 * - name: accelerator-outpost
 *   arn: <outpost-resource-arn>
 *   availabilityZone: a
 *   localGateway:
 *     name: accelerator-lgw
 *     id: lgw-abcxyz
 *     routeTables: []
 * ```
 */
export class OutpostsConfig implements t.TypeOf<typeof NetworkConfigTypes.outpostsConfig> {
  /**
   * A friendly name for the Outpost
   *
   * @remarks
   * This is a logical `name` property that can be used to reference the outpost in subnet configurations.
   *
   * @see {@link SubnetConfig}
   */
  readonly name: string = '';
  /**
   * The ARN for the Outpost
   *
   * @remarks
   * This is an existing resource ARN for the outpost.
   * The outpost must exist in the account and region
   * the accelerator-provisioned subnet is deployed to.
   *
   * To find the resource ARN for the outpost, please reference **To view the Outpost details**: {@link https://docs.aws.amazon.com/outposts/latest/userguide/work-with-outposts.html#manage-outpost}
   */
  readonly arn: string = '';
  /**
   * The availability zone where the Outpost resides
   *
   * @remarks
   * Include only the letter of the AZ name (i.e. 'a' for 'us-east-1a').
   */
  readonly availabilityZone: string = '';
  /**
   * The Local Gateway configuration for the Outpost
   */
  readonly localGateway: LocalGatewayConfig | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link TransitGatewayAttachmentConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/tgw/tgw-vpc-attachments.html | Transit Gateway VPC attachment} configuration.
 * Use this configuration to define a Transit Gateway attachment to your VPC.
 * Transit Gateway attachments allow you to interconnect your virtual private clouds (VPCs) and on-premises networks.
 * Defining a VPC attachment deploys an elastic network interface within VPC subnets,
 * which is then used by the transit gateway to route traffic to and from the chosen subnets.
 *
 * @example
 * ```
 * - name: Network-Inspection
 *   transitGateway:
 *     name: Network-Main
 *     account: Network
 *   subnets: []
 *   routeTableAssociations: []
 *   routeTablePropagations: []
 *   options:
 *     applianceModeSupport: enable
 *   tags: []
 * ```
 */
export class TransitGatewayAttachmentConfig
  implements t.TypeOf<typeof NetworkConfigTypes.transitGatewayAttachmentConfig>
{
  /**
   * A friendly name for the Transit Gateway attachment.
   *
   * @remarks
   * **CAUTION**: Changing this value after initial deployment will cause the attachment to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: string = '';
  /**
   * A Transit Gateway attachment target configuration object.
   *
   * @see {@link TransitGatewayAttachmentTargetConfig}
   */
  readonly transitGateway: TransitGatewayAttachmentTargetConfig = new TransitGatewayAttachmentTargetConfig();
  /**
   * An array of the friendly names of VPC subnets for the attachment to be deployed.
   *
   * @remarks
   * This is the logical `name` property of the subnet as defined in network-config.yaml.
   *
   * @see {@link SubnetConfig}
   */
  readonly subnets: string[] = [];
  /**
   * The friendly name of a Transit Gateway route table to associate the attachment to.
   *
   * @remarks
   * **CAUTION**: Changing this value after initial deployment causes a new association to be created.
   * Attachments can only have a single association at a time.
   * To avoid core pipeline failures, use multiple core pipeline runs to 1) delete the existing association and then 2) add the new association.
   *
   * This is the logical `name` property of the route table as defined in network-config.yaml.
   *
   * @see {@link TransitGatewayRouteTableConfig}
   */
  readonly routeTableAssociations: string[] | undefined = undefined;
  /**
   * An array of friendly names of Transit Gateway route tables to propagate the attachment.
   */
  readonly routeTablePropagations: string[] | undefined = undefined;
  /**
   * (OPTIONAL) A Transit Gateway attachment options configuration.
   *
   * @see {@link TransitGatewayAttachmentOptionsConfig}
   */
  readonly options: TransitGatewayAttachmentOptionsConfig | undefined = undefined;
  /**
   * (OPTIONAL) An array of tag objects for the Transit Gateway attachment.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link GatewayEndpointConfig} / {@link GatewayEndpointServiceConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html | VPC gateway endpoint} service configuration.
 * Use this configuration to define the service and endpoint policy for gateway endpoints.
 *
 * @example
 * ```
 * - service: s3
 *   policy: Default
 * ```
 */
export class GatewayEndpointServiceConfig implements t.TypeOf<typeof NetworkConfigTypes.gatewayEndpointServiceConfig> {
  /**
   * The name of the service to create the endpoint for
   *
   * @see {@link NetworkConfigTypes.gatewayEndpointEnum}
   */
  readonly service: t.TypeOf<typeof NetworkConfigTypes.gatewayEndpointEnum> = 's3';
  /**
   * (OPTIONAL) The friendly name of a policy for the gateway endpoint. If left undefined, the default policy will be used.
   *
   * @remarks
   * This is the logical `name` property of the endpoint policy as defined in network-config.yaml.
   *
   * @see {@link EndpointPolicyConfig}
   */
  readonly policy: string | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link GatewayEndpointConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html | VPC gateway endpoint} configuration.
 * Use this configuration to define gateway endpoints for your VPC.
 * A gateway endpoint targets specific IP routes in an Amazon VPC route table,
 * in the form of a prefix-list, used for traffic destined to Amazon DynamoDB
 * or Amazon Simple Storage Service (Amazon S3).
 *
 * @example
 * ```
 * defaultPolicy: Default
 * endpoints []
 * ```
 */
export class GatewayEndpointConfig implements t.TypeOf<typeof NetworkConfigTypes.gatewayEndpointConfig> {
  /**
   * The friendly name of the default policy for the gateway endpoints.
   *
   * @remarks
   * This is the logical `name` property of the endpoint policy as defined in network-config.yaml.
   *
   * @see {@link EndpointPolicyConfig}
   */
  readonly defaultPolicy: string = '';
  /**
   * An array of endpoints to create.
   */
  readonly endpoints: GatewayEndpointServiceConfig[] = [];
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link InterfaceEndpointConfig} / {@link InterfaceEndpointServiceConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/privatelink/privatelink-access-aws-services.html | VPC interface endpoint} service configuration.
 * Use this configuration to define the service and endpoint policy for gateway endpoints.
 *
 * @example
 * ```
 * - service: ec2
 *   policy: Default
 * ```
 */
export class InterfaceEndpointServiceConfig
  implements t.TypeOf<typeof NetworkConfigTypes.interfaceEndpointServiceConfig>
{
  /**
   * The name of the service to create the endpoint for.
   *
   * @remarks
   * The solution team does not keep a record of all possible interface endpoints
   * that can be deployed. A full list of services that support interface endpoints
   * can be found in the following documentation: {@link https://docs.aws.amazon.com/vpc/latest/privatelink/aws-services-privatelink-support.html}.
   *
   * **NOTE**: The service name to input in this property is the suffix value after `com.amazonaws.<REGION>` noted in the above reference.
   * Availability of interface endpoints as well as features such as endpoint
   * policies may differ depending on region. Please use the instructions provided in the above reference
   * to determine endpoint features and regional availability before deployment.
   */
  readonly service: string = '';
  /**
   * (OPTIONAL) The full name of the service to create the endpoint for.
   *
   * @remarks
   * This property can be used to input the full endpoint service names that do not
   * conform with the standard `com.amazonaws.<REGION>.<SERVICE>` syntax.
   */
  readonly serviceName: string | undefined = undefined;
  /**
   * (OPTIONAL) The friendly name of a policy for the interface endpoint. If left undefined, the default policy will be used.
   *
   * @remarks
   * This is the logical `name` property of the endpoint policy as defined in network-config.yaml.
   *
   * @see {@link EndpointPolicyConfig}
   */
  readonly policy: string | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link InterfaceEndpointConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/privatelink/privatelink-access-aws-services.html | VPC interface endpoint} configuration.
 * Use this configuration to define interface endpoints for your VPC.
 * Interface endpoints powered by AWS PrivateLink to connect your VPC to AWS services as if they were in your VPC, without the use of an internet gateway.
 *
 * @example
 * ```
 * defaultPolicy: Default
 * endpoints: []
 * subnets: []
 * ```
 */
export class InterfaceEndpointConfig implements t.TypeOf<typeof NetworkConfigTypes.interfaceEndpointConfig> {
  /**
   * The friendly name of the default policy for the interface endpoints.
   *
   * @remarks
   * This is the logical `name` property of the endpoint policy as defined in network-config.yaml.
   *
   * @see {@link EndpointPolicyConfig}
   */
  readonly defaultPolicy: string = '';
  /**
   * An array of VPC interface endpoint services to be deployed.
   *
   * @see {@link InterfaceEndpointServiceConfig}
   */
  readonly endpoints: InterfaceEndpointServiceConfig[] = [new InterfaceEndpointServiceConfig()];
  /**
   * An array of the friendly names of VPC subnets for the endpoints to be deployed.
   *
   * @remarks
   * This is the logical `name` property of the VPC subnet as defined in network-config.yaml.
   *
   * @see {@link SubnetConfig}
   */
  readonly subnets: string[] = [];
  /**
   * (OPTIONAL) Enable to define interface endpoints as centralized endpoints.
   *
   * @remarks
   * Endpoints defined as centralized endpoints will have Route 53 private hosted zones
   * created for each of them. These hosted zones are associated with any VPCs configured
   * with the `useCentralEndpoints` property enabled.
   *
   * **NOTE**: You may only define one centralized endpoint VPC per region.
   *
   * For additional information on this pattern, please refer to
   * {@link https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/main/FAQ.md#how-do-i-define-a-centralized-interface-endpoint-vpc | our FAQ}.
   */
  readonly central: boolean | undefined = undefined;
  /**
   * (OPTIONAL) An array of source CIDRs allowed to communicate with the endpoints.
   *
   * @remarks
   * These CIDRs are used to create ingress rules in a security group
   * that is created and attached to the interface endpoints.
   * By default, all traffic (0.0.0.0/0) is allowed.
   *
   * Use CIDR notation, i.e. 10.0.0.0/16
   */
  readonly allowedCidrs: string[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link SecurityGroupConfig} / {@link SecurityGroupRuleConfig} / {@link SubnetSourceConfig}*
 *
 * VPC subnet security group source configuration.
 * Use this configuration to dynamically reference subnet CIDRs in a security group rule.
 *
 * @example
 * ```
 * - account: Network
 *   vpc: Network-Inspection
 *   subnets: []
 * ```
 */
export class SubnetSourceConfig implements t.TypeOf<typeof NetworkConfigTypes.subnetSourceConfig> {
  /**
   * The friendly name of the account in which the VPC subnet resides.
   *
   * @remarks
   * This is the `account` property of the VPC as defined in network-config.yaml.
   * If referencing a VPC template, use the logical `name` property of an account
   * the template targets in its `deploymentTargets` property.
   *
   * @see {@link VpcConfig} | {@link VpcTemplatesConfig}
   */
  readonly account: string = '';
  /**
   * The friendly name of the VPC in which the subnet resides.
   *
   * @remarks
   * This is the logical `name` property of the VPC or VPC template as defined in network-config.yaml.
   *
   * @see {@link VpcConfig} | {@link VpcTemplatesConfig}
   */
  readonly vpc: string = '';
  /**
   * An array of the friendly names of subnets to reference.
   *
   * @remarks
   * This is the logical `name` property of the subnet as defined in network-config.yaml.
   *
   * Each subnet must exist in the source VPC targeted in the `vpc` property. A security group rule will be created
   * for each referenced subnet in this array.
   *
   * @see {@link SubnetConfig}
   */
  readonly subnets: string[] = [];
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link SecurityGroupConfig} / {@link SecurityGroupRuleConfig} / {@link SecurityGroupSourceConfig}*
 *
 * Security group source configuration.
 * Use this configuration to define a security group as a source of a security group rule.
 *
 * @example
 * ```
 * - securityGroups:
 *   - accelerator-sg
 * ```
 */
export class SecurityGroupSourceConfig implements t.TypeOf<typeof NetworkConfigTypes.securityGroupSourceConfig> {
  /**
   * An array of the friendly names of security group rules to reference.
   *
   * @remarks
   * This is the logical `name` property of the security group as defined in network-config.yaml.
   *
   * Referenced security groups must exist in the same VPC this rule is being created in. A security group rule will be created
   * for each referenced security group in this array.
   *
   * @see {@link SecurityGroupConfig}
   */
  readonly securityGroups: string[] = [];
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link SecurityGroupConfig} / {@link SecurityGroupRuleConfig} / {@link PrefixListSourceConfig}*
 *
 * Prefix list security group source configuration.
 * Use this configuration to define a custom prefix list as a source in a security group rule.
 *
 * @example
 * ```
 * - prefixLists:
 *   - accelerator-pl
 * ```
 */
export class PrefixListSourceConfig implements t.TypeOf<typeof NetworkConfigTypes.prefixListSourceConfig> {
  /**
   * An array of the friendly names of prefix lists to reference.
   *
   * @remarks
   * This is the logical `name` property of the prefix list as defined in network-config.yaml.
   *
   * The referenced prefix lists must be deployed to the account(s) the VPC or VPC template is deployed to.
   * For VPCs using Resource Access Manager (RAM) shared subnets, the referenced prefix lists must also be
   * deployed to those shared accounts.
   *
   * @see {@link PrefixListConfig}
   */
  readonly prefixLists: string[] = [];
}

/**
 * *{@link NetworkConfig} / {@link PrefixListConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/managed-prefix-lists.html | Customer-managed prefix list} configuration.
 * Use this configuration to define custom prefix lists for your environment.
 * A managed prefix list is a set of one or more CIDR blocks.
 * You can use prefix lists to make it easier to configure and maintain your security groups and route tables.
 *
 * The following example creates a prefix list named `accelerator-pl` that may contain up to 10 entries.
 * The prefix list is deployed to all accounts in the organization.
 *
 * @example
 * CURRENT SYNTAX: use the following syntax when defining prefix lists for v1.4.0 and newer.
 * The additional example underneath is provided for backward compatibility.
 * ```
 * prefixLists:
 *   - name: accelerator-pl
 *     deploymentTargets:
 *       organizationalUnits:
 *         - Root
 *     addressFamily: IPv4
 *     maxEntries: 10
 *     entries:
 *       - 10.0.0.0/16
 *     tags: []
 * ```
 *
 * THE BELOW EXAMPLE SYNTAX IS DEPRECATED: use the above syntax when defining new prefix lists.
 * ```
 * prefixLists:
 *   - name: accelerator-pl
 *     accounts:
 *       - Network
 *     regions:
 *       - us-east-1
 *     addressFamily: IPv4
 *     maxEntries: 10
 *     entries:
 *       - 10.0.0.0/16
 *     tags: []
 * ```
 */
export class PrefixListConfig implements t.TypeOf<typeof NetworkConfigTypes.prefixListConfig> {
  /**
   * A friendly name for the prefix list.
   *
   * @remarks
   * **CAUTION**: Changing this value will cause the prefix list to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: string = '';
  /**
   * (DEPRECATED) An array of friendly names for the accounts the prefix list is deployed.
   *
   * @remarks
   * **NOTE**: This property is deprecated as of v1.4.0. It is recommended to use `deploymentTargets` instead.
   *
   * This is the logical `name` property of the account as defined in accounts-config.yaml.
   */
  readonly accounts: string[] | undefined = undefined;
  /**
   * (DEPRECATED) An array of region names for the prefix list to be deployed.
   *
   * @remarks
   * **NOTE**: This property is deprecated as of v1.4.0. It is recommended to use `deploymentTargets` instead.
   *
   * @see {@link Region}
   */
  readonly regions: t.Region[] | undefined = undefined;
  /**
   * Prefix List deployment targets
   *
   * @remarks
   * Targets can be account names and/or organizational units.
   * Prefix lists must be deployed to account(s)/OU(s) of
   * any VPC subnet route tables, Transit Gateway route tables,
   * or VPC security groups that will consume them.
   *
   * @see {@link DeploymentTargets}
   */
  readonly deploymentTargets: t.DeploymentTargets | undefined = undefined;
  /**
   * The IP address family of the prefix list.
   */
  readonly addressFamily: t.TypeOf<typeof NetworkConfigTypes.ipAddressFamilyEnum> = 'IPv4';
  /**
   * The maximum allowed entries in the prefix list.
   */
  readonly maxEntries: number = 1;
  /**
   * An array of CIDR entries for the prefix list.
   *
   * @remarks
   * The number of entries must be less than or equal to the `maxEntries` value.
   *
   * Use CIDR notation, i.e. 10.0.0.0/16
   */
  readonly entries: string[] = [];
  /**
   * (OPTIONAL) An array of tag objects for the prefix list.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link SecurityGroupConfig} / {@link SecurityGroupRuleConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html | Security group rule} configuration.
 * Use this configuration to define ingress and egress rules for your security groups.
 * The rules of a security group control the inbound traffic that's allowed to reach the resources
 * that are associated with the security group. The rules also control the outbound traffic that's
 * allowed to leave them.
 *
 * @example
 * CIDR source:
 * ```
 * - description: Remote access security group
 *   types:
 *     - RDP
 *     - SSH
 *   sources:
 *     - 10.0.0.0/16
 * ```
 * Security group source:
 * ```
 * - description: Remote access security group
 *   types:
 *     - RDP
 *     - SSH
 *   sources:
 *     - securityGroups:
 *       - accelerator-sg
 * ```
 * Prefix list source:
 * ```
 * - description: Remote access security group
 *   types:
 *     - RDP
 *     - SSH
 *   sources:
 *     - prefixLists:
 *       - accelerator-pl
 * ```
 * Subnet source:
 * ```
 * - description: Remote access security group
 *   types:
 *     - RDP
 *     - SSH
 *   sources:
 *     - account: Network
 *       vpc: Network-Endpoints
 *       subnets:
 *         - Network-Endpoints-A
 * ```
 */
export class SecurityGroupRuleConfig implements t.TypeOf<typeof NetworkConfigTypes.securityGroupRuleConfig> {
  /**
   * A description for the security group rule.
   */
  readonly description: string = '';
  /**
   * (OPTIONAL) An array of port/protocol types to include in the security group rule.
   *
   * @remarks
   * - Use `ALL` to create a rule that allows all ports/protocols.
   * - Use `ICMP` along with `fromPort` and `toPort` to create ICMP protocol rules. ICMP `fromPort`/`toPort` values use the same convention as the {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-ec2-security-group-egress.html#cfn-ec2-securitygroupegress-fromport | CloudFormation reference}.
   * - Use `TCP` or `UDP` along with `fromPort` and `toPort` to create TCP/UDP rules that target a range of ports.
   * - Use any of the other common types included to create a rule that allows that specific application port/protocol.
   * - You can leave this property undefined and use `tcpPorts` and `udpPorts` independently to define multiple TCP/UDP rules.
   *
   * @see {@link NetworkConfigTypes.securityGroupRuleTypeEnum}
   */
  readonly types: t.TypeOf<typeof NetworkConfigTypes.securityGroupRuleTypeEnum>[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of TCP ports to include in the security group rule.
   *
   * @remarks
   * Use this property when you need to define ports that are not the common applications available in `types`.
   * Leave undefined if using the `types` property.
   */
  readonly tcpPorts: number[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of UDP ports to include in the security group rule.
   *
   * @remarks
   * Use this property when you need to define ports that are not the common applications available in `types`.
   * Leave undefined if using the `types` property.
   */
  readonly udpPorts: number[] | undefined = undefined;
  /**
   * (OPTIONAL) The port to start from in the security group rule.
   *
   * @remarks
   * Use only for rules that are using the TCP, UDP, or ICMP types. Leave undefined for other rule types.
   *
   * For TCP/UDP rules, this is the start of the port range.
   *
   * For ICMP rules, this is the ICMP type number. A value of -1 indicates all types.
   * The value of `toPort` must also be -1 if this value is -1.
   */
  readonly fromPort: number | undefined = undefined;
  /**
   * (OPTIONAL) The port to end with in the security group rule.
   *
   * @remarks
   * Use only for rules that are using the TCP, UDP, or ICMP types. Leave undefined for other rule types.
   *
   * For TCP/UDP type rules, this is the end of the port range.
   *
   * For ICMP type rules, this is the ICMP code number. A value of -1 indicates all types.
   * The value must be -1 if the value of `fromPort` is -1.
   */
  readonly toPort: number | undefined = undefined;
  /**
   * An array of sources for the security group rule.
   *
   * @remarks
   * Valid sources are CIDR ranges, security group rules, prefix lists, and subnets.
   *
   * @see
   * {@link SecurityGroupSourceConfig} | {@link PrefixListSourceConfig} | {@link SubnetSourceConfig}
   */
  readonly sources: string[] | SecurityGroupSourceConfig[] | PrefixListSourceConfig[] | SubnetSourceConfig[] = [];
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link SecurityGroupConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/security-groups.html | Security group} configuration.
 * Use this configuration to define security groups in your VPC.
 * A security group acts as a firewall that controls the traffic
 * allowed to and from the resources in your VPC.
 * You can choose the ports and protocols to allow for inbound and outbound traffic.
 *
 * The following example creates a security group that allows inbound RDP and SSH traffic from source CIDR 10.0.0.0/16.
 * It also allows all outbound traffic.
 * @example
 * ```
 * - name: accelerator-sg
 *   description: Accelerator security group
 *   inboundRules:
 *     - description: Remote access security group rule
 *       types:
 *         - RDP
 *         - SSH
 *       sources:
 *         - 10.0.0.0/16
 *   outboundRules:
 *     - description: Allow all outbound
 *       types:
 *         - ALL
 *       sources:
 *         - 0.0.0.0/0
 * ```
 */
export class SecurityGroupConfig implements t.TypeOf<typeof NetworkConfigTypes.securityGroupConfig> {
  /**
   * The friendly name of the security group.
   *
   * @remarks
   * **CAUTION**: Changing this value after initial deployment will cause the security group to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: string = '';
  /**
   * (OPTIONAL) A description for the security group.
   */
  readonly description: string | undefined = undefined;
  /**
   * An array of security group rule configurations for ingress rules.
   *
   * @remarks
   * **NOTE**: Changing values under this configuration object after initial deployment
   * may cause some interruptions to network traffic while the security group is being updated.
   *
   * @see {@link SecurityGroupRuleConfig}
   */
  readonly inboundRules: SecurityGroupRuleConfig[] = [];
  /**
   * An array of security group rule configurations for egress rules.
   *
   * @remarks
   * **NOTE**: Changing values under this configuration object after initial deployment
   * may cause some interruptions to network traffic while the security group is being updated.
   *
   * @see {@link SecurityGroupRuleConfig}
   */
  readonly outboundRules: SecurityGroupRuleConfig[] = [];
  /**
   * (OPTIONAL) An array of tag objects for the security group.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link NetworkAclConfig} / {@link NetworkAclInboundRuleConfig} | {@link NetworkAclOutboundRuleConfig} / {@link NetworkAclSubnetSelection}*
 *
 * Network ACL subnet selection configuration.
 * Use this configuration to dynamically reference a subnet as a source/destination for a network ACL.
 *
 * @example
 * ```
 * account: Network
 * vpc: Network-Inspection
 * subnet: Network-Inspection-A
 * ```
 */
export class NetworkAclSubnetSelection implements t.TypeOf<typeof NetworkConfigTypes.networkAclSubnetSelection> {
  /**
   * The friendly name of the account of the subnet.
   *
   * @remarks
   * This is the `account` property of the VPC as defined in network-config.yaml.
   * If referencing a VPC template, use the logical `name` property of an account
   * the template targets in its `deploymentTargets` property.
   *
   * @see {@link VpcConfig} | {@link VpcTemplatesConfig}
   */
  readonly account: string = '';
  /**
   * The friendly name of the VPC of the subnet.
   *
   * @remarks
   * This is the logical `name` property of the VPC or VPC template as defined in network-config.yaml.
   *
   * @see {@link VpcConfig} | {@link VpcTemplatesConfig}
   */
  readonly vpc: string = '';
  /**
   * The friendly name of the subnet.
   *
   * @remarks
   * This is the logical `name` property of the subnet as defined in network-config.yaml.
   *
   * Each subnet must exist in the source VPC targeted in the `vpc` property. A security group rule will be created
   * for each referenced subnet in this array.
   *
   * @see {@link SubnetConfig}
   */
  readonly subnet: string = '';

  /**
   * (OPTIONAL) The region that the subnet is located in.
   *
   * @remarks
   * This property only needs to be defined if targeting a subnet in a different region
   * than the one in which this VPC is deployed.
   */
  readonly region: t.Region | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link NetworkAclConfig} / {@link NetworkAclInboundRuleConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html#nacl-rules | Network ACL inbound rule} configuration.
 * Use this configuration to define inbound rules for your network ACLs.
 * An inbound rule allows or denies specific inbound traffic at the subnet level.
 *
 * The following example allows inbound SSH traffic from source CIDR 10.0.0.0/16:
 * @example
 * ```
 * - rule: 200
 *   protocol: 6
 *   fromPort: 22
 *   toPort: 22
 *   action: allow
 *   source: 10.0.0.0/16
 * ```
 */
export class NetworkAclInboundRuleConfig implements t.TypeOf<typeof NetworkConfigTypes.networkAclInboundRuleConfig> {
  /**
   * The rule ID number for the rule.
   *
   * @remarks
   * **CAUTION**: Changing this property value causes the rule to be recreated.
   * This may temporarily impact your network traffic while the rule is updated.
   *
   * Rules are evaluated in order from low to high and must be unique per direction.
   * As soon as a rule matches traffic, it's applied
   * regardless of any higher-numbered rule that might contradict it.
   */
  readonly rule: number = 100;
  /**
   * The {@link https://www.iana.org/assignments/protocol-numbers/protocol-numbers.xhtml | IANA protocol number} for the network ACL rule.
   * You may also specify -1 for all protocols.
   */
  readonly protocol: number = -1;
  /**
   * The port to start from in the network ACL rule.
   */
  readonly fromPort: number = -1;
  /**
   * The port to end with in the network ACL rule.
   */
  readonly toPort: number = -1;
  /**
   * The action for the network ACL rule.
   */
  readonly action: t.AllowDeny = 'allow';
  /**
   * The source of the network ACL rule.
   *
   * @remarks
   * Possible values are a CIDR range or a network ACL subnet selection configuration.
   *
   * @see {@link NetworkAclSubnetSelection}
   */
  readonly source: string | NetworkAclSubnetSelection = '';
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link NetworkAclConfig} / {@link NetworkAclOutboundRuleConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html#nacl-rules | Network ACL outbound rule} configuration.
 * Use this configuration to define outbound rules for your network ACLs.
 * An outbound rule allows or denies specific outbound traffic at the subnet level.
 *
 * The following example allows outbound TCP traffic in the ephemeral port ranges to destination CIDR 10.0.0.0/16:
 * @example
 * ```
 * - rule: 200
 *   protocol: 6
 *   fromPort: 1024
 *   toPort: 65535
 *   action: allow
 *   destination: 10.0.0.0/16
 * ```
 */
export class NetworkAclOutboundRuleConfig implements t.TypeOf<typeof NetworkConfigTypes.networkAclOutboundRuleConfig> {
  /**
   * The rule ID number for the rule.
   *
   * @remarks
   * **CAUTION**: Changing this property value causes the rule to be recreated.
   * This may temporarily impact your network traffic while the rule is updated.
   *
   * Rules are evaluated in order from low to high and must be unique per direction.
   * As soon as a rule matches traffic, it's applied
   * regardless of any higher-numbered rule that might contradict it.
   */
  readonly rule: number = 100;
  /**
   * The {@link https://www.iana.org/assignments/protocol-numbers/protocol-numbers.xhtml | IANA protocol number} for the network ACL rule.
   * You may also specify -1 for all protocols.
   */
  readonly protocol: number = -1;
  /**
   * The port to start from in the network ACL rule.
   */
  readonly fromPort: number = -1;
  /**
   * The port to end with in the network ACL rule.
   */
  readonly toPort: number = -1;
  /**
   * The action for the network ACL rule.
   */
  readonly action: t.AllowDeny = 'allow';
  /**
   * The destination of the network ACL rule.
   *
   * @remarks
   * Possible values are a CIDR range or a network ACL subnet selection configuration.
   *
   * @see {@link NetworkAclSubnetSelection}
   */
  readonly destination: string | NetworkAclSubnetSelection = '';
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link NetworkAclConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html | Network access control list (ACL)} configuration.
 * Use this configuration to define custom network ACLs for your VPC.
 * A network ACL allows or denies specific inbound or outbound traffic at the subnet level.
 * Network ACLs are stateless, which means that responses to allowed inbound traffic are subject
 * to the rules for outbound traffic (and vice versa).
 *
 * The following example shows an inbound and outbound rule that would allow
 * inbound SSH traffic from the CIDR range 10.0.0.0/16.
 * @example
 * ```
 * - name: accelerator-nacl
 *   subnetAssociations:
 *     - Subnet-A
 *   inboundRules:
 *     - rule: 200
 *       protocol: 6
 *       fromPort: 22
 *       toPort: 22
 *       action: allow
 *       source: 10.0.0.0/16
 *   outboundRules:
 *     - rule: 200
 *       protocol: 6
 *       fromPort: 1024
 *       toPort: 65535
 *       action: allow
 *       destination: 10.0.0.0/16
 *   tags: []
 * ```
 */
export class NetworkAclConfig implements t.TypeOf<typeof NetworkConfigTypes.networkAclConfig> {
  /**
   * The name of the Network ACL.
   *
   * @remarks
   * **CAUTION**: Changing this property value causes the network ACL to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   * Please also note that your network traffic may be temporarily impacted while the ACL is updated.
   */
  readonly name: string = '';

  /**
   * A list of subnets to associate with the Network ACL
   *
   * @remarks
   * This is the logical `name` property of the subnet as defined in network-config.yaml.
   *
   * @see {@link SubnetConfig}
   */
  readonly subnetAssociations: string[] = [];

  /**
   * (OPTIONAL) A list of inbound rules to define for the Network ACL
   *
   * @see {@link NetworkAclInboundRuleConfig}
   */
  readonly inboundRules: NetworkAclInboundRuleConfig[] | undefined = undefined;

  /**
   * (OPTIONAL) A list of outbound rules to define for the Network ACL
   *
   * @see {@link NetworkAclOutboundRuleConfig}
   */
  readonly outboundRules: NetworkAclOutboundRuleConfig[] | undefined = undefined;
  /**
   * (OPTIONAL) A list of tags to attach to the Network ACL
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / ({@link SubnetConfig}) / {@link IpamAllocationConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/ipam/how-it-works-ipam.html | VPC IPAM allocation} configuration.
 * Use this configuration to dynamically assign a VPC or subnet CIDR from an IPAM pool.
 *
 * @example
 * VPC allocations:
 * ```
 * - ipamPoolName: accelerator-regional-pool
 *   netmaskLength: 24
 * ```
 * Subnet allocations:
 * ```
 * ipamPoolName: accelerator-regional-pool
 * netmaskLength: 24
 * ```
 */
export class IpamAllocationConfig implements t.TypeOf<typeof NetworkConfigTypes.ipamAllocationConfig> {
  /**
   * The IPAM pool name to request the allocation from.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the VPC or subnet to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * This is the logical `name` property of the IPAM pool as defined in network-config.yaml.
   * The IPAM pool referenced must either be deployed to or have `shareTargets`
   * configured for the account(s)/OU(s) that will be requesting the allocation.
   *
   * @see {@link IpamPoolConfig}
   */
  readonly ipamPoolName: string = '';

  /**
   * The subnet mask length to request.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the VPC or subnet to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * Specify only the CIDR prefix length for the subnet, i.e. 24. If the IPAM pool
   * referenced in `ipamPoolName` does not have enough space for this allocation,
   * resource creation will fail.
   *
   * @see {@link IpamPoolConfig}
   */
  readonly netmaskLength: number = 24;
}

/**
 * *{@link NetworkConfig} / {@link DhcpOptsConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/VPC_DHCP_Options.html | VPC Dynamic Host Configuration Protocol (DHCP) options sets} configuration.
 * Use this configuration to define custom DHCP options sets for your VPCs.
 * Custom DHCP option sets give you control over the DNS servers, domain names,
 * or Network Time Protocol (NTP) servers used by the devices in your VPC.
 *
 * The following example creates a DHCP option set named `accelerator-dhcp-opts`
 * in the `Network` account in the `us-east-1` region. The options set assigns
 * a domain name of `example.com` to hosts in the VPC and configures the DNS
 * server to `1.1.1.1`.
 * @example
 * ```
 * dhcpOptions:
 *   - name: accelerator-dhcp-opts
 *     accounts:
 *       - Network
 *     regions:
 *       - us-east-1
 *     domainName: example.com
 *     domainNameServers
 *       - 1.1.1.1
 *     tags: []
 * ```
 */
export class DhcpOptsConfig implements t.TypeOf<typeof NetworkConfigTypes.dhcpOptsConfig> {
  /**
   * A friendly name for the DHCP options set.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the DHCP options set to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: string = '';
  /**
   * An array of friendly account names to deploy the options set.
   *
   * @remarks
   * This is the logical `name` property of the account as defined in accounts-config.yaml.
   */
  readonly accounts: string[] = [''];
  /**
   * An array of regions to deploy the options set.
   *
   * @see {@link Region}
   */
  readonly regions: t.Region[] = ['us-east-1'];
  /**
   * (OPTIONAL) A domain name to assign to hosts using the options set.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the DHCP options set to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly domainName: string | undefined = undefined;
  /**
   * (OPTIONAL) An array of IP addresses for domain name servers.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the DHCP options set to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly domainNameServers: string[] | undefined = undefined;
  /**
   * (OPTIONAL An array of IP addresses for NetBIOS servers.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the DHCP options set to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly netbiosNameServers: string[] | undefined = undefined;
  /**
   * (OPTIONAL) The NetBIOS node type number.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the DHCP options set to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * @see {@link NetworkConfigTypes.netbiosNodeEnum}
   */
  readonly netbiosNodeType: t.TypeOf<typeof NetworkConfigTypes.netbiosNodeEnum> | undefined = undefined;
  /**
   * (OPTIONAL) An array of IP addresses for NTP servers.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the DHCP options set to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly ntpServers: string[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of tags for the options set.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link EndpointPolicyConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-access.html | Virtual Private Cloud (VPC) endpoint policy} configuration.
 * Use this configuration to define VPC endpoint policies for your VPC gateway and interface endpoints.
 * The endpoint policy is a JSON policy document that controls which AWS principals can use the VPC
 * endpoint to access the endpoint service.
 *
 * The following example defines an endpoint policy named `Default` and references a path
 * where a JSON policy document is stored:
 * @example
 * ```
 * endpointPolicies:
 *   - name: Default
 *     document: path/to/document.json
 * ```
 */
export class EndpointPolicyConfig implements t.TypeOf<typeof NetworkConfigTypes.endpointPolicyConfig> {
  /**
   * A friendly name for the endpoint policy.
   *
   * @remarks
   * You use this logical `name` property as a reference to apply this policy
   * to VPC gateway and interface endpoint configurations.
   *
   * @see {@link GatewayEndpointConfig} | {@link  InterfaceEndpointConfig}
   */
  readonly name: string = '';
  /**
   * A file path for a JSON-formatted policy document.
   *
   * @remarks
   * The referenced file path must exist in your accelerator configuration repository.
   * The document must be valid JSON syntax.
   */
  readonly document: string = '';
}

/**
 * *{@link NetworkConfig} / {@link CustomerGatewayConfig} / {@link VpnConnectionConfig} / {@link VpnTunnelOptionsSpecificationsConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpn/latest/s2svpn/VPNTunnels.html | VPN tunnel options} specification configuration.
 * Use this configuration to define optional tunnel IP addresses and/or pre-shared keys
 * for a site-to-site VPN connection.
 *
 * @example
 * ```
 * - tunnelInsideCidr: 169.254.200.0/30
 *   preSharedKey: Key1-AbcXyz
 * - tunnelInsideCidr: 169.254.200.100/30
 *   preSharedKey: Key1-AbcXyz
 * ```
 */
export class VpnTunnelOptionsSpecificationsConfig
  implements t.TypeOf<typeof NetworkConfigTypes.vpnTunnelOptionsSpecificationsConfig>
{
  /**
   * (OPTIONAL): The Secrets Manager name that stores the pre-shared key (PSK), that exists in the
   * same account and region that the VPN Connection will be created in.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the VPN to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * Include the random hash suffix value in the Secrets Manager name. This can be found using the
   * following procedure:
   * 1. Navigate to the {@link https://us-east-1.console.aws.amazon.com/secretsmanager/listsecrets | Secrets Manager console}.
   * 2. Select the region you stored the secret in.
   * 3. Click on the name of the secret.
   * 4. Under **Secret details**, the **Secret ARN** contains the full name of the secret,
   * including the random hash suffix. This is the value after **secret:** in the ARN.
   *
   * NOTE: The `preSharedKey` (PSK) parameter is optional. If a PSK is not provided, Amazon will generate a
   * PSK for you.
   */
  readonly preSharedKey: string | undefined = undefined;

  /**
   * (OPTIONAL): The range of inside IP addresses for the tunnel. Any specified CIDR blocks must be unique across
   * all VPN connections that use the same virtual private gateway.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the VPN to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * The following CIDR blocks are reserved and cannot be used: - 169.254.0.0/30 - 169.254.1.0/30 -
   * 169.254.2.0/30 - 169.254.3.0/30 - 169.254.4.0/30 - 169.254.5.0/30 - 169.254.169.252/30
   */
  readonly tunnelInsideCidr: string | undefined = undefined;
}
/**
 * *{@link NetworkConfig} / {@link CustomerGatewayConfig} / {@link VpnConnectionConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpn/latest/s2svpn/VPC_VPN.html | Site-to-site VPN Connection} configuration.
 * Use this configuration to define the VPN connections that
 * terminate either on a Transit Gateway or virtual private gateway.
 * A VPN connection refers to the connection between your VPC and your own on-premises network.
 * You can enable access to your remote network from your VPC by creating an
 * AWS Site-to-Site VPN (Site-to-Site VPN) connection, and configuring routing
 * to pass traffic through the connection.
 *
 * @example
 * VPN termination at a Transit Gateway:
 * ```
 * - name: accelerator-vpn
 *   transitGateway: Network-Main
 *   routeTableAssociations:
 *     - Network-Main-Core
 *   routeTablePropagations:
 *     - Network-Main-Core
 *   staticRoutesOnly: false
 *   # Tunnel specifications are optional
 *   tunnelSpecifications:
 *     - tunnelInsideCidr: 169.254.200.0/30
 *       preSharedKey: Key1-AbcXyz
 *     - tunnelInsideCidr: 169.254.200.100/30
 *       preSharedKey: Key1-AbcXyz
 * ```
 * VPN termination at a VPC:
 * ```
 * - name: accelerator-vpn
 *   vpc: Inspection-Vpc
 *   staticRoutesOnly: false
 *   # Tunnel specifications are optional
 *   tunnelSpecifications:
 *     - tunnelInsideCidr: 169.254.200.0/30
 *       preSharedKey: Key1-AbcXyz
 *     - tunnelInsideCidr: 169.254.200.100/30
 *       preSharedKey: Key1-AbcXyz
 * ```
 */
export class VpnConnectionConfig implements t.TypeOf<typeof NetworkConfigTypes.vpnConnectionConfig> {
  /**
   * The name of the VPN Connection.
   *
   * The value of this property will be utilized as the logical id for this
   * resource. Any references to this object should specify this value.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the VPN to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: string = '';

  /**
   * The logical name of the Transit Gateway that the customer Gateway is attached to
   * so that a VPN connection is established.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the VPN to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * Must specify either the Transit Gateway name or the Virtual Private Gateway, not
   * both.
   */
  readonly transitGateway: string | undefined = undefined;

  /**
   * The logical name of the Virtual Private Cloud that a Virtual Private Gateway is attached to.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the VPN to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * Must specify either the Transit Gateway name or the Virtual Private Gateway, not
   * both.
   */
  readonly vpc: string | undefined = undefined;

  /**
   * (OPTIONAL) An array of Transit Gateway route table names to associate the VPN attachment to
   *
   * @remarks
   * This is the `name` property of the Transit Gateway route table
   *
   * This property should only be defined if creating a VPN connection to a Transit Gateway.
   * Leave undefined for VPN connections to virtual private gateways.
   */
  readonly routeTableAssociations: string[] | undefined = undefined;

  /**
   * (OPTIONAL) An array of Transit Gateway route table names to propagate the VPN attachment to
   *
   * @remarks
   * This is the `name` property of the Transit Gateway route table
   *
   * This property should only be defined if creating a VPN connection to a Transit Gateway.
   * Leave undefined for VPN connections to virtual private gateways.
   */
  readonly routeTablePropagations: string[] | undefined = undefined;

  /**
   * (OPTIONAL) If creating a VPN connection for a device that doesn't support Border Gateway Protocol (BGP)
   * declare true as a value, otherwise, use false.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the VPN to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly staticRoutesOnly: boolean | undefined = undefined;

  /**
   * (OPTIONAL) An array of tags for the VPN Connection.
   */
  readonly tags: t.Tag[] | undefined = undefined;

  /**
   * (OPTIONAL) Define the optional VPN Tunnel configuration
   * @see {@link VpnTunnelOptionsSpecificationsConfig}
   */
  readonly tunnelSpecifications: VpnTunnelOptionsSpecificationsConfig[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CustomerGatewayConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpn/latest/s2svpn/your-cgw.html | Customer Gateway (CGW)} Configuration.
 * Use this configuration to define Customer Gateways and site-to-site VPN connections.
 * A customer gateway device is a physical or software appliance that you own or manage in
 * your on-premises network (on your side of a Site-to-Site VPN connection).
 * A VPN connection refers to the connection between your VPC and your own on-premises network.
 *
 * @example
 * ```
 * customerGateways:
 *   - name: accelerator-cgw
 *     account: Network
 *     region: *HOME_REGION
 *     ipAddress: 1.1.1.1
 *     asn: 65500
 *     vpnConnections:
 *       - name: accelerator-vpn
 *         transitGateway: Network-Main
 *         routeTableAssociations:
 *           - Network-Main-Core
 *         routeTablePropagations:
 *           - Network-Main-Core
 *         staticRoutesOnly: false
 *         tunnelSpecifications:
 *           - tunnelInsideCidr: 169.254.200.0/30
 *             preSharedKey: Key1-AbcXyz
 *           - tunnelInsideCidr: 169.254.200.100/30
 *             preSharedKey: Key2-AbcXyz
 * ```
 */
export class CustomerGatewayConfig implements t.TypeOf<typeof NetworkConfigTypes.customerGatewayConfig> {
  /**
   * The name of the CGW.
   *
   * The value of this property will be utilized as the logical id for this
   * resource. Any references to this object should specify this value.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the VPN to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: string = '';

  /**
   * The logical name of the account to deploy the Customer Gateway to. This value should match the name of the account recorded
   * in the accounts-config.yaml file.
   */
  readonly account: string = '';

  /**
   * The AWS region to provision the customer gateway in
   */
  readonly region: t.Region = 'us-east-1';

  /**
   * Defines the IP address of the Customer Gateway
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the VPN to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly ipAddress: string = '';

  /**
   * Define the ASN used for the Customer Gateway
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the VPN to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * The private ASN range is 64512 to 65534. The default is 65000.
   */
  readonly asn: number = 65000;

  /**
   * Define tags for the Customer Gateway
   */
  readonly tags: t.Tag[] | undefined = undefined;

  /**
   * Define the optional VPN Connection configuration
   * @see {@link VpnConnectionConfig}
   */
  readonly vpnConnections: VpnConnectionConfig[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} / {@link LoadBalancersConfig}*
 *
 * {@link https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/how-elastic-load-balancing-works.html | Elastic Load Balancers} Configuration.
 * Use this configuration to define Application Load Balancers (ALBs) or
 * Network Load Balancers (NLBs) to be deployed in the specified VPC subnets.
 */

export class LoadBalancersConfig implements t.TypeOf<typeof NetworkConfigTypes.loadBalancersConfig> {
  /**
   * (OPTIONAL) An array of Application Load Balancer (ALB) configurations.
   * Use this property to define ALBs to be deployed in the specified VPC subnets.
   *
   * @see {@link ApplicationLoadBalancerConfig}
   */
  readonly applicationLoadBalancers: CustomizationsConfig.ApplicationLoadBalancerConfig[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of Network Load Balancer (NLB) configurations.
   * Use this property to define NLBs to be deployed in the specified VPC subnets.
   *
   * @see {@link NetworkLoadBalancerConfig}
   */
  readonly networkLoadBalancers: CustomizationsConfig.NetworkLoadBalancerConfig[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} / {@link VirtualPrivateGatewayConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/vpn-connections.html | Virtual Private Gateway} Configuration.
 * Used to define Virtual Private Gateways that are attached to a VPC.
 * You can create an IPsec VPN connection between your VPC and your remote network.
 * On the AWS side of the Site-to-Site VPN connection, a virtual private gateway or transit
 * gateway provides two VPN endpoints (tunnels) for automatic failover.
 *
 * @example
 * ```
 * virtualPrivateGateway:
 *  asn: 65500
 * ```
 */
export class VirtualPrivateGatewayConfig implements t.TypeOf<typeof NetworkConfigTypes.virtualPrivateGatewayConfig> {
  /**
   * Define the ASN (Amazon Side) used for the Virtual Private Gateway
   *
   * @remarks
   * The private ASN range is 64512 to 65534. The default is 65000.
   */
  readonly asn: number = 65000;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/what-is-amazon-vpc.html | Virtual Private Cloud (VPC)} configuration.
 * Use this configuration to define a VPC that is deployed to a single account and region.
 * With Amazon Virtual Private Cloud (Amazon VPC), you can launch AWS resources in a logically
 * isolated virtual network that you've defined. This virtual network closely resembles a traditional
 * network that you'd operate in your own data center, with the benefits of using the scalable infrastructure of AWS.
 *
 * @example
 * Static CIDR:
 * ```
 * vpcs:
 *   - name: Network-Inspection
 *     account: Network
 *     region: us-east-1
 *     cidrs:
 *       - 10.0.0.0/24
 *     enableDnsHostnames: true
 *     enableDnsSupport: true
 *     instanceTenancy: default
 *     routeTables: []
 *     subnets: []
 *     natGateways: []
 *     transitGatewayAttachments: []
 *     tags: []
 * ```
 * IPAM allocation:
 * ```
 * vpcs:
 *   - name: Network-Inspection
 *     account: Network
 *     region: us-east-1
 *     ipamAllocations:
 *       - ipamPoolName: accelerator-regional-pool
 *         netmaskLength: 24
 *     enableDnsHostnames: true
 *     enableDnsSupport: true
 *     instanceTenancy: default
 *     routeTables: []
 *     subnets: []
 *     natGateways: []
 *     transitGatewayAttachments: []
 *     tags: []
 * ```
 */
export class VpcConfig implements t.TypeOf<typeof NetworkConfigTypes.vpcConfig> {
  /**
   * The friendly name of the VPC.
   *
   * The value of this property will be utilized as the logical id for this
   * resource. Any references to this object should specify this value.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the VPC to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: string = '';

  /**
   * The logical name of the account to deploy the VPC to
   *
   * @remarks
   * This is the logical `name` property of the account as defined in accounts-config.yaml.
   */
  readonly account: string = '';

  /**
   * The AWS region to deploy the VPC to
   */
  readonly region: t.Region = 'us-east-1';

  /**
   * (OPTIONAL) A list of CIDRs to associate with the VPC.
   *
   * @remarks
   * **CAUTION**: Changing or removing an existing CIDR value after initial deployment causes the VPC to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   * You can add additional CIDRs to the VPC without this recreation occurring.
   *
   * NOTE: Expanding a VPC with additional CIDRs is subject to {@link https://docs.aws.amazon.com/vpc/latest/userguide/vpc-cidr-blocks.html#add-cidr-block-restrictions | these restrictions}.
   *
   * At least one CIDR should be
   * provided if not using `ipamAllocations`.
   *
   * Use CIDR notation, i.e. 10.0.0.0/16
   */
  readonly cidrs: string[] | undefined = undefined;

  /**
   * (OPTIONAL) Determine if the all traffic ingress and egress rules are deleted
   * in the default security group of a VPC.
   *
   * @remarks
   *
   * If the `defaultSecurityGroupRulesDeletion` parameter is set to `true`, the solution
   * will proceed in removing the default ingress and egress All Traffic (0.0.0.0/0) for that
   * respective VPC's default security group.
   *
   * @see {@link https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/default-custom-security-groups.html#default-security-group}
   *
   */
  readonly defaultSecurityGroupRulesDeletion: boolean | undefined = false;

  /**
   * (OPTIONAL) The friendly name of a custom DHCP options set.
   *
   * @remarks
   * This is the logical `name` property of the DHCP options set as defined in network-config.yaml.
   *
   * @see {@link DhcpOptsConfig}
   */
  readonly dhcpOptions: string | undefined = undefined;

  /**
   * (OPTIONAL) An array of DNS firewall VPC association configurations.
   * Use this property to associate Route 53 resolver DNS firewall
   * rule groups with the VPC.
   *
   * @see {@link NetworkConfigTypes.vpcDnsFirewallAssociationConfig}
   *
   * @remarks
   * The DNS firewall rule groups must be deployed in the same region of the VPC and `shareTargets` must
   * be configured to capture the account that this VPC is deployed to. If deploying this VPC to the delegated
   * admin account, `shareTargets` is not required.
   *
   * @see {@link DnsFirewallRuleGroupConfig}
   */
  readonly dnsFirewallRuleGroups: t.TypeOf<typeof NetworkConfigTypes.vpcDnsFirewallAssociationConfig>[] | undefined =
    undefined;

  /**
   * Defines if an {@link https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html | internet gateway} should be added to the VPC
   */
  readonly internetGateway: boolean | undefined = undefined;
  /**
   * Enable DNS hostname support for the VPC.
   *
   * @see {@link https://docs.aws.amazon.com/vpc/latest/userguide/vpc-dns.html}
   */
  readonly enableDnsHostnames: boolean | undefined = true;
  /**
   * Enable DNS support for the VPC.
   *
   * @see {@link https://docs.aws.amazon.com/vpc/latest/userguide/vpc-dns.html}
   */
  readonly enableDnsSupport: boolean | undefined = true;

  /**
   * (OPTIONAL) Define instance tenancy for the VPC. The default value is `default`.
   *
   * @see {@link https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/dedicated-instance.html}
   */
  readonly instanceTenancy: t.TypeOf<typeof NetworkConfigTypes.instanceTenancyTypeEnum> | undefined = 'default';

  /**
   * (OPTIONAL) An array of IPAM allocation configurations.
   *
   * @see {@link IpamAllocationConfig}
   *
   * @remarks
   * **CAUTION**: Changing or removing an existing IPAM allocation value after initial deployment causes the VPC to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   * You can add additional IPAM allocations to the VPC without this recreation occurring.
   *
   * NOTE: Expanding a VPC with additional CIDRs is subject to {@link https://docs.aws.amazon.com/vpc/latest/userguide/vpc-cidr-blocks.html#add-cidr-block-restrictions | these restrictions}.
   *
   * IPAM pools defined in network-config.yaml must be deployed to the same region of the VPC and `shareTargets` must
   * be configured to capture the account that this VPC is deployed to. If deploying this VPC to the delegated
   * admin account, `shareTargets` is not required.
   *
   * @see {@link IpamPoolConfig}
   *
   */
  readonly ipamAllocations: IpamAllocationConfig[] | undefined = undefined;

  /**
   * (OPTIONAL) A list of DNS query log configuration names.
   *
   * @remarks
   * This is the logical `name` property of the Route 53 resolver query logs configuration as defined
   * in network-config.yaml. The `shareTargets` property must be configured to capture the account that
   * this VPC is deployed to. If deploying this VPC to the delegated admin account, `shareTargets` is not required.
   *
   * @see {@link DnsQueryLogsConfig}
   */
  readonly queryLogs: string[] | undefined = undefined;

  /**
   * (OPTIONAL) A list of Route 53 resolver rule names.
   *
   * @remarks
   * This is the logical `name` property of the Route 53 resolver rules configuration as defined
   * in network-config.yaml. The `shareTargets` property must be configured to capture the account that
   * this VPC is deployed to. If deploying this VPC to the delegated admin account, `shareTargets` is not required.
   *
   * @see {@link ResolverRuleConfig}
   */
  readonly resolverRules: string[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of route table configurations for the VPC.
   * Use this property to configure the route tables for the VPC.
   *
   * @see {@link RouteTableConfig}
   */
  readonly routeTables: RouteTableConfig[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of subnet configurations for the VPC.
   * Use this property to configure the subnets for the VPC.
   *
   * @see {@link SubnetConfig}
   */
  readonly subnets: SubnetConfig[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of NAT gateway configurations for the VPC.
   * Use this property to configure the NAT gateways for the VPC.
   *
   * @see {@link NatGatewayConfig}
   */
  readonly natGateways: NatGatewayConfig[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of Transit Gateway attachment configurations.
   * Use this property to configure the Transit Gateway attachments for the VPC.
   *
   * @see {@link TransitGatewayAttachmentConfig}
   */
  readonly transitGatewayAttachments: TransitGatewayAttachmentConfig[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of Local Gateway Route table configurations.
   * Use this configuration to associate Outposts Local Gateway Route tables with the VPC.
   */
  readonly outposts: OutpostsConfig[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of gateway endpoints for the VPC.
   * Use this property to define S3 or DynamoDB gateway endpoints for the VPC.
   *
   * @see {@link GatewayEndpointConfig}
   */
  readonly gatewayEndpoints: GatewayEndpointConfig | undefined = undefined;

  /**
   * (OPTIONAL) A list of VPC interface endpoints.
   * Use this property to define VPC interface endpoints for the VPC.
   *
   * @see {@link InterfaceEndpointConfig}
   */
  readonly interfaceEndpoints: InterfaceEndpointConfig | undefined = undefined;

  /**
   * (OPTIONAL) When set to true, this VPC will be configured to utilize centralized
   * endpoints. This includes having the Route 53 Private Hosted Zone
   * associated with this VPC. Centralized endpoints are configured per
   * region, and can span to spoke accounts
   *
   * @default false
   *
   * @remarks
   * A VPC deployed in the same region as this VPC in network-config.yaml must be configured with {@link InterfaceEndpointConfig}
   * `central` property set to `true` to utilize centralized endpoints.
   */
  readonly useCentralEndpoints: boolean | undefined = false;

  /**
   * (OPTIONAL) A list of Security Groups to deploy for this VPC
   *
   * @default undefined
   *
   * @remarks
   * As of version 1.4.0, if any {@link SubnetConfig} for this VPC is configured with a `shareTargets` property,
   * the accelerator automatically replicates security groups configured in this
   * VPC to the shared account(s).
   */
  readonly securityGroups: SecurityGroupConfig[] | undefined = undefined;

  /**
   * (OPTIONAL) A list of Network Access Control Lists (ACLs) to deploy for this VPC
   *
   * @default undefined
   *
   * @see {@link NetworkAclConfig}
   */
  readonly networkAcls: NetworkAclConfig[] | undefined = undefined;

  /**
   * (OPTIONAL) A list of tags to apply to this VPC
   *
   * @default undefined
   *
   * @remarks
   * As of version 1.2.0, if any {@link SubnetConfig} for this VPC is configured with a `shareTargets` property,
   * the accelerator automatically replicates tags configured in this
   * VPC to the shared account(s).
   *
   */
  readonly tags: t.Tag[] | undefined = undefined;

  /**
   * (OPTIONAL) Virtual Private Gateway configuration.
   * Use this property to configure a Virtual Private Gateway for the VPC.
   *
   * @default undefined
   */
  readonly virtualPrivateGateway: VirtualPrivateGatewayConfig | undefined = undefined;

  /**
   * VPC flog log configuration.
   * Use this property to define a VPC-specific VPC flow logs configuration.
   *
   * @remarks
   * If defined, this configuration is preferred over a global
   * VPC flow logs configuration.
   *
   * @see {@link VpcFlowLogsConfig}
   */
  readonly vpcFlowLogs: t.VpcFlowLogsConfig | undefined = undefined;
  /**
   * Elastic Load Balancing configuration.
   * Use this property to define Elastic Load Balancers for this VPC.
   *
   * @see {@link LoadBalancersConfig}
   */
  readonly loadBalancers: LoadBalancersConfig | undefined = undefined;
  /**
   * Target group configuration.
   * Use this property to define target groups for this VPC.
   *
   * @see {@link TargetGroupItemConfig}
   */
  readonly targetGroups: CustomizationsConfig.TargetGroupItemConfig[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcTemplatesConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/what-is-amazon-vpc.html | Virtual Private Cloud (VPC)} templates configuration.
 * Use this configuration to define a VPC using a standard configuration that is deployed to multiple account(s)/OU(s) defined using a `deploymentTargets` property.
 * With Amazon Virtual Private Cloud (Amazon VPC), you can launch AWS resources in a logically
 * isolated virtual network that you've defined. This virtual network closely resembles a traditional
 * network that you'd operate in your own data center, with the benefits of using the scalable infrastructure of AWS.
 *
 * Static CIDR:
 * ```
 * vpcTemplates:
 *   - name: Accelerator-Template
 *     deploymentTargets:
 *       organizationalUnits:
 *         - Infrastructure
 *     region: us-east-1
 *     cidrs:
 *       - 10.0.0.0/24
 *     enableDnsHostnames: true
 *     enableDnsSupport: true
 *     instanceTenancy: default
 *     routeTables: []
 *     subnets: []
 *     natGateways: []
 *     transitGatewayAttachments: []
 *     tags: []
 * ```
 * IPAM allocation:
 * ```
 * vpcTemplates:
 *   - name: Accelerator-Template
 *     deploymentTargets:
 *       organizationalUnits:
 *         - Infrastructure
 *     region: us-east-1
 *     ipamAllocations:
 *       - ipamPoolName: accelerator-regional-pool
 *         netmaskLength: 24
 *     enableDnsHostnames: true
 *     enableDnsSupport: true
 *     instanceTenancy: default
 *     routeTables: []
 *     subnets: []
 *     natGateways: []
 *     transitGatewayAttachments: []
 *     tags: []
 * ```
 */
export class VpcTemplatesConfig implements t.TypeOf<typeof NetworkConfigTypes.vpcTemplatesConfig> {
  /**
   * The friendly name of the VPC.
   *
   * The value of this property will be utilized as the logical id for this
   * resource. Any references to this object should specify this value.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the VPC to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: string = '';

  /**
   * The AWS region to deploy the VPCs to
   */
  readonly region: t.Region = 'us-east-1';

  /**
   * VPC deployment targets.
   *
   * @remarks
   * Targets can be account names and/or organizational units.
   * The `excludedRegions` property is ignored for VPC templates,
   * as a VPC template can only be deployed to a single region.
   *
   * @see {@link DeploymentTargets}
   */
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();

  /**
   * (OPTIONAL) A list of CIDRs to associate with the VPC.
   *
   * @remarks
   * **CAUTION**: Changing or removing an existing CIDR value after initial deployment causes the VPC to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   * You can add additional CIDRs to the VPC without this recreation occurring.
   *
   * NOTE: Expanding a VPC with additional CIDRs is subject to {@link https://docs.aws.amazon.com/vpc/latest/userguide/vpc-cidr-blocks.html#add-cidr-block-restrictions | these restrictions}.
   *
   * At least one CIDR should be
   * provided if not using `ipamAllocations`.
   *
   * Use CIDR notation, i.e. 10.0.0.0/16
   */
  readonly cidrs: string[] | undefined = undefined;

  /**
   * (OPTIONAL) An array of IPAM allocation configurations.
   *
   * @see {@link IpamAllocationConfig}
   *
   * @remarks
   * **CAUTION**: Changing or removing an existing IPAM allocation value after initial deployment causes the VPC to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   * You can add additional IPAM allocations to the VPC without this recreation occurring.
   *
   * NOTE: Expanding a VPC with additional CIDRs is subject to {@link https://docs.aws.amazon.com/vpc/latest/userguide/vpc-cidr-blocks.html#add-cidr-block-restrictions | these restrictions}.
   *
   * IPAM pools defined in network-config.yaml must be deployed to the same region of the VPC and `shareTargets` must
   * be configured to capture the account(s)/OU(s) that this VPC template is deployed to. If deploying this VPC to the delegated
   * admin account, `shareTargets` is not required for that account.
   *
   * @see {@link IpamPoolConfig}
   */
  readonly ipamAllocations: IpamAllocationConfig[] | undefined = undefined;

  /**
   * (OPTIONAL) Determine if the all traffic ingress and egress rules are deleted
   * in the default security group of a VPC.
   *
   * @remarks
   *
   * If the `defaultSecurityGroupRulesDeletion` parameter is set to `true`, the solution
   * will proceed in removing the default ingress and egress All Traffic (0.0.0.0/0) for that
   * respective VPC's default security group.
   *
   * @see {@link https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/default-custom-security-groups.html#default-security-group}
   */
  readonly defaultSecurityGroupRulesDeletion: boolean | undefined = false;

  /**
   * (OPTIONAL) The friendly name of a custom DHCP options set.
   *
   * @remarks
   * This is the logical `name` property of the DHCP options set as defined in network-config.yaml.
   *
   * @see {@link DhcpOptsConfig}
   */
  readonly dhcpOptions: string | undefined = undefined;

  /**
   * (OPTIONAL) An array of DNS firewall VPC association configurations.
   * Use this property to associate Route 53 resolver DNS firewall
   * rule groups with the VPC.
   *
   * @see {@link NetworkConfigTypes.vpcDnsFirewallAssociationConfig}
   *
   * @remarks
   * The DNS firewall rule groups must be deployed in the same region of the VPC and `shareTargets` must
   * be configured to capture the account(s)/OU(s) that this VPC template is deployed to. If deploying this VPC to the delegated
   * admin account, `shareTargets` is not required for that account.
   *
   * @see {@link DnsFirewallRuleGroupConfig}
   */
  readonly dnsFirewallRuleGroups: t.TypeOf<typeof NetworkConfigTypes.vpcDnsFirewallAssociationConfig>[] | undefined =
    undefined;

  /**
   * Defines if an {@link https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html | internet gateway} should be added to the VPC
   */
  readonly internetGateway: boolean | undefined = undefined;
  /**
   * Enable DNS hostname support for the VPC.
   *
   * @see {@link https://docs.aws.amazon.com/vpc/latest/userguide/vpc-dns.html}
   */
  readonly enableDnsHostnames: boolean | undefined = true;
  /**
   * Enable DNS support for the VPC.
   *
   * @see {@link https://docs.aws.amazon.com/vpc/latest/userguide/vpc-dns.html}
   */
  readonly enableDnsSupport: boolean | undefined = true;

  /**
   * (OPTIONAL) Define instance tenancy for the VPC. The default value is `default`.
   *
   * @see {@link https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/dedicated-instance.html}
   */
  readonly instanceTenancy: t.TypeOf<typeof NetworkConfigTypes.instanceTenancyTypeEnum> | undefined = 'default';

  /**
   * (OPTIONAL) A list of DNS query log configuration names.
   *
   * @remarks
   * This is the logical `name` property of the Route 53 resolver query logs configuration as defined
   * in network-config.yaml. The `shareTargets` property must be configured to capture the account(s)/OUs that
   * this VPC template is deployed to. If deploying this VPC to the delegated admin account, `shareTargets` is not required for that account.
   *
   * @see {@link DnsQueryLogsConfig}
   */
  readonly queryLogs: string[] | undefined = undefined;

  /**
   * (OPTIONAL) A list of Route 53 resolver rule names.
   *
   * @remarks
   * This is the logical `name` property of the Route 53 resolver rules configuration as defined
   * in network-config.yaml. The `shareTargets` property must be configured to capture the account(s)/OUs that
   * this VPC template is deployed to. If deploying this VPC to the delegated admin account, `shareTargets` is not required for that account.
   *
   * @see {@link ResolverRuleConfig}
   */
  readonly resolverRules: string[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of route table configurations for the VPC.
   * Use this property to configure the route tables for the VPC.
   *
   * @see {@link RouteTableConfig}
   */
  readonly routeTables: RouteTableConfig[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of subnet configurations for the VPC.
   * Use this property to configure the subnets for the VPC.
   *
   * @see {@link SubnetConfig}
   */
  readonly subnets: SubnetConfig[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of NAT gateway configurations for the VPC.
   * Use this property to configure the NAT gateways for the VPC.
   *
   * @see {@link NatGatewayConfig}
   */
  readonly natGateways: NatGatewayConfig[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of Transit Gateway attachment configurations.
   * Use this property to configure the Transit Gateway attachments for the VPC.
   *
   * @see {@link TransitGatewayAttachmentConfig}
   */
  readonly transitGatewayAttachments: TransitGatewayAttachmentConfig[] | undefined = undefined;

  /**
   * (OPTIONAL) An array of gateway endpoints for the VPC.
   * Use this property to define S3 or DynamoDB gateway endpoints for the VPC.
   *
   * @see {@link GatewayEndpointConfig}
   */
  readonly gatewayEndpoints: GatewayEndpointConfig | undefined = undefined;

  /**
   * (OPTIONAL) A list of VPC interface endpoints.
   * Use this property to define VPC interface endpoints for the VPC.
   *
   * @see {@link InterfaceEndpointConfig}
   */
  readonly interfaceEndpoints: InterfaceEndpointConfig | undefined = undefined;

  /**
   * (OPTIONAL) When set to true, this VPC will be configured to utilize centralized
   * endpoints. This includes having the Route 53 Private Hosted Zone
   * associated with this VPC. Centralized endpoints are configured per
   * region, and can span to spoke accounts
   *
   * @default false
   *
   * @remarks
   * A VPC deployed in the same region as this VPC in network-config.yaml must be configured with {@link InterfaceEndpointConfig}
   * `central` property set to `true` to utilize centralized endpoints.
   */
  readonly useCentralEndpoints: boolean | undefined = false;

  /**
   * (OPTIONAL) A list of Security Groups to deploy for this VPC
   *
   * @default undefined
   */
  readonly securityGroups: SecurityGroupConfig[] | undefined = undefined;

  /**
   * (OPTIONAL) A list of Network Access Control Lists (ACLs) to deploy for this VPC
   *
   * @default undefined
   *
   * @see {@link NetworkAclConfig}
   */
  readonly networkAcls: NetworkAclConfig[] | undefined = undefined;

  /**
   * (OPTIONAL) A list of tags to apply to this VPC
   *
   * @default undefined
   *
   */
  readonly tags: t.Tag[] | undefined = undefined;

  /**
   * (OPTIONAL) Virtual Private Gateway configuration.
   * Use this property to configure a Virtual Private Gateway for the VPC.
   *
   * @default undefined
   */
  readonly virtualPrivateGateway: VirtualPrivateGatewayConfig | undefined = undefined;

  /**
   * VPC flog log configuration.
   * Use this property to define a VPC-specific VPC flow logs configuration.
   *
   * @remarks
   * If defined, this configuration is preferred over a global
   * VPC flow logs configuration.
   *
   * @see {@link VpcFlowLogsConfig}
   */
  readonly vpcFlowLogs: t.VpcFlowLogsConfig | undefined = undefined;
  /**
   * Elastic Load Balancing configuration.
   * Use this property to define Elastic Load Balancers for this VPC.
   *
   * @see {@link LoadBalancersConfig}
   */
  readonly loadBalancers: LoadBalancersConfig | undefined = undefined;
  /**
   * Target group configuration.
   * Use this property to define target groups for this VPC.
   *
   * @see {@link TargetGroupItemConfig}
   */
  readonly targetGroups: CustomizationsConfig.TargetGroupItemConfig[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link ResolverConfig} / ({@link ResolverEndpointConfig}) / {@link ResolverRuleConfig}*
 *
 * {@link https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resolver-rules-managing.html | Route 53 resolver rule} configuration.
 * Use this configuration to define resolver SYSTEM and FORWARD rules for your resolver.
 * If you want Resolver to forward queries for specified domain names to your network,
 * you create one forwarding rule for each domain name and specify the name of the
 * domain for which you want to forward queries.
 *
 * @remarks
 * FORWARD rules should be defined under an OUTBOUND {@link ResolverEndpointConfig}. SYSTEM rules
 * should be defined directly under {@link ResolverConfig}.
 *
 * The following example creates a forwarding rule for `example.com` that is shared with the
 * entire organization. This rule targets an example on-prem IP address of `1.1.1.1`.
 * @example
 * ```
 * - name: accelerator-rule
 *   domainName: example.com
 *   ruleType: FORWARD
 *   shareTargets:
 *     organizationalUnits:
 *       - Root
 *   targetIps:
 *     - ip: 1.1.1.1
 *   tags: []
 * ```
 */
export class ResolverRuleConfig implements t.TypeOf<typeof NetworkConfigTypes.resolverRuleConfig> {
  /**
   * A friendly name for the resolver rule.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the rule to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: string = '';
  /**
   * The domain name for the resolver rule.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment may cause some interruptions
   * to your network traffic.
   */
  readonly domainName: string = '';
  /**
   * (OPTIONAL) Regions to exclude from SYSTEM rule deployment.
   *
   * @remarks
   * Only define this property if creating a `SYSTEM` rule type.
   * This does not apply to rules of type `FORWARD`.
   */
  readonly excludedRegions: t.Region[] | undefined = undefined;
  /**
   * (OPTIONAL) The friendly name of an inbound endpoint to target.
   *
   * @remarks
   * This is the logical `name` property of an INBOUND endpoint as defined in network-config.yaml.
   *
   * Use this property to define resolver rules for resolving DNS records across subdomains
   * hosted within the accelerator environment. This creates a FORWARD rule that targets
   * the IP addresses of an INBOUND endpoint.
   *
   * @see {@link ResolverEndpointConfig}
   */
  readonly inboundEndpointTarget: string | undefined = undefined;
  /**
   * (OPTIONAL) The type of rule to create.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the rule to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * When you want to forward DNS queries for specified domain name to resolvers on your network,
   * specify FORWARD.
   *
   * When you have a forwarding rule to forward DNS queries for a domain to your network and you want
   * Resolver to process queries for a subdomain of that domain, specify SYSTEM.
   *
   * Currently, only the Resolver service can create rules that have a value of RECURSIVE for ruleType.
   * Do not use type RECURSIVE. This is reserved for future use.
   *
   * @see {@link NetworkConfigTypes.ruleTypeEnum}
   */
  readonly ruleType: t.TypeOf<typeof NetworkConfigTypes.ruleTypeEnum> | undefined = 'FORWARD';
  /**
   * (OPTIONAL) Resource Access Manager (RAM) share targets.
   *
   * @remarks
   * Targets can be account names and/or organizational units.
   * Targets must include the account(s)/OU(s) of any VPCs that
   * the rule will be associated with.
   * You do not need to target the delegated admin account.
   *
   * @see {@link ShareTargets}
   */
  readonly shareTargets: t.ShareTargets | undefined = undefined;
  /**
   * (OPTIONAL) An array of tags for the resolver rule.
   */
  readonly tags: t.Tag[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of target IP configurations for the resolver rule.
   *
   * @remarks
   * Use this property to define target IP addresses/ports to forward DNS queries to.
   * Only define a port if the DNS server is using a non-standard port (i.e. any port other than port 53).
   *
   * @see {@link NetworkConfigTypes.ruleTargetIps}
   */
  readonly targetIps: t.TypeOf<typeof NetworkConfigTypes.ruleTargetIps>[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link ResolverConfig} / {@link ResolverEndpointConfig}*
 *
 * {@link https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resolver-overview-DSN-queries-to-vpc.html | Route 53 resolver endpoint} configuration.
 * Use this configuration to define inbound and outbound resolver endpoints.
 * Route 53 Resolver contains endpoints that you configure to answer DNS queries to
 * and from your on-premises environment.
 *
 *
 * @example
 * Outbound endpoint:
 * ```
 * - name: accelerator-outbound
 *   type: OUTBOUND
 *   vpc: Network-Endpoints
 *   allowedCidrs:
 *     - 10.0.0.0/16
 *   subnets:
 *     - Subnet-A
 *     - Subnet-B
 *   rules: []
 *   tags: []
 * ```
 * Inbound Endpoint:
 * ```
 * - name: accelerator-inbound
 *   type: INBOUND
 *   vpc: Network-Endpoints
 *   allowedCidrs:
 *     - 10.0.0.0/16
 *   subnets:
 *     - Subnet-A
 *     - Subnet-B
 *   tags: []
 * ```
 */
export class ResolverEndpointConfig implements t.TypeOf<typeof NetworkConfigTypes.resolverEndpointConfig> {
  /**
   * The friendly name of the resolver endpoint.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the rule to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: string = '';
  /**
   * The type of resolver endpoint to deploy.
   *
   * INBOUND: allows DNS queries to your VPC from your network
   *
   * OUTBOUND: allows DNS queries from your VPC to your network
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the rule to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * @see {@link NetworkConfigTypes.resolverEndpointTypeEnum}
   */
  readonly type: t.TypeOf<typeof NetworkConfigTypes.resolverEndpointTypeEnum> = 'INBOUND';
  /**
   * The friendly name of the VPC to deploy the resolver endpoint to.
   *
   * @remarks
   * This is the logical `name` property of a VPC as defined in network-config.yaml.
   *
   * @see {@link VpcConfig} | {@link VpcTemplatesConfig}
   */
  readonly vpc: string = '';
  /**
   * An array of friendly names for subnets to deploy the resolver endpoint to.
   *
   * @remarks
   * This is the logical `name` property of subnets as defined in network-config.yaml.
   * Subnets must be contained within the VPC referenced in the `vpc` property.
   *
   * @see {@link SubnetConfig}
   */
  readonly subnets: string[] = [];
  /**
   * (OPTIONAL) The allowed ingress/egress CIDRs for the resolver endpoint security group.
   *
   * @remarks
   * When resolver endpoints are defined, a security group is automatically created by the accelerator for the endpoints.
   * You can use this property to specify an array of CIDRs you would like to be explicitly allowed
   * in this security group. Otherwise, all IPs (0.0.0.0/0) are allowed for the direction
   * based on the `type` property of the endpoint.
   */
  readonly allowedCidrs: string[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of resolver rule configurations for the endpoint.
   *
   * @remarks
   * Resolver rules should only be defined for outbound endpoints. This
   * property should be left undefined for inbound endpoints.
   *
   * @see {@link ResolverRuleConfig}
   */
  readonly rules: ResolverRuleConfig[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of tags for the resolver endpoint.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link ResolverConfig} / {@link DnsQueryLogsConfig}*
 *
 * {@link https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resolver-query-logs.html | Route 53 Resolver DNS query logging} configuration.
 * Use this configuration to define a centralized query logging configuration that can
 * be associated with VPCs in your environment.
 * You can use this configuration to log queries that originate from your VPCs,
 * queries to your inbound and outbound resolver endpoints,
 * and queries that use Route 53 Resolver DNS firewall to allow, block, or monitor
 * domain lists.
 *
 * The following example creates a query logging configuration that logs to both
 * S3 and a CloudWatch Logs log group. It is shared with the entire organization.
 * @example
 * ```
 * name: accelerator-query-logs
 * destinations:
 *   - s3
 *   - cloud-watch-logs
 * shareTargets:
 *   organizationalUnits:
 *     - Root
 * ```
 */
export class DnsQueryLogsConfig implements t.TypeOf<typeof NetworkConfigTypes.dnsQueryLogsConfig> {
  /**
   * The friendly name of the query logging config.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the configuration to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: string = '';
  /**
   * An array of destination services used to store the logs.
   */
  readonly destinations: t.TypeOf<typeof t.logDestinationTypeEnum>[] = ['s3'];
  /**
   * Resource Access Manager (RAM) share targets.
   *
   * @remarks
   * Targets can be account names and/or organizational units.
   * Targets must include the account(s)/OU(s) of any VPCs that
   * the logging configuration will be associated with.
   * You do not need to target the delegated admin account.
   *
   * @see {@link ShareTargets}
   */
  readonly shareTargets: t.ShareTargets | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link ResolverConfig} / {@link DnsFirewallRuleGroupConfig} / {@link DnsFirewallRulesConfig}*
 *
 * {@link https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resolver-dns-firewall-rule-settings.html |Route 53 DNS firewall rule} configuration.
 * Use this configuration to define individual rules for your DNS firewall.
 * This allows you to define the DNS firewall behavior for your VPCs.
 *
 * The following example creates a rule that blocks requests from a custom list of domains.
 * The custom domain list path must exist in your accelerator configuration repository.
 * @example
 * ```
 * - name: accelerator-dns-rule
 *   action: BLOCK
 *   priority: 100
 *   blockResponse: NXDOMAIN
 *   customDomainList: path/to/domains.txt
 * ```
 */
export class DnsFirewallRulesConfig implements t.TypeOf<typeof NetworkConfigTypes.dnsFirewallRulesConfig> {
  /**
   * A friendly name for the DNS firewall rule.
   */
  readonly name: string = '';
  /**
   * An action for the DNS firewall rule to take on matching requests.
   *
   * @see {@link NetworkConfigTypes.dnsFirewallRuleActionTypeEnum}
   */
  readonly action: t.TypeOf<typeof NetworkConfigTypes.dnsFirewallRuleActionTypeEnum> = 'ALERT';
  /**
   * The priority of the DNS firewall rule.
   *
   * @remarks
   * Rules are evaluated in order from low to high number.
   * Priority values must be unique in each defined rule group.
   */
  readonly priority: number = 100;
  /**
   * (OPTIONAL) Configure an override domain for BLOCK actions.
   * This is a custom DNS record to send back in response to the query.
   *
   * @remarks
   * Only define this property if your are using a `blockResponse` of OVERRIDE.
   */
  readonly blockOverrideDomain: string | undefined = undefined;
  /**
   * (OPTIONAL) Configure a time-to-live (TTL) for the override domain.
   * This is the recommended amount of time for the DNS resolver or
   * web browser to cache the override record and use it in response to this query,
   * if it is received again. By default, this is zero, and the record isn't cached.
   *
   * @remarks
   * Only define this property if your are using a `blockResponse` of OVERRIDE.
   *
   */
  readonly blockOverrideTtl: number | undefined = undefined;
  /**
   * Configure a specific response type for BLOCK actions.
   * Block response types are defined here: {@link https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resolver-dns-firewall-rule-actions.html}
   *
   * @see {@link NetworkConfigTypes.dnsFirewallBlockResponseTypeEnum}
   */
  readonly blockResponse: t.TypeOf<typeof NetworkConfigTypes.dnsFirewallBlockResponseTypeEnum> | undefined = undefined;
  /**
   * A file containing a custom domain list in TXT format.
   *
   * @remarks
   * The file must exist in your accelerator configuration repository.
   * The file must contain domain names separated by newlines.
   */
  readonly customDomainList: string | undefined = undefined;
  /**
   * Configure a rule that uses an AWS-managed domain list.
   * AWS-managed domain lists are defined here: {@link https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resolver-dns-firewall-managed-domain-lists.html}
   *
   * @see {@link NetworkConfigTypes.dnsFirewallManagedDomainListEnum}
   */
  readonly managedDomainList: t.TypeOf<typeof NetworkConfigTypes.dnsFirewallManagedDomainListEnum> | undefined =
    undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link ResolverConfig} / {@link DnsFirewallRuleGroupConfig}*
 *
 * {@link https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resolver-dns-firewall-rule-groups.html | Route 53 DNS firewall rule group} configuration.
 * Use this configuration to define a group of rules for your DNS firewall.
 * Rule groups contain one to many rules that can be associated with VPCs in your environment.
 * These rules allow you to define the behavior of your DNS firewall.
 *
 * The following example creates a rule group that contains one rule entry.
 * The rule blocks a list of custom domains contained in a file in the accelerator
 * configuration repository. The rule group is shared to the entire organization.
 * @example
 * ```
 * - name: accelerator-rule-group
 *   regions:
 *     - us-east-1
 *   rules:
 *     - name: accelerator-dns-rule
 *       action: BLOCK
 *       priority: 100
 *       blockResponse: NXDOMAIN
 *       customDomainList: path/to/domains.txt
 *   shareTargets:
 *     organizationalUnits:
 *       - Root
 *   tags: []
 * ```
 */
export class DnsFirewallRuleGroupConfig implements t.TypeOf<typeof NetworkConfigTypes.dnsFirewallRuleGroupConfig> {
  /**
   * A friendly name for the DNS firewall rule group.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the configuration to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: string = '';
  /**
   * The regions to deploy the rule group to.
   *
   * @see {@link Region}
   */
  readonly regions: t.Region[] = ['us-east-1'];
  /**
   * An array of DNS firewall rule configurations.
   *
   * @see {@link DnsFirewallRulesConfig}
   */
  readonly rules: DnsFirewallRulesConfig[] = [];
  /**
   * (OPTIONAL) Resource Access Manager (RAM) share targets.
   *
   * @remarks
   * Targets can be account names and/or organizational units.
   * Targets must include the account(s)/OU(s) of any VPCs that
   * the logging configuration will be associated with.
   * You do not need to target the delegated admin account.
   *
   * @see {@link ShareTargets}
   */
  readonly shareTargets: t.ShareTargets | undefined = undefined;
  /**
   * An array of tags for the rule group.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link ResolverConfig}*
 *
 * {@link https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resolver.html Route 53 Resolver} configuration.
 * Use this configuration to define several features of Route 53 resolver, including resolver endpoints,
 * DNS firewall rule groups, and DNS query logs.
 * Amazon Route 53 Resolver responds recursively to DNS queries from AWS resources for public records,
 * Amazon VPC-specific DNS names, and Amazon Route 53 private hosted zones, and is available by default in all VPCs.
 *
 * @example
 * ```
 * route53Resolver:
 *   endpoints:
 *     - name: accelerator-outbound
 *       type: OUTBOUND
 *       vpc: Network-Endpoints
 *       allowedCidrs:
 *         - 10.0.0.0/16
 *       subnets:
 *         - Subnet-A
 *         - Subnet-B
 *       rules: []
 *       tags: []
 *   firewallRuleGroups:
 *     - name: accelerator-rule-group
 *       regions:
 *         - us-east-1
 *       rules:
 *         - name: accelerator-dns-rule
 *           action: BLOCK
 *           priority: 100
 *           blockResponse: NXDOMAIN
 *           customDomainList: path/to/domains.txt
 *       shareTargets:
 *         organizationalUnits:
 *           - Root
 *       tags: []
 *   queryLogs:
 *     name: accelerator-query-logs
 *     destinations:
 *       - s3
 *       - cloud-watch-logs
 *     shareTargets:
 *       organizationalUnits:
 *         - Root
 * ```
 */
export class ResolverConfig implements t.TypeOf<typeof NetworkConfigTypes.resolverConfig> {
  /**
   * (OPTIONAL) An array of Route 53 resolver endpoint configurations.
   *
   * @see {@link ResolverEndpointConfig}
   */
  readonly endpoints: ResolverEndpointConfig[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of Route 53 DNS firewall rule group configurations.
   *
   * @see {@link DnsFirewallRuleGroupConfig}
   */
  readonly firewallRuleGroups: DnsFirewallRuleGroupConfig[] | undefined = undefined;
  /**
   * (OPTIONAL) A Route 53 resolver DNS query logging configuration.
   *
   * @see {@link DnsQueryLogsConfig}
   */
  readonly queryLogs: DnsQueryLogsConfig | undefined = undefined;
  /**
   * (OPTIONAL) An array of Route 53 resolver rules.
   *
   * @remarks
   * This `rules` property should only be used for rules of type `SYSTEM`.
   * For rules of type `FORWARD`, define under the {@link ResolverEndpointConfig} configuration object.
   */
  readonly rules: ResolverRuleConfig[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig} / {@link NfwRuleSourceListConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateful-rule-groups-ips.html | Network Firewall stateful rule} source list configuration.
 * Use this configuration to define DNS domain allow and deny lists for Network Firewall.
 * Domain lists allow you to configure domain name filtering for your Network Firewall.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-rulessourcelist.html} for more details.
 *
 * The following example creates a deny list for all subdomains of `example.com`.
 * It checks packets for both TLS_SNI as well as HTTP_HOST headers with this value.
 * @example
 * ```
 * generatedRulesType: DENYLIST
 * targets:
 *   - .example.com
 * targetTypes: ['TLS_SNI', 'HTTP_HOST']
 * ```
 */
export class NfwRuleSourceListConfig implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleSourceListConfig> {
  /**
   * The type of rules to generate from the source list.
   */
  readonly generatedRulesType: t.TypeOf<typeof NetworkConfigTypes.nfwGeneratedRulesType> = 'DENYLIST';
  /**
   * An array of target domain names.
   *
   * @remarks
   * Supported values are as fallows:
   * Explicit domain names such as `www.example.com`.
   * Wildcard domain names should be prefaced with a `.`. For example: `.example.com`
   */
  readonly targets: string[] = [];
  /**
   * An array of protocol types to inspect.
   *
   * @see {@link NetworkConfigTypes.nfwTargetType}
   */
  readonly targetTypes: t.TypeOf<typeof NetworkConfigTypes.nfwTargetType>[] = ['TLS_SNI'];
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig} / {@link NfwRuleSourceStatefulRuleConfig} / {@link NfwRuleSourceStatefulRuleHeaderConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateful-rule-groups-ips.html | Network Firewall stateful rule} header configuration.
 * Use this configuration to define stateful rules for Network Firewall in an IP packet header format.
 * This header format can be used instead of Suricata-compatible rules to define your stateful firewall
 * filtering behavior.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-header.html} for more details.
 *
 * The following example creates a stateful rule that inspects all traffic from source 10.1.0.0/16 to destination
 * 10.0.0.0/16:
 * @example
 * ```
 * source: 10.1.0.0/16
 * sourcePort: ANY
 * destination: 10.0.0.0/16
 * destinationPort: ANY
 * direction: FORWARD
 * protocol: IP
 * ```
 */
export class NfwRuleSourceStatefulRuleHeaderConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleSourceStatefulRuleHeaderConfig>
{
  /**
   * The destination CIDR range to inspect for.
   *
   * @remarks
   * Use CIDR notation, i.e. 10.0.0.0/16
   */
  readonly destination: string = '';
  /**
   * The destination port or port range to inspect.
   *
   * @remarks
   * To specify a port range, separate the values with a colon `:`.
   * For example: `80:443`. To specify all ports, use `ANY`.
   */
  readonly destinationPort: string = '';
  /**
   * The direction of the traffic flow to inspect.
   *
   * @remarks
   * Use `ANY` to match bidirectional traffic.
   *
   * Use `FORWARD` to match only traffic going from the source to destination.
   */
  readonly direction: t.TypeOf<typeof NetworkConfigTypes.nfwStatefulRuleDirectionType> = 'ANY';
  /**
   * The protocol to inspect.
   *
   * @remarks
   * To specify all traffic, use `IP`.
   */
  readonly protocol: t.TypeOf<typeof NetworkConfigTypes.nfwStatefulRuleProtocolType> = 'IP';
  /**
   * The source CIDR range to inspect for.
   *
   * @remarks
   * Use CIDR notation, i.e. 10.0.0.0/16
   */
  readonly source: string = '';
  /**
   * The source port or port range to inspect.
   *
   * @remarks
   * To specify a port range, separate the values with a colon `:`.
   * For example: `80:443`. To specify all ports, use `ANY`.
   */
  readonly sourcePort: string = '';
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig} / {@link NfwRuleSourceStatefulRuleConfig} / {@link NfwRuleSourceStatefulRuleOptionsConfig}*
 *
 * Network Firewall stateful rule options configuration.
 * Use this configuration to specify keywords and setting metadata for stateful rules.
 *
 * @remarks
 * Keywords and settings can be used to define specific metadata for
 * stateful firewall rules that are defined using the {@link NfwRuleSourceStatefulRuleHeaderConfig}.
 * For Suricata-compatible rules, include the rule options in the Suricata string.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-ruleoption.html}.
 *
 * The following example creates a `sid` keyword with a value of 100:
 * @example
 * ```
 * - keyword: sid
 *   settings: ['100']
 * ```
 */
export class NfwRuleSourceStatefulRuleOptionsConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleSourceStatefulRuleOptionsConfig>
{
  /**
   * A Suricata-compatible keyword.
   */
  readonly keyword: string = '';
  /**
   * An array of values for the keyword.
   */
  readonly settings: string[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig} / {@link NfwRuleSourceStatefulRuleConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateful-rule-groups-ips.html | Network Firewall stateful rule} configuration.
 * Use this configuration to define stateful rules for Network Firewall in an IP packet header format.
 * This header format can be used instead of Suricata-compatible rules to define your stateful firewall
 * filtering behavior.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-statefulrule.html}
 *
 * @example
 * ```
 * - action: PASS
 *   header:
 *     source: 10.1.0.0/16
 *     sourcePort: ANY
 *     destination: 10.0.0.0/16
 *     destinationPort: ANY
 *     direction: FORWARD
 *     protocol: IP
 *   ruleOptions:
 *     - keyword: sid
 *       settings: ['100']
 * ```
 */
export class NfwRuleSourceStatefulRuleConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleSourceStatefulRuleConfig>
{
  /**
   * The action type for the stateful rule.
   *
   * @see {@link NetworkConfigTypes.nfwStatefulRuleActionType}
   */
  readonly action: t.TypeOf<typeof NetworkConfigTypes.nfwStatefulRuleActionType> = 'DROP';
  /**
   * A Network Firewall stateful rule header configuration.
   *
   * @see {@link NfwRuleSourceStatefulRuleHeaderConfig}
   */
  readonly header: NfwRuleSourceStatefulRuleHeaderConfig = new NfwRuleSourceStatefulRuleHeaderConfig();
  /**
   * An array of Network Firewall stateful rule options configurations.
   *
   * @see {@link NfwRuleSourceStatefulRuleOptionsConfig}
   */
  readonly ruleOptions: NfwRuleSourceStatefulRuleOptionsConfig[] = [new NfwRuleSourceStatefulRuleOptionsConfig()];
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig} / {@link NfwStatelessRulesAndCustomActionsConfig} / {@link NfwRuleSourceCustomActionConfig} / {@link NfwRuleSourceCustomActionDefinitionConfig} / {@link NfwRuleSourceCustomActionDimensionConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/rule-action.html#rule-action-stateless | Network Firewall stateless custom action} dimensions.
 * Use this configuration to define custom action dimensions to log in CloudWatch metrics.
 * You can optionally specify a named custom action to apply.
 * For this action, Network Firewall assigns a dimension to Amazon CloudWatch metrics
 * with the name set to CustomAction and a value that you specify.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-dimension.html}
 *
 * @example
 * ```
 * dimensions:
 *   - CustomValue
 * ```
 */
export class NfwRuleSourceCustomActionDimensionConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleSourceCustomActionDimensionConfig>
{
  /**
   * An array of values of the custom metric dimensions to log.
   */
  readonly dimensions: string[] = [];
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig} / {@link NfwStatelessRulesAndCustomActionsConfig} / {@link NfwRuleSourceCustomActionConfig} / {@link NfwRuleSourceCustomActionDefinitionConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/rule-action.html#rule-action-stateless | Network Firewall stateless custom action} definition configuration.
 * Use this configuration to define custom CloudWatch metrics for Network Firewall.
 * You can optionally specify a named custom action to apply.
 * For this action, Network Firewall assigns a dimension to Amazon CloudWatch metrics
 * with the name set to CustomAction and a value that you specify.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-actiondefinition.html}
 *
 * @example
 * ```
 * publishMetricAction:
 *   dimensions:
 *     - CustomValue
 * ```
 */
export class NfwRuleSourceCustomActionDefinitionConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleSourceCustomActionDefinitionConfig>
{
  /**
   * A Network Firewall custom action dimensions configuration.
   *
   * @see {@link NfwRuleSourceCustomActionDimensionConfig}
   */
  readonly publishMetricAction: NfwRuleSourceCustomActionDimensionConfig =
    new NfwRuleSourceCustomActionDimensionConfig();
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig} / {@link NfwStatelessRulesAndCustomActionsConfig} / {@link NfwRuleSourceCustomActionConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/rule-action.html#rule-action-stateless | Network Firewall stateless custom action} configuration.
 * Use this configuration to define to define custom actions for Network Firewall.
 * You can optionally specify a named custom action to apply.
 * For this action, Network Firewall assigns a dimension to Amazon CloudWatch metrics
 * with the name set to CustomAction and a value that you specify.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-customaction.html}
 *
 * @example
 * ```
 * actionDefinition:
 *   publishMetricAction:
 *     dimensions:
 *       - CustomValue
 * actionName: CustomAction
 * ```
 */
export class NfwRuleSourceCustomActionConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleSourceCustomActionConfig>
{
  /**
   * A Network Firewall custom action definition configuration.
   *
   * @see {@link NfwRuleSourceCustomActionDefinitionConfig}
   */
  readonly actionDefinition: NfwRuleSourceCustomActionDefinitionConfig =
    new NfwRuleSourceCustomActionDefinitionConfig();
  /**
   * A friendly name for the custom action.
   */
  readonly actionName: string = '';
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig} / {@link NfwStatelessRulesAndCustomActionsConfig} / {@link NfwRuleSourceStatelessRuleConfig} / {@link NfwRuleSourceStatelessRuleDefinitionConfig} / {@link NfwRuleSourceStatelessMatchAttributesConfig} / {@link NfwRuleSourceStatelessPortRangeConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateless-rule-groups-5-tuple.html | Network Firewall stateless rule} port range configuration.
 * Use this configuration to define a port range in stateless rules.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-portrange.html}
 *
 * @example
 * ```
 * - fromPort: 22
 *   toPort: 22
 * ```
 */
export class NfwRuleSourceStatelessPortRangeConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleSourceStatelessPortRangeConfig>
{
  /**
   * The port to start from in the range.
   */
  readonly fromPort: number = 123;
  /**
   * The port to end with in the range.
   */
  readonly toPort: number = 123;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig} / {@link NfwStatelessRulesAndCustomActionsConfig} / {@link NfwRuleSourceStatelessRuleConfig} / {@link NfwRuleSourceStatelessRuleDefinitionConfig} / {@link NfwRuleSourceStatelessMatchAttributesConfig} / {@link NfwRuleSourceStatelessTcpFlagsConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateless-rule-groups-5-tuple.html | Network Firewall stateless rule} TCP flags configuration.
 * Use this configuration to define TCP flags to inspect in stateless rules.
 * Optional, standard TCP flag settings, which indicate which flags to inspect and the values to inspect for.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-tcpflagfield.html}
 *
 * @example
 * ```
 * - flags: ['SYN', 'ECE']
 *   masks: []
 * ```
 */
export class NfwRuleSourceStatelessTcpFlagsConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleSourceStatelessTcpFlagsConfig>
{
  /**
   * An array of TCP flags.
   *
   * @remarks
   * Used in conjunction with the Masks setting to define the flags that must be set
   * and flags that must not be set in order for the packet to match.
   * This setting can only specify values that are also specified in the Masks setting.
   */
  readonly flags: t.TypeOf<typeof NetworkConfigTypes.nfwStatelessRuleTcpFlagType>[] = [];
  /**
   * The set of flags to consider in the inspection.
   *
   * @remarks
   * For the flags that are specified in the masks setting, the following must be true
   * for the packet to match:
   * The ones that are set in this flags setting must be set in the packet.
   * The ones that are not set in this flags setting must also not be set in the packet.
   * To inspect all flags in the valid values list, leave this with no setting.
   */
  readonly masks: t.TypeOf<typeof NetworkConfigTypes.nfwStatelessRuleTcpFlagType>[] = [];
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig} / {@link NfwStatelessRulesAndCustomActionsConfig} / {@link NfwRuleSourceStatelessRuleConfig} / {@link NfwRuleSourceStatelessRuleDefinitionConfig} / {@link NfwRuleSourceStatelessMatchAttributesConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateless-rule-groups-5-tuple.html | Network Firewall stateless rule} match attributes configuration.
 * Use this configuration to define stateless rule match attributes for Network Firewall.
 * To be a match, a packet must satisfy all of the match settings in the rule.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-matchattributes.html}
 *
 * @example
 * ```
 * protocols: [6]
 * sources:
 *   - 10.1.0.0/16
 * sourcePorts:
 *   - fromPort: 1024
 *     toPort: 65535
 * destinations:
 *   - 10.0.0.0/16
 * destinationPorts:
 *   - fromPort: 22
 *     toPort: 22
 * ```
 */
export class NfwRuleSourceStatelessMatchAttributesConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleSourceStatelessMatchAttributesConfig>
{
  /**
   * (OPTIONAL) An array of Network Firewall stateless port range configurations.
   *
   * @remarks
   * The destination ports to inspect for. If not specified, this matches with any destination port.
   * This setting is only used for protocols 6 (TCP) and 17 (UDP).
   *
   * @see {@link NfwRuleSourceStatelessPortRangeConfig}
   */
  readonly destinationPorts: NfwRuleSourceStatelessPortRangeConfig[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of destination CIDR ranges to inspect for.
   *
   * @remarks
   * Use CIDR notation, i.e. 10.0.0.0/16
   */
  readonly destinations: string[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of IP protocol numbers to inspect for.
   */
  readonly protocols: number[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of Network Firewall stateless port range configurations.
   *
   * @remarks
   * The source ports to inspect for. If not specified, this matches with any source port.
   * This setting is only used for protocols 6 (TCP) and 17 (UDP).
   *
   * @see {@link NfwRuleSourceStatelessPortRangeConfig}
   */
  readonly sourcePorts: NfwRuleSourceStatelessPortRangeConfig[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of source CIDR ranges to inspect for.
   *
   * @remarks
   * Use CIDR notation, i.e. 10.0.0.0/16
   */
  readonly sources: string[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of Network Firewall stateless TCP flag configurations.
   *
   * @see {@link NfwRuleSourceStatelessTcpFlagsConfig}
   */
  readonly tcpFlags: NfwRuleSourceStatelessTcpFlagsConfig[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig} / {@link NfwStatelessRulesAndCustomActionsConfig} / {@link NfwRuleSourceStatelessRuleConfig} / {@link NfwRuleSourceStatelessRuleDefinitionConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateless-rule-groups-5-tuple.html | Network Firewall stateless rule} definition configuration.
 * Use this configuration to define a stateless rule definition for your Network Firewall.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-ruledefinition.html}
 *
 * @example
 * ```
 * actions: ['aws:pass']
 * matchAttributes:
 *   protocols: [6]
 *   sources:
 *     - 10.1.0.0/16
 *   sourcePorts:
 *     - fromPort: 1024
 *       toPort: 65535
 *   destinations:
 *     - 10.0.0.0/16
 *   destinationPorts:
 *     - fromPort: 22
 *       toPort: 22
 * ```
 */
export class NfwRuleSourceStatelessRuleDefinitionConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleSourceStatelessRuleDefinitionConfig>
{
  /**
   * An array of actions to take using the stateless rule engine.
   */
  readonly actions: t.TypeOf<typeof NetworkConfigTypes.nfwStatelessRuleActionType>[] | string[] = ['aws:drop'];
  /**
   * A Network Firewall stateless rule match attributes configuration.
   *
   * @see {@link NfwRuleSourceStatelessMatchAttributesConfig}
   */
  readonly matchAttributes: NfwRuleSourceStatelessMatchAttributesConfig =
    new NfwRuleSourceStatelessMatchAttributesConfig();
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig} / {@link NfwStatelessRulesAndCustomActionsConfig} / {@link NfwRuleSourceStatelessRuleConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateless-rule-groups-5-tuple.html | Network Firewall stateless rule} configuration.
 * Use this configuration to define stateless rule for your  Network Firewall.
 * Network Firewall supports the standard stateless 5-tuple rule specification
 * for network traffic inspection. When Network Firewall finds a match between
 *  a rule's inspection criteria and a packet, we say that the packet matches
 * the rule and its rule group, and Network Firewall applies the rule's specified action to the packet.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-statelessrule.html}.
 *
 * The following example creates a stateless rule that allows SSH traffic from source 10.1.0.0/16
 * to destination 10.0.0.0/16. The rule has a priority value of 100:
 * @example
 * ```
 * - priority: 100
 *   ruleDefinition:
 *     actions: ['aws:pass']
 *     matchAttributes:
 *       sources:
 *         - 10.1.0.0/16
 *       sourcePorts:
 *         - fromPort: 1024
 *           toPort: 65535
 *       destinations:
 *         - 10.0.0.0/16
 *       destinationPorts:
 *         - fromPort: 22
 *           toPort: 22
 * ```
 */
export class NfwRuleSourceStatelessRuleConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleSourceStatelessRuleConfig>
{
  /**
   * The priority number for the rule.
   *
   * @remarks
   * Priority is evaluated in order from low to high.
   * Priority numbers must be unique within a rule group.
   */
  readonly priority: number = 123;
  /**
   * A Network Firewall stateless rule definition configuration.
   *
   * @see {@link NfwRuleSourceStatelessRuleDefinitionConfig}
   */
  readonly ruleDefinition: NfwRuleSourceStatelessRuleDefinitionConfig =
    new NfwRuleSourceStatelessRuleDefinitionConfig();
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig} / {@link NfwStatelessRulesAndCustomActionsConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateless-rule-groups-5-tuple.html | Network Firewall stateless rules} and
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/rule-action.html#rule-action-stateless | custom actions} configuration.
 * Use this configuration to define stateless rules and custom actions for Network Firewall.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-statelessrulesandcustomactions.html}
 *
 * @example
 * ```
 * statelessRules:
 *   - priority: 100
 *     ruleDefinition:
 *       actions: ['aws:pass']
 *       matchAttributes:
 *         sources:
 *           - 10.1.0.0/16
 *         sourcePorts:
 *           - fromPort: 1024
 *             toPort: 65535
 *         destinations:
 *           - 10.0.0.0/16
 *         destinationPorts:
 *           - fromPort: 22
 *             toPort: 22
 * customActions:
 *   actionDefinition:
 *     publishMetricAction:
 *       dimensions:
 *         - CustomValue
 *   actionName: CustomAction
 * ```
 */
export class NfwStatelessRulesAndCustomActionsConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwStatelessRulesAndCustomActionsConfig>
{
  /**
   * An array of Network Firewall stateless rule configurations.
   *
   * @see {@link NfwRuleSourceStatelessRuleConfig}
   */
  readonly statelessRules: NfwRuleSourceStatelessRuleConfig[] = [new NfwRuleSourceStatelessRuleConfig()];
  /**
   * An array of Network Firewall custom action configurations.
   *
   * @see {@link NfwRuleSourceCustomActionConfig}
   */
  readonly customActions: NfwRuleSourceCustomActionConfig[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig}*
 *
 * Network Firewall rule source configuration.
 * Use this configuration to define stateful and/or stateless rules for your Network Firewall.
 * The following rules sources are supported:
 * - File with list of Suricata-compatible rules
 * - Domain list
 * - Single Suricata-compatible rule
 * - Stateful rule in IP header format
 * - Stateless rules and custom actions
 *
 * @see {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/rule-sources.html}
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-rulessource.html}
 *
 * @example
 * File with list of Suricata rules:
 * ```
 * rulesFile: path/to/rules.txt
 * ```
 * Domain list:
 * ```
 * rulesSourceList:
 *   generatedRulesType: DENYLIST
 *   targets:
 *     - .example.com
 *   targetTypes: ['TLS_SNI', 'HTTP_HOST']
 * ```
 * Single Suricata rule:
 * ```
 * rulesString: 'pass ip 10.1.0.0/16 any -> 10.0.0.0/16 any (sid:100;)'
 * ```
 * Stateful rule in IP header format:
 * ```
 * statefulRules:
 *   - action: PASS
 *     header:
 *       source: 10.1.0.0/16
 *       sourcePort: ANY
 *       destination: 10.0.0.0/16
 *       destinationPort: ANY
 *       direction: FORWARD
 *       protocol: IP
 *     ruleOptions:
 *       - keyword: sid
 *         settings: ['100']
 * ```
 * Stateless rules:
 * ```
 * statelessRulesAndCustomActions:
 *   statelessRules:
 *     - priority: 100
 *       ruleDefinition:
 *         actions: ['aws:pass']
 *         matchAttributes:
 *           sources:
 *             - 10.1.0.0/16
 *           sourcePorts:
 *             - fromPort: 1024
 *               toPort: 65535
 *           destinations:
 *             - 10.0.0.0/16
 *           destinationPorts:
 *             - fromPort: 22
 *               toPort: 22
 * ```
 */
export class NfwRuleSourceConfig implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleSourceConfig> {
  /**
   * (OPTIONAL) A Network Firewall rule source list configuration.
   * Use this property to define a domain list for Network Firewall.
   *
   * @see {@link NfwRuleSourceListConfig}
   */
  readonly rulesSourceList: NfwRuleSourceListConfig | undefined = undefined;
  /**
   * (OPTIONAL) A Suricata-compatible stateful rule string.
   * Use this property to define a single Suricata-compatible rule for Network Firewall.
   *
   * @see {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/suricata-examples.html#suricata-example-rule-with-variables}
   */
  readonly rulesString: string | undefined = undefined;
  /**
   * (OPTIONAL) An array of Network Firewall stateful rule IP header configurations.
   * Use this property to define a stateful rule in IP header format for Network Firewall.
   *
   * @see {@link NfwRuleSourceStatefulRuleConfig}
   */
  readonly statefulRules: NfwRuleSourceStatefulRuleConfig[] | undefined = undefined;
  /**
   * (OPTIONAL) A Network Firewall stateless rules and custom action configuration.
   * Use this property to define stateless rules and custom actions for Network Firewall.
   *
   * @see {@link NfwStatelessRulesAndCustomActionsConfig}
   */
  readonly statelessRulesAndCustomActions: NfwStatelessRulesAndCustomActionsConfig | undefined = undefined;
  /**
   * (OPTIONAL) Suricata rules file.
   * Use this property to define a Suricata-compatible rules file for Network Firewall.
   *
   * @remarks
   * The path must exist in your accelerator configuration repository.
   * The file must be formatted with Suricata-compatible rules separated
   * by newlines.
   *
   * @see {@link https://suricata.readthedocs.io/en/suricata-6.0.2/rules/intro.html}
   *
   */
  readonly rulesFile: string | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleVariableConfig} / {@link NfwRuleVariableDefinitionConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/suricata-examples.html#suricata-example-rule-with-variables | Network Firewall rule variable} definition configuration.
 * Use this configuration to define rule variable definitions for Network Firewall.
 * Rule variables can be used in Suricata-compatible and domain list rule definitions.
 * They are not supported in stateful rule IP header definitions.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-rulevariables.html}
 *
 * @example
 * ```
 * - name: HOME_NET
 *   definition: ['10.0.0.0/16']
 * ```
 */
export class NfwRuleVariableDefinitionConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleVariableDefinitionConfig>
{
  /**
   * A name for the rule variable.
   */
  readonly name: string = '';
  /**
   * An array of values for the rule variable.
   */
  readonly definition: string[] = [];
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleVariableConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/suricata-examples.html#suricata-example-rule-with-variables | Network Firewall rule variable} configuration.
 * Use this configuration to define rule variable definitions for Network Firewall.
 * Rule variables can be used in Suricata-compatible and domain list rule definitions.
 * They are not supported in stateful rule IP header definitions.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-rulevariables.html}
 *
 * @example
 * CURRENT SYNTAX: use the following syntax when defining new rule variables in v1.3.1 and newer.
 * The additional example underneath is provided for backward compatibility.
 * ```
 * ipSets:
 *   - name: HOME_NET
 *     definition: ['10.0.0.0/16']
 * portSets:
 *   - name: HOME_NET
 *     definition: ['80', '443']
 * ```
 *
 * THE BELOW EXAMPLE SYNTAX IS DEPRECATED: use the above syntax when defining new or more than one rule variable
 * ```
 * ipSets:
 *   name: HOME_NET
 *   definition: ['10.0.0.0/16']
 * portSets:
 *   name: HOME_NET
 *   definition: ['80', '443']
 * ```
 */
export class NfwRuleVariableConfig implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleVariableConfig> {
  /**
   * A Network Firewall rule variable definition configuration.
   *
   * @see {@link NfwRuleVariableDefinitionConfig}
   */
  readonly ipSets: NfwRuleVariableDefinitionConfig | NfwRuleVariableDefinitionConfig[] = [
    new NfwRuleVariableDefinitionConfig(),
  ];
  /**
   * A Network Firewall rule variable definition configuration.
   *
   * @see {@link NfwRuleVariableDefinitionConfig}
   */
  readonly portSets: NfwRuleVariableDefinitionConfig | NfwRuleVariableDefinitionConfig[] = [
    new NfwRuleVariableDefinitionConfig(),
  ];
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig}*
 *
 * Network Firewall rule group rule configuration.
 * Used to define rules for a Network Firewall rule group.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-rulegroup.html}
 *
 * @example
 * ```
 * rulesSource:
 *   rulesFile: path/to/rules.txt
 * ruleVariables:
 *   ipSets:
 *     - name: HOME_NET
 *       definition: ['10.0.0.0/16']
 *   portSets:
 *     - name: HOME_NET
 *       definition: ['80', '443']
 * ```
 */
export class NfwRuleGroupRuleConfig implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleGroupRuleConfig> {
  /**
   * A Network Firewall rule source configuration.
   *
   * @see {@link NfwRuleSourceConfig}
   */
  readonly rulesSource: NfwRuleSourceConfig = new NfwRuleSourceConfig();
  /**
   * A Network Firewall rule variable configuration.
   *
   * @see {@link NfwRuleVariableConfig}
   */
  readonly ruleVariables: NfwRuleVariableConfig | undefined = undefined;
  /**
   * A stateful rule option for the rule group.
   *
   * @see {@link NetworkConfigTypes.nfwStatefulRuleOptionsType}
   */
  readonly statefulRuleOptions: t.TypeOf<typeof NetworkConfigTypes.nfwStatefulRuleOptionsType> | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateful-rule-groups-ips.html | Network Firewall rule group} configuration.
 * Use this configuration to define stateful and stateless rule groups for Network Firewall.
 * An AWS Network Firewall rule group is a reusable set of criteria for inspecting and handling network traffic.
 * You add one or more rule groups to a firewall policy as part of policy configuration.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-networkfirewall-rulegroup.html}
 *
 * @example
 * Stateful rule group:
 * ```
 * - name: accelerator-stateful-group
 *   regions:
 *     - us-east-1
 *   capacity: 100
 *   type: STATEFUL
 *   ruleGroup:
 *     rulesSource:
 *       rulesFile: path/to/rules.txt
 *   shareTargets:
 *     organizationalUnits:
 *       - Root
 *   tags: []
 * ```
 * Stateless rule group:
 * ```
 * - name: accelerator-stateless-group
 *   regions:
 *     - us-east-1
 *   capacity: 100
 *   type: STATELESS
 *   ruleGroup:
 *     rulesSource:
 *       statelessRulesAndCustomActions:
 *         statelessRules:
 *           - priority: 100
 *             ruleDefinition:
 *               actions: ['aws:pass']
 *               matchAttributes:
 *                 sources:
 *                   - 10.1.0.0/16
 *                 sourcePorts:
 *                   - fromPort: 1024
 *                     toPort: 65535
 *                 destinations:
 *                   - 10.0.0.0/16
 *                 destinationPorts:
 *                   - fromPort: 22
 *                     toPort: 22
 *   shareTargets:
 *     organizationalUnits:
 *       - Root
 *   tags: []
 * ```
 */
export class NfwRuleGroupConfig implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleGroupConfig> {
  /**
   * A friendly name for the rule group.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the rule group to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: string = '';
  /**
   * The regions to deploy the rule group to.
   *
   * @see {@link Region}
   */
  readonly regions: t.Region[] = [];
  /**
   * The capacity of the rule group.
   */
  readonly capacity: number = 123;
  /**
   * The type of rules in the rule group.
   */
  readonly type: t.TypeOf<typeof NetworkConfigTypes.nfwRuleType> = 'STATEFUL';
  /**
   * (OPTIONAL) A description for the rule group.
   */
  readonly description: string | undefined = undefined;
  /**
   * (OPTIONAL) A Network Firewall rule configuration.
   *
   * @see {@link NfwRuleGroupRuleConfig}
   */
  readonly ruleGroup: NfwRuleGroupRuleConfig | undefined = undefined;
  /**
   * (OPTIONAL) Resource Access Manager (RAM) share targets.
   *
   * @remarks
   * Targets can be account names and/or organizational units.
   * Targets must be configured for account(s)/OU(s) that require
   * access to the rule group. A target is not required for the
   * delegated admin account.
   *
   * @see {@link ShareTargets}
   */
  readonly shareTargets: t.ShareTargets | undefined = undefined;
  /**
   * (OPTIONAL) An array of tags for the rule group.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwFirewallPolicyConfig} / {@link NfwFirewallPolicyPolicyConfig} / {@link NfwStatefulRuleGroupReferenceConfig}*
 *
 * Network Firewall stateful rule group reference configuration.
 * Use this configuration to reference a stateful rule group in a Network Firewall policy.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-firewallpolicy-statefulrulegroupreference.html}
 *
 * @example
 * ```
 * - name: accelerator-stateful-group
 * ```
 */
export class NfwStatefulRuleGroupReferenceConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwStatefulRuleGroupReferenceConfig>
{
  /**
   * The friendly name of the rule group.
   *
   * @remarks
   * This is the logical `name` property of the rule group as defined in network-config.yaml.
   *
   * @see {@link NfwRuleGroupConfig}
   */
  readonly name: string = '';
  /**
   * (OPTIONAL) If using strict ordering, a priority number for the rule.
   */
  readonly priority: number | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwFirewallPolicyConfig} / {@link NfwFirewallPolicyPolicyConfig} / {@link NfwStatelessRuleGroupReferenceConfig}*
 *
 * Network Firewall stateless rule group reference configuration.
 * Use this configuration to reference a stateless rule group in a Network Firewall policy.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-firewallpolicy-statelessrulegroupreference.html}
 *
 * @example
 * ```
 * - name: accelerator-stateless-group
 *   priority: 100
 * ```
 */
export class NfwStatelessRuleGroupReferenceConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwStatelessRuleGroupReferenceConfig>
{
  /**
   * The friendly name of the rule group.
   *
   * @remarks
   * This is the logical `name` property of the rule group as defined in network-config.yaml.
   *
   * @see {@link NfwRuleGroupConfig}
   */
  readonly name: string = '';
  /**
   * A priority number for the rule.
   */
  readonly priority: number = 123;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwFirewallPolicyConfig} / {@link NfwFirewallPolicyPolicyConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/firewall-policies.html | Network Firewall policy} policy configuration.
 * Use this configuration to define how the Network Firewall policy will behave.
 * An AWS Network Firewall firewall policy defines the monitoring and protection behavior
 * for a firewall. The details of the behavior are defined in the rule groups that you add
 * to your policy, and in some policy default settings.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-firewallpolicy-firewallpolicy.html}
 *
 * @example:
 * ```
 * statelessDefaultActions: ['aws:forward_to_sfe']
 * statelessFragmentDefaultActions: ['aws:forward_to_sfe']
 * statefulRuleGroups:
 *   - name: accelerator-stateful-group
 * statelessRuleGroups:
 *   - name: accelerator-stateless-group
 *     priority: 100
 * ```
 */
export class NfwFirewallPolicyPolicyConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwFirewallPolicyPolicyConfig>
{
  /**
   * An array of default actions to take on packets evaluated by the stateless engine.
   *
   * @remarks
   * If using a custom action, the action must be defined in the `statelessCustomActions` property.
   */
  readonly statelessDefaultActions: string[] | t.TypeOf<typeof NetworkConfigTypes.nfwStatelessRuleActionType>[] = [];
  /**
   * An array of default actions to take on fragmented packets.
   *
   * @remarks
   * If using a custom action, the action must be defined in the `statelessCustomActions` property.
   */
  readonly statelessFragmentDefaultActions:
    | string[]
    | t.TypeOf<typeof NetworkConfigTypes.nfwStatelessRuleActionType>[] = [];
  /**
   * (OPTIONAL) An array of default actions to take on packets evaluated by the stateful engine.
   */
  readonly statefulDefaultActions: t.TypeOf<typeof NetworkConfigTypes.nfwStatefulDefaultActionType>[] | undefined =
    undefined;
  /**
   * (OPTIONAL) Define how the stateful engine will evaluate packets.
   *
   * @remarks
   * Default is DEFAULT_ACTION_ORDER. This property must be specified
   * if creating a STRICT_ORDER policy.
   */
  readonly statefulEngineOptions: t.TypeOf<typeof NetworkConfigTypes.nfwStatefulRuleOptionsType> | undefined =
    undefined;
  /**
   * {OPTIONAL) An array of Network Firewall stateful rule group reference configurations.
   *
   * @see {@link NfwStatefulRuleGroupReferenceConfig}
   */
  readonly statefulRuleGroups: NfwStatefulRuleGroupReferenceConfig[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of Network Firewall custom action configurations.
   *
   * @see {@link NfwRuleSourceCustomActionConfig}
   */
  readonly statelessCustomActions: NfwRuleSourceCustomActionConfig[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of Network Firewall stateless rule group reference configurations.
   *
   * @see {@link NfwStatelessRuleGroupReferenceConfig}
   */
  readonly statelessRuleGroups: NfwStatelessRuleGroupReferenceConfig[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwFirewallPolicyConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/firewall-policies.html | Network Firewall policy} configuration.
 * Use this configuration to define a Network Firewall policy.
 * An AWS Network Firewall firewall policy defines the monitoring and protection behavior
 * for a firewall. The details of the behavior are defined in the rule groups that you add
 * to your policy, and in some policy default settings.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-networkfirewall-firewallpolicy.html}
 *
 * @example
 * ```
 * - name: accelerator-nfw-policy
 *   firewallPolicy:
 *     statelessDefaultActions: ['aws:forward_to_sfe']
 *     statelessFragmentDefaultActions: ['aws:forward_to_sfe']
 *     statefulRuleGroups:
 *       - name: accelerator-stateful-group
 *     statelessRuleGroups:
 *       - name: accelerator-stateless-group
 *         priority: 100
 *   regions:
 *     - us-east-1
 *   shareTargets:
 *     organizationalUnits:
 *       - Root
 *   tags: []
 * ```
 */
export class NfwFirewallPolicyConfig implements t.TypeOf<typeof NetworkConfigTypes.nfwFirewallPolicyConfig> {
  /**
   * A friendly name for the policy.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the policy to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: string = '';
  /**
   * Use this property to define specific behaviors and rule groups
   * to associate with the policy.
   *
   * @see {@link NfwFirewallPolicyPolicyConfig}
   */
  readonly firewallPolicy: NfwFirewallPolicyPolicyConfig = new NfwFirewallPolicyPolicyConfig();
  /**
   * The regions to deploy the policy to.
   *
   * @see {@link Region}
   */
  readonly regions: t.Region[] = [];
  /**
   * (OPTIONAL) A description for the policy.
   */
  readonly description: string | undefined = undefined;
  /**
   * (OPTIONAL) Resource Access Manager (RAM) share targets.
   *
   * @remarks
   * Targets can be account names and/or organizational units.
   * Targets must be configured for account(s)/OU(s) that require
   * access to the policy. A target is not required for the
   * delegated admin account.
   *
   * @see {@link ShareTargets}
   */
  readonly shareTargets: t.ShareTargets | undefined = undefined;
  /**
   * (OPTIONAL) An array of tags for the policy.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwFirewallConfig} / {@link NfwLoggingConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/firewall-logging.html | Network Firewall logging} configuration.
 * Use this configuration to define logging destinations for Network Firewall.
 * You can configure AWS Network Firewall logging for your firewall's stateful engine.
 * Logging gives you detailed information about network traffic, including the time that
 * the stateful engine received a packet, detailed information about the packet, and any
 * stateful rule action taken against the packet. The logs are published to the log destination
 * that you've configured, where you can retrieve and view them.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-loggingconfiguration-logdestinationconfig.html}
 *
 * The following example configures Network Firewall to send ALERT-level logs to S3:
 * @example
 * ```
 * - destination: s3
 *   type: ALERT
 * ```
 */
export class NfwLoggingConfig implements t.TypeOf<typeof NetworkConfigTypes.nfwLoggingConfig> {
  /**
   * The destination service to log to.
   *
   * @see {@link logDestinationTypeEnum}
   */
  readonly destination: t.TypeOf<typeof t.logDestinationTypeEnum> = 's3';
  /**
   * The type of actions to log.
   */
  readonly type: t.TypeOf<typeof NetworkConfigTypes.nfwLogType> = 'ALERT';
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwFirewallConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/firewalls.html | Network Firewall firewall} configuration.
 * Use this configuration to define a Network Firewall firewall.
 * An AWS Network Firewall firewall connects a firewall policy,
 * which defines network traffic monitoring and filtering behavior,
 * to the VPC that you want to protect. The firewall configuration
 * includes specifications for the Availability Zones and subnets
 * where the firewall endpoints are placed. It also defines high-level
 * settings like the firewall logging configuration and tagging on the AWS firewall resource.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-networkfirewall-firewall.html}.
 *
 * The following example creates a firewall named `accelerator-nfw`  in the VPC named `Network-Inspection`. Firewall
 * endpoints are deployed to the subnets named `Subnet-A` and `Subnet-B` in that VPC.
 * @example
 * ```
 * - name: accelerator-nfw
 *   description: Accelerator Firewall
 *   firewallPolicy: accelerator-nfw-policy
 *   subnets:
 *     - Subnet-A
 *     - Subnet-B
 *   vpc: Network-Inspection
 *   loggingConfiguration:
 *     - destination: s3
 *       type: ALERT
 *   tags: []
 * ```
 */
export class NfwFirewallConfig implements t.TypeOf<typeof NetworkConfigTypes.nfwFirewallConfig> {
  /**
   * A friendly name for the firewall.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the firewall to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: string = '';
  /**
   * The friendly name of the Network Firewall policy.
   *
   * @remarks
   * This is the logical `name` property of the policy as defined in network-config.yaml.
   *
   * @see {@link NfwFirewallPolicyConfig}
   */
  readonly firewallPolicy: string = '';
  /**
   * An array of the friendly names of subnets to deploy Network Firewall to.
   *
   * @remarks
   * This is the logical `name` property of the subnets as defined in network-config.yaml.
   * The listed subnets must exist in the VPC referenced in the `vpc` property.
   */
  readonly subnets: string[] = [];
  /**
   * The friendly name of the VPC to deploy Network Firewall to.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the firewall to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * This is the logical `name` property of the VPC as defined in network-config.yaml.
   *
   * @see {@link VpcConfig}
   */
  readonly vpc: string = '';
  /**
   * (OPTIONAL) Enable for deletion protection on the firewall.
   */
  readonly deleteProtection: boolean | undefined = undefined;
  /**
   * (OPTIONAL) A description for the firewall.
   */
  readonly description: string | undefined = undefined;
  /**
   * (OPTIONAL) Enable to disallow firewall policy changes.
   */
  readonly firewallPolicyChangeProtection: boolean | undefined = undefined;
  /**
   * (OPTIONAL) Enable to disallow firewall subnet changes.
   */
  readonly subnetChangeProtection: boolean | undefined = undefined;
  /**
   * (OPTIONAL) An array of Network Firewall logging configurations.
   *
   * @see {@link NfwLoggingConfig}
   */
  readonly loggingConfiguration: NfwLoggingConfig[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of tags for the firewall.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/what-is-aws-network-firewall.html | Network Firewall} configuration.
 * Use this configuration to define Network Firewalls in your environment.
 * AWS Network Firewall is a stateful, managed, network firewall and intrusion
 * detection and prevention service for your virtual private cloud (VPC) that
 * you create in Amazon Virtual Private Cloud (Amazon VPC).
 * With Network Firewall, you can filter traffic at the perimeter of your VPC.
 * This includes filtering traffic going to and coming from an internet gateway,
 * NAT gateway, or over VPN or AWS Direct Connect.
 *
 * The following example creates a simple Network Firewall rule group, policy,
 * and firewall. The policy and rule group are shared with the entire organization.
 * The firewall endpoints are created in subnets named `Subnet-A` and `Subnet-B`
 * in the VPC named `Network-Inspection`.
 *
 * @example
 * ```
 * networkFirewall:
 *   firewalls:
 *     - name: accelerator-nfw
 *       description: Accelerator Firewall
 *       firewallPolicy: accelerator-nfw-policy
 *       subnets:
 *         - Subnet-A
 *         - Subnet-B
 *       vpc: Network-Inspection
 *       loggingConfiguration:
 *         - destination: s3
 *           type: ALERT
 *       tags: []
 *   policies:
 *     - name: accelerator-nfw-policy
 *       firewallPolicy:
 *         statelessDefaultActions: ['aws:forward_to_sfe']
 *         statelessFragmentDefaultActions: ['aws:forward_to_sfe']
 *         statefulRuleGroups:
 *           - name: accelerator-stateful-group
 *         statelessRuleGroups:
 *           - name: accelerator-stateless-group
 *             priority: 100
 *       regions:
 *         - us-east-1
 *       shareTargets:
 *         organizationalUnits:
 *           - Root
 *       tags: []
 *   rules:
 *     - name: accelerator-stateful-group
 *       regions:
 *         - us-east-1
 *       capacity: 100
 *       type: STATEFUL
 *       ruleGroup:
 *         rulesSource:
 *           rulesFile: path/to/rules.txt
 *       shareTargets:
 *         organizationalUnits:
 *           - Root
 *       tags: []
 * ```
 */
export class NfwConfig implements t.TypeOf<typeof NetworkConfigTypes.nfwConfig> {
  /**
   * An array of Network Firewall firewall configurations.
   *
   * @see {@link NfwFirewallConfig}
   */
  readonly firewalls: NfwFirewallConfig[] = [];
  /**
   * An array of Network Firewall policy configurations.
   *
   * @see {@link NfwFirewallPolicyConfig}
   */
  readonly policies: NfwFirewallPolicyConfig[] = [];
  /**
   * An array of Network Firewall rule group configurations.
   *
   * @see {@link NfwRuleGroupConfig}
   */
  readonly rules: NfwRuleGroupConfig[] = [];
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link GwlbConfig} / {@link GwlbEndpointConfig}*
 *
 * {@link https://docs.aws.amazon.com/elasticloadbalancing/latest/gateway/introduction.html#gateway-load-balancer-overview | Gateway Load Balancer endpoint} configuration.
 * Use this configuration to define endpoints for your Gateway Load Balancer.
 * Gateway Load Balancers use Gateway Load Balancer endpoints to securely exchange
 * traffic across VPC boundaries. A Gateway Load Balancer endpoint is a VPC endpoint
 * that provides private connectivity between virtual appliances in the service provider
 * VPC and application servers in the service consumer VPC.
 *
 * The following example creates two Gateway Load Balancer endpoints,
 * `Endpoint-A` and `Endpoint-B`. The endpoints are created in subnets named
 * `Network-Inspection-A` and `Network-Inspection-B`, respectively, in the VPC named
 * `Network-Inspection`.
 * @example
 * ```
 * - name: Endpoint-A
 *   account: Network
 *   subnet: Network-Inspection-A
 *   vpc: Network-Inspection
 * - name: Endpoint-B
 *   account: Network
 *   subnet: Network-Inspection-B
 *   vpc: Network-Inspection
 * ```
 */
export class GwlbEndpointConfig implements t.TypeOf<typeof NetworkConfigTypes.gwlbEndpointConfig> {
  /**
   * The friendly name of the Gateway Load Balancer endpoint.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the endpoint to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: string = '';
  /**
   * The friendly name of the account to deploy the endpoint to.
   *
   * @remarks
   * This is the `account` property of the VPC referenced in the `vpc` property.
   * For VPC templates, ensure the account referenced is included in `deploymentTargets`.
   *
   * @see {@link VpcConfig} | {@link VpcTemplatesConfig}
   */
  readonly account: string = '';
  /**
   * The friendly name of the subnet to deploy the Gateway Load Balancer endpoint to.
   *
   * @remarks
   * This is the friendly name of the subnet as defined in network-config.yaml.
   * The subnet must be defined in the `subnets` property of the VPC referenced in the `vpc` property.
   *
   * @see {@link SubnetConfig}
   */
  readonly subnet: string = '';
  /**
   * The friendly name of the VPC to deploy the Gateway Load Balancer endpoint to.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the endpoint to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * This is the logical `name` property of the VPC as defined in network-config.yaml.
   *
   * @see {@link VpcConfig} | {@link VpcTemplatesConfig}
   */
  readonly vpc: string = '';
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link GwlbConfig}*
 *
 * {@link https://docs.aws.amazon.com/elasticloadbalancing/latest/gateway/introduction.html#gateway-load-balancer-overview | Gateway Load Balancer} configuration.
 * Use to define Gateway Load Balancer configurations for the accelerator.
 * Gateway Load Balancers enable you to deploy, scale, and manage virtual appliances,
 * such as firewalls, intrusion detection and prevention systems, and deep packet inspection
 * systems. It combines a transparent network gateway (that is, a single entry and exit point
 * for all traffic) and distributes traffic while scaling your virtual appliances with the demand.
 *
 * @example
 * ```
 * gatewayLoadBalancers:
 *   - name: Accelerator-GWLB
 *     subnets:
 *       - Network-Inspection-Firewall-A
 *       - Network-Inspection-Firewall-B
 *     vpc: Network-Inspection
 *     deletionProtection: true
 *     endpoints:
 *       - name: Endpoint-A
 *         account: Network
 *         subnet: Network-Inspection-A
 *         vpc: Network-Inspection
 *       - name: Endpoint-B
 *         account: Network
 *         subnet: Network-Inspection-B
 *         vpc: Network-Inspection
 * ```
 */
export class GwlbConfig implements t.TypeOf<typeof NetworkConfigTypes.gwlbConfig> {
  /**
   * The friendly name of the Gateway Load Balancer.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the load balancer to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: string = '';
  /**
   * An array of Gateway Load Balancer endpoint configurations.
   *
   * @see {@link GwlbEndpointConfig}
   */
  readonly endpoints: GwlbEndpointConfig[] = [];
  /**
   * An array of friendly names of subnets to deploy the Gateway Load Balancer to.
   *
   * @remarks
   * This is the logical `name` property of the subnets as defined in network-config.yaml.
   * The subnets referenced must exist in the VPC referenced in the `vpc` property.
   *
   * @see {@link SubnetConfig}
   */
  readonly subnets: string[] = [];
  /**
   * The friendly name of the VPC to deploy the Gateway Load Balancer to.
   *
   * @remarks
   * This is the logical `name` property of the VPC as defined in network-config.yaml.
   * VPC templates are not a supported target for Gateway Load Balancers.
   *
   * @see {@link VpcConfig}
   */
  readonly vpc: string = '';
  /**
   * (OPTIONAL) Whether to enable cross-zone load balancing.
   */
  readonly crossZoneLoadBalancing: boolean | undefined = undefined;
  /**
   * (OPTIONAL) Whether to enable deletion protection.
   */
  readonly deletionProtection: boolean | undefined = undefined;
  /**
   * (OPTIONAL) The friendly name of a target group to forward traffic to
   *
   * @remarks
   * This target group must be defined in `Ec2FirewallConfig`
   * in the `customizations-config.yaml` configuration file
   */
  readonly targetGroup: string | undefined = undefined;
  /**
   * (OPTIONAL) An array of CloudFormation tag objects.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig}*
 *
 * Central network services configuration.
 * Use this configuration to define centralized networking services for your environment.
 * Central network services enables you to easily designate a central account that owns your
 * core network infrastructure. These network resources can be shared with other
 * accounts in your organization so that workload accounts can consume them.
 *
 * @example
 * ```
 * centralNetworkServices:
 *   delegatedAdminAccount: Network
 *   gatewayLoadBalancers: []
 *   ipams: []
 *   networkFirewall:
 *     firewalls: []
 *     policies: []
 *     rules: []
 *   route53Resolver:
 *     endpoints: []
 *     firewallRuleGroups: []
 *     queryLogs:
 *       name: accelerator-query-logs
 *       destinations:
 *         - cloud-watch-logs
 *         - s3
 *       shareTargets:
 *         organizationalUnits:
 *           - Root
 * ```
 */
export class CentralNetworkServicesConfig implements t.TypeOf<typeof NetworkConfigTypes.centralNetworkServicesConfig> {
  /**
   * The friendly name of the delegated administrator account for network services.
   * Resources configured under `centralNetworkServices` will be created in this account.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes all central network services to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * This is the logical `name` property of the account as defined in accounts-config.yaml.
   */
  readonly delegatedAdminAccount: string = '';
  /**
   * An array of Gateway Load Balancer configurations.
   *
   * @see {@link GwlbConfig}
   */
  readonly gatewayLoadBalancers: GwlbConfig[] | undefined = undefined;
  /**
   * An array of IPAM configurations.
   *
   * @see {@link IpamConfig}
   */
  readonly ipams: IpamConfig[] | undefined = undefined;
  /**
   * A Route 53 resolver configuration.
   *
   * @see {@link ResolverConfig}
   */
  readonly route53Resolver: ResolverConfig | undefined = undefined;
  /**
   * A Network Firewall configuration.
   *
   * @see {@link NfwConfig}
   */
  readonly networkFirewall: NfwConfig | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcPeeringConfig}*
 *
 * VPC peering configuration.
 * Used to define VPC peering connections.
 *
 * @example
 * ```
 * vpcPeering:
 *   - name: Peering
 *     vpcs:
 *       - VPC-A
 *       - VPC-B
 *     tags: []
 * ```
 */
export class VpcPeeringConfig implements t.TypeOf<typeof NetworkConfigTypes.vpcPeeringConfig> {
  /**
   * A friendly name for the peering connection.
   */
  readonly name: string = '';
  /**
   * The VPCs to peer.
   */
  readonly vpcs: string[] = [];
  /**
   * An array of tags for the peering connection.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * An optional ELB root account ID
 */
export class ElbAccountIdsConfig implements t.TypeOf<typeof NetworkConfigTypes.elbAccountIdsConfig> {
  readonly region: string = '';
  readonly accountId: string = '';
}

/**
 * *{@link NetworkConfig} / {@link FirewallManagerConfig} / {@link FirewallManagerNotificationChannelConfig}*
 * An optional Firewall Manager Service Config
 */
export class FirewallManagerNotificationChannelConfig
  implements t.TypeOf<typeof NetworkConfigTypes.firewallManagerNotificationChannelConfig>
{
  /**
   * Enables the FMS notification channel. Defaults to enabled.
   */
  readonly region: string = '';
  /**
   * The SNS Topic Name to publish to.
   */
  readonly snsTopic: string = '';
}

/**
 * *{@link NetworkConfig} / {@link CertificateConfig}*
 *
 * Amazon Certificate Manager (ACM) Configuration
 *
 * {@link https://docs.aws.amazon.com/acm/latest/userguide/import-certificate.html | Import certificate}  or {@link https://docs.aws.amazon.com/acm/latest/userguide/gs-acm-request-public.html | Request certificate} from ACM
 *
 * @example
 * ```
 * - name: cert1
 *   type: import
 *   privKey: cert1/privKey.key
 *   cert: cert1/cert.crt
 *   chain: cert1/chain.csr
 *   deploymentTargets:
 *     accounts:
 *       - WorkloadAccount1
 *       - WorkloadAccount2
 * - name: cert2
 *   type: request
 *   validation: DNS
 *   domain: example.com
 *   san:
 *     - www.example.com
 *     - www.example.net
 *     - e.co
 *   deploymentTargets:
 *     OU:
 *       - Infrastructure
 * ```
 */
export class CertificateConfig implements t.TypeOf<typeof NetworkConfigTypes.certificateConfig> {
  /**
   * Name of the certificate. This should be unique in the certificates array. Duplicate names will fail the validation.
   */
  readonly name: string = '';
  /**
   * Type of ACM cert. Valid values are `import` or `request`
   */
  readonly type: t.TypeOf<typeof NetworkConfigTypes.certificateConfigTypeEnum> = 'import';
  /**
   * Path to the private key in S3 assets bucket. The bucket value is in the outputs of Pipeline stack in home region. Path should be given relative to the bucket.
   * The private key that matches the public key in the certificate.
   * This value should be provided when type is set to import or else validation fails.
   */
  readonly privKey: string | undefined = undefined;
  /**
   * Path to certificate in S3 assets bucket. The bucket value is in the outputs of Pipeline stack in home region. Path should be given relative to the bucket.
   * The certificate to import.
   * This value should be provided when type is set to import or else validation fails.
   */
  readonly cert: string | undefined = undefined;
  /**
   * Path to the PEM encoded certificate chain in S3 assets bucket. The bucket value is in the outputs of Pipeline stack in home region. Path should be given relative to the bucket.
   * This value is optional when type is set to import.
   */
  readonly chain: string | undefined = undefined;
  /**
   * The method you want to use if you are requesting a public certificate to validate that you own or control domain. You can validate with DNS or validate with email.
   * Valid values are 'DNS' or 'EMAIL'.
   * This value should be provided when type is set to request or else validation fails.
   */
  readonly validation: t.TypeOf<typeof NetworkConfigTypes.certificateValidationEnum> = 'EMAIL';
  /**
   * Fully qualified domain name (FQDN), such as www.example.com, that you want to secure with an ACM certificate. Use an asterisk (*) to create a wildcard certificate that protects several sites in the same domain. For example, *.example.com protects www.example.com, site.example.com, and images.example.com.
   * In compliance with RFC 5280, the length of the domain name (technically, the Common Name) that you provide cannot exceed 64 octets (characters), including periods. To add a longer domain name, specify it in the Subject Alternative Name field, which supports names up to 253 octets in length.
   * This value should be provided when type is set to request or else validation fails.
   */
  readonly domain: string | undefined = undefined;
  /**
   * Additional FQDNs to be included in the Subject Alternative Name extension of the ACM certificate. For example, add the name www.example.net to a certificate for which the DomainName field is www.example.com if users can reach your site by using either name.
   */
  readonly san: string[] | undefined = undefined;
  /**
   * ACM deployment target. This should be provided to deploy ACM into OUs or account.
   */
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
}
/**
 * *{@link NetworkConfig} / {@link FirewallManagerConfig}*
 * An optional Firewall Manager Service Config
 */
export class FirewallManagerConfig implements t.TypeOf<typeof NetworkConfigTypes.firewallManagerServiceConfig> {
  /**
   * The friendly account name to deploy the FMS configuration
   */
  readonly delegatedAdminAccount: string = '';
  /**
   * The FMS Notification Channel Configuration
   */
  readonly notificationChannels: FirewallManagerNotificationChannelConfig[] | undefined = undefined;
}
/**
 * Network Configuration.
 * Used to define a network configuration for the accelerator.
 */
export class NetworkConfig implements t.TypeOf<typeof NetworkConfigTypes.networkConfig> {
  /**
   * The name of the network configuration file.
   */
  static readonly FILENAME = 'network-config.yaml';

  /**
   * A default VPC configuration.
   *
   * @see {@link DefaultVpcsConfig}
   */
  readonly defaultVpc: DefaultVpcsConfig = new DefaultVpcsConfig();

  /**
   * An array of Transit Gateway configurations.
   *
   * @see {@link TransitGatewayConfig}
   */
  readonly transitGateways: TransitGatewayConfig[] = [];

  /**
   * Transit Gateway peering configuration.
   *
   * @see {@link TransitGatewayPeeringConfig}
   */
  readonly transitGatewayPeering: TransitGatewayPeeringConfig[] | undefined = undefined;

  /**
   * An array of Customer Gateway configurations.
   *
   * @see {@link CustomerGatewayConfig}
   */
  readonly customerGateways: CustomerGatewayConfig[] | undefined = undefined;

  /**
   * A list of VPC configurations.
   * An array of VPC endpoint policies.
   *
   * @see {@link EndpointPolicyConfig}
   */
  readonly endpointPolicies: EndpointPolicyConfig[] = [];

  /**
   * An array of VPC configurations.
   *
   * @see {@link VpcConfig}
   */
  readonly vpcs: VpcConfig[] = [];

  /**
   * A VPC flow logs configuration.
   *
   * @see {@link VpcFlowLogsConfig}
   */
  readonly vpcFlowLogs: t.VpcFlowLogsConfig | undefined = undefined;

  /**
   * An optional list of DHCP options set configurations.
   *
   * @see {@link DhcpOptsConfig}
   */
  readonly dhcpOptions: DhcpOptsConfig[] | undefined = undefined;

  /**
   * An optional Central Network services configuration.
   *
   * @see {@link CentralNetworkServicesConfig}
   */
  readonly centralNetworkServices: CentralNetworkServicesConfig | undefined = undefined;

  /**
   * An optional array of Direct Connect Gateway configurations.
   *
   * @example
   * ```
   * directConnectGateways:
   *   - name: Accelerator-DXGW
   *     account: Network
   *     asn: 64512
   *     virtualInterfaces: []
   *     transitGatewayAssociations: []
   * ```
   * @see {@link DxGatewayConfig}
   */
  readonly directConnectGateways: DxGatewayConfig[] | undefined = undefined;

  /**
   * An optional list of prefix list set configurations.
   */
  readonly prefixLists: PrefixListConfig[] | undefined = undefined;

  /**
   * An optional list of VPC peering configurations
   *
   * @see {@link VpcPeeringConfig}
   */
  readonly vpcPeering: VpcPeeringConfig[] | undefined = undefined;

  /**
   * An optional list of VPC template configurations
   *
   * @see {@link VpcTemplatesConfig}
   */
  readonly vpcTemplates: VpcTemplatesConfig[] | undefined = undefined;

  /**
   * An optional ELB root account ID
   */
  readonly elbAccountIds: ElbAccountIdsConfig[] | undefined = undefined;

  /**
   * Firewall manager service configuration
   */
  readonly firewallManagerService: FirewallManagerConfig | undefined = undefined;
  /**
   * Certificate manager configuration
   */
  readonly certificates: CertificateConfig[] | undefined = undefined;
  /**
   *
   * @param values
   */
  constructor(values?: t.TypeOf<typeof NetworkConfigTypes.networkConfig>) {
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
  static load(dir: string): NetworkConfig {
    const buffer = fs.readFileSync(path.join(dir, NetworkConfig.FILENAME), 'utf8');
    const values = t.parse(NetworkConfigTypes.networkConfig, yaml.load(buffer));
    return new NetworkConfig(values);
  }

  /**
   * Load from string content
   * @param content
   */
  static loadFromString(content: string): NetworkConfig | undefined {
    try {
      const values = t.parse(NetworkConfigTypes.networkConfig, yaml.load(content));
      return new NetworkConfig(values);
    } catch (e) {
      logger.error('Error parsing input, network config undefined');
      logger.error(`${e}`);
      throw new Error('could not load configuration.');
    }
  }
}
