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
import * as cdk from 'aws-cdk-lib';

import {
  IpamCidrsMapType,
  ResourceShareType,
  V2NetworkResourceEnvironmentType,
  V2NetworkResourceListType,
} from './types';
import { createLogger } from '../../../../../../@aws-lza/index';
import path from 'path';
import { OrganizationConfig } from '@aws-accelerator/config/lib/organization-config';
import { AccountsConfig } from '@aws-accelerator/config/lib/accounts-config';
import {
  NetworkConfig,
  VpcConfig,
  VpcTemplatesConfig,
  VpcIpv6Config,
  NetworkAclConfig,
  NetworkAclSubnetSelection,
} from '@aws-accelerator/config/lib/network-config';
import { isNetworkType } from '@aws-accelerator/config/lib/common/parse';
import { Region } from '@aws-accelerator/config/lib/common/types';
import { AcceleratorStackProps } from '../../accelerator-stack';
import { VpcSubnetsBaseStack } from '../stacks/vpc-subnets-base-stack';
import { VpcRouteTablesBaseStack } from '../stacks/vpc-route-tables-base-stack';
import { VpcBaseStack } from '../stacks/vpc-base-stack';
import { VpcSecurityGroupsBaseStack } from '../stacks/vpc-security-groups-base-stack';
import { VpcNaclsBaseStack } from '../stacks/vp-nacls-base-stack';
import { VpcLoadBalancersBaseStack } from '../stacks/vpc-load-balancers-base-stack';
import { VpcSubnetsShareBaseStack } from '../stacks/vpc-subnets-share-base-stack';
import { AcceleratorStackNames, AcceleratorV2Stacks } from '../../../accelerator';
import {
  LookupValues,
  LZAResourceLookup,
  LZAResourceLookupType,
} from '@aws-accelerator/accelerator/utils/lza-resource-lookup';
import { GlobalConfig } from '@aws-accelerator/config/lib/global-config';
import { V2StackComponentsList } from './enums';
import { isIpv4 } from '../../network-stacks/utils/validation-utils';
import { NetworkVpcStackRouteEntryTypes } from './constants';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Function to get VPCs in scope for the environment
 * @param networkConfig {@link NetworkConfig}
 * @param accountsConfig {@link AccountsConfig}
 * @param env
 * @returns
 */
export function getVpcsInScope(
  networkConfig: NetworkConfig,
  accountsConfig: AccountsConfig,
  env: { accountId: string; region: string },
): (VpcConfig | VpcTemplatesConfig)[] {
  const vpcResources = [...networkConfig.vpcs, ...(networkConfig.vpcTemplates ?? [])];
  const vpcsInScope: (VpcConfig | VpcTemplatesConfig)[] = [];

  for (const vpcItem of vpcResources) {
    const vpcAccountIds = getVpcAccountIds(vpcItem, accountsConfig);

    if (vpcAccountIds.includes(env.accountId) && [vpcItem.region].includes(env.region as Region)) {
      // Add condition on VPC lookup
      vpcsInScope.push(vpcItem);
    }
  }
  return vpcsInScope;
}

/**
 * Function to get resource share principals
 * @param item {@link ResourceShareType}
 * @param resourceShareName string
 * @param accountsConfig {@link AccountsConfig}
 * @param organizationConfig {@link OrganizationConfig}
 * @returns
 */
export function getResourceSharePrincipals(
  item: ResourceShareType,
  resourceShareName: string,
  accountsConfig: AccountsConfig,
  organizationConfig: OrganizationConfig,
): string[] {
  // Build a list of principals to share to
  const principals: string[] = [];

  // Loop through all the defined OUs
  for (const ouItem of item.shareTargets?.organizationalUnits ?? []) {
    let ouArn = organizationConfig.getOrganizationalUnitArn(ouItem);
    // AWS::RAM::ResourceShare expects the organizations ARN if
    // sharing with the entire org (Root)
    if (ouItem === 'Root') {
      ouArn = ouArn.substring(0, ouArn.lastIndexOf('/')).replace('root', 'organization');
    }
    logger.info(`Share ${resourceShareName} with Organizational Unit ${ouItem}: ${ouArn}`);
    principals.push(ouArn);
  }

  // Loop through all the defined accounts
  for (const account of item.shareTargets?.accounts ?? []) {
    const accountId = accountsConfig.getAccountId(account);
    logger.info(`Share ${resourceShareName} with Account ${account}: ${accountId}`);
    principals.push(accountId);
  }

  return principals;
}

/**
 * Function to get resource list deployable by V2 stacks
 * @param vpcsInScope {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param globalConfig {@link GlobalConfig}
 * @param networkConfig {@link NetworkConfig}
 * @param acceleratorPrefix string
 * @param env {@link V2NetworkResourceEnvironmentType}
 * @returns
 */
function getV2NetworkResources(
  vpcsInScope: (VpcConfig | VpcTemplatesConfig)[],
  globalConfig: GlobalConfig,
  accountsConfig: AccountsConfig,
  networkConfig: NetworkConfig,
  acceleratorPrefix: string,
  env: V2NetworkResourceEnvironmentType,
): V2NetworkResourceListType[] {
  const v2Components: V2NetworkResourceListType[] = [];
  const lzaLookup: LZAResourceLookup = new LZAResourceLookup({
    accountId: env.accountId,
    region: env.region,
    aseaResourceList: globalConfig.externalLandingZoneResources?.resourceList ?? [],
    enableV2Stacks: globalConfig.useV2Stacks,
    externalLandingZoneResources: globalConfig.externalLandingZoneResources?.importExternalLandingZoneResources,
    stackName: env.stackName,
  });

  for (const vpcItem of vpcsInScope) {
    getV2VpcResources(vpcItem, lzaLookup, v2Components);

    getV2FlowLogResources(vpcItem, lzaLookup, networkConfig, v2Components);

    getV2AdditionalIpv4CidrResources(vpcItem, lzaLookup, v2Components);

    getV2Ipv6CidrResources(vpcItem, lzaLookup, v2Components);

    getV2EgressOnlyInternetGatewayResource(vpcItem, lzaLookup, v2Components);

    getV2InternetGatewayResource(vpcItem, lzaLookup, v2Components);

    getV2VirtualPrivateGatewayResource(vpcItem, lzaLookup, v2Components);

    getV2DhcpOptionsAssociationResource(vpcItem, lzaLookup, v2Components);

    getV2DeleteDefaultSecurityGroupRulesResource(vpcItem, lzaLookup, v2Components);

    getV2VpnConnectionsResource(networkConfig, vpcItem, lzaLookup, v2Components);

    getV2RouteTableResource(vpcItem, lzaLookup, v2Components);

    getV2RouteTableEntryResource(vpcItem, lzaLookup, v2Components);

    getV2RouteTableGatewayAssociationResources(vpcItem, lzaLookup, v2Components);

    getV2LocalGatewayRouteTableVPCAssociationResources(vpcItem, lzaLookup, v2Components);

    getV2SubnetResources(vpcItem, lzaLookup, v2Components);

    getV2ShareSubnetResources(vpcItem, lzaLookup, v2Components);

    getV2NetGateWayResources(vpcItem, lzaLookup, v2Components);

    getV2TgwVpcAttachmentRoleResources(accountsConfig, vpcItem, acceleratorPrefix, env, lzaLookup, v2Components);

    getV2TgwVpcAttachmentResources(accountsConfig, vpcItem, lzaLookup, v2Components);

    getV2LoadBalancersResources(
      networkConfig,
      vpcItem,
      globalConfig.homeRegion,
      env,
      acceleratorPrefix,
      lzaLookup,
      v2Components,
    );

    getV2NetworkAclResources(vpcItem, lzaLookup, accountsConfig, networkConfig, env, v2Components);
  }

  return v2Components;
}

