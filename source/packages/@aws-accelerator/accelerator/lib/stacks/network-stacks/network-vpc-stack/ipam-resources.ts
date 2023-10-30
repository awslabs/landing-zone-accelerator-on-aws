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

import { VpcConfig, VpcTemplatesConfig } from '@aws-accelerator/config';
import * as cdk from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import { NetworkVpcStack } from './network-vpc-stack';

export class IpamResources {
  private stack: NetworkVpcStack;
  public readonly role?: cdk.aws_iam.Role;

  constructor(networkVpcStack: NetworkVpcStack, homeRegion: string, orgId?: string) {
    this.stack = networkVpcStack;

    this.role = this.createGetIpamCidrRole(this.stack.vpcResources, homeRegion, orgId);
  }

  /**
   * Create cross-account role to allow custom resource to describe IPAM subnets
   * @param vpcResources
   * @param homeRegion
   * @param acceleratorPrefix
   * @param orgId
   * @returns
   */
  private createGetIpamCidrRole(vpcResources: (VpcConfig | VpcTemplatesConfig)[], homeRegion: string, orgId?: string) {
    const vpcAccountIds = [];
    for (const vpcItem of vpcResources) {
      vpcAccountIds.push(...this.stack.getVpcAccountIds(vpcItem));
    }
    const accountIds = [...new Set(vpcAccountIds)];
    if (cdk.Stack.of(this.stack).region === homeRegion && accountIds.includes(cdk.Stack.of(this.stack).account)) {
      const role = new cdk.aws_iam.Role(this.stack, `GetIpamCidrRole`, {
        roleName: this.stack.acceleratorResourceNames.roles.ipamSubnetLookup,
        assumedBy: this.stack.getOrgPrincipals(orgId),
        inlinePolicies: {
          default: new cdk.aws_iam.PolicyDocument({
            statements: [
              new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                actions: ['ec2:DescribeSubnets', 'ssm:GetParameter'],
                resources: ['*'],
              }),
            ],
          }),
        },
      });
      // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
      NagSuppressions.addResourceSuppressions(role, [
        { id: 'AwsSolutions-IAM5', reason: 'Allow read role to get CIDRs from dynamic IPAM resources.' },
      ]);

      return role;
    }
    return undefined;
  }
}
