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

import * as t from './common-types';

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

  static readonly transitGatewayRouteEntryConfig = t.interface({
    destinationCidrBlock: t.optional(t.nonEmptyString),
    destinationPrefixList: t.optional(t.nonEmptyString),
    blackhole: t.optional(t.boolean),
    attachment: t.optional(this.transitGatewayRouteTableVpcEntryConfig),
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

  static readonly ipamScopeConfig = t.interface({
    name: t.nonEmptyString,
    description: t.optional(t.nonEmptyString),
    tags: t.optional(t.array(t.tag)),
  });

  static readonly ipVersionEnum = t.enums('IpVersionType', ['ipv4', 'ipv6']);

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
      'gatewayEndpoint',
      'networkInterface',
      'networkFirewall',
    ],
    'Value should be a route table target type',
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
    routes: t.optional(t.array(this.routeTableEntryConfig)),
    tags: t.optional(t.array(t.tag)),
  });

  static readonly ipamAllocationConfig = t.interface({
    ipamPoolName: t.nonEmptyString,
    netmaskLength: t.number,
  });

  static readonly subnetConfig = t.interface({
    name: t.nonEmptyString,
    availabilityZone: t.nonEmptyString,
    routeTable: t.nonEmptyString,
    ipv4CidrBlock: t.optional(t.nonEmptyString),
    mapPublicIpOnLaunch: t.optional(t.boolean),
    ipamAllocation: t.optional(this.ipamAllocationConfig),
    shareTargets: t.optional(t.shareTargets),
    tags: t.optional(t.array(t.tag)),
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
  });

  static readonly trafficTypeEnum = t.enums(
    'Flow LogTrafficType',
    ['ALL', 'ACCEPT', 'REJECT'],
    'Value should be a flow log traffic type',
  );

  static readonly logDestinationTypeEnum = t.enums(
    'LogDestinationTypes',
    ['s3', 'cloud-watch-logs'],
    'Value should be a log destination type',
  );

  static readonly vpcFlowLogsConfig = t.interface({
    trafficType: this.trafficTypeEnum,
    maxAggregationInterval: t.number,
    destinations: t.array(this.logDestinationTypeEnum),
    defaultFormat: t.boolean,
    customFields: t.optional(t.array(t.nonEmptyString)),
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
    destinations: t.array(this.logDestinationTypeEnum),
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
    flags: t.array(t.nonEmptyString),
    masks: t.optional(t.array(t.nonEmptyString)),
  });

  static readonly nfwRuleSourceStatelessMatchAttributesConfig = t.interface({
    destinationPorts: t.array(this.nfwRuleSourceStatelessPortRangeConfig),
    destinations: t.array(t.nonEmptyString),
    protocols: t.array(t.number),
    sourcePorts: t.array(this.nfwRuleSourceStatelessPortRangeConfig),
    sources: t.array(t.nonEmptyString),
    tcpFlags: t.array(this.nfwRuleSourceStatelessTcpFlagsConfig),
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
    destination: this.logDestinationTypeEnum,
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

  static readonly centralNetworkServicesConfig = t.interface({
    delegatedAdminAccount: t.nonEmptyString,
    ipams: t.optional(t.array(this.ipamConfig)),
    route53Resolver: t.optional(this.resolverConfig),
    networkFirewall: t.optional(this.nfwConfig),
  });

  static readonly vpcPeeringConfig = t.interface({
    name: t.nonEmptyString,
    vpcs: t.array(t.nonEmptyString),
    tags: t.optional(t.array(t.tag)),
  });

  static readonly networkConfig = t.interface({
    defaultVpc: this.defaultVpcsConfig,
    endpointPolicies: t.array(this.endpointPolicyConfig),
    transitGateways: t.array(this.transitGatewayConfig),
    vpcs: t.array(this.vpcConfig),
    vpcFlowLogs: this.vpcFlowLogsConfig,
    centralNetworkServices: t.optional(this.centralNetworkServicesConfig),
    dhcpOptions: t.optional(t.array(this.dhcpOptsConfig)),
    vpcPeering: t.optional(t.array(this.vpcPeeringConfig)),
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
   * A Transit Gateway VPC entry configuration.
   * Leave undefined if specifying a blackhole destination.
   *
   * @see {@link TransitGatewayRouteTableVpcEntryConfig}
   */
  readonly attachment: TransitGatewayRouteTableVpcEntryConfig | undefined = undefined;
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
 */
export class RouteTableConfig implements t.TypeOf<typeof NetworkConfigTypes.routeTableConfig> {
  /**
   * A friendly name for the VPC route table.
   */
  readonly name = '';
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
}

/**
 * VPC flow logs configuration.
 * Used to customize VPC flow log output.
 */
export class VpcFlowLogsConfig implements t.TypeOf<typeof NetworkConfigTypes.vpcFlowLogsConfig> {
  /**
   * The type of traffic to log.
   *
   * @see {@link NetworkConfigTypes.trafficTypeEnum}
   */
  readonly trafficType = 'ALL';
  /**
   * The maximum log aggregation interval in days.
   */
  readonly maxAggregationInterval: number = 600;
  /**
   * An array of destination serviced for storing logs.
   *
   * @see {@link NetworkConfigTypes.logDestinationTypeEnum}
   */
  readonly destinations: t.TypeOf<typeof NetworkConfigTypes.logDestinationTypeEnum>[] = ['s3', 'cloud-watch-logs'];
  /**
   * Enable to use the default log format for flow logs.
   */
  readonly defaultFormat = false;
  /**
   * Custom fields to include in flow log outputs.
   */
  readonly customFields = [
    'version',
    'account-id',
    'interface-id',
    'srcaddr',
    'dstaddr',
    'srcport',
    'dstport',
    'protocol',
    'packets',
    'bytes',
    'start',
    'end',
    'action',
    'log-status',
    'vpc-id',
    'subnet-id',
    'instance-id',
    'tcp-flags',
    'type',
    'pkt-srcaddr',
    'pkt-dstaddr',
    'region',
    'az-id',
    'pkt-src-aws-service',
    'pkt-dst-aws-service',
    'flow-direction',
    'traffic-path',
  ];
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
  readonly destinations: t.TypeOf<typeof NetworkConfigTypes.logDestinationTypeEnum>[] = ['s3'];
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
  readonly masks: string[] | undefined = undefined;
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
  readonly destinationPorts: NfwRuleSourceStatelessPortRangeConfig[] = [new NfwRuleSourceStatelessPortRangeConfig()];
  /**
   * An array of destination CIDR ranges.
   *
   * @remarks
   * Use CIDR notation, i.e. 10.0.0.0/16
   */
  readonly destinations: string[] = [];
  /**
   * An array of IP protocol numbers to inspect.
   */
  readonly protocols: number[] = [];
  /**
   * An array of Network Firewall stateless port range configurations.
   *
   * @see {@link NfwRuleSourceStatelessPortRangeConfig}
   */
  readonly sourcePorts: NfwRuleSourceStatelessPortRangeConfig[] = [new NfwRuleSourceStatelessPortRangeConfig()];
  /**
   * An array of source CIDR ranges.
   *
   * @remarks
   * Use CIDR notation, i.e. 10.0.0.0/16
   */
  readonly sources: string[] = [];
  /**
   * An array of Network Firewall stateless TCP flag configurations.
   *
   * @see {@link NfwRuleSourceStatelessTcpFlagsConfig}
   */
  readonly tcpFlags: NfwRuleSourceStatelessTcpFlagsConfig[] = [new NfwRuleSourceStatelessTcpFlagsConfig()];
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
   * @see {@link NetworkConfigTypes.logDestinationTypeEnum}
   */
  readonly destination: t.TypeOf<typeof NetworkConfigTypes.logDestinationTypeEnum> = 's3';
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
 * Central network services configuration.
 * Used to define centralized networking services for the accelerator.
 */
export class CentralNetworkServicesConfig implements t.TypeOf<typeof NetworkConfigTypes.centralNetworkServicesConfig> {
  /**
   * The friendly name of the delegated administrator account for network services.
   */
  readonly delegatedAdminAccount: string = '';
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
   * @see {@link VpcFlowLogsConfig}
   */
  readonly vpcFlowLogs: VpcFlowLogsConfig = new VpcFlowLogsConfig();

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
   *
   * @param values
   */
  constructor(values?: t.TypeOf<typeof NetworkConfigTypes.networkConfig>, configDir?: string) {
    //
    // Validation errors
    //
    const errors: string[] = [];

    if (values) {
      //
      // Endpoint policy validation
      //
      const endpointPolicies: { name: string; document: string }[] = [];
      for (const policy of values.endpointPolicies ?? []) {
        endpointPolicies.push(policy);
      }

      //
      // DNS firewall custom domain list validation
      //
      const domainLists: { name: string; document: string }[] = [];
      for (const ruleGroup of values.centralNetworkServices?.route53Resolver?.firewallRuleGroups ?? []) {
        for (const rule of ruleGroup.rules) {
          if (rule.customDomainList) {
            domainLists.push({ name: rule.name, document: rule.customDomainList });
          }
        }
      }

      //
      // Validate documents exist
      //
      if (configDir) {
        // Endpoint policies
        for (const policy of endpointPolicies) {
          if (!fs.existsSync(path.join(configDir, policy.document))) {
            errors.push(`Endpoint policy ${policy.name} document file ${policy.document} not found!`);
          }
        }

        // Custom domain lists
        for (const list of domainLists) {
          if (!fs.existsSync(path.join(configDir, list.document))) {
            errors.push(`DNS firewall custom domain list ${list.name} document file ${list.document} not found!`);
          }
        }
      }

      if (errors.length) {
        throw new Error(`${NetworkConfig.FILENAME} has ${errors.length} issues: ${errors.join(' ')}`);
      }

      Object.assign(this, values);
    }
  }

  /**
   *
   * @param dir
   * @returns
   */
  static load(dir: string): NetworkConfig {
    const buffer = fs.readFileSync(path.join(dir, NetworkConfig.FILENAME), 'utf8');
    const values = t.parse(NetworkConfigTypes.networkConfig, yaml.load(buffer));
    return new NetworkConfig(values, dir);
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