/**
 * Function to get V2 stack eligible VPCs
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2VpcResources(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
): void {
  if (
    !lzaLookup.resourceExists({
      resourceType: LZAResourceLookupType.VPC,
      lookupValues: { vpcName: vpcItem.name },
    })
  ) {
    logger.info(
      `VPC ${vpcItem.name} is not present in the existing stack, resource will be deployed through V2 stacks`,
    );
    v2Components.push({ vpcName: vpcItem.name, resourceType: V2StackComponentsList.VPC });
  }
}

/**
 * Function to get V2 stack eligible VPC flow logs resources
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param networkConfig {@link NetworkConfig}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2FlowLogResources(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  networkConfig: NetworkConfig,
  v2Components: V2NetworkResourceListType[],
): void {
  if (vpcItem.vpcFlowLogs || networkConfig.vpcFlowLogs) {
    if (
      !lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.FLOW_LOG,
        lookupValues: { vpcName: vpcItem.name, flowLogDestinationType: 'cloud-watch-logs' },
      })
    ) {
      logger.info(
        `VPC ${vpcItem.name} CloudWatch flow logs destination is not present in the existing stack, resource will be deployed through V2 stacks`,
      );
      v2Components.push({ vpcName: vpcItem.name, resourceType: V2StackComponentsList.CWL_FLOW_LOGS });
    }

    if (
      !lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.FLOW_LOG,
        lookupValues: { vpcName: vpcItem.name, flowLogDestinationType: 's3' },
      })
    ) {
      logger.info(
        `VPC ${vpcItem.name} S3 flow logs destination is not present in the existing stack, resource will be deployed through V2 stacks`,
      );
      v2Components.push({ vpcName: vpcItem.name, resourceType: V2StackComponentsList.S3_FLOW_LOGS });
    }
  }
}

/**
 * Function to get V2 stack eligible VPC additional IPV4 CIDR resources
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2AdditionalIpv4CidrResources(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
): void {
  if (vpcItem.cidrs && vpcItem.cidrs.length > 1) {
    for (const vpcCidr of vpcItem.cidrs.slice(1)) {
      if (
        !lzaLookup.resourceExists({
          resourceType: LZAResourceLookupType.VPC_CIDR_BLOCK,
          lookupValues: { vpcName: vpcItem.name, cidrBlock: vpcCidr } as LookupValues,
        })
      ) {
        logger.info(
          `VPC ${vpcItem.name} additional IPV4 CIDR ${vpcCidr} is not present in the existing stack, resource will be deployed through V2 stacks`,
        );
        v2Components.push({
          vpcName: vpcItem.name,
          resourceType: V2StackComponentsList.ADDITIONAL_CIDR_BLOCK,
          resourceName: vpcCidr,
        });
      }
    }
  }

  // IPAM Cidrs
  if (vpcItem.ipamAllocations && vpcItem.ipamAllocations.length > 1) {
    const ipamCidrsMap: IpamCidrsMapType = {};
    for (const ipamAllocation of vpcItem.ipamAllocations.slice(1)) {
      const ipamCidrKey = `${ipamAllocation.ipamPoolName}-${ipamAllocation.netmaskLength}`;
      if (!(ipamCidrKey in ipamCidrsMap)) {
        ipamCidrsMap[ipamCidrKey] = 0;
      } else {
        ipamCidrsMap[ipamCidrKey]++;
      }

      const ipamCidrIndex = ipamCidrsMap[ipamCidrKey];

      if (
        !lzaLookup.resourceExists({
          resourceType: LZAResourceLookupType.VPC_CIDR_BLOCK,
          lookupValues: {
            vpcName: vpcItem.name,
            netmaskLength: ipamAllocation.netmaskLength.toString(),
            ipamPoolName: ipamAllocation.ipamPoolName,
            ipamCidrIndex,
          } as LookupValues,
        })
      ) {
        logger.info(
          `VPC ${vpcItem.name} additional IPAM CIDR ${ipamAllocation.ipamPoolName} for ${ipamAllocation.netmaskLength} netmask with ${ipamCidrIndex} index is not present in the existing stack, resource will be deployed through V2 stacks`,
        );
        v2Components.push({
          vpcName: vpcItem.name,
          resourceType: V2StackComponentsList.ADDITIONAL_IPAM_ALLOCATION,
          resourceName: `${ipamAllocation.ipamPoolName}|${ipamAllocation.netmaskLength}|${ipamCidrIndex}`,
        });
      }
    }
  }
}

/**
 * Function to get V2 stack eligible VPC IPV6 CIDR resources
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2Ipv6CidrResources(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
): void {
  if (vpcItem.ipv6Cidrs && vpcItem.ipv6Cidrs.length > 0) {
    // amazonProvided
    const amazonProvidedCidrs = vpcItem.ipv6Cidrs.filter(cidrItem => cidrItem.amazonProvided);
    amazonProvidedCidrs.map((cidrItem, index) => {
      const cidrInfo = {
        amazonProvidedIpv6CidrBlock: cidrItem.amazonProvided,
        metadata: {
          vpcName: vpcItem.name,
          amazonProvidedIpv6CidrBlock: cidrItem.amazonProvided,
          amazonProvidedCidrIndex: index,
        },
      };
      if (
        !lzaLookup.resourceExists({
          resourceType: LZAResourceLookupType.VPC_CIDR_BLOCK,
          lookupValues: {
            ...cidrInfo.metadata,
          } as LookupValues,
        })
      ) {
        logger.info(
          `VPC ${vpcItem.name} IPV6 CIDR for amazonProvided is not present in the existing stack, resource will be deployed through V2 stacks`,
        );
        v2Components.push({
          vpcName: vpcItem.name,
          resourceType: V2StackComponentsList.ADDITIONAL_CIDR_BLOCK,
          resourceName: `amazonProvided|${index}`,
        });
      }
    });

    // BYO Pool

    const byoipPoolCidrs = vpcItem.ipv6Cidrs.filter(cidrItem => cidrItem.byoipPoolId && cidrItem.cidrBlock);
    const cidrIndex: { [key: string]: number } = {};
    byoipPoolCidrs.map((cidrItem, index) => {
      const cidrKey = `${cidrItem.byoipPoolId}-${cidrItem.cidrBlock}`;
      if (!(cidrKey in cidrIndex)) {
        cidrIndex[cidrKey] = 0;
      } else {
        cidrIndex[cidrKey]++;
      }

      const cidrInfo = {
        ipv6CidrBlock: cidrItem.cidrBlock,
        ipv6Pool: cidrItem.byoipPoolId,
        metadata: {
          vpcName: vpcItem.name,
          ipv6CidrBlock: cidrItem.cidrBlock,
          ipv6pool: cidrItem.byoipPoolId,
          ipamCidrIndex: cidrIndex[cidrKey],
        },
      };

      if (
        !lzaLookup.resourceExists({
          resourceType: LZAResourceLookupType.VPC_CIDR_BLOCK,
          lookupValues: {
            ...cidrInfo.metadata,
          } as LookupValues,
        })
      ) {
        logger.info(
          `VPC ${vpcItem.name} IPV6 CIDR ${cidrItem.cidrBlock} from BYP id ${cidrItem.byoipPoolId} is not present in the existing stack, resource will be deployed through V2 stacks`,
        );
        v2Components.push({
          vpcName: vpcItem.name,
          resourceType: V2StackComponentsList.ADDITIONAL_CIDR_BLOCK,
          resourceName: `${cidrItem.byoipPoolId}|${cidrItem.cidrBlock}|${index}`,
        });
      }
    });
  }
}

/**
 * Creates a map that tracks IPv6 CIDR indices for a VPC
 *
 * @param vpcItem - The VPC configuration item
 * @returns A Map containing CIDR keys and their corresponding index counts
 *
 * @remarks
 * This function handles two types of IPv6 CIDRs:
 * - Amazon-provided CIDRs: Tracked with a single key using VPC name and "amazonProvided" suffix
 * - BYOIP pool CIDRs: Tracked individually with keys generated from VPC name, pool ID, and CIDR block
 *
 * The returned map is used to track the index of each CIDR type for resource lookups.
 */
