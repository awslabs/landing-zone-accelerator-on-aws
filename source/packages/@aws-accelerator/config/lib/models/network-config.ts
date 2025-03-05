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

import * as t from '../common/types';
import * as ci from '../models/customizations-config';

/**
 * *{@link NetworkConfig} / {@link DefaultVpcsConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/default-vpc.html | Default Virtual Private Cloud (VPC)} configuration.
 *
 * @description
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
 *   excludeRegions: []
 * ```
 */
export interface IDefaultVpcsConfig {
  /**
   * Enable to delete default VPCs.
   */
  readonly delete: boolean;
  /**
   * (OPTIONAL) Include an array of friendly account names
   * to exclude from default VPC deletion.
   *
   * @remarks
   * Note: This is the logical name for accounts as defined in accounts-config.yaml.
   */
  readonly excludeAccounts?: string[];
  /**
   * (OPTIONAL) Include an array of AWS regions
   * to exclude from default VPC deletion.
   *
   * @remarks
   * Note: The regions included in the array must exist in the `enabledRegions` section of the global-config.yaml.
   */
  readonly excludeRegions?: t.Region[];
}

/**
 * *{@link NetworkConfig} / {@link TransitGatewayConfig} / {@link TransitGatewayRouteTableConfig} / {@link TransitGatewayRouteEntryConfig} / {@link TransitGatewayRouteTableVpcEntryConfig}*
 *
 * @description
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
export interface ITransitGatewayRouteTableVpcEntryConfig {
  /**
   * The friendly name of the account where the VPC resides.
   *
   * @remarks
   * Note: This is the logical `name` property for the account as defined in accounts-config.yaml.
   */
  readonly account: t.NonEmptyString;
  /**
   * The friendly name of the VPC.
   *
   * @remarks
   * Note: This is the logical `name` property for the VPC as defined in network-config.yaml.
   */
  readonly vpcName: t.NonEmptyString;
}

/**
 * *{@link NetworkConfig} / {@link TransitGatewayConfig} / {@link TransitGatewayRouteTableConfig} / {@link TransitGatewayRouteEntryConfig} / {@link TransitGatewayRouteTableDxGatewayEntryConfig}*
 *
 * @description
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
export interface ITransitGatewayRouteTableDxGatewayEntryConfig {
  /**
   * The name of the Direct Connect Gateway
   *
   * @remarks
   * Note: This is the logical `name` property of the Direct Connect Gateway as defined in network-config.yaml. Do not use `gatewayName`.
   */
  readonly directConnectGatewayName: t.NonEmptyString;
}

/**
 * *{@link NetworkConfig} / {@link TransitGatewayConfig} / {@link TransitGatewayRouteTableConfig} / {@link TransitGatewayRouteEntryConfig} / {@link TransitGatewayRouteTableVpnEntryConfig}*
 *
 * @description
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
export interface ITransitGatewayRouteTableVpnEntryConfig {
  /**
   * The name of the VPN connection
   *
   * @remarks
   * Note: This is the `name` property of the VPN connection as defined in network-config.yaml.
   */
  readonly vpnConnectionName: t.NonEmptyString;
}

/**
 * *{@link NetworkConfig} / {@link TransitGatewayConfig} / {@link TransitGatewayRouteTableConfig} / {@link TransitGatewayRouteEntryConfig} / {@link TransitGatewayRouteTableTgwPeeringEntryConfig}*
 *
 * @description
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
export interface ITransitGatewayRouteTableTgwPeeringEntryConfig {
  /**
   * The name of the Transit Gateway peering connection
   *
   * @remarks
   * Note: This is the logical `name` property of the Transit Gateway peering connection as defined in network-config.yaml.
   *
   * @see {@link TransitGatewayPeeringConfig}
   */
  readonly transitGatewayPeeringName: t.NonEmptyString;
}

/**
 * *{@link NetworkConfig} / {@link TransitGatewayConfig} / {@link TransitGatewayRouteTableConfig} / {@link TransitGatewayRouteEntryConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/tgw/how-transit-gateways-work.html#tgw-routing-overview | Transit Gateway static route entry} configuration.
 *
 * @description
 * Use this configuration to define static route entries in a Transit Gateway route table.
 *
 * @example
 * Destination IPv4 CIDR:
 * ```
 * - destinationCidrBlock: 0.0.0.0/0
 *   attachment:
 *     account: Network
 *     vpcName: Network-Inspection
 * ```
 * Destination IPv6 CIDR:
 * ```
 * - destinationCidrBlock: ::/0
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
 * Blackhole IPv4 route:
 * ```
 * - destinationCidrBlock: 1.1.1.1/32
 *   blackhole: true
 * ```
 *
 * Blackhole IPv6 route:
 * ```
 * - destinationCidrBlock: fd00::/8
 *   blackhole: true
 * ```
 */
export interface ITransitGatewayRouteEntryConfig {
  /**
   * The destination IPv4/v6 CIDR block for the route table entry.
   *
   * @remarks
   * Use IPv4/v6 CIDR notation, i.e. 10.0.0.0/16, fd00::/8. Leave undefined if specifying a destination prefix list.
   *
   */
  readonly destinationCidrBlock?: t.NonEmptyString;
  /**
   * The friendly name of a prefix list for the route table entry.
   *
   * @remarks
   * This is the logical `name` property of a prefix list as defined in network-config.yaml.
   * Leave undefined if specifying a CIDR destination.
   *
   * @see {@link PrefixListConfig}
   */
  readonly destinationPrefixList?: t.NonEmptyString;
  /**
   * (OPTIONAL) Enable to create a blackhole for the destination CIDR.
   * Leave undefined if specifying a VPC destination.
   */
  readonly blackhole?: boolean;
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
  readonly attachment?:
    | ITransitGatewayRouteTableVpcEntryConfig
    | ITransitGatewayRouteTableDxGatewayEntryConfig
    | ITransitGatewayRouteTableVpnEntryConfig
    | ITransitGatewayRouteTableTgwPeeringEntryConfig;
}

/**
 * *{@link NetworkConfig} / {@link TransitGatewayConfig} / {@link TransitGatewayRouteTableConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/tgw/how-transit-gateways-work.html#tgw-routing-overview | Transit Gateway route table} configuration.
 *
 * @description
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
export interface ITransitGatewayRouteTableConfig {
  /**
   * A friendly name for the Transit Gateway route table.
   *
   * @remarks
   * **CAUTION**: Changing this property after initial deployment will cause a route table recreation.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: t.NonEmptyString;
  /**
   * (OPTIONAL) An array of tag objects for the Transit Gateway route table.
   */
  readonly tags?: t.ITag[];
  /**
   * An array of Transit Gateway route entry configuration objects.
   *
   * @see {@link TransitGatewayRouteEntryConfig}
   */
  readonly routes: ITransitGatewayRouteEntryConfig[];
}

/**
 * *{@link NetworkConfig} / {@link TransitGatewayPeeringConfig} / {@link TransitGatewayPeeringRequesterConfig}*
 *
 * @description
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
export interface ITransitGatewayPeeringRequesterConfig {
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
  readonly transitGatewayName: t.NonEmptyString;
  /**
   * The friendly name of the account of the requester transit gateway
   *
   * @remarks
   * This is the logical `account` property of the requester transit gateway as defined in network-config.yaml.
   *
   * @see {@link TransitGatewayConfig}
   */
  readonly account: t.NonEmptyString;
  /**
   * The name of the region the accepter transit gateway resides in
   *
   * @see {@link TransitGatewayConfig}
   */
  readonly region: t.Region;
  /**
   * The friendly name of TGW route table to associate with this peering attachment.
   *
   * @remarks
   * This is the logical `name` property of a route table for the requester TGW as defined in network-config.yaml.
   *
   * @see {@link TransitGatewayRouteTableConfig}
   */
  readonly routeTableAssociations: t.NonEmptyString;
  /**
   * (OPTIONAL) An array of tag objects for the Transit Gateway Peering.
   */
  readonly tags?: t.ITag[];
}

/**
 * *{@link NetworkConfig} / {@link TransitGatewayPeeringConfig} / {@link TransitGatewayPeeringAccepterConfig}*
 *
 * @description
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
export interface ITransitGatewayPeeringAccepterConfig {
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
  readonly transitGatewayName: t.NonEmptyString;
  /**
   * The friendly name of the account of the accepter transit gateway
   *
   * @remarks
   * This is the logical `account` property of the accepter transit gateway as defined in network-config.yaml.
   *
   * @see {@link TransitGatewayConfig}
   */
  readonly account: t.NonEmptyString;
  /**
   * The name of the region the accepter transit gateway resides in
   *
   * @see {@link TransitGatewayConfig}
   */
  readonly region: t.Region;
  /**
   * The friendly name of TGW route table to associate with this peering attachment.
   *
   * @remarks
   * This is the logical `name` property of a route table for the accepter TGW as defined in network-config.yaml.
   *
   * @see {@link TransitGatewayRouteTableConfig}
   */
  readonly routeTableAssociations: t.NonEmptyString;
  /**
   * (OPTIONAL) Peering request auto accept flag.
   * Note: When this flag is set to `true`, the peering request will be automatically
   * accepted by the accelerator.
   */
  readonly autoAccept?: boolean;
  /**
   * (OPTIONAL) Peering request apply tags flag.
   * Note: When this flag is set to `true`, the requester attachment tags are replicated
   * to the accepter attachment.
   */
  readonly applyTags?: boolean;
}

/**
 * *{@link NetworkConfig} / {@link TransitGatewayPeeringConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/tgw/how-transit-gateways-work.html#tgw-route-table-peering | Transit Gateway (TGW) peering} configuration.
 *
 * @description
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
export interface ITransitGatewayPeeringConfig {
  /**
   * The friendly name of TGW peering.
   */
  readonly name: t.NonEmptyString;
  /**
   * Peering attachment requester configuration.
   *
   * @see {@link TransitGatewayPeeringRequesterConfig}
   */
  readonly requester: ITransitGatewayPeeringRequesterConfig;
  /**
   * Peering attachment accepter configuration
   *
   * @see {@link TransitGatewayPeeringAccepterConfig}
   */
  readonly accepter: ITransitGatewayPeeringAccepterConfig;
}

/**
 * *{@link NetworkConfig} / {@link TransitGatewayConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/tgw/what-is-transit-gateway.html | Transit Gateway (TGW)} configuration.
 *
 * @description
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
 *
 * The following example creates a TGW with a static IPv4 and IPv6 address
 * @example
 * ```
 * transitGateways:
 *   - name: Network-Main
 *     account: Network
 *     region: us-east-1
 *     transitGatewayCidrBlocks:
 *       - 10.5.0.0/24
 *     transitGatewayIpv6CidrBlocks:
 *       - 2001:db8::/64
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
export interface ITransitGatewayConfig {
  /**
   * A friendly name for the Transit Gateway.
   *
   * @remarks
   * **CAUTION**: Changing this value after initial deployment will cause the Transit Gateway to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: t.NonEmptyString;
  /**
   * The friendly name of the account to deploy the Transit Gateway.
   *
   * @remarks
   * This is the logical `name` property of the account as defined in accounts-config.yaml.
   */
  readonly account: t.NonEmptyString;
  /**
   * The region name to deploy the Transit Gateway.
   */
  readonly region: t.Region;
  /**
   * (OPTIONAL) Resource Access Manager (RAM) share targets.
   *
   * @remarks
   * Targets can be account names and/or organizational units.
   *
   * @see {@link ShareTargets}
   */
  readonly shareTargets?: t.IShareTargets;
  /**
   * (OPTIONAL) A list of transit gateway IPv4 CIDR blocks.
   */
  readonly transitGatewayCidrBlocks?: t.NonEmptyString[];

  /**
   * (OPTIONAL) A list of transit gateway IPv6 CIDR blocks.
   */
  readonly transitGatewayIpv6CidrBlocks?: t.NonEmptyString[];

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
  readonly asn: number;
  /**
   * Configure DNS support between VPCs.
   *
   * @remarks
   * Enable this option if you need the VPC to resolve public IPv4 DNS host names
   * to private IPv4 addresses when queried from instances in another VPC attached
   * to the transit gateway.
   */
  readonly dnsSupport: t.EnableDisable;
  /**
   * Equal Cost Multipath (ECMP) routing support between VPN tunnels.
   *
   * @remarks
   * Enable this option if you need Equal Cost Multipath (ECMP) routing support between VPN tunnels.
   * If connections advertise the same CIDRs, the traffic is distributed equally between them.
   */
  readonly vpnEcmpSupport: t.EnableDisable;
  /**
   * Configure default route table association.
   *
   * @remarks
   * Enable this option to automatically associate transit gateway attachments with the default
   * route table for the transit gateway.
   */
  readonly defaultRouteTableAssociation: t.EnableDisable;
  /**
   * Configure default route table propagation.
   *
   * @remarks
   * Enable this option to automatically propagate transit gateway attachments to the default
   * route table for the transit gateway.
   */
  readonly defaultRouteTablePropagation: t.EnableDisable;
  /**
   * Enable this option to automatically accept cross-account attachments.
   */
  readonly autoAcceptSharingAttachments: t.EnableDisable;
  /**
   * An array of Transit Gateway route table configuration objects.
   *
   * @see {@link TransitGatewayRouteTableConfig}
   */
  readonly routeTables: ITransitGatewayRouteTableConfig[];
  /**
   * (OPTIONAL) An array of tag objects for the Transit Gateway.
   */
  readonly tags?: t.ITag[];
}

export type DxVirtualInterfaceType = 'private' | 'transit';

export type IpVersionType = 'ipv4' | 'ipv6';

/**
 * *{@link NetworkConfig} / {@link DxGatewayConfig} / {@link DxVirtualInterfaceConfig}*
 *
 * {@link https://docs.aws.amazon.com/directconnect/latest/UserGuide/Welcome.html#overview-components | Direct Connect (DX) virtual interface (VIF)} configuration.
 *
 * @description
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
export interface IDxVirtualInterfaceConfig {
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
  readonly name: t.NonEmptyString;
  /**
   * The resource ID of the {@link https://docs.aws.amazon.com/directconnect/latest/UserGuide/Welcome.html#overview-components | DX connection}
   * the virtual interface will be created on
   *
   * @remarks
   * This is the resource ID of an existing DX connection in your environment. Resource IDs should be the the format `dxcon-xxxxxx`
   */
  readonly connectionId: t.NonEmptyString;
  /**
   * A Border Gateway Protocol (BGP) Autonomous System Number (ASN) for the customer side of the connection.
   *
   * @remarks
   * This ASN must be unique from the Amazon side ASN.
   * The ASN for the Amazon side is determined by the DX Gateway it is created on.
   *
   * Note: The valid values are 1 to 2147483647
   */
  readonly customerAsn: number;
  /**
   * The name of the virtual interface.
   * This name will show as the name of the resource
   * in the AWS console and API.
   *
   * @remarks
   * This name can be changed without replacing the physical resource.
   */
  readonly interfaceName: t.NonEmptyString;
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
  readonly ownerAccount: t.NonEmptyString;
  /**
   * The region of the virtual interface.
   *
   * @remarks
   * Please note this region must match the region where the physical connection is hosted.
   */
  readonly region: t.Region;
  /**
   * The type of the virtual interface
   *
   * @remarks
   * `private` virtual interfaces can only be created on DX gateways associated with virtual private gateways.
   *
   * `transit` virtual interfaces can only be created on DX gateways associated with transit gateways.
   */
  readonly type: DxVirtualInterfaceType;
  /**
   * The virtual local area network (VLAN) tag to use for this virtual interface.
   *
   * @remarks
   * This must be a unique VLAN tag that's not already in use on your connection.
   *
   * The value must be between 1 and 4094
   */
  readonly vlan: number;
  /**
   * (OPTIONAL) The address family to use for this virtual interface.
   *
   * Default - ipv4
   */
  readonly addressFamily?: IpVersionType;
  /**
   * (OPTIONAL) The peer IP address to use for Amazon's side of the virtual interface.
   *
   * Default - randomly-generated by Amazon
   */
  readonly amazonAddress?: t.NonEmptyString;
  /**
   * (OPTIONAL): The Secrets Manager name that stores the BGP Authentication Key, that exists in the
   * same account and region that the Direct Connect Virtual Interface will be created in.
   *
   * @remarks
   *
   * If left undefined, Amazon will generate an MD5 authentication key. If needing to use your own key instead,
   * utilize Secrets Manager to store the secret. This will protect BGP sessions from unauthorized peers, by providing
   * an extra layer of authentication between your router and AWS. This helps prevent against BGP hijacking and unauthorized
   * route advertisements.
   *
   * Include the random hash suffix value in the Secrets Manager name. This can be found using the
   * following procedure:
   * 1. Navigate to the {@link https://us-east-1.console.aws.amazon.com/secretsmanager/listsecrets | Secrets Manager console}.
   * 2. Select the region you stored the secret in.
   * 3. Click on the name of the secret.
   * 4. Under **Secret details**, the **Secret ARN** contains the full name of the secret,
   * including the random hash suffix. This is the value after **secret:** in the ARN.
   *
   * NOTE: The key takes in a minimum length of 6 characters and a maximum length of 80 characters. If left undefined,
   * Amazon will utilize an MD5 authentication key.
   */
  readonly authKey?: t.NonEmptyString;
  /**
   * (OPTIONAL) The peer IP address to use for customer's side of the virtual interface.
   *
   * Default - randomly-generated by Amazon
   */
  readonly customerAddress?: t.NonEmptyString;
  /**
   * (OPTIONAL) Enable SiteLink for this virtual interface.
   *
   * Default - false
   */
  readonly enableSiteLink?: boolean;
  /**
   * (OPTIONAL) Enable jumbo frames for the virtual interface.
   *
   * Default - standard 1500 MTU frame size
   */
  readonly jumboFrames?: boolean;
  /**
   * (OPTIONAL) An array of tags to apply to the virtual interface.
   */
  readonly tags?: t.ITag[];
}

/**
 * *{@link NetworkConfig} / {@link DxGatewayConfig} / {@link DxTransitGatewayAssociationConfig}*
 *
 * {@link https://docs.aws.amazon.com/directconnect/latest/UserGuide/direct-connect-transit-gateways.html | Direct Connect Gateway transit gateway association} configuration.
 *
 * @description
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
export interface IDxTransitGatewayAssociationConfig {
  /**
   * The friendly name of the transit gateway to associate.
   *
   * @remarks
   * This is the logical `name` property of the transit gateway as defined in network-config.yaml.
   */
  readonly name: t.NonEmptyString;
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
  readonly account: t.NonEmptyString;
  /**
   * An array of CIDR prefixes that are allowed to advertise over this transit gateway association.
   *
   * @remarks
   * Use CIDR notation, i.e. 10.0.0.0/16
   *
   * @see {@link https://docs.aws.amazon.com/directconnect/latest/UserGuide/allowed-to-prefixes.html}
   */
  readonly allowedPrefixes: t.NonEmptyString[];
  /**
   * (OPTIONAL) The friendly name of TGW route table(s) to associate with this attachment.
   *
   * @remarks
   * This is the logical `name` property of the route table(s) as defined in network-config.yaml.
   * @see {@link TransitGatewayRouteTableConfig}
   */
  readonly routeTableAssociations?: t.NonEmptyString[];
  /**
   * (OPTIONAL) The friendly name of TGW route table(s) to propagate routes from this attachment.
   *
   * @remarks
   * This is the logical `name` property of the route table(s) as defined in network-config.yaml.
   * @see {@link TransitGatewayRouteTableConfig}
   */
  readonly routeTablePropagations?: t.NonEmptyString[];
}

