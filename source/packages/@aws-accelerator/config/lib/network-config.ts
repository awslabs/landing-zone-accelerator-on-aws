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
    accounts: t.array(t.nonEmptyString),
    regions: t.array(t.region),
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
    account: t.optional(t.nonEmptyString),
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
    account: t.optional(t.nonEmptyString),
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
    asn: t.optional(t.number),
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
    vpcFlowLogs: t.vpcFlowLogsConfig,
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
 * Default VPC configuration.
 * Choose whether or not to delete default VPCs.
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
   */
  readonly excludeAccounts = [];
}

/**
 * *{@link NetworkConfig} / {@link TransitGatewayConfig} / {@link TransitGatewayRouteTableConfig} / {@link TransitGatewayRouteEntryConfig} / {@link TransitGatewayRouteTableVpcEntryConfig}*
 *
 * Transit Gateway VPC entry configuration.
 * Used to define an account and VPC name for Transit Gateway static route entries.
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
   */
  readonly account = '';
  /**
   * The friendly name of the VPC.
   */
  readonly vpcName = '';
}

/**
 * *{@link NetworkConfig} / {@link TransitGatewayConfig} / {@link TransitGatewayRouteTableConfig} / {@link TransitGatewayRouteEntryConfig} / {@link TransitGatewayRouteTableDxGatewayEntryConfig}*
 *
 * Transit Gateway Direct Connect Gateway entry configuration.
 * Used to define a Direct Connect Gateway attachment for Transit
 * Gateway static routes.
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
   * Note: This is the `name` property of the Direct Connect Gateway, not `gatewayName`.
   */
  readonly directConnectGatewayName: string = '';
}

/**
 * *{@link NetworkConfig} / {@link TransitGatewayConfig} / {@link TransitGatewayRouteTableConfig} / {@link TransitGatewayRouteEntryConfig} / {@link TransitGatewayRouteTableVpnEntryConfig}*
 *
 * Transit Gateway VPN entry configuration.
 * Used to define a VPN attachment for Transit
 * Gateway static routes.
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
   * Note: This is the `name` property of the VPN connection.
   */
  readonly vpnConnectionName: string = '';
}

/**
 * *{@link NetworkConfig} / {@link TransitGatewayConfig} / {@link TransitGatewayRouteTableConfig} / {@link TransitGatewayRouteEntryConfig} / {@link TransitGatewayRouteTableTgwPeeringEntryConfig}*
 *
 * Transit Gateway peering route entry configuration.
 * Used to define a peering attachment for Transit
 * Gateway static routes.
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
   * The name of the Direct Connect Gateway
   *
   * @remarks
   * Note: This is the `name` property of the Transit Gateway peering connection.
   */
  readonly transitGatewayPeeringName: string = '';
}

/**
 * *{@link NetworkConfig} / {@link TransitGatewayConfig} / {@link TransitGatewayRouteTableConfig} / {@link TransitGatewayRouteEntryConfig}*
 *
 * Transit Gateway route entry configuration.
 * Used to define static route entries in a Transit Gateway route table.
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
   * Use CIDR notation, i.e. 10.0.0.0/16
   */
  readonly destinationCidrBlock: string | undefined = undefined;
  /**
   * The friendly name of a prefix list for the route table entry.
   */
  readonly destinationPrefixList: string | undefined = undefined;
  /**
   * Enable to create a blackhole for the destination CIDR.
   * Leave undefined if specifying a VPC destination.
   */
  readonly blackhole: boolean | undefined = undefined;
  /**
   * A Transit Gateway VPC or DX Gateway entry configuration.
   * Leave undefined if specifying a blackhole destination.
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
 * Transit Gateway route table configuration.
 * Used to define a Transit Gateway route table.
 *
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
   */
  readonly name = '';
  /**
   * An array of tag objects for the Transit Gateway. route table.
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
 * Transit Gateway peering requester configuration
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
   * Accepter transit gateway name
   */
  readonly transitGatewayName = '';
  /**
   * Accepter transit gateway account name
   */
  readonly account = '';
  /**
   * Accepter transit gateway region name
   */
  readonly region: t.Region = 'us-east-1';
  /**
   * The friendly name of TGW route table to associate with this attachment.
   */
  readonly routeTableAssociations = '';
  /**
   * An array of tag objects for the Transit Gateway Peering.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link TransitGatewayPeeringConfig} / {@link TransitGatewayPeeringAccepterConfig}*
 *
 * Transit Gateway peering accepter configuration
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
   * Accepter transit gateway name
   */
  readonly transitGatewayName = '';
  /**
   * Accepter transit gateway account name
   */
  readonly account = '';
  /**
   * Accepter transit gateway region name
   */
  readonly region: t.Region = 'us-east-1';
  /**
   * The friendly name of TGW route table to associate with this attachment.
   */
  readonly routeTableAssociations = '';
  /**
   * Peering request auto accept flag.
   * When this flag is on, peering request will be accepted by LZA
   */
  readonly autoAccept = true;
  /**
   * Peering request apply tags flag.
   * When this flag is on, requester attachment tags will be applied to peer or accepter attachment also.
   * In peer or accepter attachment existing tags can't be changed, only given tags will be added or modified.
   */
  readonly applyTags = false;
}

/**
 * *{@link NetworkConfig} / {@link TransitGatewayPeeringConfig}*
 *
 * Transit Gateway peering configuration
 *
 * To use TGW peering with requester TGW SharedServices-Main of SharedServices account in us-west-2 region with SharedServices-Main-Core TGW route table association
 * and accepter TGW Network-Main of Network account in us-east-1 region with Network-Main-Core TGW route table association, please use following configuration.
 * Please use following configuration. With autoAccept true LZA will make sure accepter account accepts the peering request.
 * Flag applyTags set to false will not apply tags provided in requester of peering attachment to the accepter attachment
 *
 * Note: accepter property autoAccept and applyTags are optional. Default value for autoAccept is true and applyTags is false.
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
  readonly name = '';
  /**
   * Auto accept of transit gateway peering.
   */
  readonly autoAccept = true;
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
 * Transit Gateway configuration.
 * Used to define a Transit Gateway.
 *
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
   */
  readonly name = '';
  /**
   * The friendly name of the account to deploy the Transit Gateway.
   */
  readonly account = '';
  /**
   * The region name to deploy the Transit Gateway.
   */
  readonly region = 'us-east-1';
  /**
   * Resource Access Manager (RAM) share targets.
   *
   * @remarks
   * Targets can be account names and/or organizational units.
   *
   * @see {@link t.ShareTargets}
   */
  readonly shareTargets: t.ShareTargets = new t.ShareTargets();
  /**
   * A Border Gateway Protocol (BGP) Autonomous System Number (ASN).
   *
   * @remarks
   * The range is 64512 to 65534 for 16-bit ASNs.
   *
   * The range is 4200000000 to 4294967294 for 32-bit ASNs.
   */
  readonly asn = 65521;
  /**
   * Configure DNS support between VPCs.
   *
   * @remarks
   * Enable this option if you need the VPC to resolve public IPv4 DNS host names
   * to private IPv4 addresses when queried from instances in another VPC attached
   * to the transit gateway.
   */
  readonly dnsSupport = 'enable';
  /**
   * Equal Cost Multipath (ECMP) routing support between VPN tunnels.
   *
   * @remarks
   * Enable this option if you need Equal Cost Multipath (ECMP) routing support between VPN tunnels.
   * If connections advertise the same CIDRs, the traffic is distributed equally between them.
   */
  readonly vpnEcmpSupport = 'enable';
  /**
   * Configure default route table association.
   *
   * @remarks
   * Enable this option to automatically associate transit gateway attachments with the default
   * route table for the transit gateway.
   */
  readonly defaultRouteTableAssociation = 'enable';
  /**
   * Configure default route table propagation.
   *
   * @remarks
   * Enable this option to automatically propagate transit gateway attachments to the default
   * route table for the transit gateway.
   */
  readonly defaultRouteTablePropagation = 'enable';
  /**
   * Enable this option to automatically accept cross-account attachments.
   */
  readonly autoAcceptSharingAttachments = 'disable';
  /**
   * An array of Transit Gateway route table configuration objects.
   *
   * @see {@link TransitGatewayRouteTableConfig}
   */
  readonly routeTables: TransitGatewayRouteTableConfig[] = [];
  /**
   * An array of tag objects for the Transit Gateway.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link DxGatewayConfig} / {@link DxVirtualInterfaceConfig}*
 *
 * Direct Connect Gateway virtual interface configuration.
 * Use to create a virtual interface to a DX Gateway.
 *
 * @example
 * ```
 * - name: Accelerator-VIF
 *   connectionId: dx-conn-example
 *   customerAsn: 64512
 *   interfaceName: Accelerator-VIF
 *   ownerAccount: Network
 *   type: transit
 * ```
 */