export function setCidrIndexMap(vpcItem: VpcConfig | VpcTemplatesConfig): Map<string, number> {
  const cidrIndexMap = new Map<string, number>();
  const amazonProvidedCidrs = vpcItem.ipv6Cidrs?.filter(cidr => cidr.amazonProvided);
  const byoipPoolCidrs = vpcItem.ipv6Cidrs?.filter(cidr => cidr.byoipPoolId) ?? [];
  if (amazonProvidedCidrs && amazonProvidedCidrs.length > 0) {
    cidrIndexMap.set(`${vpcItem.name}-amazonProvided`, amazonProvidedCidrs.length);
  }
  for (const cidr of byoipPoolCidrs) {
    if (!cidr.byoipPoolId && !cidr.cidrBlock) {
      continue;
    }
    const cidrKey = getIpv6CidrKey(vpcItem, cidr);
    const cidrValue = cidrIndexMap.get(cidrKey);
    if (!cidrValue) {
      cidrIndexMap.set(cidrKey, 0);
    } else {
      cidrIndexMap.set(cidrKey, cidrValue + 1);
    }
  }
  return cidrIndexMap;
}

/**
 * Generates a unique key for IPv6 CIDR lookup based on VPC and CIDR configuration
 *
 * @param vpcItem - The VPC configuration item
 * @param cidr - The IPv6 CIDR configuration
 * @returns A string key used to identify the IPv6 CIDR in lookup maps
 */
function getIpv6CidrKey(vpcItem: VpcConfig | VpcTemplatesConfig, cidr: VpcIpv6Config): string {
  if (cidr.amazonProvided) {
    return `${vpcItem.name}-amazonProvided`;
  }
  return `${vpcItem.name}-${cidr.byoipPoolId}-${cidr.cidrBlock}`;
}