/**
 * *{@link NetworkConfig} / {@link DxGatewayConfig}*
 *
 * {@link https://docs.aws.amazon.com/directconnect/latest/UserGuide/direct-connect-gateways-intro.html | Direct Connect Gateway (DXGW)} configuration.
 * Use this configuration to define DXGWs,
 * {@link https://docs.aws.amazon.com/directconnect/latest/UserGuide/Welcome.html#overview-components | virtual interfaces},
 * and {@link https://docs.aws.amazon.com/directconnect/latest/UserGuide/direct-connect-gateways.html | DXGW associations}.
 *
 * @description
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
export interface IDxGatewayConfig {
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
  readonly name: t.NonEmptyString;
  /**
   * The friendly name of the account to deploy the DX Gateway.
   *
   * @remarks
   * This is the logical `name` property of the account as defined in accounts-config.yaml.
   */
  readonly account: t.NonEmptyString;
  /**
   * A Border Gateway Protocol (BGP) Autonomous System Number (ASN).
   *
   * @remarks
   * The range is 64512 to 65534 for 16-bit ASNs.
   *
   * The range is 4200000000 to 4294967294 for 32-bit ASNs.
   */
  readonly asn: number;
  /**
   * The name of the Direct Connect Gateway.
   * This name will show as the name of the resource
   * in the AWS console and API.
   *
   * @remarks
   * This name can be changed without replacing the physical resource.
   */
  readonly gatewayName: t.NonEmptyString;
  /**
   * (OPTIONAL) An array of virtual interface configurations. Creates virtual interfaces on the DX gateway.
   *
   * @see {@link DxVirtualInterfaceConfig}
   */
  readonly virtualInterfaces?: IDxVirtualInterfaceConfig[];
  /**
   * (OPTIONAL) An array of transit gateway association configurations. Creates transit gateway attachments for this DX gateway.
   *
   * @see {@link DxTransitGatewayAssociationConfig}
   */
  readonly transitGatewayAssociations?: IDxTransitGatewayAssociationConfig[];
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link IpamConfig} / {@link IpamScopeConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/ipam/add-scope-ipam.html | VPC IPAM scope} configuration.
 *
 * @description
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
export interface IIpamScopeConfig {
  /**
   * A friendly name for the IPAM scope.
   *
   * @remarks
   * **CAUTION**: Changing this value after initial deployment
   * will cause the scope to be recreated.
   * Please be aware that any downstream dependencies may cause
   * this property update to fail.
   */
  readonly name: t.NonEmptyString;
  /**
   * (OPTIONAL) Description for the IPAM scope.
   */
  readonly description?: t.NonEmptyString;
  /**
   * (OPTIONAL) An array of tag objects for the IPAM scope.
   */
  readonly tags?: t.ITag[];
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link IpamConfig} / {@link IpamPoolConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/ipam/how-it-works-ipam.html | VPC IPAM pool} configuration.
 *
 * @description
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
export interface IIpamPoolConfig {
  /**
   * A friendly name for the IPAM pool.
   *
   * @remarks
   * **CAUTION**: Changing this value after initial deployment
   * will cause the pool to be recreated.
   * Please be aware that any downstream dependencies may cause
   * this property update to fail.
   */
  readonly name: t.NonEmptyString;
  /**
   * The address family for the IPAM pool.
   *
   * @remarks
   * The default value is `ipv4`.
   *
   * @see {@link IpVersionType}
   */
  readonly addressFamily?: IpVersionType;
  /**
   * (OPTIONAL) The friendly name of the IPAM scope to assign the IPAM pool to.
   *
   * @remarks
   * Note: This is the logical `name` property of the scope as defined in network-config.yaml.
   * Leave this property undefined to create the pool in the default private scope.
   *
   * @see {@link IpamScopeConfig}
   */
  readonly scope?: t.NonEmptyString;
  /**
   * (OPTIONAL) The default netmask length of IPAM allocations for this pool.
   *
   * @remarks
   * Setting this property will enforce a default netmask length for all IPAM allocations in this pool.
   */
  readonly allocationDefaultNetmaskLength?: number;
  /**
   * (OPTIONAL) The maximum netmask length of IPAM allocations for this pool.
   *
   * @remarks
   * Setting this property will enforce a maximum netmask length for all IPAM allocations in this pool.
   * This value must be larger than the `allocationMinNetmaskLength` value.
   */
  readonly allocationMaxNetmaskLength?: number;
  /**
   * (OPTIONAL) The minimum netmask length of IPAM allocations for this pool.
   *
   * @remarks
   * Setting this property will enforce a minimum netmask length for all IPAM allocations in this pool.
   * This value must be less than the `allocationMaxNetmaskLength` value.
   */
  readonly allocationMinNetmaskLength?: number;
  /**
   * (OPTIONAL) An array of tags that are required for resources that use CIDRs from this IPAM pool.
   *
   * @remarks
   * Resources that do not have these tags will not be allowed to allocate space from the pool.
   */
  readonly allocationResourceTags?: t.ITag[];
  /**
   * (OPTIONAL) If set to `true`, IPAM will continuously look for resources within the CIDR range of this pool
   * and automatically import them as allocations into your IPAM.
   */
  readonly autoImport?: boolean;
  /**
   * (OPTIONAL) A description for the IPAM pool.
   */
  readonly description?: t.NonEmptyString;
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
  readonly locale?: t.Region;
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
  readonly provisionedCidrs?: t.NonEmptyString[];
  /**
   * (OPTIONAL) Determines if a pool is publicly advertisable.
   *
   * @remarks
   * This option is not available for pools with AddressFamily set to ipv4.
   */
  readonly publiclyAdvertisable?: boolean;
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
  readonly shareTargets?: t.IShareTargets;
  /**
   * (OPTIONAL) The friendly name of the source IPAM pool to create this IPAM pool from.
   *
   * @remarks
   * Only define this value when creating regional IPAM pools. Leave undefined for top-level pools.
   */
  readonly sourceIpamPool?: t.NonEmptyString;
  /**
   * (OPTIONAL) An array of tag objects for the IPAM pool.
   */
  readonly tags?: t.ITag[];
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link IpamConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/ipam/what-it-is-ipam.html | Virtual Private Cloud (VPC) IP Address Manager (IPAM)} configuration.
 *
 * @description
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
export interface IIpamConfig {
  /**
   * A friendly name for the IPAM.
   *
   * @remarks
   * **CAUTION**: Changing this value after initial deployment will cause the IPAM to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: t.NonEmptyString;
  /**
   * The region to deploy the IPAM.
   *
   * @remarks
   * Note that IPAMs must be deployed to a single region but may be used to manage allocations in multiple regions.
   * Configure the `operatingRegions` property to define multiple regions to manage.
   */
  readonly region: t.Region;
  /**
   * (OPTIONAL) A description for the IPAM.
   */
  readonly description?: t.NonEmptyString;
  /**
   * (OPTIONAL) An array of regions that the IPAM will manage.
   */
  readonly operatingRegions?: t.Region[];
  /**
   * (OPTIONAL) An array of IPAM scope configurations to create under the IPAM.
   *
   * @see {@link IpamScopeConfig}
   */
  readonly scopes?: IIpamScopeConfig[];
  /**
   * An optional array of IPAM pool configurations to create under the IPAM.
   *
   * @see {@link IpamPoolConfig}
   */
  readonly pools?: IIpamPoolConfig[];
  /**
   * (OPTIONAL) An array of tag objects for the IPAM.
   */
  readonly tags?: t.ITag[];
}

export type RouteTableEntryType =
  | 'transitGateway'
  | 'natGateway'
  | 'internetGateway'
  | 'egressOnlyIgw'
  | 'local'
  | 'localGateway'
  | 'gatewayEndpoint'
  | 'gatewayLoadBalancerEndpoint'
  | 'networkFirewall'
  | 'networkInterface'
  | 'virtualPrivateGateway'
  | 'vpcPeering';

export type GatewayRouteTableType = 'internetGateway' | 'virtualPrivateGateway';

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link RouteTableConfig} / {@link RouteTableEntryConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Route_Tables.html | VPC route table} static route entry configuration.
 *
 * @description
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
 * NAT Gateway
 * ```
 * - name: NatRoute
 *   destination: 0.0.0.0/0
 *   type: natGateway
 *   target: Nat-A
 * ```
 *
 * Internet Gateway
 * ```
 * - name: IgwRoute
 *   destination: 0.0.0.0/0
 *   type: internetGateway
 * ```
 *
 * VPC Peering
 * ```
 * - name: PeerRoute
 *   destination: 10.0.0.0/16
 *   type: vpcPeering
 *   target: Peering
 * ```
 *
 * Network Firewall with CIDR destination:
 * ```
 * - name: NfwRoute
 *   destination: 0.0.0.0/0
 *   type: networkFirewall
 *   target: accelerator-firewall
 *   targetAvailabilityZone: a
 * ```
 *
 * Network Firewall with subnet destination:
 * ```
 * - name: NfwRoute
 *   destination: subnet-a
 *   type: networkFirewall
 *   target: accelerator-firewall
 *   targetAvailabilityZone: a
 * ```
 *
 * Gateway Load Balancer Endpoint with CIDR destination:
 * ```
 * - name: GwlbRoute
 *   destination: 0.0.0.0/0
 *   type: gatewayLoadBalancerEndpoint
 *   target: Endpoint-A
 * ```
 *
 * Gateway Load Balancer Endpoint with subnet destination:
 * ```
 * - name: GwlbRoute
 *   destination: subnet-a
 *   type: gatewayLoadBalancerEndpoint
 *   target: Endpoint-A
 * ```
 *
 * Local Gateway associated with an AWS Outpost:
 * ```
 * - name: LgwRoute
 *   destination: 10.0.0.0/16
 *   type: localGateway
 *   target: LocalGateway-A
 * ```
 *
 * Network Interface associated with a dynamic lookup:
 * * **NOTE:** This lookup value is not supported for firewalls defined in {@link Ec2FirewallAutoScalingGroupConfig}. The interface must have the associateElasticIp property set to 'true' or the sourceDestCheck property set to 'false'
 * ```
 * - name: EniRoute
 *   destination: 10.0.0.0/16
 *   type: networkInterface
 *   target: ${ACCEL_LOOKUP::EC2:ENI_0:accelerator-firewall:Id}
 * ```
 *
 * Network Interface associated with an explicit ENI Id:
 * ```
 * - name: EniRoute
 *   destination: 10.0.0.0/16
 *   type: networkInterface
 *   target: eni-0123456789abcdef
 * ```
 *
 * IPv6 route targeting an Egress-only IGW:
 * ```
 * - name: EigwRoute
 *   ipv6Destination: ::/0
 *   type: egressOnlyIgw
 * ```
 *
 */
