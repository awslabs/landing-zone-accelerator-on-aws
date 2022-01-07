/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';
import * as path from 'path';
import { Logger } from '../logger';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';

export interface OperationsStackProps extends AcceleratorStackProps {
  configDirPath: string;
}

export class OperationsStack extends AcceleratorStack {
  constructor(scope: Construct, id: string, props: OperationsStackProps) {
    super(scope, id, props);

    //
    // Create an SSM Parameter to satisfy requirement to have a resources
    // definition in event no users, roles, policies, or groups are defined
    //
    new ssm.StringParameter(this, 'SsmParamStackId', {
      parameterName: `/accelerator/${cdk.Stack.of(this).stackName}/stack-id`,
      stringValue: cdk.Stack.of(this).stackId,
    });

    //
    // Only deploy IAM resources into the home region
    //
    if (props.globalConfig.homeRegion === cdk.Stack.of(this).region) {
      //
      // Add Providers
      //
      const providers: { [name: string]: iam.SamlProvider } = {};
      for (const provider of props.iamConfig.providers ?? []) {
        Logger.info(`[operations-stack] Add Provider ${provider.name}`);
        providers[provider.name] = new iam.SamlProvider(this, `${pascalCase(provider.name)}SamlProvider`, {
          name: provider.name,
          metadataDocument: iam.SamlMetadataDocument.fromFile(
            path.join(props.configDirPath, provider.metadataDocument),
          ),
        });
      }

      //
      // Add Managed Policies
      //
      const policies: { [name: string]: iam.ManagedPolicy } = {};
      for (const policySet of props.iamConfig.policySets ?? []) {
        if (!this.isIncluded(policySet.deploymentTargets)) {
          Logger.info(`[operations-stack] Item excluded`);
          continue;
        }

        for (const policy of policySet.policies) {
          Logger.info(`[operations-stack] Add customer managed policy ${policy.name}`);

          // Read in the policy document which should be properly formatted json
          const policyDocument = require(path.join(props.configDirPath, policy.policy));

          // Create a statements list using the PolicyStatement factory
          const statements: iam.PolicyStatement[] = [];
          for (const statement of policyDocument.Statement) {
            statements.push(iam.PolicyStatement.fromJson(statement));
          }

          // Construct the ManagedPolicy
          policies[policy.name] = new iam.ManagedPolicy(this, pascalCase(policy.name), {
            managedPolicyName: policy.name,
            statements,
          });
        }
      }

      //
      // Add Roles
      //
      const roles: { [name: string]: iam.Role } = {};
      for (const roleSet of props.iamConfig.roleSets ?? []) {
        if (!this.isIncluded(roleSet.deploymentTargets)) {
          Logger.info(`[operations-stack] Item excluded`);
          continue;
        }

        for (const role of roleSet.roles) {
          Logger.info(`[operations-stack] Add role ${role.name}`);

          const principals: iam.PrincipalBase[] = [];

          for (const assumedByItem of role.assumedBy ?? []) {
            Logger.info(
              `[operations-stack] Role - assumed by type(${assumedByItem.type}) principal(${assumedByItem.principal})`,
            );

            if (assumedByItem.type === 'service') {
              principals.push(new iam.ServicePrincipal(assumedByItem.principal));
            }

            if (assumedByItem.type === 'account') {
              principals.push(new iam.AccountPrincipal(assumedByItem.principal));
            }

            if (assumedByItem.type === 'provider') {
              principals.push(new iam.SamlConsolePrincipal(providers[assumedByItem.principal]));
            }
          }

          const managedPolicies: iam.IManagedPolicy[] = [];
          for (const policy of role.policies?.awsManaged ?? []) {
            Logger.info(`[operations-stack] Role - aws managed policy ${policy}`);
            managedPolicies.push(iam.ManagedPolicy.fromAwsManagedPolicyName(policy));
          }
          for (const policy of role.policies?.customerManaged ?? []) {
            Logger.info(`[operations-stack] Role - customer managed policy ${policy}`);
            managedPolicies.push(policies[policy]);
          }

          let assumedBy: cdk.aws_iam.IPrincipal;
          if (role.assumedBy.find(item => item.type === 'provider')) {
            // Since a SamlConsolePrincipal creates conditions, we can not
            // use the CompositePrincipal. Verify that it is alone
            if (principals.length > 1) {
              throw new Error('More than one principal found when adding provider');
            }
            assumedBy = principals[0];
          } else {
            assumedBy = new iam.CompositePrincipal(...principals);
          }

          roles[role.name] = new iam.Role(this, pascalCase(role.name), {
            roleName: role.name,
            assumedBy,
            managedPolicies,
            permissionsBoundary: policies[role.boundaryPolicy],
          });
        }
      }

      //
      // Add Groups
      //
      const groups: { [name: string]: iam.Group } = {};
      for (const groupSet of props.iamConfig.groupSets ?? []) {
        if (!this.isIncluded(groupSet.deploymentTargets)) {
          Logger.info(`[operations-stack] Item excluded`);
          continue;
        }

        for (const group of groupSet.groups) {
          Logger.info(`[operations-stack] Add group ${group.name}`);

          const managedPolicies: iam.IManagedPolicy[] = [];
          for (const policy of group.policies?.awsManaged ?? []) {
            Logger.info(`[operations-stack] Group - aws managed policy ${policy}`);
            managedPolicies.push(iam.ManagedPolicy.fromAwsManagedPolicyName(policy));
          }
          for (const policy of group.policies?.customerManaged ?? []) {
            Logger.info(`[operations-stack] Group - customer managed policy ${policy}`);
            managedPolicies.push(policies[policy]);
          }

          groups[group.name] = new iam.Group(this, pascalCase(group.name), {
            groupName: group.name,
            managedPolicies,
          });
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

          const secret = new secretsmanager.Secret(this, pascalCase(`${user.username}Secret`), {
            generateSecretString: {
              secretStringTemplate: JSON.stringify({ username: user.username }),
              generateStringKey: 'password',
            },
            secretName: `/accelerator/${user.username}`,
          });

          Logger.info(`[operations-stack] User - password stored to /accelerator/${user.username}`);

          new iam.User(this, pascalCase(user.username), {
            userName: user.username,
            password: secret.secretValue,
            groups: [groups[user.group]],
            permissionsBoundary: policies[user.boundaryPolicy],
          });
        }
      }
    }
  }
}