/**
 * Function to get V2 stack eligible VPC egress only internet gateway resource
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2EgressOnlyInternetGatewayResource(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
): void {
  if (
    !lzaLookup.resourceExists({
      resourceType: LZAResourceLookupType.EGRESS_ONLY_INTERNET_GATEWAY,
      lookupValues: { vpcName: vpcItem.name },
    }) &&
    vpcItem.egressOnlyIgw
  ) {
    logger.info(
      `VPC ${vpcItem.name} egress only internet gateway is not present in the existing stack, resource will be deployed through V2 stacks`,
    );
    v2Components.push({
      vpcName: vpcItem.name,
      resourceType: V2StackComponentsList.EGRESS_ONLY_IGW,
    });
  }
}

/**
 * Function to get V2 stack eligible VPC internet gateway resource
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2InternetGatewayResource(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
): void {
  if (
    !lzaLookup.resourceExists({
      resourceType: LZAResourceLookupType.INTERNET_GATEWAY,
      lookupValues: { vpcName: vpcItem.name },
    }) &&
    vpcItem.internetGateway
  ) {
    logger.info(
      `VPC ${vpcItem.name} internet gateway is not present in the existing stack, resource will be deployed through V2 stacks`,
    );
    v2Components.push({
      vpcName: vpcItem.name,
      resourceType: V2StackComponentsList.INTERNET_GATEWAY,
    });
  }
}

/**
 * Function to get V2 stack eligible VPC virtual private gateway resource
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2VirtualPrivateGatewayResource(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
): void {
  if (
    !lzaLookup.resourceExists({
      resourceType: LZAResourceLookupType.VIRTUAL_PRIVATE_GATEWAY,
      lookupValues: { vpcName: vpcItem.name },
    }) &&
    vpcItem.virtualPrivateGateway
  ) {
    logger.info(
      `VPC ${vpcItem.name} egress only virtual private gateway is not present in the existing stack, resource will be deployed through V2 stacks`,
    );
    v2Components.push({
      vpcName: vpcItem.name,
      resourceType: V2StackComponentsList.VIRTUAL_PRIVATE_GATEWAY,
    });
  }
}

/**
 * Function to get V2 stack eligible VPC dhcp options association resource
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2DhcpOptionsAssociationResource(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
): void {
  if (
    !lzaLookup.resourceExists({
      resourceType: LZAResourceLookupType.VPC_DHCP_OPTIONS_ASSOCIATION,
      lookupValues: { vpcName: vpcItem.name, dhcpOptionsName: vpcItem.dhcpOptions },
    }) &&
    vpcItem.dhcpOptions
  ) {
    logger.info(
      `VPC ${vpcItem.name} dhcp options association ${vpcItem.dhcpOptions} is not present in the existing stack, resource will be deployed through V2 stacks`,
    );
    v2Components.push({
      vpcName: vpcItem.name,
      resourceType: V2StackComponentsList.VPC_DHCP_OPTIONS_ASSOCIATION,
      resourceName: vpcItem.dhcpOptions,
    });
  }
}

/**
 * Function to get V2 stack eligible VPC delete default security group resource
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2DeleteDefaultSecurityGroupRulesResource(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
): void {
  if (
    !lzaLookup.resourceExists({
      resourceType: LZAResourceLookupType.DELETE_VPC_DEFAULT_SECURITY_GROUP_RULES,
      lookupValues: { vpcName: vpcItem.name },
    }) &&
    vpcItem.defaultSecurityGroupRulesDeletion
  ) {
    logger.info(
      `VPC ${vpcItem.name} delete default security group rules is not present in the existing stack, resource will be deployed through V2 stacks`,
    );
    v2Components.push({
      vpcName: vpcItem.name,
      resourceType: V2StackComponentsList.DELETE_DEFAULT_SECURITY_GROUP_RULES,
    });
  }
}

/**
 * Function to get V2 stack eligible Vpn Connections resources
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2VpnConnectionsResource(
  networkConfig: NetworkConfig,
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
): void {
  const ipv4Cgws = networkConfig.customerGateways?.filter(cgw => isIpv4(cgw.ipAddress));
  for (const cgw of ipv4Cgws ?? []) {
    for (const vpnItem of cgw.vpnConnections ?? []) {
      if (
        !lzaLookup.resourceExists({
          resourceType: LZAResourceLookupType.VPN_CONNECTION,
          lookupValues: {
            vpcName: vpnItem.vpc,
            vpnName: vpnItem.name,
            cgwName: cgw.name,
          },
        }) &&
        vpnItem.vpc === vpcItem.name
      ) {
        logger.info(
          `VPC ${vpcItem.name} vpn connection ${vpnItem.name} is not present in the existing stack, resource will be deployed through V2 stacks`,
        );
        v2Components.push({
          vpcName: vpcItem.name,
          resourceType: V2StackComponentsList.VPN_CONNECTION,
          resourceName: `${cgw.name}|${vpnItem.name}`,
        });
      }
    }
  }
}

/**
 * Function to get V2 route table resources
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2RouteTableResource(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
): void {
  for (const routeTableItem of vpcItem.routeTables ?? []) {
    if (
      !lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.ROUTE_TABLE,
        lookupValues: {
          vpcName: vpcItem.name,
          routeTableName: routeTableItem.name,
        },
      })
    ) {
      logger.info(
        `VPC ${vpcItem.name} route table ${routeTableItem.name} is not present in the existing stack, resource will be deployed through V2 stacks`,
      );
      v2Components.push({
        vpcName: vpcItem.name,
        resourceType: V2StackComponentsList.ROUTE_TABLE,
        resourceName: routeTableItem.name,
      });
    }
  }
}

/**
 * Function to get V2 Local GateWay Route Table Entry resources
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2RouteTableEntryResource(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
): void {
  for (const routeTableItem of vpcItem.routeTables ?? []) {
    for (const routeTableEntryItem of routeTableItem.routes ?? []) {
      const metadata = {
        vpcName: vpcItem.name,
        routeTableName: routeTableItem.name,
        routeTableEntryName: routeTableEntryItem.name,
        type: routeTableEntryItem.type,
      };
      const routeExists = lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.ROUTE,
        lookupValues: metadata,
      });

      const prefixListRouteExists = lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.PREFIX_LIST_ROUTE,
        lookupValues: metadata,
      });

      if (
        !routeExists &&
        !prefixListRouteExists &&
        NetworkVpcStackRouteEntryTypes.includes(routeTableEntryItem.type ?? '')
      ) {
        logger.info(
          `VPC ${vpcItem.name} route table ${routeTableItem.name} route table entry ${routeTableEntryItem.name} is not present in the existing stack, resource will be deployed through V2 stacks`,
        );
        v2Components.push({
          vpcName: vpcItem.name,
          resourceType: V2StackComponentsList.ROUTE_ENTRY,
          resourceName: `${routeTableItem.name}|${routeTableEntryItem.name}|${routeTableEntryItem.type}|${
            routeTableEntryItem.destination ?? routeTableEntryItem.destinationPrefixList
          }|${routeTableEntryItem.target}`,
        });
      }
    }
  }
}

/**
 * Function to get V2 route table GateWay Association resources
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2RouteTableGatewayAssociationResources(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
): void {
  for (const routeTableItem of vpcItem.routeTables ?? []) {
    if (
      routeTableItem.gatewayAssociation &&
      !lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.GATEWAY_ROUTE_TABLE_ASSOCIATION,
        lookupValues: {
          vpcName: vpcItem.name,
          routeTableName: routeTableItem.name,
          associationType: routeTableItem.gatewayAssociation,
        },
      })
    ) {
      logger.info(
        `VPC ${vpcItem.name} route table ${routeTableItem.name} gateway association ${routeTableItem.gatewayAssociation} is not present in the existing stack, resource will be deployed through V2 stacks`,
      );
      v2Components.push({
        vpcName: vpcItem.name,
        resourceType: V2StackComponentsList.ROUTE_TABLE_GATEWAY_ASSOCIATION,
        resourceName: `${routeTableItem.name}|${routeTableItem.gatewayAssociation}`,
      });
    }
  }
}

/**
 * Function to get V2 Local GateWay Route Table Association resources
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2LocalGatewayRouteTableVPCAssociationResources(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
): void {
  if (isNetworkType<VpcConfig>('IVpcConfig', vpcItem)) {
    for (const outpost of vpcItem.outposts ?? []) {
      for (const routeTableItem of outpost.localGateway?.routeTables ?? []) {
        if (
          !lzaLookup.resourceExists({
            resourceType: LZAResourceLookupType.LOCAL_GATEWAY_ROUTE_TABLE_VPC_ASSOCIATION,
            lookupValues: {
              routeTableName: routeTableItem.name,
              vpcName: vpcItem.name,
              vpcAccount: vpcItem.account,
            },
          })
        ) {
          logger.info(
            `VPC ${vpcItem.name} local gateway route table vpc association ${routeTableItem.name} is not present in the existing stack, resource will be deployed through V2 stacks`,
          );
          v2Components.push({
            vpcName: vpcItem.name,
            resourceType: V2StackComponentsList.LOCAL_GATEWAY_ROUTE_TABLE_VPC_ASSOCIATION,
            resourceName: `${vpcItem.account}|${routeTableItem.name}|${routeTableItem.id}`,
          });
        }
      }
    }
  }
}

/**
 * Function to get V2 Subnet resources
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2SubnetResources(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
): void {
  for (const subnetItem of vpcItem.subnets ?? []) {
    const subnetExists = lzaLookup.resourceExists({
      resourceType: LZAResourceLookupType.SUBNET,
      lookupValues: { vpcName: vpcItem.name, subnetName: subnetItem.name },
    });

    const ipamSubnetExists = lzaLookup.resourceExists({
      resourceType: LZAResourceLookupType.IPAM_SUBNET,
      lookupValues: { vpcName: vpcItem.name, subnetName: subnetItem.name },
    });

    if (!subnetExists && !ipamSubnetExists) {
      logger.info(
        `VPC ${vpcItem.name} subnet ${subnetItem.name} is not present in the existing stack, resource will be deployed through V2 stacks`,
      );
      v2Components.push({
        vpcName: vpcItem.name,
        resourceType: V2StackComponentsList.SUBNET,
        resourceName: subnetItem.name,
      });
    }
  }
}

/**
 * Function to get V2 Share Subnet resources
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2ShareSubnetResources(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
): void {
  for (const subnetItem of vpcItem.subnets ?? []) {
    if (
      subnetItem.shareTargets &&
      !lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.SUBNET_SHARE,
        lookupValues: { vpcName: vpcItem.name, subnetName: subnetItem.name },
      })
    ) {
      logger.info(
        `VPC ${vpcItem.name} subnet ${subnetItem.name} share targets is not present in the existing stack, resource will be deployed through V2 stacks`,
      );
      v2Components.push({
        vpcName: vpcItem.name,
        resourceType: V2StackComponentsList.SUBNET_SHARE,
        resourceName: subnetItem.name,
      });
    }
  }
}

/**
 * Function to get V2 Net GateWay resources
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2NetGateWayResources(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
): void {
  for (const natGatewayItem of vpcItem.natGateways ?? []) {
    if (
      !lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.NAT_GATEWAY,
        lookupValues: {
          vpcName: vpcItem.name,
          natGatewayName: natGatewayItem.name,
        },
      })
    ) {
      logger.info(
        `VPC ${vpcItem.name} network firewall net gateway ${natGatewayItem.name} is not present in the existing stack, resource will be deployed through V2 stacks`,
      );
      v2Components.push({
        vpcName: vpcItem.name,
        resourceType: V2StackComponentsList.NAT_GATEWAY,
        resourceName: `${natGatewayItem.name}|${natGatewayItem.subnet}`,
      });
    }
  }
}

/**
 * Function to get V2 TGW VPC Attachment Role resources
 * @param accountsConfig {@link AccountsConfig}
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param env {@link V2NetworkResourceEnvironmentType}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2TgwVpcAttachmentRoleResources(
  accountsConfig: AccountsConfig,
  vpcItem: VpcConfig | VpcTemplatesConfig,
  acceleratorPrefix: string,
  env: V2NetworkResourceEnvironmentType,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
): void {
  const roleName = `${acceleratorPrefix}-DescribeTgwAttachRole-${env.region}`;
  const tgwOwningAccountIds = getTgwOwningAccountIds(vpcItem, accountsConfig, env);

  for (const tgwAttachmentItem of vpcItem.transitGatewayAttachments ?? []) {
    if (
      tgwOwningAccountIds.length > 0 &&
      !lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.ROLE,
        lookupValues: {
          roleName,
        },
      })
    ) {
      logger.info(
        `VPC ${vpcItem.name} transit gateway vpc attachment role ${tgwAttachmentItem.name} is not present in the existing stack, resource will be deployed through V2 stacks`,
      );
      v2Components.push({
        vpcName: vpcItem.name,
        resourceType: V2StackComponentsList.TGW_VPC_ATTACHMENT_ROLE,
        resourceName: `${roleName}|${env.accountId}`,
      });
    }
  }
}

/**
 * Function to get V2 TGW VPC Attachment Role resources
 * @param accountsConfig {@link AccountsConfig}
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2TgwVpcAttachmentResources(
  accountsConfig: AccountsConfig,
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
): void {
  for (const tgwAttachmentItem of vpcItem.transitGatewayAttachments ?? []) {
    if (
      !lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.TRANSIT_GATEWAY_VPC_ATTACHMENT,
        lookupValues: {
          vpcName: vpcItem.name,
          transitGatewayName: tgwAttachmentItem.transitGateway.name,
          transitGatewayAttachmentName: tgwAttachmentItem.name,
        },
      })
    ) {
      logger.info(
        `VPC ${vpcItem.name} transit gateway vpc attachment ${tgwAttachmentItem.name} is not present in the existing stack, resource will be deployed through V2 stacks`,
      );
      const tgwAccountId = accountsConfig.getAccountId(tgwAttachmentItem.transitGateway.account);
      v2Components.push({
        vpcName: vpcItem.name,
        resourceType: V2StackComponentsList.TGW_VPC_ATTACHMENT,
        resourceName: `${tgwAttachmentItem.name}|${tgwAttachmentItem.transitGateway.name}|${tgwAccountId}`,
      });
    }
  }
}

/**
 * Function to get V2 Load balancers resources
 * @param accountsConfig {@link AccountsConfig}
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param homeRegion string
 * @param env {@link V2NetworkResourceEnvironmentType}
 * @param acceleratorPrefix string
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2LoadBalancersResources(
  networkConfig: NetworkConfig,
  vpcItem: VpcConfig | VpcTemplatesConfig,
  homeRegion: string,
  env: V2NetworkResourceEnvironmentType,
  acceleratorPrefix: string,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
) {
  getV2GateWayLoadBalancersResources(networkConfig, vpcItem, lzaLookup, v2Components);

  getV2ApplicationLoadBalancersResources(vpcItem, lzaLookup, v2Components);

  getV2NetworkLoadBalancersResources(vpcItem, lzaLookup, v2Components);

  getV2NetworkLoadBalancerRoleResources(vpcItem, homeRegion, env, acceleratorPrefix, lzaLookup, v2Components);
}

/**
 * Function to get V2 Gateway Load balancers resources
 * @param networkConfig {@link NetworkConfig}
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2GateWayLoadBalancersResources(
  networkConfig: NetworkConfig,
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
): void {
  for (const gatewayLoadBalancer of networkConfig.centralNetworkServices?.gatewayLoadBalancers ?? []) {
    if (
      vpcItem.name === gatewayLoadBalancer.vpc &&
      !lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.LOAD_BALANCER,
        lookupValues: { vpcName: vpcItem.name, gwlbName: gatewayLoadBalancer.name },
      })
    ) {
      logger.info(
        `VPC ${vpcItem.name} gateway load balancer ${gatewayLoadBalancer.name} is not present in the existing stack, resource will be deployed through V2 stacks`,
      );
      v2Components.push({
        vpcName: vpcItem.name,
        resourceType: V2StackComponentsList.GATEWAY_LOAD_BALANCER,
        resourceName: gatewayLoadBalancer.name,
      });
    }
  }
}

/**
 * Function to get V2 Application Load balancers resources
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2ApplicationLoadBalancersResources(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
): void {
  for (const applicationLoadBalancer of vpcItem.loadBalancers?.applicationLoadBalancers ?? []) {
    if (
      !applicationLoadBalancer.shareTargets &&
      !lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.LOAD_BALANCER,
        lookupValues: { vpcName: vpcItem.name, albName: applicationLoadBalancer.name },
      })
    ) {
      logger.info(
        `VPC ${vpcItem.name} application load balancer ${applicationLoadBalancer.name} is not present in the existing stack, resource will be deployed through V2 stacks`,
      );
      v2Components.push({
        vpcName: vpcItem.name,
        resourceType: V2StackComponentsList.APPLICATION_LOAD_BALANCER,
        resourceName: applicationLoadBalancer.name,
      });
    }
  }
}

/**
 * Function to get V2 Network Load balancers resources
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2NetworkLoadBalancersResources(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
): void {
  for (const networkLoadBalancer of vpcItem.loadBalancers?.networkLoadBalancers ?? []) {
    if (
      !lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.LOAD_BALANCER,
        lookupValues: { vpcName: vpcItem.name, albName: networkLoadBalancer.name },
      })
    ) {
      logger.info(
        `VPC ${vpcItem.name} network load balancer ${networkLoadBalancer.name} is not present in the existing stack, resource will be deployed through V2 stacks`,
      );
      v2Components.push({
        vpcName: vpcItem.name,
        resourceType: V2StackComponentsList.NETWORK_LOAD_BALANCER,
        resourceName: networkLoadBalancer.name,
      });
    }
  }
}

/**
 * Function to get V2 Network Load balancer Role resources
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param homeRegion string
 * @param env {@link V2NetworkResourceEnvironmentType}
 * @param acceleratorPrefix string
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2NetworkLoadBalancerRoleResources(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  homeRegion: string,
  env: V2NetworkResourceEnvironmentType,
  acceleratorPrefix: string,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
): void {
  if (
    env.region === homeRegion &&
    vpcItem.loadBalancers?.networkLoadBalancers &&
    vpcItem.loadBalancers?.networkLoadBalancers.length > 0 &&
    !lzaLookup.resourceExists({
      resourceType: LZAResourceLookupType.ROLE,
      lookupValues: { roleName: `${acceleratorPrefix}-GetNLBIPAddressLookup` },
    })
  ) {
    logger.info(
      `VPC ${vpcItem.name} network load balancer role is not present in the existing stack, resource will be deployed through V2 stacks`,
    );

    v2Components.push({
      vpcName: vpcItem.name,
      resourceType: V2StackComponentsList.NETWORK_LOAD_BALANCER_ROLE,
      resourceName: `${acceleratorPrefix}-GetNLBIPAddressLookup|${env.accountId}`,
    });
  }
}

/**
 * Function to get V2 NACL resources
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param accountsConfig {@link AccountsConfig}
 * @param networkConfig {@link NetworkConfig}
 * @param env {@link AcceleratorEnvironment}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2NetworkAclResources(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  accountsConfig: AccountsConfig,
  networkConfig: NetworkConfig,
  env: V2NetworkResourceEnvironmentType,
  v2Components: V2NetworkResourceListType[],
) {
  for (const naclItem of vpcItem.networkAcls ?? []) {
    if (
      !lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.NETWORK_ACL,
        lookupValues: { vpcName: vpcItem.name, naclName: naclItem.name },
      })
    ) {
      logger.info(
        `VPC ${vpcItem.name} network acl ${naclItem.name} is not present in the existing stack, resource will be deployed through V2 stacks`,
      );
      v2Components.push({
        vpcName: vpcItem.name,
        resourceType: V2StackComponentsList.NETWORK_ACL,
        resourceName: naclItem.name,
      });
    }

    getV2NetworkAclSubnetAssociationResources(naclItem, vpcItem, lzaLookup, v2Components);

    getV2NetworkAclEntryResources(naclItem, vpcItem, lzaLookup, accountsConfig, networkConfig, env, v2Components);
  }
}

/**
 * Function to get V2 NACL Subnet Association resources
 * @param naclItem {@link NetworkAclConfig}
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2NetworkAclSubnetAssociationResources(
  naclItem: NetworkAclConfig,
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
) {
  for (const subnetName of naclItem.subnetAssociations) {
    if (
      !lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.SUBNET_NETWORK_ACL_ASSOCIATION,
        lookupValues: { vpcName: vpcItem.name, naclName: naclItem.name, subnetName },
      })
    ) {
      logger.info(
        `VPC ${vpcItem.name} network acl ${naclItem.name} subnet association ${subnetName} is not present in the existing stack, resource will be deployed through V2 stacks`,
      );
      v2Components.push({
        vpcName: vpcItem.name,
        resourceType: V2StackComponentsList.NETWORK_ACL_SUBNET_ASSOCIATION,
        resourceName: `${naclItem.name}|${vpcItem.name}|${subnetName}`,
      });
    }
  }
}

/**
 * Function to get V2 NACL Entry resources
 * @param networkAclItem {@link NetworkAclConfig}
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param accountsConfig {@link AccountsConfig}
 * @param networkConfig {@link NetworkConfig}
 * @param env {@link AcceleratorEnvironment}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2NetworkAclEntryResources(
  networkAclItem: NetworkAclConfig,
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  accountsConfig: AccountsConfig,
  networkConfig: NetworkConfig,
  env: V2NetworkResourceEnvironmentType,
  v2Components: V2NetworkResourceListType[],
) {
  for (const inboundRuleItem of networkAclItem.inboundRules ?? []) {
    if (
      !iNetworkAclSourceCrossAccount(inboundRuleItem.source, accountsConfig, networkConfig, env) &&
      !lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.NETWORK_ACL_ENTRY,
        lookupValues: {
          vpcName: vpcItem.name,
          naclName: networkAclItem.name,
          ruleNumber: inboundRuleItem.rule,
          type: 'ingress',
        },
      })
    ) {
      logger.info(
        `VPC ${vpcItem.name} network acl ${networkAclItem.name} inbound rule ${inboundRuleItem.rule} is not present in the existing stack, resource will be deployed through V2 stacks`,
      );
      v2Components.push({
        vpcName: vpcItem.name,
        resourceType: V2StackComponentsList.NETWORK_ACL_INBOUND_ENTRY,
        resourceName: `${networkAclItem.name}|${vpcItem.name}|${inboundRuleItem.rule}|ingressRule`,
      });
    }
  }

  for (const outboundRuleItem of networkAclItem.outboundRules ?? []) {
    if (
      !iNetworkAclSourceCrossAccount(outboundRuleItem.destination, accountsConfig, networkConfig, env) &&
      !lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.NETWORK_ACL_ENTRY,
        lookupValues: {
          vpcName: vpcItem.name,
          naclName: networkAclItem.name,
          ruleNumber: outboundRuleItem.rule,
          type: 'egress',
        },
      })
    ) {
      logger.info(
        `VPC ${vpcItem.name} network acl ${networkAclItem.name} outbound rule ${outboundRuleItem.rule} is not present in the existing stack, resource will be deployed through V2 stacks`,
      );
      v2Components.push({
        vpcName: vpcItem.name,
        resourceType: V2StackComponentsList.NETWORK_ACL_OUTBOUND_ENTRY,
        resourceName: `${networkAclItem.name}|${vpcItem.name}|${outboundRuleItem.rule}|egressRule`,
      });
    }
  }
}

/**
 * Function to check Network ACL entry source or destination has cross account reference
 * @param networkAclSubnetSelectionItem {@link NetworkAclSubnetSelection}
 * @param accountsConfig {@link AccountsConfig}
 * @param networkConfig {@link NetworkConfig}
 * @param env {@link AcceleratorEnvironment}
 * @returns
 */
