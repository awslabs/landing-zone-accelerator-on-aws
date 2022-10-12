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

import { AccountsConfig } from './accounts-config';
import * as t from './common-types';
import { OrganizationConfig } from './organization-config';

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

  static readonly transitGatewayRouteEntryConfig = t.interface({
    destinationCidrBlock: t.optional(t.nonEmptyString),
    destinationPrefixList: t.optional(t.nonEmptyString),
    blackhole: t.optional(t.boolean),
    attachment: t.optional(
      t.union([this.transitGatewayRouteTableVpcEntryConfig, this.transitGatewayRouteTableDxGatewayEntryConfig]),
    ),
  });

  static readonly transitGatewayRouteTableConfig = t.interface({
    name: t.nonEmptyString,
    tags: t.optional(t.array(t.tag)),
    routes: t.array(this.transitGatewayRouteEntryConfig),
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
    ],
    'Value should be a route table target type',
  );

  static readonly gatewayRouteTableTypeEnum = t.enums(
    'GatewayType',
    ['internetGateway', 'virtualGateway'],
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
      'MYSQL',
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
    port: t.optional(t.number),
    fromPort: t.optional(t.number),
    toPort: t.optional(t.number),
    sources: t.array(
      t.union([t.nonEmptyString, this.subnetSourceConfig, this.securityGroupSourceConfig, this.prefixListSourceConfig]),
    ),
  });

  static readonly securityGroupConfig = t.interface({
    name: t.nonEmptyString,
    description: t.optional(t.nonEmptyString),
    inboundRules: t.optional(t.array(this.securityGroupRuleConfig)),
    outboundRules: t.optional(t.array(this.securityGroupRuleConfig)),
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

  static readonly vpcConfig = t.interface({
    name: t.nonEmptyString,
    account: t.nonEmptyString,
    region: t.region,
    cidrs: t.optional(t.array(t.nonEmptyString)),
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
    prefixLists: t.optional(t.array(this.prefixListConfig)),
    networkAcls: t.optional(t.array(this.networkAclConfig)),
    queryLogs: t.optional(t.array(t.nonEmptyString)),
    resolverRules: t.optional(t.array(t.nonEmptyString)),
    routeTables: t.optional(t.array(this.routeTableConfig)),
    subnets: t.optional(t.array(this.subnetConfig)),
    transitGatewayAttachments: t.optional(t.array(this.transitGatewayAttachmentConfig)),
    tags: t.optional(t.array(t.tag)),
    outposts: t.optional(t.array(this.outpostsConfig)),
    vpcFlowLogs: t.optional(t.vpcFlowLogsConfig),
  });

  static readonly vpcTemplatesConfig = t.interface({
    name: t.nonEmptyString,
    region: t.region,
    deploymentTargets: t.deploymentTargets,
    ipamAllocations: t.array(this.ipamAllocationConfig),
    dhcpOptions: t.optional(t.nonEmptyString),
    dnsFirewallRuleGroups: t.optional(t.array(this.vpcDnsFirewallAssociationConfig)),
    enableDnsHostnames: t.optional(t.boolean),
    enableDnsSupport: t.optional(t.boolean),
    gatewayEndpoints: t.optional(this.gatewayEndpointConfig),
    instanceTenancy: t.optional(this.instanceTenancyTypeEnum),
    interfaceEndpoints: t.optional(this.interfaceEndpointConfig),
    internetGateway: t.optional(t.boolean),
    natGateways: t.optional(t.array(this.natGatewayConfig)),
    useCentralEndpoints: t.optional(t.boolean),
    securityGroups: t.optional(t.array(this.securityGroupConfig)),
    prefixLists: t.optional(t.array(this.prefixListConfig)),
    networkAcls: t.optional(t.array(this.networkAclConfig)),
    queryLogs: t.optional(t.array(t.nonEmptyString)),
    resolverRules: t.optional(t.array(t.nonEmptyString)),
    routeTables: t.optional(t.array(this.routeTableConfig)),
    subnets: t.optional(t.array(this.subnetConfig)),
    transitGatewayAttachments: t.optional(t.array(this.transitGatewayAttachmentConfig)),
    tags: t.optional(t.array(t.tag)),
    vpcFlowLogs: t.optional(t.vpcFlowLogsConfig),
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
    flags: t.array(t.string),
    masks: t.array(t.nonEmptyString),
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
    actions: t.array(this.nfwStatelessRuleActionType),
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
  });

  static readonly nfwRuleVariableDefinitionConfig = t.interface({
    name: t.nonEmptyString,
    definition: t.array(t.nonEmptyString),
  });

  static readonly nfwRuleVariableConfig = t.interface({
    ipSets: this.nfwRuleVariableDefinitionConfig,
    portSets: this.nfwRuleVariableDefinitionConfig,
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
    statefulDefaultActions: t.optional(t.array(t.nonEmptyString)),
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

  static readonly networkConfig = t.interface({
    defaultVpc: this.defaultVpcsConfig,
    endpointPolicies: t.array(this.endpointPolicyConfig),
    transitGateways: t.array(this.transitGatewayConfig),
    vpcs: t.array(this.vpcConfig),
    vpcFlowLogs: t.vpcFlowLogsConfig,
    centralNetworkServices: t.optional(this.centralNetworkServicesConfig),
    dhcpOptions: t.optional(t.array(this.dhcpOptsConfig)),
    directConnectGateways: t.optional(t.array(this.dxGatewayConfig)),
    prefixLists: t.optional(t.array(this.prefixListConfig)),
    vpcPeering: t.optional(t.array(this.vpcPeeringConfig)),
    vpcTemplates: t.optional(t.array(this.vpcTemplatesConfig)),
    elbAccountIds: t.optional(t.array(this.elbAccountIdsConfig)),
  });
}

/**
 * Default VPC configuration.
 * Choose whether or not to delete default VPCs.
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
 * Transit Gateway VPC entry configuration.
 * Used to define an account and VPC name for Transit Gateway static route entries.
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
 * Transit Gateway Direct Connect Gateway entry configuration.
 * Used to define a Direct Connect Gateway attachment for Transit
 * Gateway static routes.
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
 * Transit Gateway route entry configuration.
 * Used to define static route entries in a Transit Gateway route table.
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
   * @see {@link TransitGatewayRouteTableVpcEntryConfig} {@link TransitGatewayRouteTableDxGatewayEntryConfig}
   */
  readonly attachment:
    | TransitGatewayRouteTableVpcEntryConfig
    | TransitGatewayRouteTableDxGatewayEntryConfig
    | undefined = undefined;
}

/**
 * Transit Gateway route table configuration.
 * Used to define a Transit Gateway route table.
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
 * Transit Gateway configuration.
 * Used to define a Transit Gateway.
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
 * Direct Connect Gateway configuration.
 * Used to define Direct Connect Gateways, virtual interfaces,
 * and gateway associations.
 *
 * @example
 * ```
 * - name: Accelerator-DXGW
 *   account: Network
 *   asn: 64512
 *   gamewayName: Accelerator-DXGW
 *   virtualInterfaces: []
 *   transitGatewayAssociations: []
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
 * IPAM scope configuration.
 * Used to define a custom IPAM scope.
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
 * IPAM pool configuration.
 * Used to define an IPAM pool.
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
 * VPC route table entry configuration.
 * Used to define static route entries in a VPC route table.
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
   * `transitGateway`, `natGateway`, `internetGateway`, `networkInterface`.
   *
   * `destination` MUST be specified for route entry type `networkFirewall`.
   *
   * Leave undefined for route entry type `gatewayEndpoint`.
   */
  readonly destination: string | undefined = undefined;
  /**
   * The friendly name of the destination prefix list for the route table entry.
   *
   * @remarks
   * Either `destination` or `destinationPrefixList` must be specified for the following route entry types:
   * `transitGateway`, `natGateway`, `internetGateway`, `networkInterface`.
   *
   * Cannot be specified for route entry type `networkFirewall`. Use `destination` instead.
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
   * Leave undefined for route entry type `internetGateway`.
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
 * VPC subnet configuration.
 * Used to define a VPC subnet.
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
 * NAT Gateway configuration.
 * Used to define an AWS-managed NAT Gateway.
 */
export class NatGatewayConfig implements t.TypeOf<typeof NetworkConfigTypes.natGatewayConfig> {
  /**
   * A friendly name for the NAT Gateway.
   */
  readonly name = '';
  /**
   * The friendly name of the subnet for the NAT Gateway to be deployed.
   */
  readonly subnet = '';
  /**
   * An array of tag objects for the NAT Gateway.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * Transit Gateway attachment target configuration.
 * Used to define a target account for attachments.
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
 * Transit Gateway attachment options configuration.
 * Used to specify advanced options for the attachment.
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
 * Local Gateway route table configuration.
 * Used to define a Local Gateway route table.
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
 * Local Gateway configuration.
 * Used to define a Local Gateway
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
 * Outpost configuration.
 * Used to define an Outpost.
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
 * Transit Gateway attachment configuration.
 * Used to define a Transit Gateway attachment.
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
  readonly routeTableAssociations: string[] = [];
  /**
   * An array of friendly names of Transit Gateway route tables to propagate the attachment.
   */
  readonly routeTablePropagations: string[] = [];
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
 * VPC gateway endpoint service configuration.
 * Used to define the service and policy for gateway endpoints.
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
 * VPC gateway endpoint configuration.
 * Used to define a gateway endpoints.
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
 * VPC interface endpoint service configuration.
 * Used to define the service and policy for interface endpoints.
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
 * VPC interface endpoint configuration.
 * Used to define interface endpoints for a VPC.
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
 * VPC subnet source configuration.
 * Used to define a subnet as a source in a security group rule.
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
 * Security group source configuration.
 * Used to define a security group as a source in a security group rule.
 */
export class SecurityGroupSourceConfig implements t.TypeOf<typeof NetworkConfigTypes.securityGroupSourceConfig> {
  /**
   * An array of the friendly names of security group rules to reference.
   */
  readonly securityGroups: string[] = [];
}

/**
 * Prefix list source configuration.
 * Used to define a prefix list as a source in a security group rule.
 */
export class PrefixListSourceConfig implements t.TypeOf<typeof NetworkConfigTypes.prefixListSourceConfig> {
  /**
   * An array of the friendly names of prefix lists to reference.
   */
  readonly prefixLists: string[] = [];
}

/**
 * Prefix list configuration.
 * Used to define a custom prefix list.
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
 * Security group rule configuration.
 * Used to define a security group rule.
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
  readonly types = [];
  /**
   * An array of TCP ports to include in the security group rule.
   */
  readonly tcpPorts = [];
  /**
   * An array of UDP ports to include in the security group rule.
   */
  readonly udpPorts = [];
  /**
   * The port to include in the security group rule.
   */
  readonly port = undefined;
  /**
   * The port to start from in the security group rule.
   */
  readonly fromPort = undefined;
  /**
   * The port to end with in the security group rule.
   */
  readonly toPort = undefined;
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
 * Security group configuration.
 * Used to define a security group.
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
 * Network ACL subnet selection configuration.
 * Used to specify a subnet as a source for a network ACL.
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
}

/**
 * Network ACL inbound rule configuration.
 * Used to define an inbound rule for a network ACL.
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
 * Network ACL outbound rule configuration.
 * Used to define an outbound rule for a network ACL.
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
 * Network ACL configuration.
 * Used to define the properties to configure a Network Access Control List (ACL)
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
 * DHCP options configuration.
 * Used to define a custom DHCP options set.
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
 * VPC endpoint policy configuration.
 * Used to define VPC endpoint policies.
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
 * VPC configuration.
 * Used to define a VPC.
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
   * provided if not using `ipamAllocation`.
   *
   * Use CIDR notation, i.e. 10.0.0.0/16
   */
  readonly cidrs: string[] | undefined = undefined;

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
   * A list of Prefix Lists to deploy for this VPC
   *
   * @default undefined
   */
  readonly prefixLists: PrefixListConfig[] | undefined = undefined;

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
   * VPC flog log configuration
   */
  readonly vpcFlowLogs: t.VpcFlowLogsConfig | undefined = undefined;
}

/**
 * VPC templates configuration.
 * Used to define a VPC that is deployed to multiple accounts/OUs.
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
   * An array of IPAM allocation configurations.
   *
   * @see {@link IpamAllocationConfig}
   */
  readonly ipamAllocations: IpamAllocationConfig[] = [];

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
   * A list of Prefix Lists to deploy for this VPC
   *
   * @default undefined
   */
  readonly prefixLists: PrefixListConfig[] | undefined = undefined;

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
   * VPC flog log configuration
   */
  readonly vpcFlowLogs: t.VpcFlowLogsConfig | undefined = undefined;
}

