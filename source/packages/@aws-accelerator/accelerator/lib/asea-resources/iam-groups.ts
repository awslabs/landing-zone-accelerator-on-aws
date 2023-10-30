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

import { CfnGroup, CfnManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { GroupConfig, AseaResourceType } from '@aws-accelerator/config';
import { SsmResourceType } from '@aws-accelerator/utils';
import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { pascalCase } from 'pascal-case';
import { AseaResource, AseaResourceProps } from './resource';

const RESOURCE_TYPE = 'AWS::IAM::Group';
const ASEA_PHASE_NUMBER = 1;

export interface GroupsProps extends AseaResourceProps {
  /**
   * Policy constructs defined in configuration
   */
  policies: { [key: string]: CfnManagedPolicy };
}

/**
 * Handles IAM Groups created by ASEA.
 * All IAM Groups driven by ASEA configuration are deployed in Phase-1
 */
export class Groups extends AseaResource {
  private readonly policies: { [key: string]: CfnManagedPolicy };
  readonly groups: { [key: string]: CfnGroup } = {};
  constructor(scope: ImportAseaResourcesStack, props: GroupsProps) {
    super(scope, props);
    this.policies = props.policies;
    if (props.stackInfo.phase !== ASEA_PHASE_NUMBER) {
      this.scope.addLogs(LogLevel.INFO, `No ${RESOURCE_TYPE}s to handle in stack ${props.stackInfo.stackName}`);
      return;
    }
    const existingResources = this.filterResourcesByType(props.stackInfo.resources, RESOURCE_TYPE);
    for (const groupSetItem of props.iamConfig.groupSets ?? []) {
      if (!this.scope.isIncluded(groupSetItem.deploymentTargets)) {
        this.scope.addLogs(LogLevel.INFO, `Groups excluded`);
        continue;
      }

      for (const groupItem of groupSetItem.groups) {
        const existingResource = existingResources.find(
          (cfnResource: { resourceMetadata: { [x: string]: { GroupName: string } } }) =>
            cfnResource.resourceMetadata['Properties'].GroupName === groupItem.name,
        );
        if (!existingResource) {
          continue;
        }
        this.scope.addLogs(LogLevel.INFO, `Add IAM Group ${groupItem.name}`);
        const resource = this.stack.getResource(existingResource.logicalResourceId) as CfnGroup;
        resource.groupName = groupItem.name;
        resource.managedPolicyArns = this.getManagedPolicies(groupItem);
        this.groups[groupItem.name] = resource;
        this.scope.addSsmParameter({
          logicalId: pascalCase(`SsmParam${pascalCase(groupItem.name)}GroupArn`),
          parameterName: this.scope.getSsmPath(SsmResourceType.IAM_GROUP, [groupItem.name]),
          stringValue: resource.attrArn,
        });
        this.scope.addAseaResource(AseaResourceType.IAM_GROUP, groupItem.name);
      }
    }
  }

  private getManagedPolicies(groupItem: GroupConfig) {
    const managedPolicies: string[] = [];
    for (const policyItem of groupItem.policies?.awsManaged ?? []) {
      this.scope.addLogs(LogLevel.INFO, `Role - aws managed policy ${policyItem}`);
      managedPolicies.push(`arn:${cdk.Aws.PARTITION}:iam::aws:policy/${policyItem}`);
    }
    for (const policyItem of groupItem.policies?.customerManaged ?? []) {
      this.scope.addLogs(LogLevel.INFO, `Role - customer managed policy ${policyItem}`);
      const managedPolicy =
        this.policies[policyItem]?.ref ??
        this.resourceSsmParameters[this.scope.getSsmPath(SsmResourceType.IAM_POLICY, [policyItem])];
      if (managedPolicy) {
        managedPolicies.push(managedPolicy);
      }
    }
    return managedPolicies;
  }
}