function iNetworkAclSourceCrossAccount(
  networkAclSubnetSelectionItem: string | NetworkAclSubnetSelection,
  accountsConfig: AccountsConfig,
  networkConfig: NetworkConfig,
  env: V2NetworkResourceEnvironmentType,
): boolean {
  if (typeof networkAclSubnetSelectionItem === 'string') {
    return false;
  }

  const naclAccount = networkAclSubnetSelectionItem.account
    ? accountsConfig.getAccountId(networkAclSubnetSelectionItem.account)
    : env.accountId;
  const naclRegion = networkAclSubnetSelectionItem.region;

  const crossAccountCondition = naclRegion
    ? env.accountId !== naclAccount || env.region !== naclRegion
    : env.accountId !== naclAccount;

  if (crossAccountCondition) {
    const targetVpcConfig = networkConfig.vpcs.find(vpcItem => vpcItem.name === networkAclSubnetSelectionItem.vpc);

    if (!targetVpcConfig) {
      logger.error(`Specified VPC ${networkAclSubnetSelectionItem.vpc} not defined in network config.`);
      throw new Error(
        `Configuration validation failed at runtime. Specified VPC ${networkAclSubnetSelectionItem.vpc} not defined in network config`,
      );
    }

    const subnetItem = targetVpcConfig.subnets?.find(item => item.name === networkAclSubnetSelectionItem.subnet);
    if (!subnetItem) {
      logger.error(
        `Specified subnet ${networkAclSubnetSelectionItem.subnet} not defined for vpc ${targetVpcConfig.name} in network config.`,
      );
      throw new Error(
        `Configuration validation failed at runtime. Specified subnet ${networkAclSubnetSelectionItem.subnet} not defined for vpc ${targetVpcConfig.name} in network config.`,
      );
    }

    if (subnetItem.ipamAllocation) {
      return true;
    } else {
      return false;
    }
  } else {
    return false;
  }
}

