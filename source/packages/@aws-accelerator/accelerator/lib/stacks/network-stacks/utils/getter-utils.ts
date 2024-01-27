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
  Ec2FirewallInstanceConfig,
  SubnetConfig,
  TransitGatewayConfig,
  VpcConfig,
  VpcTemplatesConfig,
} from '@aws-accelerator/config';
import {
  IIpamSubnet,
  PrefixList,
  RouteTable,
  SecurityGroup,
  Subnet,
  Vpc,
  VpnConnection,
} from '@aws-accelerator/constructs';
import { createLogger } from '@aws-accelerator/utils/lib/logger';

const logger = createLogger(['getter-utils']);

/**
 * Returns a prefix list object or tokenized ID from a given map if it exists
 * @param prefixListMap
 * @param prefixListName
 * @returns
 */
export function getPrefixList(
  prefixListMap: Map<string, PrefixList> | Map<string, string>,
  prefixListName: string,
): PrefixList | string {
  const prefixList = prefixListMap.get(prefixListName);

  if (!prefixList) {
    logger.error(`Prefix list ${prefixListName} does not exist in map`);
    throw new Error(`Configuration validation failed at runtime.`);
  }

  return prefixList;
}

/**
 * Returns a route table construct object from a given map if it exists
 * @param routeTableMap
 * @param vpcName
 * @param routeTableName
 * @returns
 */
export function getRouteTable(
  routeTableMap: Map<string, RouteTable> | Map<string, string>,
  vpcName: string,
  routeTableName: string,
): RouteTable | string {
  const key = `${vpcName}_${routeTableName}`;
  const routeTable = routeTableMap.get(key);

  if (!routeTable) {
    logger.error(`VPC ${vpcName} route table ${routeTableName} does not exist in map`);
    throw new Error(`Configuration validation failed at runtime.`);
  }

  return routeTable;
}

/**
 * Returns a security group construct object or tokenized ID from a given map if it exists
 * @param securityGroupMap
 * @param vpcName
 * @param securityGroupName
 * @returns
 */
export function getSecurityGroup(
  securityGroupMap: Map<string, SecurityGroup> | Map<string, string>,
  vpcName: string,
  securityGroupName: string,
): SecurityGroup | string {
  const key = `${vpcName}_${securityGroupName}`;
  const securityGroup = securityGroupMap.get(key);

  if (!securityGroup) {
    logger.error(`VPC ${vpcName} security group ${securityGroupName} does not exist in map`);
    throw new Error(`Configuration validation failed at runtime.`);
  }

  return securityGroup;
}

/**
 * Returns a subnet construct object or tokenized ID from a given map if it exists
 * @param subnetMap
 * @param vpcName
 * @param subnetName
 * @returns
 */
export function getSubnet(
  subnetMap: Map<string, Subnet> | Map<string, IIpamSubnet>,
  vpcName: string,
  subnetName: string,
  accountName?: string,
): Subnet | IIpamSubnet {
  const key = accountName ? `${vpcName}_${accountName}_${subnetName}` : `${vpcName}_${subnetName}`;
  const subnet = subnetMap.get(key);

  if (!subnet) {
    logger.error(`VPC ${vpcName} subnet ${subnetName} does not exist in map`);
    throw new Error(`Configuration validation failed at runtime.`);
  }

  return subnet;
}

/**
 * Get Transit Gateway ID from a given map, if it exists
 * @param transitGatewayMap
 * @param tgwName
 * @returns
 */
export function getTransitGatewayId(transitGatewayMap: Map<string, string>, tgwName: string): string {
  const tgwId = transitGatewayMap.get(tgwName);

  if (!tgwId) {
    logger.error(`Transit Gateway ${tgwName} does not exist in map`);
    throw new Error(`Configuration validation failed at runtime.`);
  }

  return tgwId;
}

/**
 * Get Transit Gateway route table ID from a given map, if it exists
 * @param tgwRouteTableMap Map<string, string>
 * @param tgwName string
 * @param routeTableName string
 * @returns string
 */
