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

import { IIpamSubnet, IpamSubnet, SecurityGroup } from '@aws-accelerator/constructs';
import { SsmResourceType } from '@aws-accelerator/utils';
import * as cdk from 'aws-cdk-lib';
import { pascalCase } from 'pascal-case';
import { AcceleratorStackProps } from '../../accelerator-stack';
import { LogLevel } from '../network-stack';
import { setIpamSubnetSourceArray } from '../utils/security-group-utils';
import { NetworkAssociationsStack } from './network-associations-stack';

export class SharedResources {
  public readonly sharedSecurityGroupMap: Map<string, SecurityGroup>;

  private stack: NetworkAssociationsStack;

  constructor(
    networkAssociationsStack: NetworkAssociationsStack,
    vpcMap: Map<string, string>,
    prefixListMap: Map<string, string>,
    props: AcceleratorStackProps,
  ) {
    this.stack = networkAssociationsStack;

    // Retrieve and look up IPAM subnets
    const ipamSubnets = setIpamSubnetSourceArray(this.stack.vpcResources, this.stack.sharedVpcs);
    const ipamSubnetMap = this.lookupIpamSubnets(ipamSubnets, props);

    this.sharedSecurityGroupMap = this.stack.createSecurityGroups(
      this.stack.sharedVpcs,
      vpcMap,
      ipamSubnetMap,
      prefixListMap,
    );
  }

  /**
   * Lookup IPAM subnets for a given array of subnet keys
   * @param ipamSubnets
   * @param props
   * @returns
   */
  private lookupIpamSubnets(ipamSubnets: string[], props: AcceleratorStackProps): Map<string, IIpamSubnet> {
    const ipamSubnetMap = new Map<string, IIpamSubnet>();

    for (const subnetKey of ipamSubnets) {
      const stringSplit = subnetKey.split('_');
      const vpcName = stringSplit[0];
      const accountName = stringSplit[1];
      const subnetName = stringSplit[2];
      const mapKey = `${vpcName}_${subnetName}`;

      // Lookup IPAM subnet
      this.stack.addLogs(
        LogLevel.INFO,
        `Retrieve IPAM Subnet CIDR for account:[${accountName}] vpc:[${vpcName}] subnet:[${subnetName}] in region:[${
          cdk.Stack.of(this.stack).region
        }]`,
      );
      const accountId = props.accountsConfig.getAccountId(accountName);
      const subnet = IpamSubnet.fromLookup(this.stack, pascalCase(`${vpcName}${subnetName}IpamSubnetLookup`), {
        owningAccountId: accountId,
        ssmSubnetIdPath: this.stack.getSsmPath(SsmResourceType.SUBNET, [vpcName, subnetName]),
        region: cdk.Stack.of(this.stack).region,
        roleName: this.stack.acceleratorResourceNames.roles.ipamSubnetLookup,
        kmsKey: this.stack.cloudwatchKey,
        logRetentionInDays: this.stack.logRetention,
      });
      ipamSubnetMap.set(mapKey, subnet);
    }
    return ipamSubnetMap;
  }
}
