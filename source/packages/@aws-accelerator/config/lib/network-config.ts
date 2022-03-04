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
  });

  static readonly transitGatewayRouteTableConfig = t.interface({
    name: t.nonEmptyString,
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
  });

  static readonly routeTableEntryTypeEnum = t.enums(
    'Type',
    ['transitGateway', 'natGateway', 'internetGateway', 'local', 'gatewayEndpoint', 'networkInterface'],
    'Value should be a route table target type',
  );

  static readonly routeTableEntryConfig = t.interface({
    name: t.nonEmptyString,
    destination: t.optional(t.nonEmptyString),
    type: t.optional(this.routeTableEntryTypeEnum),
    target: t.nonEmptyString,
  });

  static readonly routeTableConfig = t.interface({
    name: t.nonEmptyString,
    routes: t.optional(t.array(this.routeTableEntryConfig)),
  });

  static readonly subnetConfig = t.interface({
    name: t.nonEmptyString,
    availabilityZone: t.nonEmptyString,
    routeTable: t.nonEmptyString,
    ipv4CidrBlock: t.nonEmptyString,
    mapPublicIpOnLaunch: t.optional(t.boolean),
    shareTargets: t.optional(t.shareTargets),
  });

  static readonly natGatewayConfig = t.interface({
    name: t.nonEmptyString,
    subnet: t.nonEmptyString,
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

  static readonly securityGroupRuleConfig = t.interface({
    description: t.nonEmptyString,
    types: t.optional(t.array(this.securityGroupRuleTypeEnum)),
    tcpPorts: t.optional(t.array(t.number)),
    udpPorts: t.optional(t.array(t.number)),
    port: t.optional(t.number),
    fromPort: t.optional(t.number),
    toPort: t.optional(t.number),
    sources: t.array(t.union([t.nonEmptyString, this.subnetSourceConfig, this.securityGroupSourceConfig])),
  });

  static readonly securityGroupConfig = t.interface({
    name: t.nonEmptyString,
    description: t.optional(t.nonEmptyString),
    inboundRules: t.optional(t.array(this.securityGroupRuleConfig)),
    outboundRules: t.optional(t.array(this.securityGroupRuleConfig)),
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

  static readonly vpcConfig = t.interface({
    name: t.nonEmptyString,
    account: t.nonEmptyString,
    region: t.region,
    cidrs: t.array(t.nonEmptyString),
    dhcpOptions: t.optional(t.nonEmptyString),
    enableDnsHostnames: t.optional(t.boolean),
    enableDnsSupport: t.optional(t.boolean),
    instanceTenancy: t.optional(this.instanceTenancyTypeEnum),
    internetGateway: t.optional(t.boolean),
    routeTables: t.optional(t.array(this.routeTableConfig)),
    subnets: t.optional(t.array(this.subnetConfig)),
    natGateways: t.optional(t.array(this.natGatewayConfig)),
    transitGatewayAttachments: t.optional(t.array(this.transitGatewayAttachmentConfig)),
    gatewayEndpoints: t.optional(t.array(this.gatewayEndpointEnum)),
    interfaceEndpoints: t.optional(this.interfaceEndpointConfig),
    useCentralEndpoints: t.optional(t.boolean),
    securityGroups: t.optional(t.array(this.securityGroupConfig)),
    networkAcls: t.optional(t.array(this.networkAclConfig)),
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

  static readonly networkConfig = t.interface({
    defaultVpc: this.defaultVpcsConfig,
    transitGateways: t.array(this.transitGatewayConfig),
    vpcs: t.array(this.vpcConfig),
    vpcFlowLogs: this.vpcFlowLogsConfig,
    dhcpOptions: t.optional(t.array(this.dhcpOptsConfig)),
  });
}

export class DefaultVpcsConfig implements t.TypeOf<typeof NetworkConfigTypes.defaultVpcsConfig> {
  readonly delete = true;
}

export class TransitGatewayRouteTableConfig
  implements t.TypeOf<typeof NetworkConfigTypes.transitGatewayRouteTableConfig>
{
  readonly name = '';
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
}

export class RouteTableEntryConfig implements t.TypeOf<typeof NetworkConfigTypes.routeTableEntryConfig> {
  readonly name: string = '';
  readonly destination: string = '';
  readonly type: t.TypeOf<typeof NetworkConfigTypes.routeTableEntryTypeEnum> | undefined = undefined;
  readonly target: string = '';
}

export class RouteTableConfig implements t.TypeOf<typeof NetworkConfigTypes.routeTableConfig> {
  readonly name = '';
  readonly routes: RouteTableEntryConfig[] = [];
}

export class SubnetConfig implements t.TypeOf<typeof NetworkConfigTypes.subnetConfig> {
  readonly name = '';
  readonly availabilityZone = '';
  readonly routeTable = '';
  readonly ipv4CidrBlock = '';
  readonly mapPublicIpOnLaunch: boolean | undefined = undefined;
  readonly shareTargets: t.ShareTargets = new t.ShareTargets();
}

export class NatGatewayConfig implements t.TypeOf<typeof NetworkConfigTypes.natGatewayConfig> {
  readonly name = '';
  readonly subnet = '';
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

export class SecurityGroupRuleConfig implements t.TypeOf<typeof NetworkConfigTypes.securityGroupRuleConfig> {
  readonly description = '';
  readonly types = [];
  readonly tcpPorts = [];
  readonly udpPorts = [];
  readonly port = undefined;
  readonly fromPort = undefined;
  readonly toPort = undefined;
  readonly sources: string[] | SecurityGroupSourceConfig[] | SubnetSourceConfig[] = [];
}

export class SecurityGroupConfig implements t.TypeOf<typeof NetworkConfigTypes.securityGroupConfig> {
  readonly name = '';
  readonly description = '';
  readonly inboundRules: SecurityGroupRuleConfig[] = [];
  readonly outboundRules: SecurityGroupRuleConfig[] = [];
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
   * Defines if an internet gateway should be added to the VPC
   */
  readonly internetGateway: boolean | undefined = undefined;

  readonly enableDnsHostnames: boolean | undefined = true;

  readonly enableDnsSupport: boolean | undefined = true;

  readonly instanceTenancy: t.TypeOf<typeof NetworkConfigTypes.instanceTenancyTypeEnum> | undefined = 'default';

  readonly routeTables: RouteTableConfig[] | undefined = undefined;

  readonly subnets: SubnetConfig[] | undefined = undefined;

  readonly natGateways: NatGatewayConfig[] | undefined = undefined;

  readonly transitGatewayAttachments: TransitGatewayAttachmentConfig[] | undefined = undefined;

  readonly gatewayEndpoints: t.TypeOf<typeof NetworkConfigTypes.gatewayEndpointEnum>[] | undefined = undefined;

  /**
   * A list of VPC
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
   * A list of Network Access Control Lists (ACLs) to deploy for this VPC
   *
   * @default undefined
   */
  readonly networkAcls: NetworkAclConfig[] | undefined = undefined;
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
   *
   * @param values
   */
  constructor(values?: t.TypeOf<typeof NetworkConfigTypes.networkConfig>) {
    if (values) {
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