export class DxVirtualInterfaceConfig implements t.TypeOf<typeof NetworkConfigTypes.dxVirtualInterfaceConfig> {
  /**
   * A friendly name for the virtual interface. This name
   * is used as a logical reference for the resource in
   * the accelerator.
   *
   * @remarks
   * This name cannot be changed without recreating the physical resource.
   */
  readonly name: string = '';
  /**
   * The resource ID of the DX connection the virtual interface will be created on
   *
   * @remarks
   * Resource IDs should be the the format `dx-conn-xxxxxx`
   */
  readonly connectionId: string = '';
  /**
   * A Border Gateway Protocol (BGP) Autonomous System Number (ASN) for the customer side of the connection.
   *
   * @remarks
   * This ASN must be unique from the Amazon side ASN.
   * The ASN for the Amazon side is determined by the DX Gateway it is created on.
   *
   * The valid values are 1 to 2147483647
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
   * Please note this is the owning account of the **physical** connection, not the virtual interface.
   *
   * If specifying an account that differs from the account of the Direct Connect Gateway, this will
   * create an allocation from the connection owner account to the Direct Connect Gateway owner account.
   * Allocations must be manually confirmed before they can be used or updated by the accelerator.
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
 * Direct Connect Gateway transit gateway association configuration.
 * Use this object to define transit gateway attachments for a DX gateway.
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
   */
  readonly name: string = '';
  /**
   * The friendly name of the account the transit gateway is deployed to.
   *
   * @remarks
   * If specifying an account that differs from the account of the Direct Connect Gateway, this will
   * create a proposal from the transit gateway owner account to the Direct Connect Gateway owner account.
   * Proposals must be manually approved. Proposal associations **cannot** also have configured transit gateway
   * route table associations or propagations.
   */
  readonly account: string = '';
  /**
   * An array of CIDR prefixes that are allowed to advertise over this transit gateway association.
   */
  readonly allowedPrefixes: string[] = [];
  /**
   * (OPTIONAL) The friendly name of TGW route table(s) to associate with this attachment.
   */
  readonly routeTableAssociations: string[] | undefined = undefined;
  /**
   * (OPTIONAL) The friendly name of TGW route table(s) to propagate routes from this attachment.
   */
  readonly routeTablePropagations: string[] | undefined = undefined;
}
/**
 * *{@link NetworkConfig} / {@link DxGatewayConfig}*
 *
 * Direct Connect Gateway configuration.
 * Used to define Direct Connect Gateways, virtual interfaces,
 * and gateway associations.
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
   * This name cannot be changed without recreating the physical resource.
   */
  readonly name: string = '';
  /**
   * The friendly name of the account to deploy the DX Gateway.
   *
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
   * @remarks
   * The `transitGatewayAssociations` property must also be defined if defining this property.
   *
   * @see {@link DxVirtualInterfaceConfig}
   */
  readonly virtualInterfaces: DxVirtualInterfaceConfig[] | undefined = undefined;
  /**
   * (OPTIONAL) An array of transit gateway association configurations. Creates a transit gateway attachment for this DX gateway.
   *
   * @see {@link DxTransitGatewayAssociationConfig}
   */
  readonly transitGatewayAssociations: DxTransitGatewayAssociationConfig[] | undefined = undefined;
}
/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link IpamConfig} / {@link IpamScopeConfig}*
 *
 * IPAM scope configuration.
 * Used to define a custom IPAM scope.
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
   */
  readonly name: string = '';
  /**
   * An optional description for the IPAM scope.
   */
  readonly description: string | undefined = undefined;
  /**
   * An array of tag objects for the IPAM scope.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link IpamConfig} / {@link IpamPoolConfig}*
 *
 * IPAM pool configuration.
 * Used to define an IPAM pool.
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
   * @see {@link NetworkConfigTypes.ipVersionEnum}
   */
  readonly addressFamily: t.TypeOf<typeof NetworkConfigTypes.ipVersionEnum> | undefined = 'ipv4';
  /**
   * A friendly name for the IPAM pool.
   */
  readonly name: string = '';
  /**
   * The friendly name of the IPAM scope to assign the IPAM pool to.
   *
   * @remarks
   * Leave this property undefined to create the pool in the default scope.
   */
  readonly scope: string | undefined = undefined;
  /**
   * The default netmask length of IPAM allocations for this pool.
   */
  readonly allocationDefaultNetmaskLength: number | undefined = undefined;
  /**
   * The maximum netmask length of IPAM allocations for this pool.
   */
  readonly allocationMaxNetmaskLength: number | undefined = undefined;
  /**
   * The minimum netmask length of IPAM allocations for this pool.
   */
  readonly allocationMinNetmaskLength: number | undefined = undefined;
  /**
   * An optional array of tags that are required for resources that use CIDRs from this IPAM pool.
   *
   * @remarks
   * Resources that do not have these tags will not be allowed to allocate space from the pool.
   */
  readonly allocationResourceTags: t.Tag[] | undefined = undefined;
  /**
   * If set to `true`, IPAM will continuously look for resources within the CIDR range of this pool
   * and automatically import them as allocations into your IPAM.
   */
  readonly autoImport: boolean | undefined = undefined;
  /**
   * A description for the IPAM pool.
   */
  readonly description: string | undefined = undefined;
  /**
   * The AWS Region where you want to make an IPAM pool available for allocations.
   *
   * @remarks
   * Only resources in the same Region as the locale of the pool can get IP address allocations from the pool.
   */
  readonly locale: t.Region | undefined = undefined;
  /**
   * An array of CIDR ranges to provision for the IPAM pool.
   *
   * @remarks
   * Use CIDR notation, i.e. 10.0.0.0/16
   */
  readonly provisionedCidrs: string[] | undefined = undefined;
  /**
   * Determines if a pool is publicly advertisable.
   *
   * @remarks
   * This option is not available for pools with AddressFamily set to ipv4.
   */
  readonly publiclyAdvertisable: boolean | undefined = undefined;
  /**
   * Resource Access Manager (RAM) share targets.
   *
   * @remarks
   * Targets can be account names and/or organizational units.
   *
   * @see {@link t.ShareTargets}
   */
  readonly shareTargets: t.ShareTargets = new t.ShareTargets();
  /**
   * The friendly name of the source IPAM pool to create this IPAM pool from.
   *
   * @remarks
   * Only define this value when creating nested IPAM pools. Leave undefined for top-level pools.
   */
  readonly sourceIpamPool: string | undefined = undefined;
  /**
   * An array of tag objects for the IPAM pool.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link IpamConfig}*
 *
 * IPAM configuration. Used to define an AWS-managed VPC IPAM.
 *
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
   */
  readonly name: string = '';
  /**
   * The region to deploy the IPAM.
   *
   * @remarks
   * Note that IPAMs must be deployed to a single region but may manage multiple regions.
   * Configure the `operatingRegions` property to define multiple regions to manage.
   */
  readonly region: t.Region = 'us-east-1';
  /**
   * A description for the IPAM.
   */
  readonly description: string | undefined = undefined;
  /**
   * An array of regions that the IPAM will manage.
   */
  readonly operatingRegions: t.Region[] | undefined = undefined;
  /**
   * An optional array of IPAM scope configurations to create under the IPAM.
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
   * An array of tag objects for the IPAM.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link RouteTableConfig} / {@link RouteTableEntryConfig}*
 *
 * VPC route table entry configuration.
 * Used to define static route entries in a VPC route table.
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
   */
  readonly name: string = '';
  /**
   * The destination CIDR block for the route table entry.
   *
   * @remarks
   * Use CIDR notation, i.e. 10.0.0.0/16
   *
   * Either `destination` or `destinationPrefixList` must be specified for the following route entry types:
   * `transitGateway`, `natGateway`, `internetGateway`, `networkInterface`, `vpcPeering`, `virtualPrivateGateway`.
   *
   * `destination` MUST be specified for route entry type `networkFirewall` or `gatewayLoadBalancerEndpoint`.
   *
   * Leave undefined for route entry type `gatewayEndpoint`.
   */
  readonly destination: string | undefined = undefined;
  /**
   * The friendly name of the destination prefix list for the route table entry.
   *
   * @remarks
   * Either `destination` or `destinationPrefixList` must be specified for the following route entry types:
   * `transitGateway`, `natGateway`, `internetGateway`, `networkInterface`, `vpcPeering`, `virtualPrivateGateway`.
   *
   * Cannot be specified for route entry type `networkFirewall` or `gatewayLoadBalancerEndpoint`. Use `destination` instead.
   *
   * Leave undefined for route entry type `gatewayEndpoint`.
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
   * Leave undefined for route entry type `internetGateway` or `virtualPrivateGateway`.
   */
  readonly target: string | undefined = undefined;
  /**
   * The Availability Zone (AZ) the target resides in.
   *
   * @remarks
   * Include only the letter of the AZ name (i.e. 'a' for 'us-east-1a').
   *
   * Leave undefined for targets of route entry types other than `networkFirewall`.
   */
  readonly targetAvailabilityZone: string | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link RouteTableConfig}*
 *
 * VPC route table configuration.
 * Used to define a VPC route table.
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
   */
  readonly name = '';
  /**
   * Designate a gateway to associate this route table with.
   *
   * @remarks
   * Only define this property when creating a gateway route table. Leave undefined for subnet route tables.
   */
  readonly gatewayAssociation: t.TypeOf<typeof NetworkConfigTypes.gatewayRouteTableTypeEnum> | undefined = undefined;
  /**
   * An array of VPC route table entry configuration objects.
   *
   * @see {@link RouteTableEntryConfig}
   */
  readonly routes: RouteTableEntryConfig[] = [];
  /**
   * An array of tag objects for the VPC route table.
   */
  readonly tags: t.Tag[] = [];
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link SubnetConfig}*
 *
 * VPC subnet configuration.
 * Used to define a VPC subnet.
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
   */
  readonly name = '';
  /**
   * The Availability Zone (AZ) the subnet resides in.
   *
   * @remarks
   * Include only the letter of the AZ name (i.e. 'a' for 'us-east-1a').
   * Not needed if providing an outpost
   */
  readonly availabilityZone = '';
  /**
   * The friendly name of the route table to associate with the subnet.
   */
  readonly routeTable = '';
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
   * Use CIDR notation, i.e. 10.0.0.0/16
   */
  readonly ipv4CidrBlock: string | undefined = undefined;
  /**
   * Configure automatic mapping of public IPs.
   *
   * @remarks
   * Enables you to configure the auto-assign IP settings to automatically request a public
   * IPv4 address for a new network interface in this subnet.
   */
  readonly mapPublicIpOnLaunch: boolean | undefined = undefined;
  /**
   * Resource Access Manager (RAM) share targets.
   *
   * @remarks
   * Targets can be account names and/or organizational units.
   *
   * @see {@link t.ShareTargets}
   */
  readonly shareTargets: t.ShareTargets = new t.ShareTargets();
  /**
   * An array of tag objects for the VPC subnet.
   */
  readonly tags: t.Tag[] | undefined = undefined;
  /**
   * The friendly name for the outpost to attach to the subnet
   */
  readonly outpost: string | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link NatGatewayConfig}*
 *
 * NAT Gateway configuration.
 * Used to define an AWS-managed NAT Gateway.
 *
 * @example
 * Nat gateway with accelerator-provisioned elastic IP
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
   */
  readonly name: string = '';
  /**
   * The friendly name of the subnet for the NAT Gateway to be deployed.
   */
  readonly subnet: string = '';

  /**
   * The allocation ID of the Elastic IP address that's associated with the NAT gateway.
   */
  readonly allocationId: string | undefined = undefined;

  /**
   * Set `true` to define a NAT gateway with private connectivity type
   *
   * @remarks
   * Set to `false` or leave undefined to create a public-facing NAT gateway
   */
  readonly private: boolean | undefined = undefined;

  /**
   * An array of tag objects for the NAT Gateway.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link TransitGatewayAttachmentConfig} / {@link TransitGatewayAttachmentTargetConfig}*
 *
 * Transit Gateway attachment target configuration.
 * Used to define a target account for attachments.
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
   * A friendly name for the attachment target.
   */
  readonly name = '';
  /**
   * The friendly name of the account for the attachment target.
   */
  readonly account = '';
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link TransitGatewayAttachmentConfig} / {@link TransitGatewayAttachmentOptionsConfig}*
 *
 * Transit Gateway attachment options configuration.
 * Used to specify advanced options for the attachment.
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
   * Enable to configure appliance mode for the attachment. This option is disabled by default.
   *
   * @remarks
   * Appliance mode ensures only a single network interface is chosen for the entirety of a traffic flow,
   * enabling stateful packet inspection.
   */
  readonly applianceModeSupport: t.EnableDisable | undefined = undefined;
  /**
   * Enable to configure DNS support for the attachment. This option is enabled by default.
   */
  readonly dnsSupport: t.EnableDisable | undefined = undefined;
  /**
   * Enable to configure IPv6 support for the attachment. This option is disabled by default.
   */
  readonly ipv6Support: t.EnableDisable | undefined = undefined;
}
/**
 * *{@link NetworkConfig} / {@link VpcConfig} / {@link OutpostsConfig} / {@link LocalGatewayConfig} / {@link LocalGatewayRouteTableConfig}*
 *
 * Local Gateway route table configuration.
 * Used to define a Local Gateway route table.
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
   */
  readonly name = '';
  /**
   * The id for the Route Table
   */
  readonly id = '';
}
/**
 * *{@link NetworkConfig} / {@link VpcConfig} / {@link OutpostsConfig} / {@link LocalGatewayConfig}*
 *
 * Local Gateway configuration.
 * Used to define a Local Gateway
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
  readonly name = '';
  /**
   * The id for the Local Gateway
   */
  readonly id = '';
  /**
   * The route tables for the Local Gateway
   */
  readonly routeTables: LocalGatewayRouteTableConfig[] = [];
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} / {@link OutpostsConfig}*
 *
 * Outpost configuration.
 * Used to define an Outpost.
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
   */
  readonly name = '';
  /**
   * The ARN for the Outpost
   */
  readonly arn = '';
  /**
   * The availability zone for the Outpost
   */
  readonly availabilityZone = '';
  /**
   * The Local Gateway for the Outpost
   */
  readonly localGateway: LocalGatewayConfig | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link TransitGatewayAttachmentConfig}*
 *
 * Transit Gateway attachment configuration.
 * Used to define a Transit Gateway attachment.
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
   */
  readonly name = '';
  /**
   * A Transit Gateway attachment target configuration object.
   *
   * @see {@link TransitGatewayAttachmentTargetConfig}
   */
  readonly transitGateway: TransitGatewayAttachmentTargetConfig = new TransitGatewayAttachmentTargetConfig();
  /**
   * An array of the friendly names of VPC subnets for the attachment to be deployed.
   */
  readonly subnets: string[] = [];
  /**
   * An array of friendly names of Transit Gateway route tables to associate the attachment.
   */
  readonly routeTableAssociations: string[] | undefined = undefined;
  /**
   * An array of friendly names of Transit Gateway route tables to propagate the attachment.
   */
  readonly routeTablePropagations: string[] | undefined = undefined;
  /**
   * A Transit Gateway attachment options configuration.
   *
   * @see {@link TransitGatewayAttachmentOptionsConfig}
   */
  readonly options: TransitGatewayAttachmentOptionsConfig | undefined = undefined;
  /**
   * An array of tag objects for the Transit Gateway attachment.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link GatewayEndpointConfig} / {@link GatewayEndpointServiceConfig}*
 *
 * VPC gateway endpoint service configuration.
 * Used to define the service and policy for gateway endpoints.
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
   * The friendly name of a policy for the gateway endpoint. If left undefined, the default policy will be used.
   */
  readonly policy: string | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link GatewayEndpointConfig}*
 *
 * VPC gateway endpoint configuration.
 * Used to define a gateway endpoints.
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
 * VPC interface endpoint service configuration.
 * Used to define the service and policy for interface endpoints.
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
   */
  readonly service: string = '';
  /**
   * The full name of the service to create the endpoint for.
   */
  readonly serviceName: string | undefined = undefined;
  /**
   * The friendly name of a policy for the interface endpoint. If left undefined, the default policy will be used.
   */
  readonly policy: string | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link InterfaceEndpointConfig}*
 *
 * VPC interface endpoint configuration.
 * Used to define interface endpoints for a VPC.
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
   */
  readonly defaultPolicy: string = '';
  /**
   * An array of VPC interface endpoint service names to be deployed.
   *
   * @see {@link InterfaceEndpointServiceConfig}
   */
  readonly endpoints: InterfaceEndpointServiceConfig[] = [new InterfaceEndpointServiceConfig()];
  /**
   * An array of the friendly names of VPC subnets for the endpoints to be deployed.
   */
  readonly subnets: string[] = [];
  /**
   * Enable to define interface endpoints as centralized endpoints.
   *
   * @remarks
   * Endpoints defined as central endpoints will have Route 53 private hosted zones
   * created for each of them. These hosted zones are associated with any VPCs configured
   * with the `useCentralEndpoints` property enabled.
   */
  readonly central: boolean | undefined = undefined;
  /**
   * An array of source CIDRs allowed to communicate with the endpoints.
   *
   * @remarks
   * Use CIDR notation, i.e. 10.0.0.0/16
   */
  readonly allowedCidrs: string[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link SecurityGroupConfig} / {@link SecurityGroupRuleConfig} / {@link SubnetSourceConfig}*
 *
 * VPC subnet source configuration.
 * Used to define a subnet as a source in a security group rule.
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
   */
  readonly account = '';
  /**
   * The friendly name of the VPC in which the subnet resides.
   */
  readonly vpc = '';
  /**
   * An array of the friendly names of subnets to reference.
   */
  readonly subnets: string[] = [];
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link SecurityGroupConfig} / {@link SecurityGroupRuleConfig} / {@link SecurityGroupSourceConfig}*
 *
 * Security group source configuration.
 * Used to define a security group as a source in a security group rule.
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
   */
  readonly securityGroups: string[] = [];
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link SecurityGroupConfig} / {@link SecurityGroupRuleConfig} / {@link PrefixListSourceConfig}*
 *
 * Prefix list source configuration.
 * Used to define a prefix list as a source in a security group rule.
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
   */
  readonly prefixLists: string[] = [];
}