/**
 * Function to create and get V2 Network VPC stacks
 * @param options
 * @returns
 */
export function createAndGetV2NetworkVpcDependencyStacks(options: {
  v2Stacks: cdk.Stack[];
  dependencyStack: cdk.Stack;
  app: cdk.App;
  props: AcceleratorStackProps;
  env: cdk.Environment;
  partition: string;
  accountId: string;
  enabledRegion: string;
  version: string;
  synthesizer?: cdk.IStackSynthesizer;
}): cdk.Stack[] {
  const v2NetworkVpcDependencyStacks: cdk.Stack[] = [];

  const vpcsInScope = getVpcsInScope(options.props.networkConfig, options.props.accountsConfig, {
    accountId: options.accountId,
    region: options.enabledRegion,
  });

  const v2NetworkResources = getV2NetworkResources(
    vpcsInScope,
    options.props.globalConfig,
    options.props.accountsConfig,
    options.props.networkConfig,
    options.props.prefixes.accelerator,
    {
      accountId: options.accountId,
      region: options.enabledRegion,
      stackName: options.dependencyStack.stackName,
    },
  );

  if (v2NetworkResources.length > 0 && vpcsInScope.length === 0) {
    logger.info(
      `No VPCs found in scope for account ${options.accountId} and region ${options.enabledRegion}, but v2 network resources are present in the environment.`,
    );
    throw new Error(
      `Configuration validation failed at runtime. No VPCs found in scope for account ${options.accountId} and region ${options.enabledRegion}, but v2 network resources are present the environment`,
    );
  }

  for (const vpcItem of vpcsInScope) {
    // Sanitize VPC name by replacing invalid characters for valid StackName
    const sanitizedVpcName = vpcItem.name.replace(/[^A-Za-z0-9-]/g, '-');
    const parentStackForVpcStack: cdk.Stack = options.dependencyStack;
    const vpcStack = createVpcStack({
      sanitizedVpcName,
      v2NetworkResources,
      v2Stacks: options.v2Stacks,
      dependencyStack: parentStackForVpcStack,
      app: options.app,
      vpcItem,
      props: options.props,
      env: options.env,
      partition: options.partition,
      accountId: options.accountId,
      enabledRegion: options.enabledRegion,
      version: options.version,
      synthesizer: options.synthesizer,
    });

    const vpcRouteTablesStack = createVpcRouteTablesStack({
      sanitizedVpcName,
      v2NetworkResources,
      v2Stacks: options.v2Stacks,
      dependencyStack: vpcStack,
      app: options.app,
      vpcItem,
      props: options.props,
      env: options.env,
      partition: options.partition,
      accountId: options.accountId,
      enabledRegion: options.enabledRegion,
      version: options.version,
      synthesizer: options.synthesizer,
    });

    const vpcSecurityGroupsStack = createVpcSecurityGroupsStack({
      sanitizedVpcName,
      v2NetworkResources,
      v2Stacks: options.v2Stacks,
      dependencyStack: vpcRouteTablesStack,
      app: options.app,
      vpcItem,
      props: options.props,
      env: options.env,
      partition: options.partition,
      accountId: options.accountId,
      enabledRegion: options.enabledRegion,
      version: options.version,
      synthesizer: options.synthesizer,
    });

    const parentStacksForSubnetsStack: cdk.Stack[] = [vpcRouteTablesStack, vpcSecurityGroupsStack];

    const vpcSubnetsStack = createVpcSubnetsStack({
      sanitizedVpcName,
      v2NetworkResources,
      v2Stacks: options.v2Stacks,
      dependencyStacks: parentStacksForSubnetsStack,
      app: options.app,
      vpcItem,
      props: options.props,
      env: options.env,
      partition: options.partition,
      accountId: options.accountId,
      enabledRegion: options.enabledRegion,
      version: options.version,
      synthesizer: options.synthesizer,
    });

    const vpcSubnetsShareStack = createVpcSubnetsShareStack({
      sanitizedVpcName,
      v2NetworkResources,
      v2Stacks: options.v2Stacks,
      dependencyStack: vpcSubnetsStack,
      app: options.app,
      vpcItem,
      props: options.props,
      env: options.env,
      partition: options.partition,
      accountId: options.accountId,
      enabledRegion: options.enabledRegion,
      version: options.version,
      synthesizer: options.synthesizer,
    });

    const vpcNaclsStack = createVpcNaclsStack({
      sanitizedVpcName,
      v2NetworkResources,
      v2Stacks: options.v2Stacks,
      dependencyStack: vpcSubnetsShareStack,
      app: options.app,
      vpcItem,
      props: options.props,
      env: options.env,
      partition: options.partition,
      accountId: options.accountId,
      enabledRegion: options.enabledRegion,
      version: options.version,
      synthesizer: options.synthesizer,
    });

    const vpcLoadBalancersStack = createVpcLoadBalancersStack({
      sanitizedVpcName,
      v2NetworkResources,
      v2Stacks: options.v2Stacks,
      dependencyStack: vpcNaclsStack,
      app: options.app,
      vpcItem,
      props: options.props,
      env: options.env,
      partition: options.partition,
      accountId: options.accountId,
      enabledRegion: options.enabledRegion,
      version: options.version,
      synthesizer: options.synthesizer,
    });

    v2NetworkVpcDependencyStacks.push(vpcLoadBalancersStack);
  }

  return v2NetworkVpcDependencyStacks;
}