export function getTgwRouteTableId(
  tgwRouteTableMap: Map<string, string>,
  tgwName: string,
  routeTableName: string,
): string {
  const key = `${tgwName}_${routeTableName}`;
  const routeTableId = tgwRouteTableMap.get(key);

  if (!routeTableId) {
    logger.error(`Transit Gateway ${tgwName} route table ${routeTableName} does not exist in map`);
    throw new Error(`Configuration validation failed at runtime.`);
  }

  return routeTableId;
}

/**
 * Returns a VPC construct object from a given map if it exists
 * @param vpcMap
 * @param vpcName
 * @returns
 */
export function getVpc(vpcMap: Map<string, Vpc> | Map<string, string>, vpcName: string): Vpc | string {
  const vpc = vpcMap.get(vpcName);

  if (!vpc) {
    logger.error(`VPC ${vpcName} does not exist in map`);
    throw new Error(`Configuration validation failed at runtime.`);
  }

  return vpc;
}

/**
 * Returns a TGW VPN connection construct object from a given map if it exists
 * @param vpnMap Map<string, VpnConnection>
 * @param tgwName string
 * @param vpnName string
 * @returns VpnConnection
 */
export function getTgwVpnConnection(
  vpnMap: Map<string, VpnConnection>,
  tgwName: string,
  vpnName: string,
): VpnConnection {
  const key = `${tgwName}_${vpnName}`;
  const vpn = vpnMap.get(key);

  if (!vpn) {
    logger.error(`VPN connection ${vpnName} for transit gateway ${tgwName} does not exist in map`);
    throw new Error(`Configuration validation failed at runtime.`);
  }

  return vpn;
}

/**
 * Returns a TGW VPN attachment ID from a given map if it exists
 * @param attachmentMap Map<string, string>
 * @param tgwName string
 * @param vpnName string
 * @returns string
 */
export function getVpnAttachmentId(attachmentMap: Map<string, string>, tgwName: string, vpnName: string): string {
  const key = `${tgwName}_${vpnName}`;
  const attachmentId = attachmentMap.get(key);

  if (!attachmentId) {
    logger.error(`VPN attachment ID for VPN ${vpnName} to transit gateway ${tgwName} does not exist in map`);
    throw new Error(`Configuration validation failed at runtime.`);
  }

  return attachmentId;
}

/**
 * Returns a Transit Gateway configuration object from a given list of configurations if it exists
 * @param tgwResources TransitGatewayConfig[]
 * @param tgwName string
 * @returns TransitGatewayConfig
 */
export function getTgwConfig(tgwResources: TransitGatewayConfig[], tgwName: string): TransitGatewayConfig {
  const tgwConfig = tgwResources.find(tgw => tgw.name === tgwName);
  if (!tgwConfig) {
    logger.error(`Transit Gateway configuration for TGW ${tgwName} not found`);
    throw new Error(`Configuration validation failed at runtime.`);
  }
  return tgwConfig;
}

/**
 * Returns a VPC configuration object from a given list of configurations if it exists
 * @param vpcResources
 * @param vpcName
 * @returns
 */
export function getVpcConfig(
  vpcResources: (VpcConfig | VpcTemplatesConfig)[],
  vpcName: string,
): VpcConfig | VpcTemplatesConfig {
  const vpcConfig = vpcResources.find(vpc => vpc.name === vpcName);
  if (!vpcConfig) {
    logger.error(`VPC configuration for VPC ${vpcName} not found`);
    throw new Error(`Configuration validation failed at runtime.`);
  }
  return vpcConfig;
}

/**
 * Returns the name of the account owner of a VPC name from a given list of configurations if it exists
 * @param vpcResources
 * @param vpcName
 * @returns
 */