/**
 * *{@link NetworkConfig} / {@link PrefixListConfig}*
 *
 * Prefix list configuration.
 * Used to define a custom prefix list.
 *
 * @example
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
   */
  readonly name = '';
  /**
   * An array of friendly names for the accounts the prefix list is deployed.
   */
  readonly accounts: string[] = [''];
  /**
   * An array of region names for the prefix list to be deployed.
   *
   * @see {@link t.Region}
   */
  readonly regions: t.Region[] = ['us-east-1'];
  /**
   * The IP address family of the prefix list.
   */
  readonly addressFamily = 'IPv4';
  /**
   * The maximum allowed entries in the prefix list.
   */
  readonly maxEntries = 1;
  /**
   * An array of CIDR entries for the prefix list.
   *
   * @remarks
   * Use CIDR notation, i.e. 10.0.0.0/16
   */
  readonly entries: string[] = [];
  /**
   * An array of tag objects for the prefix list.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link SecurityGroupConfig} / {@link SecurityGroupRuleConfig}*
 *
 * Security group rule configuration.
 * Used to define a security group rule.
 *
 * @example
 * ```
 * - description: Remote access security group
 *   types:
 *     - RDP
 *     - SSH
 *   sources: []
 * ```
 */
export class SecurityGroupRuleConfig implements t.TypeOf<typeof NetworkConfigTypes.securityGroupRuleConfig> {
  /**
   * A Description for the security group rule.
   */
  readonly description = '';
  /**
   * An array of protocol types to include in the security group rule.
   *
   * @see {@link NetworkConfigTypes.securityGroupRuleTypeEnum}
   */
  readonly types: t.TypeOf<typeof NetworkConfigTypes.securityGroupRuleTypeEnum>[] | undefined = undefined;
  /**
   * An array of TCP ports to include in the security group rule.
   */
  readonly tcpPorts: number[] | undefined = undefined;
  /**
   * An array of UDP ports to include in the security group rule.
   */
  readonly udpPorts: number[] | undefined = undefined;
  /**
   * The port to start from in the security group rule.
   */
  readonly fromPort: number | undefined = undefined;
  /**
   * The port to end with in the security group rule.
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
 * Security group configuration.
 * Used to define a security group.
 *
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
   */
  readonly name = '';
  /**
   * A description for the security group.
   */
  readonly description = '';
  /**
   * An array of security group rule configurations for ingress rules.
   *
   * @see {@link SecurityGroupRuleConfig}
   */
  readonly inboundRules: SecurityGroupRuleConfig[] = [];
  /**
   * An array of security group rule configurations for egress rules.
   *
   * @see {@link SecurityGroupRuleConfig}
   */
  readonly outboundRules: SecurityGroupRuleConfig[] = [];
  /**
   * An array of tag objects for the security group.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link NetworkAclConfig} / {@link NetworkAclInboundRuleConfig} | {@link NetworkAclOutboundRuleConfig} / {@link NetworkAclSubnetSelection}*
 *
 * Network ACL subnet selection configuration.
 * Used to specify a subnet as a source for a network ACL.
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
   */
  readonly account = '';
  /**
   * The friendly name of the VPC of the subnet.
   */
  readonly vpc = '';
  /**
   * The friendly name of the subnet.
   */
  readonly subnet = '';