/**
 * Function to create V2 Network VPC stack
 * @param options
 * @returns
 */
function createVpcStack(options: {
  sanitizedVpcName: string;
  v2NetworkResources: V2NetworkResourceListType[];
  v2Stacks: cdk.Stack[];
  dependencyStack: cdk.Stack;
  app: cdk.App;
  vpcItem: VpcConfig | VpcTemplatesConfig;
  props: AcceleratorStackProps;
  env: cdk.Environment;
  partition: string;
  accountId: string;
  enabledRegion: string;
  version: string;
  synthesizer?: cdk.IStackSynthesizer;
}): cdk.Stack {
  logger.info(`Creating VPC Stack for VPC ${options.vpcItem.name} in ${options.enabledRegion}`);
  const stack: cdk.Stack = new VpcBaseStack(
    options.app,
    `${AcceleratorStackNames[AcceleratorV2Stacks.VPC_STACK]}-${options.sanitizedVpcName}-${options.accountId}-${
      options.enabledRegion
    }`,
    {
      env: options.env,
      description: `(SO0199-vpc) Landing Zone Accelerator on AWS. Version ${options.version}.`,

      synthesizer: options.synthesizer,
      terminationProtection: options.props.globalConfig.terminationProtection ?? true,
      ...options.props,
      vpcConfig: options.vpcItem,
      vpcStack: true,
      v2NetworkResources: options.v2NetworkResources,
    },
  );

  stack.addDependency(options.dependencyStack);

  options.v2Stacks.push(stack);

  return stack;
}

/**
 * Function to get V2 VPC Route Tables stack
 * @param options
 * @returns
 */
function createVpcRouteTablesStack(options: {
  sanitizedVpcName: string;
  v2NetworkResources: V2NetworkResourceListType[];
  v2Stacks: cdk.Stack[];
  dependencyStack: cdk.Stack;
  app: cdk.App;
  vpcItem: VpcConfig | VpcTemplatesConfig;
  props: AcceleratorStackProps;
  env: cdk.Environment;
  partition: string;
  accountId: string;
  enabledRegion: string;
  version: string;
  synthesizer?: cdk.IStackSynthesizer;
}): cdk.Stack {
  logger.info(`Creating VPC Route Table Stack for VPC ${options.vpcItem.name} in ${options.enabledRegion}`);
  const stack: cdk.Stack = new VpcRouteTablesBaseStack(
    options.app,
    `${AcceleratorStackNames[AcceleratorV2Stacks.ROUTE_TABLES_STACK]}-${options.sanitizedVpcName}-${
      options.accountId
    }-${options.enabledRegion}`,
    {
      env: options.env,
      description: `(SO0199-vpc-route-tables) Landing Zone Accelerator on AWS. Version ${options.version}.`,

      synthesizer: options.synthesizer,
      terminationProtection: options.props.globalConfig.terminationProtection ?? true,
      ...options.props,
      vpcConfig: options.vpcItem,
      vpcStack: false,
      v2NetworkResources: options.v2NetworkResources,
    },
  );

  stack.addDependency(options.dependencyStack);

  options.v2Stacks.push(stack);

  return stack;
}

/**
 * Function to get V2 VPC SecurityGroups stack
 * @param options
 * @returns
 */
function createVpcSecurityGroupsStack(options: {
  sanitizedVpcName: string;
  v2NetworkResources: V2NetworkResourceListType[];
  v2Stacks: cdk.Stack[];
  dependencyStack: cdk.Stack;
  app: cdk.App;
  vpcItem: VpcConfig | VpcTemplatesConfig;
  props: AcceleratorStackProps;
  env: cdk.Environment;
  partition: string;
  accountId: string;
  enabledRegion: string;
  version: string;
  synthesizer?: cdk.IStackSynthesizer;
}): cdk.Stack {
  logger.info(`Creating VPC SecurityGroups Stack for VPC ${options.vpcItem.name} in ${options.enabledRegion}`);
  const stack: cdk.Stack = new VpcSecurityGroupsBaseStack(
    options.app,
    `${AcceleratorStackNames[AcceleratorV2Stacks.SECURITY_GROUPS_STACK]}-${options.sanitizedVpcName}-${
      options.accountId
    }-${options.enabledRegion}`,
    {
      env: options.env,
      description: `(SO0199-vpc-security-groups) Landing Zone Accelerator on AWS. Version ${options.version}.`,
      synthesizer: options.synthesizer,
      terminationProtection: options.props.globalConfig.terminationProtection ?? true,
      ...options.props,
      vpcConfig: options.vpcItem,
      vpcStack: false,
      v2NetworkResources: options.v2NetworkResources,
    },
  );

  stack.addDependency(options.dependencyStack);

  options.v2Stacks.push(stack);

  return stack;
}

/**
 * Function to get V2 VPC Subnets stack
 * @param options
 * @returns
 */