/**
 * Route 53 resolver rule configuration.
 * Used to define resolver rules.
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
 * Route 53 resolver endpoint configuration.
 * Used to define a resolver endpoint.
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
 * Route 53 DNS query logging configuration.
 * Use to define query logging configs.
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
 * Route 53 DNS firewall rule configuration.
 * Used to define DNS firewall rules.
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
 * Route 53 DNS firewall rule group configuration.
 * Used to define a DNS firewall rule group.
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
 * Route 53 resolver configuration.
 * Used to define configurations for Route 53 resolver.
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
 * Network Firewall rule source list configuration.
 * Used to define DNS allow and deny lists for Network Firewall.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-rulessourcelist.html}
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
 * Network Firewall stateful rule header configuration.
 * Used to specify a stateful rule in a header-type format.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-header.html}
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
 * Network Firewall stateful rule options configuration.
 * Use to specify keywords and settings for stateful rules.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-ruleoption.html}
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
 * Network Firewall stateful rule configuration.
 * Use to define stateful rules for Network Firewall.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-statefulrule.html}
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
 * Network Firewall custom actions dimensions.
 * Used to define custom actions to log in CloudWatch metrics.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-dimension.html}
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
 * Network Firewall custom action definition configuration.
 * Used to define custom metrics for Network Firewall.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-actiondefinition.html}
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
 * Network Firewall custom action configuration.
 * Used to define custom actions for Network Firewall.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-customaction.html}
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
 * Network Firewall stateless port range configuration.
 * Used to define a port range in stateless rules.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-portrange.html}
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
 * Network Firewall stateless TCP flags configuration.
 * Used to define TCP flags to inspect in stateless rules.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-tcpflagfield.html}
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
  readonly flags: string[] = [];
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
  readonly masks: string[] = [];
}

/**
 * Network Firewall stateless rule match attributes configuration.
 * Used to define stateless rule match attributes for Network Firewall.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-matchattributes.html}
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
 * Network Firewall stateless rule definition configuration.
 * Used to define a stateless rule definition.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-ruledefinition.html}
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
 * Network Firewall stateless rule configuration.
 * Used to define a stateless rule for Network Firewall.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-statelessrule.html}
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
 * Network Firewall stateless rules and custom metrics configuration.
 * Used to define stateless rules and/or custom metrics for Network Firewall.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-statelessrulesandcustomactions.html}
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
 * Network Firewall rule source configuration.
 * Used to define rules for a Network Firewall.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-rulessource.html}
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
}

/**
 * Network Firewall rule variable definition configuration.
 * Used to define a rule variable definition for Network Firewall.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-rulevariables.html}
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
 * Network Firewall rule variable configuration.
 * Used to define a rule variable for Network Firewall.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-rulevariables.html}
 */