export interface IRouteTableEntryConfig {
  /**
   * A friendly name for the route table.
   *
   * @remarks
   * **CAUTION**: Changing this value after initial deployment will cause the route table to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   */
  readonly name: t.NonEmptyString;
  /**
   * (OPTIONAL) The destination IPv4 CIDR block or dynamic subnet reference for the route table entry.
   *
   * @remarks
   * You can either use IPv4 CIDR notation (i.e. 10.0.0.0/16) or target a subnet by referencing its logical `name` property.
   * If referencing a subnet name, the subnet MUST be defined in the same VPC. This feature is intended for ingress routing scenarios
   * where a gateway route table must target a Gateway Load Balancer or Network Firewall endpoint in a dynamic IPAM-created subnet.
   * @see {@link SubnetConfig} and {@link RouteTableConfig}.
   *
   * `destination`, `ipv6Destination`, or `destinationPrefixList` must be specified for the following route entry types:
   * `transitGateway`, `natGateway`, `internetGateway`, `networkInterface`, `vpcPeering`, `virtualPrivateGateway`.
   *
   * `destination` or `ipv6Destination` MUST be specified for route entry type `networkFirewall` or `gatewayLoadBalancerEndpoint`.
   *
   * Note: Leave undefined for route entry type `gatewayEndpoint`.
   */
  readonly destination?: t.NonEmptyString;
  /**
   * The friendly name of the destination prefix list for the route table entry.
   *
   * @remarks
   * This is the logical `name` property of the prefix list as defined in network-config.yaml.
   *
   * `destination`, `ipv6Destination`, or `destinationPrefixList` must be specified for the following route entry types:
   * `transitGateway`, `natGateway`, `internetGateway`, `egressOnlyIgw`, `networkInterface`, `vpcPeering`, `virtualPrivateGateway`.
   *
   * Cannot be specified for route entry type `networkFirewall` or `gatewayLoadBalancerEndpoint`. Use `destination` or `ipv6Destination` instead.
   *
   * Note: Leave undefined for route entry type `gatewayEndpoint`.
   *
   * @see {@link PrefixListConfig}
   */
  readonly destinationPrefixList?: t.NonEmptyString;
  /**
   * (OPTIONAL) The destination IPv6 CIDR block or dynamic subnet reference for the route table entry.
   *
   * @remarks
   * You can either use IPv6 CIDR notation (i.e. fd00::/8) or target a subnet by referencing its logical `name` property.
   * If referencing a subnet name, the subnet MUST be defined in the same VPC. This feature is intended for ingress routing scenarios
   * where a gateway route table must target a Gateway Load Balancer or Network Firewall endpoint in a dynamic IPAM-created subnet.
   * @see {@link SubnetConfig} and {@link RouteTableConfig}.
   *
   * `destination`, `ipv6Destination`, or `destinationPrefixList` must be specified for the following route entry types:
   * `transitGateway`, `natGateway`, `internetGateway`, `egressOnlyIgw`, `networkInterface`, `vpcPeering`, `virtualPrivateGateway`.
   *
   * `destination` or `ipv6Destination` MUST be specified for route entry type `networkFirewall` or `gatewayLoadBalancerEndpoint`.
   *
   * Note: Leave undefined for route entry type `gatewayEndpoint`.
   */
  readonly ipv6Destination?: t.NonEmptyString;
  /**
   * The destination type of route table entry.
   *
   * @see {@link NetworkConfigTypes.routeTableEntryTypeEnum}
   */
  readonly type?: RouteTableEntryType;
  /**
   * The friendly name of the destination target.
   *
   * @remarks
   * Use `s3` or `dynamodb` as the string when specifying a route entry type of `gatewayEndpoint`.
   *
   * This is the logical `name` property of other target types as defined in network-config.yaml.
   *
   * Note: Leave undefined for route entry type `internetGateway`, `egressOnlyIgw`, or `virtualPrivateGateway`.
   */
  readonly target?: t.NonEmptyString;
  /**
   * The Availability Zone (AZ) the target resides in.
   *
   * @remarks
   * Include only the letter of the AZ name (i.e. 'a' for 'us-east-1a') to target a subnet created in a specific AZ. Use an integer
   * (i.e. 1) for subnets using a physical mapping ID to an AZ. Use the availability zone suffix e.g. "laz-1a" for Local Zones. Please reference the documentation {@link https://docs.aws.amazon.com/ram/latest/userguide/working-with-az-ids.html | Availability Zone IDs for your AWS resources}
   *  for more information.
   *
   * Note: Leave undefined for targets of route entry types other than `networkFirewall`.
   */
  readonly targetAvailabilityZone?: t.NonEmptyString | number;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link RouteTableConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Route_Tables.html | Virtual Private Cloud (VPC) route table} configuration.
 *
 * @description
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
export interface IRouteTableConfig {
  /**
   * A friendly name for the VPC route table.
   *
   * @remarks
   * **CAUTION**: Changing this value after initial deployment will cause the route table to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: t.NonEmptyString;
  /**
   * Designate a gateway to associate this route table with.
   *
   * @remarks
   * Note: Only define this property when creating a gateway route table. Leave undefined for subnet route tables.
   */
  readonly gatewayAssociation?: GatewayRouteTableType;
  /**
   * An array of VPC route table entry configuration objects.
   *
   * @see {@link RouteTableEntryConfig}
   */
  readonly routes?: IRouteTableEntryConfig[];
  /**
   * (OPTIONAL) An array of tag objects for the VPC route table.
   */
  readonly tags?: t.ITag[];
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / ({@link SubnetConfig}) / {@link IpamAllocationConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/ipam/how-it-works-ipam.html | VPC IPAM allocation} configuration.
 *
 * @description
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
export interface IIpamAllocationConfig {
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
  readonly ipamPoolName: t.NonEmptyString;
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
  readonly netmaskLength: number;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link SubnetConfig} / {@link SubnetPrivateDnsConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/configure-subnets.html#subnet-settings | Subnet Resource-Based Name} configuration.
 *
 * @description
 * Use this configuration to define custom DNS name settings for your VPC subnets.
 *
 * @example
 * ```
 * enableDnsAAAARecord: true
 * enableDnsARecord: true
 * hostNameType: resource-name
 * ```
 */
export interface ISubnetPrivateDnsConfig {
  /**
   * (OPTIONAL) Indicates whether to respond to DNS queries for instance hostname with DNS AAAA records.
   *
   * @default false
   */
  readonly enableDnsAAAARecord?: boolean;
  /**
   * (OPTIONAL) Indicates whether to respond to DNS queries for instance hostnames with DNS A records.
   *
   * @default false
   */
  readonly enableDnsARecord?: boolean;
  /**
   * The type of hostname for EC2 instances.
   *
   * @remarks
   * For IPv4 only subnets, an instance DNS name must be based on the instance IPv4 address.
   * For IPv6 only subnets, an instance DNS name must be based on the instance ID.
   * For dual-stack subnets, you can specify whether DNS names use the instance IPv4 address or the instance ID.
   */
  readonly hostnameType?: 'ip-name' | 'resource-name';
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link SubnetConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/configure-subnets.html | Virtual Private Cloud (VPC) subnet} configuration.
 *
 * @description
 * Use this configuration to define subnets for your VPC.
 * A subnet is a range of IP addresses in your VPC that can be used to create AWS resources, such as EC2 instances.
 *
 * @example
 * Static IPv4 CIDR:
 * ```
 * - name: accelerator-cidr-subnet-a
 *   availabilityZone: a
 *   routeTable: accelerator-cidr-subnet-a
 *   ipv4CidrBlock: 10.0.0.0/26
 *   tags: []
 * ```
 * Using the Physical ID for an Availability Zone
 * ```
 * - name: accelerator-cidr-subnet-a
 *   availabilityZone: 1
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
 * Static IPv6 CIDR:
 * ```
 * - name: accelerator-cidr-subnet-1
 *   availabilityZone: 1
 *   routeTable: accelerator-cidr-subnet-1
 *   ipv6CidrBlock: fd00::/64
 *   tags: []
 * ```
 */
export interface ISubnetConfig {
  /**
   * A friendly name for the VPC subnet.
   *
   * @remarks
   * **CAUTION**: changing this property after initial deployment will cause a subnet recreation.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: t.NonEmptyString;
  /**
   * (OPTIONAL) Indicates whether a network interface created in this subnet receives an IPv6 address on creation.
   *
   * @remarks
   * If you specify this property, you must also specify the `ipv6CidrBlock` property.
   *
   * This property defaults to `false`.
   */
  readonly assignIpv6OnCreation?: boolean;
  /**
   * The Zone ID of the local zone.
   *
   * @remarks
   * **CAUTION**: changing this property after initial deployment will cause a subnet recreation.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * This will be the identifier of the local zone (ie - 'den-1a' for 'us-west-2-den-1a')
   *
   * @remarks
   * In order to use local zones, your account and region will have to opt-in. Steps to do so can be done through the {@link https://docs.aws.amazon.com/local-zones/latest/ug/getting-started.html | Getting Started documentation}.
   *
   * There are multiple use cases where local zones is not supported, see {@link https://docs.aws.amazon.com/local-zones/latest/ug/how-local-zones-work.html | use cases}.
   * For more general information, see {@link https://docs.aws.amazon.com/local-zones/latest/ug/available-local-zones.html | Available Local Zones} in the AWS Local Zones User Guide.
   */
  readonly localZone?: t.NonEmptyString;
  /**
   * The Availability Zone (AZ) the subnet resides in.
   *
   * @remarks
   * **CAUTION**: changing this property after initial deployment will cause a subnet recreation.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * Include only the letter of the AZ name (i.e. 'a' for 'us-east-1a') to have the subnet created in a specific AZ. Use an integer
   * (i.e. 1) for a physical mapping ID to an AZ. Please reference the documentation {@link https://docs.aws.amazon.com/ram/latest/userguide/working-with-az-ids.html | Availability Zone IDs for your AWS resources}
   *  for more information.
   */
  readonly availabilityZone?: t.NonEmptyString | number;
  /**
   * (OPTIONAL) Indicates whether DNS queries made to the Amazon-provided DNS Resolver in this subnet should return synthetic IPv6 addresses for IPv4-only destinations.
   *
   * For more information, see {@link https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html#nat-gateway-nat64-dns64 | DNS64 and NAT64} in the Amazon Virtual Private Cloud User Guide.
   */
  readonly enableDns64?: boolean;
  /**
   * The friendly name of the route table to associate with the subnet.
   */
  readonly routeTable?: t.NonEmptyString;
  /**
   * The IPv4 CIDR block to associate with the subnet.
   *
   * @remarks
   * **CAUTION**: changing this property after initial deployment will cause a subnet recreation.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * Use CIDR notation, i.e. 10.0.0.0/16
   */
  readonly ipv4CidrBlock?: t.NonEmptyString;
  /**
   * (OPTIONAL) The IPv6 CIDR block to associate with the subnet.
   *
   * @remarks
   * Use IPv6 CIDR notation, i.e. fd00::/64. Possible IPv6 netmask lengths are between /44 and /64 in increments of /4.
   *
   * **Note**: Only providing an IPv6 CIDR block or IPv6 IPAM allocation will create an IPv6-only subnet. You must also specify an
   * IPv4 CIDR or IPAM allocation to create a dual-stack subnet. See {@link https://docs.aws.amazon.com/vpc/latest/userguide/configure-subnets.html#subnet-basics | Subnet basics} for more information.
   *
   */
  readonly ipv6CidrBlock?: t.NonEmptyString;
  /**
   * (OPTIONAL) Configure automatic mapping of public IPs.
   *
   * @remarks
   * Enables you to configure the auto-assign IP settings to automatically request a public
   * IPv4 address for a new network interface in this subnet.
   */
  readonly mapPublicIpOnLaunch?: boolean;
  /**
   * The IPAM pool configuration for the subnet.
   *
   * @see {@link IpamAllocationConfig}
   *
   * @remarks
   * Must be using AWS-managed IPAM and allocate a CIDR to the VPC this subnet will be created in.
   * Define IPAM configuration in `centralNetworkServices`. @see {@link CentralNetworkServicesConfig}
   */
  readonly ipamAllocation?: IIpamAllocationConfig;
  /**
   * (OPTIONAL) Private DNS name options for the subnet.
   *
   * @see {@link SubnetPrivateDnsConfig}
   */
  readonly privateDnsOptions?: ISubnetPrivateDnsConfig;
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
  readonly shareTargets?: t.IShareTargets;
  /**
   * (OPTIONAL) An array of tag objects for the VPC subnet.
   */
  readonly tags?: t.ITag[];
  /**
   * (OPTIONAL) The friendly name for the outpost to attach to the subnet
   *
   * @remarks
   * This is the logical `name` of the outpost as defined in network-config.yaml.
   *
   * @see {@link OutpostsConfig}
   */
  readonly outpost?: t.NonEmptyString;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link NatGatewayConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html | Network Address Translation (NAT) Gateway} configuration.
 *
 * @description
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
export interface INatGatewayConfig {
  /**
   * A friendly name for the NAT Gateway.
   *
   * @remarks
   * **CAUTION**: changing this property after initial deployment will cause a NAT gateway recreation.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: t.NonEmptyString;
  /**
   * The friendly name of the subnet for the NAT Gateway to be deployed.
   *
   * @remarks
   * **CAUTION**: changing this property after initial deployment will cause a NAT gateway recreation.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly subnet: t.NonEmptyString;
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
  readonly allocationId?: t.NonEmptyString;
  /**
   * (OPTIONAL) Set `true` to define a NAT gateway with private connectivity type
   *
   * @remarks
   * **CAUTION**: changing this property after initial deployment will cause a NAT gateway recreation.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * Set to `false` or leave undefined to create a public-facing NAT gateway
   */
  readonly private?: boolean;
  /**
   * (OPTIONAL) An array of tag objects for the NAT Gateway.
   */
  readonly tags?: t.ITag[];
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link TransitGatewayAttachmentConfig} / {@link TransitGatewayAttachmentTargetConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/tgw/tgw-vpc-attachments.html | Transit Gateway attachment} target configuration.
 *
 * @description
 * Use this configuration to target a Transit Gateway when defining an attachment for your VPC.
 *
 * @example
 * ```
 * - name: Network-Main
 *   account: Network
 * ```
 */
export interface ITransitGatewayAttachmentTargetConfig {
  /**
   * A friendly name for the attachment target Transit Gateway.
   *
   * @remarks
   * This is the logical `name` property of the Transit Gateway as defined in network-config.yaml.
   *
   * @see {@link TransitGatewayConfig}
   */
  readonly name: t.NonEmptyString;
  /**
   * The friendly name of the account for the attachment target Transit Gateway.
   *
   * @remarks
   * This is the logical `account` property of the Transit Gateway as defined in network-config.yaml.
   *
   * @see {@link TransitGatewayConfig}.
   */
  readonly account: t.NonEmptyString;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link TransitGatewayAttachmentConfig} / {@link TransitGatewayAttachmentOptionsConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/tgw/tgw-vpc-attachments.html | Transit Gateway attachment} options configuration.
 *
 * @description
 * Used to specify advanced options for the VPC attachment.
 *
 * @example
 * ```
 * applianceModeSupport: enable
 * dnsSupport: enable
 * ipv6Support disable
 * ```
 */
export interface ITransitGatewayAttachmentOptionsConfig {
  /**
   * (OPTIONAL) Enable to configure DNS support for the attachment. This option is enabled by default.
   */
  readonly dnsSupport?: t.EnableDisable;
  /**
   * (OPTIONAL) Enable to configure IPv6 support for the attachment. This option is disabled by default.
   */
  readonly ipv6Support?: t.EnableDisable;
  /**
   * (OPTIONAL) Enable to configure appliance mode for the attachment. This option is disabled by default.
   *
   * @remarks
   * Appliance mode ensures only a single network interface is chosen for the entirety of a traffic flow,
   * enabling stateful deep packet inspection for the attached VPC.
   *
   * @see {@link https://docs.aws.amazon.com/vpc/latest/tgw/transit-gateway-appliance-scenario.html}
   */
  readonly applianceModeSupport?: t.EnableDisable;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link TransitGatewayAttachmentConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/tgw/tgw-vpc-attachments.html | Transit Gateway VPC attachment} configuration.
 *
 * @description
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
export interface ITransitGatewayAttachmentConfig {
  /**
   * A friendly name for the Transit Gateway attachment.
   *
   * @remarks
   * **CAUTION**: Changing this value after initial deployment will cause the attachment to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: t.NonEmptyString;
  /**
   * A Transit Gateway attachment target configuration object.
   *
   * @see {@link TransitGatewayAttachmentTargetConfig}
   */
  readonly transitGateway: ITransitGatewayAttachmentTargetConfig;
  /**
   * An array of the friendly names of VPC subnets for the attachment to be deployed.
   *
   * @remarks
   * **CAUTION**: Changing this value after initial deployment causes a new attachment to be created.
   * VPCs can only have a single attachment at a time.
   * To avoid core pipeline failures, use multiple core pipeline runs to 1) delete the existing VPC attachment and any
   * downstream dependencies and then 2) create a new attachment with your updated subnets.
   *
   * This is the logical `name` property of the subnet as defined in network-config.yaml.
   *
   * @see {@link SubnetConfig}
   */
  readonly subnets: t.NonEmptyString[];
  /**
   * (OPTIONAL) A Transit Gateway attachment options configuration.
   *
   * @see {@link TransitGatewayAttachmentOptionsConfig}
   */
  readonly options?: ITransitGatewayAttachmentOptionsConfig;
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
  readonly routeTableAssociations?: t.NonEmptyString[];
  /**
   * An array of friendly names of Transit Gateway route tables to propagate the attachment.
   */
  readonly routeTablePropagations?: t.NonEmptyString[];
  /**
   * (OPTIONAL) An array of tag objects for the Transit Gateway attachment.
   */
  readonly tags?: t.ITag[];
}

/**
 * *{@link NetworkConfig} / {@link TransitGatewayConnectConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/tgw/tgw-connect.html | Transit Gateway Connect VPC attachment} configuration.
 *
 * @description
 * Use this configuration to define a Transit Gateway Connect attachment to your VPC.
 * A Transit Gateway Connect attachment will establish a connection between a transit gateway and third-party virtual appliances (such as SD-WAN appliances)
 * running in a VPC. A Connect attachment supports the Generic Routing Encapsulation (GRE) tunnel protocol for high performance,
 * and Border Gateway Protocol (BGP) for dynamic routing.
 *
 * @example
 * ```
 * - name: Network-Vpc-Tgw-Connect
 *   region: us-east-1
 *   transitGateway:
 *     name: Network-Main
 *     account: Network
 *   vpc:
 *     vpcName: Network
 *     vpcAttachment: Network-Proxy
 *   options:
 *     protocol: gre
 * ```
 *
 * * @description
 * Use this configuration to define a Transit Gateway Connect attachment to your Direct Connect Gateway.
 *
 * @example
 * ```
 * - name: Network-Dx-Tgw-Connect
 *   region: us-east-1
 *   transitGateway:
 *     name: Network-Main
 *     account: Network
 *   directConnect: Dx-Onprem-IAD
 *   options:
 *     protocol: gre
 * ```
 */
export interface ITransitGatewayConnectConfig {
  /**
   * A friendly name for the Transit Gateway Connect attachment.
   *
   * @remarks
   * **CAUTION**: Changing this value after initial deployment will cause the attachment to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: t.NonEmptyString;
  /**
   * The AWS Region for the attachment.
   *
   * @remarks
   * This must be set in the same region as the Transit Gateway.
   */
  readonly region: t.NonEmptyString;
  /**
   * The Transit Gateway configuration object to set the Transit Gateway Connect.
   *
   * @see {@link TransitGatewayAttachmentTargetConfig}
   */
  readonly transitGateway: ITransitGatewayAttachmentTargetConfig;
  /**
   * The VPC Attachment that belongs to the Transit Gateway that a Transit Gateway Connect Attachment is being made for.
   * @see {@link TransitGatewayConnectVpcConfig}
   *
   * @remarks
   * Either `vpc` or `directConnect` must be provided, not both.
   */
  readonly vpc?: ITransitGatewayConnectVpcConfig;
  /**
   * (OPTIONAL) The Direct Connect Gateway Attachment that belongs to the Transit Gateway that a Transit Gateway Connect Attachment is being made for.
   * @see {@link TransitGatewayConnectDirectConnectConfig}
   *
   * @remarks
   * Either `vpc` or `directConnect` must be provided, not both.
   */
  readonly directConnect?: t.NonEmptyString;
  /**
   * (OPTIONAL) Options around the Transit Gateway Connect
   * @see {@link TransitGatewayConnectOptionsConfig}
   */
  readonly options?: ITransitGatewayConnectOptionsConfig;
  /**
   * (OPTIONAL) An array of tag objects for the Transit Gateway attachment.
   */
  readonly tags?: t.ITag[];
}

export interface ITransitGatewayConnectVpcConfig {
  /**
   * The name of the VPC
   */
  readonly vpcName: t.NonEmptyString;
  /**
   * The name of the VPC attachment
   */
  readonly vpcAttachment: t.NonEmptyString;
}

export interface ITransitGatewayConnectOptionsConfig {
  /**
   * The tunnel protocl for the Transit Gateway Connect
   */
  readonly protocol: TransitGatewayConnectProtocol;
}

export type TransitGatewayConnectProtocol = 'gre';
export type IpAddressFamilyType = 'IPv4' | 'IPv6';

/**
 * *{@link NetworkConfig} / {@link PrefixListConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/managed-prefix-lists.html | Customer-managed prefix list} configuration.
 *
 * @description
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

export interface IPrefixListConfig {
  /**
   * A friendly name for the prefix list.
   *
   * @remarks
   * **CAUTION**: Changing this value will cause the prefix list to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: t.NonEmptyString;
  /**
   * (DEPRECATED) An array of friendly names for the accounts the prefix list is deployed.
   *
   * @remarks
   * **NOTE**: This property is deprecated as of v1.4.0. It is recommended to use `deploymentTargets` instead.
   *
   * This is the logical `name` property of the account as defined in accounts-config.yaml.
   */
  readonly accounts?: t.NonEmptyString[];
  /**
   * (DEPRECATED) An array of region names for the prefix list to be deployed.
   *
   * @remarks
   * **NOTE**: This property is deprecated as of v1.4.0. It is recommended to use `deploymentTargets` instead.
   *
   * @see {@link Region}
   */
  readonly regions?: t.Region[];
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
  readonly deploymentTargets?: t.IDeploymentTargets;
  /**
   * The IP address family of the prefix list.
   */
  readonly addressFamily: IpAddressFamilyType;
  /**
   * The maximum allowed entries in the prefix list.
   */
  readonly maxEntries: number;
  /**
   * An array of CIDR entries for the prefix list.
   *
   * @remarks
   * The number of entries must be less than or equal to the `maxEntries` value.
   *
   * Use CIDR notation, i.e. 10.0.0.0/16
   */
  readonly entries: t.NonEmptyString[];
  /**
   * (OPTIONAL) An array of tag objects for the prefix list.
   */
  readonly tags?: t.ITag[];
}

export type GatewayEndpointType = 's3' | 'dynamodb';

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link GatewayEndpointConfig} / {@link GatewayEndpointServiceConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html | VPC gateway endpoint} service configuration.
 *
 * @description
 * Use this configuration to define the service and endpoint policy for gateway endpoints.
 *
 * @example
 * ```
 * - service: s3
 *   policy: Default
 * ```
 */
export interface IGatewayEndpointServiceConfig {
  /**
   * The name of the service to create the endpoint for
   *
   * @see {@link NetworkConfigTypes.gatewayEndpointEnum}
   */
  readonly service: GatewayEndpointType;
  /**
   * (OPTIONAL) The friendly name of a policy for the gateway endpoint. If left undefined, the default policy will be used.
   *
   * @remarks
   * This is the logical `name` property of the endpoint policy as defined in network-config.yaml.
   *
   * @see {@link EndpointPolicyConfig}
   */
  readonly policy?: t.NonEmptyString;
  /**
   * (OPTIONAL) Specify whether or not a policy is applied to the endpoint. By default, if no policy is specified in the `policy` property, a default policy is applied. Specifying this option as `false` will ensure no policy is applied to the endpoint. This property defaults to `true` if not specified.
   */
  readonly applyPolicy?: boolean;
  /**
   * (OPTIONAL) The full name of the service to create the endpoint for.
   *
   * @remarks
   * This property can be used to input the full endpoint service names that do not
   * conform with the standard `com.amazonaws.<REGION>.<SERVICE>` syntax.
   */
  readonly serviceName?: t.NonEmptyString;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link GatewayEndpointConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html | VPC gateway endpoint} configuration.
 *
 * @description
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
export interface IGatewayEndpointConfig {
  /**
   * The friendly name of the default policy for the gateway endpoints.
   *
   * @remarks
   * This is the logical `name` property of the endpoint policy as defined in network-config.yaml.
   *
   * @see {@link EndpointPolicyConfig}
   */
  readonly defaultPolicy: t.NonEmptyString;
  /**
   * An array of endpoints to create.
   */
  readonly endpoints: IGatewayEndpointServiceConfig[];
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link InterfaceEndpointConfig} / {@link InterfaceEndpointServiceConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/privatelink/privatelink-access-aws-services.html | VPC interface endpoint} service configuration.
 *
 * @description
 * Use this configuration to define the service and endpoint policy for gateway endpoints.
 *
 * @example
 * ```
 * - service: ec2
 *   policy: Default
 * ```
 */
export interface IInterfaceEndpointServiceConfig {
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
  readonly service: t.NonEmptyString;
  /**
   * (OPTIONAL) The full name of the service to create the endpoint for.
   *
   * @remarks
   * This property can be used to input the full endpoint service names that do not
   * conform with the standard `com.amazonaws.<REGION>.<SERVICE>` syntax.
   */
  readonly serviceName?: t.NonEmptyString;
  /**
   * (OPTIONAL) The friendly name of a policy for the interface endpoint. If left undefined, the default policy will be used.
   *
   * @remarks
   * This is the logical `name` property of the endpoint policy as defined in network-config.yaml.
   *
   * @see {@link EndpointPolicyConfig}
   */
  readonly policy?: t.NonEmptyString;
  /**
   * (OPTIONAL) Specify whether or not a policy is applied to the endpoint. By default, if no policy is specified in the `policy` property, a default policy is applied. Specifying this option as `false` will ensure no policy is applied to the endpoint. This property defaults to `true` if not specified.
   */
  readonly applyPolicy?: boolean;
  /**
   * (OPTIONAL) Apply the provided security group for this interface endpoint.
   */
  readonly securityGroup?: t.NonEmptyString;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link InterfaceEndpointConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/privatelink/privatelink-access-aws-services.html | VPC interface endpoint} configuration.
 *
 * @description
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
export interface IInterfaceEndpointConfig {
  /**
   * The friendly name of the default policy for the interface endpoints.
   *
   * @remarks
   * This is the logical `name` property of the endpoint policy as defined in network-config.yaml.
   *
   * @see {@link EndpointPolicyConfig}
   */
  readonly defaultPolicy: t.NonEmptyString;
  /**
   * An array of VPC interface endpoint services to be deployed.
   *
   * @see {@link InterfaceEndpointServiceConfig}
   */
  readonly endpoints: IInterfaceEndpointServiceConfig[];
  /**
   * An array of the friendly names of VPC subnets for the endpoints to be deployed.
   *
   * @remarks
   * This is the logical `name` property of the VPC subnet as defined in network-config.yaml.
   *
   * @see {@link SubnetConfig}
   */
  readonly subnets: t.NonEmptyString[];
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
  readonly central?: boolean;
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
  readonly allowedCidrs?: t.NonEmptyString[];
  /**
   * (OPTIONAL) An array of tag objects for the private hosted zones associated with the VPC Interface endpoints.
   */
  readonly tags?: t.ITag[];
}

export type SecurityGroupRuleType =
  | 'RDP'
  | 'SSH'
  | 'HTTP'
  | 'HTTPS'
  | 'MSSQL'
  | 'MYSQL/AURORA'
  | 'REDSHIFT'
  | 'POSTGRESQL'
  | 'ORACLE-RDS'
  | 'TCP'
  | 'UDP'
  | 'ICMP'
  | 'ALL';

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link SecurityGroupConfig} / {@link SecurityGroupRuleConfig} / {@link SubnetSourceConfig}*
 *
 * @description
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
export interface ISubnetSourceConfig {
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
  readonly account: t.NonEmptyString;
  /**
   * The friendly name of the VPC in which the subnet resides.
   *
   * @remarks
   * This is the logical `name` property of the VPC or VPC template as defined in network-config.yaml.
   *
   * @see {@link VpcConfig} | {@link VpcTemplatesConfig}
   */
  readonly vpc: t.NonEmptyString;
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
  readonly subnets: t.NonEmptyString[];
  /**
   * (OPTIONAL) Indicates whether to target the IPv6 CIDR associated with a subnet.
   *
   * @remarks
   * Leave this property undefined or set to `false` to target a subnet's IPv4 CIDR.
   */
  readonly ipv6?: boolean;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link SecurityGroupConfig} / {@link SecurityGroupRuleConfig} / {@link SecurityGroupSourceConfig}*
 *
 * @description
 * Security group source configuration.
 * Use this configuration to define a security group as a source of a security group rule.
 *
 * @example
 * ```
 * - securityGroups:
 *   - accelerator-sg
 * ```
 */
export interface ISecurityGroupSourceConfig {
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
  readonly securityGroups: t.NonEmptyString[];
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link SecurityGroupConfig} / {@link SecurityGroupRuleConfig} / {@link PrefixListSourceConfig}*
 *
 * @description
 * Prefix list security group source configuration.
 * Use this configuration to define a custom prefix list as a source in a security group rule.
 *
 * @example
 * ```
 * - prefixLists:
 *   - accelerator-pl
 * ```
 */
export interface IPrefixListSourceConfig {
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
  readonly prefixLists: t.NonEmptyString[];
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link SecurityGroupConfig} / {@link SecurityGroupRuleConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html | Security group rule} configuration.
 *
 * @description
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
 * IP Protocol:
 * ```
 * - description: 'IP Protocol Rule'
 *   ipProtocols:
 *     - ESP
 *     - IDRP
 *     - ST
 *   sources:
 *     - 10.0.0.0/8
 * ```
 */
export interface ISecurityGroupRuleConfig {
  /**
   * A description for the security group rule.
   */
  readonly description: t.NonEmptyString;
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
  readonly types?: SecurityGroupRuleType[];
  /**
   * (OPTIONAL) An array of custom IP Protocols for the security group rule
   *
   * @remarks
   * Use only IP protocols that aren't either of the following: 'RDP', 'SSH', 'HTTP',  'HTTPS', 'MSSQL',
   * 'MYSQL/AURORA', 'REDSHIFT', 'POSTGRESQL', 'ORACLE-RDS', 'TCP', 'UDP','ICMP','ALL'.
   *
   * For input values, please use values from the `Keyword` column via - https://www.iana.org/assignments/protocol-numbers/protocol-numbers.xhtml
   *
   * NOTE: Can only use `ipProtocols` or 'types'. If you need to allow the same source IP address, use multiple ingress/egress
   * rules.
   *
   *
   *
   */
  readonly ipProtocols?: string[];
  /**
   * (OPTIONAL) An array of TCP ports to include in the security group rule.
   *
   * @remarks
   * Use this property when you need to define ports that are not the common applications available in `types`.
   * Leave undefined if using the `types` property.
   */
  readonly tcpPorts?: number[];
  /**
   * (OPTIONAL) An array of UDP ports to include in the security group rule.
   *
   * @remarks
   * Use this property when you need to define ports that are not the common applications available in `types`.
   * Leave undefined if using the `types` property.
   */
  readonly udpPorts?: number[];
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
  readonly fromPort?: number;
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
  readonly toPort?: number;
  /**
   * An array of sources for the security group rule.
   *
   * @remarks
   * Valid sources are CIDR ranges, security group rules, prefix lists, and subnets.
   *
   * @see
   * {@link SecurityGroupSourceConfig} | {@link PrefixListSourceConfig} | {@link SubnetSourceConfig}
   */
  readonly sources: (t.NonEmptyString | ISubnetSourceConfig | ISecurityGroupSourceConfig | IPrefixListSourceConfig)[];
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link SecurityGroupConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/security-groups.html | Security group} configuration.
 *
 * @description
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
export interface ISecurityGroupConfig {
  /**
   * The friendly name of the security group.
   *
   * @remarks
   * **CAUTION**: Changing this value after initial deployment will cause the security group to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: t.NonEmptyString;
  /**
   * (OPTIONAL) A description for the security group.
   */
  readonly description?: t.NonEmptyString;
  /**
   * An array of security group rule configurations for ingress rules.
   *
   * @remarks
   * **NOTE**: Changing values under this configuration object after initial deployment
   * may cause some interruptions to network traffic while the security group is being updated.
   *
   * @see {@link SecurityGroupRuleConfig}
   */
  readonly inboundRules: ISecurityGroupRuleConfig[];
  /**
   * An array of security group rule configurations for egress rules.
   *
   * @remarks
   * **NOTE**: Changing values under this configuration object after initial deployment
   * may cause some interruptions to network traffic while the security group is being updated.
   *
   * @see {@link SecurityGroupRuleConfig}
   */
  readonly outboundRules: ISecurityGroupRuleConfig[];
  /**
   * (OPTIONAL) An array of tag objects for the security group.
   */
  readonly tags?: t.ITag[];
}

export type InstanceTenancyType = 'default' | 'dedicated';

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link NetworkAclConfig} / {@link NetworkAclInboundRuleConfig} | {@link NetworkAclOutboundRuleConfig} / {@link NetworkAclSubnetSelection}*
 *
 * @description
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
export interface INetworkAclSubnetSelection {
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
  readonly account?: t.NonEmptyString;
  /**
   * The friendly name of the VPC of the subnet.
   *
   * @remarks
   * This is the logical `name` property of the VPC or VPC template as defined in network-config.yaml.
   *
   * @see {@link VpcConfig} | {@link VpcTemplatesConfig}
   */
  readonly vpc: t.NonEmptyString;
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
  readonly subnet: t.NonEmptyString;
  /**
   * (OPTIONAL) Indicates whether to target the IPv6 CIDR associated with a subnet.
   *
   * @remarks
   * Leave this property undefined or set to `false` to target a subnet's IPv4 CIDR.
   */
  readonly ipv6?: boolean;
  /**
   * (OPTIONAL) The region that the subnet is located in.
   *
   * @remarks
   * This property only needs to be defined if targeting a subnet in a different region
   * than the one in which this VPC is deployed.
   */
  readonly region?: t.Region;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link NetworkAclConfig} / {@link NetworkAclInboundRuleConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html#nacl-rules | Network ACL inbound rule} configuration.
 *
 * @description
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
export interface INetworkAclInboundRuleConfig {
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
  readonly rule: number;
  /**
   * The {@link https://www.iana.org/assignments/protocol-numbers/protocol-numbers.xhtml | IANA protocol number} for the network ACL rule.
   * You may also specify -1 for all protocols.
   */
  readonly protocol: number;
  /**
   * The port to start from in the network ACL rule.
   */
  readonly fromPort: number;
  /**
   * The port to end with in the network ACL rule.
   */
  readonly toPort: number;
  /**
   * The action for the network ACL rule.
   */
  readonly action: t.AllowDeny;
  /**
   * The source of the network ACL rule.
   *
   * @remarks
   * Possible values are a CIDR range or a network ACL subnet selection configuration.
   *
   * @see {@link NetworkAclSubnetSelection}
   */
  readonly source: t.NonEmptyString | INetworkAclSubnetSelection;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link NetworkAclConfig} / {@link NetworkAclOutboundRuleConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html#nacl-rules | Network ACL outbound rule} configuration.
 *
 * @description
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
export interface INetworkAclOutboundRuleConfig {
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
  readonly rule: number;
  /**
   * The {@link https://www.iana.org/assignments/protocol-numbers/protocol-numbers.xhtml | IANA protocol number} for the network ACL rule.
   * You may also specify -1 for all protocols.
   */
  readonly protocol: number;
  /**
   * The port to start from in the network ACL rule.
   */
  readonly fromPort: number;
  /**
   * The port to end with in the network ACL rule.
   */
  readonly toPort: number;
  /**
   * The action for the network ACL rule.
   */
  readonly action: t.AllowDeny;
  /**
   * The destination of the network ACL rule.
   *
   * @remarks
   * Possible values are a CIDR range or a network ACL subnet selection configuration.
   *
   * @see {@link NetworkAclSubnetSelection}
   */
  readonly destination: t.NonEmptyString | INetworkAclSubnetSelection;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link NetworkAclConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html | Network access control list (ACL)} configuration.
 *
 * @description
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
export interface INetworkAclConfig {
  /**
   * The name of the Network ACL.
   *
   * @remarks
   * **CAUTION**: Changing this property value causes the network ACL to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   * Please also note that your network traffic may be temporarily impacted while the ACL is updated.
   */
  readonly name: t.NonEmptyString;
  /**
   * A list of subnets to associate with the Network ACL
   *
   * @remarks
   * This is the logical `name` property of the subnet as defined in network-config.yaml.
   *
   * @see {@link SubnetConfig}
   */
  readonly subnetAssociations: t.NonEmptyString[];
  /**
   * (OPTIONAL) A list of inbound rules to define for the Network ACL
   *
   * @see {@link NetworkAclInboundRuleConfig}
   */
  readonly inboundRules?: INetworkAclInboundRuleConfig[];
  /**
   * (OPTIONAL) A list of outbound rules to define for the Network ACL
   *
   * @see {@link NetworkAclOutboundRuleConfig}
   */
  readonly outboundRules?: INetworkAclOutboundRuleConfig[];
  /**
   * (OPTIONAL) A list of tags to attach to the Network ACL
   */
  readonly tags?: t.ITag[];
}

export type NetbiosNodeType = 1 | 2 | 4 | 8;

/**
 * *{@link NetworkConfig} / {@link DhcpOptsConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/VPC_DHCP_Options.html | VPC Dynamic Host Configuration Protocol (DHCP) options sets} configuration.
 *
 * @description
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
export interface IDhcpOptsConfig {
  /**
   * A friendly name for the DHCP options set.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the DHCP options set to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: t.NonEmptyString;
  /**
   * An array of friendly account names to deploy the options set.
   *
   * @remarks
   * This is the logical `name` property of the account as defined in accounts-config.yaml.
   */
  readonly accounts: t.NonEmptyString[];
  /**
   * An array of regions to deploy the options set.
   *
   * @see {@link Region}
   */
  readonly regions: t.Region[];
  /**
   * (OPTIONAL) A domain name to assign to hosts using the options set.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the DHCP options set to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly domainName?: t.NonEmptyString;
  /**
   * (OPTIONAL) An array of IP addresses for domain name servers.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the DHCP options set to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly domainNameServers?: t.NonEmptyString[];
  /**
   * (OPTIONAL An array of IP addresses for NetBIOS servers.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the DHCP options set to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly netbiosNameServers?: t.NonEmptyString[];
  /**
   * (OPTIONAL) The NetBIOS node type number.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the DHCP options set to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * @see {@link NetworkConfigTypes.netbiosNodeEnum}
   */
  readonly netbiosNodeType?: NetbiosNodeType;
  /**
   * (OPTIONAL) An array of IP addresses for NTP servers.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the DHCP options set to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly ntpServers?: t.NonEmptyString[];
  /**
   * (OPTIONAL) An array of tags for the options set.
   */
  readonly tags?: t.ITag[];
}

export type MutationProtectionType = 'ENABLED' | 'DISABLED';

export interface IVpcDnsFirewallAssociationConfig {
  readonly name: t.NonEmptyString;
  readonly priority: number;
  readonly mutationProtection?: MutationProtectionType;
  readonly tags?: t.ITag[];
}

/**
 * *{@link NetworkConfig} / {@link EndpointPolicyConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-access.html | Virtual Private Cloud (VPC) endpoint policy} configuration.
 *
 * @description
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
export interface IEndpointPolicyConfig {
  /**
   * A friendly name for the endpoint policy.
   *
   * @remarks
   * You use this logical `name` property as a reference to apply this policy
   * to VPC gateway and interface endpoint configurations.
   *
   * @see {@link GatewayEndpointConfig} | {@link  InterfaceEndpointConfig}
   */
  readonly name: t.NonEmptyString;
  /**
   * A file path for a JSON-formatted policy document.
   *
   * @remarks
   * The referenced file path must exist in your accelerator configuration repository.
   * The document must be valid JSON syntax.
   */
  readonly document: t.NonEmptyString;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} / {@link OutpostsConfig} / {@link LocalGatewayConfig} / {@link LocalGatewayRouteTableConfig}*
 *
 * {@link  https://docs.aws.amazon.com/outposts/latest/userguide/routing.html | Outposts Local Gateway route table} configuration.
 *
 * @description
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
export interface ILocalGatewayRouteTableConfig {
  /**
   * A friendly name for the Route Table
   *
   * @remarks
   * This is a logical `name` property that can be used to reference the route table in subnet configurations.
   *
   * @see {@link SubnetConfig}
   */
  readonly name: t.NonEmptyString;
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
  readonly id: t.NonEmptyString;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} / {@link OutpostsConfig} / {@link LocalGatewayConfig}*
 *
 * {@link https://docs.aws.amazon.com/outposts/latest/userguide/outposts-local-gateways.html | Outposts Local Gateway} configuration.
 *
 * @description
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
export interface ILocalGatewayConfig {
  /**
   * A friendly name for the Local Gateway
   */
  readonly name: t.NonEmptyString;
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
  readonly id: t.NonEmptyString;
  /**
   * The route tables for the Local Gateway
   */
  readonly routeTables: ILocalGatewayRouteTableConfig[];
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} / {@link OutpostsConfig}*
 *
 * {@link https://docs.aws.amazon.com/outposts/latest/userguide/what-is-outposts.html | AWS Outposts} configuration.
 *
 * @description
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
export interface IOutpostsConfig {
  /**
   * A friendly name for the Outpost
   *
   * @remarks
   * This is a logical `name` property that can be used to reference the outpost in subnet configurations.
   *
   * @see {@link SubnetConfig}
   */
  readonly name: t.NonEmptyString;
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
  readonly arn: t.NonEmptyString;
  /**
   * The availability zone where the Outpost resides
   *
   * @remarks
   * Include only the letter of the AZ name (i.e. 'a' for 'us-east-1a') to target a subnet created in a specific AZ. Use an integer
   * (i.e. 1) for subnets using a physical mapping ID to an AZ. Please reference the documentation {@link https://docs.aws.amazon.com/ram/latest/userguide/working-with-az-ids.html | Availability Zone IDs for your AWS resources}
   *  for more information.
   */
  readonly availabilityZone: t.NonEmptyString | number;
  /**
   * The Local Gateway configuration for the Outpost
   */
  readonly localGateway?: ILocalGatewayConfig;
}

export type DpdTimeoutActionType = 'clear' | 'none' | 'restart';
export type StartupActionType = 'add' | 'start';
export type IkeVersionType = 1 | 2;
export type Phase1DhGroupType = 2 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24;
export type Phase2DhGroupType = 2 | 5 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24;
export type EncryptionAlgorithmType = 'AES128' | 'AES256' | 'AES128-GCM-16' | 'AES256-GCM-16';
export type IntegrityAlgorithmType = 'SHA1' | 'SHA2-256' | 'SHA2-384' | 'SHA2-512';
export type VpnLoggingOutputFormatType = 'json' | 'text';

/**
 * *{@link NetworkConfig} / {@link CustomerGatewayConfig} / {@link VpnConnectionConfig} / {@link VpnTunnelOptionsSpecificationsConfig} / {@link Phase1Config}*
 *
 * @description
 * Internet Key Exchange (IKE) Phase 1 tunnel options configuration.
 * Use this configuration to restrict the permitted Diffie-Hellman group numbers, encryption algorithms, and integrity algorithms for IKE Phase 1 negotiations.
 * You may also modify the Phase 1 lifetime for the VPN tunnel.
 *
 * @example
 * ```
 * dhGroups: [14, 20, 24]
 * encryptionAlgorithms: [AES256, AES256-GCM-16]
 * integrityAlgorithms: [SHA2-256, SHA2-384, SHA2-512]
 * lifetime: 3600
 * ```
 */
export interface IPhase1Config {
  /**
   * (OPTIONAL) An array of permitted Diffie-Hellman group numbers used in the IKE Phase 1 for initial authentication.
   *
   * Default - `[2, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]`
   *
   * @remarks
   * If you update this property after deployment, your VPN tunnel will become temporarily unavailable. Please see
   * {@link https://docs.aws.amazon.com/vpn/latest/s2svpn/endpoint-replacements.html#endpoint-replacements-for-vpn-modifications | Customer initiated endpoint replacements} for
   * additional details.
   */
  readonly dhGroups?: Phase1DhGroupType[];
  /**
   * (OPTIONAL) An array of encryption algorithms permitted for IKE Phase 1 negotiations.
   *
   * Default - `[AES128, AES256, AES128-GCM-16, AES256-GCM-16]`
   *
   * @remarks
   * If you update this property after deployment, your VPN tunnel will become temporarily unavailable. Please see
   * {@link https://docs.aws.amazon.com/vpn/latest/s2svpn/endpoint-replacements.html#endpoint-replacements-for-vpn-modifications | Customer initiated endpoint replacements} for
   * additional details.
   */
  readonly encryptionAlgorithms?: EncryptionAlgorithmType[];
  /**
   * (OPTIONAL) An array of integrity algorithms permitted for IKE Phase 1 negotiations.
   *
   * Default - `[SHA1, SHA2-256, SHA2-384, SHA2-512]`
   *
   * @remarks
   * If you update this property after deployment, your VPN tunnel will become temporarily unavailable. Please see
   * {@link https://docs.aws.amazon.com/vpn/latest/s2svpn/endpoint-replacements.html#endpoint-replacements-for-vpn-modifications | Customer initiated endpoint replacements} for
   * additional details.
   */
  readonly integrityAlgorithms?: IntegrityAlgorithmType[];
  /**
   * (OPTIONAL) The IKE Phase 1 lifetime (in seconds) for the VPN tunnel.
   *
   * Default: `28800` (8 hours)
   *
   * @remarks
   * If you update this property after deployment, your VPN tunnel will become temporarily unavailable. Please see
   * {@link https://docs.aws.amazon.com/vpn/latest/s2svpn/endpoint-replacements.html#endpoint-replacements-for-vpn-modifications | Customer initiated endpoint replacements} for
   * additional details.
   *
   * You can specify a value between 900 and 28800
   */
  readonly lifetimeSeconds?: number;
}

/**
 * *{@link NetworkConfig} / {@link CustomerGatewayConfig} / {@link VpnConnectionConfig} / {@link VpnTunnelOptionsSpecificationsConfig} / {@link Phase2Config}*
 *
 * @description
 * Internet Key Exchange (IKE) Phase 2 tunnel options configuration.
 * Use this configuration to restrict the permitted Diffie-Hellman group numbers, encryption algorithms, and integrity algorithms for IKE Phase 2 negotiations.
 * You may also modify the Phase 2 lifetime for the VPN tunnel.
 *
 * @example
 * ```
 * dhGroups: [14, 20, 24]
 * encryptionAlgorithms: [AES256, AES256-GCM-16]
 * integrityAlgorithms: [SHA2-256, SHA2-384, SHA2-512]
 * lifetime: 1800
 * ```
 */
export interface IPhase2Config {
  /**
   * (OPTIONAL) An array of permitted Diffie-Hellman group numbers used in the IKE Phase 2 negotiations.
   *
   * Default - `[2, 5, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]`
   *
   * @remarks
   * If you update this property after deployment, your VPN tunnel will become temporarily unavailable. Please see
   * {@link https://docs.aws.amazon.com/vpn/latest/s2svpn/endpoint-replacements.html#endpoint-replacements-for-vpn-modifications | Customer initiated endpoint replacements} for
   * additional details.
   */
  readonly dhGroups?: Phase2DhGroupType[];
  /**
   * (OPTIONAL) An array of encryption algorithms permitted for IKE Phase 2 negotiations.
   *
   * Default - `[AES128, AES256, AES128-GCM-16, AES256-GCM-16]`
   *
   * @remarks
   * If you update this property after deployment, your VPN tunnel will become temporarily unavailable. Please see
   * {@link https://docs.aws.amazon.com/vpn/latest/s2svpn/endpoint-replacements.html#endpoint-replacements-for-vpn-modifications | Customer initiated endpoint replacements} for
   * additional details.
   */
  readonly encryptionAlgorithms?: EncryptionAlgorithmType[];
  /**
   * (OPTIONAL) An array of integrity algorithms permitted for IKE Phase 2 negotiations.
   *
   * Default - `[SHA1, SHA2-256, SHA2-384, SHA2-512]`
   *
   * @remarks
   * If you update this property after deployment, your VPN tunnel will become temporarily unavailable. Please see
   * {@link https://docs.aws.amazon.com/vpn/latest/s2svpn/endpoint-replacements.html#endpoint-replacements-for-vpn-modifications | Customer initiated endpoint replacements} for
   * additional details.
   */
  readonly integrityAlgorithms?: IntegrityAlgorithmType[];
  /**
   * (OPTIONAL) The IKE Phase 2 lifetime (in seconds) for the VPN tunnel.
   *
   * Default: `3600` (1 hour)
   *
   * @remarks
   * If you update this property after deployment, your VPN tunnel will become temporarily unavailable. Please see
   * {@link https://docs.aws.amazon.com/vpn/latest/s2svpn/endpoint-replacements.html#endpoint-replacements-for-vpn-modifications | Customer initiated endpoint replacements} for
   * additional details.
   *
   * You can specify a value between 900 and 3600
   */
  readonly lifetimeSeconds?: number;
}

/**
 * *{@link NetworkConfig} / {@link CustomerGatewayConfig} / {@link VpnConnectionConfig} / {@link VpnTunnelOptionsSpecificationsConfig} / {@link VpnLoggingConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpn/latest/s2svpn/monitoring-logs.html | AWS Site-to-Site VPN logging} configuration.
 *
 * @description
 * Use this configuration to define CloudWatch log groups for your Site-to-Site VPN connections.
 * AWS Site-to-Site VPN logs provide you with deeper visibility into your Site-to-Site VPN deployments.
 * With this feature, you have access to Site-to-Site VPN connection logs that provide details on IP Security (IPsec) tunnel establishment,
 * Internet Key Exchange (IKE) negotiations, and dead peer detection (DPD) protocol messages.
 *
 * @example
 * Custom settings:
 * ```
 * enable: true
 * logGroupName: /vpn/logs/accelerator-vpn/tunnel1
 * outputFormat: text
 * ```
 *
 * Default settings:
 * ```
 * enable: true
 * ```
 */
export interface IVpnLoggingConfig {
  /**
   * (OPTIONAL) Enable site-to-site VPN tunnel logging to CloudWatch Logs.
   *
   * @remarks
   * If you enable this property, a log group will be created along with the VPN connection.
   * You may customize the name of the log group using the `logGroupName` property.
   *
   * The global {@link cloudwatchLogRetentionInDays} configuration and accelerator-provisioned KMS key
   * will be applied to the log group.
   */
  readonly enable?: boolean;
  /**
   * (OPTIONAL) The name of the CloudWatch Logs log group that you would like tunnel logs to be sent to.
   *
   * Default - Randomly generated name based on CDK stack and VPN resource name.
   *
   * @remarks
   * If defined, this value must be unique within the account the VPN connection is deployed to.
   * For security purposes, your custom log group name will be prefixed with the Accelerator prefix
   * value (AWSAccelerator or the custom prefix defined in the installer stack)
   */
  readonly logGroupName?: t.NonEmptyString;
  /**
   * (OPTIONAL) The output format of the VPN tunnel logs.
   *
   * Default - `json`
   */
  readonly outputFormat?: VpnLoggingOutputFormatType;
}

/**
 * *{@link NetworkConfig} / {@link CustomerGatewayConfig} / {@link VpnConnectionConfig} / {@link VpnTunnelOptionsSpecificationsConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpn/latest/s2svpn/VPNTunnels.html | VPN tunnel options} specification configuration.
 *
 * @description
 * Use this configuration to define optional tunnel configurations for a site-to-site VPN connection.
 *
 * **IMPORTANT**: After initial deployment of your VPN connection with any of the v1.5.0+ options noted below, you can only make property changes to one VPN tunnel per core pipeline run.
 * You may make multiple property changes in that one VPN tunnel if necessary. Trying to modify properties in both tunnels will result in a pipeline failure. This is due to the fact that
 * only a single mutating API call can be made at a time for AWS Site-to-Site VPN connections.
 *
 * Note: you may manually roll back the resulting CloudFormation stack should you encounter this failure. More details on how to skip failed resources in the following reference:
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-continueupdaterollback.html
 *
 *
 * @example
 * Versions v1.5.0 and up:
 * ```
 * - dpdTimeoutAction: restart
 *   dpdTimeoutSeconds: 60
 *   ikeVersions: [2]
 *   logging:
 *     enable: true
 *   phase1:
 *     dhGroups: [14]
 *     encryptionAlgorithms: [AES256]
 *     integrityAlgorithms: [SHA2-256]
 *   phase2:
 *     dhGroups: [14]
 *     encryptionAlgorithms: [AES256]
 *     integrityAlgorithms: [SHA2-256]
 *   tunnelInsideCidr: 169.254.200.0/30
 *   preSharedKey: Key1-AbcXyz
 * - dpdTimeoutAction: restart
 *   dpdTimeoutSeconds: 60
 *   ikeVersions: [2]
 *   logging:
 *     enable: true
 *   phase1:
 *     dhGroups: [14]
 *     encryptionAlgorithms: [AES256]
 *     integrityAlgorithms: [SHA2-256]
 *   phase2:
 *     dhGroups: [14]
 *     encryptionAlgorithms: [AES256]
 *     integrityAlgorithms: [SHA2-256]
 *   tunnelInsideCidr: 169.254.200.100/30
 *   preSharedKey: Key1-AbcXyz
 * ```
 * Versions prior to v1.5.0:
 * ```
 * - tunnelInsideCidr: 169.254.200.0/30
 *   preSharedKey: Key1-AbcXyz
 * - tunnelInsideCidr: 169.254.200.100/30
 *   preSharedKey: Key1-AbcXyz
 * ```
 */
export interface IVpnTunnelOptionsSpecificationsConfig {
  /**
   * (OPTIONAL) Dead Peer Detection (DPD) timeout action. You can specify the action to take after DPD timeout occurs.
   *
   * Default - `clear`
   *
   * @remarks
   * **CAUTION:** if you configure this property on a VPN connection that was deployed prior to v1.5.0, your VPN connection
   * will be recreated. Please be aware that any downstream dependencies may cause this property update to fail. To ensure
   * a clean replacement, we highly recommend deleting the original connection and its downstream dependencies prior to making this change.
   *
   * If you update this property after deployment, your VPN tunnel will become temporarily unavailable. Please see
   * {@link https://docs.aws.amazon.com/vpn/latest/s2svpn/endpoint-replacements.html#endpoint-replacements-for-vpn-modifications | Customer initiated endpoint replacements} for
   * additional details.
   *
   * Available actions:
   * * `clear`: End the IKE session when DPD timeout occurs (stop the tunnel and clear the routes)
   * * `none`: Take no action when DPD timeout occurs
   * * `restart`: Restart the IKE session when DPD timeout occurs
   */
  readonly dpdTimeoutAction?: DpdTimeoutActionType;
  /**
   * (OPTIONAL) The duration, in seconds, after which Dead Peer Detection (DPD) timeout occurs.
   *
   * Default - `30`
   *
   * @remarks
   * **CAUTION:** if you configure this property on a VPN connection that was deployed prior to v1.5.0, your VPN connection
   * will be recreated. Please be aware that any downstream dependencies may cause this property update to fail. To ensure
   * a clean replacement, we highly recommend deleting the original connection and its downstream dependencies prior to making this change.
   *
   * If you update this property after deployment, your VPN tunnel will become temporarily unavailable. Please see
   * {@link https://docs.aws.amazon.com/vpn/latest/s2svpn/endpoint-replacements.html#endpoint-replacements-for-vpn-modifications | Customer initiated endpoint replacements} for
   * additional details.
   *
   * The value must be 30 seconds or higher.
   */
  readonly dpdTimeoutSeconds?: number;
  /**
   * (OPTIONAL) The Internet Key Exchange (IKE) versions that are permitted on the tunnel.
   *
   * Default - `ikev1`,`ikev2`
   *
   * @remarks
   * **CAUTION:** if you configure this property on a VPN connection that was deployed prior to v1.5.0, your VPN connection
   * will be recreated. Please be aware that any downstream dependencies may cause this property update to fail. To ensure
   * a clean replacement, we highly recommend deleting the original connection and its downstream dependencies prior to making this change.
   *
   * If you update this property after deployment, your VPN tunnel will become temporarily unavailable. Please see
   * {@link https://docs.aws.amazon.com/vpn/latest/s2svpn/endpoint-replacements.html#endpoint-replacements-for-vpn-modifications | Customer initiated endpoint replacements} for
   * additional details.
   *
   * Only include one or both versions of IKE in the array.
   */
  readonly ikeVersions?: IkeVersionType[];
  /**
   * (OPTIONAL) Site-to-Site VPN CloudWatch logging configuration.
   *
   * @remarks
   * **CAUTION:** if you configure this property on a VPN connection that was deployed prior to v1.5.0, your VPN connection
   * will be recreated. Please be aware that any downstream dependencies may cause this property update to fail. To ensure
   * a clean replacement, we highly recommend deleting the original connection and its downstream dependencies prior to making this change.
   *
   * If you update this property after deployment, your VPN tunnel will become temporarily unavailable. Please see
   * {@link https://docs.aws.amazon.com/vpn/latest/s2svpn/endpoint-replacements.html#endpoint-replacements-for-vpn-modifications | Customer initiated endpoint replacements} for
   * additional details.
   *
   */
  readonly logging?: IVpnLoggingConfig;
  /**
   * (OPTIONAL) Internet Key Exchange (IKE) phase 1 configuration.
   *
   * @remarks
   * **CAUTION:** if you configure this property on a VPN connection that was deployed prior to v1.5.0, your VPN connection
   * will be recreated. Please be aware that any downstream dependencies may cause this property update to fail. To ensure
   * a clean replacement, we highly recommend deleting the original connection and its downstream dependencies prior to making this change.
   *
   * If you update this property after deployment, your VPN tunnel will become temporarily unavailable. Please see
   * {@link https://docs.aws.amazon.com/vpn/latest/s2svpn/endpoint-replacements.html#endpoint-replacements-for-vpn-modifications | Customer initiated endpoint replacements} for
   * additional details.
   */
  readonly phase1?: IPhase1Config;
  /**
   * (OPTIONAL) Internet Key Exchange (IKE) phase 2 configuration.
   *
   * @remarks
   * **CAUTION:** if you configure this property on a VPN connection that was deployed prior to v1.5.0, your VPN connection
   * will be recreated. Please be aware that any downstream dependencies may cause this property update to fail. To ensure
   * a clean replacement, we highly recommend deleting the original connection and its downstream dependencies prior to making this change.
   *
   * If you update this property after deployment, your VPN tunnel will become temporarily unavailable. Please see
   * {@link https://docs.aws.amazon.com/vpn/latest/s2svpn/endpoint-replacements.html#endpoint-replacements-for-vpn-modifications | Customer initiated endpoint replacements} for
   * additional details.
   */
  readonly phase2?: IPhase2Config;
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
  readonly preSharedKey?: t.NonEmptyString;
  /**
   * (OPTIONAL) The percentage of the rekey window (determined by the rekey margin time) within which the rekey time is randomly selected.
   *
   * Default - `100`
   *
   * @remarks
   * **CAUTION:** if you configure this property on a VPN connection that was deployed prior to v1.5.0, your VPN connection
   * will be recreated. Please be aware that any downstream dependencies may cause this property update to fail. To ensure
   * a clean replacement, we highly recommend deleting the original connection and its downstream dependencies prior to making this change.
   *
   * If you update this property after deployment, your VPN tunnel will become temporarily unavailable. Please see
   * {@link https://docs.aws.amazon.com/vpn/latest/s2svpn/endpoint-replacements.html#endpoint-replacements-for-vpn-modifications | Customer initiated endpoint replacements} for
   * additional details.
   *
   * You can specify a percentage value between 0 and 100.
   */
  readonly rekeyFuzzPercentage?: number;
  /**
   * (OPTIONAL) The margin time in seconds before the phase 1 and phase 2 lifetime expires,
   * during which the AWS side of the VPN connection performs an IKE rekey.
   *
   * Default - `270` (4.5 minutes)
   *
   * @remarks
   * **CAUTION:** if you configure this property on a VPN connection that was deployed prior to v1.5.0, your VPN connection
   * will be recreated. Please be aware that any downstream dependencies may cause this property update to fail. To ensure
   * a clean replacement, we highly recommend deleting the original connection and its downstream dependencies prior to making this change.
   *
   * If you update this property after deployment, your VPN tunnel will become temporarily unavailable. Please see
   * {@link https://docs.aws.amazon.com/vpn/latest/s2svpn/endpoint-replacements.html#endpoint-replacements-for-vpn-modifications | Customer initiated endpoint replacements} for
   * additional details.
   *
   * You can specify a number between 60 and half of the value of the phase 2 lifetime.
   * The exact time of the rekey is randomly selected based on the value for rekey fuzz.
   */
  readonly rekeyMarginTimeSeconds?: number;
  /**
   * (OPTIONAL) The number of packets in an IKE replay window.
   *
   * Default - `1024`
   *
   * @remarks
   * **CAUTION:** if you configure this property on a VPN connection that was deployed prior to v1.5.0, your VPN connection
   * will be recreated. Please be aware that any downstream dependencies may cause this property update to fail. To ensure
   * a clean replacement, we highly recommend deleting the original connection and its downstream dependencies prior to making this change.
   *
   * If you update this property after deployment, your VPN tunnel will become temporarily unavailable. Please see
   * {@link https://docs.aws.amazon.com/vpn/latest/s2svpn/endpoint-replacements.html#endpoint-replacements-for-vpn-modifications | Customer initiated endpoint replacements} for
   * additional details.
   *
   * You can specify a value between 64 and 2048.
   */
  readonly replayWindowSize?: number;
  /**
   * (OPTIONAL) The action to take when the establishing the tunnel for the VPN connection.
   * By default, your customer gateway device must initiate the IKE negotiation and bring up the tunnel.
   * Specify `start` for Amazon Web Services to initiate the IKE negotiation.
   *
   * Default - `add`
   *
   * @remarks
   * **CAUTION:** if you configure this property on a VPN connection that was deployed prior to v1.5.0, your VPN connection
   * will be recreated. Please be aware that any downstream dependencies may cause this property update to fail. To ensure
   * a clean replacement, we highly recommend deleting the original connection and its downstream dependencies prior to making this change.
   *
   */
  readonly startupAction?: StartupActionType;
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
  readonly tunnelInsideCidr?: t.NonEmptyString;
  /**
   * (OPTIONAL) Enable tunnel endpoint lifecycle control. This feature provides control over the schedule of endpoint replacements.
   * For more information, see {@link https://docs.aws.amazon.com/vpn/latest/s2svpn/tunnel-endpoint-lifecycle.html | Tunnel Endpoint Lifecycle Control}.
   *
   * @remarks
   * **CAUTION:** if you configure this property on a VPN connection that was deployed prior to v1.5.0, your VPN connection
   * will be recreated. Please be aware that any downstream dependencies may cause this property update to fail. To ensure
   * a clean replacement, we highly recommend deleting the original connection and its downstream dependencies prior to making this change.
   *
   * If you update this property after deployment, your VPN tunnel will become temporarily unavailable. Please see
   * {@link https://docs.aws.amazon.com/vpn/latest/s2svpn/endpoint-replacements.html#endpoint-replacements-for-vpn-modifications | Customer initiated endpoint replacements} for
   * additional details.
   */
  readonly tunnelLifecycleControl?: boolean;
}

/**
 * *{@link NetworkConfig} / {@link CustomerGatewayConfig} / {@link VpnConnectionConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpn/latest/s2svpn/VPC_VPN.html | Site-to-site VPN Connection} configuration.
 *
 * @description
 * Use this configuration to define the VPN connections that
 * terminate either on a Transit Gateway or virtual private gateway.
 * A VPN connection refers to the connection between your VPC and your own on-premises network.
 * You can enable access to your remote network from your VPC by creating an
 * AWS Site-to-Site VPN (Site-to-Site VPN) connection, and configuring routing
 * to pass traffic through the connection.
 *
 * **IMPORTANT**: After initial deployment of your VPN connection with any of the v1.5.0+ options noted below, you can make property changes in one of {@link VpnConnectionConfig} or {@link VpnTunnelOptionsSpecificationsConfig}, but not both.
 * You may make multiple property changes in one of those configurations if necessary. Trying to modify properties in both configurations will result in a pipeline failure. This is due to the fact that
 * only a single mutating API call can be made at a time for AWS Site-to-Site VPN connections.
 *
 * Note: you may manually roll back the resulting CloudFormation stack should you encounter this failure. More details on how to skip failed resources in the following reference:
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-continueupdaterollback.html
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
 *   # Tunnel specifications are optional -- additional tunnel options available in configuration reference
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
 *   # Tunnel specifications are optional -- additional tunnel options available in configuration reference
 *   tunnelSpecifications:
 *     - tunnelInsideCidr: 169.254.200.0/30
 *       preSharedKey: Key1-AbcXyz
 *     - tunnelInsideCidr: 169.254.200.100/30
 *       preSharedKey: Key1-AbcXyz
 * ```
 */
export interface IVpnConnectionConfig {
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
  readonly name: t.NonEmptyString;
  /**
   * (OPTIONAL) The Amazon-side IPv4 CIDR range that is allowed through the site-to-site VPN tunnel.
   * Configuring this option restricts the Amazon-side CIDR range that can communicate with your
   * local network.
   *
   * Default - `0.0.0.0/0`
   *
   * @remarks
   * **CAUTION:** if you configure this property on a VPN connection that was deployed prior to v1.5.0, your VPN connection
   * will be recreated. Please be aware that any downstream dependencies may cause this property update to fail. To ensure
   * a clean replacement, we highly recommend deleting the original connection and its downstream dependencies prior to making this change.
   *
   * If you update this property after deployment, both of your VPN tunnel endpoints will become temporarily unavailable. Please see
   * {@link https://docs.aws.amazon.com/vpn/latest/s2svpn/endpoint-replacements.html#endpoint-replacements-for-vpn-modifications | Customer initiated endpoint replacements} for
   * additional details.
   *
   * Use CIDR notation, i.e. 10.0.0.0/16.
   */
  readonly amazonIpv4NetworkCidr?: t.NonEmptyString;
  /**
   * (OPTIONAL) The customer-side IPv4 CIDR range that is allowed through the site-to-site VPN tunnel.
   * Configuring this option restricts the local CIDR range that can communicate with your AWS environment.
   *
   * Default - `0.0.0.0/0`
   *
   * @remarks
   * **CAUTION:** if you configure this property on a VPN connection that was deployed prior to v1.5.0, your VPN connection
   * will be recreated. Please be aware that any downstream dependencies may cause this property update to fail. To ensure
   * a clean replacement, we highly recommend deleting the original connection and its downstream dependencies prior to making this change.
   *
   * If you update this property after deployment, both of your VPN tunnel endpoints will become temporarily unavailable. Please see
   * {@link https://docs.aws.amazon.com/vpn/latest/s2svpn/endpoint-replacements.html#endpoint-replacements-for-vpn-modifications | Customer initiated endpoint replacements} for
   * additional details.
   *
   * Use CIDR notation, i.e. 10.0.0.0/16.
   */
  readonly customerIpv4NetworkCidr?: t.NonEmptyString;
  /**
   * (OPTIONAL) Enable Site-to-Site VPN Acceleration.
   * For more information, see {@link https://docs.aws.amazon.com/vpn/latest/s2svpn/accelerated-vpn.html | Accelerated Site-to-Site VPN connections}.
   *
   * @remarks
   * **CAUTION:** if you configure this property on a VPN connection that was deployed prior to v1.5.0, your VPN connection
   * will be recreated. Please be aware that any downstream dependencies may cause this property update to fail. To ensure
   * a clean replacement, we highly recommend deleting the original connection and its downstream dependencies prior to making this change.
   *
   * If you update this property after deployment, your VPN tunnel will be recreated. VPN acceleration can only
   * be enabled/disabled on initial VPN connection creation.
   *
   * **NOTE:** Accelerated VPNs are only supported on VPNs terminating on transit gateways.
   */
  readonly enableVpnAcceleration?: boolean;
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
  readonly transitGateway?: t.NonEmptyString;
  /**
   * (OPTIONAL) An array of Transit Gateway route table names to associate the VPN attachment to
   *
   * @remarks
   * This is the `name` property of the Transit Gateway route table
   *
   * This property should only be defined if creating a VPN connection to a Transit Gateway.
   * Leave undefined for VPN connections to virtual private gateways.
   */
  readonly routeTableAssociations?: t.NonEmptyString[];
  /**
   * (OPTIONAL) An array of Transit Gateway route table names to propagate the VPN attachment to
   *
   * @remarks
   * This is the `name` property of the Transit Gateway route table
   *
   * This property should only be defined if creating a VPN connection to a Transit Gateway.
   * Leave undefined for VPN connections to virtual private gateways.
   */
  readonly routeTablePropagations?: t.NonEmptyString[];
  /**
   * (OPTIONAL) If creating a VPN connection for a device that doesn't support Border Gateway Protocol (BGP)
   * declare true as a value, otherwise, use false.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the VPN to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly staticRoutesOnly?: boolean;
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
  readonly vpc?: t.NonEmptyString;
  /**
   * (OPTIONAL) Define the optional VPN Tunnel configuration
   * @see {@link VpnTunnelOptionsSpecificationsConfig}
   */
  readonly tunnelSpecifications?: IVpnTunnelOptionsSpecificationsConfig[];
  /**
   * (OPTIONAL) An array of tags for the VPN Connection.
   */
  readonly tags?: t.ITag[];
}

/**
 * *{@link NetworkConfig} / {@link CustomerGatewayConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpn/latest/s2svpn/your-cgw.html | Customer Gateway (CGW)} Configuration.
 *
 * @description
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
export interface ICustomerGatewayConfig {
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
  readonly name: t.NonEmptyString;
  /**
   * The logical name of the account to deploy the Customer Gateway to. This value should match the name of the account recorded
   * in the accounts-config.yaml file.
   */
  readonly account: t.NonEmptyString;
  /**
   * The AWS region to provision the customer gateway in
   */
  readonly region: t.Region;
  /**
   * Defines the IP address of the Customer Gateway
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the VPN to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * To define a customer gateway that references an external appliance (i.e. on-premise or otherwise external to the accelerator), use a public-facing IPv4 address (i.e. 1.2.3.4).
   *
   * This property supports `ACCEL_LOOKUP` replacement variables to target the public IP address of a network interface attached to an
   * {@link Ec2FirewallInstanceConfig} defined in `customizations-config.yaml`. The target network interface MUST be configured with the `associateElasticIp` property set to `true`.
   *
   * **NOTE:** This lookup value is not supported for firewalls defined in {@link Ec2FirewallAutoScalingGroupConfig}.
   *
   * Supported replacement:
   * * Network interface replacement - look up a network interface attached to a firewall instance defined in `customizations-config.yaml`
   *   * Format:`${ACCEL_LOOKUP::EC2:ENI_<ENI_INDEX>:<FIREWALL_INSTANCE_NAME>}`, where `<ENI_INDEX>` is the device index of the network interface
   * as defined in the firewall launch template and `<FIREWALL_INSTANCE_NAME>` is the name of the firewall instance.
   *   * Index numbering is zero-based, so the primary interface of the instance is `0`.
   *   * Example usage: `${ACCEL_LOOKUP::EC2:ENI_0:accelerator-firewall}` - translates to the primary public IP address of the primary network interface of a firewall named `accelerator-firewall`.
   */
  readonly ipAddress: t.NonEmptyString;
  /**
   * Define the ASN used for the Customer Gateway
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the VPN to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * The private ASN range is 64512 to 65534. The default is 65000.
   */
  readonly asn: number;
  /**
   * Define tags for the Customer Gateway
   */
  readonly tags?: t.ITag[];
  /**
   * Define the optional VPN Connection configuration
   * @see {@link VpnConnectionConfig}
   */
  readonly vpnConnections?: IVpnConnectionConfig[];
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} / {@link VirtualPrivateGatewayConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/vpn-connections.html | Virtual Private Gateway} Configuration.
 *
 * @description
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
export interface IVirtualPrivateGatewayConfig {
  /**
   * Define the ASN (Amazon Side) used for the Virtual Private Gateway
   *
   * @remarks
   * The private ASN range is 64512 to 65534. The default is 65000.
   */
  readonly asn: number;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} / {@link LoadBalancersConfig}*
 *
 * {@link https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/how-elastic-load-balancing-works.html | Elastic Load Balancers} Configuration.
 *
 * @description
 * Use this configuration to define Application Load Balancers (ALBs) or
 * Network Load Balancers (NLBs) to be deployed in the specified VPC subnets.
 */
export interface ILoadBalancersConfig {
  /**
   * (OPTIONAL) An array of Application Load Balancer (ALB) configurations.
   * Use this property to define ALBs to be deployed in the specified VPC subnets.
   *
   * @see {@link ApplicationLoadBalancerConfig}
   */
  readonly applicationLoadBalancers?: ci.IApplicationLoadBalancerConfig[];
  /**
   * (OPTIONAL) An array of Network Load Balancer (NLB) configurations.
   * Use this property to define NLBs to be deployed in the specified VPC subnets.
   *
   * @see {@link NetworkLoadBalancerConfig}
   */
  readonly networkLoadBalancers?: ci.INetworkLoadBalancerConfig[];
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig} | {@link VpcTemplatesConfig} / {@link VpcIpv6Config}*
 *
 * @description
 * VPC IPv6 static CIDR configuration. Use this to associate a static IPv6 CIDR block to your VPC.
 *
 * @example
 * Use an Amazon-provided /56 CIDR:
 * ```
 * - amazonProvided: true
 * ```
 *
 * Use a BYOIP address pool with a default /56 CIDR:
 * ```
 * - byoipPoolId: ipv6Pool-ec2-123abcxyz
 * ```
 *
 * Use a specific CIDR range of a BYOIP address pool:
 * ```
 * - byoipPoolId: ipv6Pool-ec2-123abcxyz
 *   cidrBlock: fd00::/48
 * ```
 */
export interface IVpcIpv6Config {
  /**
   * (OPTIONAL) Indicates whether Amazon automatically provisions a /56 IPv6 CIDR block for the VPC.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the CIDR block to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * Leave this property undefined if using a Bring-Your-Own-IP (BYOIP) address pool.
   */
  readonly amazonProvided?: boolean;
  /**
   * (OPTIONAL) Associate an IPv6 CIDR block with your VPC.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the CIDR block to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * You MUST also specify `boipPoolId` if configuring this property.
   * You may leave this property undefined to have Amazon automatically provision a /56 CIDR
   * from your BYOIP address pool.
   * Possible IPv6 netmask lengths are between /44 and /60 in increments of /4.
   */
  readonly cidrBlock?: t.NonEmptyString;
  /**
   * (OPTIONAL) Used to define the Bring-Your-Own-IP (BYOIP) address pool ID to use for the IPv6 CIDR block.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the CIDR block to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * You must have configured a BYOIP address pool in the account the VPC is being provisioned in.
   * For more information on setting up an address pool, see {@link https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-byoip.html | Bring your own IP addresses (BYOIP) in Amazon EC2}.
   */
  readonly byoipPoolId?: t.NonEmptyString;
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/what-is-amazon-vpc.html | Virtual Private Cloud (VPC)} configuration.
 *
 * @description
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
 *
 * IPv6 static CIDR:
 * ```
 * vpcs:
 *   - name: Network-Inspection
 *     account: Network
 *     region: us-east-1
 *     cidrs:
 *       - 10.0.0.0/24
 *     ipv6Cidrs:
 *       - byoipPool: ipv6Pool-ec2-123abcxyz
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
export interface IVpcConfig {
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
  readonly name: t.NonEmptyString;
  /**
   * The logical name of the account to deploy the VPC to
   *
   * @remarks
   * This is the logical `name` property of the account as defined in accounts-config.yaml.
   */
  readonly account: t.NonEmptyString;
  /**
   * The AWS region to deploy the VPC to
   */
  readonly region: t.Region;
  /**
   * (OPTIONAL) A list of IPv4 CIDRs to associate with the VPC.
   *
   * @remarks
   * **CAUTION**: Changing or removing an existing CIDR value after initial deployment causes the VPC to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   * You can add additional CIDRs to the VPC without this recreation occurring.
   *
   *
   * **WARNING**: Adding a secondary CIDR anywhere except the end of the list will cause the VPC to be recreated.
   *
   *
   * NOTE: Expanding a VPC with additional CIDRs is subject to {@link https://docs.aws.amazon.com/vpc/latest/userguide/vpc-cidr-blocks.html#add-cidr-block-restrictions | these restrictions}.
   * At least one CIDR should be
   * provided if not using `ipamAllocations`.
   *
   * Use IPv4 CIDR notation, i.e. 10.0.0.0/16
   */
  readonly cidrs?: t.NonEmptyString[];
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
  readonly defaultSecurityGroupRulesDeletion?: boolean;
  /**
   * (OPTIONAL) The friendly name of a custom DHCP options set.
   *
   * @remarks
   * This is the logical `name` property of the DHCP options set as defined in network-config.yaml.
   *
   * @see {@link DhcpOptsConfig}
   */
  readonly dhcpOptions?: t.NonEmptyString;
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
  readonly dnsFirewallRuleGroups?: IVpcDnsFirewallAssociationConfig[];
  /**
   * (OPTIONAL) Create an {@link https://docs.aws.amazon.com/vpc/latest/userguide/egress-only-internet-gateway.html | Egress-only internet gateway (EIGW)} for the VPC
   */
  readonly egressOnlyIgw?: boolean;
  /**
   * Enable DNS hostname support for the VPC.
   *
   * @see {@link https://docs.aws.amazon.com/vpc/latest/userguide/vpc-dns.html}
   */
  readonly enableDnsHostnames?: boolean;
  /**
   * Enable DNS support for the VPC.
   *
   * @see {@link https://docs.aws.amazon.com/vpc/latest/userguide/vpc-dns.html}
   */
  readonly enableDnsSupport?: boolean;
  /**
   * (OPTIONAL) An array of gateway endpoints for the VPC.
   * Use this property to define S3 or DynamoDB gateway endpoints for the VPC.
   *
   * @see {@link GatewayEndpointConfig}
   */
  readonly gatewayEndpoints?: IGatewayEndpointConfig;
  /**
   * (OPTIONAL) Define instance tenancy for the VPC. The default value is `default`.
   *
   * @see {@link https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/dedicated-instance.html}
   */
  readonly instanceTenancy?: InstanceTenancyType;
  /**
   * (OPTIONAL) A list of VPC interface endpoints.
   * Use this property to define VPC interface endpoints for the VPC.
   *
   * @see {@link InterfaceEndpointConfig}
   */
  readonly interfaceEndpoints?: IInterfaceEndpointConfig;
  /**
   * Defines if an {@link https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html | internet gateway} should be added to the VPC
   */
  readonly internetGateway?: boolean;
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
  readonly ipamAllocations?: IIpamAllocationConfig[];
  /**
   * (OPTIONAL) An array of IPv6 CIDR block configurations.
   *
   * @see {@link VpcIpv6Config}
   *
   * @remarks
   * **CAUTION**: Changing or removing an existing IPv6 CIDR block may cause unexpected behavior if there are subnets provisioned using the CIDR.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   * You can add additional IPv6 CIDR blocks to the VPC without interruptions occurring.
   *
   * At least one IPv4 static CIDR or IPAM allocation MUST be configured along with any IPv6 CIDR blocks.
   * A VPC cannot be created without an IPv4 CIDR.
   */
  readonly ipv6Cidrs?: IVpcIpv6Config[];
  /**
   * (OPTIONAL) An array of NAT gateway configurations for the VPC.
   * Use this property to configure the NAT gateways for the VPC.
   *
   * @see {@link NatGatewayConfig}
   */
  readonly natGateways?: INatGatewayConfig[];
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
  readonly useCentralEndpoints?: boolean;
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
  readonly securityGroups?: ISecurityGroupConfig[];
  /**
   * (OPTIONAL) A list of Network Access Control Lists (ACLs) to deploy for this VPC
   *
   * @default undefined
   *
   * @see {@link NetworkAclConfig}
   */
  readonly networkAcls?: INetworkAclConfig[];
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
  readonly queryLogs?: t.NonEmptyString[];
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
  readonly resolverRules?: t.NonEmptyString[];
  /**
   * (OPTIONAL) An array of route table configurations for the VPC.
   * Use this property to configure the route tables for the VPC.
   *
   * @see {@link RouteTableConfig}
   */
  readonly routeTables?: IRouteTableConfig[];
  /**
   * (OPTIONAL) An array of subnet configurations for the VPC.
   * Use this property to configure the subnets for the VPC.
   *
   * @see {@link SubnetConfig}
   */
  readonly subnets?: ISubnetConfig[];
  /**
   * (OPTIONAL) An array of Transit Gateway attachment configurations.
   * Use this property to configure the Transit Gateway attachments for the VPC.
   *
   * @see {@link TransitGatewayAttachmentConfig}
   */
  readonly transitGatewayAttachments?: ITransitGatewayAttachmentConfig[];
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
  readonly tags?: t.ITag[];
  /**
   * (OPTIONAL) An array of Local Gateway Route table configurations.
   * Use this configuration to associate Outposts Local Gateway Route tables with the VPC.
   */
  readonly outposts?: IOutpostsConfig[];
  /**
   * (OPTIONAL) Virtual Private Gateway configuration.
   * Use this property to configure a Virtual Private Gateway for the VPC.
   *
   * @default undefined
   */
  readonly virtualPrivateGateway?: IVirtualPrivateGatewayConfig;
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
  readonly vpcFlowLogs?: t.IVpcFlowLogsConfig;
  /**
   * Elastic Load Balancing configuration.
   * Use this property to define Elastic Load Balancers for this VPC.
   *
   * @see {@link LoadBalancersConfig}
   */
  readonly loadBalancers?: ILoadBalancersConfig;
  /**
   * Target group configuration.
   * Use this property to define target groups for this VPC.
   *
   * @see {@link TargetGroupItemConfig}
   */
  readonly targetGroups?: ci.ITargetGroupItem[];
  /**
   * A Route 53 resolver configuration local to the VPC.
   *
   * @see {@link ResolverConfig}
   */
  readonly vpcRoute53Resolver?: IResolverConfig;
}

/**
 * *{@link NetworkConfig} / {@link VpcTemplatesConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/what-is-amazon-vpc.html | Virtual Private Cloud (VPC)} templates configuration.
 *
 * @description
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
 * Static IPv6 CIDR:
 * ```
 * vpcTemplates:
 *   - name: Accelerator-Template
 *     deploymentTargets:
 *       organizationalUnits:
 *         - Infrastructure
 *     region: us-east-1
 *     cidrs:
 *       - 10.0.0.0/24
 *     ipv6Cidrs:
 *       - amazonProvided: true
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
export interface IVpcTemplatesConfig {
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
  readonly name: t.NonEmptyString;
  /**
   * The AWS region to deploy the VPCs to
   */
  readonly region: t.Region;
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
  readonly deploymentTargets: t.IDeploymentTargets;
  /**
   * (OPTIONAL) A list of IPv4 CIDRs to associate with the VPC.
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
   * Use IPv4 CIDR notation, i.e. 10.0.0.0/16
   */
  readonly cidrs?: t.NonEmptyString[];
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
  readonly defaultSecurityGroupRulesDeletion?: boolean;
  /**
   * (OPTIONAL) The friendly name of a custom DHCP options set.
   *
   * @remarks
   * This is the logical `name` property of the DHCP options set as defined in network-config.yaml.
   *
   * @see {@link DhcpOptsConfig}
   */
  readonly dhcpOptions?: t.NonEmptyString;
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
  readonly dnsFirewallRuleGroups?: IVpcDnsFirewallAssociationConfig[];
  /**
   * (OPTIONAL) Create an {@link https://docs.aws.amazon.com/vpc/latest/userguide/egress-only-internet-gateway.html | Egress-only internet gateway (EIGW)} for the VPC
   */
  readonly egressOnlyIgw?: boolean;
  /**
   * Enable DNS hostname support for the VPC.
   *
   * @see {@link https://docs.aws.amazon.com/vpc/latest/userguide/vpc-dns.html}
   */
  readonly enableDnsHostnames?: boolean;
  /**
   * Enable DNS support for the VPC.
   *
   * @see {@link https://docs.aws.amazon.com/vpc/latest/userguide/vpc-dns.html}
   */
  readonly enableDnsSupport?: boolean;
  /**
   * (OPTIONAL) An array of gateway endpoints for the VPC.
   * Use this property to define S3 or DynamoDB gateway endpoints for the VPC.
   *
   * @see {@link GatewayEndpointConfig}
   */
  readonly gatewayEndpoints?: IGatewayEndpointConfig;
  /**
   * (OPTIONAL) Define instance tenancy for the VPC. The default value is `default`.
   *
   * @see {@link https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/dedicated-instance.html}
   */
  readonly instanceTenancy?: InstanceTenancyType;
  /**
   * (OPTIONAL) An array of IPv6 CIDR block configurations.
   *
   * @see {@link VpcIpv6Config}
   *
   * @remarks
   * **CAUTION**: Changing or removing an existing IPv6 CIDR block may cause unexpected behavior if there are subnets provisioned using the CIDR.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   * You can add additional IPv6 CIDR blocks to the VPC without interruptions occurring.
   *
   * At least one IPv4 static CIDR or IPAM allocation MUST be configured along with any IPv6 CIDR blocks.
   * A VPC cannot be created without an IPv4 CIDR.
   */
  readonly ipv6Cidrs?: IVpcIpv6Config[];
  /**
   * (OPTIONAL) A list of VPC interface endpoints.
   * Use this property to define VPC interface endpoints for the VPC.
   *
   * @see {@link InterfaceEndpointConfig}
   */
  readonly interfaceEndpoints?: IInterfaceEndpointConfig;
  /**
   * Defines if an {@link https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html | internet gateway} should be added to the VPC
   */
  readonly internetGateway?: boolean;
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
  readonly ipamAllocations?: IIpamAllocationConfig[];
  /**
   * (OPTIONAL) An array of NAT gateway configurations for the VPC.
   * Use this property to configure the NAT gateways for the VPC.
   *
   * @see {@link NatGatewayConfig}
   */
  readonly natGateways?: INatGatewayConfig[];
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
  readonly useCentralEndpoints?: boolean;
  /**
   * (OPTIONAL) A list of Security Groups to deploy for this VPC
   *
   * @default undefined
   */
  readonly securityGroups?: ISecurityGroupConfig[];
  /**
   * (OPTIONAL) A list of Network Access Control Lists (ACLs) to deploy for this VPC
   *
   * @default undefined
   *
   * @see {@link NetworkAclConfig}
   */
  readonly networkAcls?: INetworkAclConfig[];
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
  readonly queryLogs?: t.NonEmptyString[];
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
  readonly resolverRules?: t.NonEmptyString[];
  /**
   * (OPTIONAL) An array of route table configurations for the VPC.
   * Use this property to configure the route tables for the VPC.
   *
   * @see {@link RouteTableConfig}
   */
  readonly routeTables?: IRouteTableConfig[];
  /**
   * (OPTIONAL) An array of subnet configurations for the VPC.
   * Use this property to configure the subnets for the VPC.
   *
   * @see {@link SubnetConfig}
   */
  readonly subnets?: ISubnetConfig[];
  /**
   * (OPTIONAL) An array of Transit Gateway attachment configurations.
   * Use this property to configure the Transit Gateway attachments for the VPC.
   *
   * @see {@link TransitGatewayAttachmentConfig}
   */
  readonly transitGatewayAttachments?: ITransitGatewayAttachmentConfig[];
  /**
   * (OPTIONAL) Virtual Private Gateway configuration.
   * Use this property to configure a Virtual Private Gateway for the VPC.
   *
   * @default undefined
   */
  readonly virtualPrivateGateway?: IVirtualPrivateGatewayConfig;
  /**
   * (OPTIONAL) A list of tags to apply to this VPC
   *
   * @default undefined
   *
   */
  readonly tags?: t.ITag[];
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
  readonly vpcFlowLogs?: t.IVpcFlowLogsConfig;
  /**
   * Elastic Load Balancing configuration.
   * Use this property to define Elastic Load Balancers for this VPC.
   *
   * @see {@link LoadBalancersConfig}
   */
  readonly loadBalancers?: ILoadBalancersConfig;
  /**
   * Target group configuration.
   * Use this property to define target groups for this VPC.
   *
   * @see {@link TargetGroupItemConfig}
   */
  readonly targetGroups?: ci.ITargetGroupItem[];
}

export type RuleType = 'FORWARD' | 'RECURSIVE' | 'SYSTEM';

export interface IRuleTargetIps {
  readonly ip: t.NonEmptyString;
  readonly port?: t.NonEmptyString;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link ResolverConfig} / ({@link ResolverEndpointConfig}) / {@link ResolverRuleConfig}*
 *
 * {@link https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resolver-rules-managing.html | Route 53 resolver rule} configuration.
 *
 * @description
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
export interface IResolverRuleConfig {
  /**
   * A friendly name for the resolver rule.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the rule to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: t.NonEmptyString;
  /**
   * The domain name for the resolver rule.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment may cause some interruptions
   * to your network traffic.
   */
  readonly domainName: t.NonEmptyString;
  /**
   * (OPTIONAL) Regions to exclude from SYSTEM rule deployment.
   *
   * @remarks
   * Only define this property if creating a `SYSTEM` rule type.
   * This does not apply to rules of type `FORWARD`.
   */
  readonly excludedRegions?: t.Region[];
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
  readonly inboundEndpointTarget?: t.NonEmptyString;
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
  readonly ruleType?: RuleType;
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
  readonly shareTargets?: t.IShareTargets;
  /**
   * (OPTIONAL) An array of target IP configurations for the resolver rule.
   *
   * @remarks
   * Use this property to define target IP addresses/ports to forward DNS queries to.
   * Only define a port if the DNS server is using a non-standard port (i.e. any port other than port 53).
   *
   * @see {@link NetworkConfigTypes.ruleTargetIps}
   */
  readonly targetIps?: IRuleTargetIps[];
  /**
   * (OPTIONAL) An array of tags for the resolver rule.
   */
  readonly tags?: t.ITag[];
}

export type ResolverEndpointType = 'INBOUND' | 'OUTBOUND';

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link ResolverConfig} / {@link ResolverEndpointConfig}*
 *
 * {@link https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resolver-overview-DSN-queries-to-vpc.html | Route 53 resolver endpoint} configuration.
 *
 * @description
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
export interface IResolverEndpointConfig {
  /**
   * The friendly name of the resolver endpoint.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the rule to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: t.NonEmptyString;
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
  readonly type: ResolverEndpointType;
  /**
   * The friendly name of the VPC to deploy the resolver endpoint to.
   *
   * @remarks
   * This is the logical `name` property of a VPC as defined in network-config.yaml.
   *
   * @see {@link VpcConfig} | {@link VpcTemplatesConfig}
   */
  readonly vpc: t.NonEmptyString;
  /**
   * An array of friendly names for subnets to deploy the resolver endpoint to.
   *
   * @remarks
   * This is the logical `name` property of subnets as defined in network-config.yaml.
   * Subnets must be contained within the VPC referenced in the `vpc` property.
   *
   * @see {@link SubnetConfig}
   */
  readonly subnets: t.NonEmptyString[];
  /**
   * (OPTIONAL) The allowed ingress/egress CIDRs for the resolver endpoint security group.
   *
   * @remarks
   * When resolver endpoints are defined, a security group is automatically created by the accelerator for the endpoints.
   * You can use this property to specify an array of CIDRs you would like to be explicitly allowed
   * in this security group. Otherwise, all IPs (0.0.0.0/0) are allowed for the direction
   * based on the `type` property of the endpoint.
   */
  readonly allowedCidrs?: t.NonEmptyString[];
  /**
   * (OPTIONAL) An array of resolver rule configurations for the endpoint.
   *
   * @remarks
   * Resolver rules should only be defined for outbound endpoints. This
   * property should be left undefined for inbound endpoints.
   *
   * @see {@link ResolverRuleConfig}
   */
  readonly rules?: IResolverRuleConfig[];
  /**
   * (OPTIONAL) An array of tags for the resolver endpoint.
   */
  readonly tags?: t.ITag[];
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link ResolverConfig} / {@link DnsQueryLogsConfig}*
 *
 * {@link https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resolver-query-logs.html | Route 53 Resolver DNS query logging} configuration.
 *
 * @description
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
export interface IDnsQueryLogsConfig {
  /**
   * The friendly name of the query logging config.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the configuration to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: t.NonEmptyString;
  /**
   * An array of destination services used to store the logs.
   */
  readonly destinations: t.LogDestinationType[];
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
  readonly shareTargets?: t.IShareTargets;
  readonly excludedRegions?: t.Region[];
}