function createVpcSubnetsStack(options: {
  sanitizedVpcName: string;
  v2NetworkResources: V2NetworkResourceListType[];
  v2Stacks: cdk.Stack[];
  dependencyStacks: cdk.Stack[];
  app: cdk.App;
  vpcItem: VpcConfig | VpcTemplatesConfig;
  props: AcceleratorStackProps;
  env: cdk.Environment;
  partition: string;
  accountId: string;
  enabledRegion: string;
  version: string;
  synthesizer?: cdk.IStackSynthesizer;
}): cdk.Stack {
  logger.info(`Creating VPC Subnets Stack for VPC ${options.vpcItem.name} in ${options.enabledRegion}`);
  const stack: cdk.Stack = new VpcSubnetsBaseStack(
    options.app,
    `${AcceleratorStackNames[AcceleratorV2Stacks.SUBNETS_STACK]}-${options.sanitizedVpcName}-${options.accountId}-${
      options.enabledRegion
    }`,
    {
      env: options.env,
      description: `(SO0199-vpc-subnets) Landing Zone Accelerator on AWS. Version ${options.version}.`,
      synthesizer: options.synthesizer,
      terminationProtection: options.props.globalConfig.terminationProtection ?? true,
      ...options.props,
      vpcConfig: options.vpcItem,
      vpcStack: false,
      v2NetworkResources: options.v2NetworkResources,
    },
  );

  for (const dependencyStack of options.dependencyStacks) {
    stack.addDependency(dependencyStack);
  }

  options.v2Stacks.push(stack);

  return stack;
}

/**
 * Function to get V2 VPC Share Subnets stack
 * @param options
 * @returns
 */
function createVpcSubnetsShareStack(options: {
  sanitizedVpcName: string;
  v2NetworkResources: V2NetworkResourceListType[];
  v2Stacks: cdk.Stack[];
  dependencyStack: cdk.Stack;
  app: cdk.App;
  vpcItem: VpcConfig | VpcTemplatesConfig;
  props: AcceleratorStackProps;
  env: cdk.Environment;
  partition: string;
  accountId: string;
  enabledRegion: string;
  version: string;
  synthesizer?: cdk.IStackSynthesizer;
}): cdk.Stack {
  logger.info(`Creating VPC Subnets Stack for VPC ${options.vpcItem.name} in ${options.enabledRegion}`);
  const stack: cdk.Stack = new VpcSubnetsShareBaseStack(
    options.app,
    `${AcceleratorStackNames[AcceleratorV2Stacks.SUBNETS_SHARE_STACK]}-${options.sanitizedVpcName}-${
      options.accountId
    }-${options.enabledRegion}`,
    {
      env: options.env,
      description: `(SO0199-vpc-subnets-share) Landing Zone Accelerator on AWS. Version ${options.version}.`,
      synthesizer: options.synthesizer,
      terminationProtection: options.props.globalConfig.terminationProtection ?? true,
      ...options.props,
      vpcConfig: options.vpcItem,
      vpcStack: false,
      v2NetworkResources: options.v2NetworkResources,
    },
  );

  stack.addDependency(options.dependencyStack);

  options.v2Stacks.push(stack);

  return stack;
}

/**
 * Function to get V2 VPC NACLs stack
 * @param options
 * @returns
 */
function createVpcNaclsStack(options: {
  sanitizedVpcName: string;
  v2NetworkResources: V2NetworkResourceListType[];
  v2Stacks: cdk.Stack[];
  dependencyStack: cdk.Stack;
  app: cdk.App;
  vpcItem: VpcConfig | VpcTemplatesConfig;
  props: AcceleratorStackProps;
  env: cdk.Environment;
  partition: string;
  accountId: string;
  enabledRegion: string;
  version: string;
  synthesizer?: cdk.IStackSynthesizer;
}): cdk.Stack {
  logger.info(`Creating VPC NACLs Stack for VPC ${options.vpcItem.name} in ${options.enabledRegion}`);
  const stack: cdk.Stack = new VpcNaclsBaseStack(
    options.app,
    `${AcceleratorStackNames[AcceleratorV2Stacks.NACLS_STACK]}-${options.sanitizedVpcName}-${options.accountId}-${
      options.enabledRegion
    }`,
    {
      env: options.env,
      description: `(SO0199-vpc-nacls) Landing Zone Accelerator on AWS. Version ${options.version}.`,
      synthesizer: options.synthesizer,
      terminationProtection: options.props.globalConfig.terminationProtection ?? true,
      ...options.props,
      vpcConfig: options.vpcItem,
      vpcStack: false,
      v2NetworkResources: options.v2NetworkResources,
    },
  );

  stack.addDependency(options.dependencyStack);

  options.v2Stacks.push(stack);

  return stack;
}

/**
 * Function to get V2 VPC LoadBalancers stack
 * @param options
 * @returns
 */
function createVpcLoadBalancersStack(options: {
  sanitizedVpcName: string;
  v2NetworkResources: V2NetworkResourceListType[];
  v2Stacks: cdk.Stack[];
  dependencyStack: cdk.Stack;
  app: cdk.App;
  vpcItem: VpcConfig | VpcTemplatesConfig;
  props: AcceleratorStackProps;
  env: cdk.Environment;
  partition: string;
  accountId: string;
  enabledRegion: string;
  version: string;
  synthesizer?: cdk.IStackSynthesizer;
}): cdk.Stack {
  logger.info(`Creating VPC LoadBalancers Stack for VPC ${options.vpcItem.name} in ${options.enabledRegion}`);
  const stack: cdk.Stack = new VpcLoadBalancersBaseStack(
    options.app,
    `${AcceleratorStackNames[AcceleratorV2Stacks.LBS_STACK]}-${options.sanitizedVpcName}-${options.accountId}-${
      options.enabledRegion
    }`,
    {
      env: options.env,
      description: `(SO0199-vpc-load-balancers) Landing Zone Accelerator on AWS. Version ${options.version}.`,
      synthesizer: options.synthesizer,
      terminationProtection: options.props.globalConfig.terminationProtection ?? true,
      ...options.props,
      vpcConfig: options.vpcItem,
      vpcStack: false,
      v2NetworkResources: options.v2NetworkResources,
    },
  );

  stack.addDependency(options.dependencyStack);

  options.v2Stacks.push(stack);

  return stack;
}

/**
 * Function to check if the resource is V2 eligible
 * @param v2NetworkResources {@link V2NetworkResourceListType}[]
 * @param vpcName
 * @param resourceType
 * @param resourceName
 * @returns
 */
export function isV2Resource(
  v2NetworkResources: V2NetworkResourceListType[],
  vpcName: string,
  resourceType: string,
  resourceName?: string,
): V2NetworkResourceListType | undefined {
  return v2NetworkResources.find(
    item => item.vpcName === vpcName && item.resourceType === resourceType && item.resourceName === resourceName,
  );
}

/**
 * Function to get VPC accounts Ids
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param accountsConfig {@link AccountsConfig}
 * @returns
 */
function getVpcAccountIds(vpcItem: VpcConfig | VpcTemplatesConfig, accountsConfig: AccountsConfig): string[] {
  if (isNetworkType<VpcConfig>('IVpcConfig', vpcItem)) {
    return [accountsConfig.getAccountId(vpcItem.account)];
  } else {
    return accountsConfig.getAccountIdsFromDeploymentTarget(vpcItem.deploymentTargets);
  }
}

/**
 * Function to get TGW owning account IDs
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param accountsConfig {@link AccountsConfig}
 * @param env {@link V2NetworkResourceEnvironmentType}
 * @returns
 */
function getTgwOwningAccountIds(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  accountsConfig: AccountsConfig,
  env: V2NetworkResourceEnvironmentType,
): string[] {
  const transitGatewayAccountIds: string[] = [];

  for (const attachment of vpcItem.transitGatewayAttachments ?? []) {
    const owningAccountId = accountsConfig.getAccountId(attachment.transitGateway.account);

    if (owningAccountId !== env.accountId && !transitGatewayAccountIds.includes(owningAccountId)) {
      transitGatewayAccountIds.push(owningAccountId);
    }
  }

  return transitGatewayAccountIds;
}
