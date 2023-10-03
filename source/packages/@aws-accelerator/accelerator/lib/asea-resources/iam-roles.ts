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

import {
  AccountPrincipal,
  CfnInstanceProfile,
  CfnManagedPolicy,
  Effect,
  PolicyDocument,
  PolicyStatement,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { RoleConfig, AseaResourceType } from '@aws-accelerator/config';
import { SsmResourceType } from '@aws-accelerator/utils';
import { pascalCase } from 'pascal-case';
import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { AseaResource, AseaResourceProps } from './resource';

const RESOURCE_TYPE = 'AWS::IAM::Role';
const ASEA_PHASE_NUMBER = 1;
const INSTANCE_PROFILE_RESOURCE_TYPE = 'AWS::IAM::InstanceProfile';

export interface RolesProps extends AseaResourceProps {
  /**
   * Policy constructs defined in configuration
   */
  policies: { [key: string]: CfnManagedPolicy };
}
/**
 * Handles IAM Roles created by ASEA.
 * All IAM Roles driven by ASEA configuration are deployed in Phase-1
 */
export class Roles extends AseaResource {
  private readonly props: RolesProps;
  constructor(scope: ImportAseaResourcesStack, props: RolesProps) {
    super(scope, props);
    this.props = props;
    if (props.stackInfo.phase !== ASEA_PHASE_NUMBER) {
      this.scope.addLogs(LogLevel.INFO, `No ${RESOURCE_TYPE}s to handle in stack ${props.stackInfo.stackName}`);
      return;
    }
    const existingResources = this.filterResourcesByType(props.stackInfo.resources, RESOURCE_TYPE);
    const existingInstanceProfiles = this.filterResourcesByType(
      props.stackInfo.resources,
      INSTANCE_PROFILE_RESOURCE_TYPE,
    );
    for (const roleSetItem of props.iamConfig.roleSets ?? []) {
      if (!this.scope.isIncluded(roleSetItem.deploymentTargets)) {
        this.scope.addLogs(LogLevel.INFO, `Roles excluded`);
        continue;
      }

      for (const roleItem of roleSetItem.roles) {
        this.scope.addLogs(LogLevel.INFO, `Add role ${roleItem.name}`);
        const role = this.findResourceByName(existingResources, 'RoleName', roleItem.name);
        if (!role) {
          continue;
        }
        const resource = this.stack.getResource(role.logicalResourceId) as cdk.aws_iam.CfnRole;
        resource.managedPolicyArns = this.getManagedPolicies(roleItem);
        resource.assumeRolePolicyDocument = this.getAssumeRolePolicy(roleItem);
        if (roleItem.boundaryPolicy) {
          const boundaryPolicy =
            this.props.policies[roleItem.boundaryPolicy]?.ref ??
            this.resourceSsmParameters[this.scope.getSsmPath(SsmResourceType.IAM_POLICY, [roleItem.boundaryPolicy])];
          if (boundaryPolicy) {
            resource.permissionsBoundary = boundaryPolicy;
          }
        } else if (resource.permissionsBoundary) {
          resource.permissionsBoundary = undefined;
        }
        const existingInstanceProfile = this.findResourceByName(
          existingInstanceProfiles,
          'InstanceProfileName',
          `${roleItem.name}-ip`,
        );
        if (existingInstanceProfile && !roleItem.instanceProfile) {
          this.scope.node.tryRemoveChild(existingInstanceProfile.logicalResourceId);
          continue;
        }
        if (!roleItem.instanceProfile) {
          continue;
        }
        let instanceProfile: CfnInstanceProfile;
        if (!existingInstanceProfile) {
          // Creating instance profile since, Role is managed by ASEA and "instanceProfile" flag is changed to true
          instanceProfile = new CfnInstanceProfile(scope, `${pascalCase(roleItem.name)}InstanceProfile`, {
            roles: [resource.ref],
            instanceProfileName: `${roleItem.name}-ip`,
          });
        } else {
          instanceProfile = this.stack.getResource(existingInstanceProfile.logicalResourceId) as CfnInstanceProfile;
          instanceProfile.instanceProfileName = `${roleItem.name}-ip`;
        }
        this.scope.addSsmParameter({
          logicalId: pascalCase(`SsmParam${pascalCase(roleItem.name)}RoleArn`),
          parameterName: this.scope.getSsmPath(SsmResourceType.IAM_ROLE, [roleItem.name]),
          stringValue: resource.attrArn,
        });
        this.scope.addAseaResource(AseaResourceType.IAM_ROLE, roleItem.name);
      }
    }
  }

  private getManagedPolicies(roleItem: RoleConfig) {
    const managedPolicies: string[] = [];
    for (const policyItem of roleItem.policies?.awsManaged ?? []) {
      this.scope.addLogs(LogLevel.INFO, `Role - aws managed policy ${policyItem}`);
      managedPolicies.push(`arn:${cdk.Aws.PARTITION}:iam::aws:policy/${policyItem}`);
    }
    for (const policyItem of roleItem.policies?.customerManaged ?? []) {
      this.scope.addLogs(LogLevel.INFO, `Role - customer managed policy ${policyItem}`);
      const managedPolicy =
        this.props.policies[policyItem]?.ref ??
        this.resourceSsmParameters[this.scope.getSsmPath(SsmResourceType.IAM_POLICY, [policyItem])];
      if (managedPolicy) {
        managedPolicies.push(managedPolicy);
      }
    }
    return managedPolicies;
  }

  private getAssumeRolePolicy(roleItem: RoleConfig) {
    const statements: PolicyStatement[] = [];
    for (const assumedByItem of roleItem.assumedBy ?? []) {
      if (assumedByItem.type === 'service') {
        statements.push(
          new PolicyStatement({
            actions: ['sts:AssumeRole'],
            effect: Effect.ALLOW,
            principals: [new ServicePrincipal(assumedByItem.principal)],
          }),
        );
      }
      if (assumedByItem.type === 'account') {
        const partition = this.props.partition;
        const accountIdRegex = /^\d{12}$/;
        const accountArnRegex = new RegExp('^arn:' + partition + ':iam::(\\d{12}):root$');
        if (accountIdRegex.test(assumedByItem.principal)) {
          statements.push(
            new PolicyStatement({
              actions: ['sts:AssumeRole'],
              effect: Effect.ALLOW,
              principals: [new AccountPrincipal(assumedByItem.principal)],
            }),
          );
        } else if (accountArnRegex.test(assumedByItem.principal)) {
          const accountId = accountArnRegex.exec(assumedByItem.principal);
          statements.push(
            new PolicyStatement({
              actions: ['sts:AssumeRole'],
              effect: Effect.ALLOW,
              principals: [new AccountPrincipal(accountId![1])],
            }),
          );
        } else {
          statements.push(
            new PolicyStatement({
              actions: ['sts:AssumeRole'],
              effect: Effect.ALLOW,
              principals: [
                new cdk.aws_iam.AccountPrincipal(this.props.accountsConfig.getAccountId(assumedByItem.principal)),
              ],
            }),
          );
        }
      }
    }
    return new PolicyDocument({
      statements,
    });
  }
}