  /**
   * The region that the subnet is located in.
   */
  readonly region: t.Region | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link NetworkAclConfig} / {@link NetworkAclInboundRuleConfig}*
 *
 * Network ACL inbound rule configuration.
 * Used to define an inbound rule for a network ACL.
 *
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
   * Rules are evaluated in order from low to high.
   */
  readonly rule = 100;
  /**
   * The protocol for the network ACL rule.
   */
  readonly protocol = -1;
  /**
   * The port to start from in the network ACL rule.
   */
  readonly fromPort = -1;
  /**
   * The port to end with in the network ACL rule.
   */
  readonly toPort = -1;
  /**
   * The action for the network ACL rule.
   */
  readonly action = 'allow';
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
 * Network ACL outbound rule configuration.
 * Used to define an outbound rule for a network ACL.
 *
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
   * Rules are evaluated in order from low to high.
   */
  readonly rule = 100;
  /**
   * The protocol for the network ACL rule.
   */
  readonly protocol = -1;
  /**
   * The port to start from in the network ACL rule.
   */
  readonly fromPort = -1;
  /**
   * The port to end with in the network ACL rule.
   */
  readonly toPort = -1;
  /**
   * The action for the network ACL rule.
   */
  readonly action = 'allow';
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
 * Network ACL configuration.
 * Used to define the properties to configure a Network Access Control List (ACL)
 *
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
   * The value of this property will be utilized as the logical id for this
   * resource. Any references to this object should specify this value.
   */
  readonly name = '';

  /**
   * A list of subnets to associate with the Network ACL
   */
  readonly subnetAssociations: string[] = [];

  /**
   * A list of inbound rules to define for the Network ACL
   *
   * @see {@link NetworkAclInboundRuleConfig}
   */
  readonly inboundRules: NetworkAclInboundRuleConfig[] | undefined = undefined;

  /**
   * A list of outbound rules to define for the Network ACL
   *
   * @see {@link NetworkAclOutboundRuleConfig}
   */
  readonly outboundRules: NetworkAclOutboundRuleConfig[] | undefined = undefined;
  /**
   * A list of tags to attach to the Network ACL
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / ({@link SubnetConfig}) / {@link IpamAllocationConfig}*
 *
 * IPAM allocation config. Use to dynamically assign a VPC or subnet CIDR from an IPAM pool.
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
   * The IPAM Pool name to request the allocation from.
   */
  readonly ipamPoolName: string = '';

  /**
   * The subnet mask length to request.
   *
   * @remarks
   * Specify only the CIDR prefix length for the subnet, i.e. 24.
   */
  readonly netmaskLength: number = 24;
}

/**
 * *{@link NetworkConfig} / {@link DhcpOptsConfig}*
 *
 * DHCP options configuration.
 * Used to define a custom DHCP options set.
 *
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
   */
  readonly name: string = '';
  /**
   * An array of friendly account names to deploy the options set.
   */
  readonly accounts: string[] = [''];
  /**
   * An array of regions to deploy the options set.
   *
   * @see {@link t.Region}
   */
  readonly regions: t.Region[] = ['us-east-1'];
  /**
   * A domain name to assign to hosts using the options set.
   */
  readonly domainName: string | undefined = undefined;
  /**
   * An array of IP addresses for domain name servers.
   */
  readonly domainNameServers: string[] | undefined = undefined;
  /**
   * An array of IP addresses for NetBIOS servers.
   */
  readonly netbiosNameServers: string[] | undefined = undefined;
  /**
   * The NetBIOS node type number.
   *
   * @see {@link NetworkConfigTypes.netbiosNodeEnum}
   */
  readonly netbiosNodeType: t.TypeOf<typeof NetworkConfigTypes.netbiosNodeEnum> | undefined = undefined;
  /**
   * An array of IP addresses for NTP servers.
   */
  readonly ntpServers: string[] | undefined = undefined;
  /**
   * An array of tags for the options set.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link EndpointPolicyConfig}*
 *
 * VPC endpoint policy configuration.
 * Used to define VPC endpoint policies.
 *
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
   */
  readonly name: string = '';
  /**
   * A file path for a JSON-formatted policy document.
   */
  readonly document: string = '';
}

/**
 * *{@link NetworkConfig} / {@link CustomerGatewayConfig} / {@link VpnConnectionConfig} / {@link VpnTunnelOptionsSpecificationsConfig}*
 *
 * VPN tunnel options specification configuration.
 * Used to define tunnel IP addresses and/or pre-shared keys
 * for a site-to-site VPN connection
 *
 * @example
 * ```
 * - tunnelInsideCidr: 169.254.200.0/30
 *   preSharedKey: Key1-AbcXyz
 * - tunnelInsideCidr: 169.254.200.100/30
 * ```
 */