export class NfwRuleVariableConfig implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleVariableConfig> {
  /**
   * A Network Firewall rule variable definition configuration.
   *
   * @see {@link NfwRuleVariableDefinitionConfig}
   */
  readonly ipSets: NfwRuleVariableDefinitionConfig = new NfwRuleVariableDefinitionConfig();
  /**
   * A Network Firewall rule variable definition configuration.
   *
   * @see {@link NfwRuleVariableDefinitionConfig}
   */
  readonly portSets: NfwRuleVariableDefinitionConfig = new NfwRuleVariableDefinitionConfig();
}

/**
 * Network Firewall rule group rule configuration.
 * Used to define rules for a Network Firewall rule group.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-rulegroup-rulegroup.html}
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
 * Network Firewall rule group configuration.
 * Used to define a rule group for Network Firewall.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-networkfirewall-rulegroup.html}
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
 * Network Firewall stateful rule group reference configuration.
 * Used to reference a stateful rule group in a Network Firewall policy.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-firewallpolicy-statefulrulegroupreference.html}
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
 * Network Firewall stateless rule group configuration.
 * Used to reference a stateless rule group in a Network Firewall policy.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-firewallpolicy-statelessrulegroupreference.html}
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
 * Network Firewall policy policy configuration.
 * Used to define the configuration of a Network Firewall policy.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-firewallpolicy-firewallpolicy.html}
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
  readonly statefulDefaultActions: string[] | undefined = undefined;
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
 * Network Firewall policy configuration.
 * Used to define a Network Firewall policy.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-networkfirewall-firewallpolicy.html}
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
 * Network Firewall logging configuration.
 * Used to define logging destinations for Network Firewall.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-networkfirewall-loggingconfiguration-logdestinationconfig.html}
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
 * Network Firewall firewall configuration.
 * Used to define a Network Firewall firewall.
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-networkfirewall-firewall.html}
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
 * Network Firewall configuration.
 * Used to define Network Firewall configurations for the accelerator.
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
 * Gateway Load Balancer endpoint configuration.
 * Use to define Gateway Load Balancer endpoints.
 *
 * @example
 * ```
 * endpoints:
 *   - name: Endpoint-A
 *     account: Network
 *     subnet: Network-Inspection-A
 *     vpc: Network-Inspection
 *   - name: Endpoint-B
 *     account: Network
 *     subnet: Network-Inspection-B
 *     vpc: Network-Inspection
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
   * An optional array of CloudFormation tag objects.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * Central network services configuration.
 * Used to define centralized networking services for the accelerator.
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
 * VPC peering configuration.
 * Used to define VPC peering connections.
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
   *
   * @param values
   * @param configDir
   * @param validateConfig
   */
  constructor(
    values?: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    configDir?: string,
    validateConfig?: boolean,
  ) {
    const errors: string[] = [];
    const ouIdNames: string[] = ['Root'];
    const accountNames: string[] = [];

    const domainLists: { name: string; document: string }[] = [];

    if (values) {
      if (configDir && validateConfig) {
        //
        // Get list of OU ID names from organization config file
        this.getOuIdNames(configDir, ouIdNames);

        //
        // Get list of Account names from account config file
        this.getAccountNames(configDir, accountNames);
        //
        // Prepare Endpoint policy list
        this.prepareEndpointPolicies(values);

        //
        // Prepare Custom domain list
        this.prepareCustomDomainList(values, domainLists);

        // Validate Endpoint policy document file existence
        this.validateEndpointPolicyDocumentFile(configDir, errors);

        // Custom domain lists
        this.validateCustomDomainListDocumentFile(configDir, domainLists, errors);

        //
        // Validate deployment target OUs
        this.validateDeploymentTargetOUs(values, ouIdNames, errors);

        //
        // Validate deployment target accounts
        this.validateDeploymentTargetAccountNames(values, accountNames, errors);

        //
        // Validate VPC configurations
        this.validateVpcConfiguration(values, errors);

        //
        // Validate TGW configurations
        this.validateTgwConfiguration(values, errors);

        //
        // Validate DX gateway configurations
        this.validateDxConfiguration(values, errors);

        //
        // Validate GWLB configuration
        this.validateGwlbConfiguration(values, errors);
      }

      if (errors.length) {
        throw new Error(`${NetworkConfig.FILENAME} has ${errors.length} issues: ${errors.join(' ')}`);
      }

      Object.assign(this, values);
    }
  }

  /**
   * Prepare list of OU ids from organization config file
   * @param configDir
   */
  private getOuIdNames(configDir: string, ouIdNames: string[]) {
    for (const organizationalUnit of OrganizationConfig.load(configDir).organizationalUnits) {
      ouIdNames.push(organizationalUnit.name);
    }
  }

  /**
   * Prepare list of Account names from account config file
   * @param configDir
   */
  private getAccountNames(configDir: string, accountNames: string[]) {
    for (const accountItem of [
      ...AccountsConfig.load(configDir).mandatoryAccounts,
      ...AccountsConfig.load(configDir).workloadAccounts,
    ]) {
      accountNames.push(accountItem.name);
    }
  }

  /**
   * Function to validate existence of Transit Gateway deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   */
  private validateTgwDeploymentTargetOUs(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    ouIdNames: string[],
    errors: string[],
  ) {
    for (const transitGateway of values.transitGateways ?? []) {
      for (const ou of transitGateway.shareTargets?.organizationalUnits ?? []) {
        if (ouIdNames.indexOf(ou) === -1) {
          errors.push(
            `Deployment target OU ${ou} for transit gateways ${transitGateway.name} does not exists in organization-config.yaml file.`,
          );
        }
      }
    }
  }

  /**
   * Function to validate existence of IPAM pool deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   */
  private validateIpamPoolDeploymentTargetOUs(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    ouIdNames: string[],
    errors: string[],
  ) {
    for (const ipam of values.centralNetworkServices?.ipams ?? []) {
      for (const pool of ipam.pools ?? []) {
        for (const ou of pool.shareTargets?.organizationalUnits ?? []) {
          if (ouIdNames.indexOf(ou) === -1) {
            errors.push(
              `Deployment target OU ${ou} for IPAM pool ${pool.name} does not exists in organization-config.yaml file.`,
            );
          }
        }
      }
    }
  }

  /**
   * Function to validate existence of transit deployment target accounts
   * Make sure deployment target accounts are part of account config file
   * @param values
   */
  private validateTgwDeploymentTargetAccounts(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    accountNames: string[],
    errors: string[],
  ) {
    for (const transitGateway of values.transitGateways ?? []) {
      for (const account of transitGateway.shareTargets?.accounts ?? []) {
        if (accountNames.indexOf(account) === -1) {
          errors.push(
            `Deployment target account ${account} for transit gateway ${transitGateway.name} does not exists in accounts-config.yaml file.`,
          );
        }
      }
    }
  }

  /**
   * Function to validate existence of IPAM pool deployment target accounts
   * Make sure deployment target accounts are part of account config file
   * @param values
   */
  private validateIpamPoolDeploymentTargetAccounts(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    accountNames: string[],
    errors: string[],
  ) {
    for (const ipam of values.centralNetworkServices?.ipams ?? []) {
      for (const pool of ipam.pools ?? []) {
        for (const account of pool.shareTargets?.accounts ?? []) {
          if (accountNames.indexOf(account) === -1) {
            errors.push(
              `Deployment target account ${account} for IPAM pool ${pool.name} does not exists in accounts-config.yaml file.`,
            );
          }
        }
      }
    }
  }

  /**
   * Function to validate existence of VPC deployment target accounts
   * Make sure deployment target accounts are part of account config file
   * @param values
   */
  private validateVpcTemplatesDeploymentTargetAccounts(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    accountNames: string[],
    errors: string[],
  ) {
    for (const vpc of values.vpcTemplates ?? []) {
      for (const account of vpc.deploymentTargets?.accounts ?? []) {
        if (accountNames.indexOf(account) === -1) {
          errors.push(
            `Deployment target account ${account} for VPC template ${vpc.name} does not exist in accounts-config.yaml file.`,
          );
        }
      }
    }
  }

  /**
   * Function to validate existence of VPC deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   */
  private validateVpcTemplatesDeploymentTargetOUs(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    ouIdNames: string[],
    errors: string[],
  ) {
    for (const vpc of values.vpcTemplates ?? []) {
      for (const ou of vpc.deploymentTargets?.organizationalUnits ?? []) {
        if (ouIdNames.indexOf(ou) === -1) {
          errors.push(
            `Deployment target OU ${ou} for VPC template ${vpc.name} does not exist in organization-config.yaml file.`,
          );
        }
      }
    }
  }

  /**
   * Function to validate existence of GWLB deployment target accounts
   * Make sure deployment target accounts are part of account config file
   * @param values
   */
  private validateGwlbDeploymentTargetAccounts(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    accountNames: string[],
    errors: string[],
  ) {
    for (const gwlb of values.centralNetworkServices?.gatewayLoadBalancers ?? []) {
      for (const endpoint of gwlb.endpoints ?? []) {
        if (accountNames.indexOf(endpoint.account) === -1) {
          errors.push(
            `Deployment target account ${endpoint.account} for Gateway Load Balancer ${gwlb.name} endpoint ${endpoint.name} does not exist in accounts-config.yaml file.`,
          );
        }
      }
    }
  }

  /**
   * Function to validate Deployment targets OU name for network services
   * @param values
   */
  private validateDeploymentTargetOUs(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    ouIdNames: string[],
    errors: string[],
  ) {
    this.validateTgwDeploymentTargetOUs(values, ouIdNames, errors);
    this.validateIpamPoolDeploymentTargetOUs(values, ouIdNames, errors);
    this.validateVpcTemplatesDeploymentTargetOUs(values, ouIdNames, errors);
  }

  /**
   * Function to validate Deployment targets account name for network services
   * @param values
   */
  private validateDeploymentTargetAccountNames(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    accountNames: string[],
    errors: string[],
  ) {
    this.validateTgwDeploymentTargetAccounts(values, accountNames, errors);
    this.validateIpamPoolDeploymentTargetAccounts(values, accountNames, errors);
    this.validateVpcTemplatesDeploymentTargetAccounts(values, accountNames, errors);
    this.validateGwlbDeploymentTargetAccounts(values, accountNames, errors);
  }

  /**
   * Function to prepare Endpoint policies
   * @param values
   */
  private prepareEndpointPolicies(values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>) {
    for (const policy of values.endpointPolicies ?? []) {
      this.endpointPolicies.push(policy);
    }
  }

  /**
   * Function to prepare custom domain list
   * @param values
   */
  private prepareCustomDomainList(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    domainLists: { name: string; document: string }[],
  ) {
    for (const ruleGroup of values.centralNetworkServices?.route53Resolver?.firewallRuleGroups ?? []) {
      for (const rule of ruleGroup.rules) {
        if (rule.customDomainList) {
          domainLists.push({ name: rule.name, document: rule.customDomainList });
        }
      }
    }
  }

  /**
   * Function to validate Endpoint policy document file existence
   * @param configDir
   */
  private validateEndpointPolicyDocumentFile(configDir: string, errors: string[]) {
    for (const policy of this.endpointPolicies) {
      if (!fs.existsSync(path.join(configDir, policy.document))) {
        errors.push(`Endpoint policy ${policy.name} document file ${policy.document} not found!`);
      }
    }
  }

  /**
   * Function to validate custom domain list document file existence
   * @param configDir
   */
  private validateCustomDomainListDocumentFile(
    configDir: string,
    domainLists: { name: string; document: string }[],
    errors: string[],
  ) {
    for (const list of domainLists) {
      if (!fs.existsSync(path.join(configDir, list.document))) {
        errors.push(`DNS firewall custom domain list ${list.name} document file ${list.document} not found!`);
      }
    }
  }

  /**
   * Function to validate conditional dependencies for VPC configurations.
   * @param values
   */
  private validateVpcConfiguration(values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>, errors: string[]) {
    for (const vpcItem of [...values.vpcs, ...(values.vpcTemplates ?? [])] ?? []) {
      for (const routeTableItem of vpcItem.routeTables ?? []) {
        // Throw error if gateway association exists but no internet gateway
        if (routeTableItem.gatewayAssociation === 'internetGateway' && !vpcItem.internetGateway) {
          errors.push(
            `[Route table ${routeTableItem.name} for VPC ${vpcItem.name}]: attempting to configure a gateway association with no IGW attached to the VPC!`,
          );
        }
        // Validate route entries
        this.validateRouteTableEntries(routeTableItem, vpcItem, values, errors);
      }
      // Validate the VPC doesn't have a static CIDR and IPAM defined
      if (NetworkConfigTypes.vpcConfig.is(vpcItem) && vpcItem.cidrs && vpcItem.ipamAllocations) {
        errors.push(`[VPC ${vpcItem.name}]: Both a CIDR and IPAM allocation are defined. Please choose only one`);
      }
      // Validate IPAM allocations
      this.validateIpamAllocations(vpcItem, values, errors);
    }
  }

  /**
   * Validate route table entries
   * @param routeTableItem
   */
  private validateRouteTableEntries(
    routeTableItem: t.TypeOf<typeof NetworkConfigTypes.routeTableConfig>,
    vpcItem: t.TypeOf<typeof NetworkConfigTypes.vpcConfig> | t.TypeOf<typeof NetworkConfigTypes.vpcTemplatesConfig>,
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    errors: string[],
  ) {
    for (const routeTableEntryItem of routeTableItem.routes ?? []) {
      // Validate destination exists
      if (routeTableEntryItem.type && routeTableEntryItem.type !== 'gatewayEndpoint') {
        this.validateRouteEntryDestination(routeTableEntryItem, routeTableItem.name, vpcItem.name, values, errors);
      }

      // Validate IGW route
      if (routeTableEntryItem.type && routeTableEntryItem.type === 'internetGateway') {
        this.validateIgwRouteEntry(routeTableEntryItem, routeTableItem.name, vpcItem, errors);
      }

      // Validate target exists
      if (
        routeTableEntryItem.type &&
        ['gatewayLoadBalancerEndpoint', 'natGateway', 'networkFirewall', 'transitGateway'].includes(
          routeTableEntryItem.type,
        )
      ) {
        this.validateRouteEntryTarget(routeTableEntryItem, routeTableItem.name, vpcItem, values, errors);
      }
    }
  }

  /**
   * Validate route entries have a valid destination configured
   * @param routeTableEntryItem
   * @param routeTableName
   * @param vpcName
   */
  private validateRouteEntryDestination(
    routeTableEntryItem: t.TypeOf<typeof NetworkConfigTypes.routeTableEntryConfig>,
    routeTableName: string,
    vpcName: string,
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    errors: string[],
  ) {
    if (routeTableEntryItem.destinationPrefixList) {
      // Check if a CIDR destination is also defined
      if (routeTableEntryItem.destination) {
        errors.push(
          `[Route table ${routeTableName} for VPC ${vpcName}]: route entry ${routeTableEntryItem.name} using destination and destinationPrefixList. Please choose only one destination type`,
        );
      }

      // Throw error if network firewall or GWLB are the target
      if (['networkFirewall', 'gatewayLoadBalancerEndpoint'].includes(routeTableEntryItem.type!)) {
        errors.push(
          `[Route table ${routeTableName} for VPC ${vpcName}]: route entry ${routeTableEntryItem.name} with type ${routeTableEntryItem.type} does not support destinationPrefixList`,
        );
      }

      // Throw error if prefix list doesn't exist
      if (!values.prefixLists?.find(item => item.name === routeTableEntryItem.destinationPrefixList)) {
        errors.push(
          `[Route table ${routeTableName} for VPC ${vpcName}]: route entry ${routeTableEntryItem.name} destinationPrefixList ${routeTableEntryItem.destinationPrefixList} does not exist`,
        );
      }
    } else {
      if (!routeTableEntryItem.destination) {
        errors.push(
          `[Route table ${routeTableName} for VPC ${vpcName}]: route entry ${routeTableEntryItem.name} does not have a destination defined`,
        );
      }
    }
  }

  /**
   * Validate IGW routes are associated with a VPC with an IGW attached
   * @param routeTableEntryItem
   * @param routeTableName
   * @param vpcItem
   */
  private validateIgwRouteEntry(
    routeTableEntryItem: t.TypeOf<typeof NetworkConfigTypes.routeTableEntryConfig>,
    routeTableName: string,
    vpcItem: t.TypeOf<typeof NetworkConfigTypes.vpcConfig> | t.TypeOf<typeof NetworkConfigTypes.vpcTemplatesConfig>,
    errors: string[],
  ) {
    if (!vpcItem.internetGateway) {
      errors.push(
        `[Route table ${routeTableName} for VPC ${vpcItem.name}]: route entry ${routeTableEntryItem.name} is targeting an IGW, but now IGW is attached to the VPC`,
      );
    }
  }

  /**
   * Validate route table entries have a valid target configured
   * @param routeTableEntryItem
   * @param routeTableName
   * @param vpcItem
   * @param values
   */
  private validateRouteEntryTarget(
    routeTableEntryItem: t.TypeOf<typeof NetworkConfigTypes.routeTableEntryConfig>,
    routeTableName: string,
    vpcItem: t.TypeOf<typeof NetworkConfigTypes.vpcConfig> | t.TypeOf<typeof NetworkConfigTypes.vpcTemplatesConfig>,
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    errors: string[],
  ) {
    const gwlbs = values.centralNetworkServices?.gatewayLoadBalancers;
    const networkFirewalls = values.centralNetworkServices?.networkFirewall?.firewalls;
    const tgws = values.transitGateways;
    const vpcs = [...values.vpcs, ...(values.vpcTemplates ?? [])];

    // Throw error if no target defined
    if (!routeTableEntryItem.target) {
      errors.push(
        `[Route table ${routeTableName} for VPC ${vpcItem.name}]: route entry ${routeTableEntryItem.name} of type ${routeTableEntryItem.type} must include a target`,
      );
    }

    // Throw error if GWLB endpoint doesn't exist
    if (
      routeTableEntryItem.type === 'gatewayLoadBalancerEndpoint' &&
      !gwlbs?.find(item => item.endpoints.find(endpoint => endpoint.name === routeTableEntryItem.target))
    ) {
      errors.push(
        `[Route table ${routeTableName} for VPC ${vpcItem.name}]: route entry ${routeTableEntryItem.name} target ${routeTableEntryItem.target} does not exist`,
      );
    }

    // Throw error if network firewall endpoint doesn't exist
    if (
      routeTableEntryItem.type === 'networkFirewall' &&
      !networkFirewalls?.find(item => item.name === routeTableEntryItem.target)
    ) {
      errors.push(
        `[Route table ${routeTableName} for VPC ${vpcItem.name}]: route entry ${routeTableEntryItem.name} target ${routeTableEntryItem.target} does not exist`,
      );
    }

    // Throw error if network firewall target AZ doesn't exist
    if (routeTableEntryItem.type === 'networkFirewall' && !routeTableEntryItem.targetAvailabilityZone) {
      errors.push(
        `[Route table ${routeTableName} for VPC ${vpcItem.name}]: route entry ${routeTableEntryItem.name} with type networkFirewall must include targetAvailabilityZone`,
      );
    }

    // Throw error if NAT gateway doesn't exist
    if (
      routeTableEntryItem.type === 'natGateway' &&
      !vpcs.find(item => item.natGateways?.find(nat => nat.name === routeTableEntryItem.target))
    ) {
      errors.push(
        `[Route table ${routeTableName} for VPC ${vpcItem.name}]: route entry ${routeTableEntryItem.name} target ${routeTableEntryItem.target} does not exist`,
      );
    }

    // Throw error if transit gateway doesn't exist
    if (routeTableEntryItem.type === 'transitGateway' && !tgws.find(item => item.name === routeTableEntryItem.target)) {
      errors.push(
        `[Route table ${routeTableName} for VPC ${vpcItem.name}]: route entry ${routeTableEntryItem.name} target ${routeTableEntryItem.target} does not exist`,
      );
    }
  }

  /**
   * Function to validate conditional dependencies for TGW configurations
   * @param values
   */
  private validateTgwConfiguration(values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>, errors: string[]) {
    for (const tgw of values.transitGateways ?? []) {
      for (const routeTable of tgw.routeTables ?? []) {
        this.validateTgwStaticRouteEntries(values, tgw, routeTable, errors);
      }
    }
  }

  private validateIpamAllocations(
    vpcItem: t.TypeOf<typeof NetworkConfigTypes.vpcConfig> | t.TypeOf<typeof NetworkConfigTypes.vpcTemplatesConfig>,
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    errors: string[],
  ) {
    const ipams = values.centralNetworkServices?.ipams;
    // Check if targeted IPAM exists
    for (const alloc of vpcItem.ipamAllocations ?? []) {
      if (!ipams?.find(ipam => ipam.pools?.find(pool => pool.name === alloc.ipamPoolName))) {
        errors.push(`[VPC ${vpcItem.name}]: target IPAM pool ${alloc.ipamPoolName} is not defined`);
      }
    }
    for (const subnet of vpcItem.subnets ?? []) {
      // Check if allocation is created for VPC
      if (
        subnet.ipamAllocation &&
        !vpcItem.ipamAllocations?.find(alloc => alloc.ipamPoolName === subnet.ipamAllocation!.ipamPoolName)
      ) {
        errors.push(
          `[VPC ${vpcItem.name} subnet ${subnet.name}]: target IPAM pool ${
            subnet.ipamAllocation!.ipamPoolName
          } is not a source pool of the VPC`,
        );
      }
      // Check if targeted IPAM pool exists
      if (
        subnet.ipamAllocation &&
        !ipams?.find(ipam => ipam.pools?.find(pool => pool.name === subnet.ipamAllocation!.ipamPoolName))
      ) {
        errors.push(
          `[VPC ${vpcItem.name} subnet ${subnet.name}]: target IPAM pool ${
            subnet.ipamAllocation!.ipamPoolName
          } is not defined`,
        );
      }
    }
  }

  /**
   * Function to validate TGW route table entries
   */
  private validateTgwStaticRouteEntries(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    tgw: t.TypeOf<typeof NetworkConfigTypes.transitGatewayConfig>,
    routeTable: t.TypeOf<typeof NetworkConfigTypes.transitGatewayRouteTableConfig>,
    errors: string[],
  ) {
    for (const entry of routeTable.routes ?? []) {
      // Catch error if an attachment and blackhole are both defined
      if (entry.attachment && entry.blackhole) {
        errors.push(
          `[Transit Gateway route table ${routeTable.name}]: cannot define both an attachment and blackhole target`,
        );
      }
      // Catch error if destination CIDR and prefix list are both defined
      if (entry.destinationCidrBlock && entry.destinationPrefixList) {
        errors.push(
          `[Transit Gateway route table ${routeTable.name}]: cannot define both a destination CIDR and destination prefix list`,
        );
      }
      // Validate VPC attachment routes
      this.validateVpcStaticRouteEntry(values, routeTable.name, entry, errors);

      // Validate DX Gateway routes
      this.validateDxGatewayStaticRouteEntry(values, routeTable.name, tgw, entry, errors);
    }
  }

  /**
   * Function to validate transit gateway static route entries for VPC attachments
   * @param values
   * @param routeTableName
   * @param entry
   */
  private validateVpcStaticRouteEntry(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    routeTableName: string,
    entry: t.TypeOf<typeof NetworkConfigTypes.transitGatewayRouteEntryConfig>,
    errors: string[],
  ) {
    if (entry.attachment && NetworkConfigTypes.transitGatewayRouteTableVpcEntryConfig.is(entry.attachment)) {
      const vpcs = [...values.vpcs, ...(values.vpcTemplates ?? [])];
      const vpcAttachment = entry.attachment as TransitGatewayRouteTableVpcEntryConfig;
      const vpc = vpcs.find(item => item.name === vpcAttachment.vpcName);
      if (!vpc) {
        errors.push(`[Transit Gateway route table ${routeTableName}]: cannot find VPC ${vpcAttachment.vpcName}`);
      }
    }
  }

  /**
   * Function to validate transit gateway static route entries for DX attachments
   * @param values
   * @param routeTableName
   * @param entry
   */
  private validateDxGatewayStaticRouteEntry(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    routeTableName: string,
    tgw: t.TypeOf<typeof NetworkConfigTypes.transitGatewayConfig>,
    entry: t.TypeOf<typeof NetworkConfigTypes.transitGatewayRouteEntryConfig>,
    errors: string[],
  ) {
    if (entry.attachment && NetworkConfigTypes.transitGatewayRouteTableDxGatewayEntryConfig.is(entry.attachment)) {
      const dxgws = [...(values.directConnectGateways ?? [])];
      const dxAttachment = entry.attachment as TransitGatewayRouteTableDxGatewayEntryConfig;
      const dxgw = dxgws.find(item => item.name === dxAttachment.directConnectGatewayName);
      // Catch error if DXGW doesn't exist
      if (!dxgw) {
        errors.push(
          `[Transit Gateway route table ${routeTableName}]: cannot find DX Gateway ${dxAttachment.directConnectGatewayName}`,
        );
      }
      if (dxgw) {
        // Catch error if DXGW is not in the same account as the TGW
        if (dxgw!.account !== tgw.account) {
          errors.push(
            `[Transit Gateway route table ${routeTableName}]: cannot add route entry for DX Gateway ${dxAttachment.directConnectGatewayName}. DX Gateway and TGW ${tgw.name} reside in separate accounts`,
          );
        }
        // Catch error if there is no association with the TGW
        if (!dxgw.transitGatewayAssociations || !dxgw.transitGatewayAssociations.find(item => item.name === tgw.name)) {
          errors.push(
            `[Transit Gateway route table ${routeTableName}]: cannot add route entry for DX Gateway ${dxAttachment.directConnectGatewayName}. DX Gateway and TGW ${tgw.name} are not associated`,
          );
        }
      }
    }
  }

  /**
   * Function to validate DX gateway configurations.
   * @param values
   */
  private validateDxConfiguration(values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>, errors: string[]) {
    for (const dxgw of values.directConnectGateways ?? []) {
      // Validate virtual interfaces
      this.validateDxVirtualInterfaces(dxgw, errors);
      // Validate transit gateway attachments
      this.validateDxTransitGatewayAssociations(values, dxgw, errors);
    }
  }

  /**
   * Function to validate DX virtual interface configurations.
   * @param dxgw
   */
  private validateDxVirtualInterfaces(dxgw: t.TypeOf<typeof NetworkConfigTypes.dxGatewayConfig>, errors: string[]) {
    for (const vif of dxgw.virtualInterfaces ?? []) {
      // Catch error for private VIFs with transit gateway associations
      if (vif.type === 'private' && dxgw.transitGatewayAssociations) {
        errors.push(
          `[Direct Connect Gateway ${dxgw.name}]: cannot specify private virtual interface ${vif.name} with transit gateway associations`,
        );
      }
      // Catch error if ASNs match
      if (dxgw.asn === vif.customerAsn) {
        errors.push(`[Direct Connect Gateway ${dxgw.name}]: Amazon ASN and customer ASN match for ${vif.name}`);
      }
      // Catch error if ASN is not in the correct range
      if (vif.customerAsn < 1 || vif.customerAsn > 2147483647) {
        errors.push(
          `[Direct Connect Gateway ${dxgw.name}]: ASN ${vif.customerAsn} out of range 1-2147483647 for virtual interface ${vif.name}`,
        );
      }
      // Catch error if VIF VLAN is not in range
      if (vif.vlan < 1 || vif.vlan > 4094) {
        errors.push(
          `[Direct Connect Gateway ${dxgw.name}]: VLAN ${vif.vlan} out of range 1-4094 for virtual interface ${vif.name}`,
        );
      }
      // Validate peer IP addresses
      this.validateDxVirtualInterfaceAddresses(dxgw, vif, errors);
    }
  }

  /**
   * Function to validate peer IP addresses for virtual interfaces.
   * @param dxgw
   * @param vif
   */
  private validateDxVirtualInterfaceAddresses(
    dxgw: t.TypeOf<typeof NetworkConfigTypes.dxGatewayConfig>,
    vif: t.TypeOf<typeof NetworkConfigTypes.dxVirtualInterfaceConfig>,
    errors: string[],
  ) {
    // Catch error if one peer IP is defined and not the other
    if (vif.amazonAddress && !vif.customerAddress) {
      errors.push(
        `[Direct Connect Gateway ${dxgw.name}]: Amazon peer IP defined but customer peer IP undefined for ${vif.name}`,
      );
    }
    if (!vif.amazonAddress && vif.customerAddress) {
      errors.push(
        `[Direct Connect Gateway ${dxgw.name}]: Customer peer IP defined but Amazon peer IP undefined for ${vif.name}`,
      );
    }
    // Catch error if addresses match
    if (vif.amazonAddress && vif.customerAddress) {
      if (vif.amazonAddress === vif.customerAddress) {
        errors.push(`[Direct Connect Gateway ${dxgw.name}]: Amazon peer IP and customer peer IP match for ${vif.name}`);
      }
    }
  }

  /**
   * Function to validate DX gateway transit gateway assocations.
   * @param values
   * @param dxgw
   */
  private validateDxTransitGatewayAssociations(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    dxgw: t.TypeOf<typeof NetworkConfigTypes.dxGatewayConfig>,
    errors: string[],
  ) {
    for (const tgwAssociation of dxgw.transitGatewayAssociations ?? []) {
      const tgw = values.transitGateways.find(
        item => item.name === tgwAssociation.name && item.account === tgwAssociation.account,
      );
      // Catch error if TGW isn't found
      if (!tgw) {
        errors.push(
          `[Direct Connect Gateway ${dxgw.name}]: cannot find matching transit gateway for TGW association ${tgwAssociation.name}`,
        );
      }
      // Catch error if ASNs match
      if (tgw!.asn === dxgw.asn) {
        errors.push(`[Direct Connect Gateway ${dxgw.name}]: DX Gateway ASN and TGW ASN match for ${tgw!.name}`);
      }
      // Catch error if TGW and DXGW account don't match and associations/propagations are configured
      if (tgw!.account !== dxgw.account) {
        if (tgwAssociation.routeTableAssociations || tgwAssociation.routeTablePropagations) {
          errors.push(
            `[Direct Connect Gateway ${dxgw.name}]: DX Gateway association proposals cannot have TGW route table associations or propagations defined`,
          );
        }
      }
    }
  }

  /**
   * Validate Gateway Load Balancer configuration
   * @param values
   */
  private validateGwlbConfiguration(values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>, errors: string[]) {
    const vpcs = [...values.vpcs, ...(values.vpcTemplates ?? [])];
    for (const gwlb of values.centralNetworkServices?.gatewayLoadBalancers ?? []) {
      const vpc = vpcs.find(item => item.name === gwlb.vpc);
      if (!vpc) {
        errors.push(`[Gateway Load Balancer ${gwlb.name}]: VPC ${gwlb.vpc} does not exist`);
      }

      // Validate subnets
      for (const gwlbSubnet of gwlb.subnets ?? []) {
        if (vpc && !vpc.subnets?.find(subnet => subnet.name === gwlbSubnet)) {
          errors.push(`[Gateway Load Balancer ${gwlb.name}]: subnet ${gwlbSubnet} does not exist in VPC ${vpc!.name}`);
        }
      }

      // Validate endpoints
      this.validateGwlbEndpoints(gwlb, values, errors);
    }
  }

  /**
   * Validate Gateway Load Balancer endpoint configuration
   * @param gwlb
   * @param values
   */
  private validateGwlbEndpoints(
    gwlb: t.TypeOf<typeof NetworkConfigTypes.gwlbConfig>,
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    errors: string[],
  ) {
    const vpcs = [...values.vpcs, ...(values.vpcTemplates ?? [])];
    for (const gwlbEndpoint of gwlb.endpoints ?? []) {
      const vpc = vpcs.find(item => item.name === gwlbEndpoint.vpc);
      if (!vpc) {
        errors.push(
          `[Gateway Load Balancer ${gwlb.name} endpoint ${gwlbEndpoint.name}]: VPC ${gwlbEndpoint.vpc} does not exist`,
        );
      }

      // Validate subnet
      if (vpc && !vpc.subnets?.find(subnet => subnet.name === gwlbEndpoint.subnet)) {
        errors.push(
          `[Gateway Load Balancer ${gwlb.name} endpoint ${gwlbEndpoint.name}]: subnet ${gwlbEndpoint.subnet} does not exist in VPC ${vpc.name}`,
        );
      }
    }
  }

  /**
   *
   * @param dir
   * @param validateConfig
   * @returns
   */
  static load(dir: string, validateConfig?: boolean): NetworkConfig {
    const buffer = fs.readFileSync(path.join(dir, NetworkConfig.FILENAME), 'utf8');
    const values = t.parse(NetworkConfigTypes.networkConfig, yaml.load(buffer));
    return new NetworkConfig(values, dir, validateConfig);
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
      console.log('[network-config] Error parsing input, global config undefined');
      console.log(`${e}`);
      return undefined;
    }
  }
}
