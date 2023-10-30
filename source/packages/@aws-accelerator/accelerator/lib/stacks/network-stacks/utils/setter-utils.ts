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

import { RouteTableEntryConfig, VpcConfig, VpcTemplatesConfig } from '@aws-accelerator/config';
import { isIpv4Cidr } from './validation-utils';

/**
 * Returns an array containing the keys of IPAM subnets that need to be looked up
 * @param vpcResources
 */
export function setIpamSubnetRouteTableEntryArray(vpcResources: (VpcConfig | VpcTemplatesConfig)[]): string[] {
  const ipamSubnets: string[] = [];

  for (const vpcItem of vpcResources) {
    for (const routeTableItem of vpcItem.routeTables ?? []) {
      ipamSubnets.push(...parseIpamSubnetRouteTableEntries(routeTableItem.routes, vpcItem));
    }
  }
  return [...new Set(ipamSubnets)];
}

/**
 * Determines if a route entry is a dynamic reference
 * @param routes
 * @param vpcItem
 * @returns
 */
function parseIpamSubnetRouteTableEntries(
  routes: RouteTableEntryConfig[] | undefined,
  vpcItem: VpcConfig | VpcTemplatesConfig,
): string[] {
  const ipamSubnets: string[] = [];

  for (const route of routes ?? []) {
    if (route.destination && !isIpv4Cidr(route.destination)) {
      const key = `${vpcItem.name}_${route.destination}`;
      ipamSubnets.push(key);
    }
  }
  return ipamSubnets;
}