export class VpnTunnelOptionsSpecificationsConfig
  implements t.TypeOf<typeof NetworkConfigTypes.vpnTunnelOptionsSpecificationsConfig>
{
  /**
   * The Secrets Manager name that stores the pre-shared key (PSK), that exists in the same account
   * and region that the VPN Connection will be created in.
   * @remarks
   * Include the random hash that prepends the Secrets Manager name.
   */
  readonly preSharedKey: string | undefined = undefined;

  /**
   * The range of inside IP addresses for the tunnel. Any specified CIDR blocks must be unique across
   * all VPN connections that use the same virtual private gateway.
   * @remarks
   * The following CIDR blocks are reserved
   * and cannot be used: - 169.254.0.0/30 - 169.254.1.0/30 - 169.254.2.0/30 - 169.254.3.0/30 - 169.254.4.0/30
   * - 169.254.5.0/30 - 169.254.169.252/30
   */
  readonly tunnelInsideCidr: string | undefined = undefined;
}
/**
 * *{@link NetworkConfig} / {@link CustomerGatewayConfig} / {@link VpnConnectionConfig}*
 *
 * VPN Connection configuration.
 * Used to define the VPN Connection and its termination point.
 *
 * @example
 * ```
 * - name: accelerator-vpn
 *   transitGateway: Network-Main
 *   routeTableAssociations:
 *     - Network-Main-Core
 *   routeTablePropagations:
 *     - Network-Main-Core
 *   staticRoutesOnly: false
 *   tunnelSpecifications:
 *     - tunnelInsideCidr: 169.254.200.0/30
 *       preSharedKey: Key1-AbcXyz
 *     - tunnelInsideCidr: 169.254.200.100/30
 * ```
 */
export class VpnConnectionConfig implements t.TypeOf<typeof NetworkConfigTypes.vpnConnectionConfig> {
  /**
   * The name of the VPN Connection.
   *
   * The value of this property will be utilized as the logical id for this
   * resource. Any references to this object should specify this value.
   */
  readonly name = '';

  /**
   * The logical name of the Transit Gateway that the customer Gateway is attached to
   * so that a VPN connection is established.
   * @remarks
   * Must specify either the Transit Gateway name or the Virtual Private Gateway, not
   * both.
   */
  readonly transitGateway: string | undefined = undefined;

  /**
   * The logical name of the Virtual Private Cloud that a Virtual Private Gateway is attached to.
   * @remarks
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
   * @remarks
   * If creating a VPN connection for a device that doesn't support Border Gateway Protocol (BGP)
   * declare true as a value, otherwise, use false.
   */
  readonly staticRoutesOnly: boolean | undefined = true;

  /**
   * An array of tags for the VPN Connection.
   */
  readonly tags: t.Tag[] | undefined = undefined;

  /**
   * Define the optional VPN Tunnel configuration
   * @see {@link VpnTunnelOptionsSpecificationsConfig}
   */
  readonly tunnelSpecifications: VpnTunnelOptionsSpecificationsConfig[] = [];
}

/**
 * *{@link NetworkConfig} / {@link CustomerGatewayConfig}*
 *
 * CGW Configuration
 * Used to define Customer Gateways and site-to-site VPN connections.
 *
 * @example
 * ```
 * customerGateways:
 *   - name: accelerator-cgw
 *     account: Network
 *     region: *HOME_REGION
 *     ipAddress: 1.1.1.1
 *     asn: 65500
 *   vpnConnections:
 *     - name: accelerator-vpn
 *       transitGateway: Network-Main
 *       routeTableAssociations:
 *         - Network-Main-Core
 *       routeTablePropagations:
 *         - Network-Main-Core
 *       staticRoutesOnly: false
 *       tunnelSpecifications:
 *         - tunnelInsideCidr: 169.254.200.0/30
 *           preSharedKey: Key1-AbcXyz
 *         - tunnelInsideCidr: 169.254.200.100/30
 * ```
 */
export class CustomerGatewayConfig implements t.TypeOf<typeof NetworkConfigTypes.customerGatewayConfig> {
  /**
   * The name of the CGW.
   *
   * The value of this property will be utilized as the logical id for this
   * resource. Any references to this object should specify this value.
   */
  readonly name = '';

  /**
   * The logical name of the account to deploy the VPC to
   */
  readonly account = '';

  /**
   * The AWS region to provision the customer gateway in
   */
  readonly region = 'us-east-1';

  /**
   * Defines the IP address of the Customer Gateway
   */
  readonly ipAddress: string = '';

  /**
   * Define the ASN used for the Customer Gateway
   *
   * @remarks
   * The private ASN range is 64512 to 65534. The default is 65000.
   */
  readonly asn = 65000;

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
 * Load Balancers Configuration
 * Used to define ALB or NLBs to be deployed in the specified subnets
 *
 */

export class LoadBalancersConfig implements t.TypeOf<typeof NetworkConfigTypes.loadBalancersConfig> {
  readonly applicationLoadBalancers: CustomizationsConfig.ApplicationLoadBalancerConfig[] | undefined = undefined;
  readonly networkLoadBalancers: CustomizationsConfig.NetworkLoadBalancerConfig[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} / {@link VirtualPrivateGatewayConfig}*
 *
 * Virtual Private Gateway Configuration
 * Used to define Virtual Private Gateways that are attached to a VPC.
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
  readonly asn = 65000;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig}*
 *
 * VPC configuration.
 * Used to define a VPC.
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
   */
  readonly name = '';

  /**
   * The logical name of the account to deploy the VPC to
   */
  readonly account = '';

  /**
   * The AWS region to deploy the VPC to
   */
  readonly region = 'us-east-1';

  /**
   * A list of CIDRs to associate with the VPC.
   *
   * @remarks
   * At least one CIDR should be
   * provided if not using `ipamAllocations`.
   *
   * Use CIDR notation, i.e. 10.0.0.0/16
   */
  readonly cidrs: string[] | undefined = undefined;

  /**
   * Determine if the all traffic ingress and egress rules are deleted
   * in the default security group of a VPC.
   */
  readonly defaultSecurityGroupRulesDeletion: boolean | undefined = false;

  /**
   * The friendly name of a DHCP options set.
   */
  readonly dhcpOptions: string | undefined = undefined;

  /**
   * An array of DNS firewall VPC association configurations.
   *
   * @see {@link NetworkConfigTypes.vpcDnsFirewallAssociationConfig}
   */
  readonly dnsFirewallRuleGroups: t.TypeOf<typeof NetworkConfigTypes.vpcDnsFirewallAssociationConfig>[] | undefined =
    undefined;

  /**
   * Defines if an internet gateway should be added to the VPC
   */
  readonly internetGateway: boolean | undefined = undefined;
  /**
   * Enable DNS hostname support for the VPC.
   */
  readonly enableDnsHostnames: boolean | undefined = true;
  /**
   * Enable DNS support for the VPC.
   */
  readonly enableDnsSupport: boolean | undefined = true;

  /**
   * Define instance tenancy for the VPC.
   */
  readonly instanceTenancy: t.TypeOf<typeof NetworkConfigTypes.instanceTenancyTypeEnum> | undefined = 'default';

  /**
   * An optional array of IPAM allocation configurations.
   *
   * @see {@link IpamAllocationConfig}
   */
  readonly ipamAllocations: IpamAllocationConfig[] | undefined = undefined;

  /**
   * An optional list of DNS query log configuration names.
   */
  readonly queryLogs: string[] | undefined = undefined;

  /**
   * An optional list of Route 53 resolver rule names.
   */
  readonly resolverRules: string[] | undefined = undefined;
  /**
   * An array of route table configurations for the VPC.
   */
  readonly routeTables: RouteTableConfig[] | undefined = undefined;
  /**
   * An array of subnet configurations for the VPC.
   */
  readonly subnets: SubnetConfig[] | undefined = undefined;
  /**
   * An array of NAT gateway configurations for the VPC.
   */
  readonly natGateways: NatGatewayConfig[] | undefined = undefined;
  /**
   * An array of Transit Gateway attachment configurations.
   */
  readonly transitGatewayAttachments: TransitGatewayAttachmentConfig[] | undefined = undefined;
  /**
   * An array of Local Gateway Route table configurations.
   */
  readonly outposts: OutpostsConfig[] | undefined = undefined;
  /**
   * An array of gateway endpoints for the VPC.
   */
  readonly gatewayEndpoints: GatewayEndpointConfig | undefined = undefined;

  /**
   * A list of VPC interface endpoints.
   */
  readonly interfaceEndpoints: InterfaceEndpointConfig | undefined = undefined;

  /**
   * When set to true, this VPC will be configured to utilize centralized
   * endpoints. This includes having the Route 53 Private Hosted Zone
   * associated with this VPC. Centralized endpoints are configured per
   * region, and can span to spoke accounts
   *
   * @default false
   */
  readonly useCentralEndpoints: boolean | undefined = false;

