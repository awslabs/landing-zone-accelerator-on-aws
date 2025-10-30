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
import { AcceleratorStackProps, NagSuppressionRuleIds } from '../../accelerator-stack';
import { NetworkPrepStack } from './network-prep-stack';

export class LoadBalancerResources {
  public readonly crossAccountNlbRole?: cdk.aws_iam.Role;
  private stack: NetworkPrepStack;

  constructor(networkPrepStack: NetworkPrepStack, props: AcceleratorStackProps) {
    // Set private properties
    this.stack = networkPrepStack;
    this.createNetworkLoadBalancerRole(props);
  }
  /**
   * Create network load balancer IP address retrieval role
   * @param props
   * @returns
   */
  private createNetworkLoadBalancerRole(props: AcceleratorStackProps): cdk.aws_iam.Role | undefined {
    const nlbAccountIds = this.getNlbAccountIds();
    if (
      cdk.Stack.of(this.stack).region === props.globalConfig.homeRegion &&
      nlbAccountIds.includes(cdk.Stack.of(this.stack).account)
    ) {
      const nlbIpAddressRole = new cdk.aws_iam.Role(this.stack, `NetworkLoadBalancerIPAddressLookup`, {
        roleName: `${props.prefixes.accelerator}-NetworkLoadBalancerIPAddressLookup`,
        assumedBy: new cdk.aws_iam.CompositePrincipal(
          ...nlbAccountIds.map(accountId => new cdk.aws_iam.AccountPrincipal(accountId)),
        ),
        inlinePolicies: {
          default: new cdk.aws_iam.PolicyDocument({
            statements: [
              new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                actions: ['ec2:DescribeNetworkInterfaces'],
                resources: ['*'],
              }),
            ],
          }),
        },
      });

      this.stack.addNagSuppression({
        id: NagSuppressionRuleIds.IAM5,
        details: [
          {
            path: nlbIpAddressRole.node.path,
            reason: 'Allows only specific role arns',
          },
        ],
      });
      return nlbIpAddressRole;
    }
    return undefined;
  }

  /**
   * Function to check if account has network load balancers and returns a list of account IDs to reference against
   * @returns
   */
  private getNlbAccountIds(): string[] {
    let nlbAccountIds: string[] = [];
    for (const vpcItem of this.stack.props.networkConfig.vpcs) {
      if (vpcItem.loadBalancers?.networkLoadBalancers && vpcItem.loadBalancers?.networkLoadBalancers?.length > 0) {
        nlbAccountIds.push(this.stack.props.accountsConfig.getAccountId(vpcItem.account));
      }
    }
    for (const vpcItem of this.stack.props.networkConfig.vpcTemplates ?? []) {
      if (vpcItem.loadBalancers?.networkLoadBalancers && vpcItem.loadBalancers?.networkLoadBalancers?.length > 0) {
        for (const accountItem of this.stack.props.accountsConfig.getAccountIdsFromDeploymentTarget(
          vpcItem.deploymentTargets,
        )) {
          nlbAccountIds.push(accountItem);
        }
      }
    }
    nlbAccountIds = [...new Set(nlbAccountIds)];
    return nlbAccountIds;
  }
}
