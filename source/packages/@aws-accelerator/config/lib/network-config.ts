/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
 * Configuration items.
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
    destinationCidrBlock: t.nonEmptyString,
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
    type: t.optional(this.routeTableEntryTypeEnum),
    target: t.nonEmptyString,
    targetAvailabilityZone: t.optional(t.nonEmptyString),
  });

  static readonly routeTableConfig = t.interface({
    name: t.nonEmptyString,
    routes: t.optional(t.array(this.routeTableEntryConfig)),
    tags: t.optional(t.array(t.tag)),
  });

  static readonly subnetConfig = t.interface({
    name: t.nonEmptyString,
    availabilityZone: t.nonEmptyString,
    routeTable: t.nonEmptyString,
    ipv4CidrBlock: t.nonEmptyString,
    mapPublicIpOnLaunch: t.optional(t.boolean),
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

  static readonly transitGatewayAttachmentConfig = t.interface({
    name: t.nonEmptyString,
    transitGateway: this.transitGatewayAttachmentTargetConfig,
    subnets: t.array(t.nonEmptyString),
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

  static readonly interfaceEndpointConfig = t.interface({
    central: t.optional(t.boolean),
    allowedCidrs: t.optional(t.array(t.nonEmptyString)),
    subnets: t.array(t.nonEmptyString),
    endpoints: t.array(t.nonEmptyString),
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

  static readonly vpcConfig = t.interface({
    name: t.nonEmptyString,
    account: t.nonEmptyString,
    region: t.region,
    cidrs: t.array(t.nonEmptyString),
    dhcpOptions: t.optional(t.nonEmptyString),
    dnsFirewallRuleGroups: t.optional(t.array(this.vpcDnsFirewallAssociationConfig)),
    enableDnsHostnames: t.optional(t.boolean),
    enableDnsSupport: t.optional(t.boolean),
    gatewayEndpoints: t.optional(t.array(this.gatewayEndpointEnum)),
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
    transitGateways: t.array(this.transitGatewayConfig),
    vpcs: t.array(this.vpcConfig),
    vpcFlowLogs: this.vpcFlowLogsConfig,
    centralNetworkServices: t.optional(this.centralNetworkServicesConfig),
    dhcpOptions: t.optional(t.array(this.dhcpOptsConfig)),
    vpcPeering: t.optional(t.array(this.vpcPeeringConfig)),
  });
}

export class DefaultVpcsConfig implements t.TypeOf<typeof NetworkConfigTypes.defaultVpcsConfig> {
  readonly delete = false;
  readonly excludeAccounts = [];
}

export class TransitGatewayRouteTableVpcEntryConfig
  implements t.TypeOf<typeof NetworkConfigTypes.transitGatewayRouteTableVpcEntryConfig>
{
  readonly account = '';
  readonly vpcName = '';
}

export class TransitGatewayRouteEntryConfig
  implements t.TypeOf<typeof NetworkConfigTypes.transitGatewayRouteEntryConfig>
{
  readonly destinationCidrBlock = '';
  readonly blackhole: boolean | undefined = undefined;
  readonly attachment: TransitGatewayRouteTableVpcEntryConfig | undefined = undefined;
}

export class TransitGatewayRouteTableConfig
  implements t.TypeOf<typeof NetworkConfigTypes.transitGatewayRouteTableConfig>
{
  readonly name = '';
  readonly tags: t.Tag[] | undefined = undefined;
  readonly routes: TransitGatewayRouteEntryConfig[] = [];
}

export class TransitGatewayConfig implements t.TypeOf<typeof NetworkConfigTypes.transitGatewayConfig> {
  readonly name = '';
  readonly account = '';
  readonly region = 'us-east-1';
  readonly shareTargets: t.ShareTargets = new t.ShareTargets();
  readonly asn = 65521;
  readonly dnsSupport = 'enable';
  readonly vpnEcmpSupport = 'enable';
  readonly defaultRouteTableAssociation = 'enable';
  readonly defaultRouteTablePropagation = 'enable';
  readonly autoAcceptSharingAttachments = 'disable';
  readonly routeTables: TransitGatewayRouteTableConfig[] = [];
  readonly tags: t.Tag[] | undefined = undefined;
}

export class RouteTableEntryConfig implements t.TypeOf<typeof NetworkConfigTypes.routeTableEntryConfig> {
  readonly name: string = '';
  readonly destination: string = '';
  readonly type: t.TypeOf<typeof NetworkConfigTypes.routeTableEntryTypeEnum> | undefined = undefined;
  readonly target: string = '';
  readonly targetAvailabilityZone: string | undefined = undefined;
}

export class RouteTableConfig implements t.TypeOf<typeof NetworkConfigTypes.routeTableConfig> {
  readonly name = '';
  readonly routes: RouteTableEntryConfig[] = [];
  readonly tags: t.Tag[] = [];
}

export class SubnetConfig implements t.TypeOf<typeof NetworkConfigTypes.subnetConfig> {
  readonly name = '';
  readonly availabilityZone = '';
  readonly routeTable = '';
  readonly ipv4CidrBlock = '';
  readonly mapPublicIpOnLaunch: boolean | undefined = undefined;
  readonly shareTargets: t.ShareTargets = new t.ShareTargets();
  readonly tags: t.Tag[] | undefined = undefined;
}

export class NatGatewayConfig implements t.TypeOf<typeof NetworkConfigTypes.natGatewayConfig> {
  readonly name = '';
  readonly subnet = '';
  readonly tags: t.Tag[] | undefined = undefined;
}

export class TransitGatewayAttachmentTargetConfig
  implements t.TypeOf<typeof NetworkConfigTypes.transitGatewayAttachmentTargetConfig>
{
  readonly name = '';
  readonly account = '';
}

export class TransitGatewayAttachmentConfig
  implements t.TypeOf<typeof NetworkConfigTypes.transitGatewayAttachmentConfig>
{
  readonly name = '';
  readonly transitGateway: TransitGatewayAttachmentTargetConfig = new TransitGatewayAttachmentTargetConfig();
  readonly subnets: string[] = [];
  readonly routeTableAssociations: string[] = [];
  readonly routeTablePropagations: string[] = [];
  readonly tags: t.Tag[] | undefined = undefined;
}

export class InterfaceEndpointConfig implements t.TypeOf<typeof NetworkConfigTypes.interfaceEndpointConfig> {
  readonly central: boolean = false;
  readonly allowedCidrs: string[] | undefined = undefined;
  readonly subnets: string[] = [];
  readonly endpoints: string[] = [];
}

export class SubnetSourceConfig implements t.TypeOf<typeof NetworkConfigTypes.subnetSourceConfig> {
  readonly account = '';
  readonly vpc = '';
  readonly subnets: string[] = [];
}

export class SecurityGroupSourceConfig implements t.TypeOf<typeof NetworkConfigTypes.securityGroupSourceConfig> {
  readonly securityGroups: string[] = [];
}

export class PrefixListSourceConfig implements t.TypeOf<typeof NetworkConfigTypes.prefixListSourceConfig> {
  readonly prefixLists: string[] = [];
}

export class PrefixListConfig implements t.TypeOf<typeof NetworkConfigTypes.prefixListConfig> {
  readonly name = '';
  readonly accounts: string[] = [''];
  readonly regions: t.Region[] = ['us-east-1'];
  readonly addressFamily = 'IPv4';
  readonly maxEntries = 1;
  readonly entries: string[] = [];
  readonly tags: t.Tag[] | undefined = undefined;
}

export class SecurityGroupRuleConfig implements t.TypeOf<typeof NetworkConfigTypes.securityGroupRuleConfig> {
  readonly description = '';
  readonly types = [];
  readonly tcpPorts = [];
  readonly udpPorts = [];
  readonly port = undefined;
  readonly fromPort = undefined;
  readonly toPort = undefined;
  readonly sources: string[] | SecurityGroupSourceConfig[] | PrefixListSourceConfig[] | SubnetSourceConfig[] = [];
}

export class SecurityGroupConfig implements t.TypeOf<typeof NetworkConfigTypes.securityGroupConfig> {
  readonly name = '';
  readonly description = '';
  readonly inboundRules: SecurityGroupRuleConfig[] = [];
  readonly outboundRules: SecurityGroupRuleConfig[] = [];
  readonly tags: t.Tag[] | undefined = undefined;
}

export class NetworkAclSubnetSelection implements t.TypeOf<typeof NetworkConfigTypes.networkAclSubnetSelection> {
  readonly account = '';
  readonly vpc = '';
  readonly subnet = '';
}
export class NetworkAclInboundRuleConfig implements t.TypeOf<typeof NetworkConfigTypes.networkAclInboundRuleConfig> {
  readonly rule = 100;
  readonly protocol = -1;
  readonly fromPort = -1;
  readonly toPort = -1;
  readonly action = 'allow';
  readonly source: string | NetworkAclSubnetSelection = '';
}

export class NetworkAclOutboundRuleConfig implements t.TypeOf<typeof NetworkConfigTypes.networkAclOutboundRuleConfig> {
  readonly rule = 100;
  readonly protocol = -1;
  readonly fromPort = -1;
  readonly toPort = -1;
  readonly action = 'allow';
  readonly destination: string | NetworkAclSubnetSelection = '';
}

/**
 * Defines the properties to configure a Network Access Control List (ACL)
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
   */
  readonly inboundRules: NetworkAclInboundRuleConfig[] | undefined = undefined;

  /**
   * A list of outbound rules to define for the Network ACL
   */
  readonly outboundRules: NetworkAclOutboundRuleConfig[] | undefined = undefined;
  /**
   * A list of tags to attach to the Network ACL
   *
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

export class DhcpOptsConfig implements t.TypeOf<typeof NetworkConfigTypes.dhcpOptsConfig> {
  readonly name: string = '';
  readonly accounts: string[] = [''];
  readonly regions: t.Region[] = ['us-east-1'];
  readonly domainName: string | undefined = undefined;
  readonly domainNameServers: string[] | undefined = undefined;
  readonly netbiosNameServers: string[] | undefined = undefined;
  readonly netbiosNodeType: t.TypeOf<typeof NetworkConfigTypes.netbiosNodeEnum> | undefined = undefined;
  readonly ntpServers: string[] | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
}

export class VpcConfig implements t.TypeOf<typeof NetworkConfigTypes.vpcConfig> {
  /**
   * The name of the VPC.
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
   * A list of CIDRs to associate with the VPC. At least one CIDR should be
   * provided.
   */
  readonly cidrs: string[] = [];

  /**
   * The name of a DHCP options set.
   */
  readonly dhcpOptions: string | undefined = undefined;

  /**
   * A list of DNS firewall rule group names.
   */
  readonly dnsFirewallRuleGroups: t.TypeOf<typeof NetworkConfigTypes.vpcDnsFirewallAssociationConfig>[] | undefined =
    undefined;

  /**
   * Defines if an internet gateway should be added to the VPC
   */
  readonly internetGateway: boolean | undefined = undefined;

  readonly enableDnsHostnames: boolean | undefined = true;

  readonly enableDnsSupport: boolean | undefined = true;

  readonly instanceTenancy: t.TypeOf<typeof NetworkConfigTypes.instanceTenancyTypeEnum> | undefined = 'default';

  /**
   * An optional list of DNS query log configuration names.
   */
  readonly queryLogs: string[] | undefined = undefined;

  /**
   * An optional list of Route 53 resolver rule names.
   */
  readonly resolverRules: string[] | undefined = undefined;

  readonly routeTables: RouteTableConfig[] | undefined = undefined;

  readonly subnets: SubnetConfig[] | undefined = undefined;

  readonly natGateways: NatGatewayConfig[] | undefined = undefined;

  readonly transitGatewayAttachments: TransitGatewayAttachmentConfig[] | undefined = undefined;

  readonly gatewayEndpoints: t.TypeOf<typeof NetworkConfigTypes.gatewayEndpointEnum>[] | undefined = undefined;

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
   * @default true
   */
  readonly useCentralEndpoints: boolean | undefined = true;

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

export class VpcFlowLogsConfig implements t.TypeOf<typeof NetworkConfigTypes.vpcFlowLogsConfig> {
  readonly trafficType = 'ALL';
  readonly maxAggregationInterval: number = 600;
  readonly destinations: t.TypeOf<typeof NetworkConfigTypes.logDestinationTypeEnum>[] = ['s3', 'cloud-watch-logs'];
  readonly defaultFormat = false;
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

export class ResolverRuleConfig implements t.TypeOf<typeof NetworkConfigTypes.resolverRuleConfig> {
  readonly name: string = '';
  readonly domainName: string = '';
  readonly inboundEndpointTarget: string | undefined = undefined;
  readonly ruleType: t.TypeOf<typeof NetworkConfigTypes.ruleTypeEnum> | undefined = 'FORWARD';
  readonly shareTargets: t.ShareTargets | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
  readonly targetIps: t.TypeOf<typeof NetworkConfigTypes.ruleTargetIps>[] | undefined = undefined;
}

export class ResolverEndpointConfig implements t.TypeOf<typeof NetworkConfigTypes.resolverEndpointConfig> {
  readonly name: string = '';
  readonly type: t.TypeOf<typeof NetworkConfigTypes.resolverEndpointTypeEnum> = 'INBOUND';
  readonly vpc: string = '';
  readonly subnets: string[] = [];
  readonly allowedCidrs: string[] | undefined = undefined;
  readonly rules: ResolverRuleConfig[] | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
}

export class DnsQueryLogsConfig implements t.TypeOf<typeof NetworkConfigTypes.dnsQueryLogsConfig> {
  readonly name: string = '';
  readonly destinations: t.TypeOf<typeof NetworkConfigTypes.logDestinationTypeEnum>[] = ['s3'];
  readonly shareTargets: t.ShareTargets | undefined = undefined;
}

export class DnsFirewallRulesConfig implements t.TypeOf<typeof NetworkConfigTypes.dnsFirewallRulesConfig> {
  readonly name: string = '';
  readonly action: t.TypeOf<typeof NetworkConfigTypes.dnsFirewallRuleActionTypeEnum> = 'ALERT';
  readonly priority: number = 100;
  readonly blockOverrideDomain: string | undefined = undefined;
  readonly blockOverrideTtl: number | undefined = undefined;
  readonly blockResponse: t.TypeOf<typeof NetworkConfigTypes.dnsFirewallBlockResponseTypeEnum> | undefined = undefined;
  readonly customDomainList: string | undefined = undefined;
  readonly managedDomainList: t.TypeOf<typeof NetworkConfigTypes.dnsFirewallManagedDomainListEnum> | undefined =
    undefined;
}

export class DnsFirewallRuleGroupConfig implements t.TypeOf<typeof NetworkConfigTypes.dnsFirewallRuleGroupConfig> {
  readonly name: string = '';
  readonly regions: t.Region[] = ['us-east-1'];
  readonly rules: DnsFirewallRulesConfig[] = [];
  readonly shareTargets: t.ShareTargets | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
}

export class ResolverConfig implements t.TypeOf<typeof NetworkConfigTypes.resolverConfig> {
  readonly endpoints: ResolverEndpointConfig[] | undefined = undefined;
  readonly firewallRuleGroups: DnsFirewallRuleGroupConfig[] | undefined = undefined;
  readonly queryLogs: DnsQueryLogsConfig | undefined = undefined;
}

export class NfwRuleSourceListConfig implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleSourceListConfig> {
  readonly generatedRulesType: t.TypeOf<typeof NetworkConfigTypes.nfwGeneratedRulesType> = 'DENYLIST';
  readonly targets: string[] = [];
  readonly targetTypes: t.TypeOf<typeof NetworkConfigTypes.nfwTargetType>[] = ['TLS_SNI'];
}

export class NfwRuleSourceStatefulRuleHeaderConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleSourceStatefulRuleHeaderConfig>
{
  readonly destination: string = '';
  readonly destinationPort: string = '';
  readonly direction: t.TypeOf<typeof NetworkConfigTypes.nfwStatefulRuleDirectionType> = 'ANY';
  readonly protocol: t.TypeOf<typeof NetworkConfigTypes.nfwStatefulRuleProtocolType> = 'IP';
  readonly source: string = '';
  readonly sourcePort: string = '';
}

export class NfwRuleSourceStatefulRuleOptionsConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleSourceStatefulRuleOptionsConfig>
{
  readonly keyword: string = '';
  readonly settings: string[] | undefined = undefined;
}

export class NfwRuleSourceStatefulRuleConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleSourceStatefulRuleConfig>
{
  readonly action: t.TypeOf<typeof NetworkConfigTypes.nfwStatefulRuleActionType> = 'DROP';
  readonly header: NfwRuleSourceStatefulRuleHeaderConfig = new NfwRuleSourceStatefulRuleHeaderConfig();
  readonly ruleOptions: NfwRuleSourceStatefulRuleOptionsConfig[] = [new NfwRuleSourceStatefulRuleOptionsConfig()];
}

export class NfwRuleSourceCustomActionDimensionConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleSourceCustomActionDimensionConfig>
{
  readonly dimensions: string[] = [];
}

export class NfwRuleSourceCustomActionDefinitionConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleSourceCustomActionDefinitionConfig>
{
  readonly publishMetricAction: NfwRuleSourceCustomActionDimensionConfig =
    new NfwRuleSourceCustomActionDimensionConfig();
}

export class NfwRuleSourceCustomActionConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleSourceCustomActionConfig>
{
  readonly actionDefinition: NfwRuleSourceCustomActionDefinitionConfig =
    new NfwRuleSourceCustomActionDefinitionConfig();
  readonly actionName: string = '';
}

export class NfwRuleSourceStatelessPortRangeConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleSourceStatelessPortRangeConfig>
{
  readonly fromPort: number = 123;
  readonly toPort: number = 123;
}

export class NfwRuleSourceStatelessTcpFlagsConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleSourceStatelessTcpFlagsConfig>
{
  readonly flags: string[] = [];
  readonly masks: string[] | undefined = undefined;
}

export class NfwRuleSourceStatelessMatchAttributesConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleSourceStatelessMatchAttributesConfig>
{
  readonly destinationPorts: NfwRuleSourceStatelessPortRangeConfig[] = [new NfwRuleSourceStatelessPortRangeConfig()];
  readonly destinations: string[] = [];
  readonly protocols: number[] = [];
  readonly sourcePorts: NfwRuleSourceStatelessPortRangeConfig[] = [new NfwRuleSourceStatelessPortRangeConfig()];
  readonly sources: string[] = [];
  readonly tcpFlags: NfwRuleSourceStatelessTcpFlagsConfig[] = [new NfwRuleSourceStatelessTcpFlagsConfig()];
}

export class NfwRuleSourceStatelessRuleDefinitionConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleSourceStatelessRuleDefinitionConfig>
{
  readonly actions: t.TypeOf<typeof NetworkConfigTypes.nfwStatelessRuleActionType>[] = ['aws:drop'];
  readonly matchAttributes: NfwRuleSourceStatelessMatchAttributesConfig =
    new NfwRuleSourceStatelessMatchAttributesConfig();
}

export class NfwRuleSourceStatelessRuleConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleSourceStatelessRuleConfig>
{
  readonly priority: number = 123;
  readonly ruleDefinition: NfwRuleSourceStatelessRuleDefinitionConfig =
    new NfwRuleSourceStatelessRuleDefinitionConfig();
}

export class NfwStatelessRulesAndCustomActionsConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwStatelessRulesAndCustomActionsConfig>
{
  readonly statelessRules: NfwRuleSourceStatelessRuleConfig[] = [new NfwRuleSourceStatelessRuleConfig()];
  readonly customActions: NfwRuleSourceCustomActionConfig[] | undefined = undefined;
}

export class NfwRuleSourceConfig implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleSourceConfig> {
  readonly rulesSourceList: NfwRuleSourceListConfig | undefined = undefined;
  readonly rulesString: string | undefined = undefined;
  readonly statefulRules: NfwRuleSourceStatefulRuleConfig[] | undefined = undefined;
  readonly statelessRulesAndCustomActions: NfwStatelessRulesAndCustomActionsConfig | undefined = undefined;
}

export class NfwRuleVariableDefinitionConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleVariableDefinitionConfig>
{
  readonly name: string = '';
  readonly definition: string[] = [];
}

export class NfwRuleVariableConfig implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleVariableConfig> {
  readonly ipSets: NfwRuleVariableDefinitionConfig = new NfwRuleVariableDefinitionConfig();
  readonly portSets: NfwRuleVariableDefinitionConfig = new NfwRuleVariableDefinitionConfig();
}

export class NfwRuleGroupRuleConfig implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleGroupRuleConfig> {
  readonly rulesSource: NfwRuleSourceConfig = new NfwRuleSourceConfig();
  readonly ruleVariables: NfwRuleVariableConfig | undefined = undefined;
  readonly statefulRuleOptions: t.TypeOf<typeof NetworkConfigTypes.nfwStatefulRuleOptionsType> | undefined = undefined;
}

export class NfwRuleGroupConfig implements t.TypeOf<typeof NetworkConfigTypes.nfwRuleGroupConfig> {
  readonly name: string = '';
  readonly regions: t.Region[] = [];
  readonly capacity: number = 123;
  readonly type: t.TypeOf<typeof NetworkConfigTypes.nfwRuleType> = 'STATEFUL';
  readonly description: string | undefined = undefined;
  readonly ruleGroup: NfwRuleGroupRuleConfig | undefined = undefined;
  readonly shareTargets: t.ShareTargets | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
}

export class NfwStatefulRuleGroupReferenceConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwStatefulRuleGroupReferenceConfig>
{
  readonly name: string = '';
  readonly priority: number | undefined = undefined;
}

export class NfwStatelessRuleGroupReferenceConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwStatelessRuleGroupReferenceConfig>
{
  readonly name: string = '';
  readonly priority: number = 123;
}

export class NfwFirewallPolicyPolicyConfig
  implements t.TypeOf<typeof NetworkConfigTypes.nfwFirewallPolicyPolicyConfig>
{
  readonly statelessDefaultActions: string[] = [];
  readonly statelessFragmentDefaultActions: string[] = [];
  readonly statefulDefaultActions: string[] | undefined = undefined;
  readonly statefulEngineOptions: t.TypeOf<typeof NetworkConfigTypes.nfwStatefulRuleOptionsType> | undefined =
    undefined;
  readonly statefulRuleGroups: NfwStatefulRuleGroupReferenceConfig[] | undefined = undefined;
  readonly statelessCustomActions: NfwRuleSourceCustomActionConfig[] | undefined = undefined;
  readonly statelessRuleGroups: NfwStatelessRuleGroupReferenceConfig[] | undefined = undefined;
}

export class NfwFirewallPolicyConfig implements t.TypeOf<typeof NetworkConfigTypes.nfwFirewallPolicyConfig> {
  readonly name: string = '';
  readonly firewallPolicy: NfwFirewallPolicyPolicyConfig = new NfwFirewallPolicyPolicyConfig();
  readonly regions: t.Region[] = [];
  readonly description: string | undefined = undefined;
  readonly shareTargets: t.ShareTargets | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
}

export class NfwLoggingConfig implements t.TypeOf<typeof NetworkConfigTypes.nfwLoggingConfig> {
  readonly destination: t.TypeOf<typeof NetworkConfigTypes.logDestinationTypeEnum> = 's3';
  readonly type: t.TypeOf<typeof NetworkConfigTypes.nfwLogType> = 'ALERT';
}

export class NfwFirewallConfig implements t.TypeOf<typeof NetworkConfigTypes.nfwFirewallConfig> {
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

export class NfwConfig implements t.TypeOf<typeof NetworkConfigTypes.nfwConfig> {
  readonly firewalls: NfwFirewallConfig[] = [];
  readonly policies: NfwFirewallPolicyConfig[] = [];
  readonly rules: NfwRuleGroupConfig[] = [];
}

export class CentralNetworkServicesConfig implements t.TypeOf<typeof NetworkConfigTypes.centralNetworkServicesConfig> {
  readonly delegatedAdminAccount: string = '';
  readonly route53Resolver: ResolverConfig | undefined = undefined;
  readonly networkFirewall: NfwConfig | undefined = undefined;
}

export class VpcPeeringConfig implements t.TypeOf<typeof NetworkConfigTypes.vpcPeeringConfig> {
  readonly name: string = '';
  readonly vpcs: string[] = [];
  readonly tags: t.Tag[] | undefined = undefined;
}

export class NetworkConfig implements t.TypeOf<typeof NetworkConfigTypes.networkConfig> {
  static readonly FILENAME = 'network-config.yaml';

  /**
   *
   */
  readonly defaultVpc: DefaultVpcsConfig = new DefaultVpcsConfig();

  /**
   *
   */
  readonly transitGateways: TransitGatewayConfig[] = [];

  /**
   * A list of VPC configurations.
   *
   * @see VpcConfig
   */
  readonly vpcs: VpcConfig[] = [];

  readonly vpcFlowLogs: VpcFlowLogsConfig = new VpcFlowLogsConfig();

  /**
   * An optional list of DHCP options set configurations.
   */
  readonly dhcpOptions: DhcpOptsConfig[] | undefined = undefined;

  /**
   * An optional Route 53 Resolver configuration
   */
  readonly centralNetworkServices: CentralNetworkServicesConfig | undefined = undefined;

  /**
   * An optional list of VPC peering configurations
   */
  readonly vpcPeering: VpcPeeringConfig[] | undefined = undefined;

  /**
   *
   * @param values
   */
  constructor(values?: t.TypeOf<typeof NetworkConfigTypes.networkConfig>) {
    if (values) {
      Object.assign(this, values);
    }
  }

  /**
   * An optional list of prefix list set configurations.
   */
  readonly prefixLists: PrefixListConfig[] | undefined = undefined;

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
      console.log('[network-config] Error parsing input, global config undefined');
      console.log(`${e}`);
      return undefined;
    }
  }
}
