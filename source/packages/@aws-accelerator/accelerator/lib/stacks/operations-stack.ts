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
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';
import * as path from 'path';

import { Logger } from '../logger';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';
import { BudgetDefinition } from '@aws-accelerator/constructs';

export interface OperationsStackProps extends AcceleratorStackProps {
  configDirPath: string;
}

export class OperationsStack extends AcceleratorStack {
  constructor(scope: Construct, id: string, props: OperationsStackProps) {
    super(scope, id, props);

    //
    // Only deploy IAM resources into the home region
    //
    if (props.globalConfig.homeRegion === cdk.Stack.of(this).region) {
      //
      // Add Providers
      //
      const providers: { [name: string]: cdk.aws_iam.SamlProvider } = {};
      for (const providerItem of props.iamConfig.providers ?? []) {
        Logger.info(`[operations-stack] Add Provider ${providerItem.name}`);
        providers[providerItem.name] = new cdk.aws_iam.SamlProvider(
          this,
          `${pascalCase(providerItem.name)}SamlProvider`,
          {
            name: providerItem.name,
            metadataDocument: cdk.aws_iam.SamlMetadataDocument.fromFile(
              path.join(props.configDirPath, providerItem.metadataDocument),
            ),
          },
        );
      }

      //
      // Enable Budget Reports
      //
      if (props.globalConfig.reports?.budgets) {
        for (const budgets of props.globalConfig.reports.budgets ?? []) {
          if (this.isIncluded(budgets.deploymentTargets ?? [])) {
            new BudgetDefinition(this, `${budgets.name}BudgetDefinition`, {
              budgets: props.globalConfig.reports?.budgets,
            });
          }
        }
      }

      //
      // Add Managed Policies
      //
      const policies: { [name: string]: cdk.aws_iam.ManagedPolicy } = {};
      for (const policySetItem of props.iamConfig.policySets ?? []) {
        if (!this.isIncluded(policySetItem.deploymentTargets)) {
          Logger.info(`[operations-stack] Item excluded`);
          continue;
        }

        for (const policyItem of policySetItem.policies) {
          Logger.info(`[operations-stack] Add customer managed policy ${policyItem.name}`);

          // Read in the policy document which should be properly formatted json
          const policyDocument = require(path.join(props.configDirPath, policyItem.policy));

          // Create a statements list using the PolicyStatement factory
          const statements: cdk.aws_iam.PolicyStatement[] = [];
          for (const statement of policyDocument.Statement) {
            statements.push(cdk.aws_iam.PolicyStatement.fromJson(statement));
          }

          // Construct the ManagedPolicy
          policies[policyItem.name] = new cdk.aws_iam.ManagedPolicy(this, pascalCase(policyItem.name), {
            managedPolicyName: policyItem.name,
            statements,
          });

          // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission
          // rule suppression with evidence for this permission.
          NagSuppressions.addResourceSuppressionsByPath(
            this,
            `${this.stackName}/${pascalCase(policyItem.name)}/Resource`,
            [
              {
                id: 'AwsSolutions-IAM5',
                reason: 'Policies definition are derived from accelerator iam-config boundary-policy file',
              },
            ],
          );
        }
      }

      //
      // Add Roles
      //
      const roles: { [name: string]: cdk.aws_iam.Role } = {};
      for (const roleSetItem of props.iamConfig.roleSets ?? []) {
        if (!this.isIncluded(roleSetItem.deploymentTargets)) {
          Logger.info(`[operations-stack] Item excluded`);
          continue;
        }

        for (const roleItem of roleSetItem.roles) {
          Logger.info(`[operations-stack] Add role ${roleItem.name}`);

          const principals: cdk.aws_iam.PrincipalBase[] = [];

          for (const assumedByItem of roleItem.assumedBy ?? []) {
            Logger.info(
              `[operations-stack] Role - assumed by type(${assumedByItem.type}) principal(${assumedByItem.principal})`,
            );

            if (assumedByItem.type === 'service') {
              principals.push(new cdk.aws_iam.ServicePrincipal(assumedByItem.principal));
            }

            if (assumedByItem.type === 'account') {
              principals.push(new cdk.aws_iam.AccountPrincipal(assumedByItem.principal));
            }

            if (assumedByItem.type === 'provider') {
              principals.push(new cdk.aws_iam.SamlConsolePrincipal(providers[assumedByItem.principal]));
            }
          }

          const managedPolicies: cdk.aws_iam.IManagedPolicy[] = [];
          for (const policyItem of roleItem.policies?.awsManaged ?? []) {
            Logger.info(`[operations-stack] Role - aws managed policy ${policyItem}`);
            managedPolicies.push(cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(policyItem));
          }
          for (const policyItem of roleItem.policies?.customerManaged ?? []) {
            Logger.info(`[operations-stack] Role - customer managed policy ${policyItem}`);
            managedPolicies.push(policies[policyItem]);
          }

          let assumedBy: cdk.aws_iam.IPrincipal;
          if (roleItem.assumedBy.find(item => item.type === 'provider')) {
            // Since a SamlConsolePrincipal creates conditions, we can not
            // use the CompositePrincipal. Verify that it is alone
            if (principals.length > 1) {
              throw new Error('More than one principal found when adding provider');
            }
            assumedBy = principals[0];
          } else {
            assumedBy = new cdk.aws_iam.CompositePrincipal(...principals);
          }

          const role = new cdk.aws_iam.Role(this, pascalCase(roleItem.name), {
            roleName: roleItem.name,
            assumedBy,
            managedPolicies,
            permissionsBoundary: policies[roleItem.boundaryPolicy],
          });

          // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
          // rule suppression with evidence for this permission.
          NagSuppressions.addResourceSuppressionsByPath(
            this,
            `${this.stackName}/${pascalCase(roleItem.name)}/Resource`,
            [
              {
                id: 'AwsSolutions-IAM4',
                reason: 'IAM Role created as per accelerator iam-config needs AWS managed policy',
              },
            ],
          );

          // Create instance profile
          if (roleItem.instanceProfile) {
            Logger.info(`[operations-stack] Role - creating instance profile for ${roleItem.name}`);
            new cdk.aws_iam.CfnInstanceProfile(this, `${pascalCase(roleItem.name)}InstanceProfile`, {
              // Use role object to force use of Ref
              instanceProfileName: role.roleName,
              roles: [role.roleName],
            });
          }

          // Add to roles list
          roles[roleItem.name] = role;
        }
      }

      //
      // Add Groups
      //
      const groups: { [name: string]: cdk.aws_iam.Group } = {};
      for (const groupSetItem of props.iamConfig.groupSets ?? []) {
        if (!this.isIncluded(groupSetItem.deploymentTargets)) {
          Logger.info(`[operations-stack] Item excluded`);
          continue;
        }

        for (const groupItem of groupSetItem.groups) {
          Logger.info(`[operations-stack] Add group ${groupItem.name}`);

          const managedPolicies: cdk.aws_iam.IManagedPolicy[] = [];
          for (const policyItem of groupItem.policies?.awsManaged ?? []) {
            Logger.info(`[operations-stack] Group - aws managed policy ${policyItem}`);
            managedPolicies.push(cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(policyItem));
          }
          for (const policyItem of groupItem.policies?.customerManaged ?? []) {
            Logger.info(`[operations-stack] Group - customer managed policy ${policyItem}`);
            managedPolicies.push(policies[policyItem]);
          }

          groups[groupItem.name] = new cdk.aws_iam.Group(this, pascalCase(groupItem.name), {
            groupName: groupItem.name,
            managedPolicies,
          });

          // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
          // rule suppression with evidence for this permission.
          NagSuppressions.addResourceSuppressionsByPath(
            this,
            `${this.stackName}/${pascalCase(groupItem.name)}/Resource`,
            [
              {
                id: 'AwsSolutions-IAM4',
                reason: 'Groups created as per accelerator iam-config needs AWS managed policy',
              },
            ],
          );
        }
      }

      //
      // Add IAM Users
      //
      for (const userSet of props.iamConfig.userSets ?? []) {
        if (!this.isIncluded(userSet.deploymentTargets)) {
          Logger.info(`[operations-stack] Item excluded`);
          continue;
        }

        for (const user of userSet.users ?? []) {
          Logger.info(`[operations-stack] Add user ${user.username}`);

          const secret = new cdk.aws_secretsmanager.Secret(this, pascalCase(`${user.username}Secret`), {
            generateSecretString: {
              secretStringTemplate: JSON.stringify({ username: user.username }),
              generateStringKey: 'password',
            },
            secretName: `/accelerator/${user.username}`,
          });

          // AwsSolutions-SMG4: The secret does not have automatic rotation scheduled.
          // rule suppression with evidence for this permission.
          NagSuppressions.addResourceSuppressionsByPath(
            this,
            `${this.stackName}/${pascalCase(user.username)}Secret/Resource`,
            [
              {
                id: 'AwsSolutions-SMG4',
                reason: 'Accelerator users created as per iam-config file, MFA usage is enforced with boundary policy',
              },
            ],
          );

          Logger.info(`[operations-stack] User - password stored to /accelerator/${user.username}`);

          new cdk.aws_iam.User(this, pascalCase(user.username), {
            userName: user.username,
            password: secret.secretValueFromJson('password'),
            groups: [groups[user.group]],
            permissionsBoundary: policies[user.boundaryPolicy],
            passwordResetRequired: true,
          });
        }
      }
    }
    Logger.info('[operations-stack] Completed stack synthesis');
  }
}