export type DnsFirewallRuleActionType = 'ALLOW' | 'ALERT' | 'BLOCK';
export type DnsFirewallBlockResponseType = 'NODATA' | 'NXDOMAIN' | 'OVERRIDE';
export type DnsFirewallManagedDomainListsType =
  | 'AWSManagedDomainsAggregateThreatList'
  | 'AWSManagedDomainsBotnetCommandandControl'
  | 'AWSManagedDomainsMalwareDomainList';

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link ResolverConfig} / {@link DnsFirewallRuleGroupConfig} / {@link DnsFirewallRulesConfig}*
 *
 * {@link https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resolver-dns-firewall-rule-settings.html |Route 53 DNS firewall rule} configuration.
 *
 * @description
 * Use this configuration to define individual rules for your DNS firewall.
 * This allows you to define the DNS firewall behavior for your VPCs.
 *
 *
 * @example
 * The following example creates a rule that blocks requests from a custom list of domains.
 * The custom domain list path must exist in your accelerator configuration repository.
 * ```
 * - name: accelerator-dns-rule
 *   action: BLOCK
 *   priority: 100
 *   blockResponse: NXDOMAIN
 *   customDomainList: path/to/domains.txt
 * ```
 *
 * The following example creates a rule referencing an AWS-managed domain list.
 * The managed domain list must be available in the region you are deploying
 * the rule to.
 * ```
 * - name: accelerator-dns-rule
 *   action: BLOCK
 *   priority: 200
 *   blockResponse: NODATA
 *   managedDomainList: AWSManagedDomainsAggregateThreatList
 * ```
 */
