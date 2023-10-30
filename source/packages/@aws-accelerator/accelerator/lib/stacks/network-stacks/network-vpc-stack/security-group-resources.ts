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

import { PrefixList, SecurityGroup, Subnet, Vpc } from '@aws-accelerator/constructs';
import { NetworkVpcStack } from './network-vpc-stack';

export class SecurityGroupResources {
  public readonly securityGroupMap: Map<string, SecurityGroup>;
  private stack: NetworkVpcStack;

  constructor(
    networkVpcStack: NetworkVpcStack,
    vpcMap: Map<string, Vpc>,
    subnetMap: Map<string, Subnet>,
    prefixListMap: Map<string, PrefixList>,
  ) {
    this.stack = networkVpcStack;

    // Create security groups
    this.securityGroupMap = this.stack.createSecurityGroups(this.stack.vpcsInScope, vpcMap, subnetMap, prefixListMap);
  }
}