  /**
   * A list of Security Groups to deploy for this VPC
   *
   * @default undefined
   */
  readonly securityGroups: SecurityGroupConfig[] | undefined = undefined;

  /**
   * A list of Network Access Control Lists (ACLs) to deploy for this VPC
   *
   * @default undefined
   */
  readonly networkAcls: NetworkAclConfig[] | undefined = undefined;

  /**
   * A list of tags to apply to this VPC
   *
   * @default undefined
   *
   */
  readonly tags: t.Tag[] | undefined = undefined;

  /**
   * Virtual Private Gateway configuration
   *
   * @default undefined
   */
  readonly virtualPrivateGateway: VirtualPrivateGatewayConfig | undefined = undefined;

  /**
   * VPC flog log configuration
   */
  readonly vpcFlowLogs: t.VpcFlowLogsConfig | undefined = undefined;
  readonly loadBalancers: LoadBalancersConfig | undefined = undefined;
  readonly targetGroups: CustomizationsConfig.TargetGroupItemConfig[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link VpcTemplatesConfig}*
 *
 * VPC templates configuration.
 * Used to define a VPC that is deployed to multiple accounts/OUs.
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
   */
  readonly name = '';

  /**
   * The AWS region to deploy the VPCs to
   */
  readonly region = 'us-east-1';

  /**
   * VPC deployment targets.
   *
   * @remarks
   * Targets can be account names and/or organizational units.
   *
   * @see {@link t.ShareTargets}
   */
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();

  /**
   * A list of CIDRs to associate with the VPC.
   *
   * @remarks
   * At least one CIDR should be
   * provided if not using `ipamAllocations`.
   *
   * Use CIDR notation, i.e. 10.0.0.0/16
   */
  readonly cidrs: string[] | undefined = undefined;

  /**
   * An array of IPAM allocation configurations.
   *
   * @see {@link IpamAllocationConfig}
   */
  readonly ipamAllocations: IpamAllocationConfig[] | undefined = undefined;

  /**
   * Determine if the all traffic ingress and egress rules are deleted
   * in the default security group of a VPC.
   */
  readonly defaultSecurityGroupRulesDeletion: boolean | undefined = false;

  /**
   * The friendly name of a DHCP options set.
   */
  readonly dhcpOptions: string | undefined = undefined;

  /**
   * An array of DNS firewall VPC association configurations.
   *
   * @see {@link NetworkConfigTypes.vpcDnsFirewallAssociationConfig}
   */
  readonly dnsFirewallRuleGroups: t.TypeOf<typeof NetworkConfigTypes.vpcDnsFirewallAssociationConfig>[] | undefined =
    undefined;

  /**
   * Defines if an internet gateway should be added to the VPC
   */
  readonly internetGateway: boolean | undefined = undefined;
  /**
   * Enable DNS hostname support for the VPC.
   */
  readonly enableDnsHostnames: boolean | undefined = true;
  /**
   * Enable DNS support for the VPC.
   */
  readonly enableDnsSupport: boolean | undefined = true;

  /**
   * Define instance tenancy for the VPC.
   */
  readonly instanceTenancy: t.TypeOf<typeof NetworkConfigTypes.instanceTenancyTypeEnum> | undefined = 'default';

  /**
   * An optional list of DNS query log configuration names.
   */
  readonly queryLogs: string[] | undefined = undefined;

  /**
   * An optional list of Route 53 resolver rule names.
   */
  readonly resolverRules: string[] | undefined = undefined;
  /**
   * An array of route table configurations for the VPC.
   */
  readonly routeTables: RouteTableConfig[] | undefined = undefined;
  /**
   * An array of subnet configurations for the VPC.
   */
  readonly subnets: SubnetConfig[] | undefined = undefined;
  /**
   * An array of NAT gateway configurations for the VPC.
   */
  readonly natGateways: NatGatewayConfig[] | undefined = undefined;
  /**
   * An array of Transit Gateway attachment configurations.
   */
  readonly transitGatewayAttachments: TransitGatewayAttachmentConfig[] | undefined = undefined;

  /**
   * An array of gateway endpoints for the VPC.
   */
  readonly gatewayEndpoints: GatewayEndpointConfig | undefined = undefined;

  /**
   * A list of VPC interface endpoints.
   */
  readonly interfaceEndpoints: InterfaceEndpointConfig | undefined = undefined;

  /**
   * When set to true, this VPC will be configured to utilize centralized
   * endpoints. This includes having the Route 53 Private Hosted Zone
   * associated with this VPC. Centralized endpoints are configured per
   * region, and can span to spoke accounts
   *
   * @default false
   */
  readonly useCentralEndpoints: boolean | undefined = false;

  /**
   * A list of Security Groups to deploy for this VPC
   *
   * @default undefined
   */
  readonly securityGroups: SecurityGroupConfig[] | undefined = undefined;

  /**
   * A list of Network Access Control Lists (ACLs) to deploy for this VPC
   *
   * @default undefined
   */
  readonly networkAcls: NetworkAclConfig[] | undefined = undefined;

  /**
   * A list of tags to apply to this VPC
   *
   * @default undefined
   *
   */
  readonly tags: t.Tag[] | undefined = undefined;

  /**
   * Virtual Private Gateway configuration
   *
   * @default undefined
   */
  readonly virtualPrivateGateway: VirtualPrivateGatewayConfig | undefined = undefined;

  /**
   * VPC flog log configuration
   */
  readonly vpcFlowLogs: t.VpcFlowLogsConfig | undefined = undefined;

  readonly loadBalancers: LoadBalancersConfig | undefined = undefined;