export interface IDnsFirewallRulesConfig {
  /**
   * A friendly name for the DNS firewall rule.
   */
  readonly name: t.NonEmptyString;
  /**
   * An action for the DNS firewall rule to take on matching requests.
   *
   * @see {@link NetworkConfigTypes.dnsFirewallRuleActionTypeEnum}
   */
  readonly action: DnsFirewallRuleActionType;
  /**
   * The priority of the DNS firewall rule.
   *
   * @remarks
   * Rules are evaluated in order from low to high number.
   * Priority values must be unique in each defined rule group.
   */
  readonly priority: number;
  /**
   * (OPTIONAL) Configure an override domain for BLOCK actions.
   * This is a custom DNS record to send back in response to the query.
   *
   * @remarks
   * Only define this property if your are using a `blockResponse` of OVERRIDE.
   */
  readonly blockOverrideDomain?: t.NonEmptyString;
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
  readonly blockOverrideTtl?: number;
  /**
   * Configure a specific response type for BLOCK actions.
   * Block response types are defined here: {@link https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resolver-dns-firewall-rule-actions.html}
   *
   * @see {@link NetworkConfigTypes.dnsFirewallBlockResponseTypeEnum}
   */
  readonly blockResponse?: DnsFirewallBlockResponseType;
  /**
   * A file containing a custom domain list in TXT format.
   *
   * @remarks
   * The file must exist in your accelerator configuration repository.
   * The file must contain domain names separated by newlines.
   *
   * Include only one of `customDomainList` or `managedDomainList` for each rule definition.
   */
  readonly customDomainList?: t.NonEmptyString;
  /**
   * Configure a rule that uses an AWS-managed domain list.
   * AWS-managed domain lists are defined here: {@link https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resolver-dns-firewall-managed-domain-lists.html}.
   *
   * @remarks
   * Before using a managed domain list, please ensure that it is available in the region you are deploying it to.
   * Regional availability of managed domain lists is included in the link above.
   *
   * Include only one of `customDomainList` or `managedDomainList` for each rule definition.
   *
   * @see {@link NetworkConfigTypes.dnsFirewallManagedDomainListEnum}
   */
  readonly managedDomainList?: DnsFirewallManagedDomainListsType;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link ResolverConfig} / {@link DnsFirewallRuleGroupConfig}*
 *
 * {@link https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resolver-dns-firewall-rule-groups.html | Route 53 DNS firewall rule group} configuration.
 *
 * @description
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
export interface IDnsFirewallRuleGroupConfig {
  /**
   * A friendly name for the DNS firewall rule group.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the configuration to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: t.NonEmptyString;
  /**
   * The regions to deploy the rule group to.
   *
   * @see {@link Region}
   */
  readonly regions: t.Region[];
  /**
   * An array of DNS firewall rule configurations.
   *
   * @see {@link DnsFirewallRulesConfig}
   */
  readonly rules: IDnsFirewallRulesConfig[];
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
  readonly shareTargets?: t.IShareTargets;
  /**
   * An array of tags for the rule group.
   */
  readonly tags?: t.ITag[];
}

