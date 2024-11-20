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

import {
  AccountPrincipal,
  ArnPrincipal,
  CfnInstanceProfile,
  CfnManagedPolicy,
  Effect,
  PolicyDocument,
  PolicyStatement,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { RoleConfig, AseaResourceType } from '@aws-accelerator/config';
import { SsmResourceType } from '@aws-accelerator/utils/lib/ssm-parameter-path';
import { pascalCase } from 'pascal-case';
import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { AseaResource, AseaResourceProps } from './resource';

const CFN_ROLE_TYPE = 'AWS::IAM::Role';
const ASEA_PHASE_NUMBER = '1';

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
  readonly props: RolesProps;
  constructor(scope: ImportAseaResourcesStack, props: RolesProps) {
    super(scope, props);
    this.props = props;
    const prefix = this.props.globalConfig.externalLandingZoneResources?.acceleratorPrefix ?? 'ASEA';
    if (props.stackInfo.phase !== ASEA_PHASE_NUMBER) {
      this.scope.addLogs(LogLevel.INFO, `No ${CFN_ROLE_TYPE}s to handle in stack ${props.stackInfo.stackName}`);
      return;
    }
    if (props.globalConfig.homeRegion !== this.scope.region) {
      return;
    }
    const roleSetItemsInScope = props.iamConfig.roleSets.filter(roleSet =>
      this.scope.isIncluded(roleSet.deploymentTargets),
    );
    const rolesInScope = roleSetItemsInScope.map(roleSetItem => roleSetItem.roles).flat();
    this.addDeletionFlagForRoles(rolesInScope, CFN_ROLE_TYPE, prefix);
    this.updateRoles(rolesInScope);
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
      if (assumedByItem.type === 'principalArn') {
        statements.push(
          new PolicyStatement({
            actions: ['sts:AssumeRole'],
            effect: Effect.ALLOW,
            principals: [new ArnPrincipal(assumedByItem.principal)],
          }),
        );
      }
      if (assumedByItem.type === 'account' && assumedByItem.principal) {
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

  private setResourceBoundaryPolicy(roleItem: RoleConfig, resource: cdk.aws_iam.CfnRole) {
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
  }

  private setInstanceProfile(roleItem: RoleConfig, resource: cdk.aws_iam.CfnRole) {
    const existingInstanceProfile = this.scope.importStackResources.getResourceByName(
      'InstanceProfileName',
      `${roleItem.name}-ip`,
    );
    if (existingInstanceProfile && !roleItem.instanceProfile) {
      this.scope.node.tryRemoveChild(existingInstanceProfile.logicalResourceId);
      return;
    }
    if (!roleItem.instanceProfile) {
      return;
    }
    let instanceProfile: CfnInstanceProfile;
    if (!existingInstanceProfile) {
      // Creating instance profile since, Role is managed by ASEA and "instanceProfile" flag is changed to true
      instanceProfile = new CfnInstanceProfile(this.scope, `${pascalCase(roleItem.name)}InstanceProfile`, {
        roles: [resource.ref],
        instanceProfileName: `${roleItem.name}-ip`,
      });
    } else {
      instanceProfile = this.scope.getResource(existingInstanceProfile.logicalResourceId) as CfnInstanceProfile;
      instanceProfile.instanceProfileName = `${roleItem.name}-ip`;
    }
  }

  // add the delete flag to roles that are no longer in the config file
  private addDeletionFlagForRoles(roleItems: RoleConfig[], resourceType: string, acceleratorPrefix: string) {
    const rolesPrefixesToExclude = [
      `${acceleratorPrefix}-VPC-FlowLog`,
      `${acceleratorPrefix}-VPC-PCX`,
      `${acceleratorPrefix}-Reports`,
    ];
    const importRoles = this.scope.importStackResources.getResourcesByType(resourceType);
    for (const importRole of importRoles) {
      const roleResource = this.scope.getResource(importRole.logicalResourceId) as cdk.aws_iam.CfnRole;
      const roleName = roleResource.roleName;
      if (!roleName) {
        continue;
      }
      const excludedRole = rolesPrefixesToExclude.filter(prefix => {
        return roleName!.startsWith(prefix);
      });
      if (excludedRole.length > 0) {
        continue;
      }
      const roleExistsInConfig = roleItems.find(item => item.name === roleName);
      if (!roleExistsInConfig) {
        importRole.isDeleted = true;
        this.scope.addDeleteFlagForAseaResource({
          type: resourceType,
          identifier: roleName,
          logicalId: importRole.logicalResourceId,
        });
        // Add the delete flag to the ssm parameter created with the role.
        const ssmResource = this.scope.importStackResources.getSSMParameterByName(
          this.scope.getSsmPath(SsmResourceType.IAM_ROLE, [roleName]),
        );
        if (ssmResource) {
          ssmResource.isDeleted = true;
        }

        const existingInstanceProfile = this.scope.importStackResources.getResourceByName(
          'InstanceProfileName',
          `${roleName}-ip`,
        );
        if (existingInstanceProfile) {
          existingInstanceProfile.isDeleted = true;
        }
      }
    }
  }

  private updateRoles(roleItems: RoleConfig[]) {
    if (roleItems.length === 0) {
      this.scope.addLogs(LogLevel.INFO, `No ${CFN_ROLE_TYPE}s to handle in stack.`);
      return;
    }
    for (const roleItem of roleItems) {
      this.scope.addLogs(LogLevel.INFO, `Add role ${roleItem.name}`);
      const role = this.scope.importStackResources.getResourceByName('RoleName', roleItem.name);
      if (!role) {
        continue;
      }
      const resource = this.scope.getResource(role.logicalResourceId) as cdk.aws_iam.CfnRole;
      if (!resource) {
        continue;
      }
      resource.managedPolicyArns = this.getManagedPolicies(roleItem);
      resource.assumeRolePolicyDocument = this.getAssumeRolePolicy(roleItem);
      this.setResourceBoundaryPolicy(roleItem, resource);
      this.setInstanceProfile(roleItem, resource);
      this.scope.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(roleItem.name)}RoleArn`),
        parameterName: this.scope.getSsmPath(SsmResourceType.IAM_ROLE, [roleItem.name]),
        stringValue: resource.attrArn,
      });
      this.scope.addAseaResource(AseaResourceType.IAM_ROLE, roleItem.name);
    }
  }
}