  readonly targetGroups: CustomizationsConfig.TargetGroupItemConfig[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link ResolverConfig} / ({@link ResolverEndpointConfig}) / {@link ResolverRuleConfig}*
 *
 * Route 53 resolver rule configuration.
 * Used to define resolver rules.
 *
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
   */
  readonly name: string = '';
  /**
   * The domain name for the resolver rule.
   */
  readonly domainName: string = '';
  /**
   * Regions to exclude from deployment.
   *
   * @remarks
   * Only define this property if creating a `SYSTEM` rule type.
   * This does not apply to rules of type `FORWARD`.
   */
  readonly excludedRegions: t.Region[] | undefined = undefined;
  /**
   * The friendly name of an inbound endpoint to target.
   *
   * @remarks
   * Use this property to define resolver rules for resolving DNS records across subdomains
   * hosted within the accelerator environment.
   */
  readonly inboundEndpointTarget: string | undefined = undefined;
  /**
   * The type of rule to create.
   *
   * @see {@link NetworkConfigTypes.ruleTypeEnum}
   */
  readonly ruleType: t.TypeOf<typeof NetworkConfigTypes.ruleTypeEnum> | undefined = 'FORWARD';
  /**
   * Resource Access Manager (RAM) share targets.
   *
   * @remarks
   * Targets can be account names and/or organizational units.
   *
   * @see {@link t.ShareTargets}
   */
  readonly shareTargets: t.ShareTargets | undefined = undefined;
  /**
   * An array of tags for the resolve rule.
   */
  readonly tags: t.Tag[] | undefined = undefined;
  /**
   * An array of target IP configurations for the resolver rule.
   *
   * @see {@link NetworkConfigTypes.ruleTargetIps}
   */
  readonly targetIps: t.TypeOf<typeof NetworkConfigTypes.ruleTargetIps>[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link ResolverConfig} / {@link ResolverEndpointConfig}*
 *
 * Route 53 resolver endpoint configuration.
 * Used to define a resolver endpoint.
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
   */
  readonly name: string = '';
  /**
   * The type of resolver endpoint to deploy.
   *
   * @see {@link NetworkConfigTypes.resolverEndpointTypeEnum}
   */
  readonly type: t.TypeOf<typeof NetworkConfigTypes.resolverEndpointTypeEnum> = 'INBOUND';
  /**
   * The friendly name of the VPC to deploy the resolver endpoint to.
   */
  readonly vpc: string = '';
  /**
   * An array of friendly names for subnets to deploy the resolver endpoint to.
   */
  readonly subnets: string[] = [];
  /**
   * The allowed ingress/egress CIDRs for the resolver endpoint security group.
   */
  readonly allowedCidrs: string[] | undefined = undefined;
  /**
   * An array of friendly names of the resolver rules to associate with the endpoint.
   *
   * @see {@link ResolverRuleConfig}
   */
  readonly rules: ResolverRuleConfig[] | undefined = undefined;
  /**
   * An array of tags for the resolver endpoint.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link ResolverConfig} / {@link DnsQueryLogsConfig}*
 *
 * Route 53 DNS query logging configuration.
 * Use to define query logging configs.
 *
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
   */
  readonly name: string = '';
  /**
   * An array of destination services used to store the logs.
   *
   * @see {@link NetworkConfigTypes.logDestinationTypeEnum}
   */
  readonly destinations: t.TypeOf<typeof t.logDestinationTypeEnum>[] = ['s3'];
  /**
   * Resource Access Manager (RAM) share targets.
   *
   * @remarks
   * Targets can be account names and/or organizational units.
   *
   * @see {@link t.ShareTargets}
   */
  readonly shareTargets: t.ShareTargets | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link ResolverConfig} / {@link DnsFirewallRuleGroupConfig} / {@link DnsFirewallRulesConfig}*
 *
 * Route 53 DNS firewall rule configuration.
 * Used to define DNS firewall rules.
 *
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
   */
  readonly priority: number = 100;
  /**
   * Configure an override domain for BLOCK actions.
   */
  readonly blockOverrideDomain: string | undefined = undefined;
  /**
   * Configure a time-to-live (TTL) for the override domain.
   */
  readonly blockOverrideTtl: number | undefined = undefined;
  /**
   * Configure a specific response type for BLOCK actions.
   *
   * @see {@link NetworkConfigTypes.dnsFirewallBlockResponseTypeEnum}
   */
  readonly blockResponse: t.TypeOf<typeof NetworkConfigTypes.dnsFirewallBlockResponseTypeEnum> | undefined = undefined;
  /**
   * A file containing a custom domain list in TXT format.
   */
  readonly customDomainList: string | undefined = undefined;
  /**
   * Configure a rule that uses an AWS-managed domain list.
   *
   * @see {@link NetworkConfigTypes.dnsFirewallManagedDomainListEnum}
   */
  readonly managedDomainList: t.TypeOf<typeof NetworkConfigTypes.dnsFirewallManagedDomainListEnum> | undefined =
    undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link ResolverConfig} / {@link DnsFirewallRuleGroupConfig}*
 *
 * Route 53 DNS firewall rule group configuration.
 * Used to define a DNS firewall rule group.
 *
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
   */
  readonly name: string = '';
  /**
   * The regions to deploy the rule group to.
   *
   * @see {@link t.Region}
   */
  readonly regions: t.Region[] = ['us-east-1'];
  /**
   * An array of DNS firewall rule configurations.
   *
   * @see {@link DnsFirewallRulesConfig}
   */
  readonly rules: DnsFirewallRulesConfig[] = [];
  /**
   * Resource Access Manager (RAM) share targets.
   *
   * @remarks
   * Targets can be account names and/or organizational units.
   *
   * @see {@link t.ShareTargets}
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
 * Route 53 resolver configuration.
 * Used to define configurations for Route 53 resolver.
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
   * An array of Route 53 resolver endpoint configurations.
   *
   * @see {@link ResolverEndpointConfig}
   */
  readonly endpoints: ResolverEndpointConfig[] | undefined = undefined;
  /**
   * An array of Route 53 DNS firewall rule group configurations.
   *
   * @see {@link DnsFirewallRuleGroupConfig}
   */
  readonly firewallRuleGroups: DnsFirewallRuleGroupConfig[] | undefined = undefined;
  /**
   * A Route 53 resolver DNS query logging configuration.
   *
   * @see {@link DnsQueryLogsConfig}
   */
  readonly queryLogs: DnsQueryLogsConfig | undefined = undefined;
  /**
   * An optional array of Route 53 resolver rules.
   *
   * @remarks
   * This `rules` object should only be used for rules of type `SYSTEM`.
   * For rules of type `FORWARD`, define under the `endpoints` configuration object.
   */
  readonly rules: ResolverRuleConfig[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig} / {@link NfwRuleSourceListConfig}*
 *
 * Network Firewall rule source list configuration.
 * Used to define DNS allow and deny lists for Network Firewall.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-rulessourcelist.html}
 *
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
   *
   * @see {@link NetworkConfigTypes.nfwGeneratedRulesType}
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
 * Network Firewall stateful rule header configuration.
 * Used to specify a stateful rule in a header-type format.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-header.html}
 *
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
   *
   * @see {@link NetworkConfigTypes.nfwStatefulRuleDirectionType}
   */
  readonly direction: t.TypeOf<typeof NetworkConfigTypes.nfwStatefulRuleDirectionType> = 'ANY';
  /**
   * The protocol to inspect.
   *
   * @remarks
   * To specify all traffic, use `IP`.
   *
   * @see {@link NetworkConfigTypes.nfwStatefulRuleProtocolType}
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
 * Use to specify keywords and settings for stateful rules.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-ruleoption.html}
 *
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
 * Network Firewall stateful rule configuration.
 * Use to define stateful rules for Network Firewall.
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
 * Network Firewall custom actions dimensions.
 * Used to define custom actions to log in CloudWatch metrics.
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
 * Network Firewall custom action definition configuration.
 * Used to define custom metrics for Network Firewall.
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
 * Network Firewall custom action configuration.
 * Used to define custom actions for Network Firewall.
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
 * Network Firewall stateless port range configuration.
 * Used to define a port range in stateless rules.
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
 * Network Firewall stateless TCP flags configuration.
 * Used to define TCP flags to inspect in stateless rules.
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
 * Network Firewall stateless rule match attributes configuration.
 * Used to define stateless rule match attributes for Network Firewall.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-matchattributes.html}
 *
 * @example
 * ```
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
   * An array of Network Firewall stateless port range configurations.
   *
   * @see {@link NfwRuleSourceStatelessPortRangeConfig}
   */
  readonly destinationPorts: NfwRuleSourceStatelessPortRangeConfig[] | undefined = undefined;
  /**
   * An array of destination CIDR ranges.
   *
   * @remarks
   * Use CIDR notation, i.e. 10.0.0.0/16
   */
  readonly destinations: string[] | undefined = undefined;
  /**
   * An array of IP protocol numbers to inspect.
   */
  readonly protocols: number[] | undefined = undefined;
  /**
   * An array of Network Firewall stateless port range configurations.
   *
   * @see {@link NfwRuleSourceStatelessPortRangeConfig}
   */
  readonly sourcePorts: NfwRuleSourceStatelessPortRangeConfig[] | undefined = undefined;
  /**
   * An array of source CIDR ranges.
   *
   * @remarks
   * Use CIDR notation, i.e. 10.0.0.0/16
   */
  readonly sources: string[] | undefined = undefined;
  /**
   * An array of Network Firewall stateless TCP flag configurations.
   *
   * @see {@link NfwRuleSourceStatelessTcpFlagsConfig}
   */
  readonly tcpFlags: NfwRuleSourceStatelessTcpFlagsConfig[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig} / {@link NfwStatelessRulesAndCustomActionsConfig} / {@link NfwRuleSourceStatelessRuleConfig} / {@link NfwRuleSourceStatelessRuleDefinitionConfig}*
 *
 * Network Firewall stateless rule definition configuration.
 * Used to define a stateless rule definition.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-ruledefinition.html}
 *
 * @example
 * ```
 * actions: ['aws:pass']
 * matchAttributes:
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
   *
   * @see {@link NetworkConfigTypes.nfwStatelessRuleActionType}
   */
  readonly actions: t.TypeOf<typeof NetworkConfigTypes.nfwStatelessRuleActionType>[] = ['aws:drop'];
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
 * Network Firewall stateless rule configuration.
 * Used to define a stateless rule for Network Firewall.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-statelessrule.html}
 *
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
 * Network Firewall stateless rules and custom metrics configuration.
 * Used to define stateless rules and/or custom metrics for Network Firewall.
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
 * Used to define rules for a Network Firewall.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-rulessource.html}
 *
 * @example
 * File with list of Suricata rules:
 * ```
 * rulesFile: path/to/rules.txt
 * ```
 * DNS rule list:
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
 * Stateful rules:
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
   * A Network Firewall rule source list configuration.
   *
   * @see {@link NfwRuleSourceListConfig}
   */
  readonly rulesSourceList: NfwRuleSourceListConfig | undefined = undefined;
  /**
   * A Suricata-compatible stateful rule string.
   *
   * @see {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/suricata-examples.html#suricata-example-rule-with-variables}
   */
  readonly rulesString: string | undefined = undefined;
  /**
   * An array of Network Firewall stateful rule configurations.
   *
   * @see {@link NfwRuleSourceStatefulRuleConfig}
   */
  readonly statefulRules: NfwRuleSourceStatefulRuleConfig[] | undefined = undefined;
  /**
   * A Network Firewall stateless rules and custom action configuration.
   *
   * @see {@link NfwStatelessRulesAndCustomActionsConfig}
   */
  readonly statelessRulesAndCustomActions: NfwStatelessRulesAndCustomActionsConfig | undefined = undefined;
  /**
   * Suricata rules file.
   *
   * @see {@link https://suricata.readthedocs.io/en/suricata-6.0.2/rules/intro.html}
   *
   */
  readonly rulesFile: string | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleVariableConfig} / {@link NfwRuleVariableDefinitionConfig}*
 *
 * Network Firewall rule variable definition configuration.
 * Used to define a rule variable definition for Network Firewall.
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
 * Network Firewall rule variable configuration.
 * Used to define a rule variable for Network Firewall.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-rulevariables.html}
 *
 * @example
 * CURRENT SYNTAX: use the following syntax when defining new rule variables. The additional example underneath is for backward compatibility
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
 * Network Firewall rule group configuration.
 * Used to define a rule group for Network Firewall.
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
   */
  readonly name: string = '';
  /**
   * The regions to deploy the rule group to.
   *
   * @see {@link t.Region}
   */
  readonly regions: t.Region[] = [];
  /**
   * The capacity of the rule group.
   */
  readonly capacity: number = 123;
  /**
   * The type of rules in the rule group.
   *
   * @see {@link NetworkConfigTypes.nfwRuleType}
   */
  readonly type: t.TypeOf<typeof NetworkConfigTypes.nfwRuleType> = 'STATEFUL';
  /**
   * A description for the rule group.
   */
  readonly description: string | undefined = undefined;
  /**
   * A Network Firewall rule group configuration.
   *
   * @see {@link NfwRuleGroupRuleConfig}
   */
  readonly ruleGroup: NfwRuleGroupRuleConfig | undefined = undefined;
  /**
   * Resource Access Manager (RAM) share targets.
   *
   * @remarks
   * Targets can be account names and/or organizational units.
   *
   * @see {@link t.ShareTargets}
   */
  readonly shareTargets: t.ShareTargets | undefined = undefined;
  /**
   * An array of tags for the rule group.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwFirewallPolicyConfig} / {@link NfwFirewallPolicyPolicyConfig} / {@link NfwStatefulRuleGroupReferenceConfig}*
 *
 * Network Firewall stateful rule group reference configuration.
 * Used to reference a stateful rule group in a Network Firewall policy.
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
   */
  readonly name: string = '';
  /**
   * If using strict ordering, a priority number for the rule.
   */
  readonly priority: number | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwFirewallPolicyConfig} / {@link NfwFirewallPolicyPolicyConfig} / {@link NfwStatelessRuleGroupReferenceConfig}*
 *
 * Network Firewall stateless rule group configuration.
 * Used to reference a stateless rule group in a Network Firewall policy.
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
 * Network Firewall policy policy configuration.
 * Used to define the configuration of a Network Firewall policy.
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
   */
  readonly statelessDefaultActions: string[] = [];
  /**
   * An array of default actions to take on fragmented packets.
   */
  readonly statelessFragmentDefaultActions: string[] = [];
  /**
   * An array of default actions to take on packets evaluated by the stateful engine.
   */
  readonly statefulDefaultActions: t.TypeOf<typeof NetworkConfigTypes.nfwStatefulDefaultActionType>[] | undefined =
    undefined;
  /**
   * Define how the stateful engine will evaluate packets.
   *
   * @see {@link NetworkConfigTypes.nfwStatefulRuleOptionsType}
   */
  readonly statefulEngineOptions: t.TypeOf<typeof NetworkConfigTypes.nfwStatefulRuleOptionsType> | undefined =
    undefined;
  /**
   * An array of Network Firewall stateful rule group reference configurations.
   *
   * @see {@link NfwStatefulRuleGroupReferenceConfig}
   */
  readonly statefulRuleGroups: NfwStatefulRuleGroupReferenceConfig[] | undefined = undefined;
  /**
   * An array of Network Firewall custom action configurations.
   *
   * @see {@link NfwRuleSourceCustomActionConfig}
   */
  readonly statelessCustomActions: NfwRuleSourceCustomActionConfig[] | undefined = undefined;
  /**
   * An array of Network Firewall stateless rule group reference configurations.
   *
   * @see {@link NfwStatelessRuleGroupReferenceConfig}
   */
  readonly statelessRuleGroups: NfwStatelessRuleGroupReferenceConfig[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwFirewallPolicyConfig}*
 *
 * Network Firewall policy configuration.
 * Used to define a Network Firewall policy.
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
   */
  readonly name: string = '';
  /**
   * A Network Firewall policy policy configuration.
   *
   * @see {@link NfwFirewallPolicyPolicyConfig}
   */
  readonly firewallPolicy: NfwFirewallPolicyPolicyConfig = new NfwFirewallPolicyPolicyConfig();
  /**
   * The regions to deploy the policy to.
   *
   * @see {@link t.Region}
   */
  readonly regions: t.Region[] = [];
  /**
   * A description for the policy.
   */
  readonly description: string | undefined = undefined;
  /**
   * Resource Access Manager (RAM) share targets.
   *
   * @remarks
   * Targets can be account names and/or organizational units.
   *
   * @see {@link t.ShareTargets}
   */
  readonly shareTargets: t.ShareTargets | undefined = undefined;
  /**
   * An array of tags for the policy.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwFirewallConfig} / {@link NfwLoggingConfig}*
 *
 * Network Firewall logging configuration.
 * Used to define logging destinations for Network Firewall.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-loggingconfiguration-logdestinationconfig.html}
 *
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
   * @see {@link t.logDestinationTypeEnum}
   */
  readonly destination: t.TypeOf<typeof t.logDestinationTypeEnum> = 's3';
  /**
   * The type of actions to log.
   *
   * @see {@link NetworkConfigTypes.nfwLogType}
   */
  readonly type: t.TypeOf<typeof NetworkConfigTypes.nfwLogType> = 'ALERT';
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwFirewallConfig}*
 *
 * Network Firewall firewall configuration.
 * Used to define a Network Firewall firewall.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-networkfirewall-firewall.html}
 *
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
   */
  readonly name: string = '';
  /**
   * The friendly name of the Network Firewall policy.
   */
  readonly firewallPolicy: string = '';
  /**
   * An array of the friendly names of subnets to deploy Network Firewall to.
   */
  readonly subnets: string[] = [];
  /**
   * The friendly name of the VPC to deploy Network Firewall to.
   */
  readonly vpc: string = '';
  /**
   * Enable for deletion protection on the firewall.
   */
  readonly deleteProtection: boolean | undefined = undefined;
  /**
   * A description for the firewall.
   */
  readonly description: string | undefined = undefined;
  /**
   * Enable to disallow firewall policy changes.
   */
  readonly firewallPolicyChangeProtection: boolean | undefined = undefined;
  /**
   * Enable to disallow firewall subnet changes.
   */
  readonly subnetChangeProtection: boolean | undefined = undefined;
  /**
   * An array of Network Firewall logging configurations.
   *
   * @see {@link NfwLoggingConfig}
   */
  readonly loggingConfiguration: NfwLoggingConfig[] | undefined = undefined;
  /**
   * An array of tags for the firewall.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig}*
 *
 * Network Firewall configuration.
 * Used to define Network Firewall configurations for the accelerator.
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
 * Gateway Load Balancer endpoint configuration.
 * Use to define Gateway Load Balancer endpoints.
 *
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
   */
  readonly name: string = '';
  /**
   * The friendly name of the account to deploy the endpoint to.
   */
  readonly account: string = '';
  /**
   * The friendly name of the subnet to deploy the Gateway Load Balancer endpoint to.
   */
  readonly subnet: string = '';
  /**
   * The friendly name of the VPC to deploy the Gateway Load Balancer endpoint to.
   */
  readonly vpc: string = '';
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link GwlbConfig}*
 *
 * Gateway Load Balancer configuration.
 * Used to define Gateway Load Balancer configurations for the accelerator.
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
   */
  readonly name: string = '';
  /**
   * An array of Gateway Load Balancer endpoint configurations.
   */
  readonly endpoints: GwlbEndpointConfig[] = [];
  /**
   * An array of friendly names of subnets to deploy the Gateway Load Balancer to.
   */
  readonly subnets: string[] = [];
  /**
   * The friendly name of the VPC to deploy the Gateway Load Balancer to.
   */
  readonly vpc: string = '';
  /**
   * Whether to enable cross-zone load balancing.
   */
  readonly crossZoneLoadBalancing: boolean | undefined = undefined;
  /**
   * Whether to enable deletion protection.
   */
  readonly deletionProtection: boolean | undefined = undefined;
  /**
   * The friendly name of a target group to forward traffic to
   *
   * @remarks
   * This target group must be defined in `Ec2FirewallConfig`
   * in the `customizations-config.yaml` configuration file
   */
  readonly targetGroup: string | undefined = undefined;
  /**
   * An optional array of CloudFormation tag objects.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig}*
 *
 * Central network services configuration.
 * Used to define centralized networking services for the accelerator.
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
  readonly transitGatewayPeering: TransitGatewayPeeringConfig[] = [];

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
   * @see {@link t.VpcFlowLogsConfig}
   */
  readonly vpcFlowLogs: t.VpcFlowLogsConfig = new t.VpcFlowLogsConfig();

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
    for (const transitGatewayPeering of this.transitGatewayPeering) {
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
