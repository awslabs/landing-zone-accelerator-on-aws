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

import * as iam from '@aws-cdk/aws-iam';
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';
import * as ssm from '@aws-cdk/aws-ssm';
import * as cdk from '@aws-cdk/core';
import { pascalCase } from 'change-case';
import * as path from 'path';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';

export interface OperationsStackProps extends AcceleratorStackProps {
  configDirPath: string;
}

export class OperationsStack extends AcceleratorStack {
  constructor(scope: cdk.Construct, id: string, props: OperationsStackProps) {
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
      // Add Managed Policies
      //
      const policies: { [name: string]: iam.ManagedPolicy } = {};
      for (const policySet of props.iamConfig.policySets ?? []) {
        if (
          this.isAccountExcluded(policySet.excludeAccounts) ||
          !(
            this.isAccountIncluded(policySet.accounts) ||
            this.isOrganizationalUnitIncluded(policySet.organizationalUnits)
          )
        ) {
          console.log('Item excluded');
          continue;
        }

        for (const policy of Object.values(policySet.policies) as { name: string; policy: string }[]) {
          console.log(`operations-stack: Creating managed policy ${policy.name}`);

          // Read in the policy document which should be properly formatted json
          const policyDocument = require(path.join(props.configDirPath, 'iam-policies', policy.policy));

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
        if (
          this.isAccountExcluded(roleSet.excludeAccounts) ||
          !(this.isAccountIncluded(roleSet.accounts) || this.isOrganizationalUnitIncluded(roleSet.organizationalUnits))
        ) {
          console.log('Item excluded');
          continue;
        }

        for (const role of Object.values(roleSet.roles) as {
          name: string;
          assumedBy: {
            type: string;
            principal: string;
          };
          policies: {
            awsManaged: string[];
            customerManaged: string[];
          };
          boundaryPolicy: string;
        }[]) {
          console.log(`operations-stack: Creating role ${role.name}`);

          let assumedBy: iam.IPrincipal;
          if (role.assumedBy.type === 'service') {
            assumedBy = new iam.ServicePrincipal(role.assumedBy.principal);
          } else {
            assumedBy = new iam.AccountPrincipal(role.assumedBy.principal);
          }

          const managedPolicies: iam.IManagedPolicy[] = [];
          for (const policy of role.policies.awsManaged ?? []) {
            managedPolicies.push(iam.ManagedPolicy.fromAwsManagedPolicyName(policy));
          }
          for (const policy of role.policies.customerManaged ?? []) {
            managedPolicies.push(policies[policy]);
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
        if (
          this.isAccountExcluded(groupSet.excludeAccounts) ||
          !(
            this.isAccountIncluded(groupSet.accounts) || this.isOrganizationalUnitIncluded(groupSet.organizationalUnits)
          )
        ) {
          console.log('Item excluded');
          continue;
        }

        for (const group of Object.values(groupSet.groups) as {
          name: string;
          policies: {
            awsManaged: string[];
            customerManaged: string[];
          };
        }[]) {
          console.log(`operations-stack: Creating group ${group.name}`);

          const managedPolicies: iam.IManagedPolicy[] = [];
          for (const policy of group.policies.awsManaged ?? []) {
            managedPolicies.push(iam.ManagedPolicy.fromAwsManagedPolicyName(policy));
          }
          for (const policy of group.policies.customerManaged ?? []) {
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
        if (
          this.isAccountExcluded(userSet.excludeAccounts) ||
          !(this.isAccountIncluded(userSet.accounts) || this.isOrganizationalUnitIncluded(userSet.organizationalUnits))
        ) {
          console.log('Item excluded');
          continue;
        }

        for (const user of Object.values(userSet.users ?? []) as {
          username: string;
          group: string;
          boundaryPolicy: string;
        }[]) {
          console.log(`operations-stack: Creating user ${user.username}`);

          const secret = new secretsmanager.Secret(this, pascalCase(`${user.username}Secret`), {
            generateSecretString: {
              secretStringTemplate: JSON.stringify({ username: user.username }),
              generateStringKey: 'password',
            },
            secretName: `/accelerator/${user.username}`,
          });

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
