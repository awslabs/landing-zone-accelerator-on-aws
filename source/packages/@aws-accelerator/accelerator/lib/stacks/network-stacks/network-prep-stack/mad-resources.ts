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

import * as cdk from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import { AcceleratorStackProps } from '../../accelerator-stack';
import { NetworkPrepStack } from './network-prep-stack';

export class MadResources {
  public readonly role?: cdk.aws_iam.Role;

  private stack: NetworkPrepStack;

  constructor(networkPrepStack: NetworkPrepStack, props: AcceleratorStackProps) {
    this.stack = networkPrepStack;
    this.role = this.createManagedActiveDirectoryShareAcceptRole(props);
  }

  /**
   * Function to create Managed active directory share accept role. This role is used to assume by MAD account to auto accept share request
   * This role is created only if account is a shared target for MAD.
   * This role gets created only in home region
   * @returns
   */
  private createManagedActiveDirectoryShareAcceptRole(props: AcceleratorStackProps): cdk.aws_iam.Role | undefined {
    for (const managedActiveDirectory of props.iamConfig.managedActiveDirectories ?? []) {
      const madAccountId = props.accountsConfig.getAccountId(managedActiveDirectory.account);
      const sharedAccountNames = props.iamConfig.getManageActiveDirectorySharedAccountNames(
        managedActiveDirectory.name,
        props.configDirPath,
      );

      const sharedAccountIds: string[] = [];
      for (const account of sharedAccountNames) {
        sharedAccountIds.push(props.accountsConfig.getAccountId(account));
      }

      // Create role in shared account home region only
      if (this.stack.isTargetStack(sharedAccountIds, [props.globalConfig.homeRegion])) {
        const role = new cdk.aws_iam.Role(this.stack, 'MadShareAcceptRole', {
          roleName: this.stack.acceleratorResourceNames.roles.madShareAccept,
          assumedBy: new cdk.aws_iam.PrincipalWithConditions(new cdk.aws_iam.AccountPrincipal(madAccountId), {
            ArnLike: {
              'aws:PrincipalARN': [
                `arn:${cdk.Stack.of(this.stack).partition}:iam::${madAccountId}:role/${props.prefixes.accelerator}-*`,
              ],
            },
          }),
          inlinePolicies: {
            default: new cdk.aws_iam.PolicyDocument({
              statements: [
                new cdk.aws_iam.PolicyStatement({
                  effect: cdk.aws_iam.Effect.ALLOW,
                  actions: ['ds:AcceptSharedDirectory'],
                  resources: ['*'],
                }),
              ],
            }),
          },
        });

        // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
        // rule suppression with evidence for this permission.
        NagSuppressions.addResourceSuppressionsByPath(
          this.stack,
          `${this.stack.stackName}/MadShareAcceptRole/Resource`,
          [
            {
              id: 'AwsSolutions-IAM5',
              reason: 'MAD share accept role needs access to directory for acceptance ',
            },
          ],
        );

        return role;
      }
    }
    return undefined;
  }
}