/**
 * *{@link NetworkConfig} / {@link VpcConfig}*
 *
 * {@link https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resolver.html Route 53 Resolver} configuration.
 *
 * @description
 * Use this configuration to define local resolver endpoints and Route 53 query logging to the VPC.
 *
 * @example
 * ```
 * vpcRoute53Resolver:
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
export interface IVpcResolverConfig {
  /**
   * (OPTIONAL) An array of Route 53 resolver endpoint configurations.
   *
   * @see {@link ResolverEndpointConfig}
   */
  readonly endpoints?: IResolverEndpointConfig[];
  /**
   * (OPTIONAL) A Route 53 resolver DNS query logging configuration.
   *
   * @see {@link DnsQueryLogsConfig}
   */
  readonly queryLogs?: IDnsQueryLogsConfig;
}
/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link ResolverConfig}*
 *
 * {@link https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resolver.html Route 53 Resolver} configuration.
 *
 * @description
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

export interface IResolverConfig {
  /**
   * (OPTIONAL) An array of Route 53 resolver endpoint configurations.
   *
   * @see {@link ResolverEndpointConfig}
   */
  readonly endpoints?: IResolverEndpointConfig[];
  /**
   * (OPTIONAL) An array of Route 53 DNS firewall rule group configurations.
   *
   * @see {@link DnsFirewallRuleGroupConfig}
   */
  readonly firewallRuleGroups?: IDnsFirewallRuleGroupConfig[];
  /**
   * (OPTIONAL) A Route 53 resolver DNS query logging configuration.
   *
   * @see {@link DnsQueryLogsConfig}
   */
  readonly queryLogs?: IDnsQueryLogsConfig;
  /**
   * (OPTIONAL) An array of Route 53 resolver rules.
   *
   * @remarks
   * This `rules` property should only be used for rules of type `SYSTEM`.
   * For rules of type `FORWARD`, define under the {@link ResolverEndpointConfig} configuration object.
   */
  readonly rules?: IResolverRuleConfig[];
}

