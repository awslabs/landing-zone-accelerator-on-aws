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

import * as t from './common-types';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

/**
 * Configuration items.
 */
export abstract class NetworkConfigTypes {
  static readonly defaultVpcsConfig = t.interface({
    delete: t.boolean,
  });

  static readonly transitGatewayRouteTableConfig = t.interface({
    name: t.nonEmptyString,
  });

  static readonly transitGatewayDeploymentTargetConfig = t.interface({
    organizationalUnits: t.optional(t.array(t.nonEmptyString)),
    accounts: t.optional(t.array(t.nonEmptyString)),
  });

  static readonly transitGatewayConfig = t.interface({
    name: t.nonEmptyString,
    account: t.nonEmptyString,
    region: t.region,
    deploymentTargets: t.optional(this.transitGatewayDeploymentTargetConfig),
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
  });

  static readonly natGatewayConfig = t.interface({
    name: t.nonEmptyString,
    subnet: t.nonEmptyString,
  });

  static readonly transitGatewayAttachmentConfig = t.interface({
    name: t.nonEmptyString,
    transitGatewayName: t.nonEmptyString,
    accountName: t.nonEmptyString,
    subnets: t.array(t.nonEmptyString),
    routeTableAssociations: t.optional(t.array(t.nonEmptyString)),
    routeTablePropagations: t.optional(t.array(t.nonEmptyString)),
  });

  static readonly gatewayEndpointEnum = t.enums(
    'GatewayEndpointType',
    ['s3', 'dynamodb'],
    'Value should be a gateway endpoint type',
  );

  // static readonly securityGroupRuleConfig = t.interface({
  //   description: t.nonEmptyString,
  //   type: t.string,
  //   source: t.array(t.nonEmptyString),
  // });

  // static readonly securityGroupConfig = t.interface({
  //   name: t.nonEmptyString,
  //   inboundRules: t.optional(t.array(this.securityGroupRuleConfig)),
  //   outboundRules: t.optional(t.array(this.securityGroupRuleConfig)),
  // });

  static readonly vpcConfig = t.interface({
    name: t.nonEmptyString,
    account: t.nonEmptyString,
    region: t.region,
    cidrs: t.array(t.nonEmptyString),
    internetGateway: t.optional(t.boolean),
    routeTables: t.optional(t.array(this.routeTableConfig)),
    subnets: t.optional(t.array(this.subnetConfig)),
    natGateways: t.optional(t.array(this.natGatewayConfig)),
    transitGatewayAttachments: t.optional(t.array(this.transitGatewayAttachmentConfig)),
    gatewayEndpoints: t.optional(t.array(this.gatewayEndpointEnum)),
    // securityGroups: t.optional(t.array(this.securityGroupConfig)),
  });

  static readonly networkConfig = t.interface({
    defaultVpc: t.optional(this.defaultVpcsConfig),
    transitGateways: t.array(this.transitGatewayConfig),
    vpcs: t.array(this.vpcConfig),
  });
}

export abstract class DefaultVpcsConfig implements t.TypeOf<typeof NetworkConfigTypes.defaultVpcsConfig> {
  readonly delete = true;
}

export abstract class TransitGatewayRouteTableConfig
  implements t.TypeOf<typeof NetworkConfigTypes.transitGatewayRouteTableConfig>
{
  readonly name = '';
}

export abstract class TransitGatewayDeploymentTargetConfig
  implements t.TypeOf<typeof NetworkConfigTypes.transitGatewayDeploymentTargetConfig>
{
  readonly organizationalUnits = [];
  readonly accounts = [];
}

export abstract class TransitGatewayConfig implements t.TypeOf<typeof NetworkConfigTypes.transitGatewayConfig> {
  readonly name = '';
  readonly account = '';
  readonly region = 'us-east-1';
  readonly deploymentTargets: TransitGatewayDeploymentTargetConfig | undefined = undefined;
  readonly asn = 65521;
  readonly dnsSupport = 'enable';
  readonly vpnEcmpSupport = 'enable';
  readonly defaultRouteTableAssociation = 'enable';
  readonly defaultRouteTablePropagation = 'enable';
  readonly autoAcceptSharingAttachments = 'disable';
  readonly routeTables: TransitGatewayRouteTableConfig[] = [];
}

export abstract class RouteTableEntryConfig implements t.TypeOf<typeof NetworkConfigTypes.routeTableEntryConfig> {
  readonly name: string = '';
  readonly destination: string = '';
  readonly type: t.TypeOf<typeof NetworkConfigTypes.routeTableEntryTypeEnum> | undefined = undefined;
  readonly target: string = '';
}

export abstract class RouteTableConfig implements t.TypeOf<typeof NetworkConfigTypes.routeTableConfig> {
  readonly name = '';
  readonly routes: RouteTableEntryConfig[] = [];
}

export abstract class SubnetConfig implements t.TypeOf<typeof NetworkConfigTypes.subnetConfig> {
  readonly name = '';
  readonly availabilityZone = '';
  readonly routeTable = '';
  readonly ipv4CidrBlock = '';
  readonly mapPublicIpOnLaunch: boolean | undefined = undefined;
}

export abstract class NatGatewayConfig implements t.TypeOf<typeof NetworkConfigTypes.natGatewayConfig> {
  readonly name = '';
  readonly subnet = '';
}

export abstract class TransitGatewayAttachmentConfig
  implements t.TypeOf<typeof NetworkConfigTypes.transitGatewayAttachmentConfig>
{
  readonly name = '';
  readonly transitGatewayName = '';
  readonly accountName = '';
  readonly subnets: string[] = [];
  readonly routeTableAssociations: string[] = [];
  readonly routeTablePropagations: string[] = [];
}

// export abstract class SecurityGroupRuleConfig implements t.TypeOf<typeof NetworkConfigTypes.securityGroupRuleConfig> {
//   readonly description = '';
//   readonly type = '';
//   readonly source: string[] = [];
// }

// export abstract class SecurityGroupConfig implements t.TypeOf<typeof NetworkConfigTypes.securityGroupConfig> {
//   readonly name = '';
//   readonly inboundRules: SecurityGroupRuleConfig[] = [];
//   readonly outboundRules: SecurityGroupRuleConfig[] = [];
// }

export abstract class VpcConfig implements t.TypeOf<typeof NetworkConfigTypes.vpcConfig> {
  /**
   * The name of the VPC. A 'name' tag will be added to the generated VPC using
   * the specified value
   */
  readonly name = '';

  /**
   * The accountName
   */
  readonly account = '';

  readonly region = 'us-east-1';

  readonly cidrs: string[] = [];

  readonly internetGateway: boolean | undefined = undefined;

  readonly routeTables: RouteTableConfig[] = [];

  readonly subnets: SubnetConfig[] = [];

  readonly natGateways: NatGatewayConfig[] = [];

  readonly transitGatewayAttachments: TransitGatewayAttachmentConfig[] = [];

  readonly gatewayEndpoints: t.TypeOf<typeof NetworkConfigTypes.gatewayEndpointEnum>[] = [];

  // readonly securityGroups: SecurityGroupConfig[] = [];
}

export class NetworkConfig implements t.TypeOf<typeof NetworkConfigTypes.networkConfig> {
  static readonly FILENAME = 'network-config.yaml';

  /**
   *
   */
  readonly defaultVpc: DefaultVpcsConfig | undefined;

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
}
