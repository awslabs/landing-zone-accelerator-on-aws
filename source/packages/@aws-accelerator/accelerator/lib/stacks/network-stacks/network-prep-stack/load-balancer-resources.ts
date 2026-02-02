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
    const trustAccountIds = this.getAllNlbRoleTrustAccounts();
    if (
      cdk.Stack.of(this.stack).region === props.globalConfig.homeRegion &&
      trustAccountIds.includes(cdk.Stack.of(this.stack).account)
    ) {
      const nlbIpAddressRole = new cdk.aws_iam.Role(this.stack, `NetworkLoadBalancerIPAddressLookup`, {
        roleName: `${props.prefixes.accelerator}-NetworkLoadBalancerIPAddressLookup`,
        assumedBy: new cdk.aws_iam.CompositePrincipal(
          ...trustAccountIds.map(accountId => new cdk.aws_iam.AccountPrincipal(accountId)),
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
    // Add accounts that own NLBs
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

  /**
   * Function to get all account IDs that need to be in the role trust policy
   * This includes accounts that own NLBs and accounts that have target groups with cross-account NLB targets
   * @returns
   */
  private getAllNlbRoleTrustAccounts(): string[] {
    const accountIds = [...this.getNlbAccountIds(), ...this.getAccountsWithCrossAccountNlbTargets()];
    return [...new Set(accountIds)];
  }

  /**
   * Function to get accounts that have target groups with cross-account NLB targets
   * @returns
   */
  private getAccountsWithCrossAccountNlbTargets(): string[] {
    return [
      ...this.getAccountsFromVpcs(),
      ...this.getAccountsFromVpcTemplates(),
      ...this.getAccountsFromApplications(),
    ];
  }

  /**
   * Get accounts from VPCs with target groups that have NLB targets
   * @returns
   */
  private getAccountsFromVpcs(): string[] {
    return this.stack.props.networkConfig.vpcs
      .filter(vpc => this.hasNlbTargets(vpc.targetGroups))
      .map(vpc => this.stack.props.accountsConfig.getAccountId(vpc.account));
  }

  /**
   * Get accounts from VPC templates with target groups that have NLB targets
   * @returns
   */
  private getAccountsFromVpcTemplates(): string[] {
    const accountIds: string[] = [];
    for (const vpcItem of this.stack.props.networkConfig.vpcTemplates ?? []) {
      if (this.hasNlbTargets(vpcItem.targetGroups)) {
        accountIds.push(
          ...this.stack.props.accountsConfig.getAccountIdsFromDeploymentTarget(vpcItem.deploymentTargets),
        );
      }
    }
    return accountIds;
  }

  /**
   * Get accounts from applications with target groups that have NLB targets
   * @returns
   */
  private getAccountsFromApplications(): string[] {
    const accountIds: string[] = [];
    for (const appItem of this.stack.props.customizationsConfig.applications ?? []) {
      if (this.hasNlbTargets(appItem.targetGroups)) {
        accountIds.push(
          ...this.stack.props.accountsConfig.getAccountIdsFromDeploymentTarget(appItem.deploymentTargets),
        );
      }
    }
    return accountIds;
  }

  /**
   * Helper function to check if any target group in the list references an NLB
   * @param targetGroups
   * @returns
   */
  private hasNlbTargets(targetGroups?: Array<{ targets?: unknown[] }>): boolean {
    return (
      targetGroups?.some(tg => tg.targets?.some(t => typeof t === 'object' && t !== null && 'nlbName' in t)) ?? false
    );
  }
}