export function getVpcOwnerAccountName(vpcResources: (VpcConfig | VpcTemplatesConfig)[], vpcName: string): string {
  const vpcConfig = getVpcConfig(vpcResources, vpcName);

  if (vpcConfig instanceof VpcTemplatesConfig) {
    logger.error(`VPC Template ${vpcName} does not include 'account' property`);
    throw new Error(`Configuration validation failed at runtime.`);
  }

  return (vpcConfig as VpcConfig).account;
}

/**
 * Returns a subnet configuration object from a given list of configurations if it exists
 * @param vpcItem
 * @param subnetName
 * @returns
 */
export function getSubnetConfig(vpcItem: VpcConfig | VpcTemplatesConfig, subnetName: string): SubnetConfig {
  const subnetConfig = vpcItem.subnets?.find(subnet => subnet.name === subnetName);
  if (!subnetConfig) {
    logger.error(`Subnet configuration for VPC ${vpcItem.name} subnet ${subnetName} not found`);
    throw new Error(`Configuration validation failed at runtime.`);
  }
  return subnetConfig;
}

/**
 * Returns a firewall instance configuration object from a given list of configurations if it exists
 * @param firewallName string
 * @param firewallInstanceConfig Ec2FirewallInstanceConfig[] | undefined
 * @returns Ec2FirewallInstanceConfig
 */
export function getFirewallInstanceConfig(
  firewallName: string,
  firewallInstanceConfig?: Ec2FirewallInstanceConfig[],
): Ec2FirewallInstanceConfig {
  if (!firewallInstanceConfig) {
    logger.error(
      `Firewall instance configuration for firewall ${firewallName} not found. Firewall instances are not configured in customizations-config.yaml.`,
    );
    throw new Error(`Configuration validation failed at runtime.`);
  }

  const instanceConfig = firewallInstanceConfig.find(firewall => firewall.name === firewallName);
  if (!instanceConfig) {
    logger.error(`Firewall instance configuration for firewall ${firewallName} not found`);
    throw new Error(`Configuration validation failed at runtime.`);
  }
  return instanceConfig;
}

/**
 * Returns a customer gateway name associated with the given VPN connection name
 * @param customerGateway CustomerGatewayConfig[]
 * @param vpnName string
 * @returns string
 */
export function getCustomerGatewayName(customerGateways: CustomerGatewayConfig[], vpnName: string): string {
  const customerGatewayName = customerGateways.find(cgw => cgw.vpnConnections?.find(vpn => vpn.name === vpnName))?.name;
  if (!customerGatewayName) {
    logger.error(`Customer gateway name for VPN ${vpnName} not found`);
    throw new Error(`Configuration validation failed at runtime.`);
  }
  return customerGatewayName;
}

/**
 * Returns all keys with defined values for a given object
 * @param obj object
 * @returns string[]
 */
export function getObjectKeys(obj: object): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      keys.push(key);
    }
  }
  return keys;
}

/**
 * Parse the details of an ENI lookup on a firewall instance
 * @param lookupType
 * @param routeTableEntryName
 * @param routeTarget
 */
export function getNetworkInterfaceLookupDetails(
  lookupType: 'ENI_INDEX' | 'FIREWALL_NAME',
  routeTableEntryName: string,
  routeTarget: string | undefined,
): string {
  if (!routeTarget) {
    logger.error(`Unable to retrieve target ${routeTarget} for route table entry ${routeTableEntryName}`);
    throw new Error(`Configuration validation failed at runtime.`);
  }

  const lookupComponents = routeTarget.split(':');
  const eniIndex = lookupComponents[3].split('_').pop();
  const firewallName = lookupComponents[4].replace(/\}$/, '');

  if (!eniIndex) {
    logger.error(
      `Unable to retrieve deviceIndex from lookup ${routeTarget} for route table entry ${routeTableEntryName}`,
    );
    throw new Error(`Configuration validation failed at runtime.`);
  }

  if (lookupType === 'ENI_INDEX') {
    return eniIndex;
  } else if (lookupType === 'FIREWALL_NAME') {
    return firewallName;
  } else {
    logger.error(`Invalid lookup type passed`);
    throw new Error(`Configuration validation failed at runtime.`);
  }
}