export type NfwRuleType = 'STATEFUL' | 'STATELESS';
export type NfwGeneratedRulesType = 'ALLOWLIST' | 'DENYLIST';
export type NfwTargetType = 'TLS_SNI' | 'HTTP_HOST';
export type NfwStatefulRuleActionType = 'ALERT' | 'DROP' | 'PASS';
export type NfwStatefulRuleDirectionType = 'ANY' | 'FORWARD';
export type NfwStatefulRuleProtocolType =
  | 'DCERPC'
  | 'DHCP'
  | 'DNS'
  | 'FTP'
  | 'HTTP'
  | 'ICMP'
  | 'IKEV2'
  | 'IMAP'
  | 'IP'
  | 'KRB5'
  | 'MSN'
  | 'NTP'
  | 'SMB'
  | 'SMTP'
  | 'SSH'
  | 'TCP'
  | 'TFTP'
  | 'TLS'
  | 'UDP';
export type NfwStatelessRuleActionType = 'aws:pass' | 'aws:drop' | 'aws:forward_to_sfe';
export type NfwStatefulDefaultActionType =
  | 'aws:drop_strict'
  | 'aws:drop_established'
  | 'aws:alert_strict'
  | 'aws:alert_established';
export type NfwStatelessRuleTcpFlagType = 'FIN' | 'SYN' | 'RST' | 'PSH' | 'ACK' | 'URG' | 'ECE' | 'CWR';
export type NfwStatefulRuleOptionsType = 'DEFAULT_ACTION_ORDER' | 'STRICT_ORDER';
export type NfwLogType = 'ALERT' | 'FLOW';

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig} / {@link NfwRuleSourceListConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateful-rule-groups-ips.html | Network Firewall stateful rule} source list configuration.
 *
 * @description
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
export interface INfwRuleSourceListConfig {
  /**
   * The type of rules to generate from the source list.
   */
  readonly generatedRulesType: NfwGeneratedRulesType;
  /**
   * An array of target domain names.
   *
   * @remarks
   * Supported values are as fallows:
   * Explicit domain names such as `www.example.com`.
   * Wildcard domain names should be prefaced with a `.`. For example: `.example.com`
   */
  readonly targets: t.NonEmptyString[];
  /**
   * An array of protocol types to inspect.
   *
   * @see {@link NetworkConfigTypes.nfwTargetType}
   */
  readonly targetTypes: NfwTargetType[];
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig} / {@link NfwRuleSourceStatefulRuleConfig} / {@link NfwRuleSourceStatefulRuleHeaderConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateful-rule-groups-ips.html | Network Firewall stateful rule} header configuration.
 *
 * @description
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
export interface INfwRuleSourceStatefulRuleHeaderConfig {
  /**
   * The destination CIDR range to inspect for.
   *
   * @remarks
   * Use CIDR notation, i.e. 10.0.0.0/16
   */
  readonly destination: t.NonEmptyString;
  /**
   * The destination port or port range to inspect.
   *
   * @remarks
   * To specify a port range, separate the values with a colon `:`.
   * For example: `80:443`. To specify all ports, use `ANY`.
   */
  readonly destinationPort: t.NonEmptyString;
  /**
   * The direction of the traffic flow to inspect.
   *
   * @remarks
   * Use `ANY` to match bidirectional traffic.
   *
   * Use `FORWARD` to match only traffic going from the source to destination.
   */
  readonly direction: NfwStatefulRuleDirectionType;
  /**
   * The protocol to inspect.
   *
   * @remarks
   * To specify all traffic, use `IP`.
   */
  readonly protocol: NfwStatefulRuleProtocolType;
  /**
   * The source CIDR range to inspect for.
   *
   * @remarks
   * Use CIDR notation, i.e. 10.0.0.0/16
   */
  readonly source: t.NonEmptyString;
  /**
   * The source port or port range to inspect.
   *
   * @remarks
   * To specify a port range, separate the values with a colon `:`.
   * For example: `80:443`. To specify all ports, use `ANY`.
   */
  readonly sourcePort: t.NonEmptyString;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig} / {@link NfwRuleSourceStatefulRuleConfig} / {@link NfwRuleSourceStatefulRuleOptionsConfig}*
 *
 * @description
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
export interface INfwRuleSourceStatefulRuleOptionsConfig {
  /**
   * A Suricata-compatible keyword.
   */
  readonly keyword: t.NonEmptyString;
  /**
   * An array of values for the keyword.
   */
  readonly settings?: t.NonEmptyString[];
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig} / {@link NfwRuleSourceStatefulRuleConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateful-rule-groups-ips.html | Network Firewall stateful rule} configuration.
 *
 * @description
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
export interface INfwRuleSourceStatefulRuleConfig {
  /**
   * The action type for the stateful rule.
   *
   * @see {@link NetworkConfigTypes.nfwStatefulRuleActionType}
   */
  readonly action: NfwStatefulRuleActionType;
  /**
   * A Network Firewall stateful rule header configuration.
   *
   * @see {@link NfwRuleSourceStatefulRuleHeaderConfig}
   */
  readonly header: INfwRuleSourceStatefulRuleHeaderConfig;
  /**
   * An array of Network Firewall stateful rule options configurations.
   *
   * @see {@link NfwRuleSourceStatefulRuleOptionsConfig}
   */
  readonly ruleOptions: INfwRuleSourceStatefulRuleOptionsConfig[];
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig} / {@link NfwStatelessRulesAndCustomActionsConfig} / {@link NfwRuleSourceCustomActionConfig} / {@link NfwRuleSourceCustomActionDefinitionConfig} / {@link NfwRuleSourceCustomActionDimensionConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/rule-action.html#rule-action-stateless | Network Firewall stateless custom action} dimensions.
 *
 * @description
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
export interface INfwRuleSourceCustomActionDimensionConfig {
  /**
   * An array of values of the custom metric dimensions to log.
   */
  readonly dimensions: t.NonEmptyString[];
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig} / {@link NfwStatelessRulesAndCustomActionsConfig} / {@link NfwRuleSourceCustomActionConfig} / {@link NfwRuleSourceCustomActionDefinitionConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/rule-action.html#rule-action-stateless | Network Firewall stateless custom action} definition configuration.
 *
 * @description
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
export interface INfwRuleSourceCustomActionDefinitionConfig {
  /**
   * A Network Firewall custom action dimensions configuration.
   *
   * @see {@link NfwRuleSourceCustomActionDimensionConfig}
   */
  readonly publishMetricAction: INfwRuleSourceCustomActionDimensionConfig;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig} / {@link NfwStatelessRulesAndCustomActionsConfig} / {@link NfwRuleSourceCustomActionConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/rule-action.html#rule-action-stateless | Network Firewall stateless custom action} configuration.
 *
 * @description
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
export interface INfwRuleSourceCustomActionConfig {
  /**
   * A Network Firewall custom action definition configuration.
   *
   * @see {@link NfwRuleSourceCustomActionDefinitionConfig}
   */
  readonly actionDefinition: INfwRuleSourceCustomActionDefinitionConfig;
  /**
   * A friendly name for the custom action.
   */
  readonly actionName: t.NonEmptyString;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig} / {@link NfwStatelessRulesAndCustomActionsConfig} / {@link NfwRuleSourceStatelessRuleConfig} / {@link NfwRuleSourceStatelessRuleDefinitionConfig} / {@link NfwRuleSourceStatelessMatchAttributesConfig} / {@link NfwRuleSourceStatelessPortRangeConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateless-rule-groups-5-tuple.html | Network Firewall stateless rule} port range configuration.
 *
 * @description
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
export interface INfwRuleSourceStatelessPortRangeConfig {
  /**
   * The port to start from in the range.
   */
  readonly fromPort: number;
  /**
   * The port to end with in the range.
   */
  readonly toPort: number;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig} / {@link NfwStatelessRulesAndCustomActionsConfig} / {@link NfwRuleSourceStatelessRuleConfig} / {@link NfwRuleSourceStatelessRuleDefinitionConfig} / {@link NfwRuleSourceStatelessMatchAttributesConfig} / {@link NfwRuleSourceStatelessTcpFlagsConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateless-rule-groups-5-tuple.html | Network Firewall stateless rule} TCP flags configuration.
 *
 * @description
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
export interface INfwRuleSourceStatelessTcpFlagsConfig {
  /**
   * An array of TCP flags.
   *
   * @remarks
   * Used in conjunction with the Masks setting to define the flags that must be set
   * and flags that must not be set in order for the packet to match.
   * This setting can only specify values that are also specified in the Masks setting.
   */
  readonly flags: NfwStatelessRuleTcpFlagType[];
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
  readonly masks: NfwStatelessRuleTcpFlagType[];
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig} / {@link NfwStatelessRulesAndCustomActionsConfig} / {@link NfwRuleSourceStatelessRuleConfig} / {@link NfwRuleSourceStatelessRuleDefinitionConfig} / {@link NfwRuleSourceStatelessMatchAttributesConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateless-rule-groups-5-tuple.html | Network Firewall stateless rule} match attributes configuration.
 *
 * @description
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
export interface INfwRuleSourceStatelessMatchAttributesConfig {
  /**
   * (OPTIONAL) An array of Network Firewall stateless port range configurations.
   *
   * @remarks
   * The destination ports to inspect for. If not specified, this matches with any destination port.
   * This setting is only used for protocols 6 (TCP) and 17 (UDP).
   *
   * @see {@link NfwRuleSourceStatelessPortRangeConfig}
   */
  readonly destinationPorts?: INfwRuleSourceStatelessPortRangeConfig[];
  /**
   * (OPTIONAL) An array of destination CIDR ranges to inspect for.
   *
   * @remarks
   * Use CIDR notation, i.e. 10.0.0.0/16
   */
  readonly destinations?: t.NonEmptyString[];
  /**
   * (OPTIONAL) An array of IP protocol numbers to inspect for.
   */
  readonly protocols?: number[];
  /**
   * (OPTIONAL) An array of Network Firewall stateless port range configurations.
   *
   * @remarks
   * The source ports to inspect for. If not specified, this matches with any source port.
   * This setting is only used for protocols 6 (TCP) and 17 (UDP).
   *
   * @see {@link NfwRuleSourceStatelessPortRangeConfig}
   */
  readonly sourcePorts?: INfwRuleSourceStatelessPortRangeConfig[];
  /**
   * (OPTIONAL) An array of source CIDR ranges to inspect for.
   *
   * @remarks
   * Use CIDR notation, i.e. 10.0.0.0/16
   */
  readonly sources?: t.NonEmptyString[];
  /**
   * (OPTIONAL) An array of Network Firewall stateless TCP flag configurations.
   *
   * @see {@link NfwRuleSourceStatelessTcpFlagsConfig}
   */
  readonly tcpFlags?: INfwRuleSourceStatelessTcpFlagsConfig[];
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig} / {@link NfwStatelessRulesAndCustomActionsConfig} / {@link NfwRuleSourceStatelessRuleConfig} / {@link NfwRuleSourceStatelessRuleDefinitionConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateless-rule-groups-5-tuple.html | Network Firewall stateless rule} definition configuration.
 *
 * @description
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
export interface INfwRuleSourceStatelessRuleDefinitionConfig {
  /**
   * An array of actions to take using the stateless rule engine.
   */
  readonly actions: (t.NonEmptyString | NfwStatelessRuleActionType)[];
  /**
   * A Network Firewall stateless rule match attributes configuration.
   *
   * @see {@link NfwRuleSourceStatelessMatchAttributesConfig}
   */
  readonly matchAttributes: INfwRuleSourceStatelessMatchAttributesConfig;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig} / {@link NfwStatelessRulesAndCustomActionsConfig} / {@link NfwRuleSourceStatelessRuleConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateless-rule-groups-5-tuple.html | Network Firewall stateless rule} configuration.
 *
 * @description
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
export interface INfwRuleSourceStatelessRuleConfig {
  /**
   * The priority number for the rule.
   *
   * @remarks
   * Priority is evaluated in order from low to high.
   * Priority numbers must be unique within a rule group.
   */
  readonly priority: number;
  /**
   * A Network Firewall stateless rule definition configuration.
   *
   * @see {@link NfwRuleSourceStatelessRuleDefinitionConfig}
   */
  readonly ruleDefinition: INfwRuleSourceStatelessRuleDefinitionConfig;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig} / {@link NfwStatelessRulesAndCustomActionsConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateless-rule-groups-5-tuple.html | Network Firewall stateless rules} and
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/rule-action.html#rule-action-stateless | custom actions} configuration.
 *
 * @description
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
export interface INfwStatelessRulesAndCustomActionsConfig {
  /**
   * An array of Network Firewall stateless rule configurations.
   *
   * @see {@link NfwRuleSourceStatelessRuleConfig}
   */
  readonly statelessRules: INfwRuleSourceStatelessRuleConfig[];
  /**
   * An array of Network Firewall custom action configurations.
   *
   * @see {@link NfwRuleSourceCustomActionConfig}
   */
  readonly customActions?: INfwRuleSourceCustomActionConfig[];
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleSourceConfig}*
 *
 * @description
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
export interface INfwRuleSourceConfig {
  /**
   * (OPTIONAL) A Network Firewall rule source list configuration.
   * Use this property to define a domain list for Network Firewall.
   *
   * @see {@link NfwRuleSourceListConfig}
   */
  readonly rulesSourceList?: INfwRuleSourceListConfig;
  /**
   * (OPTIONAL) A Suricata-compatible stateful rule string.
   * Use this property to define a single Suricata-compatible rule for Network Firewall.
   *
   * @see {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/suricata-examples.html#suricata-example-rule-with-variables}
   */
  readonly rulesString?: t.NonEmptyString;
  /**
   * (OPTIONAL) An array of Network Firewall stateful rule IP header configurations.
   * Use this property to define a stateful rule in IP header format for Network Firewall.
   *
   * @see {@link NfwRuleSourceStatefulRuleConfig}
   */
  readonly statefulRules?: INfwRuleSourceStatefulRuleConfig[];
  /**
   * (OPTIONAL) A Network Firewall stateless rules and custom action configuration.
   * Use this property to define stateless rules and custom actions for Network Firewall.
   *
   * @see {@link NfwStatelessRulesAndCustomActionsConfig}
   */
  readonly statelessRulesAndCustomActions?: INfwStatelessRulesAndCustomActionsConfig;
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
  readonly rulesFile?: t.NonEmptyString;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleVariableConfig} / {@link NfwRuleVariableDefinitionConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/suricata-examples.html#suricata-example-rule-with-variables | Network Firewall rule variable} definition configuration.
 *
 * @description
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
export interface INfwRuleVariableDefinitionConfig {
  /**
   * A name for the rule variable.
   */
  readonly name: t.NonEmptyString;
  /**
   * An array of values for the rule variable.
   */
  readonly definition: t.NonEmptyString[];
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig} / {@link NfwRuleVariableConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/suricata-examples.html#suricata-example-rule-with-variables | Network Firewall rule variable} configuration.
 *
 * @description
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
export interface INfwRuleVariableConfig {
  /**
   * A Network Firewall rule variable definition configuration.
   *
   * @see {@link NfwRuleVariableDefinitionConfig}
   */
  readonly ipSets: INfwRuleVariableDefinitionConfig | INfwRuleVariableDefinitionConfig[];
  /**
   * A Network Firewall rule variable definition configuration.
   *
   * @see {@link NfwRuleVariableDefinitionConfig}
   */
  readonly portSets: INfwRuleVariableDefinitionConfig | INfwRuleVariableDefinitionConfig[];
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig} / {@link NfwRuleGroupRuleConfig}*
 *
 * @description
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
export interface INfwRuleGroupRuleConfig {
  /**
   * A Network Firewall rule source configuration.
   *
   * @see {@link NfwRuleSourceConfig}
   */
  readonly rulesSource: INfwRuleSourceConfig;
  /**
   * A Network Firewall rule variable configuration.
   *
   * @see {@link NfwRuleVariableConfig}
   */
  readonly ruleVariables?: INfwRuleVariableConfig;
  /**
   * A stateful rule option for the rule group.
   *
   * @see {@link NetworkConfigTypes.nfwStatefulRuleOptionsType}
   */
  readonly statefulRuleOptions?: NfwStatefulRuleOptionsType;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwRuleGroupConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateful-rule-groups-ips.html | Network Firewall rule group} configuration.
 *
 * @description
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
export interface INfwRuleGroupConfig {
  /**
   * A friendly name for the rule group.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the rule group to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: t.NonEmptyString;
  /**
   * The regions to deploy the rule group to.
   *
   * @see {@link Region}
   */
  readonly regions: t.Region[];
  /**
   * The capacity of the rule group.
   */
  readonly capacity: number;
  /**
   * The type of rules in the rule group.
   */
  readonly type: NfwRuleType;
  /**
   * (OPTIONAL) A description for the rule group.
   */
  readonly description?: t.NonEmptyString;
  /**
   * (OPTIONAL) A Network Firewall rule configuration.
   *
   * @see {@link NfwRuleGroupRuleConfig}
   */
  readonly ruleGroup?: INfwRuleGroupRuleConfig;
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
  readonly shareTargets?: t.IShareTargets;
  /**
   * (OPTIONAL) An array of tags for the rule group.
   */
  readonly tags?: t.ITag[];
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwFirewallPolicyConfig} / {@link NfwFirewallPolicyPolicyConfig} / {@link NfwStatefulRuleGroupReferenceConfig}*
 *
 * @description
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
export interface INfwStatefulRuleGroupReferenceConfig {
  /**
   * The friendly name of the rule group.
   *
   * @remarks
   * This is the logical `name` property of the rule group as defined in network-config.yaml.
   *
   * @see {@link NfwRuleGroupConfig}
   */
  readonly name: t.NonEmptyString;
  /**
   * (OPTIONAL) If using strict ordering, a priority number for the rule.
   */
  readonly priority?: number;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwFirewallPolicyConfig} / {@link NfwFirewallPolicyPolicyConfig} / {@link NfwStatelessRuleGroupReferenceConfig}*
 *
 * @description
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
export interface INfwStatelessRuleGroupReferenceConfig {
  /**
   * The friendly name of the rule group.
   *
   * @remarks
   * This is the logical `name` property of the rule group as defined in network-config.yaml.
   *
   * @see {@link NfwRuleGroupConfig}
   */
  readonly name: t.NonEmptyString;
  /**
   * A priority number for the rule.
   */
  readonly priority: number;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwFirewallPolicyConfig} / {@link NfwFirewallPolicyPolicyConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/firewall-policies.html | Network Firewall policy} policy configuration.
 *
 * @description
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
export interface INfwFirewallPolicyPolicyConfig {
  /**
   * (OPTIONAL) An array of default actions to take on packets evaluated by the stateful engine.
   */
  readonly statefulDefaultActions?: NfwStatefulDefaultActionType[];
  /**
   * (OPTIONAL) Define how the stateful engine will evaluate packets.
   *
   * @remarks
   * Default is DEFAULT_ACTION_ORDER. This property must be specified
   * if creating a STRICT_ORDER policy.
   */
  readonly statefulEngineOptions?: NfwStatefulRuleOptionsType;
  /**
   * {OPTIONAL) An array of Network Firewall stateful rule group reference configurations.
   *
   * @see {@link NfwStatefulRuleGroupReferenceConfig}
   */
  readonly statefulRuleGroups?: INfwStatefulRuleGroupReferenceConfig[];
  /**
   * (OPTIONAL) An array of Network Firewall custom action configurations.
   *
   * @see {@link NfwRuleSourceCustomActionConfig}
   */
  readonly statelessCustomActions?: INfwRuleSourceCustomActionConfig[];
  /**
   * An array of default actions to take on packets evaluated by the stateless engine.
   *
   * @remarks
   * If using a custom action, the action must be defined in the `statelessCustomActions` property.
   */
  readonly statelessDefaultActions: (NfwStatelessRuleActionType | t.NonEmptyString)[];
  /**
   * An array of default actions to take on fragmented packets.
   *
   * @remarks
   * If using a custom action, the action must be defined in the `statelessCustomActions` property.
   */
  readonly statelessFragmentDefaultActions: (NfwStatelessRuleActionType | t.NonEmptyString)[];
  /**
   * (OPTIONAL) An array of Network Firewall stateless rule group reference configurations.
   *
   * @see {@link NfwStatelessRuleGroupReferenceConfig}
   */
  readonly statelessRuleGroups?: INfwStatelessRuleGroupReferenceConfig[];
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwFirewallPolicyConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/firewall-policies.html | Network Firewall policy} configuration.
 *
 * @description
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
export interface INfwFirewallPolicyConfig {
  /**
   * A friendly name for the policy.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the policy to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: t.NonEmptyString;
  /**
   * Use this property to define specific behaviors and rule groups
   * to associate with the policy.
   *
   * @see {@link NfwFirewallPolicyPolicyConfig}
   */
  readonly firewallPolicy: INfwFirewallPolicyPolicyConfig;
  /**
   * The regions to deploy the policy to.
   *
   * @see {@link Region}
   */
  readonly regions: t.Region[];
  /**
   * (OPTIONAL) A description for the policy.
   */
  readonly description?: t.NonEmptyString;
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
  readonly shareTargets?: t.IShareTargets;
  /**
   * (OPTIONAL) An array of tags for the policy.
   */
  readonly tags?: t.ITag[];
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwFirewallConfig} / {@link NfwLoggingConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/firewall-logging.html | Network Firewall logging} configuration.
 *
 * @description
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
export interface INfwLoggingConfig {
  /**
   * The destination service to log to.
   *
   * @see {@link logDestinationTypeEnum}
   */
  readonly destination: t.LogDestinationType;
  /**
   * The type of actions to log.
   */
  readonly type: NfwLogType;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig} / {@link NfwFirewallConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/firewalls.html | Network Firewall firewall} configuration.
 *
 * @description
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
export interface INfwFirewallConfig {
  /**
   * A friendly name for the firewall.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the firewall to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: t.NonEmptyString;
  /**
   * The friendly name of the Network Firewall policy or ARN for an existing network firewall policy.
   *
   * @remarks
   * This is the logical `name` property of the policy as defined in network-config.yaml.
   *
   * @see {@link NfwFirewallPolicyConfig}
   */
  readonly firewallPolicy: t.NonEmptyString;
  /**
   * An array of the friendly names of subnets to deploy Network Firewall to.
   *
   * @remarks
   * This is the logical `name` property of the subnets as defined in network-config.yaml.
   * The listed subnets must exist in the VPC referenced in the `vpc` property.
   */
  readonly subnets: t.NonEmptyString[];
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
  readonly vpc: t.NonEmptyString;
  /**
   * (OPTIONAL) Enable for deletion protection on the firewall.
   */
  readonly deleteProtection?: boolean;
  /**
   * (OPTIONAL) A description for the firewall.
   */
  readonly description?: t.NonEmptyString;
  /**
   * (OPTIONAL) Enable to disallow firewall policy changes.
   */
  readonly firewallPolicyChangeProtection?: boolean;
  /**
   * (OPTIONAL) Enable to disallow firewall subnet changes.
   */
  readonly subnetChangeProtection?: boolean;
  /**
   * (OPTIONAL) An array of Network Firewall logging configurations.
   *
   * @see {@link NfwLoggingConfig}
   */
  readonly loggingConfiguration?: INfwLoggingConfig[];
  /**
   * (OPTIONAL) An array of tags for the firewall.
   */
  readonly tags?: t.ITag[];
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link NfwConfig}*
 *
 * {@link https://docs.aws.amazon.com/network-firewall/latest/developerguide/what-is-aws-network-firewall.html | Network Firewall} configuration.
 *
 * @description
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
export interface INfwConfig {
  /**
   * An array of Network Firewall firewall configurations.
   *
   * @see {@link NfwFirewallConfig}
   */
  readonly firewalls: INfwFirewallConfig[];
  /**
   * An array of Network Firewall policy configurations.
   *
   * @see {@link NfwFirewallPolicyConfig}
   */
  readonly policies: INfwFirewallPolicyConfig[];
  /**
   * An array of Network Firewall rule group configurations.
   *
   * @see {@link NfwRuleGroupConfig}
   */
  readonly rules: INfwRuleGroupConfig[];
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link GwlbConfig} / {@link GwlbEndpointConfig}*
 *
 * {@link https://docs.aws.amazon.com/elasticloadbalancing/latest/gateway/introduction.html#gateway-load-balancer-overview | Gateway Load Balancer endpoint} configuration.
 *
 * @description
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
export interface IGwlbEndpointConfig {
  /**
   * The friendly name of the Gateway Load Balancer endpoint.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the endpoint to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: t.NonEmptyString;
  /**
   * The friendly name of the account to deploy the endpoint to.
   *
   * @remarks
   * This is the `account` property of the VPC referenced in the `vpc` property.
   * For VPC templates, ensure the account referenced is included in `deploymentTargets`.
   *
   * @see {@link VpcConfig} | {@link VpcTemplatesConfig}
   */
  readonly account: t.NonEmptyString;
  /**
   * The friendly name of the subnet to deploy the Gateway Load Balancer endpoint to.
   *
   * @remarks
   * This is the friendly name of the subnet as defined in network-config.yaml.
   * The subnet must be defined in the `subnets` property of the VPC referenced in the `vpc` property.
   *
   * @see {@link SubnetConfig}
   */
  readonly subnet: t.NonEmptyString;
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
  readonly vpc: t.NonEmptyString;
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link GwlbConfig}*
 *
 * {@link https://docs.aws.amazon.com/elasticloadbalancing/latest/gateway/introduction.html#gateway-load-balancer-overview | Gateway Load Balancer} configuration.
 *
 * @description
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
export interface IGwlbConfig {
  /**
   * The friendly name of the Gateway Load Balancer.
   *
   * @remarks
   * **CAUTION**: Changing this property value after initial deployment causes the load balancer to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: t.NonEmptyString;
  /**
   * An array of Gateway Load Balancer endpoint configurations.
   *
   * @see {@link GwlbEndpointConfig}
   */
  readonly endpoints: IGwlbEndpointConfig[];
  /**
   * An array of friendly names of subnets to deploy the Gateway Load Balancer to.
   *
   * @remarks
   * This is the logical `name` property of the subnets as defined in network-config.yaml.
   * The subnets referenced must exist in the VPC referenced in the `vpc` property.
   *
   * @see {@link SubnetConfig}
   */
  readonly subnets: t.NonEmptyString[];
  /**
   * The friendly name of the VPC to deploy the Gateway Load Balancer to.
   *
   * @remarks
   * This is the logical `name` property of the VPC as defined in network-config.yaml.
   * VPC templates are not a supported target for Gateway Load Balancers.
   *
   * @see {@link VpcConfig}
   */
  readonly vpc: t.NonEmptyString;
  /**
   * (OPTIONAL) Set an override for the account the Gateway Load Balancer is deployed to.
   *
   * @remarks
   * This is the `account` property of the VPC referenced in the `vpc` property.
   *
   * This value defaults to the value set for the central network services delegated admin account.
   * Only set this value if you would like your Gateway Load Balancer deployed to an account other than
   * the configured delegated admin account.
   */
  readonly account?: t.NonEmptyString;
  /**
   * (OPTIONAL) Whether to enable cross-zone load balancing.
   */
  readonly crossZoneLoadBalancing?: boolean;
  /**
   * (OPTIONAL) Whether to enable deletion protection.
   */
  readonly deletionProtection?: boolean;
  /**
   * (OPTIONAL) The friendly name of a target group to forward traffic to
   *
   * @remarks
   * This target group must be defined in `Ec2FirewallConfig`
   * in the `customizations-config.yaml` configuration file
   */
  readonly targetGroup?: t.NonEmptyString;
  /**
   * (OPTIONAL) An array of CloudFormation tag objects.
   */
  readonly tags?: t.ITag[];
}

/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig}*
 *
 * @description
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
export interface ICentralNetworkServicesConfig {
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
  readonly delegatedAdminAccount: t.NonEmptyString;
  /**
   * An array of Gateway Load Balancer configurations.
   *
   * @see {@link GwlbConfig}
   */
  readonly gatewayLoadBalancers?: IGwlbConfig[];
  /**
   * An array of IPAM configurations.
   *
   * @see {@link IpamConfig}
   */
  readonly ipams?: IIpamConfig[];
  /**
   * A Route 53 resolver configuration.
   *
   * @see {@link ResolverConfig}
   */
  readonly route53Resolver?: IResolverConfig;
  /**
   * A Network Firewall configuration.
   *
   * @see {@link NfwConfig}
   */
  readonly networkFirewall?: INfwConfig;
}

/**
 * *{@link NetworkConfig} / {@link VpcPeeringConfig}*
 *
 * @description
 * VPC peering configuration.
 * Used to define VPC peering connections.
 *
 * VPC can be from vpc or vpcTemplates configuration.
 *
 * @remarks
 * **CAUTION**: Both vpcs can't be from vpcTemplates.
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
 * Between VPC Template and VPC
 * ```
 * vpcPeering:
 *   - name: Peering
 *     vpcs:
 *       - VPC-Template-A
 *       - VPC-B
 *     tags: []
 * ```
 */
export interface IVpcPeeringConfig {
  /**
   * A friendly name for the peering connection.
   */
  readonly name: t.NonEmptyString;
  /**
   * The VPCs to peer.
   *
   * VPC can be from vpc or vpcTemplates configuration.
   *
   * @remarks
   * **CAUTION**: Both vpcs can't be from vpcTemplates.
   */
  readonly vpcs: t.NonEmptyString[];
  /**
   * An array of tags for the peering connection.
   */
  readonly tags?: t.ITag[];
}

/**
 * An optional ELB root account ID
 */
export interface IElbAccountIdsConfig {
  readonly region: t.NonEmptyString;
  readonly accountId: t.NonEmptyString;
}

/**
 * *{@link NetworkConfig} / {@link FirewallManagerConfig} / {@link FirewallManagerNotificationChannelConfig}*
 *
 * @description
 * An optional Firewall Manager Service Config
 */
export interface IFirewallManagerNotificationChannelConfig {
  /**
   * The SNS Topic Name to publish to.
   */
  readonly snsTopic: t.NonEmptyString;
  /**
   * Enables the FMS notification channel. Defaults to enabled.
   */
  readonly region: t.NonEmptyString;
}

/**
 * *{@link NetworkConfig} / {@link FirewallManagerConfig}*
 *
 * @description
 * An optional Firewall Manager Service Config
 */
export interface IFirewallManagerServiceConfig {
  /**
   * The friendly account name to deploy the FMS configuration
   */
  readonly delegatedAdminAccount: t.NonEmptyString;
  /**
   * The FMS Notification Channel Configuration
   */
  readonly notificationChannels?: IFirewallManagerNotificationChannelConfig[];
}

export type CertificateConfigType = 'import' | 'request';
export type CertificateValidationType = 'EMAIL' | 'DNS';

/**
 * *{@link NetworkConfig} / {@link CertificateConfig}*
 *
 * @description
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
export interface ICertificateConfig {
  /**
   * Name of the certificate. This should be unique in the certificates array. Duplicate names will fail the validation.
   */
  readonly name: t.NonEmptyString;
  /**
   * Type of ACM cert. Valid values are `import` or `request`
   */
  readonly type: CertificateConfigType;
  /**
   * Path to the private key in S3 assets bucket. The bucket value is in the outputs of Pipeline stack in home region. Path should be given relative to the bucket.
   * The private key that matches the public key in the certificate.
   * This value should be provided when type is set to import or else validation fails.
   */
  readonly privKey?: t.NonEmptyString;
  /**
   * Path to certificate in S3 assets bucket. The bucket value is in the outputs of Pipeline stack in home region. Path should be given relative to the bucket.
   * The certificate to import.
   * This value should be provided when type is set to import or else validation fails.
   */
  readonly cert?: t.NonEmptyString;
  /**
   * Path to the PEM encoded certificate chain in S3 assets bucket. The bucket value is in the outputs of Pipeline stack in home region. Path should be given relative to the bucket.
   * This value is optional when type is set to import.
   */
  readonly chain?: t.NonEmptyString;
  /**
   * The method you want to use if you are requesting a public certificate to validate that you own or control domain. You can validate with DNS or validate with email.
   * Valid values are 'DNS' or 'EMAIL'.
   * This value should be provided when type is set to request or else validation fails.
   */
  readonly validation?: CertificateValidationType;
  /**
   * Fully qualified domain name (FQDN), such as www.example.com, that you want to secure with an ACM certificate. Use an asterisk (*) to create a wildcard certificate that protects several sites in the same domain. For example, *.example.com protects www.example.com, site.example.com, and images.example.com.
   * In compliance with RFC 5280, the length of the domain name (technically, the Common Name) that you provide cannot exceed 64 octets (characters), including periods. To add a longer domain name, specify it in the Subject Alternative Name field, which supports names up to 253 octets in length.
   * This value should be provided when type is set to request or else validation fails.
   */
  readonly domain?: t.NonEmptyString;
  /**
   * Additional FQDNs to be included in the Subject Alternative Name extension of the ACM certificate. For example, add the name www.example.net to a certificate for which the DomainName field is www.example.com if users can reach your site by using either name.
   */
  readonly san?: t.NonEmptyString[];
  /**
   * ACM deployment target. This should be provided to deploy ACM into OUs or account.
   */
  readonly deploymentTargets?: t.IDeploymentTargets;
}

/**
 * Network Configuration.
 * Used to define a network configuration for the accelerator.
 */
export interface INetworkConfig {
  /**
   * Accelerator home region name.
   *
   * @example
   * ```
   * homeRegion: &HOME_REGION us-east-1
   * ```
   */
  readonly homeRegion?: t.Region;
  /**
   * A default VPC configuration.
   *
   * @see {@link DefaultVpcsConfig}
   */
  readonly defaultVpc: IDefaultVpcsConfig;
  /**
   * A list of VPC configurations.
   * An array of VPC endpoint policies.
   *
   * @see {@link EndpointPolicyConfig}
   */
  readonly endpointPolicies: IEndpointPolicyConfig[];
  /**
   * An array of Transit Gateway configurations.
   *
   * @see {@link TransitGatewayConfig}
   */
  readonly transitGateways: ITransitGatewayConfig[];
  /**
   * An array of Transit Gateway Connect configurations.
   *
   * @see {@link TransitGatewayConnectConfig}
   */
  readonly transitGatewayConnects?: ITransitGatewayConnectConfig[];

  /**
   * Transit Gateway peering configuration.
   *
   * @see {@link TransitGatewayPeeringConfig}
   */
  readonly transitGatewayPeering?: ITransitGatewayPeeringConfig[];
  /**
   * An array of VPC configurations.
   *
   * @see {@link VpcConfig}
   */
  readonly vpcs: IVpcConfig[];
  /**
   * A VPC flow logs configuration.
   *
   * @see {@link VpcFlowLogsConfig}
   */
  readonly vpcFlowLogs?: t.IVpcFlowLogsConfig;
  /**
   * An optional Central Network services configuration.
   *
   * @see {@link CentralNetworkServicesConfig}
   */
  readonly centralNetworkServices?: ICentralNetworkServicesConfig;
  /**
   * An array of Customer Gateway configurations.
   *
   * @see {@link CustomerGatewayConfig}
   */
  readonly customerGateways?: ICustomerGatewayConfig[];
  /**
   * An optional list of DHCP options set configurations.
   *
   * @see {@link DhcpOptsConfig}
   */
  readonly dhcpOptions?: IDhcpOptsConfig[];
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
  readonly directConnectGateways?: IDxGatewayConfig[];
  /**
   * An optional list of prefix list set configurations.
   */
  readonly prefixLists?: IPrefixListConfig[];
  /**
   * An optional list of VPC peering configurations
   *
   * @see {@link VpcPeeringConfig}
   */
  readonly vpcPeering?: IVpcPeeringConfig[];
  /**
   * An optional list of VPC template configurations
   *
   * @see {@link VpcTemplatesConfig}
   */
  readonly vpcTemplates?: IVpcTemplatesConfig[];
  /**
   * An optional ELB root account ID
   */
  readonly elbAccountIds?: IElbAccountIdsConfig[];
  /**
   * Firewall manager service configuration
   */
  readonly firewallManagerService?: IFirewallManagerServiceConfig;
  /**
   * Certificate manager configuration
   */
  readonly certificates?: ICertificateConfig[];
  /**
   * A map between account Id and all the VPC IDs in the account.
   *
   * Currently, the dynamic values will only be loaded in FinalizeStack for SCP finalization.
   * Only the account VPCs referred in SCPs by ACCEL_LOOKUP will be loaded.
   */
  readonly accountVpcIds?: { [key: t.NonEmptyString]: t.NonEmptyString[] };
  /**
   * A map between account Id and all the VPC Endpoint IDs in the account.
   *
   * Currently, the dynamic values will only be loaded in FinalizeStack for SCP finalization.
   * Only the account VPC Endpoints referred by ACCEL_LOOKUP in SCPs will be loaded.
   */
  readonly accountVpcEndpointIds?: { [key: t.NonEmptyString]: t.NonEmptyString[] };
}
